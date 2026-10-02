/**
 * YouTube Watch History Keyword Cleaner
 * Content Script running on YouTube
 */

(function () {
  'use strict';

  // Prevent multiple injections
  if (window.__YTHC_INJECTED__) return;
  window.__YTHC_INJECTED__ = true;

  const LOG_PREFIX = '[YTHC History Cleaner]';

  // Execution state
  const STATE = {
    IDLE: 'IDLE',
    RUNNING: 'RUNNING',
    PAUSED: 'PAUSED',
    STOPPED: 'STOPPED',
    COMPLETED: 'COMPLETED'
  };

  let currentState = STATE.IDLE;
  let currentKeyword = '';
  let matchChannel = true; // Default to true: also remove videos if keyword is in channel name
  let delaySpeed = 'normal'; // fast: 400ms, normal: 800ms, careful: 1500ms
  let maxNoMatchPages = 5; // Stop if no matches found for 5 consecutive scroll pages

  let scannedCount = 0;
  let matchedCount = 0;
  let deletedCount = 0;
  let currentTitle = '';
  let statusMessage = 'Ready to clean history';

  const processedCards = new Set();
  let stopRequested = false;

  const DELAY_MAP = {
    fast: 400,
    normal: 800,
    careful: 1500
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Initialize preferences from chrome.storage
  chrome.storage.local.get(
    ['keyword', 'matchChannel', 'delaySpeed', 'maxNoMatchPages'],
    (data) => {
      if (data.keyword) currentKeyword = data.keyword;
      if (typeof data.matchChannel === 'boolean') {
        matchChannel = data.matchChannel;
      } else {
        matchChannel = true;
      }
      if (data.delaySpeed) delaySpeed = data.delaySpeed;
      if (data.maxNoMatchPages !== undefined) maxNoMatchPages = parseInt(data.maxNoMatchPages, 10);
      updateWidgetUI();
    }
  );

  /**
   * Check if current page is YouTube watch history
   */
  function isHistoryPage() {
    return window.location.pathname.startsWith('/feed/history');
  }

  /**
   * Monitor YouTube SPA page navigations
   */
  function setupNavigationWatchers() {
    const handleRouteChange = () => {
      if (isHistoryPage()) {
        ensureWidget();
      } else {
        removeWidget();
        if (currentState === STATE.RUNNING) {
          stopCleaning();
        }
      }
    };

    window.addEventListener('yt-navigate-finish', handleRouteChange);
    window.addEventListener('popstate', handleRouteChange);

    // Initial check and interval fallback for SPA changes
    handleRouteChange();
    setInterval(() => {
      const widgetExists = !!document.getElementById('ythc-floating-widget');
      if (isHistoryPage() && !widgetExists) {
        ensureWidget();
      }
    }, 1500);
  }

  /**
   * Create and inject the on-page floating control widget
   */
  function ensureWidget() {
    if (!isHistoryPage()) return;
    if (document.getElementById('ythc-floating-widget')) return;

    const widget = document.createElement('div');
    widget.id = 'ythc-floating-widget';
    widget.innerHTML = `
      <div class="ythc-header" id="ythc-drag-header">
        <div class="ythc-header-left">
          <span class="ythc-logo-dot" id="ythc-pulse-dot"></span>
          <span>History Cleaner</span>
        </div>
        <div class="ythc-header-actions">
          <button class="ythc-icon-btn" id="ythc-filter-btn" title="Filter History on YouTube using native search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
          </button>
          <button class="ythc-icon-btn" id="ythc-min-btn" title="Minimize / Expand">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13H5v-2h14v2z"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="ythc-body">
        <div class="ythc-input-group">
          <label class="ythc-label">Keyword to Remove</label>
          <input type="text" id="ythc-input-keyword" class="ythc-input" placeholder="Cocomelon" value="${escapeHtml(currentKeyword)}">
        </div>
        <div class="ythc-stats-grid">
          <div class="ythc-stat-box">
            <div class="ythc-stat-val" id="ythc-stat-scanned">0</div>
            <div class="ythc-stat-label">SCANNED</div>
          </div>
          <div class="ythc-stat-box">
            <div class="ythc-stat-val" id="ythc-stat-matched">0</div>
            <div class="ythc-stat-label">MATCHED</div>
          </div>
          <div class="ythc-stat-box">
            <div class="ythc-stat-val deleted" id="ythc-stat-deleted">0</div>
            <div class="ythc-stat-label">DELETED</div>
          </div>
        </div>
        <div class="ythc-status-bar" id="ythc-status-msg">Ready to clean history</div>
        <div class="ythc-controls">
          <button class="ythc-btn ythc-btn-primary" id="ythc-start-btn">Start Cleaning</button>
          <button class="ythc-btn ythc-btn-secondary" id="ythc-pause-btn" style="display: none;">Pause</button>
          <button class="ythc-btn ythc-btn-danger" id="ythc-stop-btn" style="display: none;">Stop</button>
        </div>
      </div>
    `;

    document.body.appendChild(widget);

    // Event listeners
    const minBtn = widget.querySelector('#ythc-min-btn');
    minBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      widget.classList.toggle('ythc-minimized');
    });

    const filterBtn = widget.querySelector('#ythc-filter-btn');
    filterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerNativeHistorySearch(currentKeyword);
    });

    const kwInput = widget.querySelector('#ythc-input-keyword');
    kwInput.addEventListener('input', (e) => {
      currentKeyword = e.target.value;
      chrome.storage.local.set({ keyword: currentKeyword });
      broadcastStatus();
    });

    const startBtn = widget.querySelector('#ythc-start-btn');
    startBtn.addEventListener('click', () => {
      startCleaning();
    });

    const pauseBtn = widget.querySelector('#ythc-pause-btn');
    pauseBtn.addEventListener('click', () => {
      if (currentState === STATE.RUNNING) {
        pauseCleaning();
      } else if (currentState === STATE.PAUSED) {
        resumeCleaning();
      }
    });

    const stopBtn = widget.querySelector('#ythc-stop-btn');
    stopBtn.addEventListener('click', () => {
      stopCleaning();
    });

    updateWidgetUI();
  }

  function removeWidget() {
    const widget = document.getElementById('ythc-floating-widget');
    if (widget) widget.remove();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[c]));
  }

  /**
   * Update the widget UI components based on current state & metrics
   */
  function updateWidgetUI() {
    const widget = document.getElementById('ythc-floating-widget');
    if (!widget) return;

    const scannedEl = widget.querySelector('#ythc-stat-scanned');
    const matchedEl = widget.querySelector('#ythc-stat-matched');
    const deletedEl = widget.querySelector('#ythc-stat-deleted');
    const statusEl = widget.querySelector('#ythc-status-msg');
    const dotEl = widget.querySelector('#ythc-pulse-dot');
    const startBtn = widget.querySelector('#ythc-start-btn');
    const pauseBtn = widget.querySelector('#ythc-pause-btn');
    const stopBtn = widget.querySelector('#ythc-stop-btn');
    const kwInput = widget.querySelector('#ythc-input-keyword');

    if (scannedEl) scannedEl.textContent = scannedCount;
    if (matchedEl) matchedEl.textContent = matchedCount;
    if (deletedEl) deletedEl.textContent = deletedCount;
    if (statusEl) {
      statusEl.textContent = statusMessage;
      statusEl.className = 'ythc-status-bar' + 
        (currentState === STATE.RUNNING ? ' active' : '') +
        (currentState === STATE.COMPLETED ? ' completed' : '');
    }

    if (kwInput && document.activeElement !== kwInput) {
      kwInput.value = currentKeyword;
    }

    if (dotEl) {
      if (currentState === STATE.RUNNING) {
        dotEl.classList.add('ythc-pulse');
      } else {
        dotEl.classList.remove('ythc-pulse');
      }
    }

    if (startBtn && pauseBtn && stopBtn) {
      if (currentState === STATE.RUNNING) {
        startBtn.style.display = 'none';
        pauseBtn.style.display = 'flex';
        pauseBtn.textContent = 'Pause';
        stopBtn.style.display = 'flex';
        if (kwInput) kwInput.disabled = true;
      } else if (currentState === STATE.PAUSED) {
        startBtn.style.display = 'none';
        pauseBtn.style.display = 'flex';
        pauseBtn.textContent = 'Resume';
        stopBtn.style.display = 'flex';
        if (kwInput) kwInput.disabled = true;
      } else {
        startBtn.style.display = 'flex';
        startBtn.textContent = currentState === STATE.COMPLETED ? 'Clean Again' : 'Start Cleaning';
        pauseBtn.style.display = 'none';
        stopBtn.style.display = 'none';
        if (kwInput) kwInput.disabled = false;
      }
    }
  }

  /**
   * Broadcast current status to popup and background
   */
  function broadcastStatus() {
    updateWidgetUI();
    try {
      chrome.runtime.sendMessage({
        action: 'STATUS_UPDATE',
        state: currentState,
        keyword: currentKeyword,
        scanned: scannedCount,
        matched: matchedCount,
        deleted: deletedCount,
        currentTitle: currentTitle,
        statusMessage: statusMessage
      });
    } catch (_) {
      // Popup might be closed, ignore
    }
  }

  /**
   * Extract keywords as lowercased array
   */
  function getKeywordList() {
    return (currentKeyword || '')
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k.length > 0);
  }

  /**
   * Trigger YouTube's native watch history search input
   */
  function triggerNativeHistorySearch(term) {
    if (!term) return;
    const searchInputs = document.querySelectorAll(
      'input[placeholder*="history" i], input[placeholder*="historik" i], input[aria-label*="history" i], #search-input input, ytd-searchbox input#search, input#search'
    );
    for (const input of searchInputs) {
      // Avoid the main top navigation searchbar if a history-specific one is present
      if (!input.closest('#masthead, ytd-masthead')) {
        input.focus();
        input.value = term;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        console.log(LOG_PREFIX, 'Triggered native history search with:', term);
        return;
      }
    }
  }

  /**
   * Query all video card elements across both modern and legacy YouTube DOM
   */
  function getAllVideoCards() {
    const selectors = [
      'yt-lockup-view-model',
      'ytd-video-renderer',
      'ytd-reel-item-renderer',
      'ytd-playlist-video-renderer',
      'ytd-compact-video-renderer',
      'ytd-rich-item-renderer'
    ];

    let cards = Array.from(document.querySelectorAll(selectors.join(', ')));

    // Fallback: If YouTube is using a new wrapper, locate cards via watch/shorts links
    if (cards.length === 0) {
      const mainFeed = document.querySelector('ytd-page-manager, #primary, #contents') || document.body;
      const links = Array.from(mainFeed.querySelectorAll('a[href*="watch?v="], a[href*="/shorts/"]'));
      const seen = new Set();
      for (const link of links) {
        if (link.closest('#masthead, #guide, ytd-mini-guide-renderer, #miniplayer, #ythc-floating-widget')) continue;
        const card = link.closest(
          'yt-lockup-view-model, ytd-video-renderer, ytd-reel-item-renderer, ytd-rich-item-renderer, [role="listitem"]'
        ) || link.parentElement;
        if (card && !seen.has(card)) {
          seen.add(card);
          cards.push(card);
        }
      }
    }

    // Exclude elements outside history feed (masthead, sidebar, floating widget)
    return cards.filter((card) => {
      return !card.closest('#masthead, #guide, ytd-mini-guide-renderer, #miniplayer, #ythc-floating-widget');
    });
  }

  /**
   * Helper to retrieve all elements matching a selector inside an element AND any open shadow roots
   */
  function findInCardAndShadows(card, selector) {
    const list = [];
    if (!card) return list;
    try {
      list.push(...card.querySelectorAll(selector));
    } catch (_) {}

    if (card.shadowRoot) {
      try {
        list.push(...card.shadowRoot.querySelectorAll(selector));
      } catch (_) {}
    }

    const allChildren = card.querySelectorAll('*');
    for (const child of allChildren) {
      if (child.shadowRoot) {
        try {
          list.push(...child.shadowRoot.querySelectorAll(selector));
        } catch (_) {}
      }
    }
    return list;
  }

  /**
   * Extract all visible and shadow-root text from an element
   */
  function getAllCardText(card) {
    if (!card) return '';
    let text = card.innerText || card.textContent || '';
    if (card.shadowRoot) {
      text += ' ' + (card.shadowRoot.textContent || card.shadowRoot.innerText || '');
    }
    const allChildren = card.querySelectorAll('*');
    for (const child of allChildren) {
      if (child.shadowRoot) {
        text += ' ' + (child.shadowRoot.textContent || child.shadowRoot.innerText || '');
      }
    }
    return text.replace(/\s+/g, ' ').trim();
  }

  /**
   * Extract all HTML from element including shadow roots
   */
  function getAllCardHtml(card) {
    if (!card) return '';
    let html = card.innerHTML || '';
    if (card.shadowRoot) {
      html += ' ' + (card.shadowRoot.innerHTML || '');
    }
    const allChildren = card.querySelectorAll('*');
    for (const child of allChildren) {
      if (child.shadowRoot) {
        html += ' ' + (child.shadowRoot.innerHTML || '');
      }
    }
    return html;
  }

  /**
   * Extract video details (title, channel, id, and all content text) from any card type
   */
  function getVideoDetails(card) {
    let title = '';

    // Title selectors (piercing light DOM and shadow roots)
    const titleSelectors = [
      '.yt-lockup-metadata-view-model__title',
      '#video-title',
      'h3 a',
      'h3',
      'a#video-title',
      'yt-formatted-string#video-title',
      '[role="heading"] a',
      '[role="heading"]',
      'a[href*="watch?v="][title]',
      'a[href*="/shorts/"][title]'
    ];

    for (const sel of titleSelectors) {
      const els = findInCardAndShadows(card, sel);
      for (const el of els) {
        const text = (el.getAttribute('title') || el.getAttribute('aria-label') || el.textContent || '').trim();
        if (text) {
          title = text;
          break;
        }
      }
      if (title) break;
    }

    // Fallback title from video links
    if (!title) {
      const anchors = findInCardAndShadows(card, 'a[href*="watch?v="], a[href*="/shorts/"]');
      for (const a of anchors) {
        const text = (a.getAttribute('title') || a.getAttribute('aria-label') || a.textContent || '').trim();
        if (text && text.length > 2) {
          title = text;
          break;
        }
      }
    }

    if (!title) {
      const cardAria = card.getAttribute('aria-label');
      if (cardAria) title = cardAria.trim();
    }

    title = title.replace(/\s+/g, ' ').trim();

    // Channel name & handle/URL extraction (piercing light DOM and shadow roots)
    let channel = '';
    let channelUrl = '';

    const channelLinks = findInCardAndShadows(
      card,
      'a[href^="/@"], a[href*="/channel/"], a[href*="/c/"], a[href*="/user/"], .yt-lockup-metadata-view-model__byline a, #channel-name a, .ytd-channel-name a, #byline a'
    );

    for (const link of channelLinks) {
      const text = (link.textContent || link.getAttribute('title') || link.getAttribute('aria-label') || '').trim();
      const href = link.getAttribute('href') || '';
      if (text) channel = text;
      if (href) channelUrl = href;
      if (channel) break;
    }

    // Fallback channel selectors
    if (!channel) {
      const channelSelectors = [
        '.yt-lockup-metadata-view-model__byline',
        '#channel-name',
        '.ytd-channel-name',
        '#byline',
        '.yt-content-metadata-view-model-wiz a',
        '.yt-content-metadata-view-model-wiz'
      ];

      for (const sel of channelSelectors) {
        const els = findInCardAndShadows(card, sel);
        for (const el of els) {
          const text = (el.textContent || '').trim();
          if (text) {
            channel = text;
            break;
          }
        }
        if (channel) break;
      }
    }

    // Capture complete card text & markup across light and shadow DOMs
    const allText = getAllCardText(card);
    const allHtml = getAllCardHtml(card);

    // Unique Video ID or URL key
    let id = '';
    const watchAnchors = findInCardAndShadows(card, 'a[href*="watch?v="], a[href*="/shorts/"]');
    const linkEl = watchAnchors.length > 0 ? watchAnchors[0] : null;
    if (linkEl && linkEl.href) {
      try {
        const u = new URL(linkEl.href, window.location.origin);
        id = u.searchParams.get('v') || (u.pathname.includes('/shorts/') ? u.pathname : linkEl.href);
      } catch (_) {
        id = linkEl.href;
      }
    }
    if (!id) {
      id = title ? `${title}_${channel}` : `card_${Math.random().toString(36).slice(2)}`;
    }

    return { title, channel, channelUrl, allText, allHtml, id };
  }

  /**
   * Check if a video matches any of the active keywords (in title, channel name, handle, or card content)
   */
  function isMatch(details, keywords) {
    if (keywords.length === 0) return false;
    const tLower = (details.title || '').toLowerCase();
    const cLower = (details.channel || '').toLowerCase();
    const uLower = (details.channelUrl || '').toLowerCase();
    const textLower = (details.allText || '').toLowerCase();
    const htmlLower = (details.allHtml || '').toLowerCase();

    for (const kw of keywords) {
      // 1. Keyword found in video title
      if (tLower.includes(kw)) return true;
      // 2. Keyword found in channel display name
      if (cLower.includes(kw)) return true;
      // 3. Keyword found in channel handle / URL (e.g. /@channel_name)
      if (uLower.includes(kw)) return true;
      // 4. Keyword found anywhere in card text (including shadow DOM bylines)
      if (textLower.includes(kw)) return true;
      // 5. Keyword found anywhere in card HTML markup
      if (htmlLower.includes(kw)) return true;
    }
    return false;
  }

  /**
   * Attempt to find and click the remove/dismiss button on any video card
   */
  async function removeVideoCard(card) {
    // Add visual outline to highlight target
    card.classList.add('ythc-highlight-delete');

    // Trigger hover events to reveal conditionally rendered buttons
    card.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true }));
    card.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
    await sleep(200);

    // Strategy 1: Direct dismiss / remove button selectors on the card (piercing shadow roots)
    const directSelectors = [
      '#dismiss-button button',
      'button#dismiss-button',
      'yt-icon-button#dismiss-button button',
      'yt-icon-button#dismiss-button',
      '#dismiss-button',
      'button[aria-label*="Remove from watch history" i]',
      'button[aria-label*="Remove from" i]',
      'button[aria-label*="Ta bort från visningshistoriken" i]',
      'button[aria-label*="Ta bort från" i]',
      'button[aria-label*="remove" i]',
      'button[aria-label*="ta bort" i]',
      'button[aria-label*="delete" i]'
    ];

    const directButtons = findInCardAndShadows(card, directSelectors.join(', '));
    let btn = directButtons.length > 0 ? directButtons[0] : null;

    // Strategy 2: Check all buttons inside card for explicit removal aria-labels or close SVG icon
    if (!btn) {
      const allButtons = findInCardAndShadows(card, 'button, yt-icon-button, yt-button-shape');
      for (const b of allButtons) {
        // Never click navigation links or links with href
        if (b.tagName === 'A' || b.closest('a[href*="/feed/"]')) continue;

        const label = (b.getAttribute('aria-label') || '').toLowerCase();
        // Must contain an actual removal verb
        if (
          label.includes('remove') ||
          label.includes('ta bort') ||
          label.includes('delete')
        ) {
          btn = b;
          break;
        }

        const svg = b.querySelector('svg');
        if (svg) {
          const path = svg.querySelector('path')?.getAttribute('d') || '';
          // Standard close 'X' paths across Material Design & YouTube
          if (
            path.includes('19 6.41') ||
            path.includes('12.7 12') ||
            path.includes('18.3 5.71') ||
            path.includes('19,6.41') ||
            path.includes('12 10.59') ||
            path.includes('13.41 12') ||
            path.includes('M19 6.41L17.59 5') ||
            path.includes('M12 10.59L6.41 5')
          ) {
            btn = b;
            break;
          }
        }
      }
    }

    if (btn) {
      console.log(LOG_PREFIX, 'Clicking direct remove button:', btn);
      const clickTarget = btn.querySelector('button') || btn;
      clickTarget.click();
      await checkConfirmationDialog();
      return true;
    }

    // Strategy 3: 3-dots action menu fallback
    console.log(LOG_PREFIX, 'Direct button not found, checking 3-dots menu on card...');
    const menuSelectors = [
      '.yt-lockup-metadata-view-model__menu-button button',
      'button.yt-lockup-metadata-view-model__menu-button',
      'ytd-menu-renderer yt-icon-button button',
      'ytd-menu-renderer button',
      'button[aria-label*="Action" i]',
      'button[aria-label*="Handling" i]',
      'button[aria-label*="Menu" i]',
      'button[aria-label*="Fler" i]',
      'button[aria-label*="More" i]'
    ];

    const menuButtons = findInCardAndShadows(card, menuSelectors.join(', '));
    let menuBtn = menuButtons.length > 0 ? menuButtons[0] : null;

    // If still not found, search for button containing 3-dots SVG inside the card
    if (!menuBtn) {
      const allButtons = findInCardAndShadows(card, 'button, yt-icon-button');
      for (const b of allButtons) {
        const svg = b.querySelector('svg');
        if (svg) {
          const path = svg.querySelector('path')?.getAttribute('d') || '';
          if (
            path.includes('M12 8c1.1') ||
            path.includes('M12 8') ||
            path.includes('M12 5') ||
            path.includes('M12 7')
          ) {
            menuBtn = b;
            break;
          }
        }
      }
    }

    if (menuBtn) {
      console.log(LOG_PREFIX, 'Clicking 3-dots menu button:', menuBtn);
      const clickMenu = menuBtn.querySelector('button') || menuBtn;
      clickMenu.click();
      await sleep(350);

      // STRICTLY query popup menu items ONLY inside ytd-popup-container
      // Do NOT query general document to prevent clicking sidebar or navigation links!
      const popup = document.querySelector(
        'ytd-popup-container tp-yt-iron-dropdown:not([aria-hidden="true"]), ytd-popup-container ytd-menu-popup-renderer, ytd-popup-container'
      );

      if (popup) {
        const menuItems = popup.querySelectorAll(
          'ytd-menu-service-item-renderer, tp-yt-paper-item, yt-list-item-view-model, ytd-menu-navigation-item-renderer, [role="menuitem"]'
        );

        for (const item of menuItems) {
          // Never click anything in the sidebar/guide or top masthead
          if (item.closest('#guide, ytd-guide-renderer, ytd-mini-guide-renderer, #masthead, ytd-masthead')) {
            continue;
          }

          const text = (item.textContent || '').toLowerCase();
          const aria = (item.getAttribute('aria-label') || '').toLowerCase();

          // Must strictly contain a deletion verb
          const isRemovalAction =
            text.includes('remove') ||
            text.includes('ta bort') ||
            text.includes('delete') ||
            aria.includes('remove') ||
            aria.includes('ta bort') ||
            aria.includes('delete');

          if (isRemovalAction) {
            console.log(LOG_PREFIX, 'Clicking popup menu removal item:', item);
            item.click();
            await checkConfirmationDialog();
            return true;
          }
        }
      }

      // Close menu if remove option wasn't found
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    }

    console.warn(LOG_PREFIX, 'Failed to find remove button or menu for card:', card);
    return false;
  }

  /**
   * Handle confirmation dialogs if YouTube displays one
   */
  async function checkConfirmationDialog() {
    await sleep(250);
    // Strictly search within confirmation dialog containers
    const dialog = document.querySelector('yt-confirm-dialog-renderer, tp-yt-paper-dialog');
    if (!dialog) return;

    const confirmBtn = dialog.querySelector(
      '#confirm-button button, button[aria-label*="Delete" i], button[aria-label*="Ta bort" i], button[aria-label*="Remove" i]'
    );
    if (confirmBtn) {
      console.log(LOG_PREFIX, 'Clicking confirmation dialog button:', confirmBtn);
      confirmBtn.click();
      await sleep(250);
    }
  }

  /**
   * Main cleaning engine loop
   */
  async function startCleaning() {
    const keywords = getKeywordList();
    if (keywords.length === 0) {
      statusMessage = 'Please enter at least one keyword';
      updateWidgetUI();
      return;
    }

    stopRequested = false;
    currentState = STATE.RUNNING;
    scannedCount = 0;
    matchedCount = 0;
    deletedCount = 0;
    processedCards.clear();

    statusMessage = `Searching for: "${keywords.join(', ')}"`;
    console.log(LOG_PREFIX, `Started cleaning for keywords:`, keywords);
    broadcastStatus();

    const delayMs = DELAY_MAP[delaySpeed] || 800;
    let scrollRetries = 0;
    const maxScrollRetries = 5;
    let consecutiveNoMatchPages = 0;
    let stoppedDueToPageLimit = false;

    while (currentState === STATE.RUNNING && !stopRequested) {
      // Query all cards using modern and fallback selectors
      const cards = getAllVideoCards();
      console.log(LOG_PREFIX, `Found ${cards.length} video card(s) on page.`);

      let foundUnprocessedInPass = false;
      let matchesInThisPage = 0;

      for (const card of cards) {
        if (currentState !== STATE.RUNNING || stopRequested) break;

        // Skip detached cards
        if (!card.isConnected || card.offsetParent === null) continue;

        const details = getVideoDetails(card);

        // Skip cards with no identifiable title or ID
        if (!details.title && !details.id) continue;

        // Skip if already evaluated
        if (processedCards.has(details.id)) continue;

        processedCards.add(details.id);
        foundUnprocessedInPass = true;
        scannedCount++;

        const matches = isMatch(details, keywords);
        const matchedTitle = keywords.some((kw) => (details.title || '').toLowerCase().includes(kw));
        const matchedChannel = keywords.some(
          (kw) =>
            (details.channel || '').toLowerCase().includes(kw) ||
            (details.channelUrl || '').toLowerCase().includes(kw) ||
            (details.allText || '').toLowerCase().includes(kw)
        );
        const matchSource = matchedTitle && matchedChannel ? 'Title & Channel' : matchedTitle ? 'Title' : 'Channel';

        console.log(
          LOG_PREFIX,
          `Scanned #${scannedCount}: "${details.title}" by "${details.channel}" | Matched: ${matches}${
            matches ? ' (via ' + matchSource + ')' : ''
          }`
        );

        if (matches) {
          matchesInThisPage++;
          matchedCount++;
          currentTitle = details.title;
          const channelBadge = matchedChannel && !matchedTitle ? ` [Channel: ${details.channel.slice(0, 16)}]` : '';
          statusMessage = `Deleting: "${details.title.slice(0, 26)}..."${channelBadge}`;
          broadcastStatus();

          const removed = await removeVideoCard(card);
          if (removed) {
            deletedCount++;
            console.log(LOG_PREFIX, `Successfully deleted: "${details.title}" (Total deleted: ${deletedCount})`);
            chrome.runtime.sendMessage({ action: 'UPDATE_BADGE', count: deletedCount });
          } else {
            console.warn(LOG_PREFIX, `Could not remove card for: "${details.title}"`);
          }

          broadcastStatus();
          await sleep(delayMs);
        }

        // Handle paused state
        while (currentState === STATE.PAUSED && !stopRequested) {
          statusMessage = 'Paused';
          broadcastStatus();
          await sleep(500);
        }
      }

      if (currentState !== STATE.RUNNING || stopRequested) break;

      // Update consecutive no-match page count
      if (foundUnprocessedInPass) {
        if (matchesInThisPage === 0) {
          consecutiveNoMatchPages++;
          console.log(
            LOG_PREFIX,
            `No matching videos on this page (${consecutiveNoMatchPages}/${maxNoMatchPages} consecutive pages without matches).`
          );
        } else {
          console.log(
            LOG_PREFIX,
            `Found ${matchesInThisPage} match(es) on this page. Resetting consecutive no-match counter.`
          );
          consecutiveNoMatchPages = 0;
        }
      }

      // Stop if no matches found for maxNoMatchPages consecutive pages
      if (maxNoMatchPages > 0 && consecutiveNoMatchPages >= maxNoMatchPages) {
        stoppedDueToPageLimit = true;
        console.log(
          LOG_PREFIX,
          `Reached limit: No matching videos found for ${maxNoMatchPages} consecutive pages. Stopping scroll.`
        );
        break;
      }

      // When all visible cards have been processed, scroll down to load more
      const pageInfo = maxNoMatchPages > 0 && consecutiveNoMatchPages > 0
        ? ` (${consecutiveNoMatchPages}/${maxNoMatchPages} pages without matches)`
        : '';
      statusMessage = `Scanned ${scannedCount} videos${pageInfo}. Scrolling for more...`;
      broadcastStatus();

      const prevHeight = document.documentElement.scrollHeight;
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: 'smooth'
      });

      // Wait for YouTube dynamic content to load
      await sleep(2200);

      const newHeight = document.documentElement.scrollHeight;

      if (!foundUnprocessedInPass && newHeight <= prevHeight) {
        scrollRetries++;
        console.log(LOG_PREFIX, `No new cards loaded after scroll (retry ${scrollRetries}/${maxScrollRetries})`);
        if (scrollRetries >= maxScrollRetries) {
          console.log(LOG_PREFIX, 'Reached the end of watch history.');
          break;
        }
      } else {
        scrollRetries = 0;
      }
    }

    if (stopRequested) {
      currentState = STATE.STOPPED;
      statusMessage = `Stopped. Deleted ${deletedCount} video(s).`;
    } else if (stoppedDueToPageLimit) {
      currentState = STATE.COMPLETED;
      statusMessage = `Stopped: No matches found for ${maxNoMatchPages} consecutive pages. (Removed ${deletedCount})`;
    } else {
      currentState = STATE.COMPLETED;
      statusMessage = `Completed! Removed ${deletedCount} video(s).`;
    }

    console.log(LOG_PREFIX, `Finished with state: ${currentState}. Scanned: ${scannedCount}, Matched: ${matchedCount}, Deleted: ${deletedCount}`);
    chrome.runtime.sendMessage({ action: 'UPDATE_BADGE', count: 0 });
    broadcastStatus();
  }

  function pauseCleaning() {
    currentState = STATE.PAUSED;
    statusMessage = 'Cleaning paused';
    broadcastStatus();
  }

  function resumeCleaning() {
    currentState = STATE.RUNNING;
    statusMessage = 'Resuming cleaning...';
    broadcastStatus();
  }

  function stopCleaning() {
    stopRequested = true;
    currentState = STATE.STOPPED;
    statusMessage = `Stopped. Total removed: ${deletedCount}`;
    broadcastStatus();
  }

  // Listen to messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'START_CLEANING') {
      if (request.keyword) currentKeyword = request.keyword;
      if (typeof request.matchChannel === 'boolean') matchChannel = request.matchChannel;
      if (request.delaySpeed) delaySpeed = request.delaySpeed;
      if (request.maxNoMatchPages !== undefined) maxNoMatchPages = parseInt(request.maxNoMatchPages, 10);

      startCleaning();
      sendResponse({ success: true });
      return false;
    }

    if (request.action === 'PAUSE_CLEANING') {
      pauseCleaning();
      sendResponse({ success: true });
      return false;
    }

    if (request.action === 'RESUME_CLEANING') {
      resumeCleaning();
      sendResponse({ success: true });
      return false;
    }

    if (request.action === 'STOP_CLEANING') {
      stopCleaning();
      sendResponse({ success: true });
      return false;
    }

    if (request.action === 'FILTER_ON_YOUTUBE') {
      triggerNativeHistorySearch(request.keyword || currentKeyword);
      sendResponse({ success: true });
      return false;
    }

    if (request.action === 'GET_STATUS') {
      sendResponse({
        isHistoryPage: isHistoryPage(),
        state: currentState,
        keyword: currentKeyword,
        scanned: scannedCount,
        matched: matchedCount,
        deleted: deletedCount,
        currentTitle: currentTitle,
        statusMessage: statusMessage
      });
      return false;
    }
  });

  // Start observing
  setupNavigationWatchers();
})();
