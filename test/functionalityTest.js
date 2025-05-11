const { decodeBase64 } = require('../src/background'); // Replace with correct path
const { analyzeEmailContent, buildOAuthUrl } = require('../src/background'); // If refactored into exportable helpers

describe("Mail Bites Extension Tests", () => {
  
  /**
   * Test Case 1: Base64 decoding logic
   * This ensures that the decodeBase64 function correctly decodes 
   * Gmail's base64url-encoded message bodies.
   */
  test("decodeBase64 should correctly decode base64 string", () => {
    const input = btoa("Hello World!"); // Encode normally
    const encoded = input.replace(/\+/g, '-').replace(/\//g, '_'); // Mimic Gmail's base64url encoding
    expect(decodeBase64(encoded)).toBe("Hello World!"); // Expect the original string
  });

  /**
   * Test Case 2: OAuth URL construction
   * Verifies that the extension builds the correct authentication URL
   * to initiate the OAuth flow with Google's Identity service.
   */
  test("OAuth URL is correctly constructed", () => {
    const clientId = "test-client-id";
    const redirectUri = "https://abc.chromiumapp.org";
    const scopes = ["scope1", "scope2"];
    const expected = `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes.join(' '))}`;

    const actual = buildOAuthUrl(clientId, redirectUri, scopes); // You must refactor this logic from background.js into an exportable helper
    expect(actual).toBe(expected);
  });

  /**
   * Test Case 3: Gemini API fallback
   * Simulates a failure from the Gemini API and verifies that 
   * the fallback behavior (default priority score and error message)
   * is correctly triggered.
   */
  test("analyzeEmailContent returns fallback on Gemini API failure", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        text: () => Promise.resolve("Some error text"),
        status: 403,
      })
    );

    const dummyEmail = {
      subject: "Test",
      from: "test@example.com",
      date: "Today",
      body: "Some body text",
      snippet: "Some snippet"
    };

    const result = await analyzeEmailContent(dummyEmail); // This must be exported from your source code
    expect(result.priorityScore).toBe(5);
    expect(result.priorityReasoning).toMatch(/Analysis failed/i);
  });

});
