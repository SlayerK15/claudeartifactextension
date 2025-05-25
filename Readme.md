# Claude Artifact Sync v2

A Chrome extension that automatically detects and saves code artifacts from Claude.ai conversations to your local machine.

## Features

- 🚀 **Auto-detection** of code artifacts on Claude.ai
- 💾 **One-click saving** of individual or all artifacts
- 📁 **Organized file management** with automatic file extensions
- 🔄 **Real-time sync** as you browse conversations
- 🌐 **Local server** for secure file handling
- 📊 **Status notifications** for successful saves

## Installation

### 1. Install the Extension

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the `extension` folder
5. The extension icon should appear in your Chrome toolbar

### 2. Set Up the Server

1. Make sure you have [Node.js](https://nodejs.org/) installed
2. In the project root directory, run:
   ```bash
   npm install
   npm start
   ```
3. The server will start on `http://localhost:8765`

## Usage

### Initial Setup

1. Click the extension icon in your Chrome toolbar
2. Set your **Project Directory** (e.g., `C:\Projects\claude-artifacts`)
3. Verify the **Server URL** is `http://localhost:8765`
4. Click **Test Connection** to ensure the server is running
5. Toggle the extension **ON**

### Using the Extension

1. **Navigate to Claude.ai** and start a conversation
2. **Enable monitoring** using the toggle in the extension popup
3. **Generate code** - ask Claude to create code, HTML, scripts, etc.
4. **Detect artifacts** by clicking the "Detect Artifacts" button
5. **Save artifacts**:
   - Click "Save All Artifacts" to save everything at once
   - Or use "Sync All" for real-time syncing

### Supported Languages

The extension automatically detects and assigns appropriate file extensions:

- JavaScript (`.js`)
- TypeScript (`.ts`) 
- Python (`.py`)
- HTML (`.html`)
- CSS (`.css`)
- JSX (`.jsx`)
- Java (`.java`)
- SQL (`.sql`)
- And many more...

## Configuration

### Extension Settings

- **Enable Toggle**: Turn monitoring on/off
- **Project Directory**: Where to save your artifacts
- **Server URL**: Local server endpoint (default: `http://localhost:8765`)

### Server Configuration

The server runs on port 8765 by default. You can modify this in `server.js`:

```javascript
const PORT = 8765; // Change this if needed
```

## File Organization

Files are saved with descriptive names:
```
your-project-directory/
├── React_Component_1703123456789.jsx
├── Python_Script_1703123456790.py
├── HTML_Page_1703123456791.html
└── ...
```

## Troubleshooting

### Extension Not Working
- Refresh the Claude.ai page after installing
- Check that the extension is enabled in Chrome
- Verify you're on a Claude.ai conversation page

### Server Connection Issues
- Make sure the server is running (`npm start`)
- Check the server URL in extension settings
- Verify port 8765 is not blocked by firewall

### No Artifacts Detected
- Try clicking "Detect Artifacts" manually
- Ensure Claude has generated code in the conversation
- Refresh the page and try again

### Permission Errors
- Check that the project directory exists and is writable
- On Windows: Use full paths like `C:\Projects\claude-artifacts`
- On Mac/Linux: Use paths like `/Users/username/claude-artifacts`

## Development

### Project Structure
```
claude-artifact-sync/
├── extension/           # Chrome extension files
│   ├── manifest.json   # Extension configuration
│   ├── popup.html      # Extension popup UI
│   ├── popup.js        # Popup functionality  
│   ├── content.js      # Claude.ai page injection
│   ├── background.js   # Background service worker
│   └── icons/          # Extension icons
├── server.js           # Local file server
├── package.json        # Node.js dependencies
└── README.md          # This file
```

### Making Changes

1. **Extension code**: Modify files in `/extension/` folder
2. **Server code**: Edit `server.js`
3. **Testing**: Reload extension in Chrome after changes
4. **Debugging**: Use Chrome DevTools console

## API Endpoints

### Health Check
```
GET /api/health
Response: { status: 'ok', version: '2.0.0', timestamp: '...' }
```

### Save Artifact
```
POST /api/artifact
Body: {
  content: 'code content',
  title: 'artifact title', 
  language: 'javascript',
  projectPath: '/path/to/save'
}
Response: { success: true, filename: 'saved_file.js', path: '...' }
```

## Security

- All communication stays on your local machine
- No data is sent to external servers
- Files are saved directly to your specified directory
- Server only accepts connections from localhost

## License

MIT License - see LICENSE file for details

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Look at browser console logs (F12 → Console)
3. Check server logs in terminal
4. Create an issue with details about your setup and the problem