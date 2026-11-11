/**
 * DEMO生成器：APIキー未設定時に、案件入力を差し込むだけの決定的テンプレートで台本を作る。
 * 出力は必ず review_status = "DEMO" とし、承認済みノウハウとは表示しない。
 * 入力が不足する箇所は【要確認：…】として残し、事実を補完しない。
 * 〔…〕は架電時に差し込む変数（オペレーター名・キーマン氏名など）で、AIは値を創作しない。
 */
import { SCENE_MAP, type ProjectField, type SceneDefinition } from "./scenes.js";
import { answerText, goalsOf, inputSnapshot } from "./selection.js";
import type { Project, ScriptCase, ScriptScene, Variant } from "./types.js";
import { FIELD_MAP } from "./scenes.js";

type T = { short: string; standard: string; supplement?: string; intent: string };

function firstSentence(s: string): string {
  const m = s.split(/(?<=[。．!！?？])/)[0] ?? s;
  return m.replace(/[。．]$/, "");
}

export function demoScene(p: Project, scene: SceneDefinition): ScriptScene {
  const used = new Set<ProjectField>();
  const uncertain: string[] = [];
  const val = (f: ProjectField): string => {
    const t = answerText(p.answers[f]);
    if (t) { used.add(f); return t; }
    const label = FIELD_MAP[f].label.replace(/（.*?）/g, "");
    const msg = `【要確認：${label}】`;
    if (!uncertain.includes(`${label}が未入力`)) uncertain.push(`${label}が未入力`);
    return msg;
  };
  const opt = (f: ProjectField): string => { const t = answerText(p.answers[f]); if (t) used.add(f); return t; };

  const company = () => val("callerCompany");
  const product = () => val("productName");
  const dept = () => val("targetDepartment");
  // 「〜の件で」に入る話題。電話の理由（文章）は S11 等で別の文として使う
  const reasonShort = () => `${product()}のご案内`;
  /** 商材概要を「〜というサービス」の形に整える（末尾の「です」の重複を避ける） */
  const summaryNoun = () => {
    const s = opt("productSummary");
    if (!s) return "【要確認：商材の概要】というサービス";
    const norm = firstSentence(s).replace(/(です|でございます)$/, "");
    return /(サービス|ツール|システム|製品|ソリューション|アプリ)$/.test(norm) ? norm : `${norm}というサービス`;
  };
  const role = () => opt("targetRole") || "ご担当者様";
  const origin = answerText(p.answers.listOrigin);
  const history = opt("contactHistory");
  const contactLine = () => {
    const h = history ? firstSentence(history) : "";
    if (h && /た$/.test(h)) return `${h}際には、ありがとうございました。`;
    if (origin === "existing") return "いつも弊社サービスをご利用いただき、ありがとうございます。";
    if (origin === "exhibition") return "以前、展示会でお名刺を頂戴した際には、ありがとうございました。";
    if (origin === "referral") return "ご紹介をいただき、ご連絡しております。";
    if (origin === "inquiry") return "以前、弊社にお問い合わせをいただいた際には、ありがとうございました。";
    return "";
  };

  const T_: Record<string, Record<string, () => T>> = {
    S01: {
      first: () => ({
        intent: "名乗りと用件の要点を一息で伝え、担当部署への取次ぎを依頼する",
        short: `お忙しいところ恐れ入ります。${company()}の〔オペレーター名〕と申します。\n${reasonShort()}の件で、${dept()}のご担当者様にお取り次ぎいただけますでしょうか。`,
        standard: `お忙しいところ恐れ入ります。${company()}の〔オペレーター名〕と申します。\n${reasonShort()}の件でお電話いたしました。\n${dept()}の${role()}にお取り次ぎいただけますでしょうか。`,
        supplement: `（担当部署が分からないと言われたら）\n${product()}に関するご案内でして、${dept()}、もしくはそれに近いご担当の部署はございますでしょうか。`,
      }),
    },
    S02: {
      strong: () => ({
        intent: "氏名を指名し、既存の接点を事実どおり添えて取次ぎを依頼する",
        short: `お世話になっております。${company()}の〔オペレーター名〕と申します。\n〔キーマン氏名〕様はいらっしゃいますでしょうか。`,
        standard: `お世話になっております。${company()}の〔オペレーター名〕と申します。\n${contactLine() ? contactLine() + "\n" : ""}${reasonShort()}の件で、〔キーマン氏名〕様にお取り次ぎいただけますでしょうか。`,
      }),
      weak: () => ({
        intent: "関係が薄いことを前提に、接点の事実だけを短く伝えて指名する",
        short: `お忙しいところ恐れ入ります。${company()}の〔オペレーター名〕と申します。\n〔キーマン氏名〕様はいらっしゃいますでしょうか。`,
        standard: `お忙しいところ恐れ入ります。${company()}の〔オペレーター名〕と申します。\n${contactLine() ? contactLine() + "\n" : ""}${reasonShort()}の件でお電話いたしました。\n〔キーマン氏名〕様にお取り次ぎいただけますでしょうか。`,
        supplement: "（『どういったご関係ですか』と聞かれたら）\n" + (contactLine() ? `${contactLine()}そのご縁でご連絡しております。` : "【要確認：接点の経緯】") ,
      }),
    },
    S03: {
      direct: () => ({
        intent: "本人確認・名乗り・主旨を短く伝え、話してよいか許可を取る",
        short: `${p.flowType === "HAS_KEYMAN_NAME" ? "〔キーマン氏名〕様でいらっしゃいますか。" : `${dept()}のご担当者様でいらっしゃいますか。`}\n${company()}の〔オペレーター名〕と申します。${reasonShort()}の件で、1分ほどよろしいでしょうか。`,
        standard: `${p.flowType === "HAS_KEYMAN_NAME" ? "〔キーマン氏名〕様でいらっしゃいますか。" : `${dept()}のご担当者様でいらっしゃいますか。`}\n突然のお電話失礼いたします。${company()}の〔オペレーター名〕と申します。\n${contactLine() ? contactLine() + "\n" : ""}本日は${reasonShort()}の件でお電話いたしました。\n今、1分ほどお時間よろしいでしょうか。`,
      }),
      transferred: () => ({
        intent: "取り次いでもらったお礼と名乗り、話してよいかの確認",
        short: `お電話代わっていただきありがとうございます。${company()}の〔オペレーター名〕と申します。\n${reasonShort()}の件で、1分ほどよろしいでしょうか。`,
        standard: `お忙しいところお電話代わっていただき、ありがとうございます。\n${company()}の〔オペレーター名〕と申します。\n${contactLine() ? contactLine() + "\n" : ""}本日は${reasonShort()}の件でお電話いたしました。今、少しだけお時間よろしいでしょうか。`,
      }),
    },
    S04: {
      purpose: () => ({
        intent: "用件を事実に基づき一言で説明する",
        short: `${product()}のご案内でお電話いたしました。`,
        standard: `${product()}のご案内でお電話いたしました。\n${summaryNoun()}でして、${dept()}のご担当者様に一度お話しできればと思っております。`,
      }),
      is_sales: () => ({
        intent: "営業目的であることを否定せず、短く誠実に答える",
        short: `はい、${product()}のご案内のお電話です。`,
        standard: `はい、${product()}のご案内でございます。\nご担当者様に、まずは情報提供だけでもさせていただければと思い、お電話いたしました。`,
      }),
    },
    S05: {
      dept_reception: () => ({
        intent: "回された先で、短く名乗り直して取次ぎを依頼する",
        short: `お忙しいところ恐れ入ります。${company()}の〔オペレーター名〕と申します。\n${reasonShort()}の件で、ご担当者様にお取り次ぎいただけますでしょうか。`,
        standard: `お忙しいところ恐れ入ります。${company()}の〔オペレーター名〕と申します。\n代表の方からこちらにおつなぎいただきました。\n${reasonShort()}の件で、${role()}にお取り次ぎいただけますでしょうか。`,
      }),
      redirected: () => ({
        intent: "案内された部署・担当者を復唱し、取次ぎをお願いする",
        short: `ありがとうございます。それでは、そちらのご担当者様にお取り次ぎいただけますでしょうか。`,
        standard: `ご案内ありがとうございます。\n念のため、部署名とご担当者様のお名前を伺ってもよろしいでしょうか。\nそれでは、そちらにお取り次ぎいただけますでしょうか。`,
      }),
    },
    S06: {
      ask_schedule: () => ({
        intent: "在席日時を伺う",
        short: `承知いたしました。いつ頃でしたらいらっしゃいますでしょうか。`,
        standard: `承知いたしました。それでは改めてお電話したいのですが、${p.flowType === "HAS_KEYMAN_NAME" ? "〔キーマン氏名〕様" : "ご担当者様"}がいらっしゃる日や時間帯を伺ってもよろしいでしょうか。`,
      }),
      schedule_known: () => ({
        intent: "伺った日時を復唱し、名乗り直してお礼を伝える",
        short: `〔在席日時〕ですね。ありがとうございます。その頃に改めてお電話いたします。`,
        standard: `〔在席日時〕ですね。ありがとうございます。\nその頃に改めてお電話いたします。${company()}の〔オペレーター名〕でした。失礼いたします。`,
      }),
      office_based: () => ({
        intent: "日時が不明でも、比較的つながりやすい時間帯だけ伺う",
        short: `承知いたしました。比較的お席にいらっしゃる時間帯はございますか。`,
        standard: `承知いたしました。基本的には出社されているのですね。\n午前と午後でしたら、どちらの方がお席にいらっしゃることが多いでしょうか。改めてお電話いたします。`,
      }),
      mostly_remote: () => ({
        intent: "在宅中心の場合に、受付が案内できる範囲で連絡方法を伺う",
        short: `承知いたしました。ご連絡がつきやすい方法はございますでしょうか。`,
        standard: `承知いたしました。在宅でのお仕事が多いのですね。\nもし差し支えなければ、ご連絡がつきやすい方法（お電話番号など）を伺うことはできますでしょうか。`,
        supplement: `（番号は教えられないと言われたら）\n承知いたしました。それでは、メールでご案内をお送りすることは可能でしょうか。`,
      }),
    },
    S07: {
      ask_name: () => ({
        intent: "次回の取次ぎのために、担当者のお名前を伺う",
        short: `次回お電話する際のために、${dept()}のご担当者様のお名前を伺ってもよろしいでしょうか。`,
        standard: `承知いたしました。改めてお電話いたしますので、その際にスムーズにおつなぎいただけるよう、${dept()}のご担当者様のお名前を伺ってもよろしいでしょうか。`,
      }),
      name_obtained: () => ({
        intent: "お名前を復唱して確認し、お礼を伝える",
        short: `〔入手したキーマン氏名〕様ですね。ありがとうございます。`,
        standard: `〔入手したキーマン氏名〕様ですね。念のため、漢字を伺ってもよろしいでしょうか。\nありがとうございます。改めてお電話いたします。`,
      }),
      name_not_obtained: () => ({
        intent: "名前を教えてもらえない場合、部署・役職宛ての呼び出し方を確認する",
        short: `承知いたしました。それでは次回も「${dept()}のご担当者様」宛てにお電話してもよろしいでしょうか。`,
        standard: `承知いたしました。お名前は結構です。\n次回お電話する際は「${dept()}の${role()}」宛てとお伝えすればよろしいでしょうか。`,
      }),
    },
    S08: {
      ask_successor: () => ({
        intent: "退職・異動を受け止め、後任のご担当者を伺う",
        short: `さようでございましたか。失礼いたしました。\n後任のご担当者様はどなたになりますでしょうか。`,
        standard: `さようでございましたか。教えていただき、ありがとうございます。\n${reasonShort()}の件で、${dept()}でお話しできればと思っております。\n後任のご担当者様がいらっしゃいましたら、お名前を伺ってもよろしいでしょうか。`,
      }),
      successor_known: () => ({
        intent: "後任者名を復唱し、そのまま取次ぎを依頼する",
        short: `〔後任者氏名〕様ですね。ありがとうございます。お取り次ぎいただけますでしょうか。`,
        standard: `〔後任者氏名〕様ですね。ありがとうございます。\nもしよろしければ、このまま〔後任者氏名〕様にお取り次ぎいただけますでしょうか。`,
        supplement: `（後任者も不在の場合）\n承知いたしました。〔後任者氏名〕様がいらっしゃる日時を伺ってもよろしいでしょうか。`,
      }),
      successor_unknown: () => ({
        intent: "後任者を推測せず、部署宛ての取次ぎ可否を確認する",
        short: `承知いたしました。それでは、${dept()}のどなたかにお取り次ぎいただくことは可能でしょうか。`,
        standard: `承知いたしました。\n${reasonShort()}の件でしたら、${dept()}のどなたかにお話を伺うことは可能でしょうか。難しければ、改めさせていただきます。`,
      }),
    },
    S09: {
      wary: () => ({
        intent: "警戒を受け止め、電話以外の連絡手段を確認する",
        short: `承知いたしました。それでは、メールでご案内をお送りすることは可能でしょうか。`,
        standard: `承知いたしました。お忙しいところ失礼いたしました。\nもし差し支えなければ、${product()}のご案内をメールでお送りして、ご担当者様にご覧いただくことは可能でしょうか。`,
      }),
      before_check: () => ({
        intent: "用件を一言で伝え、本人への確認だけを一度お願いする",
        short: `承知いたしました。恐れ入りますが、${product()}の件とだけご担当者様にご確認いただくことはできますでしょうか。`,
        standard: `承知いたしました。\n恐れ入りますが、${reasonShort()}の件で、ご担当者様にお話を聞いていただけるかだけ、ご確認いただくことは可能でしょうか。\n難しいようでしたら、本日は失礼いたします。`,
      }),
      after_check: () => ({
        intent: "本人の意思として受け止め、お礼を伝えて終話する",
        short: `ご確認いただきありがとうございます。承知いたしました。失礼いたします。`,
        standard: `わざわざご確認いただき、ありがとうございました。\n承知いたしました。お忙しいところ失礼いたしました。`,
      }),
      company_policy: () => ({
        intent: "会社方針を尊重し、お礼を伝えて終話する",
        short: `承知いたしました。お忙しいところ失礼いたしました。`,
        standard: `さようでございますか、承知いたしました。\nお忙しいところお時間をいただき、ありがとうございました。失礼いたします。`,
      }),
    },
    S10: {
      email_direct: () => ({
        intent: "直接メールの宛先を確認する",
        short: `ありがとうございます。お送りするメールアドレスを伺ってもよろしいでしょうか。`,
        standard: `ありがとうございます。\nそれでは、ご担当者様に直接お送りいたしますので、メールアドレスを伺ってもよろしいでしょうか。`,
      }),
      email_forward: () => ({
        intent: "受付宛に送り、転送してもらう方法を確認する",
        short: `ありがとうございます。それでは、どちらのアドレスにお送りすればよろしいでしょうか。`,
        standard: `ありがとうございます。\nそれでは、いただいたアドレスにお送りしますので、ご担当者様へ転送をお願いできますでしょうか。\n件名に「${dept()}ご担当者様宛」と入れておきます。`,
      }),
      email_ng: () => ({
        intent: "お礼を伝えて終話する",
        short: `承知いたしました。お忙しいところ失礼いたしました。`,
        standard: `承知いたしました。\nご対応いただき、ありがとうございました。失礼いたします。`,
      }),
      form: () => ({
        intent: "フォームの場所と記載内容を確認して終話する",
        short: `承知いたしました。御社ホームページのお問い合わせフォームからご連絡いたします。`,
        standard: `承知いたしました。御社ホームページのお問い合わせフォームからご連絡いたします。\nその際、${dept()}ご担当者様宛と記載すればよろしいでしょうか。\nありがとうございました。失礼いたします。`,
      }),
    },
    S11: {
      pitch: () => {
        const vp = opt("valueProps");
        const ev = opt("evidence");
        return {
          intent: "電話の主旨と相手にとっての価値を、資料にある事実で簡潔に伝える",
          short: `${summaryNoun()}です。\n${vp ? `特に、${firstSentence(vp)}。その点でお役に立てるかと思い、ご連絡しました。` : "【要確認：相手にとっての価値】"}`,
          standard: `ありがとうございます。手短にお伝えします。\n弊社の${product()}は、${summaryNoun()}です。\n${vp ? vp.replace(/\n+/g, "。").replace(/。。/g, "。") : "【要確認：相手にとっての価値】"}\n${opt("callReason") ? `今回は、${firstSentence(opt("callReason")).replace(/(ため|ので|から)$/, "")}ため、ご連絡いたしました。` : ""}`.trim(),
          supplement: ev ? `（根拠を聞かれたら）\n${ev}` : undefined,
        };
      },
    },
    S12: {
      questions: () => {
        const items = val("hearingItems").split(/[\n、,・]/).map((s) => s.trim()).filter(Boolean);
        const qs = items.slice(0, 3).map((it) => `・${it.replace(/[。?？]$/, "")}について、差し支えない範囲で教えていただけますか。`);
        return {
          intent: "次の打診を判断するため、質問を少数に絞って伺う",
          short: qs[0] ?? "【要確認：ヒアリング項目】",
          standard: `ちなみに、少しだけ伺ってもよろしいでしょうか。\n${qs.join("\n")}`,
        };
      },
    },
    S13: {
      propose: () => ({
        intent: "商談の目的と所要時間を伝えて打診する",
        short: `一度、詳しくご説明の機会をいただけないでしょうか。（${val("meetingFormat")}を想定しております）`,
        standard: `ありがとうございます。お話を伺って、お役に立てる部分があるかと感じました。\n一度、詳しくご説明の機会をいただけないでしょうか。\n${val("meetingFormat")}を想定しております。`,
      }),
      confirm: () => ({
        intent: "日程・形式・参加者を確認する",
        short: `ありがとうございます。ご都合のよい日時を伺ってもよろしいでしょうか。`,
        standard: `ありがとうございます。\nそれでは、ご都合のよい日時をいくつか伺ってもよろしいでしょうか。\n当日は${val("meetingFormat")}を予定しております。ほかにご同席される方がいらっしゃれば、お知らせください。`,
      }),
    },
    S14: {
      propose: () => ({
        intent: "資料の内容を伝えて送付を打診する",
        short: `よろしければ、${firstSentence(val("materials"))}をお送りしてもよろしいでしょうか。`,
        standard: `承知いたしました。それでは、まずは資料だけでもご覧いただけないでしょうか。\n${val("materials")}をお送りできます。`,
      }),
      confirm: () => ({
        intent: "送付先・形式を確認する",
        short: `ありがとうございます。送付先のメールアドレスを伺ってもよろしいでしょうか。`,
        standard: `ありがとうございます。\nそれでは送付先を確認させてください。メールでお送りしてよろしいでしょうか。アドレスを伺ってもよろしいですか。`,
      }),
    },
    S15: {
      decline_ask_next: () => ({
        intent: "断りを受け止め、次回連絡の可否を一度だけ確認する",
        short: `承知いたしました。また時期を改めてご案内してもよろしいでしょうか。`,
        standard: `承知いたしました。率直にお聞かせいただきありがとうございます。\n今後、状況が変わることもあるかと思いますので、また時期を改めてご案内させていただいてもよろしいでしょうか。`,
      }),
      no_call_company: () => ({
        intent: "会社として可能性がない旨を受け止め、お礼を伝えて終話する",
        short: `承知いたしました。お時間をいただきありがとうございました。`,
        standard: `承知いたしました。御社のご状況、よく分かりました。\nお忙しいところお時間をいただき、ありがとうございました。失礼いたします。`,
      }),
      no_call_person: () => ({
        intent: "お詫びとお礼で終話する（反論・再勧誘はしない）",
        short: `大変失礼いたしました。お時間をいただきありがとうございました。`,
        standard: `ご不快な思いをおかけしてしまい、大変失礼いたしました。\n承知いたしました。お時間をいただき、ありがとうございました。失礼いたします。`,
      }),
    },
    S16: {
      ask_timing: () => ({
        intent: "検討時期を伺い、次回連絡の目安を合意する",
        short: `ありがとうございます。ご検討の時期はいつ頃になりそうでしょうか。`,
        standard: `ありがとうございます。\n差し支えなければ、ご検討の時期やタイミングの目安を伺ってもよろしいでしょうか。その頃に改めてご連絡いたします。`,
      }),
      timing_known: () => ({
        intent: "伺った時期を復唱し、次回連絡を約束する",
        short: `〔検討時期〕頃ですね。その頃に改めてご連絡いたします。`,
        standard: `〔検討時期〕頃ですね。ありがとうございます。\nその少し前に、改めてご連絡いたします。本日はありがとうございました。`,
      }),
      timing_unknown: () => ({
        intent: "時期を無理に聞かず、連絡の目安だけ合意する",
        short: `承知いたしました。では、少し期間を置いてご連絡してもよろしいでしょうか。`,
        standard: `承知いたしました。まだお決まりではないのですね。\nそれでは、少し期間を置いて、改めてご連絡させていただいてもよろしいでしょうか。`,
      }),
    },
    S17: {
      busy: () => ({
        intent: "相手の都合を優先して切り上げ、再連絡の可否と日時を確認する",
        short: `お忙しいところ失礼いたしました。改めてお電話してもよろしいでしょうか。`,
        standard: `お忙しいところ失礼いたしました。\nよろしければ、改めてお電話させていただきたいのですが、ご都合のよい日時はございますでしょうか。`,
      }),
    },
    S18: {
      direct: () => ({
        intent: "宛先と送る内容を確認し、お礼を伝える",
        short: `ありがとうございます。${firstSentence(val("emailContent"))}をお送りします。`,
        standard: `ありがとうございます。\nそれでは、${val("emailContent")}をお送りします。\nアドレスを復唱いたします。〔メールアドレス〕でお間違いないでしょうか。`,
      }),
      forward: () => ({
        intent: "転送をお願いし、件名の指定方法を確認する",
        short: `ありがとうございます。件名に「ご担当者様宛」と入れてお送りします。`,
        standard: `ありがとうございます。\nそれでは、件名に「${dept()}ご担当者様宛」と入れて、${val("emailContent")}をお送りします。お手数ですが転送をお願いいたします。`,
      }),
    },
  };

  const cases: ScriptCase[] = scene.cases.map((c) => {
    const fn = T_[scene.sceneId]?.[c.caseId];
    const t: T = fn ? fn() : { intent: "", short: "【未定義】", standard: "【未定義】" };
    const variants: Variant[] = [
      { style: "short", text: t.short },
      { style: "standard", text: t.standard },
    ];
    if (t.supplement) variants.push({ style: "supplement", text: t.supplement });
    return { caseId: c.caseId, label: c.label, condition: c.condition, intent: t.intent, variants };
  });

  if (scene.requiresGoal && goalsOf(p).length === 0) uncertain.push("架電目的が未入力のため、この場面が必要か要確認");

  return {
    sceneId: scene.sceneId,
    title: scene.title,
    applicabilityConditions: scene.conditions,
    purpose: scene.purpose,
    cases,
    avoid: scene.avoid,
    evidenceRefs: [...used].map((f) => `intake:${f}`),
    uncertainties: [...uncertain, ...scene.openQuestions],
    reviewStatus: "DEMO",
    generatedBy: "demo",
    inputSnapshot: inputSnapshot(p, scene),
    qualityWarnings: [],
  };
}

export function demoScript(p: Project, sceneIds: string[]): ScriptScene[] {
  return sceneIds.map((id) => demoScene(p, SCENE_MAP[id]));
}
