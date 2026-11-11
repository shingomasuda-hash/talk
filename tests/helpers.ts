import { Store } from "../src/store.js";
import { Service } from "../src/service.js";
import type { ScriptAi } from "../src/ai/claude.js";
import type { FlowType } from "../src/domain/flowModel.js";

/** DEMO用の架空BtoB商材（本番データではない） */
export const DEMO_ANSWERS = {
  callerCompany: "株式会社サンプルHR（DEMO）",
  productName: "勤怠らくらくクラウド",
  productSummary: "中小企業の勤怠管理と給与計算の連携を自動化するクラウドサービスです。",
  valueProps: "打刻データを給与計算ソフトへ自動で連携できます。\n残業時間の上限超過を事前にお知らせします。",
  callReason: "来年4月の制度改定に向けて勤怠管理の見直しをされる企業様が増えているため。",
  goals: ["meeting", "materials"],
  targetDepartment: "人事部",
  targetRole: "勤怠管理のご担当者様",
  targetIndustry: "製造業・従業員50〜300名",
  listOrigin: "new",
  contactStrength: "none",
  materials: "サービス概要資料（PDF・8ページ）",
  meetingFormat: "オンラインで30分",
  hearingItems: "現在の勤怠管理の方法\n給与計算との連携で困っていること\n見直しの検討時期",
  emailContent: "サービス概要資料と、オンライン説明のご案内",
  evidence: "",
  ngExpressions: "業界No.1",
};

export class FakeAi implements ScriptAi {
  enabled = true;
  calls: string[] = [];
  revise = async (_p: unknown, scenes: { sceneId: string; cases: { caseId: string; variants: { style: string; text: string }[] }[] }[], instruction: string) => {
    this.calls.push(`revise:${instruction}`);
    const s = scenes[0];
    const c = s.cases[0];
    return {
      changes: [
        { scene_id: s.sceneId, case_id: c.caseId, style: "short" as const, new_text: "（AI修正）" + c.variants[0].text.slice(0, 20), reason: "短くした" },
        { scene_id: "S99", case_id: "x", style: "short" as const, new_text: "存在しない場面", reason: "不正" },
      ],
      impact_notes: [],
    };
  };
  generateScene = async () => { throw new Error("not used"); };
}

export function newService(ai?: ScriptAi) {
  const disabled: ScriptAi = { enabled: false, generateScene: async () => { throw new Error("disabled"); }, revise: async () => { throw new Error("disabled"); } };
  return new Service(new Store(null), ai ?? disabled);
}

export function project(svc: Service, flowType: FlowType, overrides: Record<string, unknown> = {}) {
  return svc.createProject({ name: `テスト案件 ${flowType}`, flowType, answers: { ...DEMO_ANSWERS, ...overrides } as never });
}

export function allText(scene: { cases: { variants: { text: string }[] }[] }) {
  return scene.cases.flatMap((c) => c.variants.map((v) => v.text)).join("\n");
}
