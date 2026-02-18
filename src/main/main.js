/**
 * Ring-Link - メインプロセス
 * Electronのメインプロセス。ウィンドウ管理、ホットキー、トレイアイコン等を担当。
 */

const { app, BrowserWindow, globalShortcut, Tray, Menu, ipcMain, screen, nativeImage, clipboard } = require('electron');
const path = require('path');
const ConfigManager = require('./config-manager');
const ClipboardWatcher = require('./clipboard-watcher');
const UpdateManager = require('./update-manager');
const log = require('electron-log');

// ログ設定
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

// ===== グローバル変数 =====
let mainWindow = null;      // ラジアルメニューウィンドウ
let settingsWindow = null;  // 設定画面ウィンドウ
let captureWindow = null;   // キャプチャウィンドウ
let tray = null;            // システムトレイ
let config = null;          // 設定マネージャー
let clipboardWatcher = null;// クリップボード監視
let updateManager = null;   // アップデート管理
let isMenuVisible = false;

// 多重起動防止
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // 既に起動中なら、メニューを表示
    if (mainWindow) {
      showRadialMenu();
    }
  });
}

// ===== アプリ起動 =====
app.whenReady().then(async () => {
  log.info('Ring-Link starting...');

  // 設定読み込み
  config = new ConfigManager();
  config.load();
  log.info(`Config loaded: version ${config.get('version')}`);

  // スタートアップ自動起動の設定
  setupAutoLaunch();

  // クリップボード監視開始
  clipboardWatcher = new ClipboardWatcher(config);
  if (config.get('clipboard.enabled')) {
    clipboardWatcher.start();
  }

  // ラジアルメニューウィンドウ作成
  createMainWindow();

  // トレイアイコン作成
  createTray();

  // グローバルホットキー登録
  registerHotkeys();

  // 自動アップデート確認
  updateManager = new UpdateManager(mainWindow);
  updateManager.checkForUpdates();

  // IPC通信ハンドラ登録
  registerIpcHandlers();

  log.info('Ring-Link ready');
});

// ===== ウィンドウ作成 =====
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 560,
    height: 460,
    show: false,           // 初期非表示
    frame: false,          // フレームなし
    transparent: true,     // 背景透過
    resizable: false,
    skipTaskbar: true,      // タスクバーに表示しない
    alwaysOnTop: true,      // 最前面
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'menu.html'));

  // フォーカスが外れたらメニューを閉じる
  mainWindow.on('blur', () => {
    hideRadialMenu();
  });

  // DevTools（開発時のみ）
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    show: true,
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  settingsWindow.loadFile(path.join(__dirname, '..', 'renderer', 'settings.html'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
    // 設定画面が閉じたらホットキーを再登録（設定変更が反映されるように）
    config.load();
    registerHotkeys();
  });
}

// ===== ラジアルメニュー表示/非表示 =====
function showRadialMenu() {
  if (!mainWindow) return;

  // マウスカーソル位置に表示
  const cursorPos = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPos);
  const { bounds } = display;

  // ウィンドウサイズ
  const winSize = mainWindow.getSize();
  let x = cursorPos.x - winSize[0] / 2;
  let y = cursorPos.y - winSize[1] / 2;

  // 画面外にはみ出さないよう調整
  x = Math.max(bounds.x, Math.min(x, bounds.x + bounds.width - winSize[0]));
  y = Math.max(bounds.y, Math.min(y, bounds.y + bounds.height - winSize[1]));

  mainWindow.setPosition(Math.round(x), Math.round(y));
  mainWindow.show();
  mainWindow.focus();
  isMenuVisible = true;

  // 現在のタブ情報をレンダラーに送信
  mainWindow.webContents.send('menu:show', {
    tabs: config.get('tabs'),
    currentTab: config.get('currentTab') || 0,
    theme: (config.get('appearance') || {}).theme || 'dark',
  });
}

function hideRadialMenu() {
  if (!mainWindow || !isMenuVisible) return;
  mainWindow.hide();
  isMenuVisible = false;
}

