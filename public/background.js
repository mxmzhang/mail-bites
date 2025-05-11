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

  // Set up side panel configuration
  chrome.sidePanel.setOptions({
    enabled: true,
    path: "index.html"
  });
});

// Handle extension icon click to open side panel
chrome.action.onClicked.addListener((tab) => {
  if (tab.url.includes("mail.google.com")) {
    chrome.sidePanel.open({ tabId: tab.id });
  } else {
    // If not on Gmail, notify the user
    console.log("Mail Bites works best on Gmail");
    // Optionally open the side panel anyway
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Handle direct authentication
function authenticateWithGmail(callback) {
  console.log('Starting authentication process...');
  chrome.identity.getAuthToken({ interactive: true }, (token) => {
    console.log("getting auth token")
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
const GEMINI_API_KEY = 'AIzaSyBzVtKG8wr-zGAgYL7q0_hZ2C3y1kY7o60';
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

    // 5) Use Gemini API to analyze and score emails
    console.log('Analyzing emails with Gemini AI...');
    
    // Process emails in batches to avoid rate limiting
    const batchSize = 5; // Process 5 emails at a time to avoid overwhelming the API
    const scored = [];
    
    for (let i = 0; i < primary.length; i += batchSize) {
      const batch = primary.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(primary.length/batchSize)} (${batch.length} emails)`);
      
      // Process each batch with a small delay between emails
      const batchResults = await Promise.all(
        batch.map(async (email, index) => {
          // Add a small delay between requests to avoid rate limiting
          if (index > 0) {
            await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay between requests
          }
          return await analyzeEmailContent(email);
        })
      );
      
      scored.push(...batchResults);
      
      // Add a delay between batches
      if (i + batchSize < primary.length) {
        console.log('Pausing between batches to avoid rate limiting...');
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay between batches
      }
    }
    
    console.log('Analysis complete for all emails:', scored.length);

    // Generate summary of all emails
    const summary = await generateEmailsSummary(scored);
    console.log('Generated summary:', summary);

    // 6) Send back to popup
    chrome.storage.local.set({ emails: scored }, () => {
      console.log("✅ Emails saved to local storage:", scored);
    });
    
    callback({
      emails: scored,
      unreadCount: scored.length,
      totalCount: processed.length,
      summary: summary
    });


  } catch (error) {
    console.error('Error in fetchEmails:', error);
    callback({ error: error.message });
  }
}

// Analyze email content using Gemini API
async function analyzeEmailContent(email) {
  console.log('Analyzing email:', email.subject);
  try {
    const prompt = `You are an email priority analyzer. Analyze the email below and determine its priority level.

Email details:
- Subject: ${email.subject}
- From: ${email.from}
- Date: ${email.date}
- Content: ${email.body || email.snippet}

Based on the email, consider these factors:
1. Urgency: Does this require immediate attention?
2. Sender importance: Is this from someone significant?
3. Time sensitivity: Are there deadlines involved?
4. Impact: What happens if this isn't addressed?
5. Personal relevance: How relevant is this to the recipient's responsibilities?

IMPORTANT: Your response must be a valid JSON object with the following format and nothing else:
{
  "priorityScore": [a number between 1 and 10],
  "reasoning": "[brief explanation for the score]",
  "suggestedResponseTime": "[one of: immediate, within 1 hour, within 4 hours, within 24 hours]"
}

Scoring guidelines:
- 9-10: Critical priority (emergencies, CEO requests)
- 7-8: High priority (client issues, urgent requests)
- 5-6: Medium priority (standard work items)
- 3-4: Low priority (FYI messages, updates)
- 1-2: Minimal priority (newsletters, non-urgent)`;

    console.log('Sending request to Gemini API...');
    
    const requestBody = {
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        temperature: 0.2,  // Lower temperature for more predictable formatting
        maxOutputTokens: 1024
      }
    };

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', errorText);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('Gemini API response:', data);

    // Extract the text response and parse the JSON from it
    const analysisText = data.candidates[0].content.parts[0].text;
    console.log('Analysis text:', analysisText);
    
    try {
      // Clean up the response text to ensure valid JSON
      let cleanText = analysisText.trim();
      
      // Remove any markdown code block indicators
      cleanText = cleanText.replace(/```json|```/g, '').trim();
      
      // Ensure we're only parsing the JSON object portion
      const jsonStart = cleanText.indexOf('{');
      const jsonEnd = cleanText.lastIndexOf('}') + 1;
      
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        cleanText = cleanText.substring(jsonStart, jsonEnd);
      }
      
      const analysis = JSON.parse(cleanText);
      console.log('Parsed analysis:', analysis);
      
      return {
        ...email,
        priorityScore: analysis.priorityScore,
        priorityReasoning: analysis.reasoning,
        suggestedResponseTime: analysis.suggestedResponseTime
      };
    } catch (jsonError) {
      console.error('Failed to parse JSON from Gemini response:', jsonError);
      console.log('Raw response text:', analysisText);
      
      // More robust fallback extraction using regex
      let priorityScore = 5; // Default
      let reasoning = "Could not extract reasoning";
      let responseTime = "within 24 hours";
      
      // Extract priority score - look for any number between 1-10
      const priorityMatch = analysisText.match(/priorityScore["'\s]*:["'\s]*(\d+)/i) || 
                           analysisText.match(/priority["'\s]*:["'\s]*(\d+)/i) ||
                           analysisText.match(/priority score["'\s]*:["'\s]*(\d+)/i) ||
                           analysisText.match(/\b([1-9]|10)\b/);
      
      if (priorityMatch) {
        const extractedScore = parseInt(priorityMatch[1]);
        if (extractedScore >= 1 && extractedScore <= 10) {
          priorityScore = extractedScore;
        }
      }
      
      // Extract reasoning - look for explanatory text
      const reasoningMatch = analysisText.match(/reasoning["'\s]*:["'\s]*["']([^"']+)["']/i) ||
                            analysisText.match(/reasoning["'\s]*:["'\s]*([^,"'\n]+)/i);
      
      if (reasoningMatch) {
        reasoning = reasoningMatch[1].trim();
      } else {
        // If no reasoning found, try to extract any explanatory sentence
        const sentences = analysisText.split(/[.!?]\s+/);
        if (sentences.length > 1) {
          reasoning = sentences.find(s => 
            s.length > 20 && 
            !s.includes("priority") && 
            !s.includes("score")
          ) || reasoning;
        }
      }
      
      // Extract response time
      const timePatterns = [
        /immediate/i,
        /within 1 hour/i,
        /within (\d+) hour/i,
        /within (\d+) day/i
      ];
      
      for (const pattern of timePatterns) {
        const match = analysisText.match(pattern);
        if (match) {
          if (pattern.source.includes("immediate")) {
            responseTime = "immediate";
          } else if (pattern.source.includes("1 hour")) {
            responseTime = "within 1 hour";
          } else if (pattern.source.includes("hour")) {
            const hours = parseInt(match[1]);
            responseTime = hours <= 4 ? "within 4 hours" : "within 24 hours";
          } else if (pattern.source.includes("day")) {
            responseTime = "within 24 hours";
          }
          break;
        }
      }
      
      return {
        ...email,
        priorityScore: priorityScore,
        priorityReasoning: reasoning,
        suggestedResponseTime: responseTime
      };
    }
  } catch (error) {
    console.error('Error analyzing email with Gemini:', error);
    // Fallback to a default score if analysis fails
    return {
      ...email,
      priorityScore: 5,
      priorityReasoning: `Analysis failed: ${error.message}`,
      suggestedResponseTime: 'within 24 hours'
    };
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

  if (request.action === "draftResponse") {
    const email = request.data;
    const prompt = `You are a helpful assistant. Please draft a professional, polite response to the following email:
  
  Subject: ${email.subject}
  Content: ${email.body}
  
  The response should be courteous and address the topic of the email.`;
  
    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 512
      }
    };
  
    fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })
      .then(res => res.json())
      .then(data => {
        const text = data.candidates[0].content.parts[0].text;
        sendResponse({ draft: text });
      })
      .catch(err => {
        console.error('Drafting failed:', err);
        sendResponse({ draft: 'Error generating draft.' });
      });
  
    return true;
  }

  //to-do list
  if (request.action === "getTodos") {
    console.log("⚙️ Received getTodos request from popup");
    const token = request.token;
    if (!token) {
      sendResponse({ error: 'No authentication token provided' });
      return true;
    }
  
    chrome.storage.local.get('emails', async (result) => {
      const emails = result.emails || [];
      try {
        const prompt = `You are an expert task extractor. Extract actionable to-do tasks from the following emails.
        ${emails.map(email => `
          Email ${emails.indexOf(email) + 1}:
          - Subject: ${email.subject}
          - From: ${email.from}
          - Priority: ${email.priorityScore}/10
          - Content: ${email.body || email.snippet}
          `).join('\n')}
          
         Return a plain bullet list with NO additional text. From each email determine a task the user must accomplish such as if a package delivery
         is notified a task is "pickup package from delivery room". Try to be specific but concise. Also filter by most to least urgent.
  `;
  
        const requestBody = {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1024
          }
        };
  
        const res = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
  
        const data = await res.json();
        let raw = '';
        const candidates = data?.candidates || [];
  
        if (
          candidates.length > 0 &&
          candidates[0].content &&
          Array.isArray(candidates[0].content.parts) &&
          candidates[0].content.parts.length > 0
        ) {
          raw = candidates[0].content.parts[0].text || '';
        }
  
        const items = (raw || '')
          .split(/[\n•\-*]\s+/)
          .filter(line => line.trim().length > 3)
          .map(task => ({ task: task.trim(), done: false }));
  
        sendResponse({ todos: items });
      } catch (error) {
        console.error("Error generating todos:", error);
        sendResponse({ error: "Failed to extract to-do list." });
      }
    });
  
    return true; // Keep the async channel open
  }
  
  
});

// Generate a summary of all emails using Gemini
async function generateEmailsSummary(emails) {
  console.log('Generating summary of all emails...');
  try {
    const prompt = `You are an email summarizer. Please provide a concise summary of the following unread emails from the last 24 hours:

${emails.map(email => `
Email ${emails.indexOf(email) + 1}:
- Subject: ${email.subject}
- From: ${email.from}
- Priority: ${email.priorityScore}/10
- Content: ${email.body || email.snippet}
`).join('\n')}

Please provide a summary that includes:
1. Overall theme/topics of the emails
2. If the email details any action items, list them

Please ignore any newsletters or promotional emails.

Output ONLY the summaries (no text before or after) as a list so that each email is a bullet point. Before the summary of each email, put a few word headline of the email.

Keep the summary concise but informative.`;

    const requestBody = {
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1024
      }
    };

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error('Error generating email summary:', error);
    return 'Unable to generate summary at this time.';
  }
}
