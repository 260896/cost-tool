const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');
const https = require('https');
const http = require('http');

const store = new Store();
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    title: 'Chi Phí Dự Án',
    icon: path.join(__dirname, 'icon.ico'),
    backgroundColor: '#f1f0ec',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// Config
ipcMain.handle('get-config', () => ({
  apiUrl: store.get('apiUrl') || 'https://103.165.144.67:33785',
  apiKey: store.get('apiKey') || '123456'
}));
ipcMain.handle('set-config', (_, { apiUrl, apiKey }) => {
  store.set('apiUrl', apiUrl);
  store.set('apiKey', apiKey);
  return true;
});

// API proxy qua main process (tránh CORS)
ipcMain.handle('api-request', async (_, { method, path: urlPath, apiUrl, apiKey, body }) => {
  return new Promise((resolve, reject) => {
    const url = new URL(apiUrl + urlPath);
    const lib = url.protocol === 'https:' ? https : http;
    const bodyStr = body ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method,
      rejectUnauthorized: false, // Bypass SSL cert errors (important for direct IP access over HTTPS)
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      }
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ ok: false, status: res.statusCode, data: {} });
        }
      });
    });

    req.on('error', (e) => reject(e.message));
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
});