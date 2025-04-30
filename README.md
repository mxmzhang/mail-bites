# Mail Bites - Gmail Chrome Extension

A Chrome extension that integrates with Gmail to provide quick insights and summaries of your emails.

## Features

- Authenticate with Gmail API to access your emails
- View a list of recent emails
- Read email content in a clean interface
- Coming soon: Email summaries and To-Do lists

## Setup
Note that to run this extension before this is published on Chrome Web Store, you need to repeat the set up process individually to successfully launch this extension. At the end of the setup, you also need to add the testing gmail in the Audience tab in Google Cloud Project.

### 1. Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable the Gmail API:
   - In the sidebar, navigate to "APIs & Services" > "Library"
   - Search for "Gmail API" and enable it

### 2. Set Up OAuth 2.0 Credentials

1. In the sidebar, navigate to "APIs & Services" > "Credentials"
2. Click "Create Credentials" and select "OAuth client ID"
3. Select "Chrome Extension" as the application type
4. Enter a name for your OAuth client
5. For "Application ID", enter the extension ID (you'll get this after loading the extension in Chrome for the first time)
6. Add `https://mail.google.com/` to the JavaScript origins
7. Click "Create"
8. Note your Client ID - you'll need it in the next step

### 3. Update the Extension Manifest

1. Open `public/manifest.json`
2. Replace `YOUR_CLIENT_ID.apps.googleusercontent.com` with your actual client ID from the previous step

### 4. Install Dependencies and Build the Extension

```bash
# Install dependencies
npm install

# Build the extension
npm run build
```

### 5. Load the Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in the top-right corner)
3. Click "Load unpacked" and select the `dist` folder from your project
4. Note the extension ID that appears under the extension name - you'll need to add this to your OAuth client configuration
5. Go back to the Google Cloud Console, update your OAuth client with this extension ID

### 6. Use the Extension

1. Click the Mail Bites icon in your Chrome toolbar
2. Click "Connect to Gmail" and follow the authentication flow
3. Once authenticated, you can view and interact with your emails

## Development

```bash
# Run in development mode with hot reload
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

## Privacy Notice

Mail Bites processes your Gmail data locally within the extension. No email data is sent to external servers. The extension uses OAuth 2.0 to authenticate with Gmail, giving you control over what data you share and the ability to revoke access at any time through your Google Account settings.

## License

MIT
