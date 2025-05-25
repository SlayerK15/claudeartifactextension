const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = 8765;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

// Save artifact endpoint
app.post('/api/artifact', async (req, res) => {
  try {
    const { content, title, language, projectPath, timestamp } = req.body;
    
    if (!content || !projectPath) {
      return res.status(400).json({ error: 'Missing required fields' });
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
    
    // Check if file already exists
    let filename = `${sanitizedTitle}${extension}`;
    let filePath = path.join(projectPath, filename);
    let counter = 1;
    
    // If file exists, try variations before adding timestamp
    while (await fileExists(filePath)) {
      // First try with counter
      if (counter <= 5) {
        filename = `${sanitizedTitle}_${counter}${extension}`;
      } else {
        // Fall back to timestamp after 5 attempts
        filename = `${sanitizedTitle}_${Date.now()}${extension}`;
      }
      filePath = path.join(projectPath, filename);
      counter++;
      
      // Safety break to avoid infinite loop
      if (counter > 10) break;
    }
    
    // Save the file
    await fs.writeFile(filePath, content, 'utf8');
    
    console.log(`Saved artifact: ${filename} (${content.length} bytes)`);
    
    res.json({ 
      success: true, 
      filename,
      path: filePath,
      size: content.length
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
    markdown: '.md',
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
    apache: '.conf'
  };
  
  return extensions[language] || '.txt';
}

app.listen(PORT, () => {
  console.log(`Claude Artifact Sync Server running on http://localhost:${PORT}`);
  console.log('Health check: http://localhost:8765/api/health');
});

module.exports = app; 