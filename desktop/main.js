const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { execFile, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const FORCE_SOFTWARE_RENDERING = process.env.EMPYRALIS_DESKTOP_DISABLE_GPU === '1';
const GL_BACKEND = String(process.env.EMPYRALIS_DESKTOP_GL || '').trim();
const DISABLE_METAL = process.env.EMPYRALIS_DESKTOP_DISABLE_METAL === '1';
const DISABLE_VULKAN = process.env.EMPYRALIS_DESKTOP_DISABLE_VULKAN === '1';

if (FORCE_SOFTWARE_RENDERING) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
}
if (GL_BACKEND) {
  app.commandLine.appendSwitch('use-gl', GL_BACKEND);
}
if (DISABLE_METAL || DISABLE_VULKAN) {
  const disabledFeatures = [];
  if (DISABLE_METAL) disabledFeatures.push('Metal');
  if (DISABLE_VULKAN) disabledFeatures.push('Vulkan');
  app.commandLine.appendSwitch('disable-features', disabledFeatures.join(','));
}
app.commandLine.appendSwitch('disable-renderer-backgrounding');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const FRONTEND_URL = process.env.ORION_DESKTOP_FRONTEND_URL || 'http://127.0.0.1:3000';
const RUNTIME_HEALTH_URL = process.env.ORION_DESKTOP_RUNTIME_URL || 'http://127.0.0.1:8001/health';
const START_SCRIPT_RELATIVE = 'scripts/start_orion_local_stack.sh';
const START_SCRIPT_ABSOLUTE = path.join(PROJECT_ROOT, START_SCRIPT_RELATIVE);
const START_SCRIPT_POWERSHELL_RELATIVE = 'scripts/start_orion_local_stack.ps1';
const START_SCRIPT_POWERSHELL_ABSOLUTE = path.join(PROJECT_ROOT, START_SCRIPT_POWERSHELL_RELATIVE);

let mainWindow = null;
let ensureStackReadyPromise = null;
let shellStatus = {
  stackReady: false,
  frontendReady: false,
  runtimeReady: false,
  lastCheckedAt: null,
  lastError: null,
  frontendUrl: FRONTEND_URL,
  runtimeHealthUrl: RUNTIME_HEALTH_URL,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

async function computeShellStatus() {
  const [frontendReady, runtimeReady] = await Promise.all([
    checkHttp(FRONTEND_URL),
    checkHttp(RUNTIME_HEALTH_URL),
  ]);
  shellStatus = {
    ...shellStatus,
    stackReady: frontendReady && runtimeReady,
    frontendReady,
    runtimeReady,
    lastCheckedAt: new Date().toISOString(),
    lastError: null,
  };
  return shellStatus;
}

function updateShellStatus(frontendReady, runtimeReady, lastError = null) {
  shellStatus = {
    ...shellStatus,
    stackReady: frontendReady && runtimeReady,
    frontendReady,
    runtimeReady,
    lastCheckedAt: new Date().toISOString(),
    lastError,
  };
  return shellStatus;
}

function isStartupAlreadyRunningError(error) {
  const message = error instanceof Error ? error.message : String(error || '');
  return message.includes('Another Empyralis stack startup is already running.');
}

async function waitForStackReady(deadlineMs = 120000) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const [frontendReady, runtimeReady] = await Promise.all([
      checkHttp(FRONTEND_URL),
      checkHttp(RUNTIME_HEALTH_URL),
    ]);
    updateShellStatus(frontendReady, runtimeReady, null);
    if (frontendReady && runtimeReady) return;
    await sleep(1200);
  }
  throw new Error('Empyralis stack did not become ready within 120 seconds.');
}

