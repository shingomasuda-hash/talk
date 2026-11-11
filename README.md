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
7. 「ナレッジ」で承認済みノウハウ（原則→理由→適用条件→例外→具体トーク）を登録すると、AI生成で優先参照されます。

DEMOの全文をターミナルで見る：

```bash
npx tsx scripts/demo-print.ts A
```

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
src/domain/sources.ts         参照資料の受領状況・指示書の原則と実装の対応表
src/domain/flowModel.ts       2フローの読解済み構造（分類S/D/I/R/F・向き・関連場面・要確認）
src/domain/scenes.ts          発話場面カタログ S01〜S18（ケース・元図形・必要入力・ガードレール）と入力項目
src/domain/selection.ts       場面選択・不足質問・矛盾・影響判定・網羅表
src/domain/demoGenerator.ts   APIキー未設定時のテンプレート生成
src/domain/quality.ts         AI出力スキーマ・構造検証・品質チェック
src/domain/revision.ts        修正提案の適用・手編集・版管理
src/ai/claude.ts              Claude API 呼び出し（structured outputs）
src/service.ts / server.ts    ユースケースとHTTP API
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
