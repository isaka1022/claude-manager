# Claude Manager

Claude Code のプロジェクト・セッション・設定を一元管理する Mac デスクトップアプリ。

## 主な機能

- **プロジェクト管理** — 登録したプロジェクトの一覧表示、ステータス (active / review / archived) とメモの管理
- **Conversations** — プロジェクトごとの過去のセッション履歴の閲覧、`claude --print` を使ったチャット送信
- **CLAUDE.md / Skills / Settings** — プロジェクト単位の設定ファイルをタブ切り替えで閲覧
- **Global ダッシュボード** — `~/.claude/` 配下の CLAUDE.md、rules、skills、MCP サーバー、利用統計を表示
- **アクティブセッション検出** — 現在 Claude Code が動作中のプロジェクトを緑インジケータで表示
- **エディタ連携** — プロジェクトをワンクリックで Cursor エディタで開く

## Tech Stack

- Electron 35 + electron-vite 5
- React 19 + TypeScript
- Tailwind CSS 4

## セットアップ

```bash
npm install
npm run dev
```

## npm scripts

| コマンド | 説明 |
|---|---|
| `npm run dev` | 開発サーバー起動 (HMR) |
| `npm run build` | プロダクションビルド |
| `npm run preview` | ビルド結果をプレビュー |
| `npm run typecheck` | TypeScript 型チェック |
| `npm run lint` | ESLint 実行 |

## 使い方

### プロジェクトを追加する

1. 右ペインの「Open Directory…」をクリック
2. Claude Code を使っているプロジェクトのディレクトリを選択
3. サイドバーにプロジェクトが追加される

### プロジェクトのステータス管理

サイドバー下部の「Selected Project」セクションで：

- **Status** — `unknown` / `active` / `review` / `archived` から選択
- **Memo** — 自由記述のメモ
- 「Save Meta」で保存（`~/.claude/claude-manager-meta.json` に永続化）

### 過去のセッション閲覧

1. プロジェクトを選択
2. 「Conversations」タブを開く
3. 左側のセッション一覧から選択すると、最後のユーザーメッセージと Claude の応答が表示される

### Claude とチャット

Conversations タブ下部の入力エリアから：

- メッセージを入力して Enter（または「送信」ボタン）で送信
- `claude --print` コマンド経由で実行される（ステートレス）
- Shift+Enter で改行

### Global ダッシュボード（右ペイン）

| タブ | 内容 |
|---|---|
| Overview | `~/.claude/CLAUDE.md` のセクション一覧、`rules/` のファイルとセクション |
| Skills | `~/.claude/skills/` のグローバルスキルファイル閲覧 |
| MCP | `~/.claude/mcp.json` の MCP サーバー設定 |
| Usage | `stats-cache.json` ベースの日別メッセージ数、モデル別トークン使用量 |

## プロジェクト構成

```
src/
├── main/index.ts        # Electron メインプロセス (IPC ハンドラー)
├── preload/index.ts     # contextBridge でレンダラーに API を公開
└── renderer/
    ├── App.tsx           # React アプリ本体
    ├── main.tsx          # エントリーポイント
    ├── index.html
    ├── index.css         # Tailwind CSS
    └── vite-env.d.ts     # Window.api 型定義
```

## データ保存先

| ファイル | 内容 |
|---|---|
| `~/.claude/claude-manager-meta.json` | プロジェクトのステータス・メモ |
| `~/.claude/claude-manager-config.json` | 登録プロジェクトパス一覧 |
