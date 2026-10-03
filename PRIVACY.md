# Privacy Policy for RewindSweep

Last updated: October 2026

RewindSweep ("the Extension") is committed to protecting your privacy. This Privacy Policy explains how data is handled by the Extension.

## 1. Information Handling and Data Collection

- **No Data Collection:** RewindSweep does not collect, store, transmit, or sell any personal data, browsing history, or analytics to external servers.
- **Local Browser Storage:** The Extension uses Chrome's local storage API (`chrome.storage.local`) strictly to save your settings locally on your machine (such as keywords, deletion pacing, and UI preferences).
- **Browsing History:** If you enable the optional Chrome history cleanup feature, the Extension queries and deletes matching YouTube entries directly from your local Chrome history (`chrome.history`). This history data is processed ephemerally on your local machine and never leaves your browser.
- **YouTube Account History:** When running on YouTube, the Extension interacts with the page DOM to trigger native removal actions. It does not access your Google credentials, passwords, or personal account details.

## 2. Third-Party Sharing

RewindSweep does not communicate with any external servers, third-party analytics providers, or tracking services.

## 3. Changes to This Policy

Any updates to this policy will be reflected in this repository.

## 4. Contact

For questions regarding this policy, please open an issue at https://github.com/Netsug/RewindSweep.