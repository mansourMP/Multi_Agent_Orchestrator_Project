const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const FORCE_SOFTWARE_RENDERING = process.env.EMPYRALIS_DESKTOP_DISABLE_GPU === '1';
const GL_BACKEND = String(process.env.EMPYRALIS_DESKTOP_GL || '').trim();
const DISABLE_METAL = process.env.EMPYRALIS_DESKTOP_DISABLE_METAL === '1';
const DISABLE_VULKAN = process.env.EMPYRALIS_DESKTOP_DISABLE_VULKAN === '1';

function parseArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return '';
  return String(process.argv[idx + 1] || '').trim();
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  app.exit(1);
}

function sanitizeSessionProfile(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return '';
  const slug = value
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug;
}

function normalizeTabId(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return '';
  return value
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function createBrowserTaskWindow(sessionProfile) {
  return new BrowserWindow({
    show: false,
    width: 1440,
    height: 960,
    backgroundColor: '#181614',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      partition: sessionProfile ? `persist:empyralis-browser-${sessionProfile}` : undefined,
    },
  });
}

function nextPopupTabId(existingTabs) {
  let index = 1;
  while (existingTabs.has(`popup-${index}`)) {
    index += 1;
  }
  return `popup-${index}`;
}

function ensureUniqueDownloadPath(targetPath) {
  const parsed = path.parse(targetPath);
  let candidate = targetPath;
  let index = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(parsed.dir, `${parsed.name}-${index}${parsed.ext}`);
    index += 1;
  }
  return candidate;
}

async function waitForSelector(window, selector, timeoutMs) {
  return waitForSelectorInFrame(window, selector, timeoutMs, '');
}

