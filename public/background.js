// This function is called when the extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  console.log('Mail Bites extension installed or updated');
  
  // Initialize storage
  chrome.storage.local.set({
    authenticated: false,
    emails: []
  });
  
  // Create context menu items
  chrome.contextMenus.create({
    id: "summarizeEmail",
    title: "Summarize Email",
    contexts: ["page"],
    documentUrlPatterns: ["https://mail.google.com/*"]
  });
});

// Handle direct authentication
function authenticateWithGmail(callback) {
  chrome.identity.getAuthToken({ interactive: true }, (token) => {
    if (chrome.runtime.lastError) {
      console.error('Auth Error:', chrome.runtime.lastError.message);
      callback({ error: chrome.runtime.lastError.message || 'Authentication failed' });
    } else {
      console.log('Authentication successful, token received');
      // Save authentication state
      chrome.storage.local.set({ authenticated: true });
      callback({ token });
    }
  });
}

// Fetch emails from Gmail API
function fetchEmails(token, callback) {
  console.log('Fetching recent unread emails from Primary inbox');
  
  // Calculate the date 24 hours ago in RFC 3339 format
  const date24HoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const dateString = date24HoursAgo.toISOString();
  
  // Use q parameter to search for:
  // 1. Unread emails (is:unread)
  // 2. From the Primary category (category:primary)
  // 3. Received after our 24-hour cutoff (after:YYYY/MM/DD)
  const formattedDate = `${date24HoursAgo.getFullYear()}/${date24HoursAgo.getMonth() + 1}/${date24HoursAgo.getDate()}`;
  const query = `is:unread category:primary after:${formattedDate}`;
  
  // Encode the query for URL
  const encodedQuery = encodeURIComponent(query);
  
  // Use the q parameter to search for unread emails in the Primary category within the last 24 hours
  fetch(`https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=${encodedQuery}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  .then(response => {
    if (!response.ok) {
      throw new Error('Failed to fetch emails: ' + response.status);
    }
    return response.json();
  })
  .then(data => {
    console.log('Fetched Primary inbox unread message list');
    // For each message ID, get the full message
    if (!data.messages || !data.messages.length) {
      callback({ emails: [], unreadCount: 0 });
      return;
    }
    
    const messagePromises = data.messages.map(message => {
      return fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${message.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to fetch message: ' + response.status);
        }
        return response.json();
      });
    });
    
    return Promise.all(messagePromises);
  })
  .then(messages => {
    if (!messages) return;
    
    console.log('Fetched all message details');
    // Process messages to extract relevant information
    const processedEmails = messages.map(message => {
      // Extract headers
      const headers = {};
      message.payload.headers.forEach(header => {
        headers[header.name.toLowerCase()] = header.value;
      });
      
      // Extract body
      let body = '';
      if (message.payload.body && message.payload.body.data) {
        body = decodeBase64(message.payload.body.data);
      } else if (message.payload.parts) {
        const textPart = message.payload.parts.find(part => part.mimeType === 'text/plain');
        if (textPart && textPart.body && textPart.body.data) {
          body = decodeBase64(textPart.body.data);
        }
      }
      
      // Extract labels and check if it's in the Primary category
      const isUnread = message.labelIds.includes('UNREAD');
      const isImportant = message.labelIds.includes('IMPORTANT');
      const isPrimary = !message.labelIds.includes('CATEGORY_PROMOTIONS') && 
                        !message.labelIds.includes('CATEGORY_SOCIAL') &&
                        !message.labelIds.includes('CATEGORY_UPDATES') &&
                        !message.labelIds.includes('CATEGORY_FORUMS');
      
      // Parse the email date
      const date = new Date(headers.date || '');
      
      // Only include emails from the past 24 hours in the Primary category
      const isRecent = date > date24HoursAgo;
      
      return {
        id: message.id,
        threadId: message.threadId,
        labelIds: message.labelIds,
        isUnread: isUnread,
        isImportant: isImportant,
        isPrimary: isPrimary,
        isRecent: isRecent,
        snippet: message.snippet,
        subject: headers.subject || '(No Subject)',
        from: headers.from || '',
        to: headers.to || '',
        date: headers.date || '',
        body: body
      };
    });
    
    // Filter to only include Primary category emails from the past 24 hours
    const filteredEmails = processedEmails.filter(email => email.isPrimary && email.isRecent);
    
    // Sort emails by date (newest first)
    filteredEmails.sort((a, b) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
    
    callback({ 
      emails: filteredEmails,
      unreadCount: filteredEmails.length
    });
  })
  .catch(error => {
    console.error('Error fetching emails:', error);
    callback({ error: error.message });
  });
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "summarizeEmail") {
    chrome.tabs.sendMessage(tab.id, { action: "getEmailContent" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending message to content script:', chrome.runtime.lastError.message);
        return;
      }
      
      if (response && response.content) {
        console.log("Email content:", response.content);
        // Process the email content or send to your backend
      }
    });
  }
});

// Handle messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background script received message:', request);
  
  if (request.action === "emailOpened") {
    // Store the email data
    storeEmail(request.data);
    sendResponse({ success: true });
  } else if (request.action === "authenticate") {
    authenticateWithGmail(sendResponse);
    return true; // Indicate we'll respond asynchronously
  } else if (request.action === "getEmails") {
    if (!request.token) {
      sendResponse({ error: 'No authentication token provided' });
      return true;
    }
    
    fetchEmails(request.token, sendResponse);
    return true; // Indicate we'll respond asynchronously
  }
});

// Store email data in local storage
function storeEmail(emailData) {
  chrome.storage.local.get(['emails'], (result) => {
    const emails = result.emails || [];
    // Add new email to the beginning of the array
    emails.unshift(emailData);
    // Keep only the most recent 50 emails
    const updatedEmails = emails.slice(0, 50);
    chrome.storage.local.set({ emails: updatedEmails });
  });
}

// Decode base64 URL encoded string (used for email bodies)
function decodeBase64(encodedString) {
  if (!encodedString) return '';
  
  // Replace non-base64 characters
  const base64 = encodedString.replace(/-/g, '+').replace(/_/g, '/');
  
  try {
    return decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  } catch (error) {
    console.error('Error decoding base64:', error);
    return '';
  }
}
