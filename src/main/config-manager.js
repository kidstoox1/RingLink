/**
 * ConfigManager - 設定ファイル管理
 * 読み書き、バックアップ、エクスポート/インポート、バージョンマイグレーション
 */

const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');

// 現在の設定バージョン（形式が変わったらインクリメント）
const CURRENT_CONFIG_VERSION = 2;

// デフォルト設定
const DEFAULT_CONFIG = {
  version: CURRENT_CONFIG_VERSION,
  currentTab: 0,

  // タブ定義
  tabs: [
    {
      id: 'tab-default',
      name: '共通',
      icon: '⚙️',
      items: [
        { icon: '📧', label: 'メール', type: 'launch', target: '' },
        { icon: '💬', label: 'チャット', type: 'launch', target: '' },
        { icon: '📅', label: 'カレンダー', type: 'launch', target: '' },
        { icon: '📋', label: 'クリップボード', type: 'clipboard', target: '' },
        { icon: '🔍', label: '検索', type: 'launch', target: '' },
        { icon: '📑', label: '定型文', type: 'templates', target: '' },
        { icon: '✂️', label: 'キャプチャ→CLP', type: 'screenshot_clip', target: '' },
        { icon: '⚙️', label: '設定', type: 'launch', target: 'settings' },
      ],
      registered: [],
    }
  ],

  // 共通定型文（全タブ共通）
  templates: [
    'お世話になっております。',
    'ご確認よろしくお願いいたします。',
  ],

  // ホットキー
  hotkeys: {
    toggleMenu: 'Ctrl+Space',
    clipboardHistory: 'Ctrl+Shift+V',
    templateList: 'Ctrl+Shift+T',
    screenshotClip: 'Ctrl+Shift+S',
    screenshotSave: 'Ctrl+Shift+A',
    openSettings: 'Ctrl+Shift+,',
    nextTab: 'Ctrl+Tab',
    prevTab: 'Ctrl+Shift+Tab',
  },

  // クリップボード設定
  clipboard: {
    enabled: true,
    maxHistory: 100,
    saveImages: true,
    excludePasswords: true,
  },

  // スクリーンショット設定
  screenshot: {
    saveDir: '',  // 空 = ピクチャ/Ring-Link
  },

  // 外観設定
  appearance: {
    menuSize: 380,
    opacity: 95,
    animation: true,
    darkMode: true,
  },

  // 一般設定
  general: {
    autoStart: true,
    language: 'ja',
  },
};

class ConfigManager {
  constructor() {
    this.configDir = path.join(app.getPath('userData'));
    this.configPath = path.join(this.configDir, 'config.json');
    this.backupDir = path.join(this.configDir, 'backups');
    this.data = null;
  }

