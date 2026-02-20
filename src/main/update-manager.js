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
    this.isDownloading = false;

    // electron-updater のログをelectron-logに統合
    autoUpdater.logger = log;
    autoUpdater.logger.transports.file.level = 'info';

    // 自動ダウンロードはOFF（ユーザーの確認を待つ）
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    // コード署名なしでもアップデートを許可
    autoUpdater.forceDevUpdateConfig = false;

    this.setupEvents();
  }

  setupEvents() {
    autoUpdater.on('checking-for-update', () => {
      log.info('Checking for updates...');
    });

    autoUpdater.on('update-available', (info) => {
      log.info('Update available:', info.version);
      this.promptUpdate(info);
    });

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

    autoUpdater.on('download-progress', (progress) => {
      const pct = Math.round(progress.percent);
      log.info(`Download progress: ${pct}%`);
      if (this.mainWindow) {
        this.mainWindow.webContents.send('update:progress', progress);
      }
    });

    autoUpdater.on('update-downloaded', (info) => {
      log.info('Update downloaded:', info.version);
      this.isDownloading = false;
      this.promptInstall(info);
    });

    autoUpdater.on('error', (err) => {
      log.error('Update error:', err);
      this.isDownloading = false;

      // ダウンロード中のエラーか確認中のエラーかで分ける
      const errMsg = err.message || err.toString();
      log.error('Update error detail:', errMsg);

      if (this.manualCheck) {
        this.manualCheck = false;
        dialog.showMessageBox({
          type: 'warning',
          title: 'Ring-Link',
          message: 'アップデートに失敗しました',
          detail: `エラー: ${errMsg}`,
        });
      }
    });
  }

  async checkForUpdates(manual = false) {
    this.manualCheck = manual;
    try {
      log.info('Starting update check... manual=' + manual);
      await autoUpdater.checkForUpdates();
    } catch (err) {
      log.error('Update check failed:', err);
      if (manual) {
        this.manualCheck = false;
        dialog.showMessageBox({
          type: 'warning',
          title: 'Ring-Link',
          message: 'アップデートの確認に失敗しました',
          detail: `エラー: ${err.message || err.toString()}`,
        });
      }
    }
  }

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
      this.isDownloading = true;
      this.manualCheck = true; // ダウンロードエラー時にも表示するため
      try {
        log.info('Starting download...');
        await autoUpdater.downloadUpdate();
      } catch (err) {
        this.isDownloading = false;
        log.error('Download failed:', err);
        dialog.showMessageBox({
          type: 'warning',
          title: 'Ring-Link',
          message: 'ダウンロードに失敗しました',
          detail: `エラー: ${err.message || err.toString()}`,
        });
      }
    }
  }

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
