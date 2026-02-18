/**
 * ユーティリティ関数群
 */

// キーボード操作（Ctrl+Vの送信用）
// ネイティブモジュールが必要な場合は robotjs や @nut-tree/nut-js を使う
// 暫定実装: PowerShellでキー送信
const { exec } = require('child_process');
const log = require('electron-log');

const keyboard = {
  /**
   * Ctrl+V（ペースト）をシミュレート
   * 定型文貼り付け時に使用
   */
  paste() {
    // Windows: PowerShellでキー送信
    const script = `
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.SendKeys]::SendWait("^v")
    `;
    exec(`powershell -Command "${script.replace(/\n/g, '; ')}"`, (err) => {
      if (err) {
        log.error('Paste simulation failed:', err);
      }
    });
  },
};

module.exports = { keyboard };