async function waitForSelectorInFrame(window, selector, timeoutMs, frameSelector) {
  if (!selector) return;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = await window.webContents.executeJavaScript(
      `(() => {
        let doc = document;
        const frameSelector = ${JSON.stringify(frameSelector || '')};
        if (frameSelector) {
          const frame = document.querySelector(frameSelector);
          if (!(frame instanceof HTMLIFrameElement)) return false;
          try {
            doc = frame.contentDocument;
          } catch {
            return false;
          }
          if (!doc) return false;
        }
        return Boolean(doc.querySelector(${JSON.stringify(selector)}));
      })();`,
      true,
    );
    if (found) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for selector: ${selector}`);
}

async function setInputValue(window, selector, value) {
  return setInputValueInFrame(window, selector, value, '');
}

async function setInputValueInFrame(window, selector, value, frameSelector) {
  const result = await window.webContents.executeJavaScript(
    `(() => {
      let doc = document;
      const frameSelector = ${JSON.stringify(frameSelector || '')};
      if (frameSelector) {
        const frame = document.querySelector(frameSelector);
        if (!(frame instanceof HTMLIFrameElement)) return { ok: false, reason: 'frame_not_found' };
        try {
          doc = frame.contentDocument;
        } catch {
          return { ok: false, reason: 'frame_inaccessible' };
        }
        if (!doc) return { ok: false, reason: 'frame_inaccessible' };
      }
      const el = doc.querySelector(${JSON.stringify(selector)});
      if (!el) return { ok: false, reason: 'not_found' };
      if (!('value' in el)) return { ok: false, reason: 'not_editable' };
      el.focus();
      el.value = ${JSON.stringify(value)};
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true };
    })();`,
    true,
  );
  if (!result || !result.ok) {
    throw new Error(`Could not type into selector: ${selector}`);
  }
}

async function clickSelector(window, selector) {
  return clickSelectorInFrame(window, selector, '');
}

async function clickSelectorInFrame(window, selector, frameSelector) {
  const result = await window.webContents.executeJavaScript(
    `(() => {
      let doc = document;
      const frameSelector = ${JSON.stringify(frameSelector || '')};
      if (frameSelector) {
        const frame = document.querySelector(frameSelector);
        if (!(frame instanceof HTMLIFrameElement)) return { ok: false, reason: 'frame_not_found' };
        try {
          doc = frame.contentDocument;
        } catch {
          return { ok: false, reason: 'frame_inaccessible' };
        }
        if (!doc) return { ok: false, reason: 'frame_inaccessible' };
      }
      const el = doc.querySelector(${JSON.stringify(selector)});
      if (!el) return { ok: false };
      el.click();
      return { ok: true };
    })();`,
    true,
  );
  if (!result || !result.ok) {
    throw new Error(`Could not click selector: ${selector}`);
  }
}

async function setSelectValue(window, selector, value) {
  return setSelectValueInFrame(window, selector, value, '');
}

async function setSelectValueInFrame(window, selector, value, frameSelector) {
  const result = await window.webContents.executeJavaScript(
    `(() => {
      let doc = document;
      const frameSelector = ${JSON.stringify(frameSelector || '')};
      if (frameSelector) {
        const frame = document.querySelector(frameSelector);
        if (!(frame instanceof HTMLIFrameElement)) return { ok: false, reason: 'frame_not_found' };
        try {
          doc = frame.contentDocument;
        } catch {
          return { ok: false, reason: 'frame_inaccessible' };
        }
        if (!doc) return { ok: false, reason: 'frame_inaccessible' };
      }
      const el = doc.querySelector(${JSON.stringify(selector)});
      if (!el) return { ok: false, reason: 'not_found' };
      if (!(el instanceof HTMLSelectElement)) return { ok: false, reason: 'not_select' };
      const option = Array.from(el.options).find((item) => item.value === ${JSON.stringify(value)});
      if (!option) return { ok: false, reason: 'option_not_found' };
      el.value = ${JSON.stringify(value)};
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, value: el.value, text: option.textContent || '' };
    })();`,
    true,
  );
  if (!result || !result.ok) {
    throw new Error(`Could not select value on selector: ${selector}`);
  }
  return result;
}

async function dispatchInputFiles(window, selector, files) {
  const wc = window.webContents;
  const debuggerClient = wc.debugger;
  let attachedHere = false;
  if (!debuggerClient.isAttached()) {
    debuggerClient.attach('1.3');
    attachedHere = true;
  }
  try {
    const { root } = await debuggerClient.sendCommand('DOM.getDocument', { depth: -1, pierce: true });
    const { nodeId } = await debuggerClient.sendCommand('DOM.querySelector', {
      nodeId: root.nodeId,
      selector,
    });
    if (!nodeId) {
      throw new Error(`Could not find file input selector: ${selector}`);
    }
    await debuggerClient.sendCommand('DOM.setFileInputFiles', {
      nodeId,
      files,
    });
  } finally {
    if (attachedHere && debuggerClient.isAttached()) {
      debuggerClient.detach();
    }
  }
  const result = await wc.executeJavaScript(
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el || !(el instanceof HTMLInputElement) || el.type !== 'file') {
        return { ok: false, reason: 'not_file_input' };
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        ok: true,
        count: el.files ? el.files.length : 0,
        names: el.files ? Array.from(el.files).map((item) => item.name) : [],
      };
    })();`,
    true,
  );
  if (!result || !result.ok) {
    throw new Error(`Could not upload files into selector: ${selector}`);
  }
  return result;
}

async function extractFromSelector(window, selector, attribute) {
  return extractFromSelectorInFrame(window, selector, attribute, '');
}

