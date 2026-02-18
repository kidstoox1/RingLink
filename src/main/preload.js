/**
 * Preload Script
 * contextBridge でレンダラーに安全なAPIを公開
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('radialHub', {
  // ===== 設定 =====
  config: {
    get: (key) => ipcRenderer.invoke('config:get', key),
    set: (key, value) => ipcRenderer.invoke('config:set', key, value),
    getAll: () => ipcRenderer.invoke('config:getAll'),
    export: () => ipcRenderer.invoke('config:export'),
    import: () => ipcRenderer.invoke('config:import'),
  },

  // ===== メニュー =====
  menu: {
    hide: () => ipcRenderer.send('menu:hide'),
    switchTab: (index) => ipcRenderer.send('menu:switchTab', index),
    onShow: (callback) => ipcRenderer.on('menu:show', (event, data) => callback(data)),
    onShowClipboard: (callback) => ipcRenderer.on('menu:showClipboard', () => callback()),
  },

  // ===== アクション =====
  action: {
    execute: (action) => ipcRenderer.send('action:execute', action),
  },

  // ===== クリップボード =====
  clipboard: {
    getHistory: () => ipcRenderer.invoke('clipboard:getHistory'),
    write: (text) => ipcRenderer.send('clipboard:write', text),
  },

  // ===== スクリーンキャプチャ =====
  capture: {
    request: (mode) => ipcRenderer.send('capture:request', mode),
    onStart: (callback) => ipcRenderer.on('capture:start', (event, data) => callback(data)),
    complete: (data) => ipcRenderer.send('capture:complete', data),
    onSaved: (callback) => ipcRenderer.on('capture:saved', (event, path) => callback(path)),
  },

  // ===== 設定画面 =====
  settings: {
    open: () => ipcRenderer.send('settings:open'),
  },

  // ===== ホットキー =====
  hotkeys: {
    reload: () => ipcRenderer.send('hotkeys:reload'),
  },

  // ===== ショートカット解決 =====
  shortcut: {
    resolve: (lnkPath) => ipcRenderer.invoke('shortcut:resolve', lnkPath),
  },

  // ===== シェル =====
  shell: {
    open: (target) => ipcRenderer.invoke('shell:open', target),
  },

  // ===== ダイアログ =====
  dialog: {
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  },

  // ===== スタートアップ =====
  autoLaunch: {
    get: () => ipcRenderer.invoke('autoLaunch:get'),
    set: (enabled) => ipcRenderer.invoke('autoLaunch:set', enabled),
  },

  // ===== アップデート =====
  update: {
    onProgress: (callback) => ipcRenderer.on('update:progress', (event, progress) => callback(progress)),
  },

  // ===== ファイルドロップ（.lnk解決用） =====
  file: {
    resolveDrop: async (filePath) => {
      if (filePath.endsWith('.lnk')) {
        return await ipcRenderer.invoke('shortcut:resolve', filePath);
      }
      // フォルダやファイルの場合はそのままパスを返し、アイコンも取得
      let iconData = '';
      try { iconData = await ipcRenderer.invoke('file:getIcon', filePath); } catch(e) {}
      return {
        target: filePath,
        name: filePath.split('\\').pop().split('/').pop(),
        iconData: iconData,
      };
    },
    getIcon: (filePath) => ipcRenderer.invoke('file:getIcon', filePath),
  },
});
