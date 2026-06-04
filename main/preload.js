const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('voiceAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  doRecognize: (audioData) => ipcRenderer.invoke('do-recognize', audioData),
  doNativeRecognize: () => ipcRenderer.invoke('do-native-recognize'),
  pasteText: (text) => ipcRenderer.invoke('paste-text', text),
  onSwitchToNative: (cb) => ipcRenderer.on('switch-to-native-mode', () => cb()),
});
