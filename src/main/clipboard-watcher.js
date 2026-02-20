/**
 * ClipboardWatcher - クリップボード監視
 * 一定間隔でクリップボードを監視し、変更があれば履歴に追加
 */

const { clipboard, nativeImage } = require('electron');
const log = require('electron-log');

class ClipboardWatcher {
  constructor(config) {
    this.config = config;
    this.history = [];
    this.lastText = '';
    this.lastImageHash = '';
    this.intervalId = null;
    this.watchInterval = 500; // 500ms間隔で監視
  }

  start() {
    if (this.intervalId) return;

    // 初期値
    this.lastText = clipboard.readText() || '';

    this.intervalId = setInterval(() => {
      this.check();
    }, this.watchInterval);

    log.info('Clipboard watcher started');
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      log.info('Clipboard watcher stopped');
    }
  }

  check() {
    try {
      const currentText = clipboard.readText();

      // テキストの変更検出
      if (currentText && currentText !== this.lastText) {
        this.lastText = currentText;
        this.addToHistory({
          type: 'text',
          content: currentText,
          timestamp: Date.now(),
          preview: currentText.substring(0, 100),
        });
      }

      // 画像の変更検出（設定で有効な場合）
      if (this.config.get('clipboard.saveImages')) {
        const image = clipboard.readImage();
        if (!image.isEmpty()) {
          const size = image.getSize();
          const hash = `${size.width}x${size.height}`;
          if (hash !== this.lastImageHash) {
            this.lastImageHash = hash;
            this.addToHistory({
              type: 'image',
              content: image.toDataURL(),
              timestamp: Date.now(),
              preview: `画像 (${size.width}×${size.height})`,
              size: size,
            });
          }
        }
      }
    } catch (err) {
      // クリップボードアクセスエラーは無視（他アプリがロック中など）
    }
  }

  addToHistory(item) {
    // 重複チェック（直前と同じ内容は追加しない）
    if (this.history.length > 0 && this.history[0].content === item.content) {
      return;
    }

    // 先頭に追加
    this.history.unshift(item);

    // 最大件数制限
    const maxHistory = this.config.get('clipboard.maxHistory') || 100;
    if (this.history.length > maxHistory) {
      this.history = this.history.slice(0, maxHistory);
    }
  }

  getHistory() {
    return this.history.map(item => ({
      type: item.type,
      preview: item.preview,
      content: item.type === 'text' ? item.content : undefined, // 画像はプレビューのみ
      timestamp: item.timestamp,
      timeAgo: this.getTimeAgo(item.timestamp),
    }));
  }

  getTimeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}秒前`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}分前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}時間前`;
    return `${Math.floor(hours / 24)}日前`;
  }
}

module.exports = ClipboardWatcher;
