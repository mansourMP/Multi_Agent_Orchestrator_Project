// Frozen Electron launcher — read-only health probe and web shell boot only.
const { app, BrowserWindow } = require('electron');

const FRONTEND_URL = process.env.ORION_DESKTOP_FRONTEND_URL || 'http://127.0.0.1:3000';
const RUNTIME_HEALTH_URL = process.env.ORION_DESKTOP_RUNTIME_URL || 'http://127.0.0.1:8001/health';

let mainWindow = null;

async function checkHttp(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1680,
    height: 1040,
    minWidth: 1180,
    minHeight: 760,
    title: 'Empyralis Workbench',
    backgroundColor: '#0f0d0c',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });
  return window;
}

async function loadLauncherShell() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow();
  }

  const runtimeReady = await checkHttp(RUNTIME_HEALTH_URL);
  if (!runtimeReady) {
    const fallback = [
      '<html><body style="font-family:sans-serif;padding:32px;background:#0f0d0c;color:#f6f3ee;">',
      '<h1>Empyralis Workbench</h1>',
      '<p>The frozen desktop launcher only probes runtime health and boots the web shell.</p>',
      `<p>Runtime health probe failed: <code>${RUNTIME_HEALTH_URL}</code></p>`,
      `<p>When the stack is ready, open <code>${FRONTEND_URL}</code>.</p>`,
      '</body></html>',
    ].join('');
    await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fallback)}`);
    return;
  }

  await mainWindow.loadURL(FRONTEND_URL);
}

app.whenReady().then(() => {
  void loadLauncherShell();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void loadLauncherShell();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
