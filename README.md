# 練習参加者把握ツール

部員が月ごとに練習参加希望を入力 → 管理者が集計 → Excel出力（`May 練習参加者.xlsx` と同じ形式）。

会計アプリと同じ構成（Vercel + Upstash Redis + PIN認証）。

## デプロイ手順

### 1. GitHub に push
このフォルダを GitHub リポジトリにアップロード。

### 2. Vercel にインポート
1. https://vercel.com で「Add New」→「Project」→ リポジトリを Import
2. Framework は **Vite** 自動検出のままでOK
3. **Deploy はまだ押さない**（環境変数の設定が先）

### 3. Upstash Redis を追加（無料）
1. Vercel プロジェクト → **Storage** タブ → **Create Database**
2. **Upstash** → **KV (Redis)** を選択 → リージョン Tokyo → Create
3. 自動的に `KV_REST_API_URL` / `KV_REST_API_TOKEN` 等が環境変数に登録される

### 4. PIN を設定
プロジェクト → Settings → Environment Variables に追加:
```
ADMIN_PIN   = （4-8桁の数字、例: 0521）
ADMIN_SECRET = （ランダムな文字列、例: practice2026xyz）
```

### 5. Deploy
Deployments タブ → Redeploy

公開URLが発行される（例: `https://practice-app-xxx.vercel.app`）

## 使い方

### 管理者
1. 公開URLを開く → PIN 入力でログイン
2. 年・月を選んで「➕ 作成」→ 配布リンクが発行される
3. 「コピー」して部員にLINE等で配布（リンクにはPIN不要）
4. 提出状況がリアルタイム更新（10秒ごとポーリング、🔄ボタンで即時更新も可）
5. 全員揃ったら「📥 Excelファイル作成」

### 部員
1. 管理者から送られたリンクを開く（PIN不要）
2. 学年→自分の名前を選択（3年→2年→1年順）
3. 参加できる時限にチェック → 「送信」

## ローカル開発
```
npm install
npm run dev
```
※ ローカルで API を動かすには `vercel dev` が必要（または Upstash の URL/TOKEN を `.env.local` に書く）。
普段はそのまま Vercel に push して確認するのが楽。

## 練習時限の固定パターン
`src/schedule.js` の `WEEKLY_SLOTS`:
- 月・火: 朝運動 + 2限 + 3限
- 水: 朝運動 + 1限
- 木: 朝運動
- 金: 朝運動 + 3限
- 土: 朝運動
- 日: 朝運動 + 午前 + 午後

## メンバー
`src/schedule.js` の `INITIAL_GROUPS`（`shift-app` と同一）。
卒業・進級などあれば編集して再デプロイ。
