console.log('[Claude Artifact Sync v2] Content script loaded');

// Utility function for delays
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class ArtifactDetector {
  constructor() {
    this.detectedArtifacts = new Map();
    this.settings = {
      projectPath: '',
      isEnabled: false,
      serverUrl: 'http://localhost:8765'
    };
    this.init();
  }

  async init() {
    // Load settings
    const stored = await chrome.storage.local.get(['projectPath', 'isEnabled', 'serverUrl']);
    Object.assign(this.settings, stored);
    
    console.log('[Artifact Sync] Initialized with settings:', this.settings);
    
    // Listen for messages
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sendResponse);
      return true;
    });
    
    // Start monitoring if enabled
    if (this.settings.isEnabled) {
      this.startMonitoring();
    }
  }

  handleMessage(request, sendResponse) {
    console.log('[Artifact Sync] Received message:', request.action);
    
    switch (request.action) {
      case 'toggleMonitoring':
        this.settings.isEnabled = request.enabled;
        request.enabled ? this.startMonitoring() : this.stopMonitoring();
        sendResponse({ success: true });
        break;
        
      case 'updateProjectPath':
        this.settings.projectPath = request.path;
        sendResponse({ success: true });
        break;
        
      case 'updateSettings':
        Object.assign(this.settings, request.settings);
        sendResponse({ success: true });
        break;
        
      case 'detectArtifacts':
        this.detectAllArtifacts().then(artifacts => {
          sendResponse({ artifacts });
        }).catch(error => {
          console.error('Error detecting artifacts:', error);
          sendResponse({ artifacts: [], error: error.message });
        });
        return true; // Keep the message channel open for async response
        break;
        
      case 'debugDetection':
        const debugInfo = this.runDebugAnalysis();
        sendResponse({ debugInfo });
        break;
        
      case 'saveArtifact':
        this.saveArtifact(request.artifact);
        sendResponse({ success: true });
        break;
        
      case 'syncAll':
      case 'saveAll':
        this.saveAllArtifacts();
        sendResponse({ success: true });
        break;
        
      case 'ping':
        sendResponse({ success: true });
        break;
    }
  }

  startMonitoring() {
    console.log('[Artifact Sync] Starting monitoring...');
    
    // Initial detection
    setTimeout(() => {
      this.detectAllArtifacts().catch(error => {
        console.error('Error in initial artifact detection:', error);
      });
    }, 1000);
    
    // Monitor for changes
    this.observer = new MutationObserver(() => {
      this.detectAllArtifacts().catch(error => {
        console.error('Error in mutation observer artifact detection:', error);
      });
    });
    
    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  stopMonitoring() {
    console.log('[Artifact Sync] Stopping monitoring...');
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  async detectAllArtifacts() {
    console.log('[Artifact Sync] Detecting artifacts...');
    const artifacts = [];
    console.log('[Artifact Sync] Current URL:', window.location.href);
    console.log('[Artifact Sync] Page title:', document.title);
    
    if (!window.location.href.includes('claude.ai')) {
      console.log('[Artifact Sync] Not on Claude.ai, skipping detection');
      return artifacts;
    }

    // Updated selectors for current Claude.ai interface
    const artifactSelectors = [
      // Modern Claude artifact containers
      '[data-testid*="artifact"]',
      '[class*="artifact"]',
      '[data-artifact-id]',
      
      // Code blocks in conversations
      'pre code',
      'pre',
      
      // Markdown containers
      '[class*="markdown"] pre',
      '[class*="prose"] pre',
      
      // Text areas with code (for editable artifacts)
      'textarea[readonly]',
      'textarea[class*="code"]',
      
      // Generic containers that might hold code
      '.whitespace-pre-wrap',
      '.font-mono',
      '[class*="code-block"]',
      '[class*="code_block"]'
    ];

    console.log('[Artifact Sync] Trying multiple selectors...');

    for (const selector of artifactSelectors) {
      try {
        const elements = document.querySelectorAll(selector);
        console.log(`[Artifact Sync] Selector "${selector}": found ${elements.length} elements`);
        
        for (const element of elements) {
          const artifact = await this.extractArtifactFromElement(element);
          if (artifact && !this.isDuplicate(artifact, artifacts)) {
            artifacts.push(artifact);
            console.log(`[Artifact Sync] ✅ Added artifact: ${artifact.title} (${artifact.language})`);
          }
        }
      } catch (error) {
        console.warn(`[Artifact Sync] Error with selector "${selector}":`, error);
      }
    }

    // Also try to find iframe-based artifacts
    const iframes = document.querySelectorAll('iframe');
    console.log(`[Artifact Sync] Checking ${iframes.length} iframes for artifacts...`);
    
    for (const iframe of iframes) {
      try {
        if (iframe.contentDocument) {
          const iframeArtifacts = this.detectArtifactsInDocument(iframe.contentDocument);
          artifacts.push(...iframeArtifacts.filter(a => !this.isDuplicate(a, artifacts)));
        }
      } catch (error) {
        // Cross-origin iframe, skip
        console.log('[Artifact Sync] Skipping cross-origin iframe');
      }
    }

    console.log(`[Artifact Sync] 🎯 Final result: Detected ${artifacts.length} valid artifacts`);
    
    // Update internal storage
    this.detectedArtifacts.clear();
    artifacts.forEach(artifact => {
      const id = this.generateArtifactId(artifact);
      this.detectedArtifacts.set(id, artifact);
    });

    return artifacts;
  }

  detectArtifactsInDocument(doc) {
    const artifacts = [];
    
    // Look for code in the iframe document
    const codeBlocks = doc.querySelectorAll('pre code, pre, textarea');
    codeBlocks.forEach(block => {
      const artifact = this.extractArtifactFromElement(block);
      if (artifact) {
        artifacts.push(artifact);
      }
    });
    
    return artifacts;
  }

  async extractArtifactFromElement(element) {
    console.log('[Artifact Sync] Extracting from element:', element.tagName, element.className);
    
    try {
      let content = '';
      let title = '';
      let language = '';
      
      // Extract content based on element type
      if (element.tagName === 'TEXTAREA') {
        content = element.value || element.textContent || '';
      } else if (element.tagName === 'INPUT') {
        content = element.value || '';
      } else {
        content = element.textContent || element.innerText || '';
      }
      
      content = content.trim();
      
      console.log('[Artifact Sync] Found content length:', content.length);
      console.log('[Artifact Sync] Content preview:', content.substring(0, 200));
      
      if (!this.isValidArtifactContent(content)) {
        console.log('[Artifact Sync] Content failed validation, skipping');
        return null;
      }

      // Try to extract language from various sources
      language = this.extractLanguageFromElement(element) || this.detectLanguage(content);
      
      // Try to extract title from various sources
      title = this.extractTitleFromElement(element) || this.generateTitleFromContent(content, language);
      
      const artifact = {
        content: content,
        title: title || `${language}_artifact`,
        language,
        timestamp: new Date().toISOString(),
        contentLength: content.length
      };
      
      console.log('[Artifact Sync] Created artifact:', {
        title: artifact.title,
        language: artifact.language,
        contentLength: artifact.content.length,
        hasNewlines: artifact.content.includes('\n'),
        firstLine: artifact.content.split('\n')[0].substring(0, 50)
      });
      
      return artifact;
    } catch (err) {
      console.error('[Artifact Sync] Error in extractArtifactFromElement:', err);
      return null;
    }
  }

  extractLanguageFromElement(element) {
    // Check class names for language hints
    const classes = element.className ? element.className.split(' ') : [];
    for (const cls of classes) {
      const match = cls.match(/language-(\w+)/) || cls.match(/lang-(\w+)/);
      if (match) {
        return match[1];
      }
    }
    
    // Check data attributes
    const langAttr = element.getAttribute('data-language') || 
                    element.getAttribute('data-lang') ||
                    element.getAttribute('data-mode');
    if (langAttr) {
      return langAttr;
    }
    
    // Check parent elements
    let parent = element.parentElement;
    while (parent && parent !== document.body) {
      const parentClasses = parent.className ? parent.className.split(' ') : [];
      for (const cls of parentClasses) {
        const match = cls.match(/language-(\w+)/) || cls.match(/lang-(\w+)/);
        if (match) {
          return match[1];
        }
      }
      parent = parent.parentElement;
    }
    
    return null;
  }

  extractTitleFromElement(element) {
    // Try various strategies to find a title
    const titleSources = [
      // Direct title/name attributes
      element.getAttribute('title'),
      element.getAttribute('data-title'),
      element.getAttribute('data-name'),
      element.getAttribute('aria-label'),
      
      // Look for title in nearby elements
      element.querySelector('[class*="title"], [class*="filename"], [class*="name"]')?.textContent,
      element.querySelector('h1, h2, h3, h4, h5, h6')?.textContent,
      
      // Look in parent containers
      element.closest('[data-testid]')?.querySelector('[class*="title"], h1, h2, h3')?.textContent,
      element.closest('.prose')?.querySelector('[class*="title"], h1, h2, h3')?.textContent,
      
      // Look at siblings
      element.previousElementSibling?.textContent,
      element.nextElementSibling?.textContent,
      element.parentElement?.previousElementSibling?.textContent,
      element.parentElement?.nextElementSibling?.textContent,
    ];
    
    for (const source of titleSources) {
      if (source && typeof source === 'string') {
        const text = source.trim();
        if (text && text.length > 0 && text.length < 100 && !this.looksLikeCode(text)) {
          return this.sanitizeTitle(text);
        }
      }
    }
    
    return null;
  }

  generateTitleFromContent(content, language) {
    // Try to generate a meaningful title from content
    const lines = content.split('\n');
    
    // Look for comments that might be titles
    for (const line of lines.slice(0, 5)) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      
      // Check for various comment patterns
      const commentPatterns = [
        /^\/\/\s*(.+)$/,           // // comment
        /^\/\*\s*(.+?)\s*\*\/$/,   // /* comment */
        /^#\s*(.+)$/,              // # comment
        /^--\s*(.+)$/,             // -- comment
        /^;\s*(.+)$/,              // ; comment
        /^<!--\s*(.+?)\s*-->$/,    // <!-- comment -->
        /^%\s*(.+)$/,              // % comment
      ];
      
      for (const pattern of commentPatterns) {
        const match = trimmed.match(pattern);
        if (match && match[1] && match[1].length < 80) {
          return this.sanitizeTitle(match[1]);
        }
      }
      
      // If first line is short and looks like a title, use it
      if (trimmed.length < 80 && !trimmed.includes('{') && !trimmed.includes(';')) {
        return this.sanitizeTitle(trimmed);
      }
    }
    
    // Look for filename patterns in content
    const filenameMatch = content.match(/[\w-]+\.(js|jsx|ts|tsx|py|html|css|java|cpp|c|php|rb|go|rs|swift|kt|scala|md|txt)(?:\s|$)/i);
    if (filenameMatch) {
      return filenameMatch[0].trim();
    }
    
    // Default title
    return `${language}_document_${Date.now()}`;
  }

  sanitizeTitle(title) {
    return title.replace(/[<>:"/\\|?*]/g, '_')
                .replace(/\s+/g, '_')
                .replace(/_+/g, '_')
                .substring(0, 80);
  }

  detectLanguage(content) {
    // Clean content for analysis
    const cleanContent = content.trim();
    
    // Markdown patterns (check first - very common in Claude)
    const markdownPatterns = [
      /^#+\s+/m,                    // Headers
      /^\*.*\*$/m,                  // Italic emphasis  
      /^-\s+\[.\]\s+/m,             // Task lists
      /^-\s+/m,                     // Bullet lists
      /^\d+\.\s+/m,                 // Numbered lists
      /\*\*.*\*\*/,                 // Bold text
      /`.*`/,                       // Inline code
      /```/,                        // Code blocks
      /^>/m,                        // Blockquotes
      /^\|.*\|/m,                   // Tables
    ];
    
    // Check if content has multiple markdown indicators
    const markdownMatches = markdownPatterns.filter(pattern => pattern.test(cleanContent)).length;
    if (markdownMatches >= 2 || /^#\s+.*\n[\s\S]*/.test(cleanContent)) {
      return 'markdown';
    }
    
    // Programming language patterns
    const patterns = {
      javascript: /(?:function\s*\(|const\s+\w+\s*=|let\s+\w+\s*=|var\s+\w+\s*=|=>|console\.log|document\.|window\.)/,
      typescript: /(?:interface\s+\w+|type\s+\w+\s*=|:\s*string|:\s*number|:\s*boolean|as\s+\w+)/,
      python: /(?:def\s+\w+\s*\(|class\s+\w+|import\s+\w+|from\s+\w+\s+import|print\s*\(|if\s+__name__\s*==)/,
      java: /(?:public\s+class|private\s+|protected\s+|static\s+void|public\s+static)/,
      cpp: /(?:#include\s*<|using\s+namespace|std::|int\s+main\s*\()/,
      c: /(?:#include\s*<|int\s+main\s*\(|printf\s*\(|malloc\s*\()/,
      php: /(?:<\?php|function\s+\w+\s*\(|\$\w+|echo\s+|->)/,
      ruby: /(?:def\s+\w+|class\s+\w+|require\s+|puts\s+|@\w+)/,
      go: /(?:package\s+\w+|func\s+\w+\s*\(|import\s+\(|fmt\.)/,
      rust: /(?:fn\s+\w+\s*\(|let\s+mut|struct\s+\w+|impl\s+)/,
      swift: /(?:func\s+\w+\s*\(|var\s+\w+|let\s+\w+|import\s+\w+)/,
      kotlin: /(?:fun\s+\w+\s*\(|val\s+\w+|var\s+\w+|class\s+\w+)/,
      scala: /(?:def\s+\w+\s*\(|val\s+\w+|var\s+\w+|object\s+\w+)/,
      html: /(?:<!DOCTYPE|<html|<head|<body|<div|<span|<p>)/i,
      css: /(?:^|\n)\s*[\w#.-]+\s*\{[\s\S]*?\}/,
      scss: /(?:\$\w+:|@import|@mixin|@include)/,
      jsx: /(?:import\s+React|<[A-Z]\w*[\s>]|className=|JSX\.Element)/,
      sql: /(?:SELECT\s+.*FROM|INSERT\s+INTO|UPDATE\s+.*SET|CREATE\s+TABLE)/i,
      json: /^\s*[\{\[][\s\S]*[\}\]]\s*$/,
      xml: /^\s*<\?xml|<\/\w+>\s*$/,
      yaml: /^[\w-]+:\s*$|^\s*-\s+/m,
      bash: /(?:bin\/bash|bin\/sh|\$\(|\${|grep\s+|sed\s+|awk\s+)/,
      powershell: /(?:\$\w+|Get-\w+|Set-\w+|New-\w+|Write-Host)/,
      dockerfile: /^FROM\s+|^RUN\s+|^COPY\s+|^CMD\s+/m,
      nginx: /server\s*\{|location\s*\/|proxy_pass/,
      apache: /VirtualHost|DocumentRoot|Directory/,
    };
    
    // Check programming languages
    for (const [lang, pattern] of Object.entries(patterns)) {
      if (pattern.test(cleanContent)) {
        return lang;
      }
    }
    
    // Default to text
    return 'text';
  }

  generateArtifactId(artifact) {
    const hash = this.hashCode(artifact.content);
    return `${artifact.language}_${hash}`;
  }

  hashCode(str) {
    let hash = 0;
    for (let i = 0; i < Math.min(str.length, 1000); i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  async saveArtifact(artifact) {
    if (!this.settings.projectPath) {
      console.error('No project path set');
      return;
    }
    
    try {
      const response = await fetch(`${this.settings.serverUrl}/api/artifact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...artifact,
          projectPath: this.settings.projectPath
        })
      });
      
      if (!response.ok) throw new Error('Server error');
      
      const result = await response.json();
      console.log('Artifact saved:', result.filename);
      
      chrome.runtime.sendMessage({
        action: 'artifactSynced',
        data: { filename: result.filename }
      });
      
    } catch (error) {
      console.error('Failed to save artifact:', error);
      chrome.runtime.sendMessage({
        action: 'syncError',
        error: error.message
      });
    }
  }

  async saveAllArtifacts() {
    // First detect all artifacts
    const artifacts = await this.detectAllArtifacts();
    
    console.log(`Saving ${artifacts.length} artifacts...`);
    
    for (const artifact of artifacts) {
      await this.saveArtifact(artifact);
      // Small delay between saves to avoid overwhelming the server
      await sleep(100);
    }
    
    chrome.runtime.sendMessage({
      action: 'syncComplete',
      count: artifacts.length
    });
  }

  // Helper function to detect if content is code-like
  looksLikeCode(text) {
    const codeIndicators = [
      'def ', 'function ', 'class ', 'import ', 'from ',
      'const ', 'let ', 'var ', '#!/',
      '# ', '## ', '```', 
      '){', '} else', 'return ', 'if (', 'for (', 'while (',
      'async function', 'export ', 'module.exports'
    ];
    
    return codeIndicators.some(indicator => text.includes(indicator)) ||
           (text.includes('{') && text.includes('}') && text.includes(';')) ||
           (text.split('\n').length > 10 && text.includes('    ')); // Indented code
  }

  // Helper function to detect if content is markdown
  looksLikeMarkdown(text) {
    if (!text || text.length < 10) return false;
    
    const markdownPatterns = [
      /^#{1,6}\s+/m,           // Headers
      /^\*\s+/m,               // Unordered lists
      /^\d+\.\s+/m,            // Ordered lists
      /\*\*[^*]+\*\*/,         // Bold text
      /\*[^*]+\*/,             // Italic text
      /\[.+\]\(.+\)/,          // Links
      /```[\s\S]*```/,         // Code blocks
      /`[^`]+`/,               // Inline code
      /^>\s+/m,                // Blockquotes
      /^\|.*\|/m,              // Tables
      /^---+$/m,               // Horizontal rules
    ];
    
    let matchCount = 0;
    for (const pattern of markdownPatterns) {
      if (pattern.test(text)) {
        matchCount++;
      }
    }
    
    // If it has 2 or more markdown patterns, it's likely markdown
    return matchCount >= 2;
  }

  // Helper method to avoid duplicates
  isDuplicate(artifact, existingArtifacts) {
    const currentContent = artifact.content.trim().toLowerCase();
    const currentTitle = artifact.title.toLowerCase();
    
    return existingArtifacts.some(existing => {
      const existingContent = existing.content.trim().toLowerCase();
      const existingTitle = existing.title.toLowerCase();
      
      // Exact content match
      if (existingContent === currentContent) {
        console.log('[Artifact Sync] Duplicate detected: exact content match');
        return true;
      }
      
      // Similar content (90% match for large content)
      if (currentContent.length > 100 && existingContent.length > 100) {
        const similarity = this.calculateSimilarity(currentContent, existingContent);
        if (similarity > 0.9) {
          console.log('[Artifact Sync] Duplicate detected: high similarity', similarity);
          return true;
        }
      }
      
      // Same title and language (likely duplicate)
      if (currentTitle === existingTitle && artifact.language === existing.language) {
        console.log('[Artifact Sync] Duplicate detected: same title and language');
        return true;
      }
      
      return false;
    });
  }

  // Calculate content similarity
  calculateSimilarity(str1, str2) {
    if (str1 === str2) return 1.0;
    if (str1.length === 0 || str2.length === 0) return 0.0;
    
    // Simple character-level similarity
    let matches = 0;
    const minLength = Math.min(str1.length, str2.length);
    
    for (let i = 0; i < minLength; i++) {
      if (str1[i] === str2[i]) {
        matches++;
      }
    }
    
    return matches / Math.max(str1.length, str2.length);
  }

  // ✅ Enhanced validation to prevent grabbing page CSS/HTML
  isValidArtifactContent(content) {
    if (!content || typeof content !== 'string') {
      return false;
    }
    
    const trimmedContent = content.trim();
    
    // Reject if too short
    if (trimmedContent.length < 30) {
      return false;
    }
    
    // Reject if it looks like CSS selectors (the 247KB issue)
    if (trimmedContent.includes('html[lang]') && trimmedContent.includes('body.') && trimmedContent.includes('{')) {
      console.log('[Artifact Sync] Rejecting content: Looks like CSS rules');
      return false;
    }
    
    // Reject if it's just UI text
    if (trimmedContent.startsWith('New chatChatsProjectsRecents') || 
        trimmedContent.includes('Sign up to Claude') ||
        trimmedContent.includes('Continue with Google')) {
      console.log('[Artifact Sync] Rejecting content: Looks like UI navigation text');
      return false;
    }
    
    // Reject if it contains too many CSS-like patterns
    const cssPatterns = [
      /\{[^}]+:[^}]+\}/g,  // CSS rules
      /\.[a-zA-Z-]+\s*\{/g, // CSS class selectors
      /#[a-zA-Z-]+\s*\{/g,  // CSS ID selectors
      />[\s\n]*[a-zA-Z]+\.[a-zA-Z]+/g // CSS child selectors
    ];
    
    let cssMatchCount = 0;
    for (const pattern of cssPatterns) {
      const matches = trimmedContent.match(pattern);
      if (matches) {
        cssMatchCount += matches.length;
      }
    }
    
    if (cssMatchCount > 10) {
      console.log('[Artifact Sync] Rejecting content: Too many CSS patterns found');
      return false;
    }
    
    // Reject if it's just a filename
    if (trimmedContent.length < 100 && !trimmedContent.includes('\n')) {
      const fileExtensions = ['.py', '.js', '.ts', '.html', '.css', '.md', '.json', '.yaml', '.yml', '.txt'];
      if (fileExtensions.some(ext => trimmedContent.endsWith(ext))) {
        console.log('[Artifact Sync] Rejecting content: Appears to be just a filename');
        return false;
      }
    }
    
    // Accept if it looks like code
    if (this.looksLikeCode(trimmedContent)) {
      return true;
    }
    
    // Accept if it looks like markdown
    if (this.looksLikeMarkdown(trimmedContent)) {
      return true;
    }
    
    // Accept if it has reasonable length and structure
    if (trimmedContent.length > 100 && trimmedContent.includes('\n')) {
      return true;
    }
    
    // Reject by default for safety
    console.log('[Artifact Sync] Rejecting content: Did not pass any validation criteria');
    return false;
  }

  // Debug analysis method
  runDebugAnalysis() {
    console.log('[Artifact Sync] 🔍 Running comprehensive debug analysis...');
    
    const analysis = {
      url: window.location.href,
      title: document.title,
      timestamp: new Date().toISOString(),
      totalElements: document.querySelectorAll('*').length,
      codeElements: 0,
      preTags: 0,
      fontMono: 0,
      artifactsFound: 0,
      elementsFound: [],
      sampleHTML: []
    };
    
    // Count different types of elements
    analysis.preTags = document.querySelectorAll('pre').length;
    analysis.fontMono = document.querySelectorAll('.font-mono').length;
    analysis.codeElements = document.querySelectorAll('code, pre, .font-mono, [class*="code"]').length;
    
    console.log('[Debug] Basic counts:', {
      totalElements: analysis.totalElements,
      preTags: analysis.preTags,
      fontMono: analysis.fontMono,
      codeElements: analysis.codeElements
    });
    
    // Try all our detection selectors
    const testSelectors = [
      '[data-testid*="artifact"]',
      '[class*="artifact"]',
      'pre code',
      'pre',
      'textarea[readonly]',
      '.whitespace-pre-wrap',
      '.font-mono',
      '[class*="code-block"]'
    ];
    
    testSelectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          analysis.elementsFound.push({
            selector: selector,
            count: elements.length,
            elements: Array.from(elements).slice(0, 3).map(el => ({
              tagName: el.tagName,
              className: el.className,
              textPreview: (el.textContent || '').substring(0, 100),
              hasCode: this.looksLikeCode(el.textContent || ''),
              isValid: this.isValidArtifactContent(el.textContent || '')
            }))
          });
          
          console.log(`[Debug] Selector "${selector}": ${elements.length} elements`);
        }
      } catch (error) {
        console.log(`[Debug] Error with selector "${selector}":`, error.message);
      }
    });
    
    // Try actual artifact detection
    try {
      this.detectAllArtifacts().then(artifacts => {
        analysis.artifactsFound = artifacts.length;
        console.log(`[Debug] Artifact detection found: ${artifacts.length} artifacts`);
      });
    } catch (error) {
      console.log('[Debug] Error in artifact detection:', error);
      analysis.artifactsFound = -1;
    }
    
    console.log('[Debug] 📋 Analysis Summary:', analysis);
    return analysis;
  }
}

// Initialize detector
const detector = new ArtifactDetector();