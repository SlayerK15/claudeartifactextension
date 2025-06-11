const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = 8765;

app.use(cors());
// Increase JSON limit to handle large artifacts
app.use(express.json({ limit: '50mb' }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

// Save artifact endpoint with enhanced debugging
app.post('/api/artifact', async (req, res) => {
  try {
    const { content, title, language, projectPath, timestamp } = req.body;
    
    // Debug logging
    console.log('\n=== New Artifact Save Request ===');
    console.log(`Title: ${title}`);
    console.log(`Language: ${language}`);
    console.log(`Content length: ${content ? content.length : 0} characters`);
    console.log(`Project path: ${projectPath}`);
    
    if (!content || !projectPath) {
      console.error('Missing required fields:', { hasContent: !!content, hasPath: !!projectPath });
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Log first and last parts of content for debugging
    if (content.length > 200) {
      console.log('Content preview (first 100 chars):', content.substring(0, 100));
      console.log('Content preview (last 100 chars):', content.substring(content.length - 100));
    }
    
    // Ensure project path exists
    await fs.mkdir(projectPath, { recursive: true });
    
    // Generate filename
    const extension = getFileExtension(language);
    let sanitizedTitle = title.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/__+/g, '_');
    
    // Remove common prefixes and clean up
    sanitizedTitle = sanitizedTitle
      .replace(/^(text|document|artifact|code)_+/i, '')
      .replace(/_+\d{13}_*$/, '') // Remove existing timestamps
      .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
      .substring(0, 50);
    
    if (!sanitizedTitle || sanitizedTitle.length < 3) {
      sanitizedTitle = `${language}_document`;
    }
    
    // Generate unique filename
    let filename = `${sanitizedTitle}${extension}`;
    let filePath = path.join(projectPath, filename);
    let counter = 1;
    
    // Check if file already exists
    while (await fileExists(filePath)) {
      if (counter <= 5) {
        filename = `${sanitizedTitle}_${counter}${extension}`;
      } else {
        filename = `${sanitizedTitle}_${Date.now()}${extension}`;
      }
      filePath = path.join(projectPath, filename);
      counter++;
      
      if (counter > 10) break;
    }
    
    // Save the file
    console.log(`Saving to: ${filePath}`);
    await fs.writeFile(filePath, content, 'utf8');
    
    // Verify the file was saved correctly
    const savedStats = await fs.stat(filePath);
    const savedContent = await fs.readFile(filePath, 'utf8');
    
    console.log(`✓ File saved successfully`);
    console.log(`  Filename: ${filename}`);
    console.log(`  Size on disk: ${savedStats.size} bytes`);
    console.log(`  Content length: ${savedContent.length} characters`);
    console.log(`  Match original: ${savedContent.length === content.length ? 'YES' : 'NO'}`);
    
    if (savedContent.length !== content.length) {
      console.error('WARNING: Saved content length does not match original!');
      console.error(`Original: ${content.length}, Saved: ${savedContent.length}`);
    }
    
    res.json({ 
      success: true, 
      filename,
      path: filePath,
      size: content.length,
      savedSize: savedContent.length
    });
    
  } catch (error) {
    console.error('Error saving artifact:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to check if file exists
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Extended file extension mapping
function getFileExtension(language) {
  const extensions = {
    javascript: '.js',
    typescript: '.ts',
    python: '.py',
    html: '.html',
    css: '.css',
    jsx: '.jsx',
    java: '.java',
    sql: '.sql',
    json: '.json',
    xml: '.xml',
    yaml: '.yml',
    markdown: '.md',  // Make sure markdown is included
    bash: '.sh',
    powershell: '.ps1',
    php: '.php',
    ruby: '.rb',
    go: '.go',
    rust: '.rs',
    cpp: '.cpp',
    c: '.c',
    scss: '.scss',
    swift: '.swift',
    kotlin: '.kt',
    scala: '.scala',
    dockerfile: '.dockerfile',
    nginx: '.conf',
    apache: '.conf',
    text: '.txt'  // Default fallback
  };
  
  return extensions[language] || '.txt';
}

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║        Claude Artifact Sync Server v2.0.0              ║
║        Running on http://localhost:${PORT}                 ║
║                                                        ║
║        Enhanced debugging enabled                      ║
╚════════════════════════════════════════════════════════╝

Ready to receive artifacts...
`);
});

module.exports = app;