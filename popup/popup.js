/**
 * Popup Script for YouTube Watch History Keyword Cleaner
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const tabStatusEl = document.getElementById('tab-status');
  const tabStatusTextEl = document.getElementById('tab-status-text');
  const btnOpenHistory = document.getElementById('btn-open-history');

  const keywordInput = document.getElementById('keyword-input');
  const btnClearInput = document.getElementById('btn-clear-input');
  const optMatchChannel = document.getElementById('opt-match-channel');
  const optSpeed = document.getElementById('opt-speed');
  const optNoMatchPages = document.getElementById('opt-no-match-pages');
  const optCleanChromeHistory = document.getElementById('opt-clean-chrome-history');

  const btnStart = document.getElementById('btn-start');
  const btnFilterYt = document.getElementById('btn-filter-yt');
  const btnRunningGroup = document.getElementById('btn-running-group');
  const btnPause = document.getElementById('btn-pause');
  const btnStop = document.getElementById('btn-stop');
  const btnCleanChromeOnly = document.getElementById('btn-clean-chrome-only');

  const statScanned = document.getElementById('stat-scanned');
  const statMatched = document.getElementById('stat-matched');
  const statDeleted = document.getElementById('stat-deleted');
  const trackerMsg = document.getElementById('tracker-msg');

  let activeTabId = null;
  let isOnHistoryPage = false;
  let currentState = 'IDLE';

  // Load saved preferences
  chrome.storage.local.get(
    ['keyword', 'matchChannel', 'cleanChromeHistory', 'delaySpeed', 'maxNoMatchPages'],
    (data) => {
      if (data.keyword !== undefined) keywordInput.value = data.keyword;
      if (data.matchChannel !== undefined) {
        optMatchChannel.checked = data.matchChannel;
      } else {
        optMatchChannel.checked = true;
      }
      if (data.cleanChromeHistory !== undefined) optCleanChromeHistory.checked = data.cleanChromeHistory;
      if (data.delaySpeed !== undefined) optSpeed.value = data.delaySpeed;
      if (data.maxNoMatchPages !== undefined && optNoMatchPages) optNoMatchPages.value = data.maxNoMatchPages;
    }
  );

  // Check current active tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) return;
    const tab = tabs[0];
    activeTabId = tab.id;
    const url = tab.url || '';

    if (url.includes('youtube.com/feed/history')) {
      isOnHistoryPage = true;
      tabStatusEl.className = 'tab-status banner-success';
      tabStatusTextEl.textContent = 'Connected to YouTube History';
      btnOpenHistory.style.display = 'none';

      // Request status from content script
      chrome.tabs.sendMessage(activeTabId, { action: 'GET_STATUS' }, (res) => {
        if (chrome.runtime.lastError || !res) {
          // Content script not yet injected or reloading
          trackerMsg.textContent = 'Ready to clean history';
          return;
        }
        applyState(res);
      });
    } else {
      isOnHistoryPage = false;
      tabStatusEl.className = 'tab-status banner-warning';
      tabStatusTextEl.textContent = 'Not on YouTube History';
      btnOpenHistory.style.display = 'inline-block';
      trackerMsg.textContent = 'Click "Open History" to go to your watch history page';
    }
  });

  // Save settings on change
  function saveSettings() {
    chrome.storage.local.set({
      keyword: keywordInput.value.trim(),
      matchChannel: optMatchChannel.checked,
      cleanChromeHistory: optCleanChromeHistory.checked,
      delaySpeed: optSpeed.value,
      maxNoMatchPages: optNoMatchPages ? optNoMatchPages.value : '5'
    });
  }

  keywordInput.addEventListener('input', saveSettings);
  optMatchChannel.addEventListener('change', saveSettings);
  optCleanChromeHistory.addEventListener('change', saveSettings);
  optSpeed.addEventListener('change', saveSettings);
  if (optNoMatchPages) optNoMatchPages.addEventListener('change', saveSettings);

  btnClearInput.addEventListener('click', () => {
    keywordInput.value = '';
    keywordInput.focus();
    saveSettings();
  });

  // Open YouTube History button
  btnOpenHistory.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'OPEN_YOUTUBE_HISTORY' }, () => {
      window.close();
    });
  });

  // Filter on YouTube button
  if (btnFilterYt) {
    btnFilterYt.addEventListener('click', () => {
      const keyword = keywordInput.value.trim();
      if (!keyword) {
        alert('Please enter a keyword to filter');
        return;
      }
      saveSettings();

      if (!isOnHistoryPage) {
        chrome.runtime.sendMessage({ action: 'OPEN_YOUTUBE_HISTORY' }, () => {
          window.close();
        });
        return;
      }

      chrome.tabs.sendMessage(activeTabId, { action: 'FILTER_ON_YOUTUBE', keyword: keyword });
      trackerMsg.textContent = `Applied filter "${keyword}" on YouTube history page.`;
    });
  }

  // Start Cleaning button
  btnStart.addEventListener('click', () => {
    const keyword = keywordInput.value.trim();
    if (!keyword) {
      alert('Please enter at least one keyword (e.g. Cocomelon)');
      keywordInput.focus();
      return;
    }

    saveSettings();

    // If not on history tab, prompt to open it
    if (!isOnHistoryPage) {
      chrome.runtime.sendMessage({ action: 'OPEN_YOUTUBE_HISTORY' }, () => {
        window.close();
      });
      return;
    }

    // Trigger Chrome history cleaning in background if option is checked
    if (optCleanChromeHistory.checked) {
      cleanChromeHistory(keyword);
    }

    // Start content script cleaning on YouTube page
    chrome.tabs.sendMessage(
      activeTabId,
      {
        action: 'START_CLEANING',
        keyword: keyword,
        matchChannel: optMatchChannel.checked,
        delaySpeed: optSpeed.value,
        maxNoMatchPages: optNoMatchPages ? optNoMatchPages.value : 5
      },
      (res) => {
        if (chrome.runtime.lastError) {
          trackerMsg.textContent = 'Error communicating with page. Please refresh YouTube.';
          return;
        }
        currentState = 'RUNNING';
        updateControlsUI();
      }
    );
  });

  // Pause button
  btnPause.addEventListener('click', () => {
    if (currentState === 'RUNNING') {
      chrome.tabs.sendMessage(activeTabId, { action: 'PAUSE_CLEANING' }, () => {
        currentState = 'PAUSED';
        updateControlsUI();
      });
    } else if (currentState === 'PAUSED') {
      chrome.tabs.sendMessage(activeTabId, { action: 'RESUME_CLEANING' }, () => {
        currentState = 'RUNNING';
        updateControlsUI();
      });
    }
  });

  // Stop button
  btnStop.addEventListener('click', () => {
    chrome.tabs.sendMessage(activeTabId, { action: 'STOP_CLEANING' }, () => {
      currentState = 'STOPPED';
      updateControlsUI();
    });
  });

  // Clean Chrome Browser History Only
  btnCleanChromeOnly.addEventListener('click', () => {
    const keyword = keywordInput.value.trim();
    if (!keyword) {
      alert('Please enter a keyword');
      return;
    }

    saveSettings();
    trackerMsg.textContent = 'Searching and cleaning Chrome browser history...';
    btnCleanChromeOnly.disabled = true;

    cleanChromeHistory(keyword, (res) => {
      btnCleanChromeOnly.disabled = false;
      if (res && res.success) {
        trackerMsg.textContent = `Cleaned ${res.deleted} YouTube item(s) from Chrome history.`;
        statDeleted.textContent = res.deleted;
        statMatched.textContent = res.matched;
        statScanned.textContent = res.scanned;
      } else {
        trackerMsg.textContent = 'Failed to clean Chrome history.';
      }
    });
  });

  function cleanChromeHistory(keyword, callback) {
    chrome.runtime.sendMessage(
      { action: 'CLEAN_CHROME_HISTORY', keyword: keyword },
      (res) => {
        if (callback) callback(res);
      }
    );
  }

  // Listen to status updates from content script
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'STATUS_UPDATE') {
      applyState(request);
    }
  });

  function applyState(data) {
    if (!data) return;
    currentState = data.state || 'IDLE';

    if (data.scanned !== undefined) statScanned.textContent = data.scanned;
    if (data.matched !== undefined) statMatched.textContent = data.matched;
    if (data.deleted !== undefined) statDeleted.textContent = data.deleted;
    if (data.statusMessage) trackerMsg.textContent = data.statusMessage;

    updateControlsUI();
  }

  function updateControlsUI() {
    if (currentState === 'RUNNING') {
      btnStart.style.display = 'none';
      btnRunningGroup.style.display = 'flex';
      btnPause.textContent = 'Pause';
      btnPause.className = 'btn btn-secondary';
      keywordInput.disabled = true;
    } else if (currentState === 'PAUSED') {
      btnStart.style.display = 'none';
      btnRunningGroup.style.display = 'flex';
      btnPause.textContent = 'Resume';
      btnPause.className = 'btn btn-primary';
      keywordInput.disabled = true;
    } else {
      btnStart.style.display = 'flex';
      btnRunningGroup.style.display = 'none';
      btnStart.textContent = currentState === 'COMPLETED' ? 'Clean Again' : 'Start Cleaning';
      keywordInput.disabled = false;
    }
  }
});
