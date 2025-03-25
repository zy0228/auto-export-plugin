// Background script for future functionality
chrome.runtime.onInstalled.addListener(() => {
  // Initialize extension settings
  chrome.storage.local.set({ spaceRemovalEnabled: false });
}); 