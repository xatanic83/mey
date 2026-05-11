// Listen for Ctrl + D keydown event
window.addEventListener('keydown', (e) => {
  // Check if Ctrl is pressed and the key is 'd' (case-insensitive)
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
    // Prevent the default bookmark behavior
    e.preventDefault();
    e.stopPropagation();
    
    // Notify the background script to duplicate the current tab
    chrome.runtime.sendMessage({ action: 'duplicate_tab' });
  }
}, true); // Use capture phase to intercept before other handlers
