/**
 * 発話場面カタログ（scene_catalog）。
 *
 * 指示書§3の最小カタログ（S01〜S18）を、最新版コールフロー2シートの図形と対応づけたもの。
 * これは「初期の分析上の分類案」であり、バディコンサルティングの確定ノウハウではない。
 * 各場面の cases は、同じ場面内で条件によりトークを使い分ける単位（図形の分岐に対応）。
 */
import type { FlowType } from "./flowModel.js";

export type ProjectField =
  | "callerCompany"
  | "productName"
  | "productSummary"
  | "valueProps"
  | "callReason"
  | "goals"
  | "targetDepartment"
  | "targetRole"
  | "targetIndustry"
  | "listOrigin"
  | "contactStrength"
  | "contactHistory"
  | "materials"
  | "meetingFormat"
  | "hearingItems"
  | "emailContent"
  | "evidence"
  | "ngExpressions"
  | "operatorPoints"
  | "preCheckFacts";

export interface SceneCase {
  caseId: string;
  label: string;
  condition: string;
  /** 対応する図形ID（フロー別） */
  sourceNodes: Partial<Record<FlowType, string[]>>;
  /** このケースで守るべき扱い（ガードレール） */
  guardrail?: string;
  /** このケースでは再架電・再勧誘を示唆してはいけない */
  noRecontact?: boolean;
}

export interface SceneDefinition {
  sceneId: string;
  title: string;
  flows: FlowType[];
  scope: "共通" | "①固有" | "②固有" | "共通（①寄り）";
  speaker: "受付宛" | "本人宛" | "受付宛／本人宛";
  occurrence: string;
  purpose: string;
  requiredInputs: ProjectField[];
  optionalInputs: ProjectField[];
  /** 生成時に考慮する条件（D） */
  conditions: string[];
  avoid: string[];
  cases: SceneCase[];
  /** goals に依存して選択される場面 */
  requiresGoal?: "meeting" | "materials";
  /** 図にない場面を補った場合 true（AI提案として明示） */
  aiProposedScene?: boolean;
  openQuestions: string[];
}

const BOTH: FlowType[] = ["NO_KEYMAN_NAME", "HAS_KEYMAN_NAME"];
const A: FlowType[] = ["NO_KEYMAN_NAME"];
const B: FlowType[] = ["HAS_KEYMAN_NAME"];