// ===== ホットキー登録 =====
function registerHotkeys() {
  // 既存のショートカットを全解除
  globalShortcut.unregisterAll();

  const hotkeys = config.get('hotkeys') || {};

  // メニュー呼び出し
  if (hotkeys.toggleMenu) {
    globalShortcut.register(hotkeys.toggleMenu, () => {
      if (isMenuVisible) {
        hideRadialMenu();
      } else {
        showRadialMenu();
      }
    });
  }

  // クリップボード履歴
  if (hotkeys.clipboardHistory) {
    globalShortcut.register(hotkeys.clipboardHistory, () => {
      showRadialMenu();
      mainWindow.webContents.send('menu:showClipboard');
    });
  }

  // 範囲キャプチャ → クリップボード
  if (hotkeys.screenshotClip) {
    globalShortcut.register(hotkeys.screenshotClip, () => {
      startScreenCapture('clipboard');
    });
  }

  // 範囲キャプチャ → ファイル保存
  if (hotkeys.screenshotSave) {
    globalShortcut.register(hotkeys.screenshotSave, () => {
      startScreenCapture('file');
    });
  }

  // 設定画面を開く
  if (hotkeys.openSettings) {
    globalShortcut.register(hotkeys.openSettings, () => {
      createSettingsWindow();
    });
  }

  // 次のタブ
  if (hotkeys.nextTab) {
    globalShortcut.register(hotkeys.nextTab, () => {
      switchTab(1);
    });
  }

  // 前のタブ
  if (hotkeys.prevTab) {
    globalShortcut.register(hotkeys.prevTab, () => {
      switchTab(-1);
    });
  }

  log.info('Hotkeys registered:', Object.keys(hotkeys));
}

// タブ切替
function switchTab(direction) {
  const tabs = config.get('tabs') || [];
  if (tabs.length <= 1) return;
  let current = config.get('currentTab') || 0;
  current = (current + direction + tabs.length) % tabs.length;
  config.set('currentTab', current);
  // メニューが表示中なら再描画
  if (isMenuVisible && mainWindow) {
    mainWindow.webContents.send('menu:show', {
      tabs: tabs,
      currentTab: current,
      theme: (config.get('appearance') || {}).theme || 'dark',
    });
  }
}

// ===== スクリーンキャプチャ =====
function startScreenCapture(mode) {
  // キャプチャ用のフルスクリーン透明ウィンドウを作成
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.bounds;

  captureWindow = new BrowserWindow({
    x: 0,
    y: 0,
    width: width,
    height: height,
    fullscreen: true,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    cursor: 'crosshair',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  captureWindow.loadFile(path.join(__dirname, '..', 'renderer', 'capture.html'));
  captureWindow.webContents.on('did-finish-load', () => {
    captureWindow.webContents.send('capture:start', { mode, width, height });
  });

  // キャプチャ完了のハンドリングはIPC経由
}

// ===== システムトレイ =====
function createTray() {
  // Ring-Link アイコン（assets/icon.png）
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'icon.png');
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } catch (e) {
    // フォールバック
    trayIcon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAADlJREFUOI1jYBhowMjAwPCfgYHhP5T+D8U4MQsDAwMDExETsAImYjUMGgOjBjAwMDAwUOoCcgArLwAAvqcHEWBL5OAAAAAASUVORK5CYII='
    );
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('Ring-Link');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'メニューを開く',
      click: () => showRadialMenu()
    },
    { type: 'separator' },
    {
      label: '設定',
      click: () => createSettingsWindow()
    },
    {
      label: 'アップデート確認',
      click: () => updateManager.checkForUpdates(true)
    },
    { type: 'separator' },
    {
      label: 'Ring-Link を終了',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => showRadialMenu());
}

