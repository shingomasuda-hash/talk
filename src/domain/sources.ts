/**
 * 参照資料の受領状況と、ChatGPTプロジェクト指示書（docx）の各原則が実装のどこに反映されているかの対応表。
 * 「実装状況」はAI（本実装）の自己評価であり、ユーザーの確認対象。
 */
export interface SourceMaterial {
  priority: number;
  name: string;
  role: string;
  status: "受領・反映済み" | "未受領";
  note: string;
  repoPath?: string;
}

export const SOURCE_MATERIALS: SourceMaterial[] = [
  { priority: 1, name: "テレアポのコールフロー（①キーマン名なし、②キーマン名あり）.xlsx", role: "最新版の主資料（有効2シート）", status: "受領・反映済み",
    note: "原本から図形・接続線・座標を再抽出し、抽出JSONと図形ID・ラベル・接続線の端点が完全一致することを確認。接続線は全89本とも矢印なし（向きは図の配置と意味から読解）。「使用しない」2シートは不採用。",
    repoPath: "source/flow-layout.json" },
  { priority: 2, name: "ChatGPTプロジェクト指示書_スクリプト簡単作成AIアプリ.docx", role: "最新版の原則", status: "受領・反映済み",
    note: "16章の原則を下の対応表で実装に対応づけた。開発指示書と矛盾する記載はなし。", repoPath: "source/project-instructions.md" },
  { priority: 3, name: "生成AIを活用したバディコンサルティングならではのビジネスの検討(1).xlsx（優先1シート）", role: "既存の優先1構想", status: "受領・反映済み",
    note: "「(優先1)スクリプト簡単作成AI」シートのセルと図形（107件）を読み取り、機能・画面案・例文を下の対応表に反映。読み取り時にふりがな（ルビ）を除去。他シート（マネタイズ・優先2・0916/0917）は背景として確認のみで、仕様には反映していない。",
    repoPath: "source/priority1-sheet.md" },
  { priority: 4, name: "Scripto簡単作成エージェント開発：20年ノウハウ活用とAI活用戦略.txt", role: "背景・議事録", status: "受領・反映済み",
    note: "スクリプト作成に関係する要点のみ下の対応表に反映。録音・Zoom Phone・課金は指示書の方針どおり現在の対象外。" },
  { priority: 5, name: "最新コールフロー_図形抽出データ.json", role: "確認用の補助データ", status: "受領・反映済み", note: "原本Excelと完全一致。", repoPath: "source/flow-extraction.json" },
  { priority: 0, name: "Claude_Code_開発指示書_最新版コールフロー最優先.md", role: "開発仕様", status: "受領・反映済み", note: "本実装の仕様の基準。" },
];

export type ImplStatus = "実装済み" | "一部実装" | "次段階" | "将来構想" | "方針どおり対象外";

export interface PrincipleMapping {
  /** 出典：指示書（ChatGPTプロジェクト指示書）／優先1（優先1シート）／議事録 */
  source?: "指示書" | "優先1シート" | "議事録";
  section: string;
  principle: string;
  status: ImplStatus;
  where: string;
}

