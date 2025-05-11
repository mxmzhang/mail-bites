// Import specific functions from your background script (make sure these are exported properly)
const { decodeBase64 } = require('../src/background'); // Function to decode Gmail-style base64
const { analyzeEmailContent, buildOAuthUrl } = require('../src/background'); // Gemini analyzer and OAuth URL builder

// Define a suite of tests for the Mail Bites extension
describe("Mail Bites Extension Tests", () => {
  
  /**
   * Test Case 1: decodeBase64
   * This test verifies that base64url-encoded strings from Gmail are correctly decoded.
   */
  test("decodeBase64 should correctly decode base64 string", () => {
    const input = btoa("Hello World!"); // Encode "Hello World!" to standard base64
    const encoded = input.replace(/\+/g, '-').replace(/\//g, '_'); // Convert to base64url format (used by Gmail)
    expect(decodeBase64(encoded)).toBe("Hello World!"); // Decode and assert the result matches original input
  });

  /**
   * Test Case 2: buildOAuthUrl
   * Ensures the OAuth URL is correctly constructed with clientId, redirect URI, and scopes.
   */
  test("OAuth URL is correctly constructed", () => {
    const clientId = "test-client-id"; // Example client ID
    const redirectUri = "https://abc.chromiumapp.org"; // Example redirect URI
    const scopes = ["scope1", "scope2"]; // Example OAuth scopes

    // Construct the expected URL manually
    const expected = `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes.join(' '))}`;

    // Call the function under test (should be a pure function returning a string)
    const actual = buildOAuthUrl(clientId, redirectUri, scopes);

    // Assert the generated URL matches what we expect
    expect(actual).toBe(expected);
  });

  /**
   * Test Case 3: analyzeEmailContent fallback
   * Simulates a Gemini API failure and verifies fallback values are returned.
   */
  test("analyzeEmailContent returns fallback on Gemini API failure", async () => {
    // Mock the fetch function globally to simulate API failure
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false, // Simulate HTTP failure
        text: () => Promise.resolve("Some error text"), // Return some error body
        status: 403, // Simulate a 403 Forbidden error
      })
    );

    // Create a mock email object as input
    const dummyEmail = {
      subject: "Test",
      from: "test@example.com",
      date: "Today",
      body: "Some body text",
      snippet: "Some snippet"
    };

    // Call the function with simulated failure
    const result = await analyzeEmailContent(dummyEmail);

    // Assert that fallback score is used
    expect(result.priorityScore).toBe(5); // Default fallback score

    // Assert that reasoning includes an analysis failure message
    expect(result.priorityReasoning).toMatch(/Analysis failed/i); // Should mention failure
  });

});
