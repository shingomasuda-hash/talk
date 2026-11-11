/**
 * 優先1シート・議事録から取り込んだ要件のテスト。
 */
import { describe, expect, it } from "vitest";
import { CHAPTERS, SCENES } from "../src/domain/scenes.js";
import { latest } from "../src/domain/revision.js";
import { qualityWarnings } from "../src/domain/quality.js";
import { ClaudeScriptAi, pdfBlocks } from "../src/ai/claude.js";
import { SCENE_MAP } from "../src/domain/scenes.js";
import { newService, project } from "./helpers.js";

const PDF_B64 = Buffer.from("%PDF-1.4\n%テスト\n").toString("base64");

class StubAi extends ClaudeScriptAi {
  prompts: string[] = [];
  docs: unknown[][] = [];
  constructor() { super("test-key-not-used"); }
  protected async call<T>(_schema: unknown, user: string, docs: unknown[] = []): Promise<T> {
    this.prompts.push(user);
    this.docs.push(docs);
    const sceneId = /場面ID: (S\d+)/.exec(user)![1];
    return {
      scene_id: sceneId,
      cases: SCENE_MAP[sceneId].cases.map((c) => ({ case_id: c.caseId, intent: "意図", short: "短い", standard: "標準の**言葉**です。", supplement: "" })),
      avoid: [], evidence_refs: [], uncertainties: [],
    } as T;
  }
}

describe("Contents（章立て）", () => {
  it("全場面がちょうど1つの章に属し、順序は画面案どおり", () => {
    const all = CHAPTERS.flatMap((c) => c.scenes);
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual(SCENES.map((s) => s.sceneId).sort());
    expect(CHAPTERS.map((c) => c.label)).toEqual(["受付突破", "最初の挨拶", "主旨説明・ニーズ喚起", "クロージング", "ヒアリング"]);
  });
  it("Markdown出力は注意事項・変更点・ポイントとContentsが先頭、章ごとに場面が並ぶ", async () => {
    const svc = newService();
    const p = project(svc, "NO_KEYMAN_NAME", { operatorPoints: "・価格は答えず資料で案内\n・制度改定を強調" });
    const { script } = await svc.generate(p.id);
    const md = svc.exportMarkdown(script.id);
    const i = (t: string) => md.indexOf(t);
    expect(i("## 注意事項・変更点・ポイント")).toBeLessThan(i("## Contents"));
    expect(md).toContain("- 価格は答えず資料で案内");
    expect(md).toContain("使わない表現：業界No.1");
    expect(i("# 【受付突破】")).toBeLessThan(i("# 【最初の挨拶】"));
    expect(i("## S01")).toBeGreaterThan(i("# 【受付突破】"));
    expect(i("## S03")).toBeGreaterThan(i("# 【最初の挨拶】"));
    expect(md).toContain("短い版（一言）");
  });
});

describe("変更点（承認版との比較）", () => {
  it("承認版がない場合はその旨、承認後に修正した場面だけが変更点に出る", async () => {
    const svc = newService();
    const p = project(svc, "HAS_KEYMAN_NAME");
    const { script } = await svc.generate(p.id);
    expect(svc.briefing(script.id).changes[0]).toContain("承認版がない");
    svc.approveVersion(script.id, 1);
    svc.manualEdit(script.id, "S02", "strong", "short", "〔キーマン氏名〕様をお願いいたします。");
    const b = svc.briefing(script.id);
    expect(b.changes[0]).toBe("比較元：承認版 v1");
    expect(b.changes.slice(1)).toEqual(["S02 キーマン名あり：指名取次依頼"]);
  });
});

describe("リスト別の複製（同じ商材で新規／既存などを分ける）", () => {
  it("回答・資料を引き継ぎ、リスト種別と来歴を変えた別案件を作れる。スクリプトは引き継がない", async () => {
    const svc = newService();
    const p = project(svc, "NO_KEYMAN_NAME");
    svc.addDocument(p.id, { name: "概要.md", kind: "file", text: "概要", category: "product_basics" });
    await svc.generate(p.id);
    const d = svc.duplicateProject(p.id, { name: "既存顧客リスト", flowType: "HAS_KEYMAN_NAME", answers: { listOrigin: "existing" } });
    expect(d.id).not.toBe(p.id);
    expect(d.flowType).toBe("HAS_KEYMAN_NAME");
    expect(d.answers.productName?.value).toBe("勤怠らくらくクラウド");
    expect(d.answers.listOrigin?.value).toBe("existing");
    expect(d.documents[0].category).toBe("product_basics");
    expect(d.documents[0].id).not.toBe(svc.store.project(p.id)!.documents[0].id);
    expect(svc.store.scriptOf(d.id)).toBeUndefined();
    // 元の案件は変わらない
    expect(svc.store.project(p.id)!.answers.listOrigin?.value).toBe("new");
  });
});

