const { contextBridge, ipcRenderer } = require('electron');

const desktopBridge = {
  openExternal: (target) => ipcRenderer.invoke('orion:open-external', target),
  openPath: (target) => ipcRenderer.invoke('orion:open-path', target),
  revealPath: (target) => ipcRenderer.invoke('orion:reveal-path', target),
  openLogsDir: () => ipcRenderer.invoke('orion:open-logs-dir'),
  restartStack: () => ipcRenderer.invoke('orion:restart-stack'),
  getStatus: () => ipcRenderer.invoke('orion:get-desktop-status'),
  loadFrontend: () => ipcRenderer.invoke('orion:load-frontend'),
  claudeAuthStatus: () => ipcRenderer.invoke('orion:claude-auth-status'),
  claudeAuthLogin: () => ipcRenderer.invoke('orion:claude-auth-login'),
  platform: process.platform,
  desktop: true,
};

contextBridge.exposeInMainWorld('orionDesktop', desktopBridge);
contextBridge.exposeInMainWorld('empyralisDesktop', desktopBridge);