function runStartStackScript() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(START_SCRIPT_ABSOLUTE)) {
      reject(new Error(`Missing startup script: ${START_SCRIPT_RELATIVE}`));
      return;
    }

    const runWith = (command, args, next) => {
      execFile(
        command,
        args,
        { cwd: PROJECT_ROOT, env: process.env, maxBuffer: 1024 * 1024 * 10 },
        (error, stdout, stderr) => {
          if (!error) {
            resolve(String(stdout || '').trim());
            return;
          }
          if (typeof next === 'function') {
            next(error, stdout, stderr);
            return;
          }
          const combined = `${stdout || ''}\n${stderr || ''}`.trim();
          reject(new Error(combined || error.message));
        },
      );
    };

    if (process.platform === 'win32') {
      const tryBashFallback = (psError, psStdout, psStderr) => {
        runWith('bash', [START_SCRIPT_RELATIVE], (bashError, bashStdout, bashStderr) => {
          runWith('wsl', ['bash', START_SCRIPT_RELATIVE], (wslError, wslStdout, wslStderr) => {
            const msg = [
              'Desktop startup could not auto-start Empyralis services on Windows.',
              'Use native PowerShell script or install Git Bash/WSL.',
              '',
              psError ? `powershell error: ${psError.message}` : '',
              psStdout ? `${String(psStdout || '').trim()}\n${String(psStderr || '').trim()}`.trim() : '',
              '',
              `bash error: ${bashError.message}`,
              `${String(bashStdout || '').trim()}\n${String(bashStderr || '').trim()}`.trim(),
              '',
              `wsl error: ${wslError.message}`,
              `${String(wslStdout || '').trim()}\n${String(wslStderr || '').trim()}`.trim(),
            ]
              .filter(Boolean)
              .join('\n');
            reject(new Error(msg));
          });
        });
      };

      if (fs.existsSync(START_SCRIPT_POWERSHELL_ABSOLUTE)) {
        runWith(
          'powershell',
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', START_SCRIPT_POWERSHELL_RELATIVE],
          (psError, psStdout, psStderr) => {
            runWith(
              'pwsh',
              ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', START_SCRIPT_POWERSHELL_RELATIVE],
              () => tryBashFallback(psError, psStdout, psStderr),
            );
          },
        );
      } else {
        tryBashFallback(null, '', '');
      }
      return;
    }

    runWith('bash', [START_SCRIPT_RELATIVE]);
  });
}

function showRecoveryScreen() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  void mainWindow.loadFile(path.join(__dirname, 'fallback.html'));
}

function manualStartHintLines() {
  if (process.platform === 'win32') {
    return [
      `powershell -ExecutionPolicy Bypass -File ${START_SCRIPT_POWERSHELL_RELATIVE}`,
      `bash ${START_SCRIPT_RELATIVE}   # Git Bash`,
      `wsl bash ${START_SCRIPT_RELATIVE}   # WSL`,
    ];
  }
  return [`bash ${START_SCRIPT_RELATIVE}`];
}

async function ensureStackReady() {
  if (ensureStackReadyPromise) return ensureStackReadyPromise;

  ensureStackReadyPromise = (async () => {
    const frontendUp = await checkHttp(FRONTEND_URL);
    const runtimeUp = await checkHttp(RUNTIME_HEALTH_URL);
    updateShellStatus(frontendUp, runtimeUp, null);
    if (frontendUp && runtimeUp) return;

    try {
      await runStartStackScript();
    } catch (error) {
      if (!isStartupAlreadyRunningError(error)) {
        throw error;
      }
    }

    await waitForStackReady();
  })();

  try {
    await ensureStackReadyPromise;
  } finally {
    ensureStackReadyPromise = null;
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1680,
    height: 1040,
    minWidth: 1180,
    minHeight: 760,
    title: 'Empyralis Workbench',
    backgroundColor: '#0f0d0c',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    shellStatus = {
      ...shellStatus,
      stackReady: false,
      lastCheckedAt: new Date().toISOString(),
      lastError: `Failed to load ${validatedURL || FRONTEND_URL}: ${errorDescription || 'unknown error'} (${errorCode}).`,
    };
    showRecoveryScreen();
  });

  showRecoveryScreen();
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function bootstrap() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
  } else {
    showRecoveryScreen();
  }
  try {
    await ensureStackReady();
    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(FRONTEND_URL);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start Empyralis Workbench.';
    shellStatus = {
      ...shellStatus,
      stackReady: false,
      lastCheckedAt: new Date().toISOString(),
      lastError: message,
    };
    const detail = [
      'Could not start local Empyralis services for desktop mode.',
      '',
      message,
      '',
      'Try manually:',
      ...manualStartHintLines(),
    ].join('\n');
    shellStatus.lastError = detail;
    showRecoveryScreen();
  }
}

