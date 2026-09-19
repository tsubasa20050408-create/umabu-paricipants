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

## デザイン

配色・タイポグラフィ・角丸・余白は `src/theme.js` に集約（`C` 色 / `FONT` / `R` 角丸 / `S` 余白 / `T` タイポ）。
**コンポーネント側で hex を直接書かない**こと。

- クリームの地（`#f5f0e8`）にカード（`#faf9f5` + 1px 罫線）。影とグラデーションは使わない
- アクセントはコーラル `#cc785c` のみ。主要ボタン（作成・送信・Excel出力）に限定して使う
- 見出しはセリフ（Cormorant Garamond + Noto Serif JP）、本文は Inter + Noto Sans JP。
  フォントは `index.html` の Google Fonts から読み込む
- ダーク面（`#181715`）は**ヘッダー帯と Excel 出力の CTA 帯の2箇所だけ**
- 学年色: 3年=コーラル / 2年=アンバー / 1年=ティール（`src/schedule.js` の `GRADE_COLOR`）

## ローカル開発
```
npm install
npm run dev
```
※ ローカルで API を動かすには `vercel dev` が必要（または Upstash の URL/TOKEN を `.env.local` に書く）。
普段はそのまま Vercel に push して確認するのが楽。

## 練習時限のパターン

管理画面の **⚙️ 設定タブ →「🗓 練習時限パターン」** で曜日ごとに編集できる（再デプロイ不要）。

- 月〜金: 1限 / 2限 / 3限 から選択
- 土・日: 「限で指定」か「午前・午後で指定」かを切り替えて選択（同じ日に両方は指定できない。
  Excel出力で「午前」は振り分け結果をもとに 1限・2限 の2行に展開されるため）
- 朝運動: 全曜日に固定（部員フォームには出さず、管理者が記録して馬当番の割当に使う）

変更は **次に作成する調査から反映**される（作成済みの調査は作成時のパターンを保持）。

保存先は Redis の `practice:weeklySlots`。未設定の場合は `src/schedule.js` の `WEEKLY_SLOTS`（既定値）が使われる:
- 月・火: 朝運動 + 2限 + 3限
- 水: 朝運動 + 1限
- 木: 朝運動
- 金: 朝運動 + 3限
- 土: 朝運動
- 日: 朝運動 + 午前 + 午後

## 朝運動の馬

管理画面の **⚙️ 設定タブ →「🐴 朝運動の馬」** で馬の追加・削除と、既定の使用可否（チェック）を編集できる。

- チェックを外した馬は **自動配置の対象外**。日付ごとの手動ドロップダウンでは引き続き選べる（`⚠` 付きで表示）
- 特定の月だけ変えたい場合は、その調査の **「🌅 朝運動記録」→「この月に使う馬」** で上書きできる
  （上書きした調査は、あとから共通リストに馬を足してもその月の選択を保つ）
- 使用可能な馬が0頭のときは自動配置ボタンが無効になる

保存先は Redis の `practice:asaUndoHorses`（共通）と各調査の `asaUndoHorseEnabled`（月ごとの上書き）。
未設定の場合は `src/App.jsx` の `ASA_UNDO_HORSES`（既定値: イト・ツムギ・シュウ・スモモ）が使われる。

## メンバー
`src/schedule.js` の `INITIAL_GROUPS`（`shift-app` と同一）。
卒業・進級などあれば編集して再デプロイ。