async function extractFromSelectorInFrame(window, selector, attribute, frameSelector) {
  const result = await window.webContents.executeJavaScript(
    `(() => {
      let doc = document;
      const frameSelector = ${JSON.stringify(frameSelector || '')};
      if (frameSelector) {
        const frame = document.querySelector(frameSelector);
        if (!(frame instanceof HTMLIFrameElement)) return { ok: false, reason: 'frame_not_found' };
        try {
          doc = frame.contentDocument;
        } catch {
          return { ok: false, reason: 'frame_inaccessible' };
        }
        if (!doc) return { ok: false, reason: 'frame_inaccessible' };
      }
      const el = doc.querySelector(${JSON.stringify(selector)});
      if (!el) return { ok: false, reason: 'not_found' };
      const text = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
      const html = (el.outerHTML || '').slice(0, 4000);
      const value = 'value' in el ? String(el.value || '') : '';
      const attr = ${JSON.stringify(attribute || '')};
      const attributeValue = attr ? String(el.getAttribute(attr) || '') : '';
      return { ok: true, text, html, value, attributeValue };
    })();`,
    true,
  );
  if (!result || !result.ok) {
    throw new Error(`Could not extract selector: ${selector}`);
  }
  return result;
}

async function resolvePopupTargetInFrame(window, selector, frameSelector) {
  const result = await window.webContents.executeJavaScript(
    `(() => {
      let doc = document;
      const frameSelector = ${JSON.stringify(frameSelector || '')};
      if (frameSelector) {
        const frame = document.querySelector(frameSelector);
        if (!(frame instanceof HTMLIFrameElement)) return { ok: false, reason: 'frame_not_found' };
        try {
          doc = frame.contentDocument;
        } catch {
          return { ok: false, reason: 'frame_inaccessible' };
        }
        if (!doc) return { ok: false, reason: 'frame_inaccessible' };
      }
      const el = doc.querySelector(${JSON.stringify(selector)});
      if (!el) return { ok: false, reason: 'not_found' };
      const href =
        el instanceof HTMLAnchorElement
          ? String(el.href || '').trim()
          : String(el.getAttribute('href') || '').trim();
      const target = String(el.getAttribute('target') || '').trim();
      return { ok: true, href, target };
    })();`,
    true,
  );
  if (!result || !result.ok) {
    return { href: '', target: '' };
  }
  return {
    href: String(result.href || '').trim(),
    target: String(result.target || '').trim(),
  };
}

async function navigateTo(window, url, settleMs) {
  await window.loadURL(url);
  await new Promise((resolve) => setTimeout(resolve, settleMs));
}

