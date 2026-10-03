# RewindSweep

A Manifest V3 Chrome extension to batch-remove specific videos from your YouTube account watch history and local Chrome history based on user-defined keywords.

Useful for scrubbing recommendations after sharing an account or clearing out specific recurring topics (such as kids' content like *Cocomelon* or temporary search rabbit holes) without having to wipe your entire viewing history.

---

## Features

- **Account-Level Removal**: Interacts directly with YouTube's interface to trigger native video removals. Removed videos are cleared from your Google account and will no longer influence the recommendation algorithm.
- **Chrome History Cleanup**: Optionally queries and removes matching YouTube URLs from local browser history via the `chrome.history` API.
- **Keyword & Creator Filtering**: Filter by video titles, creator names, or both. Supports comma-delimited keyword lists.
- **Rate-Limiting Controls**: Configurable request pacing to avoid YouTube front-end throttling:
  - *Careful (1500ms)*: Best for large histories or strict rate limits.
  - *Normal (800ms)*: Recommended balance between speed and reliability.
  - *Fast (400ms)*: Accelerated batch removal.
- **Automated Scrolling & Threshold Stopping**: Automatically loads older history entries and halts execution when no matching videos appear across a selectable threshold of consecutive page loads (e.g., 3, 5, or 10 empty pages).
- **Dual Control Interface**: Manage scans via the standard Chrome extension popup or directly through an overlay widget injected into `youtube.com/feed/history`.

---

## Installation

Because this extension is not currently published on the Chrome Web Store, install it directly in developer mode:

1. Clone this repository or download and extract the source ZIP:
   ```bash
   git clone https://github.com/Netsug/RewindSweep.git
   ```
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked** in the top-left corner.
5. Select the project directory (the folder containing `manifest.json`).

---

## Usage

### Option 1: Via the Extension Popup
1. Click the **RewindSweep** icon in the Chrome toolbar.
2. If you are not on YouTube, click **Open History** to navigate to `https://www.youtube.com/feed/history`.
3. Input your target keywords separated by commas (e.g., `Cocomelon, nursery, rhymes`).
4. Set your removal speed, channel matching preferences, and whether to clear local Chrome history.
5. Click **Start Cleaning**.

### Option 2: Via the In-Page Widget
1. Go directly to [YouTube Watch History](https://www.youtube.com/feed/history).
2. Use the floating control panel docked in the bottom-right corner.
3. Add your target keywords and click **Start Cleaning**. You can pause, resume, or minimize the widget at any time.

---

## Permissions Explained

RewindSweep uses Manifest V3 and requests only the permissions necessary to function:

| Permission | Purpose |
| :--- | :--- |
| `history` | Required only if the option to delete matching entries from local browser history is enabled. |
| `storage` | Saves your preferences, keywords, and pacing settings locally across sessions. |
| `tabs` | Directs you to the YouTube history page from the popup menu. |
| `*://*.youtube.com/*` | Allows the content script to detect matching items, inject the widget, and automate dismiss button clicks. |

No user data, browsing history, or account credentials leave your browser.

---

## Project Structure

```text
├── manifest.json        # Extension configuration (Manifest V3)
├── background/
│   └── background.js    # Service worker handling tab navigation and Chrome history API
├── content/
│   ├── content.js       # Content script (DOM inspection, scrolling, removal execution)
│   └── content.css      # Styling for the injected floating widget and highlights
├── popup/
│   ├── popup.html       # Popup layout
│   ├── popup.css        # Popup styling
│   └── popup.js         # Configuration handling and UI sync
└── icons/               # Extension icons (16px, 48px, 128px)
```

---

## License

This project is licensed under the GNU General Public License v3.0. See the [LICENSE](LICENSE) file for details.