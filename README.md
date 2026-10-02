# YouTube Watch History Keyword Cleaner (Chrome Extension)

A Chrome extension (Manifest V3) that automatically finds and deletes videos containing specific keywords (such as **"Cocomelon"**) from your **YouTube Watch History** and your **Chrome Browser History**.

---

## Features

- **Deletes from YouTube Account History**: Programmatically clicks YouTube's native remove/dismiss buttons so that matching videos are removed from your YouTube account and will no longer influence your video recommendations.
- **In-Page Floating Widget**: An on-page control bar automatically appears when you visit `https://www.youtube.com/feed/history`, providing live progress counters (Scanned, Found, Deleted) and Start/Pause/Stop controls.
- **Chrome Browser History Cleaning**: Optionally deletes matching YouTube URLs from Chrome's local history database (`chrome.history` API).
- **Multi-Keyword Support**: Enter multiple keywords separated by commas (e.g. `Cocomelon, nursery, rhymes`).
- **Channel Name Matching**: Toggle to also match and remove videos by channel/creator name.
- **Adjustable Removal Speed**:
  - **Careful (1.5s delay)**: Recommended for large histories to prevent YouTube rate-limiting.
  - **Normal (800ms delay)**: Balanced speed and reliability.
  - **Fast (400ms delay)**: Rapid cleaning.
- **Automatic Infinite Scrolling & Smart Stopping**: Automatically scrolls down and waits for YouTube to fetch older history items, and automatically stops scrolling if no matching videos are found for 5 consecutive pages.
- **Configurable Stop Threshold**: Choose to stop after 3, 5, 10 empty pages, or keep scrolling until the end of history.
- **International & Layout Resilient**: Supports YouTube's dismiss button across multiple languages, SVG icon matching, and 3-dot dropdown fallback.

---

## How to Install in Google Chrome

1. Open Google Chrome.
2. In the address bar, navigate to `chrome://extensions/`.
3. In the top-right corner, turn **ON** **Developer mode**.
4. Click the **Load unpacked** button in the top-left corner.
5. Select this folder:
   ```
   /home/gusten/Desktop/chrome ext
   ```
6. The extension **"YouTube Watch History Keyword Cleaner"** is now installed and ready to use!

---

## How to Use

### Method 1: Using the Extension Popup
1. Click the extension icon in your Chrome toolbar (pin it for quick access).
2. If you are not already on YouTube History, click **"Open History"** to navigate directly to `https://www.youtube.com/feed/history`.
3. Enter your keyword (placeholder is `Cocomelon`, or type your custom keywords separated by commas).
4. Configure any optional settings (speed, channel matching, Chrome browser history).
5. Click **"Start Cleaning"**.
6. Watch the live counters update as matching videos are highlighted and removed in real time.

### Method 2: Directly on YouTube
1. Navigate to [https://www.youtube.com/feed/history](https://www.youtube.com/feed/history).
2. A floating **"History Cleaner"** widget will appear in the bottom-right corner.
3. Type your keyword into the widget's input box.
4. Click **"Start Cleaning"**. You can minimize the widget at any time.

---

## Project Structure

```
chrome ext/
├── manifest.json            # Manifest V3 configuration
├── background/
│   └── background.js        # Service worker (handles Chrome history & tabs)
├── content/
│   ├── content.js           # Content script (DOM interaction, scrolling, deletion)
│   └── content.css          # Styling for in-page floating widget & highlights
├── popup/
│   ├── popup.html           # Extension popup interface
│   ├── popup.css            # Popup stylesheet (YouTube dark theme)
│   └── popup.js             # Popup controls and state synchronization
├── icons/
│   ├── icon16.png           # 16x16 icon
│   ├── icon48.png           # 48x48 icon
│   └── icon128.png          # 128x128 icon
└── README.md                # Documentation and setup guide
```