export const SCENES: SceneDefinition[] = [
  {
    sceneId: "S01",
    title: "キーマン名なし：受付への第一声・担当部署確認・取次依頼",
    flows: A,
    scope: "①固有",
    speaker: "受付宛",
    occurrence: "①で受付担当者が受電したとき（担当者名は不明）",
    purpose: "名乗り・用件の要点を簡潔に伝え、担当部署（担当者）への取次ぎを依頼する",
    requiredInputs: ["callerCompany", "productName", "callReason", "targetDepartment"],
    optionalInputs: ["targetRole", "productSummary"],
    conditions: ["担当者名が不明", "受付が受電", "対象部署・役職", "電話の理由"],
    avoid: ["担当者名を知っているかのような言い方", "長い商品説明", "用件を曖昧にして取次ぎだけを求める"],
    cases: [
      { caseId: "first", label: "第一声・取次依頼", condition: "受付担当者が受電", sourceNodes: { NO_KEYMAN_NAME: ["29"] } },
    ],
    openQuestions: [],
  },
  {
    sceneId: "S02",
    title: "キーマン名あり：指名取次依頼",
    flows: B,
    scope: "②固有",
    speaker: "受付宛",
    occurrence: "②でキーマン部署の受付が受電したとき",
    purpose: "キーマンの氏名を指名して取次ぎを依頼する。接点がある場合はその経緯を短く添える",
    requiredInputs: ["callerCompany", "productName", "listOrigin"],
    optionalInputs: ["contactHistory", "contactStrength", "callReason", "targetDepartment"],
    conditions: ["担当者名（〔キーマン氏名〕）", "部署", "接点の経緯・信頼度（強／弱）"],
    avoid: ["面識が薄いのに親しい関係を装う", "接点を誇張する", "確率・取次率の断定"],
    cases: [
      { caseId: "strong", label: "接点が強い場合", condition: "既存顧客・過去にやり取りあり", sourceNodes: { HAS_KEYMAN_NAME: ["33", "17"] } },
      { caseId: "weak", label: "接点が弱い場合", condition: "展示会で名刺交換のみ等、関係が薄い", sourceNodes: { HAS_KEYMAN_NAME: ["33", "17"] },
        guardrail: "関係が薄いことを前提に、接点の事実のみを短く伝える" },
    ],
    openQuestions: ["接点の強弱による言い回しの使い分けに承認済みノウハウがあるか"],
  },
  {
    sceneId: "S03",
    title: "キーマン本人が直接受電したときの最初の挨拶",
    flows: BOTH,
    scope: "共通",
    speaker: "本人宛",
    occurrence: "キーマンが受電／受付から本人へつながった直後",
    purpose: "本人確認・名乗り・電話の主旨を短く伝え、話を続けてよいか確認する",
    requiredInputs: ["callerCompany", "productName", "callReason"],
    optionalInputs: ["contactHistory", "listOrigin", "targetRole", "preCheckFacts"],
    conditions: ["名あり／名なし", "既存接点の有無", "本人であることの確認"],
    avoid: ["受付向けの取次ぎ文言を挟む", "一方的に長く話し始める"],
    cases: [
      { caseId: "direct", label: "本人が直接受電", condition: "キーマンが受電", sourceNodes: { NO_KEYMAN_NAME: ["30"], HAS_KEYMAN_NAME: ["34"] } },
      { caseId: "transferred", label: "受付から取り次がれた", condition: "受付経由でキーマンと対話", sourceNodes: { NO_KEYMAN_NAME: ["15", "2"], HAS_KEYMAN_NAME: ["15", "33"] } },
    ],
    openQuestions: [],
  },
  {
    sceneId: "S04",
    title: "受付から用件・営業電話かどうかを聞かれたとき",
    flows: BOTH,
    scope: "共通",
    speaker: "受付宛",
    occurrence: "受付から『どういったご用件ですか』『営業のお電話ですか』と聞かれたとき",
    purpose: "事実に基づいて用件を簡潔に説明し、担当者へ取り次ぐ価値があることを伝える",
    requiredInputs: ["productName", "productSummary", "callReason"],
    optionalInputs: ["valueProps", "targetDepartment"],
    conditions: ["実際の商材", "電話の目的", "受電者の役割（受付）"],
    avoid: ["営業目的を偽る・はぐらかす", "根拠のない実績・数値"],
    cases: [
      { caseId: "purpose", label: "用件を聞かれた", condition: "用件を確認された", sourceNodes: { NO_KEYMAN_NAME: ["29"], HAS_KEYMAN_NAME: ["33"] } },
      { caseId: "is_sales", label: "営業電話か聞かれた", condition: "『営業ですか』と確認された", sourceNodes: { NO_KEYMAN_NAME: ["29"], HAS_KEYMAN_NAME: ["33"] },
        guardrail: "営業目的であることを否定しない" },
    ],
    openQuestions: [],
  },
  {
    sceneId: "S05",
    title: "受付から部署・担当者を紹介／取次ぎを依頼する場面",
    flows: BOTH,
    scope: "共通（①寄り）",
    speaker: "受付宛",
    occurrence: "①：代表受付からキーマンの部署の受付へ回された時／②：受付から担当者の確認・別担当を案内された時",
    purpose: "回された先で改めて名乗り・用件を伝え、担当者への取次ぎを依頼する",
    requiredInputs: ["callerCompany", "productName", "targetDepartment"],
    optionalInputs: ["targetRole", "callReason"],
    conditions: ["部署", "担当者名の有無", "段階的な取次ぎ"],
    avoid: ["前の受付と同じ長さで繰り返す"],
    cases: [
      { caseId: "dept_reception", label: "部署の受付に回された（①）", condition: "キーマンの部署の受付に取り次ぎ", sourceNodes: { NO_KEYMAN_NAME: ["2"] } },
      { caseId: "redirected", label: "担当部署・担当者を案内された", condition: "受付から別部署・別担当を案内された", sourceNodes: { NO_KEYMAN_NAME: ["29"], HAS_KEYMAN_NAME: ["33"] } },
    ],
    openQuestions: ["②で受付から別担当者を案内された場合の扱い（図には明示なし）"],
  },
  {
    sceneId: "S06",
    title: "キーマン不在時の在席日時・連絡方法の確認",
    flows: BOTH,
    scope: "共通",
    speaker: "受付宛",
    occurrence: "キーマン不在と言われたとき",
    purpose: "在席日時を伺い、不明な場合は出社状況・連絡方法を無理のない範囲で確認する",
    requiredInputs: ["callerCompany"],
    optionalInputs: ["productName"],
    conditions: ["不在状況", "在席情報の有無", "基本出勤／ほぼ在宅", "携帯番号の可否"],
    avoid: ["個人の携帯番号をしつこく求める", "受付が答えられない情報を繰り返し聞く"],
    cases: [
      { caseId: "ask_schedule", label: "在席日時を伺う", condition: "キーマン不在", sourceNodes: { NO_KEYMAN_NAME: ["4"], HAS_KEYMAN_NAME: ["4"] } },
      { caseId: "schedule_known", label: "在席日時を入手できた", condition: "在席日時入手", sourceNodes: { NO_KEYMAN_NAME: ["5"], HAS_KEYMAN_NAME: ["5"] } },
      { caseId: "office_based", label: "日時不明・基本出勤", condition: "在席日時入手できず＋基本出勤", sourceNodes: { NO_KEYMAN_NAME: ["6", "11"], HAS_KEYMAN_NAME: ["6", "11"] } },
      { caseId: "mostly_remote", label: "日時不明・ほぼ在宅", condition: "在席日時入手できず＋ほぼ在宅（携帯番号の可否を確認）", sourceNodes: { NO_KEYMAN_NAME: ["6", "12", "13", "14"], HAS_KEYMAN_NAME: ["6", "12", "13", "14"] },
        guardrail: "携帯番号は受付が案内できる範囲でのみ伺い、断られたらメール等の別手段に切り替える" },
    ],
    openQuestions: ["①注記『店長などの場合』がどの分岐の補足か"],
  },
  {
    sceneId: "S07",
    title: "キーマン名を尋ねる場面",
    flows: A,
    scope: "①固有",
    speaker: "受付宛",
    occurrence: "①でキーマン不在、または担当者の特定が必要なとき",
    purpose: "次回の取次ぎのために担当者のお名前を伺う。教えてもらえない場合は部署・役職での呼び出し方を確認する",
    requiredInputs: ["targetDepartment"],
    optionalInputs: ["targetRole", "callerCompany"],
    conditions: ["既知の部署・役職", "聞き方に関する承認済みノウハウ"],
    avoid: ["人名を推測・創作する", "名前を聞き出すための虚偽"],
    cases: [
      { caseId: "ask_name", label: "お名前を伺う", condition: "キーマン不在（名なし）", sourceNodes: { NO_KEYMAN_NAME: ["4", "29"] } },
      { caseId: "name_obtained", label: "名前を入手できた", condition: "キーマン名入手（②への移行条件）", sourceNodes: { NO_KEYMAN_NAME: ["16", "75"] } },
      { caseId: "name_not_obtained", label: "名前を入手できず", condition: "キーマン名入手できず", sourceNodes: { NO_KEYMAN_NAME: ["17"] },
        guardrail: "人名を創作せず、部署・役職宛てでの次回取次ぎ方法を確認する" },
    ],
    openQuestions: ["キーマン名を伺う際の承認済みノウハウ（聞き方・タイミング）"],
  },
  {
    sceneId: "S08",
    title: "キーマン退職・異動時の後任者確認・再取次ぎ",
    flows: B,
    scope: "②固有",
    speaker: "受付宛",
    occurrence: "②で『その者は退職（異動）しました』と言われたとき",
    purpose: "不在とは区別し、後任のご担当者を伺い、取次ぎを依頼する",
    requiredInputs: ["callerCompany", "productName"],
    optionalInputs: ["targetDepartment", "contactHistory"],
    conditions: ["在籍なし（退職・異動）", "後任者名の入手可否", "対象キーマン情報の更新"],
    avoid: ["不在と同じ『改めます』で終わる", "後任者を推測で補完する", "退職理由等の詮索"],
    cases: [
      { caseId: "ask_successor", label: "後任者を伺う", condition: "在籍なし（退職・異動）", sourceNodes: { HAS_KEYMAN_NAME: ["16"] } },
      { caseId: "successor_known", label: "後任者が分かった", condition: "後任者入手→後任者へ取次依頼", sourceNodes: { HAS_KEYMAN_NAME: ["119", "2"] } },
      { caseId: "successor_unknown", label: "後任者が分からない", condition: "後任者入手できず", sourceNodes: { HAS_KEYMAN_NAME: ["122"] },
        guardrail: "後任者を推測しない。部署宛ての取次ぎ可否を確認する" },
    ],
    openQuestions: [],
  },
  {
    sceneId: "S09",
    title: "取次ぎ拒否時の受け答え",
    flows: BOTH,
    scope: "共通",
    speaker: "受付宛",
    occurrence: "受付に取次ぎを断られたとき",
    purpose: "拒否の理由を区別し、許される範囲の代替（メール等）を確認する。会社方針・本人確認後の拒否は尊重して終話する",
    requiredInputs: ["callerCompany", "productName"],
    optionalInputs: ["productSummary", "valueProps"],
    conditions: ["営業電話の警戒（居留守を疑う）", "受付判断（キーマン確認前）", "受付判断（キーマン確認後）", "会社として営業電話拒否"],
    avoid: ["拒否後に何度も食い下がる", "受付を責める・圧をかける", "居留守を指摘する"],
    cases: [
      { caseId: "wary", label: "営業電話を警戒（居留守の可能性）", condition: "営業電話警戒（居留守）", sourceNodes: { NO_KEYMAN_NAME: ["7", "25"], HAS_KEYMAN_NAME: ["7", "29"] },
        guardrail: "居留守を指摘しない。メール等の連絡手段の確認へつなぐ" },
      { caseId: "before_check", label: "受付判断：キーマンへ確認前に拒否", condition: "キーマンへ確認前に拒否", sourceNodes: { NO_KEYMAN_NAME: ["24", "91"], HAS_KEYMAN_NAME: ["28", "95"] },
        guardrail: "用件を一言で伝え、ご本人への確認のみを一度だけお願いする。再度断られたら終話" },
      { caseId: "after_check", label: "受付判断：キーマンへ確認後に拒否", condition: "キーマンへ確認後に拒否", sourceNodes: { NO_KEYMAN_NAME: ["92"], HAS_KEYMAN_NAME: ["96"] },
        guardrail: "本人の意思として尊重し、お礼を述べて終話", noRecontact: true },
      { caseId: "company_policy", label: "会社として営業電話お断り", condition: "会社として営業電話拒否", sourceNodes: { NO_KEYMAN_NAME: ["23"], HAS_KEYMAN_NAME: ["27"] },
        guardrail: "勧誘を続けない。お礼を述べて終話", noRecontact: true },
    ],
    openQuestions: ["『確認前に拒否』で一度だけ確認をお願いすることの可否（承認済みノウハウが必要）"],
  },
  {
    sceneId: "S10",
    title: "問い合わせフォーム案内・メール対応の確認",
    flows: BOTH,
    scope: "共通",
    speaker: "受付宛",
    occurrence: "受付からメールやフォームを案内されたとき、または電話以外の手段を確認するとき",
    purpose: "直接メール／転送／転送不可／フォーム誘導を区別し、それぞれに必要な確認を行って終話する",
    requiredInputs: ["callerCompany", "productName"],
    optionalInputs: ["emailContent"],
    conditions: ["直接メールOK", "転送OK", "転送NG", "フォーム誘導"],
    avoid: ["転送NGの後にさらに別手段を求め続ける", "メールアドレスを無理に聞き出す"],
    cases: [
      { caseId: "email_direct", label: "キーマンへ直接メールOK", condition: "キーマンへメールOK（直接）", sourceNodes: { NO_KEYMAN_NAME: ["96"], HAS_KEYMAN_NAME: ["100"] } },
      { caseId: "email_forward", label: "受付経由で転送OK", condition: "キーマンへメール転送OK", sourceNodes: { NO_KEYMAN_NAME: ["8"], HAS_KEYMAN_NAME: ["8"] } },
      { caseId: "email_ng", label: "メール転送もNG", condition: "キーマンへメール転送NG", sourceNodes: { NO_KEYMAN_NAME: ["10", "14"], HAS_KEYMAN_NAME: ["10", "14"] },
        guardrail: "お礼を述べて終話する", noRecontact: true },
      { caseId: "form", label: "問い合わせフォームへ誘導", condition: "問合せフォームへ誘導", sourceNodes: { NO_KEYMAN_NAME: ["9"], HAS_KEYMAN_NAME: ["9"] } },
    ],
    openQuestions: ["転送NG後の再架電可否の運用ルール"],
  },
  {
    sceneId: "S11",
    title: "キーマンへの主旨説明・価値説明・ニーズ喚起",
    flows: BOTH,
    scope: "共通",
    speaker: "本人宛",
    occurrence: "キーマンと対話し、話を続けてよいと言われたとき",
    purpose: "電話の主旨と相手にとっての価値を、資料にある事実に基づいて簡潔に伝える",
    requiredInputs: ["productName", "productSummary", "valueProps", "callReason"],
    optionalInputs: ["evidence", "targetIndustry", "targetRole", "contactHistory", "preCheckFacts"],
    conditions: ["商材", "顧客にとっての価値", "電話理由", "相手の役割"],
    avoid: ["根拠のない実績・数値・料金", "一般論の羅列", "長い独演"],
    cases: [
      { caseId: "pitch", label: "主旨・価値説明", condition: "キーマンと対話", sourceNodes: { NO_KEYMAN_NAME: ["15"], HAS_KEYMAN_NAME: ["15", "17"] } },
    ],
    openQuestions: [],
  },
  {
    sceneId: "S12",
    title: "必要なヒアリング質問",
    flows: BOTH,
    scope: "共通",
    speaker: "本人宛",
    occurrence: "主旨説明の後、相手の状況を伺うとき",
    purpose: "課題・現状・検討時期など、次の打診を判断するための質問を少数に絞って行う",
    requiredInputs: ["hearingItems"],
    optionalInputs: ["productSummary", "targetRole"],
    conditions: ["課題", "現状", "検討時期", "導入条件", "施策目的"],
    avoid: ["尋問のように質問を並べる", "答えにくい予算等をいきなり聞く"],
    cases: [
      { caseId: "questions", label: "ヒアリング質問", condition: "キーマンと対話", sourceNodes: { NO_KEYMAN_NAME: ["15"], HAS_KEYMAN_NAME: ["15"] } },
    ],
    openQuestions: [],
  },
  {
    sceneId: "S13",
    title: "商談打診・日程確認",
    flows: BOTH,
    scope: "共通",
    speaker: "本人宛",
    occurrence: "ヒアリングで関心が見られたとき",
    purpose: "商談の目的・所要時間を伝えて打診し、了承後は日程・形式を確認する",
    requiredInputs: ["meetingFormat"],
    optionalInputs: ["productName", "valueProps"],
    conditions: ["商談のゴール", "打診条件", "相手の関心"],
    avoid: ["断りの直後に同じ打診を繰り返す", "所要時間を偽る"],
    requiresGoal: "meeting",
    cases: [
      { caseId: "propose", label: "商談を打診する", condition: "関心あり", sourceNodes: { NO_KEYMAN_NAME: ["15"], HAS_KEYMAN_NAME: ["15"] } },
      { caseId: "confirm", label: "商談OK後の日程確認", condition: "商談OK／商談希望", sourceNodes: { NO_KEYMAN_NAME: ["18"], HAS_KEYMAN_NAME: ["22"] } },
    ],
    openQuestions: [],
  },
  {
    sceneId: "S14",
    title: "資料送付打診・送付内容の確認",
    flows: BOTH,
    scope: "共通",
    speaker: "本人宛",
    occurrence: "商談までは難しいが情報は欲しい、または資料送付が目的のとき",
    purpose: "資料の内容を伝えて送付を打診し、了承後は送付先・形式を確認する",
    requiredInputs: ["materials"],
    optionalInputs: ["productName"],
    conditions: ["資料の有無", "送付先", "相手の許諾"],
    avoid: ["存在しない資料を約束する", "許諾なく送付を決める"],
    requiresGoal: "materials",
    cases: [
      { caseId: "propose", label: "資料送付を打診する", condition: "資料送付の打診", sourceNodes: { NO_KEYMAN_NAME: ["15"], HAS_KEYMAN_NAME: ["15"] } },
      { caseId: "confirm", label: "資料送付OK後の送付先確認", condition: "資料送付OK／資料送付希望", sourceNodes: { NO_KEYMAN_NAME: ["19"], HAS_KEYMAN_NAME: ["23"] } },
    ],
    openQuestions: [],
  },
  {
    sceneId: "S15",
    title: "商談・資料不要／反論時の応答と適切な終話",
    flows: BOTH,
    scope: "共通",
    speaker: "本人宛",
    occurrence: "キーマンから商談・資料とも不要と言われたとき",
    purpose: "断りを受け止め、次回連絡の可否を一度だけ確認する。不可の場合は理由別に尊重して終話する",
    requiredInputs: ["callerCompany"],
    optionalInputs: ["productName", "preCheckFacts"],
    conditions: ["次回コール可否", "断り理由（会社要因／担当要因）", "連絡不可の意思"],
    avoid: ["無根拠な反論", "次回コール不可・クレーム後の再勧誘", "相手の判断を否定する"],
    cases: [
      { caseId: "decline_ask_next", label: "不要と言われた：次回連絡可否の確認", condition: "商談・資料不要", sourceNodes: { NO_KEYMAN_NAME: ["20"], HAS_KEYMAN_NAME: ["24"] } },
      { caseId: "no_call_company", label: "次回不可：会社として可能性なし", condition: "次回コール不可＋業種違い（ニーズなし）・取引不可", sourceNodes: { NO_KEYMAN_NAME: ["77", "80", "89"], HAS_KEYMAN_NAME: ["81", "84", "93"] },
        guardrail: "再勧誘・再連絡の示唆をしない", noRecontact: true },
      { caseId: "no_call_person", label: "次回不可：担当として可能性なし（クレーム・強い拒否を含む）", condition: "次回コール不可＋担当として可能性なし", sourceNodes: { NO_KEYMAN_NAME: ["77", "81", "88"], HAS_KEYMAN_NAME: ["81", "85", "92"] },
        guardrail: "お詫びとお礼で終話。反論・再勧誘をしない", noRecontact: true },
    ],
    openQuestions: ["次回コール不可の記録方法（架電リストからの除外ルール）"],
  },
  {
    sceneId: "S16",
    title: "次回連絡が許容される場合の検討時期の確認",
    flows: BOTH,
    scope: "共通",
    speaker: "本人宛",
    occurrence: "次回の連絡は構わないと言われたとき",
    purpose: "検討時期を伺い、次回連絡の目安を合意する。伺えない場合は無理に聞かない",
    requiredInputs: [],
    optionalInputs: ["productName"],
    conditions: ["次回コール可", "検討時期の取得可否"],
    avoid: ["具体的な日付を強要する"],
    cases: [
      { caseId: "ask_timing", label: "検討時期を伺う", condition: "次回コール可", sourceNodes: { NO_KEYMAN_NAME: ["76"], HAS_KEYMAN_NAME: ["80"] } },
      { caseId: "timing_known", label: "検討時期を伺えた", condition: "検討時期ヒアリング", sourceNodes: { NO_KEYMAN_NAME: ["78"], HAS_KEYMAN_NAME: ["82"] } },
      { caseId: "timing_unknown", label: "検討時期を伺えなかった", condition: "検討時期ヒアリングできず", sourceNodes: { NO_KEYMAN_NAME: ["79"], HAS_KEYMAN_NAME: ["83"] } },
    ],
    openQuestions: [],
  },
  {
    sceneId: "S17",
    title: "時間不足・途中終了時の再連絡可否確認",
    flows: BOTH,
    scope: "共通",
    speaker: "本人宛",
    occurrence: "相手が忙しい、話の途中で時間切れになったとき",
    purpose: "相手の都合を優先して切り上げ、改めて連絡してよいか・都合のよい日時を確認する",
    requiredInputs: [],
    optionalInputs: ["productName"],
    conditions: ["未完了", "相手の都合", "再架電の許可"],
    avoid: ["忙しいと言われてから話を続ける"],
    cases: [
      { caseId: "busy", label: "時間がない／途中終了", condition: "未完了（時間なく再架電など）", sourceNodes: { NO_KEYMAN_NAME: ["116"], HAS_KEYMAN_NAME: ["26"] } },
    ],
    openQuestions: [],
  },
  {
    sceneId: "S18",
    title: "メール送付が許可された場合の簡潔な依頼／確認",
    flows: BOTH,
    scope: "共通",
    speaker: "受付宛",
    occurrence: "直接メール、または転送が許可されたとき",
    purpose: "宛先・件名・送る内容を簡潔に確認し、お礼を述べる",
    requiredInputs: ["emailContent"],
    optionalInputs: ["productName", "materials"],
    conditions: ["直接／転送", "同意", "送る内容"],
    avoid: ["許可された範囲を超える依頼"],
    cases: [
      { caseId: "direct", label: "直接メールの宛先確認", condition: "キーマンへメールOK（直接）", sourceNodes: { NO_KEYMAN_NAME: ["96"], HAS_KEYMAN_NAME: ["100"] } },
      { caseId: "forward", label: "転送依頼の確認", condition: "キーマンへメール転送OK", sourceNodes: { NO_KEYMAN_NAME: ["8"], HAS_KEYMAN_NAME: ["8"] } },
    ],
    openQuestions: [],
  },
];

