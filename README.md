# スクリプト簡単作成AI（バディコンサルティング）

最新版コールフロー（①キーマン名なしリスト／②キーマン名ありリスト）に基づき、**必要な発話場面だけ**について営業トークを生成し、**場面ごとに自然言語で修正・承認・版管理**するWebアプリです。

- 電話中の自動分岐・音声連携・架電管理は対象外（Phase 2 以降）。
- 生成結果は「AI提案」または「DEMO」として表示し、承認済みノウハウと混同しません。

## セットアップと起動

前提：Node.js 20 以上。

```bash
npm install
```

```bash
npm start
```

ブラウザで http://localhost:3000 を開きます。

### AI（Claude API）を使う場合

```bash
ANTHROPIC_API_KEY=sk-ant-... npm start
```

| 環境変数 | 既定値 | 内容 |
|---|---|---|
| `ANTHROPIC_API_KEY` | なし | 未設定ならAI生成は無効（画面に明示）、DEMOテンプレートで生成 |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | 生成に使うモデル |
| `ANTHROPIC_EFFORT` | `medium` | `low`〜`max`。品質重視なら `high` |
| `PORT` | `3000` | |
| `DATA_FILE` | `data/db.json` | 保存先（JSONファイル） |
| `APP_PASSWORD` | なし | 設定するとBasic認証（ユーザー名は任意） |

- APIはサーバー側からのみ呼び出し、キーは画面・ログ・Gitに出しません。
- 安全性による辞退（refusal）時はサーバー側フォールバック（`fallbacks: "default"`）を有効にしています。
- AI生成時、商材情報・資料・ナレッジがAnthropic APIへ送信されます。実データを使う前に契約上の可否を確認してください。

## デモでの確認方法（APIキー不要）

1. 「① 案件・フロー」でリスト種別（①／②）を選び「DEMO案件で試す」（架空の商材が入ります）。
2. 「③ 生成プレビュー」で「スクリプトを生成」。生成対象・対象外の場面と理由、フロー網羅チェック（全図形）を確認。
3. 「② 情報入力」で項目を変更（例：リストの来歴→既存顧客）すると、③に影響場面と「影響場面だけ再生成」が出ます。
4. 「④ スクリプト修正」で場面を選び「短く」等を指示 → 差分 → 採用。手編集・場面の承認も可能。
5. 「⑤ 完成版・履歴・出力」で版の比較・元に戻す・承認版・Markdown出力・印刷・場面コピー。
6. 「コールフロー図・資料」で原本Excelの図形配置を再現した図を確認できます。図形をクリックすると分類・扱い・前後の状況・関連する場面と生成済みトークを表示し、場面を選ぶと該当図形を強調します。参照資料の受領状況と、ChatGPTプロジェクト指示書の各原則と実装の対応表もここにあります。
7. 完成版は冒頭に「注意事項・変更点・ポイント」と目次（受付突破／最初の挨拶／主旨説明・ニーズ喚起／ヒアリング／クロージング）を表示し、強調語（`**語**`）はマーカー表示します。
8. 「① 案件・フロー」の「別のリスト用に複製」で、同じ商材のリスト別（新規／既存・展示会来場者など）スクリプトを作れます。③では過去のスクリプトを「参考にするスクリプト」として選べます（AIモード）。
9. 資料は「基本的な商材理解」「具体的なサービス資料」に分けて登録できます。PDF（10MBまで）はAIモードの生成時にそのままAIへ渡します。
10. 「ナレッジ」で承認済みノウハウ（原則→理由→適用条件→例外→具体トーク）を登録すると、AI生成で優先参照されます。

DEMOの全文をターミナルで見る：

```bash
npx tsx scripts/demo-print.ts A
```

## 公開デモ（ブラウザだけで動く1ファイル版）

サーバー無しで動くデモ（DEMOモード固定・AIは使わない・データは閲覧者のブラウザに保存）を1つのHTMLにまとめます。

```bash
npm run build:demo
```

`dist/index.html`（静的ホスティング用）と `dist/script-ai-demo.html`（Claude Artifact 用）ができます。

### Vercel で公開する場合

`vercel.json` で、Vercel にはこの公開デモ（静的ページ）だけを配信させています（`npm run build:demo` → `dist/`）。
Express のサーバー版は Vercel では動かしません。サーバー版はデータを `data/db.json` に保存するため、ファイルを保持できない Vercel のサーバー関数では案件・スクリプトが消えてしまうからです。
AI 生成を Web で使うには、データベース（例：Vercel Postgres／KV）への保存とAPIキーの設定が別途必要です。サーバー版と同じサービス層・ルート表（`src/routes.ts`）をブラウザ内で動かしています（`src/browser/demo.ts`）。

## テスト

```bash
npm test
```

```bash
npm run typecheck
```

原本Excelから座標データを再抽出（Excel更新時）：

```bash
python3 -I scripts/extract_callflow.py "テレアポのコールフロー（①キーマン名なし、②キーマン名あり）.xlsx" source/flow-layout.json
```

フロー一覧・網羅マトリクスの再生成（`src/domain/flowModel.ts` 変更時）：

```bash
npm run gen:docs
```

## 構成

```
source/flow-extraction.json   最新版Excelの図形・接続線の抽出データ（96図形／89接続線）
source/flow-layout.json       原本Excelから再抽出した座標つき図形・接続線（図の描画に使用）
source/project-instructions.md ChatGPTプロジェクト指示書（docx）の本文抽出
source/priority1-sheet.md     (優先1)スクリプト簡単作成AI シートの本文抽出
src/domain/sources.ts         参照資料の受領状況・指示書の原則と実装の対応表
src/domain/flowModel.ts       2フローの読解済み構造（分類S/D/I/R/F・向き・関連場面・要確認）
src/domain/scenes.ts          発話場面カタログ S01〜S18（ケース・元図形・必要入力・ガードレール）と入力項目
src/domain/selection.ts       場面選択・不足質問・矛盾・影響判定・網羅表
src/domain/demoGenerator.ts   APIキー未設定時のテンプレート生成
src/domain/quality.ts         AI出力スキーマ・構造検証・品質チェック
src/domain/revision.ts        修正提案の適用・手編集・版管理
src/ai/claude.ts              Claude API 呼び出し（structured outputs）
src/service.ts / server.ts    ユースケースとHTTP API
src/routes.ts                 APIルート表（サーバー版・公開デモ版で共用）
src/browser/demo.ts           公開デモ版：ブラウザ内でAPIを処理（localStorage保存）
public/                       画面（5タブ＋ナレッジ）
docs/                         01〜05・要件の疑義
```

## データ保存

`data/db.json`（Git管理外）に案件・スクリプト全版・修正提案・ナレッジを保存します。単一プロセス前提です。バックアップはこのファイルをコピーしてください。

## ドキュメント

- `docs/01-source-priority.md` 資料の優先順位・変更点・未確認事項
- `docs/02-flow-inventory.md` 2フローの分岐ツリー・注記・接続線（自動生成）
- `docs/03-scene-coverage-matrix.md` 全図形の分類・網羅状況、場面と入力・元図形の対応（自動生成）
- `docs/04-generation-rules.md` 生成ルール・出力テンプレート
- `docs/05-acceptance-tests.md` T01〜T26 の結果
- `docs/requirements-gaps.md` 要確認事項
