// DEMO生成結果をMarkdownで標準出力に出す（文面確認用）: npx tsx scripts/demo-print.ts [A|B]
import { Store } from "../src/store.js";
import { Service } from "../src/service.js";
const svc = new Service(new Store(null), { enabled: false, generateScene: async () => { throw 0; }, revise: async () => { throw 0; } } as never);
const flow = process.argv[2] === "B" ? "HAS_KEYMAN_NAME" : "NO_KEYMAN_NAME";
const answers = {
  callerCompany: "株式会社サンプルHR（DEMO）", productName: "勤怠らくらくクラウド",
  productSummary: "中小企業の勤怠管理と給与計算の連携を自動化するクラウドサービスです。",
  valueProps: "打刻データを給与計算ソフトへ自動で連携できます。\n残業時間の上限超過を事前にお知らせします。",
  callReason: "来年4月の制度改定に向けて勤怠管理の見直しをされる企業様が増えているため。",
  goals: ["meeting", "materials"], targetDepartment: "人事部", targetRole: "勤怠管理のご担当者様",
  listOrigin: "exhibition", contactStrength: "weak", contactHistory: "2025年秋のHRテック展で名刺交換をした",
  materials: "サービス概要資料（PDF・8ページ）", meetingFormat: "オンラインで30分",
  hearingItems: "現在の勤怠管理の方法\n給与計算との連携で困っていること\n見直しの検討時期",
  emailContent: "サービス概要資料と、オンライン説明のご案内",
};
const p = svc.createProject({ name: `【DEMO】勤怠SaaS 新規開拓`, flowType: flow, answers: answers as never });
const { script } = await svc.generate(p.id);
console.log(svc.exportMarkdown(script.id));
