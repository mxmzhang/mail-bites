// Content script that runs on Gmail pages
console.log('Mail Bites content script loaded');

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getEmailContent') {
    // Extract email content from the current Gmail page
    const emailContent = extractEmailContent();
    sendResponse({ content: emailContent });
  }
  
  // Return true to indicate we'll respond asynchronously
  return true;
});

// Function to extract email content from Gmail
function extractEmailContent() {
  // This is a simple implementation - would need to be expanded for production
  const emailBody = document.querySelector('.a3s');
  const emailSubject = document.querySelector('h2.hP');
  
  return {
    subject: emailSubject ? emailSubject.textContent : '',
    body: emailBody ? emailBody.textContent : '',
    timestamp: new Date().toISOString()
  };
}

// Observe Gmail for changes since it's a single-page app
const observer = new MutationObserver((mutations) => {
  // Check if we're viewing an email
  if (document.querySelector('.a3s')) {
    chrome.runtime.sendMessage({ 
      action: 'emailOpened',
      data: extractEmailContent()
    });
  }
});

// Start observing the document body for DOM changes
observer.observe(document.body, { 
  childList: true, 
  subtree: true 
}); 