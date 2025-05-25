document.addEventListener('DOMContentLoaded', async () => {
  // Load current settings
  const settings = await chrome.storage.local.get(['isEnabled', 'projectPath', 'serverUrl']);
  
  document.getElementById('enableToggle').checked = settings.isEnabled || false;
  document.getElementById('projectPath').value = settings.projectPath || '';
  document.getElementById('serverUrl').value = settings.serverUrl || 'http://localhost:8765';
  
  // Show initial status
  updateStatus();
  
  // Enable toggle
  document.getElementById('enableToggle').addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    await chrome.storage.local.set({ isEnabled: enabled });
    
    // Try to send message to content script
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        showStatus('No active tab found', true);
        return;
      }
      
      if (tab.url && tab.url.includes('claude.ai')) {
        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'toggleMonitoring', enabled });
          showStatus(enabled ? 'Monitoring enabled' : 'Monitoring disabled', false);
        } catch (error) {
          // Content script not loaded yet
          showStatus('Settings saved. Refresh Claude.ai to apply', false);
        }
      } else {
        showStatus('Settings saved. Navigate to Claude.ai to start monitoring', false);
      }
    } catch (error) {
      console.error('Error in toggle:', error);
      showStatus('Settings saved', false);
    }
    
    updateStatus();
  });
  
  // Project path change
  document.getElementById('projectPath').addEventListener('change', async (e) => {
    const path = e.target.value.trim();
    if (!path) {
      showStatus('Please enter a project path', true);
      return;
    }
    
    await chrome.storage.local.set({ projectPath: path });
    
    // Try to update content script
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url && tab.url.includes('claude.ai')) {
        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'updateProjectPath', path });
          showStatus('Project path updated', false);
        } catch (error) {
          showStatus('Path saved. Refresh Claude.ai to apply', false);
        }
      } else {
        showStatus('Project path saved', false);
      }
    } catch (error) {
      console.error('Error updating path:', error);
      showStatus('Project path saved', false);
    }
  });
  
  // Server URL change
  document.getElementById('serverUrl').addEventListener('change', async (e) => {
    await chrome.storage.local.set({ serverUrl: e.target.value });
    showStatus('Server URL updated', false);
  });
  
  // Test connection
  document.getElementById('testServer').addEventListener('click', async () => {
    const serverUrl = document.getElementById('serverUrl').value;
    showStatus('Testing connection...', false);
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch(`${serverUrl}/api/health`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        showStatus(`Connected! Server v${data.version}`, false);
      } else {
        throw new Error('Server not responding');
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        showStatus('Connection timeout. Is the server running?', true);
      } else {
        showStatus('Failed to connect. Start server with: node server.js', true);
      }
      console.error('Connection error:', error);
    }
  });
  
  // Sync all button
  document.getElementById('syncAllBtn').addEventListener('click', async () => {
    const projectPath = document.getElementById('projectPath').value;
    if (!projectPath) {
      showStatus('Please set a project path first', true);
      return;
    }
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        showStatus('No active tab found', true);
        return;
      }
      
      if (!tab.url || !tab.url.includes('claude.ai')) {
        showStatus('Please navigate to a Claude.ai conversation first', true);
        return;
      }
      
      showStatus('Checking connection...', false);
      
      // Ensure content script is available
      const isConnected = await ensureContentScript(tab);
      
      if (!isConnected) {
        showStatus('Please refresh Claude.ai and try again', true);
        return;
      }
      
      showStatus('Checking server...', false);
      
      // Check server connection
      const serverAvailable = await checkServerConnection();
      
      if (!serverAvailable) {
        showStatus('Server not running. Start with: npm start', true);
        return;
      }
      
      try {
        showStatus('Syncing all artifacts...', false);
        await chrome.tabs.sendMessage(tab.id, { action: 'syncAll' });
      } catch (error) {
        showStatus('Communication error. Please refresh Claude.ai', true);
        console.error('Sync error:', error);
      }
    } catch (error) {
      console.error('Error in sync all:', error);
      showStatus('Error: Unable to sync', true);
    }
  });
  
  // Browse button
  document.getElementById('browseBtn').addEventListener('click', () => {
    const pathInput = document.getElementById('projectPath');
    pathInput.placeholder = 'e.g., C:\\Projects\\claude-outputs or D:\\MyCode';
    pathInput.focus();
    
    showStatus('Enter full path manually (e.g., D:\\MyProjects)', false);
  });
  
  // Test path button
  document.getElementById('testPath').addEventListener('click', async () => {
    const path = document.getElementById('projectPath').value.trim();
    if (!path) {
      showStatus('Please enter a project path', true);
      return;
    }
    
    showStatus('Path looks valid', false);
  });

  // Detect artifacts button
  document.getElementById('detectBtn').addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        showStatus('No active tab found', true);
        return;
      }
      
      if (!tab.url || !tab.url.includes('claude.ai')) {
        showStatus('Please navigate to a Claude.ai conversation first', true);
        return;
      }
      
      showStatus('Checking connection...', false);
      
      // Ensure content script is available
      const isConnected = await ensureContentScript(tab);
      
      if (!isConnected) {
        showStatus('Please refresh Claude.ai and try again', true);
        return;
      }
      
      try {
        showStatus('Detecting artifacts...', false);
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'detectArtifacts' });
        const count = response.artifacts ? response.artifacts.length : 0;
        showStatus(`Found ${count} artifacts`, false);
        
        // Update artifacts info
        const artifactsInfo = document.getElementById('artifactsInfo');
        if (artifactsInfo) {
          artifactsInfo.style.display = 'block';
          artifactsInfo.innerHTML = `<strong>${count}</strong> artifacts detected`;
        }
      } catch (error) {
        showStatus('Communication error. Please refresh Claude.ai', true);
        console.error('Detect error:', error);
      }
    } catch (error) {
      console.error('Error in detect:', error);
      showStatus('Error: Unable to detect artifacts', true);
    }
  });

  // Save all artifacts button
  document.getElementById('saveAllBtn').addEventListener('click', async () => {
    const projectPath = document.getElementById('projectPath').value;
    if (!projectPath) {
      showStatus('Please set a project path first', true);
      return;
    }
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        showStatus('No active tab found', true);
        return;
      }
      
      if (!tab.url || !tab.url.includes('claude.ai')) {
        showStatus('Please navigate to a Claude.ai conversation first', true);
        return;
      }
      
      showStatus('Checking connection...', false);
      
      // Ensure content script is available
      const isConnected = await ensureContentScript(tab);
      
      if (!isConnected) {
        showStatus('Please refresh Claude.ai and try again', true);
        return;
      }
      
      showStatus('Checking server...', false);
      
      // Check server connection
      const serverAvailable = await checkServerConnection();
      
      if (!serverAvailable) {
        showStatus('Server not running. Start with: npm start', true);
        return;
      }
      
      try {
        showStatus('Saving all artifacts...', false);
        await chrome.tabs.sendMessage(tab.id, { action: 'saveAll' });
      } catch (error) {
        showStatus('Communication error. Please refresh Claude.ai', true);
        console.error('Save error:', error);
      }
    } catch (error) {
      console.error('Error in save all:', error);
      showStatus('Error: Unable to save', true);
    }
  });
  
  // Debug button
  document.getElementById('debugBtn').addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        showStatus('No active tab found', true);
        return;
      }
      
      if (!tab.url || !tab.url.includes('claude.ai')) {
        showStatus('Please navigate to a Claude.ai conversation first', true);
        return;
      }
      
      showStatus('Checking connection...', false);
      
      // Ensure content script is available
      const isConnected = await ensureContentScript(tab);
      
      if (!isConnected) {
        showStatus('Please refresh Claude.ai and try again', true);
        return;
      }
      
      try {
        showStatus('Running debug analysis...', false);
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'debugDetection' });
        
        if (response && response.debugInfo) {
          const debugInfo = document.getElementById('debugInfo');
          debugInfo.style.display = 'block';
          debugInfo.innerHTML = `
            <strong>Debug Results:</strong><br>
            • URL: ${response.debugInfo.url}<br>
            • Page Elements: ${response.debugInfo.totalElements}<br>
            • Code Elements: ${response.debugInfo.codeElements}<br>
            • Pre Tags: ${response.debugInfo.preTags}<br>
            • Font-mono: ${response.debugInfo.fontMono}<br>
            • Artifacts Found: ${response.debugInfo.artifactsFound}<br>
            <small>Check browser console (F12) for detailed logs</small>
          `;
          showStatus('Debug complete - check console for details', false);
        }
      } catch (error) {
        showStatus('Communication error. Please refresh Claude.ai', true);
        console.error('Debug error:', error);
      }
    } catch (error) {
      console.error('Error in debug:', error);
      showStatus('Error: Unable to run debug', true);
    }
  });
  
  // Helper function to show status
  function showStatus(message, isError = false) {
    const statusDiv = document.getElementById('status');
    const statusText = document.getElementById('statusText');
    
    statusDiv.className = isError ? 'status error' : 'status';
    statusText.textContent = message;
    statusDiv.style.display = 'flex';
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 5000);
  }
  
  // Update status based on current settings
  async function updateStatus() {
    try {
      const settings = await chrome.storage.local.get(['isEnabled', 'projectPath']);
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        return; // No active tab, don't show status
      }
      
      const isOnClaude = tab.url && tab.url.includes('claude.ai');
      
      if (!settings.projectPath) {
        showStatus('Please set a project path', true);
      } else if (settings.isEnabled) {
        if (isOnClaude) {
          // Check if content script is responding
          try {
            const isConnected = await checkContentScriptConnection(tab);
            if (isConnected) {
              showStatus('Ready to sync artifacts', false);
            } else {
              showStatus('Refresh Claude.ai to start monitoring', false);
            }
          } catch (error) {
            showStatus('Refresh Claude.ai to start monitoring', false);
          }
        } else {
          showStatus('Navigate to claude.ai to start syncing', false);
        }
      } else {
        showStatus('Enable monitoring to start syncing', false);
      }
    } catch (error) {
      console.error('Error in updateStatus:', error);
      // Don't show error to user, just log it
    }
  }
  
  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'artifactSynced') {
      showStatus(`Synced: ${request.data.filename}`, false);
    } else if (request.action === 'syncError') {
      showStatus(`Error: ${request.error}`, true);
    } else if (request.action === 'syncComplete') {
      if (request.count === 0) {
        showStatus('No code artifacts found on this page', true);
      } else {
        showStatus(`Sync complete! ${request.count} artifacts processed`, false);
      }
    }
  });
  
  // Check server connection on load
  setTimeout(async () => {
    const serverUrl = document.getElementById('serverUrl').value;
    try {
      const response = await fetch(`${serverUrl}/api/health`);
      if (!response.ok) {
        showStatus('Server not running. Start with: node server.js', true);
      }
    } catch (error) {
      // Server not running, show hint
      showStatus('Server not running. Start with: node server.js', true);
    }
  }, 1000);

  // Helper function to check if content script is available
  async function checkContentScriptConnection(tab) {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
      return true;
    } catch (error) {
      console.log('[Popup] Content script not responding:', error.message);
      return false;
    }
  }

  // Helper function to inject content script if needed
  async function ensureContentScript(tab) {
    try {
      // Try to ping the content script
      const isConnected = await checkContentScriptConnection(tab);
      
      if (!isConnected) {
        console.log('[Popup] Content script not found, attempting to inject...');
        
        // Try to inject the content script
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        
        // Wait a bit for it to initialize
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check again
        return await checkContentScriptConnection(tab);
      }
      
      return true;
    } catch (error) {
      console.error('[Popup] Error ensuring content script:', error);
      return false;
    }
  }

  // Helper function to check server connection
  async function checkServerConnection() {
    try {
      const serverUrl = document.getElementById('serverUrl').value;
      const response = await fetch(`${serverUrl}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000) // 3 second timeout
      });
      
      if (response.ok) {
        return true;
      } else {
        return false;
      }
    } catch (error) {
      console.log('[Popup] Server not reachable:', error.message);
      return false;
    }
  }
});