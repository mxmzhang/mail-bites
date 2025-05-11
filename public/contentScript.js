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

function injectDraftButton() {
  if (document.getElementById('mail-bites-draft-button')) return;

  // Try common Gmail email content containers
  const container = document.querySelector('.a3s, .ii.gt');

  if (!container || !container.parentElement) return;

  const button = document.createElement('button');
  button.id = 'mail-bites-draft-button';
  button.innerText = '✉️ Draft Response';
  button.style.position = 'relative';
  button.style.margin = '10px 0';
  button.style.padding = '8px 12px';
  button.style.background = '#1a73e8';
  button.style.color = 'white';
  button.style.border = 'none';
  button.style.borderRadius = '4px';
  button.style.cursor = 'pointer';
  button.style.zIndex = 9999;

  button.onclick = () => {
    const emailContent = extractEmailContent();
    chrome.runtime.sendMessage({
      action: 'draftResponse',
      data: emailContent
    }, (response) => {
      if (response?.draft) {
        showDraftOverlay(response.draft);
      }
    });
  };

  container.parentElement.insertBefore(button, container);
}

function showDraftOverlay(draftText) {
  const existing = document.getElementById('mail-bites-draft-response');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'mail-bites-draft-response';
  overlay.style.background = '#f1f3f4';
  overlay.style.border = '1px solid #dadce0';
  overlay.style.borderRadius = '6px';
  overlay.style.padding = '12px';
  overlay.style.marginBottom = '10px'; // leave spacing below
  overlay.style.fontFamily = 'Arial, sans-serif';
  overlay.style.fontSize = '14px';
  overlay.innerText = draftText;

  const container = document.querySelector('.a3s');
  if (container?.parentElement) {
    container.parentElement.insertBefore(overlay, container); // ⬅ insert ABOVE
  }
}



// Observe Gmail for changes since it's a single-page app
let lastUrl = location.href;

const checkAndInject = () => {
  const emailBody = document.querySelector('.a3s');
  const alreadyInjected = document.getElementById('mail-bites-draft-button');

  if (emailBody && !alreadyInjected) {
    console.log("📩 Detected new email view. Injecting draft button.");
    injectDraftButton();
  }
};

const observer = new MutationObserver(() => {
  const currentUrl = location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    setTimeout(checkAndInject, 1000);  // Delay for Gmail to fully render
  }
});


// Start observing the document body for DOM changes
observer.observe(document.body, { 
  childList: true, 
  subtree: true 
}); 

checkAndInject();