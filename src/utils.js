const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const GEMINI_API_KEY = 'AIzaSyBzVtKG8wr-zGAgYL7q0_hZ2C3y1kY7o60';

// Decode Gmail base64 format
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

function buildOAuthUrl(clientId, redirectUri, scopes) {
  return `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes.join(' '))}`;
}

async function analyzeEmailContent(email) {
  try {
    const prompt = `...`; // Use shortened prompt or dummy response for testing
    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1024 }
    };

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) throw new Error('Gemini API error');

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return {
      ...email,
      priorityScore: 7,
      priorityReasoning: "Simulated successful parsing",
      suggestedResponseTime: "within 4 hours"
    };
  } catch (error) {
    return {
      ...email,
      priorityScore: 5,
      priorityReasoning: `Analysis failed: ${error.message}`,
      suggestedResponseTime: 'within 24 hours'
    };
  }
}

module.exports = { decodeBase64, buildOAuthUrl, analyzeEmailContent };
