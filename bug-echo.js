(function () {
    function initializeRequestInterceptor() {
        const STORAGE_KEY = 'bug-echo-request';

        const userActions = [];
        const latestInputs = new Map();
        let lastMousePos = null;
        let mouseMoved = false;

        function getXPath(element) {
            if (element === document.body) return '/html/body';
            const idx = (sibling) =>
                Array.from(sibling.parentNode.children)
                    .filter((n) => n.tagName === sibling.tagName)
                    .indexOf(sibling) + 1;
            const path = [];
            while (element && element.nodeType === Node.ELEMENT_NODE) {
                let tag = element.tagName.toLowerCase();
                let i = idx(element);
                path.unshift(`${tag}[${i}]`);
                element = element.parentNode;
            }
            return '/' + path.join('/');
        }

        function logUserEvent(event) {
            const xpath = getXPath(event.target);
            const timestamp = new Date().toISOString();
            if (event.type === 'input') {
                latestInputs.set(xpath, {
                    type: 'input',
                    value: event.target.value,
                    xpath,
                    timestamp
                });
                return;
            }
            if (event.type === 'click') {
                userActions.push({ type: event.type, xpath, timestamp });
            }
        }

        function handleMouseMove(e) {
            lastMousePos = { x: e.clientX, y: e.clientY };
            mouseMoved = true;
        }

        ['click', 'input'].forEach(evt =>
            document.addEventListener(evt, logUserEvent, true)
        );
        document.addEventListener('mousemove', handleMouseMove, true);

        function getCookies(url) {
            try {
                const urlObj = new URL(url);
                if (urlObj.origin === location.origin) {
                    return document.cookie;
                }
            } catch (_) { }
            return null;
        }

        function captureUserActions() {
            const combined = [...userActions];
            latestInputs.forEach(action => combined.push(action));
            userActions.length = 0;
            latestInputs.clear();
            return combined;
        }

        function getStackTrace() {
            return new Error().stack;
        }

        function saveRequestLog(entry) {
            const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            existing.push(entry);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
        }

        const originalFetch = window.fetch;
        window.fetch = async function (...args) {
            const [resource, config = {}] = args;
            const url = typeof resource === 'string' ? resource : resource.url;
            const method = config.method || 'GET';
            const headers = config.headers || {};
            const payload = config.body || null;
            const time = new Date().toISOString();

            if (window.__bugEcho_MockingEnabled) {
                const existing = JSON.parse(localStorage.getItem('bug-echo-request') || '[]');
                const match = existing.find(item =>
                    item.request.url === url &&
                    item.request.payload === payload
                );
                if (match) {
                    console.warn('[BugEcho] Mocked Response Used ✅');
                    setTimeout(() => window.__bugEcho_ShowMockUI(match.userActionsOnBrowser || []), 0);
                    return new Response(match.response.body, {
                        status: match.response.statusCode,
                        headers: { 'Content-Type': match.response.contentType || 'application/json' }
                    });
                }
            }

            try {
                const response = await originalFetch(...args);
                const cloned = response.clone();
                const contentType = response.headers.get('content-type') || '';
                if (!contentType.includes('application/json') && !contentType.includes('text')) return response;

                const body = await cloned.text();
                const statusCode = response.status;

                const entry = {
                    request: { url, headers, method, payload },
                    response: { statusCode, body, contentType },
                    currentPageURL: window.location.href,
                    time,
                    cookies: getCookies(url),
                    userActionsOnBrowser: captureUserActions(),
                    stackTrace: getStackTrace()
                };

                saveRequestLog(entry);
                return response;
            } catch (err) {
                console.error('Fetch error:', err);
                throw err;
            }
        };

        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            this._interceptedMethod = method;
            this._interceptedUrl = url;
            return originalOpen.call(this, method, url, ...rest);
        };

        XMLHttpRequest.prototype.send = function (body) {
            const xhr = this;
            const time = new Date().toISOString();
            const payload = body;

            if (window.__bugEcho_MockingEnabled) {
                const stored = JSON.parse(localStorage.getItem('bug-echo-request') || '[]');
                const match = stored.find(item =>
                    item.request.url === xhr._interceptedUrl &&
                    item.request.payload === payload
                );

                if (match) {
                    console.warn('[BugEcho] Mocked XHR Response Used ✅');
                    setTimeout(() => {
                        window.__bugEcho_ShowMockUI(match.userActionsOnBrowser || []);
                        xhr.readyState = 4;
                        xhr.status = match.response.statusCode;
                        xhr.statusText = 'OK';
                        xhr.responseText = match.response.body;

                        if (match.response.contentType?.includes('application/json')) {
                            try {
                                xhr.response = JSON.parse(match.response.body);
                            } catch (_) {
                                xhr.response = match.response.body;
                            }
                        } else {
                            xhr.response = match.response.body;
                        }

                        const createEvent = (type) => new ProgressEvent(type, {
                            lengthComputable: true,
                            loaded: match.response.body.length,
                            total: match.response.body.length
                        });

                        xhr.dispatchEvent(createEvent('loadstart'));
                        xhr.dispatchEvent(new Event('readystatechange'));
                        xhr.dispatchEvent(createEvent('progress'));
                        xhr.dispatchEvent(createEvent('load'));
                        xhr.dispatchEvent(createEvent('loadend'));
                        xhr.dispatchEvent(new Event('readystatechange'));

                        if (typeof xhr.onloadstart === 'function') xhr.onloadstart(createEvent('loadstart'));
                        if (typeof xhr.onprogress === 'function') xhr.onprogress(createEvent('progress'));
                        if (typeof xhr.onload === 'function') xhr.onload(createEvent('load'));
                        if (typeof xhr.onloadend === 'function') xhr.onloadend(createEvent('loadend'));
                        if (typeof xhr.onreadystatechange === 'function') xhr.onreadystatechange(new Event('readystatechange'));
                    }, 0);
                    return;
                }
            }

            const onLoad = function () {
                const headers = {};
                const responseBody = xhr.responseText;
                const statusCode = xhr.status;
                const contentType = xhr.getResponseHeader('content-type') || '';
                if (!contentType.includes('application/json') && !contentType.includes('text')) return;

                const entry = {
                    request: {
                        url: xhr._interceptedUrl,
                        headers,
                        method: xhr._interceptedMethod || 'GET',
                        payload
                    },
                    response: {
                        statusCode,
                        body: responseBody,
                        contentType
                    },
                    currentPageURL: window.location.href,
                    time,
                    cookies: getCookies(xhr._interceptedUrl),
                    userActionsOnBrowser: captureUserActions(),
                    stackTrace: getStackTrace()
                };

                saveRequestLog(entry);
            };

            xhr.addEventListener('load', onLoad);
            return originalSend.call(this, body);
        };
    }

    function initializeDebugPanel() {
        let isMockingEnabled = false;

        const style = document.createElement('style');
        style.textContent = `
#bug-echo-debug-panel {
position: fixed;
top: 20px;
left: 20px;
width: auto;
z-index: 9999;
background: #2e2e2e;
border: 2px solid #730000;
border-radius: 8px;
font-family: sans-serif;
color: white;
box-shadow: 0 0 10px rgba(0,0,0,0.5);
min-width: 250px;
}
#bug-echo-debug-panel.minimized #bug-echo-debug-panel-buttons { display: none; }
#bug-echo-debug-panel-header {
cursor: move;
background: #3a3a3a;
padding: 5px 10px;
border-bottom: 1px solid #555;
font-weight: bold;
border-radius: 6px 6px 0 0;
display: flex;
justify-content: space-between;
align-items: center;
}
#bug-echo-debug-panel-minimize-btn {
background: none;
border: none;
color: white;
font-size: 14px;
cursor: pointer;
}
#bug-echo-debug-panel-buttons {
display: flex;
flex-wrap: wrap;
gap: 10px;
justify-content: center;
padding: 10px 5px;
}
.bug-echo-debug-btn {
background: #444;
color: white;
border: 2px solid white;
border-radius: 4px;
padding: 8px 14px;
cursor: pointer;
transition: 0.2s;
}
.bug-echo-debug-btn:hover { background: #5a5a5a; }
.mock-overlay {
position: absolute;
background: red;
color: white;
font-size: 12px;
padding: 6px 8px;
border-radius: 4px;
z-index: 99999;
pointer-events: none;
white-space: pre-line;
line-height: 1.4;
box-shadow: 0 0 5px rgba(0,0,0,0.3);
}`;
        document.head.appendChild(style);

        const panel = document.createElement('div');
        panel.id = 'bug-echo-debug-panel';
        panel.innerHTML = `
<div id='bug-echo-debug-panel-header'>
<span>🐞 Bug Echo - Debug Panel</span>
<button id='bug-echo-debug-panel-minimize-btn'>_</button>
</div>
<div id='bug-echo-debug-panel-buttons'>
    <button class='bug-echo-debug-btn' id='bug-echo-debug-panel-clear-storage'>CLEAR</button>
    <button class='bug-echo-debug-btn' id='bug-echo-debug-panel-export-json'>EXPORT</button>
    <button class='bug-echo-debug-btn' id='bug-echo-debug-panel-import-json'>IMPORT</button>
    <button class='bug-echo-debug-btn' id='bug-echo-debug-panel-mock-toggle'>ENABLE MOCKING</button>
</div>`;
        document.body.appendChild(panel);

        document.getElementById('bug-echo-debug-panel-clear-storage').onclick = () => {
            localStorage.removeItem('bug-echo-request');
            alert('Storage cleared ✅');
        };

        document.getElementById('bug-echo-debug-panel-export-json').onclick = () => {
            const data = localStorage.getItem('bug-echo-request') || '[]';
            const blobUrl = `data:application/json;charset=utf-8,${encodeURIComponent(data)}`;

            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = 'bug-echo-request.json';
            a.click();
        };

        document.getElementById('bug-echo-debug-panel-import-json').onclick = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,application/json';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const content = JSON.parse(e.target.result);
                        localStorage.setItem('bug-echo-request', JSON.stringify(content));
                        alert('Import successful ✅');
                    } catch (err) {
                        alert('Invalid JSON ❌');
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        };

        const minimizeBtn = document.getElementById('bug-echo-debug-panel-minimize-btn');
        minimizeBtn.onclick = () => {
            panel.classList.toggle('minimized');
            minimizeBtn.textContent = panel.classList.contains('minimized') ? '🗖' : '_';
        };

        const mockToggleBtn = document.getElementById('bug-echo-debug-panel-mock-toggle');
        mockToggleBtn.onclick = () => {
            isMockingEnabled = !isMockingEnabled;
            mockToggleBtn.textContent = isMockingEnabled ? 'DISABLE MOCKING' : 'ENABLE MOCKING';
            window.__bugEcho_MockingEnabled = isMockingEnabled;
        };

        let offsetX = 0, offsetY = 0, isDragging = false;
        const header = document.getElementById('bug-echo-debug-panel-header');
        header.addEventListener('mousedown', (e) => {
            if (e.target.id === 'bug-echo-debug-panel-minimize-btn') return;
            isDragging = true;
            offsetX = e.clientX - panel.offsetLeft;
            offsetY = e.clientY - panel.offsetTop;
        });
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                panel.style.left = `${e.clientX - offsetX}px`;
                panel.style.top = `${e.clientY - offsetY}px`;
            }
        });
        document.addEventListener('mouseup', () => isDragging = false);

        window.__bugEcho_MockingEnabled = false;
        window.__bugEcho_ShowMockUI = function (actions = []) {
            const grouped = actions.reduce((acc, action) => {
                if (!acc[action.xpath]) acc[action.xpath] = [];
                acc[action.xpath].push(action);
                return acc;
            }, {});

            Object.entries(grouped).forEach(([xpath, group]) => {
                const el = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                const overlay = document.createElement('div');
                overlay.className = 'mock-overlay';
                let top = 20, left = 20;
                if (el && el.getBoundingClientRect) {
                    const rect = el.getBoundingClientRect();
                    top = rect.top + window.scrollY;
                    left = rect.left + window.scrollX;
                }
                overlay.style.top = `${top}px`;
                overlay.style.left = `${left}px`;

                let latestInput = null;
                let clicked = false;
                group.forEach(action => {
                    if (action.type === 'click') clicked = true;
                    if (action.type === 'input') latestInput = action.value;
                });

                const lines = [];
                if (clicked) lines.push('CLICKED');
                if (latestInput !== null) lines.push(`INPUT: ${latestInput}`);
                overlay.textContent = lines.join('\n');
                document.body.appendChild(overlay);
                setTimeout(() => overlay.remove(), 3000);
            });
        };
    }

    function initializeDebugInitializePanel() {

        const style = document.createElement('style');
        style.textContent = `
#bug-echo-debug-panel-initialize {
position: fixed;
top: 20px;
left: 20px;
width: auto;
z-index: 9999;
background: #2e2e2e;
border: 2px solid #730000;
border-radius: 8px;
font-family: sans-serif;
color: white;
box-shadow: 0 0 10px rgba(0,0,0,0.5);
min-width: 250px;
}
#bug-echo-debug-panel-initialize.minimized #bug-echo-debug-panel-initialize-buttons { display: none; }
#bug-echo-debug-panel-initialize-header {
cursor: move;
background: #3a3a3a;
padding: 5px 10px;
border-bottom: 1px solid #555;
font-weight: bold;
border-radius: 6px 6px 0 0;
display: flex;
justify-content: space-between;
align-items: center;
}
#bug-echo-debug-panel-initialize-minimize-btn {
background: none;
border: none;
color: white;
font-size: 14px;
cursor: pointer;
}
#bug-echo-debug-panel-initialize-buttons {
display: flex;
flex-wrap: wrap;
gap: 10px;
justify-content: center;
padding: 10px 5px;
}
.bug-echo-debug-btn {
background: #444;
color: white;
border: 2px solid white;
border-radius: 4px;
padding: 8px 14px;
cursor: pointer;
transition: 0.2s;
}
.bug-echo-debug-btn:hover { background: #5a5a5a; }
.mock-overlay {
position: absolute;
background: red;
color: white;
font-size: 12px;
padding: 6px 8px;
border-radius: 4px;
z-index: 99999;
pointer-events: none;
white-space: pre-line;
line-height: 1.4;
box-shadow: 0 0 5px rgba(0,0,0,0.3);
}`;
        document.head.appendChild(style);

        const panel = document.createElement('div');
        panel.id = 'bug-echo-debug-panel-initialize';
        panel.innerHTML = `
<div id='bug-echo-debug-panel-initialize-header'>
<span>🐞 Bug Echo - Debug Panel</span>
<button id='bug-echo-debug-panel-initialize-remove-btn' onclick='this.parentNode.parentNode.remove();'>X</button>
</div>
<div id='bug-echo-debug-panel-initialize-buttons'>
<button class='bug-echo-debug-btn' id='bug-echo-debug-panel-initialize-initialize' onclick="(${initializeRequestInterceptor.toString().replace(/\n/g, '').split('"').join('&quot;')})();(${initializeDebugPanel.toString().replace(/\n/g, '').split('"').join('&quot;')})(false);this.parentNode.parentNode.remove();">INITIALIZE</button>
</div>`;
        document.body.appendChild(panel);

        let offsetX = 0, offsetY = 0, isDragging = false;
        const header = document.getElementById('bug-echo-debug-panel-initialize-header');
        header.addEventListener('mousedown', (e) => {
            if (e.target.id === 'bug-echo-debug-panel-initialize-remove-btn') return;
            isDragging = true;
            offsetX = e.clientX - panel.offsetLeft;
            offsetY = e.clientY - panel.offsetTop;
        });
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                panel.style.left = `${e.clientX - offsetX}px`;
                panel.style.top = `${e.clientY - offsetY}px`;
            }
        });
        document.addEventListener('mouseup', () => isDragging = false);
    }

    (function waitForBodyAndInitDebugPanel() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeDebugInitializePanel);
        } else {
            initializeDebugInitializePanel();
        }
    })();

    console.log('Bug Echo injected!');
    localStorage.setItem('bug-echo-test-data', 'SUCCESS');
})();
