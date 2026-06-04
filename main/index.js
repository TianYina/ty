const { app, Tray, Menu, BrowserWindow, globalShortcut, ipcMain, clipboard, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

let tray = null;
let mainWindow = null;
let settingsWindow = null;

function createTrayIcon() {
  const iconPath = path.join(__dirname, '..', 'tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  tray.setToolTip('Voice Input - Ctrl+Shift+V');
  updateTrayMenu();
}

function updateTrayMenu() {
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Start Voice Input (Ctrl+Shift+V)', click: () => createRecordWindow() },
    { type: 'separator' },
    { label: 'Settings...', click: () => createSettingsWindow() },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);
}

function createRecordWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.focus(); return; }
  mainWindow = new BrowserWindow({
    width: 400, height: 220,
    frame: false, resizable: false, alwaysOnTop: true, skipTaskbar: true, transparent: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'record.html'));
  mainWindow.once('ready-to-show', () => {
    const cursor = require('electron').screen.getCursorScreenPoint();
    const display = require('electron').screen.getDisplayNearestPoint(cursor);
    const { x, y, width, height } = display.workArea;
    const winBounds = mainWindow.getBounds();
    mainWindow.setPosition(
      Math.round(x + (width - winBounds.width) / 2),
      Math.round(y + (height - winBounds.height) / 2)
    );
    mainWindow.show();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.focus(); return; }
  settingsWindow = new BrowserWindow({
    width: 520, height: 600, resizable: false, title: 'Voice Input Settings',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  settingsWindow.loadFile(path.join(__dirname, '..', 'renderer', 'settings.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

// IPC handlers
ipcMain.handle('get-config', async () => {
  try {
    const stt = require('./stt-provider');
    return { providers: stt.getProviders(), currentProvider: stt.getCurrentProvider(), config: stt.getConfig() };
  } catch (e) { return { error: e.message }; }
});

ipcMain.handle('save-config', async (event, newConfig) => {
  try {
    const stt = require('./stt-provider');
    if (newConfig.provider) stt.setProvider(newConfig.provider);
    stt.setConfig({
      apiKey: newConfig.apiKey !== undefined ? newConfig.apiKey : stt.getConfig().apiKey,
      secretKey: newConfig.secretKey !== undefined ? newConfig.secretKey : stt.getConfig().secretKey,
    });
    return { success: true };
  } catch (e) { return { error: e.message }; }
});

ipcMain.handle('do-recognize', async (event, audioBase64) => {
  try {
    const stt = require('./stt-provider');
    if (!audioBase64 || audioBase64.length < 100) throw new Error('Audio data is empty');
    const buffer = Buffer.from(audioBase64, 'base64');
    const text = await stt.recognize(buffer);
    return { text };
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle('do-native-recognize', async () => {
  try {
    const windowsStt = require('./windows-stt');
    const text = await windowsStt.recognize();
    return { text };
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle('paste-text', async (event, text) => {
  try {
    clipboard.writeText(text);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
    await new Promise(r => setTimeout(r, 200));
    const { execSync } = require('child_process');
    execSync('powershell.exe -NoProfile -Command "& {Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'^{v}\')}"', { timeout: 5000 });
    return { success: true };
  } catch (err) { return { error: err.message }; }
});

function registerShortcuts() {
  globalShortcut.register('CmdOrCtrl+Shift+V', () => { createRecordWindow(); });
}

app.whenReady().then(() => {
  createTrayIcon();
  registerShortcuts();
});

app.on('window-all-closed', (e) => { e.preventDefault(); });
app.on('before-quit', () => { globalShortcut.unregisterAll(); });
