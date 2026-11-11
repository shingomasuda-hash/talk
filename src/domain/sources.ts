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
  { priority: 3, name: "生成AIを活用したバディコンサルティングならではのビジネスの検討(1).xlsx（優先1シート）", role: "既存の優先1構想", status: "未受領", note: "既存UXの参照は未実施。" },
  { priority: 4, name: "Scripto簡単作成エージェント開発：20年ノウハウ活用とAI活用戦略.txt", role: "背景・議事録", status: "未受領", note: "" },
  { priority: 5, name: "最新コールフロー_図形抽出データ.json", role: "確認用の補助データ", status: "受領・反映済み", note: "原本Excelと完全一致。", repoPath: "source/flow-extraction.json" },
  { priority: 0, name: "Claude_Code_開発指示書_最新版コールフロー最優先.md", role: "開発仕様", status: "受領・反映済み", note: "本実装の仕様の基準。" },
];

export type ImplStatus = "実装済み" | "一部実装" | "次段階" | "将来構想" | "方針どおり対象外";

export interface PrincipleMapping {
  section: string;
  principle: string;
  status: ImplStatus;
  where: string;
}

export const PRINCIPLE_MAPPINGS: PrincipleMapping[] = [
  { section: "2", principle: "スクリプトを簡単に・短時間で・質高く作成・修正することを最優先する", status: "実装済み", where: "案件→不足質問→場面別生成→自然言語修正→採用→出力の導線（タブ①〜⑤）" },
  { section: "2", principle: "電話中の自動遷移は最優先ではない。コールフローは場面・トーク種類・作成条件の整理資料", status: "方針どおり対象外", where: "フローは網羅表・図の参照にのみ使用。通話中の分岐画面は作らない" },
  { section: "4-1,2", principle: "資料・Web・議事録などを集め、AIが不明点・不足・矛盾を質問する", status: "一部実装", where: "資料登録（テキスト系のみ。PDF/Word・URL取得は未対応）、不足質問5件ずつ、矛盾検出（来歴×接点）" },
  { section: "4-4", principle: "ノウハウと商材固有情報を組み合わせてスクリプト案を作成", status: "実装済み", where: "生成プロンプトに回答・資料・ナレッジ（status付き）を渡す。承認済みノウハウは未登録" },
  { section: "4-5", principle: "設計担当者が確認・微修正して初版を完成", status: "実装済み", where: "④修正（AI差分・手編集）、場面承認、⑤承認版" },
  { section: "4-6,7 / 9", principle: "オペレーターが話しやすい言い回し・気づきを記録し、SVが確認・標準化。個人用と標準を区別", status: "次段階", where: "未実装（Phase 1.5）。標準スクリプトへの反映は承認制という前提だけ実装" },
  { section: "4-8 / 11", principle: "承認された改善を次版・次回の類似商材へ活用（PDCA）", status: "一部実装", where: "版管理・改訂理由・ナレッジ登録（人が承認）。類似商材スクリプトの参照は未実装" },
  { section: "5", principle: "ノウハウは「原則→理由→適用条件→例外→具体トーク」で整理", status: "実装済み", where: "ナレッジタブの入力構造" },
  { section: "5", principle: "同じ断り文句でも相手・リスト・接点・商材で対応が異なり得る。原資料にない判断ルールは確定しない", status: "実装済み", where: "場面×ケース（例：S09の4ケース、S02の接点強弱）。未確定の判断は要確認に記録" },
  { section: "6", principle: "確定事項／AI提案／要確認事項を区別し、AI提案を確定ノウハウのように書かない", status: "実装済み", where: "CONFIRMED / AI_PROPOSAL / NEEDS_CONFIRMATION / DEMO の表示と出力" },
  { section: "7", principle: "質問ごとに目的・判断・十分な回答・追加質問・矛盾確認・反映箇所を整理", status: "実装済み", where: "②情報入力の確認事項カード" },
  { section: "7", principle: "AIが一問ずつ尋ねる会話形式も想定", status: "次段階", where: "現状は重要順に5件ずつ提示する形式" },
  { section: "8", principle: "自然で話しやすい日本語、相手にとっての価値・電話の理由、必要場面が揃う、長すぎない、形式の一貫性", status: "一部実装", where: "場面カタログで必要場面を網羅、品質チェック（長文・根拠のない数値・再勧誘）。文面品質は実AIで要検証" },
  { section: "8", principle: "複数のトーク候補（短い・詳しい、標準・柔らかい）", status: "実装済み", where: "短い版／標準版／必要時の補足。柔らかい版は修正指示で作成" },
  { section: "10", principle: "フローで場面不足・トークの不明確さ・リストや接点による使い分け・共通と固有・必要入力・不要な複雑さを確認", status: "実装済み", where: "コールフロー図（このタブ）、網羅表、docs/02・03" },
  { section: "12", principle: "リスト選択時のスクリプト・FAQ参照、Web情報取得、他社提供、課金・ID管理", status: "将来構想", where: "未実装（現在の中核機能と区別して管理）" },
  { section: "13", principle: "判断ロジックが曖昧なまま画面を作り込まない", status: "実装済み", where: "場面選択・品質チェックを自動テストで先に固定し、画面は最小限" },
  { section: "14", principle: "バージョン番号・変更点・変更理由を管理し、未承認のAI提案をノウハウ原本に混在させない", status: "実装済み", where: "スクリプト版履歴（理由・変更場面）。AI提案はナレッジへ自動書き込みしない" },
];

/** 「使用しない」シートとの差分（参考情報。仕様には混入しない） */
export const UNUSED_SHEET_DIFFS = [
  { sheet: "①キーマン名なしリスト", onlyUnused: ["受付担当者と対話", "キーマンに取次ぎ不可", "商談希望", "資料送付希望", "完了"], onlyLatest: ["受付担当者が受電", "キーマンが受電", "キーマンと対話できず", "商談OK", "資料送付OK"] },
  { sheet: "②キーマン名ありリスト", onlyUnused: ["退職・異動", "②キーマンありコールへ", "・取次依頼・②キーマン名ありコールへ", "店長などの場合", "完了"], onlyLatest: ["・後任者へ取次依頼・②キーマン名ありコールへ"] },
];
