console.log('[Claude Artifact Sync v2] Enhanced content script loaded');

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
    
    // Initial detection with delay
    setTimeout(() => {
      this.detectAllArtifacts().catch(error => {
        console.error('Error in initial artifact detection:', error);
      });
    }, 2000); // Increased delay to let page fully load
    
    // Monitor for changes
    this.observer = new MutationObserver(() => {
      // Debounce the detection to avoid too many calls
      clearTimeout(this.detectionTimeout);
      this.detectionTimeout = setTimeout(() => {
        this.detectAllArtifacts().catch(error => {
          console.error('Error in mutation observer artifact detection:', error);
        });
      }, 1000);
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
    if (this.detectionTimeout) {
      clearTimeout(this.detectionTimeout);
    }
  }

  // NEW: Function to expand collapsed content
  async expandAllContent() {
    console.log('[Artifact Sync] Expanding collapsed content...');
    
    // Common "Show more" button selectors for Claude.ai
    const expandButtonSelectors = [
      'button[aria-label*="Show more"]',
      'button[aria-label*="Expand"]',
      'button:contains("Show more")',
      'button:contains("...")',
      'button:contains("Read more")',
      '[role="button"]:contains("Show more")',
      '.expand-button',
      '.show-more',
      '[data-testid*="expand"]',
      '[data-testid*="show-more"]'
    ];
    
    let expandedSomething = false;
    
    for (const selector of expandButtonSelectors) {
      try {
        const buttons = document.querySelectorAll(selector);
        for (const button of buttons) {
          if (button.offsetParent !== null) { // Only click visible buttons
            console.log('[Artifact Sync] Clicking expand button:', button);
            button.click();
            expandedSomething = true;
            await sleep(500); // Wait for content to load
          }
        }
      } catch (error) {
        console.log(`[Artifact Sync] Error with expand selector "${selector}":`, error);
      }
    }
    
    // Also try clicking on elements that might be collapsible
    const collapsibleElements = document.querySelectorAll('[class*="collaps"], [class*="truncat"], [class*="expand"]');
    for (const element of collapsibleElements) {
      if (element.offsetParent !== null && element.tagName === 'BUTTON') {
        try {
          element.click();
          expandedSomething = true;
          await sleep(300);
        } catch (error) {
          // Ignore click errors
        }
      }
    }
    
    if (expandedSomething) {
      console.log('[Artifact Sync] Expanded content, waiting for load...');
      await sleep(2000); // Wait for all content to fully load
    }
    
    return expandedSomething;
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

    // NEW: First expand all collapsed content
    await this.expandAllContent();

    // Enhanced selectors for current Claude.ai interface
    const artifactSelectors = [
      // Claude-specific artifact containers (highest priority)
      '[data-testid*="artifact"]',
      '[class*="artifact"]',
      '[data-artifact-id]',
      
      // Code blocks in conversations (most common)
      'pre code',
      'pre',
      'code',
      
      // Specific Claude.ai containers
      '[class*="prose"] pre',
      '[class*="markdown"] pre',
      '.whitespace-pre-wrap',
      '.font-mono',
      '.overflow-x-auto pre',
      
      // Text areas and inputs (for interactive artifacts)
      'textarea[readonly]',
      'textarea[class*="code"]',
      'textarea[spellcheck="false"]',
      
      // Generic code containers
      '[class*="code-block"]',
      '[class*="code_block"]',
      '[class*="highlight"]',
      '.hljs', // highlight.js
      
      // Containers that might hold formatted text
      '[style*="font-family"][style*="mono"]',
      '[style*="white-space: pre"]'
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
            console.log(`[Artifact Sync] ✅ Added artifact: ${artifact.title} (${artifact.language}, ${artifact.contentLength} chars)`);
          }
        }
      } catch (error) {
        console.warn(`[Artifact Sync] Error with selector "${selector}":`, error);
      }
    }

    // Also check for iframe-based artifacts
    const iframes = document.querySelectorAll('iframe');
    console.log(`[Artifact Sync] Checking ${iframes.length} iframes for artifacts...`);
    
    for (const iframe of iframes) {
      try {
        if (iframe.contentDocument) {
          await this.expandContentInIframe(iframe);
          const iframeArtifacts = this.detectArtifactsInDocument(iframe.contentDocument);
          artifacts.push(...iframeArtifacts.filter(a => !this.isDuplicate(a, artifacts)));
        }
      } catch (error) {
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

  // NEW: Expand content within iframes
  async expandContentInIframe(iframe) {
    try {
      const iframeDoc = iframe.contentDocument;
      if (!iframeDoc) return;
      
      const expandButtons = iframeDoc.querySelectorAll('button, [role="button"]');
      for (const button of expandButtons) {
        const text = button.textContent.toLowerCase();
        if (text.includes('show') && (text.includes('more') || text.includes('all'))) {
          button.click();
          await sleep(500);
        }
      }
    } catch (error) {
      console.log('[Artifact Sync] Error expanding iframe content:', error);
    }
  }

  detectArtifactsInDocument(doc) {
    const artifacts = [];
    
    // Look for code in the document
    const codeBlocks = doc.querySelectorAll('pre code, pre, textarea, .font-mono');
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
      
      // Enhanced content extraction
      content = await this.getFullElementContent(element);
      
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

  // NEW: Enhanced content extraction that handles multiple methods
  async getFullElementContent(element) {
    let content = '';
    
    // Method 1: Try different text extraction approaches
    const textMethods = [
      () => element.value, // For input/textarea elements
      () => element.textContent,
      () => element.innerText,
      () => element.innerHTML.replace(/<[^>]*>/g, ''), // Strip HTML tags
    ];
    
    for (const method of textMethods) {
      try {
        const text = method();
        if (text && text.length > content.length) {
          content = text;
        }
      } catch (error) {
        // Continue to next method
      }
    }
    
    // Method 2: For code elements, try to get from child elements
    if (element.tagName === 'PRE' && content.length < 100) {
      const codeElement = element.querySelector('code');
      if (codeElement) {
        const codeText = codeElement.textContent || codeElement.innerText || '';
        if (codeText.length > content.length) {
          content = codeText;
        }
      }
    }
    
    // Method 3: For elements that might have hidden content, try to reveal it
    if (content.length < 100 && this.mightHaveHiddenContent(element)) {
      await this.tryToRevealHiddenContent(element);
      // Re-extract after revealing
      const newContent = element.textContent || element.innerText || '';
      if (newContent.length > content.length) {
        content = newContent;
      }
    }
    
    // Method 4: Check if element is inside a container that might need scrolling
    if (content.length < 500) {
      const scrollableParent = this.findScrollableParent(element);
      if (scrollableParent) {
        // Scroll to make sure all content is loaded
        scrollableParent.scrollTop = 0;
        scrollableParent.scrollTop = scrollableParent.scrollHeight;
        await sleep(500);
        
        const scrolledContent = element.textContent || element.innerText || '';
        if (scrolledContent.length > content.length) {
          content = scrolledContent;
        }
      }
    }
    
    return content.trim();
  }

  // NEW: Check if element might have hidden content
  mightHaveHiddenContent(element) {
    const style = window.getComputedStyle(element);
    return (
      style.overflow === 'hidden' ||
      style.textOverflow === 'ellipsis' ||
      style.whiteSpace === 'nowrap' ||
      element.scrollHeight > element.clientHeight ||
      element.scrollWidth > element.clientWidth ||
      element.className.includes('truncat') ||
      element.className.includes('collaps') ||
      element.hasAttribute('data-truncated')
    );
  }

  // NEW: Try to reveal hidden content
  async tryToRevealHiddenContent(element) {
    // Try clicking on the element if it might be expandable
    if (element.style.cursor === 'pointer' || element.className.includes('expand')) {
      try {
        element.click();
        await sleep(500);
      } catch (error) {
        // Ignore click errors
      }
    }
    
    // Try expanding by modifying styles temporarily
    const originalStyle = {
      overflow: element.style.overflow,
      maxHeight: element.style.maxHeight,
      height: element.style.height,
      whiteSpace: element.style.whiteSpace
    };
    
    try {
      element.style.overflow = 'visible';
      element.style.maxHeight = 'none';
      element.style.height = 'auto';
      element.style.whiteSpace = 'pre-wrap';
      
      await sleep(200); // Let the browser re-render
      
      // Restore original styles after a moment
      setTimeout(() => {
        Object.assign(element.style, originalStyle);
      }, 1000);
      
    } catch (error) {
      console.log('[Artifact Sync] Error modifying element styles:', error);
    }
  }

  // NEW: Find scrollable parent container
  findScrollableParent(element) {
    let parent = element.parentElement;
    while (parent && parent !== document.body) {
      const style = window.getComputedStyle(parent);
      if (
        style.overflow === 'auto' ||
        style.overflow === 'scroll' ||
        style.overflowY === 'auto' ||
        style.overflowY === 'scroll'
      ) {
        return parent;
      }
      parent = parent.parentElement;
    }
    return null;
  }

  extractLanguageFromElement(element) {
    // Check class names for language hints
    const classes = element.className ? element.className.split(' ') : [];
    for (const cls of classes) {
      const match = cls.match(/language-(\w+)/) || cls.match(/lang-(\w+)/) || cls.match(/hljs-(\w+)/);
      if (match) {
        return match[1];
      }
    }
    
    // Check data attributes
    const langAttr = element.getAttribute('data-language') || 
                    element.getAttribute('data-lang') ||
                    element.getAttribute('data-mode') ||
                    element.getAttribute('data-highlight-language');
    if (langAttr) {
      return langAttr;
    }
    
    // Check parent elements
    let parent = element.parentElement;
    let depth = 0;
    while (parent && parent !== document.body && depth < 5) {
      const parentClasses = parent.className ? parent.className.split(' ') : [];
      for (const cls of parentClasses) {
        const match = cls.match(/language-(\w+)/) || cls.match(/lang-(\w+)/) || cls.match(/hljs-(\w+)/);
        if (match) {
          return match[1];
        }
      }
      
      // Check parent data attributes
      const parentLangAttr = parent.getAttribute('data-language') || 
                            parent.getAttribute('data-lang') ||
                            parent.getAttribute('data-mode');
      if (parentLangAttr) {
        return parentLangAttr;
      }
      
      parent = parent.parentElement;
      depth++;
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
      element.getAttribute('data-filename'),
      element.getAttribute('aria-label'),
      
      // Look for title in nearby elements (enhanced search)
      element.querySelector('[class*="title"], [class*="filename"], [class*="name"], [class*="header"]')?.textContent,
      element.querySelector('h1, h2, h3, h4, h5, h6')?.textContent,
      
      // Look in parent containers (deeper search)
      element.closest('[data-testid]')?.querySelector('[class*="title"], [class*="filename"], h1, h2, h3')?.textContent,
      element.closest('.prose, .markdown, .artifact')?.querySelector('[class*="title"], [class*="filename"], h1, h2, h3')?.textContent,
      
      // Look at siblings (enhanced)
      element.previousElementSibling?.querySelector('[class*="title"], [class*="filename"]')?.textContent,
      element.nextElementSibling?.querySelector('[class*="title"], [class*="filename"]')?.textContent,
      element.previousElementSibling?.textContent,
      element.nextElementSibling?.textContent,
      
      // Look in conversation context
      this.findConversationContext(element),
    ];
    
    for (const source of titleSources) {
      if (source && typeof source === 'string') {
        const text = source.trim();
        if (text && text.length > 0 && text.length < 150 && !this.looksLikeCode(text)) {
          return this.sanitizeTitle(text);
        }
      }
    }
    
    return null;
  }

  // NEW: Find context from the conversation
  findConversationContext(element) {
    // Look for message context or conversation parts
    let context = element;
    let depth = 0;
    
    while (context && depth < 10) {
      // Look for common message container patterns
      if (context.className && (
        context.className.includes('message') ||
        context.className.includes('conversation') ||
        context.className.includes('response')
      )) {
        // Found a message container, look for preceding text
        const textNodes = this.getTextNodesBeforeElement(context, element);
        const contextText = textNodes.join(' ').trim();
        
        if (contextText && contextText.length > 10 && contextText.length < 200) {
          // Extract potential title from context
          const sentences = contextText.split(/[.!?]\s+/);
          for (const sentence of sentences.slice(-3)) { // Last 3 sentences
            if (sentence.length < 80 && sentence.length > 10 && !this.looksLikeCode(sentence)) {
              return sentence.trim();
            }
          }
        }
        break;
      }
      
      context = context.parentElement;
      depth++;
    }
    
    return null;
  }

  // NEW: Get text nodes that appear before the code element
  getTextNodesBeforeElement(container, targetElement) {
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    const textNodes = [];
    let node;
    
    while (node = walker.nextNode()) {
      if (node.parentElement === targetElement || targetElement.contains(node)) {
        break; // Stop when we reach the target element
      }
      
      const text = node.textContent.trim();
      if (text && text.length > 5) {
        textNodes.push(text);
      }
    }
    
    return textNodes.slice(-5); // Last 5 text nodes
  }

  generateTitleFromContent(content, language) {
    // Enhanced title generation
    const lines = content.split('\n');
    
    // Look for file paths or names in the content
    const filePathMatch = content.match(/[\w-]+\.(js|jsx|ts|tsx|py|html|css|java|cpp|c|php|rb|go|rs|swift|kt|scala|md|txt|json|yaml|yml)(?:\s|$)/i);
    if (filePathMatch) {
      return filePathMatch[0].trim();
    }
    
    // Look for function names, class names, or other identifiers
    const identifierPatterns = [
      /(?:function|def|class)\s+([a-zA-Z_][a-zA-Z0-9_]*)/,
      /([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(?:function|async)/,
      /export\s+(?:default\s+)?(?:function|class)\s+([a-zA-Z_][a-zA-Z0-9_]*)/,
      /^\s*([A-Z][a-zA-Z0-9_]*)\s*\{/m, // React component pattern
    ];
    
    for (const pattern of identifierPatterns) {
      const match = content.match(pattern);
      if (match && match[1] && match[1].length < 50) {
        return `${match[1]}_${language}`;
      }
    }
    
    // Look for comments that might be titles (enhanced)
    for (const line of lines.slice(0, 10)) { // Check first 10 lines
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      
      const commentPatterns = [
        /^\/\/\s*(.+)$/,           // // comment
        /^\/\*\s*(.+?)\s*\*\/$/,   // /* comment */
        /^#\s*(.+)$/,              // # comment
        /^--\s*(.+)$/,             // -- comment
        /^;\s*(.+)$/,              // ; comment
        /^<!--\s*(.+?)\s*-->$/,    // <!-- comment -->
        /^%\s*(.+)$/,              // % comment
        /^"""\s*(.+?)\s*"""/,      // Python docstring
        /^'''\s*(.+?)\s*'''/,      // Python docstring
      ];
      
      for (const pattern of commentPatterns) {
        const match = trimmed.match(pattern);
        if (match && match[1] && match[1].length < 100 && match[1].length > 3) {
          return this.sanitizeTitle(match[1]);
        }
      }
      
      // If first non-comment line is short and descriptive
      if (!trimmed.startsWith('//') && !trimmed.startsWith('#') && !trimmed.startsWith('/*')) {
        if (trimmed.length < 100 && trimmed.length > 10 && 
            !trimmed.includes('{') && !trimmed.includes(';') && 
            !trimmed.includes('(') && /^[a-zA-Z\s-_]+$/.test(trimmed)) {
          return this.sanitizeTitle(trimmed);
        }
        break; // Stop after first non-comment line
      }
    }
    
    // Generate based on content type and language
    const timestamp = Date.now().toString().slice(-6); // Last 6 digits
    return `${language}_document_${timestamp}`;
  }

  sanitizeTitle(title) {
    return title.replace(/[<>:"/\\|?*]/g, '_')
                .replace(/\s+/g, '_')
                .replace(/_+/g, '_')
                .replace(/^_+|_+$/g, '')
                .substring(0, 80);
  }

  detectLanguage(content) {
    // Clean content for analysis
    const cleanContent = content.trim();
    
    // Enhanced markdown detection (check first - very common in Claude)
    const markdownPatterns = [
      /^#{1,6}\s+.+$/m,             // Headers
      /^\*\*[^*]+\*\*$/m,           // Bold text lines
      /^-\s+\[.\]\s+/m,             // Task lists
      /^-\s+.+$/m,                  // Bullet lists
      /^\d+\.\s+.+$/m,              // Numbered lists
      /\*\*[^*]+\*\*/,              // Bold text
      /`[^`]+`/,                    // Inline code
      /```[\s\S]*?```/,             // Code blocks
      /^>\s+/m,                     // Blockquotes
      /^\|[^|]*\|[^|]*\|/m,         // Tables
      /\[.+\]\(.+\)/,               // Links
      /^---+$/m,                    // Horizontal rules
    ];
    
    let markdownMatches = 0;
    for (const pattern of markdownPatterns) {
      if (pattern.test(cleanContent)) {
        markdownMatches++;
      }
    }
    
    // If multiple markdown indicators, it's likely markdown
    if (markdownMatches >= 2) {
      return 'markdown';
    }
    
    // Enhanced programming language detection
    const patterns = {
      // Web languages (most common in Claude)
      javascript: /(?:function\s*\(|const\s+\w+\s*=|let\s+\w+\s*=|var\s+\w+\s*=|=>|console\.log|document\.|window\.|require\(|import\s+.*from)/,
      typescript: /(?:interface\s+\w+|type\s+\w+\s*=|:\s*string|:\s*number|:\s*boolean|as\s+\w+|<.*>|\w+:\s*\w+)/,
      jsx: /(?:import\s+React|<[A-Z]\w*[\s>]|className=|JSX\.Element|<\/[A-Z])/,
      html: /(?:<!DOCTYPE|<html|<head|<body|<div|<span|<p>|<h[1-6])/i,
      css: /(?:^|\n)\s*[\w#.-]+\s*\{[\s\S]*?\}|@media|@import|@keyframes/,
      scss: /(?:\$\w+:|@import|@mixin|@include|@extend|&\w+)/,
      
      // Backend languages
      python: /(?:def\s+\w+\s*\(|class\s+\w+|import\s+\w+|from\s+\w+\s+import|print\s*\(|if\s+__name__\s*==|self\.|@\w+)/,
      java: /(?:public\s+class|private\s+|protected\s+|static\s+void|public\s+static|System\.out)/,
      cpp: /(?:#include\s*<|using\s+namespace|std::|int\s+main\s*\(|cout\s*<<)/,
      c: /(?:#include\s*<|int\s+main\s*\(|printf\s*\(|malloc\s*\(|#define)/,
      php: /(?:<\?php|function\s+\w+\s*\(|\$\w+|echo\s+|->|\$_GET|\$_POST)/,
      ruby: /(?:def\s+\w+|class\s+\w+|require\s+|puts\s+|@\w+|end$)/m,
      go: /(?:package\s+\w+|func\s+\w+\s*\(|import\s+\(|fmt\.|var\s+\w+)/,
      rust: /(?:fn\s+\w+\s*\(|let\s+mut|struct\s+\w+|impl\s+|use\s+\w+)/,
      swift: /(?:func\s+\w+\s*\(|var\s+\w+|let\s+\w+|import\s+\w+|@\w+)/,
      kotlin: /(?:fun\s+\w+\s*\(|val\s+\w+|var\s+\w+|class\s+\w+|import\s+\w+)/,
      scala: /(?:def\s+\w+\s*\(|val\s+\w+|var\s+\w+|object\s+\w+|import\s+\w+)/,
      
      // Data languages
      sql: /(?:SELECT\s+.*FROM|INSERT\s+INTO|UPDATE\s+.*SET|CREATE\s+TABLE|DROP\s+TABLE|ALTER\s+TABLE)/i,
      json: /^\s*[\{\[][\s\S]*[\}\]]\s*$|":\s*["\{\[]|":\s*\d+|":\s*true|":\s*false|":\s*null/,
      xml: /^\s*<\?xml|<\/\w+>\s*$|<\w+[^>]*>[^<]*<\/\w+>/,
      yaml: /^[\w-]+:\s*$|^\s*-\s+[\w-]+:|^---$|^\.\.\.$|^\s+\w+:/m,
      
      // Shell and config
      bash: /(?:\$\(|\${|grep\s+|sed\s+|awk\s+|export\s+\w+=)/,
      powershell: /(?:\$\w+|Get-\w+|Set-\w+|New-\w+|Write-Host|Import-Module)/,
      dockerfile: /^FROM\s+|^RUN\s+|^COPY\s+|^CMD\s+|^EXPOSE\s+|^ENV\s+/m,
      nginx: /server\s*\{|location\s*\/|proxy_pass|listen\s+\d+/,
      apache: /VirtualHost|DocumentRoot|Directory|LoadModule/
    };
    
    // Check programming languages with weighted scoring
    const languageScores = {};
    
    for (const [lang, pattern] of Object.entries(patterns)) {
      const matches = cleanContent.match(new RegExp(pattern.source, pattern.flags + 'g'));
      if (matches) {
        languageScores[lang] = matches.length;
      }
    }
    
    // Return the language with the highest score
    if (Object.keys(languageScores).length > 0) {
      const topLanguage = Object.entries(languageScores)
        .sort(([,a], [,b]) => b - a)[0][0];
      return topLanguage;
    }
    
    // Default to text
    return 'text';
  }

  generateArtifactId(artifact) {
    const hash = this.hashCode(artifact.content + artifact.title);
    return `${artifact.language}_${hash}`;
  }

  hashCode(str) {
    let hash = 0;
    for (let i = 0; i < Math.min(str.length, 2000); i++) {
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
    // First detect all artifacts with full content
    const artifacts = await this.detectAllArtifacts();
    
    console.log(`Saving ${artifacts.length} artifacts...`);
    
    let savedCount = 0;
    for (const artifact of artifacts) {
      try {
        await this.saveArtifact(artifact);
        savedCount++;
        // Small delay between saves to avoid overwhelming the server
        await sleep(200);
      } catch (error) {
        console.error('Error saving artifact:', artifact.title, error);
      }
    }
    
    chrome.runtime.sendMessage({
      action: 'syncComplete',
      count: savedCount
    });
  }

  // Helper function to detect if content is code-like
  looksLikeCode(text) {
    if (!text || text.length < 10) return false;
    
    const codeIndicators = [
      'def ', 'function ', 'class ', 'import ', 'from ',
      'const ', 'let ', 'var ', '#!/', 'package ',
      '# ', '## ', '```', 
      '){', '} else', 'return ', 'if (', 'for (', 'while (',
      'async function', 'export ', 'module.exports', 'require(',
      'SELECT ', 'INSERT ', 'UPDATE ', 'CREATE TABLE',
      '<!DOCTYPE', '<html', '<script', '<style'
    ];
    
    const looksLike = codeIndicators.some(indicator => text.includes(indicator)) ||
           (text.includes('{') && text.includes('}') && text.includes(';')) ||
           (text.split('\n').length > 5 && /^[ ]{2,}/.test(text)) || // Indented code
           /^[\w-]+\.(js|py|html|css|java|cpp)$/m.test(text); // Filename pattern
           
    return looksLike;
  }

  // Helper function to detect if content is markdown
  looksLikeMarkdown(text) {
    if (!text || text.length < 20) return false;
    
    const markdownPatterns = [
      /^#{1,6}\s+/m,           // Headers
      /^\*\s+/m,               // Unordered lists
      /^\d+\.\s+/m,            // Ordered lists
      /\*\*[^*\n]+\*\*/,       // Bold text
      /\*[^*\n]+\*/,           // Italic text
      /\[.+\]\(.+\)/,          // Links
      /```[\s\S]*?```/,        // Code blocks
      /`[^`\n]+`/,             // Inline code
      /^>\s+/m,                // Blockquotes
      /^\|.*\|.*\|/m,          // Tables
      /^---+$/m,               // Horizontal rules
    ];
    
    let matchCount = 0;
    for (const pattern of markdownPatterns) {
      if (pattern.test(text)) {
        matchCount++;
      }
    }
    
    return matchCount >= 2;
  }

  // Enhanced duplicate detection
  isDuplicate(artifact, existingArtifacts) {
    const currentContent = artifact.content.trim();
    const currentTitle = artifact.title.toLowerCase();
    
    return existingArtifacts.some(existing => {
      const existingContent = existing.content.trim();
      const existingTitle = existing.title.toLowerCase();
      
      // Exact content match
      if (existingContent === currentContent) {
        console.log('[Artifact Sync] Duplicate detected: exact content match');
        return true;
      }
      
      // Very similar content (using enhanced similarity)
      if (currentContent.length > 100 && existingContent.length > 100) {
        const similarity = this.calculateAdvancedSimilarity(currentContent, existingContent);
        if (similarity > 0.95) {
          console.log('[Artifact Sync] Duplicate detected: high similarity', similarity);
          return true;
        }
      }
      
      // Same title and language with similar length
      if (currentTitle === existingTitle && 
          artifact.language === existing.language &&
          Math.abs(currentContent.length - existingContent.length) < 50) {
        console.log('[Artifact Sync] Duplicate detected: same title, language, and similar length');
        return true;
      }
      
      return false;
    });
  }

  // Enhanced similarity calculation
  calculateAdvancedSimilarity(str1, str2) {
    if (str1 === str2) return 1.0;
    if (str1.length === 0 || str2.length === 0) return 0.0;
    
    // Normalize strings (remove extra whitespace, normalize line endings)
    const normalize = (s) => s.replace(/\s+/g, ' ').replace(/\r\n/g, '\n').trim();
    const norm1 = normalize(str1);
    const norm2 = normalize(str2);
    
    if (norm1 === norm2) return 1.0;
    
    // Character-level similarity with sliding window
    const maxLen = Math.max(norm1.length, norm2.length);
    const minLen = Math.min(norm1.length, norm2.length);
    
    if (maxLen === 0) return 1.0;
    if (minLen / maxLen < 0.5) return 0.0; // Too different in length
    
    let matches = 0;
    const windowSize = Math.min(minLen, 100); // Check first 100 chars
    
    for (let i = 0; i < windowSize; i++) {
      if (norm1[i] === norm2[i]) {
        matches++;
      }
    }
    
    return matches / windowSize;
  }

  // Enhanced validation with better filtering
  isValidArtifactContent(content) {
    if (!content || typeof content !== 'string') {
      return false;
    }
    
    const trimmedContent = content.trim();
    
    // Must be substantial content
    if (trimmedContent.length < 50) {
      return false;
    }
    
    // Reject if it looks like UI navigation or page metadata
    const uiPatterns = [
      /^New chatChatsProjectsRecents/,
      /Sign up to Claude/,
      /Continue with Google/,
      /claude\.ai/,
      /Anthropic/i,
      /^(Home|About|Contact|Settings|Profile)$/,
      /^[0-9]+\s*(seconds?|minutes?|hours?)\s+ago$/,
      /^(Online|Offline|Away|Busy)$/
    ];
    
    for (const pattern of uiPatterns) {
      if (pattern.test(trimmedContent)) {
        console.log('[Artifact Sync] Rejecting content: UI text pattern matched');
        return false;
      }
    }
    
    // Reject if it's mostly CSS selectors (the 247KB issue)
    if (this.isMostlyCSS(trimmedContent)) {
      console.log('[Artifact Sync] Rejecting content: Mostly CSS');
      return false;
    }
    
    // Reject if it's just a single line filename
    if (!trimmedContent.includes('\n') && trimmedContent.length < 100) {
      const fileExtensions = ['.py', '.js', '.ts', '.html', '.css', '.md', '.json', '.yaml', '.yml', '.txt'];
      if (fileExtensions.some(ext => trimmedContent.endsWith(ext))) {
        console.log('[Artifact Sync] Rejecting content: Just a filename');
        return false;
      }
    }
    
    // Accept if it clearly looks like code
    if (this.looksLikeCode(trimmedContent)) {
      return true;
    }
    
    // Accept if it clearly looks like markdown
    if (this.looksLikeMarkdown(trimmedContent)) {
      return true;
    }
    
    // Accept if it has good structure (multiple lines, reasonable length)
    if (trimmedContent.length > 200 && trimmedContent.split('\n').length > 3) {
      return true;
    }
    
    // Reject by default for safety
    console.log('[Artifact Sync] Rejecting content: Did not pass validation criteria');
    return false;
  }

  // NEW: Better CSS detection
  isMostlyCSS(content) {
    const lines = content.split('\n');
    let cssLines = 0;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // CSS patterns
      if (
        /^[\w#.-]+\s*\{/.test(trimmed) ||      // Selector start
        /^[\w-]+\s*:\s*[^;]+;?$/.test(trimmed) || // Property
        /^\}/.test(trimmed) ||                 // Close brace
        /^@(media|import|keyframes)/.test(trimmed) // At-rules
      ) {
        cssLines++;
      }
    }
    
    const cssRatio = cssLines / lines.length;
    return cssRatio > 0.7; // More than 70% CSS-like lines
  }

  // Enhanced debug analysis
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
      expandedContent: false
    };
    
    // Count different types of elements
    analysis.preTags = document.querySelectorAll('pre').length;
    analysis.fontMono = document.querySelectorAll('.font-mono').length;
    analysis.codeElements = document.querySelectorAll('code, pre, .font-mono, [class*="code"]').length;
    
    // Try expanding content first
    this.expandAllContent().then(expanded => {
      analysis.expandedContent = expanded;
      console.log('[Debug] Expanded content:', expanded);
    });
    
    // Test detection selectors
    const testSelectors = [
      '[data-testid*="artifact"]',
      '[class*="artifact"]',
      'pre code',
      'pre',
      'textarea[readonly]',
      '.whitespace-pre-wrap',
      '.font-mono',
      '[class*="code-block"]',
      '.hljs'
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
              textLength: (el.textContent || '').length,
              textPreview: (el.textContent || '').substring(0, 100),
              hasCode: this.looksLikeCode(el.textContent || ''),
              hasMarkdown: this.looksLikeMarkdown(el.textContent || ''),
              isValid: this.isValidArtifactContent(el.textContent || ''),
              mightHaveHidden: this.mightHaveHiddenContent(el)
            }))
          });
        }
      } catch (error) {
        console.log(`[Debug] Error with selector "${selector}":`, error.message);
      }
    });
    
    // Run actual detection
    setTimeout(() => {
      this.detectAllArtifacts().then(artifacts => {
        analysis.artifactsFound = artifacts.length;
        console.log(`[Debug] Final detection found: ${artifacts.length} artifacts`);
        console.log('[Debug] 📋 Complete Analysis:', analysis);
      });
    }, 1000);
    
    return analysis;
  }
}

// Initialize detector
const detector = new ArtifactDetector();