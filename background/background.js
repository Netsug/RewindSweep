// Background service worker for RewindSweep - YouTube History Cleaner

chrome.runtime.onInstalled.addListener(() => {
  // Set default settings if not already initialized
  chrome.storage.local.get(['keyword', 'matchChannel', 'cleanChromeHistory', 'delaySpeed', 'maxNoMatchPages'], (data) => {
    const defaults = {
      keyword: data.keyword || 'Cocomelon',
      matchChannel: data.matchChannel ?? true, // Default to true: also remove if in channel name
      cleanChromeHistory: data.cleanChromeHistory ?? false,
      delaySpeed: data.delaySpeed || 'normal', // fast: 400ms, normal: 800ms, careful: 1500ms
      maxNoMatchPages: data.maxNoMatchPages || 5
    };
    chrome.storage.local.set(defaults);
  });
});

// Handle incoming messages from popup or content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'OPEN_YOUTUBE_HISTORY') {
    handleOpenYouTubeHistory(sendResponse);
    return true; // Keep message channel open for async response
  }

  if (request.action === 'CLEAN_CHROME_HISTORY') {
    handleCleanChromeHistory(request, sendResponse);
    return true; // Keep message channel open for async response
  }

  if (request.action === 'UPDATE_BADGE') {
    const count = request.count;
    if (count > 0) {
      chrome.action.setBadgeText({ text: String(count) });
      chrome.action.setBadgeBackgroundColor({ color: '#CC0000' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
    sendResponse({ success: true });
    return false;
  }
});

/**
 * Switch to an existing YouTube history tab or open a new one.
 */
function handleOpenYouTubeHistory(sendResponse) {
  chrome.tabs.query({ url: '*://*.youtube.com/feed/history*' }, (tabs) => {
    if (tabs && tabs.length > 0) {
      const existingTab = tabs[0];
      chrome.tabs.update(existingTab.id, { active: true }, (tab) => {
        if (tab && tab.windowId) {
          chrome.windows.update(tab.windowId, { focused: true });
        }
        sendResponse({ success: true, tabId: existingTab.id, existed: true });
      });
    } else {
      chrome.tabs.create({ url: 'https://www.youtube.com/feed/history' }, (newTab) => {
        sendResponse({ success: true, tabId: newTab.id, existed: false });
      });
    }
  });
}

/**
 * Searches local Chrome browser history for YouTube watch URLs matching keywords,
 * and deletes them using the chrome.history API.
 */
function handleCleanChromeHistory(request, sendResponse) {
  const keywords = (request.keyword || '')
    .split(',')
    .map(k => k.trim().toLowerCase())
    .filter(k => k.length > 0);

  if (keywords.length === 0) {
    sendResponse({ success: false, error: 'No keywords provided' });
    return;
  }

  // Search Chrome history for YouTube watch entries
  chrome.history.search(
    {
      text: 'youtube.com/watch',
      startTime: 0,
      maxResults: 10000
    },
    async (results) => {
      let matchedCount = 0;
      let deletedCount = 0;
      const deletedTitles = [];

      for (const item of results) {
        if (!item.url || !item.url.includes('youtube.com/watch')) {
          continue;
        }

        const titleLower = (item.title || '').toLowerCase();
        const urlLower = item.url.toLowerCase();

        // Check if any keyword matches the title or URL parameters
        const isMatch = keywords.some(k => titleLower.includes(k) || urlLower.includes(k));

        if (isMatch) {
          matchedCount++;
          try {
            await chrome.history.deleteUrl({ url: item.url });
            deletedCount++;
            if (deletedTitles.length < 50) {
              deletedTitles.push(item.title || item.url);
            }
          } catch (err) {
            console.error('Error deleting URL from history:', item.url, err);
          }
        }
      }

      sendResponse({
        success: true,
        scanned: results.length,
        matched: matchedCount,
        deleted: deletedCount,
        deletedTitles: deletedTitles
      });
    }
  );
}
