// background.js

// This function is called when the extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  console.log('Mail Bites extension installed or updated');

  // Initialize storage
  chrome.storage.local.set({
    authenticated: false,
    emails: []
  });

  // Create context menu item
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
      chrome.storage.local.set({ authenticated: true });
      callback({ token });
    }
  });
}

// Gmail/Gemini config (Gemini calls are currently bypassed with test scores)
const GEMINI_API_KEY = 'YOUR_API_KEY_HERE';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Base64 decoder for email bodies
function decodeBase64(encodedString) {
  if (!encodedString) return '';
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

// Fetch emails from Gmail API, filter to Primary category, and return scored list
async function fetchEmails(token, callback) {
  console.log('Starting fetchEmails with token:', token);

  try {
    // 24‐hour cutoff (if you still want "recent" as well)
    const date24HoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const formattedDate = `${date24HoursAgo.getFullYear()}/` +
      `${(date24HoursAgo.getMonth() + 1).toString().padStart(2, '0')}/` +
      `${date24HoursAgo.getDate().toString().padStart(2, '0')}`;

    // We ask Gmail for only UNREAD, INBOX, Primary messages
    const query = `is:unread in:inbox category:primary after:${formattedDate}`;
    console.log('Gmail API query:', query);

    // 1) List message IDs
    const listResp = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    if (!listResp.ok) {
      const err = await listResp.text();
      throw new Error(`List fetch failed: ${listResp.status} – ${err}`);
    }
    const { messages: messageRefs = [] } = await listResp.json();
    console.log(`Found ${messageRefs.length} messages in Primary inbox`);

    if (messageRefs.length === 0) {
      callback({ emails: [], unreadCount: 0, totalCount: 0 });
      return;
    }

    // 2) Fetch full details in parallel
    const messages = await Promise.all(
      messageRefs.map(m =>
        fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${m.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        }).then(res => {
          if (!res.ok) throw new Error(`Message ${m.id} fetch failed: ${res.status}`);
          return res.json();
        })
      )
    );
    console.log(`Fetched details for ${messages.length} messages`);

    // 3) Process & explicitly tag "Primary"
    const processed = messages.map(msg => {
      // build header map
      const headers = {};
      (msg.payload.headers || []).forEach(h => {
        headers[h.name.toLowerCase()] = h.value;
      });

      // decode body or fallback to snippet
      let body = '';
      if (msg.payload.body?.data) {
        body = decodeBase64(msg.payload.body.data);
      } else if (msg.payload.parts) {
        const part = msg.payload.parts.find(p => p.mimeType === 'text/plain');
        if (part?.body?.data) body = decodeBase64(part.body.data);
      }

      const labelIds = msg.labelIds || [];
      const isUnread     = labelIds.includes('UNREAD');
      const isImportant  = labelIds.includes('IMPORTANT');
      const isPrimary    = labelIds.includes('CATEGORY_PERSONAL');  // ← explicit check
      const dateStr      = headers.date || '';
      const dateObj      = new Date(dateStr);
      const isRecent     = dateObj > date24HoursAgo;              // optional

      // Derive a human category name
      let inboxType = 'Other';
      if (labelIds.includes('CATEGORY_PERSONAL'))    inboxType = 'Primary';
      else if (labelIds.includes('CATEGORY_SOCIAL'))      inboxType = 'Social';
      else if (labelIds.includes('CATEGORY_PROMOTIONS'))  inboxType = 'Promotions';
      else if (labelIds.includes('CATEGORY_UPDATES'))     inboxType = 'Updates';
      else if (labelIds.includes('CATEGORY_FORUMS'))      inboxType = 'Forums';

      return {
        id: msg.id,
        threadId: msg.threadId,
        snippet: msg.snippet,
        subject: headers.subject || '(No Subject)',
        from: headers.from || '',
        to: headers.to || '',
        date: dateStr,
        receivedDate: dateObj.toISOString(),
        body,
        labelIds,
        isUnread,
        isImportant,
        isPrimary,
        isRecent,
        inboxType
      };
    });

    console.log('All messages processed. Total:', processed.length);
    console.log('Processed emails:', processed);

    // 4) Filter to exactly Primary (and recent, if desired)
    //const primary = processed.filter(e => e.isPrimary /*&& e.isRecent*/);
    const primary = processed;
    console.log(`After filtering to Primary: ${primary.length}`);

    // 5) Assign test priority scores (or call your Gemini logic)
    const scored = primary.map((email, i) => {
      const score = 10 - (i % 10);
      return {
        ...email,
        priorityScore: score,
        priorityReasoning: `Test priority score ${score}`,
        suggestedResponseTime:
          score > 7 ? 'immediate' :
          score > 5 ? 'within 1 hour' :
          score > 3 ? 'within 4 hours' : 'within 24 hours'
      };
    });

    // 6) Send back to popup
    callback({
      emails: scored,
      unreadCount: scored.length,
      totalCount: processed.length
    });

  } catch (error) {
    console.error('Error in fetchEmails:', error);
    callback({ error: error.message });
  }
}

// Context‐menu click (unchanged)
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "summarizeEmail") {
    chrome.tabs.sendMessage(tab.id, { action: "getEmailContent" }, resp => {
      if (chrome.runtime.lastError) {
        console.error('Content script error:', chrome.runtime.lastError.message);
      } else {
        console.log('Email content from page:', resp.content);
      }
    });
  }
});

// Message listener (handles authenticate & getEmails)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background script received:', request);

  if (request.action === "emailOpened") {
    // Optionally store per-email view
    sendResponse({ success: true });
    return;
  }

  if (request.action === "authenticate") {
    authenticateWithGmail(sendResponse);
    return true;  // keep channel open
  }

  if (request.action === "getEmails") {
    if (!request.token) {
      sendResponse({ error: 'No authentication token provided' });
      return true;
    }

    // Clear old cache then fetch
    chrome.storage.local.set({ emails: [] }, () => {
      console.log('Cleared cache; now fetching fresh emails…');
      fetchEmails(request.token, sendResponse);
    });
    return true;  // keep channel open
  }
});