  /**
   * 設定ファイルを読み込み
   */
  load() {
    try {
      // ディレクトリ確認
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }
      if (!fs.existsSync(this.backupDir)) {
        fs.mkdirSync(this.backupDir, { recursive: true });
      }

      // ファイル読み込み
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8');
        this.data = JSON.parse(raw);

        // バージョンマイグレーション
        this.migrate();

        log.info('Config loaded from:', this.configPath);
      } else {
        // 初回起動：デフォルト設定を使用
        this.data = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        this.save();
        log.info('Config created with defaults');
      }
    } catch (err) {
      log.error('Failed to load config:', err);
      // 破損した場合はバックアップしてデフォルトに戻す
      this.recoverFromError();
    }
  }

  /**
   * 設定をファイルに保存
   */
  save() {
    try {
      const json = JSON.stringify(this.data, null, 2);
      fs.writeFileSync(this.configPath, json, 'utf-8');
    } catch (err) {
      log.error('Failed to save config:', err);
    }
  }

  /**
   * 値の取得（ドット記法対応: 'clipboard.maxHistory'）
   */
  get(key) {
    if (!key) return this.data;
    const keys = key.split('.');
    let value = this.data;
    for (const k of keys) {
      if (value == null) return undefined;
      value = value[k];
    }
    return value;
  }

  /**
   * 値の設定（ドット記法対応）
   */
  set(key, value) {
    const keys = key.split('.');
    let obj = this.data;
    for (let i = 0; i < keys.length - 1; i++) {
      if (obj[keys[i]] == null) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    this.save();
  }

  /**
   * 全設定を取得
   */
  getAll() {
    return JSON.parse(JSON.stringify(this.data));
  }

  /**
   * 設定をエクスポート
   */
  exportTo(filePath) {
    try {
      const exportData = {
        ...this.data,
        _exportedAt: new Date().toISOString(),
        _appVersion: app.getVersion(),
      };
      fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2), 'utf-8');
      log.info('Config exported to:', filePath);
      return true;
    } catch (err) {
      log.error('Export failed:', err);
      return false;
    }
  }

  /**
   * 設定をインポート
   */
  importFrom(filePath) {
    try {
      // 現在の設定をバックアップ
      this.createBackup('pre-import');

      const raw = fs.readFileSync(filePath, 'utf-8');
      const imported = JSON.parse(raw);

      // エクスポート専用フィールドを除去
      delete imported._exportedAt;
      delete imported._appVersion;

      this.data = imported;
      this.migrate(); // マイグレーション実行
      this.save();

      log.info('Config imported from:', filePath);
      return true;
    } catch (err) {
      log.error('Import failed:', err);
      return false;
    }
  }

  /**
   * バックアップ作成
   */
  createBackup(reason = 'auto') {
    try {
      if (!fs.existsSync(this.configPath)) return;

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const backupName = `config-${reason}-${timestamp}.json`;
      const backupPath = path.join(this.backupDir, backupName);

      fs.copyFileSync(this.configPath, backupPath);
      log.info('Backup created:', backupName);

      // 古いバックアップを削除（最大20個保持）
      this.cleanOldBackups(20);
    } catch (err) {
      log.error('Backup failed:', err);
    }
  }

  /**
   * 古いバックアップの削除
   */
  cleanOldBackups(maxKeep) {
    try {
      const files = fs.readdirSync(this.backupDir)
        .filter(f => f.startsWith('config-') && f.endsWith('.json'))
        .map(f => ({ name: f, time: fs.statSync(path.join(this.backupDir, f)).mtime }))
        .sort((a, b) => b.time - a.time);

      if (files.length > maxKeep) {
        for (const file of files.slice(maxKeep)) {
          fs.unlinkSync(path.join(this.backupDir, file.name));
        }
      }
    } catch (err) {
      log.error('Cleanup failed:', err);
    }
  }

  /**
   * バージョンマイグレーション
   * 設定形式が変更された場合に古い形式を新しい形式に変換する
   */
  migrate() {
    const currentVersion = this.data.version || 0;

    if (currentVersion >= CURRENT_CONFIG_VERSION) {
      return; // 最新バージョン
    }

    // マイグレーション前にバックアップ
    this.createBackup('pre-migrate');

    log.info(`Migrating config from v${currentVersion} to v${CURRENT_CONFIG_VERSION}`);

    // v0 → v1: 初期構造（将来のマイグレーション例）
    if (currentVersion < 1) {
      // デフォルト値で不足フィールドを補完
      this.data = this.deepMerge(DEFAULT_CONFIG, this.data);
      this.data.version = 1;
    }

    // ===== v1 → v2: 定型文をタブ内からトップレベルに移動 =====
    if (currentVersion < 2) {
      // 各タブの templates を集約してトップレベルに
      const allTemplates = [];
      if (this.data.tabs) {
        this.data.tabs.forEach(tab => {
          if (tab.templates && tab.templates.length) {
            tab.templates.forEach(t => {
              if (!allTemplates.includes(t)) allTemplates.push(t);
            });
          }
          delete tab.templates; // タブからは削除
        });
      }
      this.data.templates = allTemplates.length > 0 ? allTemplates : ['お世話になっております。', 'ご確認よろしくお願いいたします。'];
      // 設定画面ホットキー追加
      if (this.data.hotkeys && !this.data.hotkeys.openSettings) {
        this.data.hotkeys.openSettings = 'Ctrl+Shift+,';
      }
      this.data.version = 2;
    }

    this.save();
    log.info('Migration complete');
  }

  /**
   * エラー時のリカバリ
   */
  recoverFromError() {
    log.warn('Recovering from config error...');

    // 破損ファイルをバックアップ
    if (fs.existsSync(this.configPath)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const corruptPath = path.join(this.backupDir, `config-corrupt-${timestamp}.json`);
      try {
        fs.copyFileSync(this.configPath, corruptPath);
      } catch (e) { /* ignore */ }
    }

    // デフォルトに戻す
    this.data = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    this.save();
    log.info('Config reset to defaults');
  }

  /**
   * ディープマージ（デフォルト値 + ユーザー値）
   */
  deepMerge(defaults, overrides) {
    const result = { ...defaults };
    for (const key in overrides) {
      if (overrides[key] !== null && typeof overrides[key] === 'object' && !Array.isArray(overrides[key])) {
        result[key] = this.deepMerge(defaults[key] || {}, overrides[key]);
      } else {
        result[key] = overrides[key];
      }
    }
    return result;
  }
}

module.exports = ConfigManager;