describe("参考スクリプト（最新／指定スクリプトを参照）", () => {
  it("AIモードで別案件の同じ場面を形式の参考として渡し、出典を記録する", async () => {
    const ai = new StubAi();
    const svc = newService(ai);
    const a = project(svc, "NO_KEYMAN_NAME");
    await svc.generate(a.id, { mode: "demo" });
    svc.approveVersion(svc.store.scriptOf(a.id)!.id, 1);
    const b = project(svc, "NO_KEYMAN_NAME", { productName: "名刺管理スマート" });
    const r = await svc.generate(b.id, { sceneIds: ["S01"], referenceProjectId: a.id });
    expect(r.mode).toBe("ai");
    expect(ai.prompts[0]).toContain('<reference_script project="テスト案件 NO_KEYMAN_NAME" status="DEMO">');
    expect(ai.prompts[0]).toContain("勤怠らくらくクラウド"); // 参考側の文面（事実は使わない旨はSYSTEMで指示）
    const s01 = latest(r.script).scenes.find((s) => s.sceneId === "S01")!;
    expect(s01.referenceFrom).toBe("テスト案件 NO_KEYMAN_NAME v1");
    expect(svc.analysis(b.id).referenceCandidates.map((c) => c!.projectId)).toContain(a.id);
  });
  it("DEMOモードでは参考スクリプトを使えないことを通知する", async () => {
    const svc = newService();
    const a = project(svc, "NO_KEYMAN_NAME");
    await svc.generate(a.id);
    const b = project(svc, "NO_KEYMAN_NAME");
    const r = await svc.generate(b.id, { referenceProjectId: a.id });
    expect(r.notes.join()).toContain("DEMOモード");
  });
});

describe("PDF資料（具体的なサービス資料）", () => {
  it("PDFは保存してAIに文書として渡し、API応答には本体を含めない", async () => {
    const ai = new StubAi();
    const svc = newService(ai);
    const p = project(svc, "NO_KEYMAN_NAME");
    const d = svc.addDocument(p.id, { name: "サービス資料.pdf", kind: "file", pdfBase64: PDF_B64, category: "service_material" });
    expect(d.fetchStatus).toBe("pdf_for_ai");
    expect(d.pdfBase64).toBeUndefined();
    expect(JSON.stringify(svc.analysis(p.id))).not.toContain(PDF_B64);
    const blocks = pdfBlocks(svc.store.project(p.id)!);
    expect(blocks).toHaveLength(1);
    await svc.generate(p.id, { sceneIds: ["S11"] });
    expect(ai.docs[0]).toHaveLength(1);
    expect(JSON.stringify(ai.docs[0][0])).toContain("具体的なサービス資料");
  });
  it("PDFでないデータは拒否する", () => {
    const svc = newService();
    const p = project(svc, "NO_KEYMAN_NAME");
    expect(() => svc.addDocument(p.id, { name: "x.pdf", kind: "file", pdfBase64: Buffer.from("hello").toString("base64") })).toThrow("PDFファイルではありません");
  });
});

describe("強調表示（**語**）", () => {
  it("強調の過多・閉じ忘れを警告する", async () => {
    const svc = newService();
    const p = project(svc, "NO_KEYMAN_NAME");
    const { script } = await svc.generate(p.id);
    const s = JSON.parse(JSON.stringify(latest(script).scenes.find((x) => x.sceneId === "S11")));
    expect(s.cases[0].variants[1].text).toContain("**勤怠らくらくクラウド**");
    s.cases[0].variants[0].text = "**a** **b** **c** です";
    s.cases[0].variants[1].text = "**閉じ忘れ";
    const w = qualityWarnings(svc.store.project(p.id)!, s);
    expect(w.some((x) => x.includes("強調が多すぎ"))).toBe(true);
    expect(w.some((x) => x.includes("対応が取れていません"))).toBe(true);
  });
});

describe("初期ナレッジ（優先1シート由来）", () => {
  it("例文の構成と事前確認の切り返しが要確認として登録されている", () => {
    const svc = newService();
    const ids = svc.store.data.knowledge.map((k) => k.id);
    expect(ids).toEqual(expect.arrayContaining(["kn_seed_opening_structure", "kn_seed_precheck_objection"]));
    expect(svc.store.data.knowledge.every((k) => k.status === "NEEDS_CONFIRMATION")).toBe(true);
  });
});
