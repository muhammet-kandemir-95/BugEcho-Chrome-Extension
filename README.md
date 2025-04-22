# Bug Echo - Debugging Extension

**Bug Echo** is a browser-side request logger and mock system built for developers and testers. It captures all XHR and Fetch requests, user interactions, and makes them replayable and exportable.

📺 **Video Overview:**  
[Watch on YouTube](https://youtu.be/1A_XTfHALPA)

---

## ✨ Features

- Intercepts `fetch` and `XMLHttpRequest` calls
- Logs requests with:
  - Payload
  - Headers
  - Cookies
  - Current URL
  - User actions (clicks, input)
- Can mock saved requests
- UI panel to:
  - Enable/disable mocking
  - Export logs
  - Import logs
  - Clear storage

---

## 🚀 Getting Started

### 1. Load Extension

- Open `chrome://extensions`
- Enable **Developer Mode**
- Click **Load Unpacked**
- Select the folder that contains:
  - `manifest.json`
  - `bug-echo.js`
  - `icon.png`

### 2. Inject the Script

- After the page loads, click the **"INITIALIZE"** button in the floating panel

### 3. Start Using

- The new floating debug panel with new buttons will appear
- Start interacting with the page
- All requests + user actions will be saved automatically

---

## 🛠 Mocking

- Click "ENABLE MOCKING" in the panel
- Now, saved responses will be returned instead of real network calls
- Visual indicators will show where user clicks/input occurred

---

## 📁 Exporting & Importing

- Click **EXPORT** to download `bug-echo-request.json`
- Click **IMPORT** to load a previously exported session

---

## 🔒 License & Commercial Use

This project is licensed under a custom MIT-like license. Commercial use is **prohibited** without permission.

Visit [https://github.com/muhammet-kandemir-95](https://github.com/muhammet-kandemir-95) for updates or to request commercial licensing.

See [LICENSE.md](./LICENSE.md) for details.