export const PRINCIPLE_MAPPINGS: PrincipleMapping[] = [
  { source: "指示書", section: "2", principle: "スクリプトを簡単に・短時間で・質高く作成・修正することを最優先する", status: "実装済み", where: "案件→不足質問→場面別生成→自然言語修正→採用→出力の導線（タブ①〜⑤）" },
  { source: "指示書", section: "2", principle: "電話中の自動遷移は最優先ではない。コールフローは場面・トーク種類・作成条件の整理資料", status: "方針どおり対象外", where: "フローは網羅表・図の参照にのみ使用。通話中の分岐画面は作らない" },
  { source: "指示書", section: "4-1,2", principle: "資料・Web・議事録などを集め、AIが不明点・不足・矛盾を質問する", status: "一部実装", where: "資料登録（テキスト系のみ。PDF/Word・URL取得は未対応）、不足質問5件ずつ、矛盾検出（来歴×接点）" },
  { source: "指示書", section: "4-4", principle: "ノウハウと商材固有情報を組み合わせてスクリプト案を作成", status: "実装済み", where: "生成プロンプトに回答・資料・ナレッジ（status付き）を渡す。承認済みノウハウは未登録" },
  { source: "指示書", section: "4-5", principle: "設計担当者が確認・微修正して初版を完成", status: "実装済み", where: "④修正（AI差分・手編集）、場面承認、⑤承認版" },
  { source: "指示書", section: "4-6,7 / 9", principle: "オペレーターが話しやすい言い回し・気づきを記録し、SVが確認・標準化。個人用と標準を区別", status: "次段階", where: "未実装（Phase 1.5）。標準スクリプトへの反映は承認制という前提だけ実装" },
  { source: "指示書", section: "4-8 / 11", principle: "承認された改善を次版・次回の類似商材へ活用（PDCA）", status: "一部実装", where: "版管理・改訂理由・ナレッジ登録（人が承認）。類似商材スクリプトの参照は未実装" },
  { source: "指示書", section: "5", principle: "ノウハウは「原則→理由→適用条件→例外→具体トーク」で整理", status: "実装済み", where: "ナレッジタブの入力構造" },
  { source: "指示書", section: "5", principle: "同じ断り文句でも相手・リスト・接点・商材で対応が異なり得る。原資料にない判断ルールは確定しない", status: "実装済み", where: "場面×ケース（例：S09の4ケース、S02の接点強弱）。未確定の判断は要確認に記録" },
  { source: "指示書", section: "6", principle: "確定事項／AI提案／要確認事項を区別し、AI提案を確定ノウハウのように書かない", status: "実装済み", where: "CONFIRMED / AI_PROPOSAL / NEEDS_CONFIRMATION / DEMO の表示と出力" },
  { source: "指示書", section: "7", principle: "質問ごとに目的・判断・十分な回答・追加質問・矛盾確認・反映箇所を整理", status: "実装済み", where: "②情報入力の確認事項カード" },
  { source: "指示書", section: "7", principle: "AIが一問ずつ尋ねる会話形式も想定", status: "次段階", where: "現状は重要順に5件ずつ提示する形式" },
  { source: "指示書", section: "8", principle: "自然で話しやすい日本語、相手にとっての価値・電話の理由、必要場面が揃う、長すぎない、形式の一貫性", status: "一部実装", where: "場面カタログで必要場面を網羅、品質チェック（長文・根拠のない数値・再勧誘）。文面品質は実AIで要検証" },
  { source: "指示書", section: "8", principle: "複数のトーク候補（短い・詳しい、標準・柔らかい）", status: "実装済み", where: "短い版／標準版／必要時の補足。柔らかい版は修正指示で作成" },
  { source: "指示書", section: "10", principle: "フローで場面不足・トークの不明確さ・リストや接点による使い分け・共通と固有・必要入力・不要な複雑さを確認", status: "実装済み", where: "コールフロー図（このタブ）、網羅表、docs/02・03" },
  { source: "指示書", section: "12", principle: "リスト選択時のスクリプト・FAQ参照、Web情報取得、他社提供、課金・ID管理", status: "将来構想", where: "未実装（現在の中核機能と区別して管理）" },
  { source: "指示書", section: "13", principle: "判断ロジックが曖昧なまま画面を作り込まない", status: "実装済み", where: "場面選択・品質チェックを自動テストで先に固定し、画面は最小限" },
  { source: "指示書", section: "14", principle: "バージョン番号・変更点・変更理由を管理し、未承認のAI提案をノウハウ原本に混在させない", status: "実装済み", where: "スクリプト版履歴（理由・変更場面）。AI提案はナレッジへ自動書き込みしない" },
  // ---- 優先1シート（スクリプト簡単作成エージェント） ----
  { source: "優先1シート", section: "機能◎", principle: "ヒアリングシートに記入すればAIがスクリプトを自動生成", status: "実装済み", where: "②情報入力→③生成（AIモード）。APIキー未設定時はDEMOテンプレート" },
  { source: "優先1シート", section: "機能○", principle: "最新（または指定）のスクリプトを参照し、毎回同じフォーマット・日本語で出力", status: "実装済み", where: "③生成で『参考にするスクリプト』を選択（承認版を優先）。出力は場面×ケース×短い版／標準版の固定形式" },
  { source: "優先1シート", section: "機能○", principle: "AIが自己学習してスクリプトをブラッシュアップ", status: "次段階", where: "自動学習はしない（未承認の提案をノウハウ原本へ入れない方針）。修正指示とナレッジ登録で人が反映" },
  { source: "優先1シート", section: "機能○", principle: "オペレーターが自分用に手直し、元スクリプト更新時に反映。SVが確認・指導", status: "次段階", where: "未実装（Phase 1.5）。現在は設計担当者の手編集・承認のみ" },
  { source: "優先1シート", section: "利用イメージ", principle: "スクリプト画面の上部に『注意事項・変更点・ポイント』", status: "実装済み", where: "⑤完成版の冒頭とMarkdown出力。変更点は直前の承認版との差分" },
  { source: "優先1シート", section: "利用イメージ", principle: "Contents：受付突破／最初の挨拶／主旨説明／ニーズ喚起／クロージング／ヒアリング", status: "実装済み", where: "⑤完成版・出力を章立てで表示（主旨説明とニーズ喚起はS11で1章）。ユーザー指示によりヒアリングをクロージングの前に配置" },
  { source: "優先1シート", section: "利用イメージ", principle: "受付突破の応酬（【営業電話お断り】【用件は？】【お問い合わせフォーム】）", status: "実装済み", where: "S09取次ぎ拒否・S04用件確認・S10フォーム案内（受付突破の章）" },
  { source: "優先1シート", section: "利用イメージ", principle: "強調すべき単語はハイライト", status: "実装済み", where: "**語** で強調（AIは標準版で1〜2か所）。画面ではマーカー表示、過多・閉じ忘れを警告" },
  { source: "優先1シート", section: "利用イメージ", principle: "トークが数パターン提示され設計担当が選択（一言で説明、三言で説明）", status: "実装済み", where: "短い版（一言）／標準版（三言）／必要時の補足" },
  { source: "優先1シート", section: "利用イメージ", principle: "コール前にリスト（展示会来場者／新規〇〇業）を選び、リストに合ったスクリプトを表示", status: "一部実装", where: "案件をリスト別に複製して別スクリプトを作成。架電時の切替画面は作らない（方針どおり）" },
  { source: "優先1シート", section: "利用イメージ", principle: "例文の構成『〇〇と申します。〇〇が〇〇なのでお電話…〇〇は〇〇でしょうか？』", status: "実装済み", where: "承認済みナレッジ（2026-11-11 ユーザー承認）としてAIが優先参照。DEMOの最初の挨拶もこの順" },
  { source: "優先1シート", section: "課題例", principle: "断り文句を事前確認で先回りする（テイクアウトの例）", status: "実装済み", where: "承認済みナレッジ（2026-11-11 ユーザー承認）＋入力項目「架電前に事前確認できる情報」（最初の挨拶・主旨説明・断り対応に反映）" },
  { source: "優先1シート", section: "懸念事項", principle: "80点レベル（SV・OPが『要点をつかんでいて話しやすそう』と思える）", status: "一部実装", where: "品質チェックは機械的な項目のみ。実AIでの80点判定は未検証（要実施）" },
  { source: "優先1シート", section: "懸念事項", principle: "修正に失敗しても立ち戻れる仕組み", status: "実装済み", where: "全変更を版として保存し『この版に戻す』。Gitでコードも履歴管理" },
  { source: "優先1シート", section: "懸念事項", principle: "納品方法（月額ID管理／売り切り・ブラックボックス化）、運用中の不具合修正", status: "将来構想", where: "未着手（事業・技術の検討事項）" },
  // ---- 議事録 ----
  { source: "議事録", section: "商材情報", principle: "基本的な商材理解と、具体的なサービス資料（PDF）を分けて読み込ませる", status: "実装済み", where: "資料に区分（基本的な商材理解／具体的なサービス資料／その他）。PDFはAIモードで文書としてClaudeへ渡す" },
  { source: "議事録", section: "ヒアリング", principle: "ヒアリング項目はシステムの中にあり、入力するとそのまま生成へ続く", status: "実装済み", where: "②情報入力→③生成" },
  { source: "議事録", section: "リスト", principle: "同じ商材でも新規／既存などリストによってスクリプトを変える", status: "実装済み", where: "リスト来歴・接点の強さで場面の文面を変え、変更時は影響場面を再生成候補に。リスト別に案件を複製可能" },
  { source: "議事録", section: "フロー", principle: "フローチャートをスクリプト作成の基盤にする", status: "実装済み", where: "最新版コールフロー2シートを場面カタログと網羅表に変換" },
  { source: "議事録", section: "将来", principle: "通話録音・文字起こし（Googleドライブ保管）・Zoom Phone連携・話者分離", status: "将来構想", where: "現在の対象外（指示書の方針）。外部API利用可否も未確定" },
  { source: "議事録", section: "将来", principle: "1ユーザー単位の課金、ノウハウ部分での価格設計", status: "将来構想", where: "未着手" },
];

/** 「使用しない」シートとの差分（参考情報。仕様には混入しない） */
export const UNUSED_SHEET_DIFFS = [
  { sheet: "①キーマン名なしリスト", onlyUnused: ["受付担当者と対話", "キーマンに取次ぎ不可", "商談希望", "資料送付希望", "完了"], onlyLatest: ["受付担当者が受電", "キーマンが受電", "キーマンと対話できず", "商談OK", "資料送付OK"] },
  { sheet: "②キーマン名ありリスト", onlyUnused: ["退職・異動", "②キーマンありコールへ", "・取次依頼・②キーマン名ありコールへ", "店長などの場合", "完了"], onlyLatest: ["・後任者へ取次依頼・②キーマン名ありコールへ"] },
];