ipcMain.handle('orion:open-external', async (_event, target) => {
  if (typeof target !== 'string' || !target.trim()) return false;
  await shell.openExternal(target);
  return true;
});

ipcMain.handle('orion:open-path', async (_event, target) => {
  if (typeof target !== 'string' || !target.trim()) return false;
  const normalizedTarget = path.isAbsolute(target) ? target : path.resolve(PROJECT_ROOT, target);
  const result = await shell.openPath(normalizedTarget);
  return result === '' ? true : result;
});

ipcMain.handle('orion:reveal-path', async (_event, target) => {
  if (typeof target !== 'string' || !target.trim()) return false;
  const normalizedTarget = path.isAbsolute(target) ? target : path.resolve(PROJECT_ROOT, target);
  shell.showItemInFolder(normalizedTarget);
  return true;
});

ipcMain.handle('orion:open-logs-dir', async () => {
  const logsDir = path.join(PROJECT_ROOT, '.orion-stack', 'logs');
  await shell.openPath(logsDir);
  return logsDir;
});

ipcMain.handle('orion:restart-stack', async () => {
  try {
    await runStartStackScript();
  } catch (error) {
    if (!isStartupAlreadyRunningError(error)) {
      throw error;
    }
  }
  await ensureStackReady();
  return computeShellStatus();
});

ipcMain.handle('orion:get-desktop-status', async () => {
  try {
    return await computeShellStatus();
  } catch (error) {
    shellStatus = {
      ...shellStatus,
      lastCheckedAt: new Date().toISOString(),
      lastError: error instanceof Error ? error.message : 'Failed to compute desktop status.',
    };
    return shellStatus;
  }
});

ipcMain.handle('orion:load-frontend', async () => {
  try {
    await ensureStackReady();
    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(FRONTEND_URL);
    }
    return computeShellStatus();
  } catch (error) {
    shellStatus = {
      ...shellStatus,
      stackReady: false,
      lastCheckedAt: new Date().toISOString(),
      lastError: error instanceof Error ? error.message : 'Failed to load frontend.',
    };
    showRecoveryScreen();
    return shellStatus;
  }
});

ipcMain.handle('orion:claude-auth-status', async () => {
  return await new Promise((resolve) => {
    execFile(
      'claude',
      ['auth', 'status', '--json'],
      { cwd: PROJECT_ROOT, env: process.env, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          resolve({
            ok: false,
            available: false,
            loggedIn: false,
            message: String(stderr || stdout || error.message || 'Claude CLI is not available.').trim(),
          });
          return;
        }
        const raw = String(stdout || '').trim();
        try {
          const parsed = JSON.parse(raw);
          resolve({
            ok: true,
            available: true,
            loggedIn: Boolean(parsed && parsed.loggedIn),
            authMethod: typeof parsed?.authMethod === 'string' ? parsed.authMethod : '',
            apiProvider: typeof parsed?.apiProvider === 'string' ? parsed.apiProvider : '',
            message: Boolean(parsed && parsed.loggedIn)
              ? 'Claude subscription is signed in on this machine.'
              : 'Claude subscription is not signed in yet.',
          });
        } catch (_parseError) {
          resolve({
            ok: false,
            available: true,
            loggedIn: false,
            message: raw || 'Could not read Claude auth status.',
          });
        }
      },
    );
  });
});

ipcMain.handle('orion:claude-auth-login', async () => {
  try {
    const child = spawn('claude', ['auth', 'login'], {
      cwd: PROJECT_ROOT,
      env: process.env,
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return {
      ok: true,
      message: 'Claude login has been started. Complete the sign-in flow, then return and refresh status.',
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Failed to start Claude login.',
    };
  }
});

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      return;
    }
    void bootstrap();
  });

  app.whenReady().then(() => {
    void bootstrap();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void bootstrap();
      return;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
