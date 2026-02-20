# RadialHub - ラジアルメニュー型ランチャー

## 📁 プロジェクト構成

```
RadialHub/
├── package.json              ← プロジェクト定義・依存関係
├── .gitignore
│
└── src/
    ├── main/                  ← メインプロセス（Electron本体）
    │   ├── main.js            ← エントリーポイント（ウィンドウ管理、ホットキー、トレイ）
    │   ├── config-manager.js  ← 設定ファイル管理（読み書き・エクスポート・マイグレーション）
    │   ├── clipboard-watcher.js ← クリップボード監視
    │   ├── update-manager.js  ← 自動アップデート（GitHub Releases連携）
    │   ├── preload.js         ← セキュリティブリッジ（メイン↔レンダラー通信）
    │   └── utils.js           ← ユーティリティ（キーボード操作等）
    │
    └── renderer/              ← レンダラー（画面UI）
        ├── menu.html          ← ラジアルメニュー画面
        ├── settings.html      ← 設定画面（※プロトタイプから移植予定）
        └── capture.html       ← 範囲キャプチャ画面
```

---

## 🚀 セットアップ手順（Tatsuo さん向け）

### 前提条件

以下のソフトをPCにインストールしてください。

#### 1. Node.js のインストール

- https://nodejs.org/ にアクセス
- **LTS版（推奨版）** をダウンロードしてインストール
- インストール後、コマンドプロンプト（cmd）で確認：

```cmd
node --version
npm --version
```

バージョン番号が表示されればOKです。

#### 2. Git のインストール（推奨）

- https://git-scm.com/ からダウンロード
- インストールはデフォルト設定でOK

#### 3. VS Code のインストール（推奨のエディタ）

- https://code.visualstudio.com/ からダウンロード

---

### プロジェクトのセットアップ

#### 1. プロジェクトフォルダを好きな場所に配置

ダウンロードした `RadialHub` フォルダを任意の場所に置きます。
例: `D:\Development\RadialHub`

#### 2. コマンドプロンプトで移動

```cmd
cd D:\Development\RadialHub
```

#### 3. 依存パッケージをインストール

```cmd
npm install
```

初回は少し時間がかかります（2〜5分程度）。
`node_modules` フォルダが自動で作成されます。

#### 4. 開発モードで起動

```cmd
npm run dev
```

RadialHubのウィンドウが表示されれば成功です！

#### 5. 通常起動

```cmd
npm start
```

---

## 📦 ビルド（配布用exeの作成）

### Windows用インストーラーを作成

```cmd
npm run build:win
```

`dist/` フォルダに以下が生成されます：
- `RadialHub Setup 0.1.0.exe` ← インストーラー
- `RadialHub-0.1.0-win.zip` ← ポータブル版

---

## 🔄 自動アップデートの設定（将来の一般公開時）

### 1. GitHubリポジトリを作成

1. https://github.com で新しいリポジトリ `RadialHub` を作成
2. `package.json` の `build.publish` セクションの `owner` を自分のGitHubユーザー名に変更

### 2. GitHubにプッシュ

```cmd
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/RadialHub.git
git push -u origin main
```

### 3. リリースの公開

```cmd
# バージョン番号を更新（例: 0.1.0 → 0.2.0）
# package.json の "version" を手動で変更後

npm run build:win

# GitHubでリリースを作成し、distフォルダの成果物をアップロード
# アプリが起動時に自動でこのリリースをチェックします
```

---

## 💾 設定ファイルについて

### 保存場所

```
C:\Users\{ユーザー名}\AppData\Roaming\RadialHub\
├── config.json             ← メイン設定ファイル
├── clipboard-history.json  ← クリップボード履歴
└── backups\                ← 自動バックアップ
```

### PC移行手順

1. 旧PC: 設定画面の「エクスポート」で `radialhub-config.json` を保存
2. USBメモリやクラウド経由で新PCに移動
3. 新PC: RadialHubインストール後、設定画面の「インポート」で読み込み

---

## 🗓️ 開発ロードマップ

### Phase 1 - 基盤（現在 ✅）
- [x] プロジェクト骨組み
- [x] メインプロセス（ウィンドウ管理、ホットキー、トレイ）
- [x] 設定管理（読み書き、バックアップ、マイグレーション）
- [x] クリップボード監視
- [x] 自動アップデート基盤
- [x] ラジアルメニュー基本画面

### Phase 2 - 機能実装
- [ ] 設定画面の統合（プロトタイプHTMLの移植）
- [ ] ドラッグ&ドロップ（ショートカット/フォルダ登録）
- [ ] 定型文の管理・直接貼り付け
- [ ] クリップボード履歴サブメニュー
- [ ] 範囲キャプチャ（desktopCapturer API統合）

### Phase 3 - ポリッシュ
- [ ] アプリアイコン作成
- [ ] アニメーション・トランジション
- [ ] 外観カスタマイズ（サイズ、透過度）
- [ ] エラーハンドリング強化

### Phase 4 - 配布準備
- [ ] インストーラー最適化
- [ ] 自動アップデートテスト
- [ ] ドキュメント整備
- [ ] GitHub公開 / Webサイト

---

## ❓ よくある操作

| やりたいこと | コマンド |
|---|---|
| 開発モードで起動 | `npm run dev` |
| 通常起動 | `npm start` |
| exe作成 | `npm run build:win` |
| パッケージ追加 | `npm install パッケージ名` |
