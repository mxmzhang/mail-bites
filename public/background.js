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

// Gemini API configuration
const GEMINI_API_KEY = 'AIzaSyA6GtIAPXGVv8bBR4ifRSTDtpoAKFG2_Vg'; // You'll need to replace this with your actual API key
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Analyze email content using Gemini API
async function analyzeEmailContent(email) {
  console.log('Starting analysis for email:', email.subject);
  try {
    const prompt = `Analyze this email and provide a priority score from 1-10 (10 being highest priority) based on:
    1. Urgency of response needed
    2. Importance of sender
    3. Time sensitivity
    4. Business impact
    5. Personal relevance
    
    Email Subject: ${email.subject}
    From: ${email.from}
    Date: ${email.date}
    Content: ${email.body || email.snippet}
    
    Return the response in JSON format with the following structure:
    {
      "priorityScore": number,
      "reasoning": "brief explanation of the score",
      "suggestedResponseTime": "immediate/within 1 hour/within 4 hours/within 24 hours"
    }`;

    console.log('Sending request to Gemini API...');
    console.log('API URL:', GEMINI_API_URL);
    console.log('API Key length:', GEMINI_API_KEY.length);

    const requestBody = {
      contents: [{
        parts: [{
          text: prompt
        }]
      }]
    };

    console.log('Request body:', JSON.stringify(requestBody, null, 2));

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error response:', errorText);
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Gemini API response data:', data);

    const analysis = JSON.parse(data.candidates[0].content.parts[0].text);
    console.log('Parsed analysis:', analysis);
    
    return {
      ...email,
      priorityScore: analysis.priorityScore,
      priorityReasoning: analysis.reasoning,
      suggestedResponseTime: analysis.suggestedResponseTime
    };
  } catch (error) {
    console.error('Error in analyzeEmailContent:', error);
    console.error('Error stack:', error.stack);
    return {
      ...email,
      priorityScore: 5,
      priorityReasoning: `Analysis failed: ${error.message}`,
      suggestedResponseTime: 'within 24 hours'
    };
  }
}

// Fetch emails from Gmail API
async function fetchEmails(token, callback) {
  console.log('Starting fetchEmails with token:', token);
  try {
    // Calculate the date 24 hours ago and format for Gmail query
    const date24HoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const formattedDate = `${date24HoursAgo.getFullYear()}/${(date24HoursAgo.getMonth() + 1)
      .toString()
      .padStart(2, '0')}/${date24HoursAgo.getDate().toString().padStart(2, '0')}`;

    // Gmail query: only unread Primary inbox emails, excluding others
    const query = `is:unread in:inbox category:primary -category:promotions -category:social -category:updates -category:forums after:${formattedDate}`;
    console.log('Using query:', query);

    // Fetch list of messages
    const listResp = await fetch(`https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q=${encodeURIComponent(
      query
    )}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!listResp.ok) throw new Error(`List fetch failed: ${listResp.status}`);
    const listData = await listResp.json();
    const messageRefs = listData.messages || [];
    console.log(`Fetched message list: ${messageRefs.length} entries`);
    if (!messageRefs.length) {
      callback({ emails: [], unreadCount: 0, totalCount: 0 });
      return;
    }

    // Fetch full message details in parallel
    const messages = await Promise.all(
      messageRefs.map((msg) =>
        fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        }).then((resp) => {
          if (!resp.ok) throw new Error(`Message fetch failed: ${resp.status}`);
          return resp.json();
        })
      )
    );
    console.log(`Fetched all message details: ${messages.length}`);

    // Process each message
    const processedEmails = messages.map((message) => {
      const headers = {};
      message.payload.headers.forEach((h) => (headers[h.name.toLowerCase()] = h.value));
      let body = '';
      if (message.payload.body?.data) {
        body = decodeBase64(message.payload.body.data);
      } else if (message.payload.parts) {
        const part = message.payload.parts.find((p) => p.mimeType === 'text/plain');
        if (part?.body?.data) body = decodeBase64(part.body.data);
      }
      const labelIds = message.labelIds || [];
      const hasInbox = labelIds.includes('INBOX');
      const hasPromotions = labelIds.includes('CATEGORY_PROMOTIONS');
      const hasSocial = labelIds.includes('CATEGORY_SOCIAL');
      const hasUpdates = labelIds.includes('CATEGORY_UPDATES');
      const hasForums = labelIds.includes('CATEGORY_FORUMS');
      const dateStr = headers.date || '';
      const dateObj = new Date(dateStr);
      const isRecent = dateObj > date24HoursAgo;
      const isPrimary = hasInbox && !hasPromotions && !hasSocial && !hasUpdates && !hasForums;
      return {
        id: message.id,
        snippet: message.snippet,
        subject: headers.subject || '(No Subject)',
        from: headers.from || '',
        to: headers.to || '',
        date: dateStr,
        receivedDate: dateObj.toISOString(),
        body,
        labelIds,
        isPrimary,
        isRecent,
        inboxType: isPrimary
          ? 'Primary'
          : hasPromotions
          ? 'Promotions'
          : hasSocial
          ? 'Social'
          : hasUpdates
          ? 'Updates'
          : hasForums
          ? 'Forums'
          : 'Other'
      };
    });

    // Log processed email info
    processedEmails.forEach((email) => console.log(`Email ${email.id}: Category=${email.inboxType}, Date=${email.date}`));

    // Filter only recent Primary emails
    const primaryEmails = processedEmails.filter((e) => e.isPrimary && e.isRecent);
    console.log(`Primary emails count: ${primaryEmails.length}`);
    primaryEmails.forEach((email) => console.log(`Primary Email ${email.id}: Date=${email.date}`));

    // Return to UI
    callback({
      emails: primaryEmails,
      unreadCount: primaryEmails.length,
      totalCount: processedEmails.length
    });
  } catch (error) {
    console.error('Error in fetchEmails:', error);
    callback({ error: error.message });
  }
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
    // Clear stored emails before fetching new ones
    chrome.storage.local.set({ emails: [] }, () => {
      console.log('Cleared stored emails before refresh');
      fetchEmails(request.token, sendResponse);
    });
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
