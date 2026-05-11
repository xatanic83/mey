// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'duplicate_tab' && sender.tab) {
    // Duplicate the tab that sent the message
    chrome.tabs.duplicate(sender.tab.id);
  }
});
