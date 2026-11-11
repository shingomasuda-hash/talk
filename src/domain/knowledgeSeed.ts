/**
 * 初期ナレッジ。いずれも『開発指示書』『最新版コールフロー』から読み取れるガードレールであり、
 * 土井様・バディコンサルティングの承認済みノウハウではない。よって status は NEEDS_CONFIRMATION。
 * 承認済みノウハウは「ナレッジ」タブから登録し、人が CONFIRMED にする。
 */
import type { KnowledgeEntry } from "./types.js";

const at = "2026-11-11T00:00:00.000Z";

export const SEED_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: "kn_seed_respect_refusal",
    sceneIds: ["S09", "S10", "S15"],
    principle: "次回コール不可・会社方針による拒否・本人確認後の拒否・クレームには、再勧誘せずお礼（必要ならお詫び）を述べて終話する",
    reason: "相手の意思に反する再勧誘は信頼を損ない、クレームにつながるため",
    conditions: "次回コール不可／会社として営業電話拒否／キーマンへ確認後に拒否／転送NG／クレーム・強い拒否",
    exceptions: "なし（要確認）",
    exampleTalk: "承知いたしました。お忙しいところお時間をいただき、ありがとうございました。",
    source: "開発指示書 §2注意・§6品質項目・T13/T18/T26（ガードレール）",
    status: "NEEDS_CONFIRMATION",
    updatedAt: at,
  },
  {
    id: "kn_seed_retire_vs_absent",
    sceneIds: ["S08"],
    principle: "退職・異動（在籍なし）は不在と区別し、後任者を伺って取次ぎを依頼する。後任者を推測で補わない",
    reason: "不在扱いで再架電しても目的の相手に届かないため",
    conditions: "②キーマン名ありリストで『在籍なし（退職・異動）』と言われた場合",
    exceptions: "後任者が分からない場合は部署宛ての取次ぎ可否を確認",
    exampleTalk: "",
    source: "最新版コールフロー②（図形16・119・122・注記2）",
    status: "NEEDS_CONFIRMATION",
    updatedAt: at,
  },
  {
    id: "kn_seed_contact_strength",
    sceneIds: ["S02", "S03"],
    principle: "名ありリストでも接点の強弱により取次ぎやすさは変わる。接点は事実どおり短く伝え、誇張しない",
    reason: "信頼が低い接点（展示会でブースに立ち寄っただけ等）を親しい関係のように伝えると不信感を招くため",
    conditions: "②キーマン名ありリスト",
    exceptions: "",
    exampleTalk: "",
    source: "最新版コールフロー②（注記17）",
    status: "NEEDS_CONFIRMATION",
    updatedAt: at,
  },
  {
    id: "kn_seed_no_invented_name",
    sceneIds: ["S07"],
    principle: "キーマン名を入手できなかった場合も人名を創作せず、部署・役職での呼び出し方を確認する",
    reason: "誤った人名での取次依頼は受付の信頼を損なうため",
    conditions: "①キーマン名なしリスト、キーマン名入手できず",
    exceptions: "",
    exampleTalk: "",
    source: "開発指示書 T04（ガードレール）",
    status: "NEEDS_CONFIRMATION",
    updatedAt: at,
  },
  {
    id: "kn_seed_opening_structure",
    sceneIds: ["S01", "S03", "S11"],
    principle: "最初の挨拶は「（クッション言葉）→名乗り→電話した理由（相手側の事情）→相手への問いかけ」の順で組み立てる",
    reason: "名乗りの直後に『なぜ電話したか』と『相手に関係する問い』があると、用件が伝わり会話が続きやすいため（画面案からの読み取り）",
    conditions: "受付突破・キーマンへの最初の挨拶",
    exceptions: "",
    exampleTalk: "（お忙しいところ申し訳ございません）〇〇の〇〇と申します。〇〇が〇〇なのでお電話させていただいたのですが、〇〇は〇〇でしょうか？",
    source: "優先1シート「利用イメージ」画面案（【受付突破】【キーマンへの最初の挨拶】の例文）",
    status: "NEEDS_CONFIRMATION",
    updatedAt: at,
  },
  {
    id: "kn_seed_precheck_objection",
    sceneIds: ["S03", "S11", "S15"],
    principle: "よくある断り文句は、事前に調べられる事実で先回りし、その事実を『電話した理由』に変える",
    reason: "断られる理由そのものを用件にすると、同じ断り文句で終わらずに話を聞いてもらえるため",
    conditions: "特定の断り文句（例：「テイクアウトはやっていないから不要」）が繰り返し発生する施策",
    exceptions: "事前確認できない情報の場合は使えない（推測で決めつけない）",
    exampleTalk: "（食べログ等でテイクアウト未実施を確認した店舗に）「テイクアウトはやってらっしゃらないですよね？（だからお電話しました）」",
    source: "優先1シート「実現したいこと」の課題と回答例（人間の回答例として記載）",
    status: "NEEDS_CONFIRMATION",
    updatedAt: at,
  },
];
