const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const PORT = 8765;

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0' });
});

// Test path
app.post('/api/test-path', async (req, res) => {
  try {
    const { path: testPath } = req.body;
    await fs.access(testPath);
    res.json({ valid: true });
  } catch (error) {
    res.status(404).json({ valid: false });
  }
});

// Save artifact
app.post('/api/artifact', async (req, res) => {
  try {
    const { content, title, language, projectPath } = req.body;
    
    // Generate filename
    const timestamp = Date.now();
    const safeName = title.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50);
    
    const extensions = {
      javascript: 'js',
      typescript: 'ts',
      python: 'py',
      html: 'html',
      css: 'css',
      jsx: 'jsx',
      java: 'java',
      sql: 'sql',
      text: 'txt'
    };
    
    const ext = extensions[language] || 'txt';
    const filename = `${safeName}_${timestamp}.${ext}`;
    const filepath = path.join(projectPath, filename);
    
    // Ensure directory exists
    await fs.mkdir(projectPath, { recursive: true });
    
    // Save file
    await fs.writeFile(filepath, content, 'utf8');
    
    console.log(`Saved: ${filename} (${content.length} bytes)`);
    
    res.json({
      success: true,
      filename,
      path: filepath,
      size: content.length
    });
    
  } catch (error) {
    console.error('Error saving artifact:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║        Claude Artifact Sync v2 Server                  ║
║        Running on http://localhost:${PORT}                 ║
╚════════════════════════════════════════════════════════╝

Ready to receive artifacts...
`);
});