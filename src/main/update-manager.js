/**
 * UpdateManager - 自動アップデート管理
 * GitHub Releases + electron-updater を使用
 */

const { autoUpdater } = require('electron-updater');
const { dialog, BrowserWindow } = require('electron');
const log = require('electron-log');

class UpdateManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.manualCheck = false;

    // electron-updater のログをelectron-logに統合
    autoUpdater.logger = log;
    autoUpdater.logger.transports.file.level = 'info';

    // 自動ダウンロードはOFF（ユーザーの確認を待つ）
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    this.setupEvents();
  }

  setupEvents() {
    // アップデート確認中
    autoUpdater.on('checking-for-update', () => {
      log.info('Checking for updates...');
    });

    // アップデートあり
    autoUpdater.on('update-available', (info) => {
      log.info('Update available:', info.version);
      this.promptUpdate(info);
    });

    // アップデートなし
    autoUpdater.on('update-not-available', (info) => {
      log.info('No updates available. Current:', info.version);
      if (this.manualCheck) {
        this.manualCheck = false;
        dialog.showMessageBox({
          type: 'info',
          title: 'Ring-Link',
          message: '最新バージョンです',
          detail: `現在のバージョン: ${require('../../package.json').version}`,
        });
      }
    });

    // ダウンロード進捗
    autoUpdater.on('download-progress', (progress) => {
      const msg = `ダウンロード中: ${Math.round(progress.percent)}%`;
      log.info(msg);
      if (this.mainWindow) {
        this.mainWindow.webContents.send('update:progress', progress);
      }
    });

    // ダウンロード完了
    autoUpdater.on('update-downloaded', (info) => {
      log.info('Update downloaded:', info.version);
      this.promptInstall(info);
    });

    // エラー
    autoUpdater.on('error', (err) => {
      log.error('Update error:', err);
      if (this.manualCheck) {
        this.manualCheck = false;
        dialog.showMessageBox({
          type: 'warning',
          title: 'Ring-Link',
          message: 'アップデートの確認に失敗しました',
          detail: 'インターネット接続を確認してください。',
        });
      }
    });
  }

  /**
   * アップデート確認
   * @param {boolean} manual - 手動チェックの場合true（結果を必ず表示）
   */
  async checkForUpdates(manual = false) {
    this.manualCheck = manual;
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      log.error('Update check failed:', err);
      if (manual) {
        this.manualCheck = false;
        dialog.showMessageBox({
          type: 'warning',
          title: 'Ring-Link',
          message: 'アップデートの確認に失敗しました',
          detail: 'インターネット接続を確認してください。',
        });
      }
    }
  }

  /**
   * アップデート確認ダイアログ
   */
  async promptUpdate(info) {
    const result = await dialog.showMessageBox({
      type: 'info',
      title: 'Ring-Link アップデート',
      message: `新しいバージョン ${info.version} が利用可能です`,
      detail: `現在: ${require('../../package.json').version}\n新バージョン: ${info.version}\n\nダウンロードしますか？`,
      buttons: ['今すぐダウンロード', '後で'],
      defaultId: 0,
      cancelId: 1,
    });

    if (result.response === 0) {
      autoUpdater.downloadUpdate();
    }
  }

  /**
   * インストール確認ダイアログ
   */
  async promptInstall(info) {
    const result = await dialog.showMessageBox({
      type: 'info',
      title: 'Ring-Link アップデート',
      message: `バージョン ${info.version} のインストール準備ができました`,
      detail: 'アプリを再起動してアップデートを適用しますか？',
      buttons: ['再起動してアップデート', '後で（次回起動時に適用）'],
      defaultId: 0,
      cancelId: 1,
    });

    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  }
}

module.exports = UpdateManager;