export const SCENE_MAP: Record<string, SceneDefinition> = Object.fromEntries(SCENES.map((s) => [s.sceneId, s]));

/**
 * 完成版スクリプトの目次（Contents）。
 * 優先1シート「利用イメージ」の画面案の章を、ユーザー指示（2026-11-11）によりヒアリングをクロージングの前に置いた順で並べる。
 * 主旨説明とニーズ喚起は S11 で一体のため1章にまとめた。
 */
export const CHAPTERS: { id: string; label: string; scenes: string[] }[] = [
  { id: "reception", label: "受付突破", scenes: ["S01", "S02", "S04", "S05", "S06", "S07", "S08", "S09", "S10", "S18"] },
  { id: "greeting", label: "最初の挨拶", scenes: ["S03"] },
  { id: "pitch", label: "主旨説明・ニーズ喚起", scenes: ["S11"] },
  { id: "hearing", label: "ヒアリング", scenes: ["S12"] },
  { id: "closing", label: "クロージング", scenes: ["S13", "S14", "S15", "S16", "S17"] },
];
export const CHAPTER_OF: Record<string, string> = Object.fromEntries(CHAPTERS.flatMap((c) => c.scenes.map((s) => [s, c.label])));

/** 案件の入力項目定義と、不足時の質問（指示書 Step 3） */
export interface FieldDefinition {
  key: ProjectField;
  label: string;
  kind: "text" | "longtext" | "select" | "multiselect";
  options?: { value: string; label: string }[];
  priority: number; // 小さいほど重要
  question: string;
  purpose: string;
  sufficient: string;
  followUp: string;
  contradictionCheck?: string;
}