async function sleepMs(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeActions(payload, legacy) {
  const raw = Array.isArray(payload.browserActions || payload.browser_actions) ? (payload.browserActions || payload.browser_actions) : [];
  const normalized = [];
  if (raw.length > 0) {
    for (const item of raw) {
      if (!item || typeof item !== 'object') fail('Browser action entries must be objects.');
      const action = String(item.action || '').trim().toLowerCase();
      if (!action) fail('Browser action is required.');
      normalized.push({
        action,
        selector: String(item.selector || '').trim(),
        frame: String(item.frame || item.frameSelector || '').trim(),
        tab: normalizeTabId(item.tab || item.tabId || ''),
        text: String(item.text || '').trim(),
        url: String(item.url || '').trim(),
        ms: Number(item.ms || item.delayMs || 0),
        filename: String(item.filename || '').trim(),
        value: String(item.value || '').trim(),
        attribute: String(item.attribute || '').trim(),
        path: String(item.path || '').trim(),
        paths: Array.isArray(item.paths) ? item.paths.map((entry) => String(entry || '').trim()).filter(Boolean) : [],
      });
    }
    return normalized;
  }
  if (legacy.waitFor) normalized.push({ action: 'wait', selector: legacy.waitFor, text: '', url: '', ms: 0 });
  if (legacy.typeSelector) normalized.push({ action: 'type', selector: legacy.typeSelector, text: legacy.typeText, url: '', ms: 0 });
  if (legacy.click) normalized.push({ action: 'click', selector: legacy.click, text: '', url: '', ms: 0 });
  return normalized;
}

async function main() {
  const payloadPath = parseArg('--payload');
  const outputPath = parseArg('--output');
  if (!payloadPath || !outputPath) {
    fail('browser_task requires --payload and --output.');
    return;
  }

  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  } catch (error) {
    fail(`Failed to read browser task payload: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  const url = String(payload.url || '').trim();
  const mode = String(payload.mode || 'capture_page').trim();
  const screenshotPath = String(payload.screenshotPath || '').trim();
  const downloadDir = String(payload.downloadDir || '').trim();
  const sessionProfile = sanitizeSessionProfile(payload.sessionProfile || payload.session_profile || '');
  const waitFor = String(payload.waitForSelector || '').trim();
  const click = String(payload.clickSelector || '').trim();
  const typeSelector = String(payload.typeSelector || '').trim();
  const typeText = String(payload.typeText || '').trim();
  const browserActions = normalizeActions(payload, { waitFor, click, typeSelector, typeText });
  const timeoutMs = Math.max(5000, Math.min(Number(payload.timeoutMs || 30000), 120000));
  const settleMs = Math.max(250, Math.min(Number(payload.settleMs || 1200), 10000));
  if (!url) {
    fail('Browser task URL is required.');
    return;
  }
  if (mode !== 'capture_page') {
    fail(`Unsupported browser task mode: ${mode}`);
    return;
  }
  if (!screenshotPath) {
    fail('Browser task screenshotPath is required for capture_page.');
    return;
  }

  if (FORCE_SOFTWARE_RENDERING) {
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
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-http-cache');

  const timeout = setTimeout(() => {
    fail(`Browser task timed out after ${timeoutMs}ms.`);
  }, timeoutMs);

  try {
    await app.whenReady();

    const tabs = new Map();
    const downloadRecords = [];
    const popupWaiters = [];
    const popupQueue = [];
    const browserSession = sessionProfile
      ? require('electron').session.fromPartition(`persist:empyralis-browser-${sessionProfile}`)
      : require('electron').session.defaultSession;
    const notifyPopupReady = (tabId) => {
      for (let index = popupWaiters.length - 1; index >= 0; index -= 1) {
        const waiter = popupWaiters[index];
        if (!waiter) continue;
        if (!waiter.tabId || waiter.tabId === tabId) {
          popupWaiters.splice(index, 1);
          waiter.resolve(tabId);
        }
      }
    };
    const waitForPopup = (requestedTabId, timeoutMs) =>
      new Promise((resolve, reject) => {
        const normalizedTabId = normalizeTabId(requestedTabId);
        if (normalizedTabId && tabs.has(normalizedTabId)) {
          resolve(normalizedTabId);
          return;
        }
        const timer = setTimeout(() => {
          const index = popupWaiters.findIndex((entry) => entry && entry.timer === timer);
          if (index >= 0) popupWaiters.splice(index, 1);
          reject(new Error(`Timed out waiting for popup${normalizedTabId ? `: ${normalizedTabId}` : ''}`));
        }, timeoutMs);
        popupWaiters.push({
          tabId: normalizedTabId,
          timer,
          resolve: (tabId) => {
            clearTimeout(timer);
            resolve(tabId);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
        });
      });
    const resolveTabIdForContents = (contents) => {
      for (const [tabId, tabWindow] of tabs.entries()) {
        if (tabWindow.webContents.id === contents.id) return tabId;
      }
      return currentTab;
    };
    const attachPopupHandler = (ownerTabId, ownerWindow) => {
      ownerWindow.webContents.setWindowOpenHandler(({ url: nextUrl }) => {
        const queuedTabId = popupQueue.shift() || '';
        const popupTabId = normalizeTabId(queuedTabId) || nextPopupTabId(tabs);
        if (tabs.has(popupTabId)) {
          return { action: 'deny' };
        }
        const popupWindow = createBrowserTaskWindow(sessionProfile);
        tabs.set(popupTabId, popupWindow);
        attachPopupHandler(popupTabId, popupWindow);
        void navigateTo(popupWindow, nextUrl, settleMs)
          .then(() => {
            notifyPopupReady(popupTabId);
          })
          .catch((error) => {
            for (let index = popupWaiters.length - 1; index >= 0; index -= 1) {
              const entry = popupWaiters[index];
              if (!entry) continue;
              if (!entry.tabId || entry.tabId === popupTabId) {
                popupWaiters.splice(index, 1);
                entry.reject(error);
              }
            }
          });
        return { action: 'deny' };
      });
    };
    const downloadListener = (_event, item, webContents) => {
      const tabId = resolveTabIdForContents(webContents);
      const targetDir = downloadDir || path.join(path.dirname(screenshotPath), 'downloads');
      fs.mkdirSync(targetDir, { recursive: true });
      const suggestedFilename = String(item.getFilename() || 'download.bin').trim() || 'download.bin';
      const savePath = ensureUniqueDownloadPath(path.join(targetDir, suggestedFilename));
      item.setSavePath(savePath);
      let resolveDone;
      const donePromise = new Promise((resolve) => {
        resolveDone = resolve;
      });
      const record = {
        tab: tabId,
        url: String(item.getURL() || ''),
        suggestedFilename,
        savedPath: savePath,
        state: 'pending',
        donePromise,
      };
      downloadRecords.push(record);
      item.once('done', (_doneEvent, state) => {
        record.state = String(state || 'unknown');
        resolveDone(record);
      });
    };
    browserSession.on('will-download', downloadListener);
    const createTab = async (requestedTab, nextUrl) => {
      const tabId = normalizeTabId(requestedTab) || `tab-${tabs.size + 1}`;
      if (tabs.has(tabId)) {
        throw new Error(`Browser tab already exists: ${tabId}`);
      }
      const tabWindow = createBrowserTaskWindow(sessionProfile);
      tabs.set(tabId, tabWindow);
      attachPopupHandler(tabId, tabWindow);
      await navigateTo(tabWindow, nextUrl, settleMs);
      return tabId;
    };
    const getTabState = (requestedTab) => {
      const tabId = normalizeTabId(requestedTab) || currentTab;
      const tabWindow = tabs.get(tabId);
      if (!tabWindow) {
        throw new Error(`Browser tab not found: ${tabId}`);
      }
      return { tabId, tabWindow };
    };
    const closeTab = async (requestedTab) => {
      const { tabId, tabWindow } = getTabState(requestedTab);
      if (tabs.size <= 1) {
        throw new Error('Cannot close the last browser tab.');
      }
      tabs.delete(tabId);
      try {
        tabWindow.destroy();
      } catch {}
      if (currentTab === tabId) {
        currentTab = tabs.has('main') ? 'main' : Array.from(tabs.keys())[0];
      }
      return tabId;
    };

    const actionResults = [];
    const mainWindow = createBrowserTaskWindow(sessionProfile);
    tabs.set('main', mainWindow);
    let currentTab = 'main';
    attachPopupHandler('main', mainWindow);
    await navigateTo(mainWindow, url, settleMs);
    for (const step of browserActions) {
      if (step.action === 'open_tab') {
        if (!step.url) throw new Error('Browser open_tab action requires a URL.');
        const openedTab = await createTab(step.tab, step.url);
        currentTab = openedTab;
        actionResults.push({
          action: 'open_tab',
          tab: openedTab,
          url: step.url,
        });
        continue;
      }
      if (step.action === 'switch_tab') {
        const { tabId } = getTabState(step.tab);
        currentTab = tabId;
        actionResults.push({
          action: 'switch_tab',
          tab: tabId,
        });
        continue;
      }
      if (step.action === 'close_tab') {
        const closedTab = await closeTab(step.tab);
        actionResults.push({
          action: 'close_tab',
          tab: closedTab,
        });
        continue;
      }
      if (step.action === 'open_popup') {
        if (!step.selector) throw new Error('Browser open_popup action requires a selector.');
        const { tabId, tabWindow } = getTabState(step.sourceTab || currentTab);
        const requestedPopupTab = normalizeTabId(step.tab) || '';
        if (requestedPopupTab && tabs.has(requestedPopupTab)) {
          throw new Error(`Browser popup tab already exists: ${requestedPopupTab}`);
        }
        const popupTarget = await resolvePopupTargetInFrame(tabWindow, step.selector, step.frame || '');
        let popupTab = '';
        if (popupTarget.href) {
          popupTab = await createTab(requestedPopupTab || 'popup', popupTarget.href);
        } else {
          popupQueue.push(requestedPopupTab);
          await clickSelectorInFrame(tabWindow, step.selector, step.frame || '');
          popupTab = await waitForPopup(requestedPopupTab, Math.max(1000, Math.min(step.ms || 8000, 20000)));
        }
        currentTab = popupTab;
        actionResults.push({
          action: 'open_popup',
          sourceTab: tabId,
          tab: popupTab,
          selector: step.selector,
          frame: step.frame || '',
          url: popupTarget.href || '',
        });
        continue;
      }
      const { tabId, tabWindow } = getTabState(step.tab);
      if (step.action === 'wait') {
        if (!step.selector) throw new Error('Browser wait action requires a selector.');
        await waitForSelectorInFrame(tabWindow, step.selector, timeoutMs, step.frame || '');
        continue;
      }
      if (step.action === 'type') {
        if (!step.selector) throw new Error('Browser type action requires a selector.');
        await setInputValueInFrame(tabWindow, step.selector, step.text || '', step.frame || '');
        await sleepMs(250);
        continue;
      }
      if (step.action === 'click') {
        if (!step.selector) throw new Error('Browser click action requires a selector.');
        await clickSelectorInFrame(tabWindow, step.selector, step.frame || '');
        await sleepMs(settleMs);
        continue;
      }
      if (step.action === 'select') {
        if (!step.selector) throw new Error('Browser select action requires a selector.');
        if (!step.value) throw new Error('Browser select action requires a value.');
        const result = await setSelectValueInFrame(tabWindow, step.selector, step.value, step.frame || '');
        actionResults.push({
          action: 'select',
          tab: tabId,
          selector: step.selector,
          frame: step.frame || '',
          value: String(result.value || step.value),
          text: String(result.text || ''),
        });
        await sleepMs(250);
        continue;
      }
      if (step.action === 'upload') {
        if (!step.selector) throw new Error('Browser upload action requires a selector.');
        if (step.frame) throw new Error('Browser upload action does not support iframe targeting yet.');
        const files = [step.path, ...(Array.isArray(step.paths) ? step.paths : [])].filter(Boolean);
        if (files.length === 0) throw new Error('Browser upload action requires at least one file path.');
        const result = await dispatchInputFiles(tabWindow, step.selector, files);
        actionResults.push({
          action: 'upload',
          tab: tabId,
          selector: step.selector,
          frame: '',
          count: Number(result.count || files.length),
          names: Array.isArray(result.names) ? result.names : files.map((file) => path.basename(file)),
        });
        await sleepMs(250);
        continue;
      }
      if (step.action === 'download') {
        if (!step.selector) throw new Error('Browser download action requires a selector.');
        const beforeCount = downloadRecords.length;
        await clickSelectorInFrame(tabWindow, step.selector, step.frame || '');
        const waitMs = Math.max(500, Math.min(step.ms || 5000, 15000));
        const started = Date.now();
        while (downloadRecords.length <= beforeCount && Date.now() - started < waitMs) {
          await sleepMs(100);
        }
        if (downloadRecords.length <= beforeCount) {
          throw new Error(`Browser download action did not start a download: ${step.selector}`);
        }
        const freshRecords = downloadRecords.slice(beforeCount);
        const completedDownloads = await Promise.race([
          Promise.all(freshRecords.map((record) => record.donePromise)),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`Browser download action timed out: ${step.selector}`)), waitMs)),
        ]);
        const downloads = completedDownloads.map((item) => ({
          tab: String(item.tab || tabId),
          url: String(item.url || ''),
          suggestedFilename: String(item.suggestedFilename || ''),
          savedPath: String(item.savedPath || ''),
          state: String(item.state || ''),
        }));
        actionResults.push({
          action: 'download',
          tab: tabId,
          selector: step.selector,
          frame: step.frame || '',
          downloads,
        });
        await sleepMs(250);
        continue;
      }
      if (step.action === 'extract') {
        if (!step.selector) throw new Error('Browser extract action requires a selector.');
        const result = await extractFromSelectorInFrame(tabWindow, step.selector, step.attribute, step.frame || '');
        actionResults.push({
          action: 'extract',
          tab: tabId,
          selector: step.selector,
          frame: step.frame || '',
          text: String(result.text || ''),
          value: String(result.value || ''),
          attribute: step.attribute || '',
          attributeValue: String(result.attributeValue || ''),
          html: String(result.html || ''),
        });
        continue;
      }
      if (step.action === 'navigate') {
        if (!step.url) throw new Error('Browser navigate action requires a URL.');
        await navigateTo(tabWindow, step.url, settleMs);
        actionResults.push({
          action: 'navigate',
          tab: tabId,
          url: step.url,
        });
        continue;
      }
      if (step.action === 'sleep') {
        await sleepMs(Math.max(0, Math.min(step.ms || 0, 10000)));
        continue;
      }
      throw new Error(`Unsupported browser action: ${step.action}`);
    }

    const { tabId: finalTabId, tabWindow: finalWindow } = getTabState('');
    const [pageInfo, image] = await Promise.all([
      finalWindow.webContents.executeJavaScript(
        `(() => {
          const title = document.title || '';
          const text = (document.body?.innerText || '').replace(/\\s+/g, ' ').trim();
          const links = Array.from(document.querySelectorAll('a[href]')).slice(0, 40).map((anchor) => ({
            href: anchor.href,
            text: (anchor.innerText || anchor.textContent || '').replace(/\\s+/g, ' ').trim(),
          }));
          return {
            title,
            finalUrl: window.location.href,
            textPreview: text.slice(0, 4000),
            links,
            width: window.innerWidth,
            height: window.innerHeight,
          };
        })();`,
        true,
      ),
      finalWindow.webContents.capturePage(),
    ]);

    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    const lower = screenshotPath.toLowerCase();
    const imageBuffer = lower.endsWith('.jpg') || lower.endsWith('.jpeg')
      ? image.toJPEG(90)
      : image.toPNG();
    fs.writeFileSync(screenshotPath, imageBuffer);

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(
      outputPath,
      JSON.stringify(
        {
          ok: true,
          mode,
          url,
          sessionProfile: sessionProfile || '',
          currentTab: finalTabId,
          openTabs: Array.from(tabs.keys()),
          screenshotPath,
          browserActions,
          actionResults,
          waitForSelector: waitFor || '',
          clickSelector: click || '',
          typeSelector: typeSelector || '',
          title: pageInfo.title || '',
          finalUrl: pageInfo.finalUrl || url,
          textPreview: pageInfo.textPreview || '',
          links: Array.isArray(pageInfo.links) ? pageInfo.links : [],
          downloads: downloadRecords.map((record) => ({
            tab: String(record.tab || ''),
            url: String(record.url || ''),
            suggestedFilename: String(record.suggestedFilename || ''),
            savedPath: String(record.savedPath || ''),
            state: String(record.state || ''),
          })),
          viewport: {
            width: Number(pageInfo.width || 0),
            height: Number(pageInfo.height || 0),
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    clearTimeout(timeout);
    browserSession.removeListener('will-download', downloadListener);
    for (const tabWindow of tabs.values()) {
      try {
        tabWindow.destroy();
      } catch {}
    }
    app.exit(0);
  } catch (error) {
    clearTimeout(timeout);
    fail(error instanceof Error ? error.message : String(error));
  }
}

main();