// ===== IPC通信ハンドラ =====
function registerIpcHandlers() {
  // 設定の取得
  ipcMain.handle('config:get', (event, key) => {
    return config.get(key);
  });

  // 設定の保存
  ipcMain.handle('config:set', (event, key, value) => {
    config.set(key, value);
    return true;
  });

  // 設定全体の取得
  ipcMain.handle('config:getAll', () => {
    return config.getAll();
  });

  // 設定のエクスポート
  ipcMain.handle('config:export', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showSaveDialog({
      title: '設定をエクスポート',
      defaultPath: 'radialhub-config.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (!result.canceled) {
      config.exportTo(result.filePath);
      return result.filePath;
    }
    return null;
  });

  // 設定のインポート
  ipcMain.handle('config:import', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog({
      title: '設定をインポート',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (!result.canceled && result.filePaths.length > 0) {
      config.importFrom(result.filePaths[0]);
      registerHotkeys(); // ホットキー再登録
      return true;
    }
    return false;
  });

  // メニューアクション実行
  ipcMain.on('action:execute', (event, action) => {
    executeAction(action);
  });

  // メニューを閉じる
  ipcMain.on('menu:hide', () => {
    hideRadialMenu();
  });

  // タブ切替（メニューからの数字キー）
  ipcMain.on('menu:switchTab', (event, tabIndex) => {
    const tabs = config.get('tabs') || [];
    if (tabIndex >= 0 && tabIndex < tabs.length) {
      config.set('currentTab', tabIndex);
      if (mainWindow) {
        mainWindow.webContents.send('menu:show', { tabs, currentTab: tabIndex, theme: (config.get('appearance') || {}).theme || 'dark' });
      }
    }
  });

  // クリップボード履歴の取得
  ipcMain.handle('clipboard:getHistory', () => {
    return clipboardWatcher.getHistory();
  });

  // クリップボードに書き込み
  ipcMain.on('clipboard:write', (event, text) => {
    clipboard.writeText(text);
  });

  // スクリーンキャプチャ
  ipcMain.on('capture:request', (event, mode) => {
    startScreenCapture(mode);
  });

  // キャプチャ完了 - boundsを受け取り、実際に画面をキャプチャ
  ipcMain.on('capture:complete', async (event, data) => {
    if (!data || !data.bounds) {
      log.warn('Capture complete called without bounds');
      return;
    }
    try {
      const { mode, bounds } = data;

      // キャプチャウィンドウを先に閉じる（オーバーレイが写らないように）
      if (captureWindow && !captureWindow.isDestroyed()) {
        captureWindow.hide();
        captureWindow.close();
        captureWindow = null;
      }

      // ウィンドウが完全に消えるのを待つ
      await new Promise(resolve => setTimeout(resolve, 200));

      const display = screen.getPrimaryDisplay();
      const scaleFactor = display.scaleFactor || 1;

      // desktopCapturerで画面全体をキャプチャ
      const { desktopCapturer } = require('electron');
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.round(display.bounds.width * scaleFactor),
          height: Math.round(display.bounds.height * scaleFactor),
        },
      });

      if (!sources || sources.length === 0) {
        log.error('No screen sources found');
        return;
      }

      const fullImage = sources[0].thumbnail;

      // 選択範囲で切り抜き（スケールファクター考慮）
      const cropped = fullImage.crop({
        x: Math.round(bounds.x * scaleFactor),
        y: Math.round(bounds.y * scaleFactor),
        width: Math.round(bounds.width * scaleFactor),
        height: Math.round(bounds.height * scaleFactor),
      });

      if (mode === 'clipboard') {
        clipboard.writeImage(cropped);
        log.info('Screenshot copied to clipboard');
      } else if (mode === 'file') {
        const fs = require('fs');
        const saveDir = config.get('screenshot.saveDir') || path.join(app.getPath('pictures'), 'Ring-Link');
        if (!fs.existsSync(saveDir)) {
          fs.mkdirSync(saveDir, { recursive: true });
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filePath = path.join(saveDir, `capture-${timestamp}.png`);
        fs.writeFileSync(filePath, cropped.toPNG());
        log.info('Screenshot saved:', filePath);
        if (mainWindow) {
          mainWindow.webContents.send('capture:saved', filePath);
        }
      }
    } catch (e) {
      log.error('Capture failed:', e);
    }
  });

  // 設定画面を開く
  ipcMain.on('settings:open', () => {
    createSettingsWindow();
  });

  // ホットキー再登録
  ipcMain.on('hotkeys:reload', () => {
    registerHotkeys();
  });

  // ショートカット解決（.lnk ファイルの実際のパスを取得）
  ipcMain.handle('shortcut:resolve', async (event, lnkPath) => {
    try {
      const { shell } = require('electron');
      const resolved = shell.readShortcutLink(lnkPath);
      // ネイティブアイコンを取得
      let iconData = '';
      try {
        const nImg = await app.getFileIcon(resolved.target, { size: 'large' });
        iconData = nImg.toDataURL();
      } catch (e) { /* アイコン取得失敗はスキップ */ }
      return {
        target: resolved.target,
        args: resolved.args,
        icon: resolved.icon,
        iconData: iconData,
        name: path.basename(lnkPath, '.lnk'),
      };
    } catch (e) {
      log.error('Failed to resolve shortcut:', e);
      return null;
    }
  });

  // ファイルのネイティブアイコンを取得
  ipcMain.handle('file:getIcon', async (event, filePath) => {
    try {
      const nImg = await app.getFileIcon(filePath, { size: 'large' });
      return nImg.toDataURL();
    } catch (e) {
      return '';
    }
  });

  // アプリ/ファイル/URLを開く
  ipcMain.handle('shell:open', async (event, target) => {
    const { shell } = require('electron');
    try {
      await shell.openPath(target);
      return true;
    } catch (e) {
      try {
        await shell.openExternal(target);
        return true;
      } catch (e2) {
        log.error('Failed to open:', target, e2);
        return false;
      }
    }
  });

  // ファイル/フォルダ選択ダイアログ
  ipcMain.handle('dialog:openFile', async (event) => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(settingsWindow || mainWindow, {
      title: 'ショートカットまたはファイルを選択',
      properties: ['openFile'],
      filters: [
        { name: 'ショートカット', extensions: ['lnk', 'url'] },
        { name: '実行ファイル', extensions: ['exe', 'bat', 'cmd', 'ps1'] },
        { name: 'すべてのファイル', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths.length) return null;
    const filePath = result.filePaths[0];
    let target = filePath, name = path.basename(filePath).replace(/\.[^.]+$/, '');
    // .lnk なら解決
    if (filePath.endsWith('.lnk')) {
      try {
        const { shell } = require('electron');
        const resolved = shell.readShortcutLink(filePath);
        target = resolved.target;
        name = path.basename(filePath, '.lnk');
      } catch (e) { /* fall through */ }
    }
    // ネイティブアイコン取得
    let iconData = '';
    try {
      const nImg = await app.getFileIcon(target, { size: 'large' });
      iconData = nImg.toDataURL();
    } catch (e) { /* skip */ }
    return { target, name, iconData };
  });

  // フォルダ選択ダイアログ
  ipcMain.handle('dialog:openFolder', async (event) => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(settingsWindow || mainWindow, {
      title: 'フォルダを選択',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    const folderPath = result.filePaths[0];
    let iconData = '';
    try {
      const nImg = await app.getFileIcon(folderPath, { size: 'large' });
      iconData = nImg.toDataURL();
    } catch (e) { /* skip */ }
    return {
      target: folderPath,
      name: path.basename(folderPath),
      iconData,
    };
  });

  // スタートアップ自動起動の切替
  ipcMain.handle('autoLaunch:get', () => {
    return config.get('general.autoStart') !== false;
  });

  ipcMain.handle('autoLaunch:set', (event, enabled) => {
    config.set('general.autoStart', enabled);
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
      args: [],
    });
    log.info('Auto-launch changed:', enabled);
    return true;
  });
}

