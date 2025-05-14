// Import the utility functions from the source directory
const {
  decodeBase64,
  buildOAuthUrl,
  analyzeEmailContent
} = require('../src/utils');  // Make sure this path matches your actual project structure

/**
 * Test Suite for core Mail Bites logic
 * 
 * These tests verify the behavior of utility functions that are separated
 * from extension-only logic (e.g., chrome APIs) so they can be run in a Jest environment.
 */
describe("📬 Mail Bites Utility Function Tests", () => {

  /**
   * Test Case 1: Base64 decoding for Gmail message bodies
   *
   * Gmail uses a URL-safe variant of base64 encoding for message content.
   * This test ensures that such encoded content is correctly decoded.
   */
  test("decodeBase64 should correctly decode Gmail-style base64", () => {
    const input = btoa("Hello World!"); // Standard base64 encode
    const encoded = input.replace(/\+/g, '-').replace(/\//g, '_'); // Convert to Gmail's base64url format
    const result = decodeBase64(encoded);
    expect(result).toBe("Hello World!");
  });

  /**
   * Test Case 2: OAuth URL construction
   * 
   * The Mail Bites extension constructs an OAuth 2.0 URL to authenticate with Gmail.
   * This test ensures that the function builds the URL correctly given inputs.
   */
  test("buildOAuthUrl should generate a correct OAuth URL", () => {
    const clientId = "test-client-id";
    const redirectUri = "https://abc.chromiumapp.org";
    const scopes = ["scope1", "scope2"];

    const expected = `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}` +
                     `&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}` +
                     `&scope=${encodeURIComponent(scopes.join(' '))}`;

    const result = buildOAuthUrl(clientId, redirectUri, scopes);
    expect(result).toBe(expected);
  });

  /**
   * Test Case 3: Gemini API fallback on error
   * 
   * If the Gemini API fails (e.g., bad API key, rate limit, network error),
   * the analyzeEmailContent function should gracefully fallback and assign default scores.
   */
  test("analyzeEmailContent should return fallback values on API failure", async () => {
    // Mock global.fetch to simulate an HTTP failure
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 403,
        text: () => Promise.resolve("Forbidden access")
      })
    );

    // Example email input
    const dummyEmail = {
      subject: "Quarterly Report",
      from: "ceo@example.com",
      date: "Today",
      body: "Please send your updates.",
      snippet: "Please send your updates."
    };

    const result = await analyzeEmailContent(dummyEmail);

    // Expected fallback values
    expect(result.priorityScore).toBe(5); // Default score
    expect(result.priorityReasoning).toMatch(/Analysis failed/i); // Should indicate failure
    expect(result.suggestedResponseTime).toBe("within 24 hours");
  });

});

