console.log('Claude Artifact Sync v2 - Background service started');

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    isEnabled: false,
    projectPath: '',
    serverUrl: 'http://localhost:8765'
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received:', request.action);
  
  if (request.action === 'artifactSynced') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon48.png',
      title: 'Artifact Saved',
      message: `Saved: ${request.data.filename}`
    });
  }
  
  return true;
});