// ===== アクション実行 =====
function executeAction(action) {
  const { shell } = require('electron');

  switch (action.type) {
    case 'launch':
      if (action.target.startsWith('http://') || action.target.startsWith('https://') || action.target.startsWith('mailto:')) {
        shell.openExternal(action.target);
      } else {
        shell.openPath(action.target);
      }
      break;

    case 'text':
      // 定型文をクリップボードに書き込み、Ctrl+Vをシミュレート
      clipboard.writeText(action.target);
      hideRadialMenu();
      // 少し待ってからペースト（メニューが閉じるのを待つ）
      setTimeout(() => {
        const { keyboard } = require('./utils');
        keyboard.paste();
      }, 150);
      break;

    case 'clipboard':
      // クリップボード履歴サブメニュー表示（レンダラーで処理）
      break;

    case 'templates':
      // 定型文一覧サブメニュー表示（レンダラーで処理）
      break;

    case 'screenshot_clip':
      startScreenCapture('clipboard');
      break;

    case 'screenshot_save':
      startScreenCapture('file');
      break;

    default:
      log.warn('Unknown action type:', action.type);
  }

  // launch, text, screenshot の場合はメニューを閉じる
  if (['launch', 'text', 'screenshot_clip', 'screenshot_save'].includes(action.type)) {
    hideRadialMenu();
  }
}

// ===== キャプチャ完了処理 =====
function handleCaptureComplete(mode, imageDataUrl, bounds) {
  if (!imageDataUrl) {
    log.warn('Capture cancelled or no image data');
    return;
  }

  const imageBuffer = nativeImage.createFromDataURL(imageDataUrl);

  if (mode === 'clipboard') {
    // クリップボードに画像をコピー
    clipboard.writeImage(imageBuffer);
    log.info('Screenshot copied to clipboard');
  } else if (mode === 'file') {
    // ファイルに保存
    const fs = require('fs');
    const saveDir = config.get('screenshot.saveDir') || path.join(app.getPath('pictures'), 'Ring-Link');

    if (!fs.existsSync(saveDir)) {
      fs.mkdirSync(saveDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filePath = path.join(saveDir, `capture-${timestamp}.png`);
    fs.writeFileSync(filePath, imageBuffer.toPNG());
    log.info('Screenshot saved:', filePath);

    // 保存先を通知
    if (mainWindow) {
      mainWindow.webContents.send('capture:saved', filePath);
    }
  }
}

// ===== スタートアップ自動起動 =====
function setupAutoLaunch() {
  const autoStart = config.get('general.autoStart');
  app.setLoginItemSettings({
    openAtLogin: autoStart !== false, // デフォルトon
    path: process.execPath,
    args: [],
  });
  log.info('Auto-launch:', autoStart !== false);
}

// ===== アプリ終了処理 =====
app.on('window-all-closed', () => {
  // メインウィンドウが閉じてもトレイで常駐
  // 何もしない
});

app.on('before-quit', () => {
  // クリーンアップ
  globalShortcut.unregisterAll();
  if (clipboardWatcher) clipboardWatcher.stop();
  log.info('Ring-Link shutting down');
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