export const FIELDS: FieldDefinition[] = [
  { key: "callerCompany", label: "名乗る会社名（自社名／代行時の名乗り）", kind: "text", priority: 1,
    question: "電話で名乗る会社名は何ですか（架電代行の場合、クライアント名で名乗るかも含めて）。",
    purpose: "受付・本人への名乗りに使う", sufficient: "実際に電話口で名乗る正式名称", followUp: "略称で名乗る場合はその読みも教えてください。" },
  { key: "productName", label: "商材名", kind: "text", priority: 1,
    question: "今回ご案内する商材・サービスの名称は何ですか。",
    purpose: "用件説明・主旨説明に使う", sufficient: "電話で言いやすい名称", followUp: "一言で言うと何のサービスかも教えてください。" },
  { key: "productSummary", label: "商材の概要（一言で何か）", kind: "longtext", priority: 2,
    question: "その商材を一言で説明すると、誰の何をどう良くするものですか。",
    purpose: "受付での用件説明（S04）と主旨説明（S11）の核", sufficient: "対象者・効果・手段が分かる1〜2文", followUp: "競合と比べて違う点があれば教えてください。" },
  { key: "callReason", label: "今回電話する理由・切り口", kind: "longtext", priority: 2,
    question: "なぜ今、この相手に電話するのですか（例：新サービス開始のご案内、展示会のお礼、法改正への対応など）。",
    purpose: "第一声と主旨説明の『電話の理由』", sufficient: "相手にとって電話を受ける理由になる事実", followUp: "その理由を裏付ける資料があれば添付してください。",
    contradictionCheck: "リストの来歴（新規／既存）と矛盾しないか" },
  { key: "goals", label: "架電の目的", kind: "multiselect", priority: 1,
    options: [ { value: "meeting", label: "商談（アポイント）" }, { value: "materials", label: "資料送付" }, { value: "info", label: "情報取得（キーマン特定等）" } ],
    question: "今回の架電のゴールは何ですか（商談／資料送付／情報取得、複数可）。",
    purpose: "生成する打診場面（S13・S14）の選択", sufficient: "1つ以上選択", followUp: "最優先のゴールはどれですか。" },
  { key: "targetDepartment", label: "対象部署", kind: "text", priority: 2,
    question: "取次ぎを依頼する部署はどこですか（例：人事部、情報システム部）。",
    purpose: "①の担当部署確認、取次依頼", sufficient: "受付が分かる部署名", followUp: "会社により部署名が違う場合の言い換えを教えてください。" },
  { key: "targetRole", label: "キーマンの役職・立場", kind: "text", priority: 3,
    question: "話したい相手の役職・立場は何ですか（例：人事責任者、店長）。",
    purpose: "①で部署・役職での取次ぎ、言葉遣い", sufficient: "役職名または担当業務", followUp: "決裁者と担当者のどちらを狙いますか。" },
  { key: "targetIndustry", label: "ターゲット業種・規模", kind: "text", priority: 4,
    question: "架電先の業種・規模はどのような企業ですか。",
    purpose: "主旨説明の例示・言葉選び", sufficient: "業種と従業員規模の目安", followUp: "業種によってトークを変える必要はありますか。" },
  { key: "listOrigin", label: "リストの来歴", kind: "select", priority: 2,
    options: [ { value: "new", label: "新規（接点なし）" }, { value: "existing", label: "既存顧客" }, { value: "exhibition", label: "展示会・イベント来訪" }, { value: "referral", label: "紹介" }, { value: "inquiry", label: "過去の問い合わせ・資料請求" }, { value: "other", label: "その他" } ],
    question: "このリストはどのような経緯で入手したものですか（新規／既存顧客／展示会来訪／紹介 等）。",
    purpose: "名ありの指名取次（S02）と本人への導入（S03）の言い方", sufficient: "選択肢から1つ", followUp: "接点はいつ頃のものですか。" },
  { key: "contactStrength", label: "接点の強さ", kind: "select", priority: 3,
    options: [ { value: "strong", label: "強い（取引・継続的なやり取りあり）" }, { value: "weak", label: "弱い（名刺交換のみ等）" }, { value: "none", label: "なし" } ],
    question: "相手との接点の強さはどの程度ですか。",
    purpose: "②の取次依頼の言い回し（信頼度により取次ぎやすさが変わる）", sufficient: "選択肢から1つ", followUp: "相手がこちらを覚えている可能性はありますか。",
    contradictionCheck: "リスト来歴が『新規』なのに接点『強い』になっていないか" },
  { key: "contactHistory", label: "接点の経緯（具体）", kind: "longtext", priority: 4,
    question: "相手との接点の具体的な経緯を教えてください（例：2024年○月の○○展でブースにお立ち寄りいただいた）。",
    purpose: "接点を事実どおりに伝えるため", sufficient: "いつ・どこで・何をしたか", followUp: "相手側の担当者名は分かっていますか。" },
  { key: "valueProps", label: "相手にとっての価値（ベネフィット）", kind: "longtext", priority: 2,
    question: "相手にとってのメリットを、資料で裏付けられる範囲で2〜3点教えてください。",
    purpose: "主旨説明（S11）と商談打診の理由", sufficient: "根拠のあるメリット", followUp: "裏付ける資料・事例はありますか。" },
  { key: "materials", label: "送付できる資料", kind: "longtext", priority: 3,
    question: "送付できる資料の名称・内容・形式（PDF・郵送など）を教えてください。",
    purpose: "資料送付打診（S14）", sufficient: "資料名と主な内容", followUp: "送付方法（メール／郵送）はどちらですか。" },
  { key: "meetingFormat", label: "商談の形式・所要時間", kind: "text", priority: 3,
    question: "商談の形式（オンライン／訪問）と所要時間、商談で何をするかを教えてください。",
    purpose: "商談打診（S13）", sufficient: "形式・時間・内容", followUp: "日程候補の出し方に決まりはありますか。" },
  { key: "hearingItems", label: "ヒアリングしたい項目", kind: "longtext", priority: 3,
    question: "通話中に必ず伺いたい項目は何ですか（例：現状のやり方、課題、検討時期）。",
    purpose: "ヒアリング質問（S12）", sufficient: "優先順位つきで2〜4項目", followUp: "最低限1つだけ聞くならどれですか。" },
  { key: "emailContent", label: "メールで送る内容", kind: "longtext", priority: 4,
    question: "メール連絡が許可された場合、何を送りますか（件名・資料・本文の要点）。",
    purpose: "メール対応の確認（S10・S18）", sufficient: "件名と送付物", followUp: "送信者名・アドレスはどうしますか。" },
  { key: "evidence", label: "実績・数値・事例（根拠あり）", kind: "longtext", priority: 5,
    question: "トークで使ってよい実績・数値・事例はありますか（出典つきで）。",
    purpose: "事実に基づく主旨説明。ここにない数値は生成しない", sufficient: "出典の分かる事実", followUp: "社名を出してよい事例ですか。" },
  { key: "preCheckFacts", label: "架電前に事前確認できる情報（よくある断りへの先回り）", kind: "longtext", priority: 4,
    question: "よくある断り文句のうち、架電前に調べて先回りできるものはありますか。何を・どこで確認し、確認結果をどう使いますか（例：食べログでテイクアウト実施有無を確認→未実施の店舗には『テイクアウトはやってらっしゃらないですよね？』と切り出す）。",
    purpose: "最初の挨拶・主旨説明で『電話した理由』を相手の事実に合わせ、断り（S15）を先回りする", sufficient: "断り文句・確認する情報・確認方法・確認結果ごとの使い方", followUp: "確認できなかった相手にはどう話しますか。",
    contradictionCheck: "確認できない情報を前提にしたトークになっていないか" },
  { key: "operatorPoints", label: "オペレーター向けの注意事項・ポイント", kind: "longtext", priority: 5,
    question: "オペレーターがスクリプトを使う前に知っておくべき注意事項・ポイントはありますか（例：〇〇とは言わない、△△を必ず確認）。",
    purpose: "完成版スクリプトの冒頭『注意事項・変更点・ポイント』に表示", sufficient: "箇条書きで1〜5点", followUp: "特に強調したい言葉はありますか。" },
  { key: "ngExpressions", label: "NG表現・注意事項", kind: "longtext", priority: 5,
    question: "クライアントから禁止されている表現や注意事項はありますか。",
    purpose: "全場面の避ける表現", sufficient: "禁止語・注意点の一覧", followUp: "業界特有の規制はありますか。" },
];

export const FIELD_MAP: Record<string, FieldDefinition> = Object.fromEntries(FIELDS.map((f) => [f.key, f]));
