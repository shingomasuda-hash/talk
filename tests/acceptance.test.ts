/**
 * 受け入れテスト T01〜T26（docs/05-acceptance-tests.md と対応）。
 * DEMO生成（決定的）とモックAIで、場面選択・トーク不要結果・不足質問・ガードレールを検証する。
 * 実AIでの文面品質は手動確認項目（docs/05 参照）。
 */
import { describe, expect, it } from "vitest";
import { coverageFor, selectScenes } from "../src/domain/selection.js";
import { qualityWarnings } from "../src/domain/quality.js";
import { latest } from "../src/domain/revision.js";
import { FLOWS } from "../src/domain/flowModel.js";
import { allText, FakeAi, newService, project } from "./helpers.js";

const included = (svc: ReturnType<typeof newService>, id: string) =>
  svc.analysis(id).selection.filter((s) => s.included).map((s) => s.sceneId);

async function gen(flow: "NO_KEYMAN_NAME" | "HAS_KEYMAN_NAME", overrides: Record<string, unknown> = {}) {
  const svc = newService();
  const p = project(svc, flow, overrides);
  const { script } = await svc.generate(p.id);
  const scenes = latest(script).scenes;
  const scene = (id: string) => scenes.find((s) => s.sceneId === id)!;
  const kase = (sid: string, cid: string) => scene(sid).cases.find((c) => c.caseId === cid)!;
  return { svc, p, script, scenes, scene, kase };
}

describe("フローA：①キーマン名なし", () => {
  it("T01 受付受電・担当者不明 → S01/S04/S05/S07 を生成、名あり固有は除外", async () => {
    const { scenes, scene } = await gen("NO_KEYMAN_NAME");
    const ids = scenes.map((s) => s.sceneId);
    for (const s of ["S01", "S04", "S05", "S07"]) expect(ids).toContain(s);
    expect(ids).not.toContain("S02");
    expect(ids).not.toContain("S08");
    expect(allText(scene("S01"))).toContain("人事部");
    expect(allText(scene("S01"))).not.toContain("〔キーマン氏名〕");
  });
  it("T02 部署受付へ転送→本人と対話：部署受付への依頼(S05)から本人トーク(S03/S11)までカバー", async () => {
    const { kase, scene } = await gen("NO_KEYMAN_NAME");
    expect(kase("S05", "dept_reception").variants[1].text).toContain("お取り次ぎ");
    expect(kase("S03", "transferred").variants[0].text).toContain("代わっていただき");
    expect(allText(scene("S11"))).toContain("勤怠らくらくクラウド");
    expect(allText(scene("S03"))).not.toMatch(/お取り次ぎいただけ/);
  });
  it("T03 不在・キーマン名入手 → 在席確認と②への移行条件を抽出", async () => {
    const { svc, p, kase } = await gen("NO_KEYMAN_NAME");
    expect(kase("S07", "name_obtained").variants[1].text).toContain("〔入手したキーマン氏名〕");
    expect(kase("S06", "ask_schedule").variants.length).toBeGreaterThan(0);
    const tr = svc.analysis(p.id).transitions;
    expect(tr.some((t) => t.to === "HAS_KEYMAN_NAME" && t.sourceShapes.includes("16"))).toBe(true);
  });
  it("T04 不在・キーマン名入手できず → 人名を創作せず部署・役職宛の確認案", async () => {
    const { kase } = await gen("NO_KEYMAN_NAME");
    const t = kase("S07", "name_not_obtained").variants.map((v) => v.text).join("\n");
    expect(t).toContain("人事部");
    expect(t).not.toMatch(/〔(キーマン|入手した)/);
    // 「様」が付くのは『ご担当者様』『〜の方』などの一般呼称のみ（人名がない）
    const honorifics = t.match(/[^\s。、「」]{1,8}様/g) ?? [];
    expect(honorifics.every((h) => /ご担当者様|担当者様|皆様/.test(h))).toBe(true);
  });
});

describe("フローB：②キーマン名あり", () => {
  it("T05 受付受電・指名取次 → 〔キーマン氏名〕を使った取次依頼", async () => {
    const { kase, scenes } = await gen("HAS_KEYMAN_NAME");
    expect(kase("S02", "strong").variants[0].text).toContain("〔キーマン氏名〕様");
    expect(kase("S02", "weak").variants[1].text).toContain("〔キーマン氏名〕様");
    expect(scenes.map((s) => s.sceneId)).not.toContain("S01");
    expect(scenes.map((s) => s.sceneId)).not.toContain("S07");
  });
  it("T06 キーマン本人が直接受電 → 受付文言なしの導入", async () => {
    const { kase } = await gen("HAS_KEYMAN_NAME");
    const t = kase("S03", "direct").variants.map((v) => v.text).join("\n");
    expect(t).toContain("〔キーマン氏名〕様でいらっしゃいますか");
    expect(t).not.toMatch(/お取り次ぎ|おつなぎ/);
  });
  it("T07 退職・異動・後任者入手 → 不在と区別し後任者確認場面", async () => {
    const { scene, kase } = await gen("HAS_KEYMAN_NAME");
    expect(scene("S08")).toBeTruthy();
    expect(kase("S08", "ask_successor").variants[0].text).toContain("後任");
    expect(kase("S08", "successor_known").variants[1].text).toContain("〔後任者氏名〕");
    // 退職・異動は『不在』とは別ノード・別場面
    const n16 = FLOWS.HAS_KEYMAN_NAME.nodes.find((n) => n.shapeId === "16")!;
    expect(n16.scenes).toEqual(["S08"]);
    expect(n16.scenes).not.toContain("S06");
  });
  it("T08 退職・異動・後任者不明 → 推測で補完せず確認案", async () => {
    const { kase } = await gen("HAS_KEYMAN_NAME");
    const t = kase("S08", "successor_unknown").variants.map((v) => v.text).join("\n");
    expect(t).not.toContain("〔後任者氏名〕");
    expect(t).toContain("人事部");
  });
});

describe("両フロー共通", () => {
  for (const flow of ["NO_KEYMAN_NAME", "HAS_KEYMAN_NAME"] as const) {
    it(`T09 [${flow}] 不在：在席日時判明／不明を別ケースで扱う`, async () => {
      const { scene } = await gen(flow);
      const ids = scene("S06").cases.map((c) => c.caseId);
      expect(ids).toEqual(["ask_schedule", "schedule_known", "office_based", "mostly_remote"]);
    });
    it(`T10 [${flow}] ほぼ在宅・携帯番号可否：取得可否を分類し、断られたら別手段`, async () => {
      const { kase } = await gen(flow);
      const c = kase("S06", "mostly_remote");
      expect(c.variants.find((v) => v.style === "supplement")!.text).toContain("メール");
      const nodes = coverageFor(flow).filter((r) => ["携帯電話\n番号入手", "携帯電話\n番号入手\nできず"].includes(r.label));
      expect(nodes.length).toBe(2);
      expect(nodes.every((n) => n.cls === "I")).toBe(true);
    });
    it(`T11 [${flow}] 受付の警戒・居留守：居留守を指摘せず連絡手段の確認へ`, async () => {
      const { kase } = await gen(flow);
      const t = kase("S09", "wary").variants.map((v) => v.text).join("\n");
      expect(t).not.toContain("居留守");
      expect(t).toContain("メール");
    });
    it(`T12 [${flow}] 受付判断拒否：確認前／確認後を区別し、確認後は尊重して終話`, async () => {
      const { kase, p, svc, scene } = await gen(flow);
      expect(kase("S09", "before_check").variants[1].text).toContain("ご確認いただく");
      const after = kase("S09", "after_check").variants.map((v) => v.text).join("\n");
      expect(after).not.toMatch(/改めて|またご連絡|再度/);
      expect(qualityWarnings(svc.store.project(p.id)!, scene("S09")).filter((w) => w.includes("再連絡"))).toEqual([]);
    });
    it(`T13 [${flow}] 会社として営業電話拒否：勧誘継続を正解扱いしない`, async () => {
      const { kase } = await gen(flow);
      const t = kase("S09", "company_policy").variants.map((v) => v.text).join("\n");
      expect(t).toContain("承知いたしました");
      expect(t).not.toMatch(/せめて|少しだけでも|資料だけでも|改めて/);
    });
    it(`T14 [${flow}] メール直接OK／転送OK／転送NG を区別`, async () => {
      const { scene } = await gen(flow);
      const ids = scene("S10").cases.map((c) => c.caseId);
      expect(ids).toEqual(expect.arrayContaining(["email_direct", "email_forward", "email_ng"]));
      const s10 = scene("S10");
      expect(s10.cases.find((c) => c.caseId === "email_direct")!.variants[1].text).toContain("直接");
      expect(s10.cases.find((c) => c.caseId === "email_forward")!.variants[1].text).toContain("転送");
      expect(s10.cases.find((c) => c.caseId === "email_ng")!.variants[1].text).not.toMatch(/メール|改めて/);
    });
    it(`T15 [${flow}] 問い合わせフォーム誘導：確認・終話場面`, async () => {
      const { kase } = await gen(flow);
      expect(kase("S10", "form").variants[1].text).toMatch(/フォーム[\s\S]*失礼いたします/);
    });
    it(`T16 [${flow}] 商談／資料送付OK：打診トークと結果状態を区別`, async () => {
      const { scene } = await gen(flow);
      expect(scene("S13").cases.map((c) => c.caseId)).toEqual(["propose", "confirm"]);
      expect(scene("S14").cases.map((c) => c.caseId)).toEqual(["propose", "confirm"]);
      const res = coverageFor(flow).filter((r) => /商談(OK|希望)|資料送付\n(OK|希望)/.test(r.label));
      expect(res.length).toBe(2);
      expect(res.every((r) => r.cls === "R")).toBe(true);
    });
    it(`T17 [${flow}] 不要・次回コール可：検討時期 可／不可を区別`, async () => {
      const { scene } = await gen(flow);
      expect(scene("S16").cases.map((c) => c.caseId)).toEqual(["ask_timing", "timing_known", "timing_unknown"]);
    });
    it(`T18 [${flow}] 不要・次回コール不可：会社要因／担当要因を区別し尊重`, async () => {
      const { kase } = await gen(flow);
      for (const cid of ["no_call_company", "no_call_person"]) {
        const t = kase("S15", cid).variants.map((v) => v.text).join("\n");
        expect(t).not.toMatch(/改めて|またご連絡|再度|後日/);
      }
    });
    it(`T19 [${flow}] 時間不足で未完了：再連絡の許可を確認`, async () => {
      const { kase } = await gen(flow);
      expect(kase("S17", "busy").variants[1].text).toMatch(/改めて.*よろしい|ご都合/);
    });
    it(`T20 [${flow}] つながらない（鳴動／留守電／音声ガイド）：営業会話を生成しない`, async () => {
      const { scenes } = await gen(flow);
      const rows = coverageFor(flow, scenes.map((s) => s.sceneId)).filter((r) => ["鳴りっぱなし", "留守電", "音声\nガイダンス", "電話\nつながらず"].includes(r.label));
      expect(rows.length).toBe(4);
      expect(rows.every((r) => r.scenes.length === 0)).toBe(true);
      expect(rows.find((r) => r.label === "留守電")!.coverage).toBe("NEEDS_CONFIRMATION");
    });
    it(`T21 [${flow}] 音声ガイダンス下位（未使用／Push／電源OFF）は結果分類のみ`, () => {
      const rows = coverageFor(flow).filter((r) => ["使われていない", "Pushボタン", "電源が\n入って\nいない", "電話番号を調査して再架電"].includes(r.label));
      expect(rows.length).toBe(4);
      expect(rows.every((r) => r.scenes.length === 0 && r.coverage === "NO_SCRIPT_INTENDED")).toBe(true);
    });
  }

  it("T22 商材が異なってもフローが同じならシーン構造を再利用し、商材の事実だけ差し替わる", async () => {
    const a = await gen("NO_KEYMAN_NAME");
    const b = await gen("NO_KEYMAN_NAME", { productName: "名刺管理スマート", productSummary: "名刺をスキャンして顧客台帳を作るサービスです。", targetDepartment: "営業企画部" });
    const shape = (x: typeof a) => x.scenes.map((s) => `${s.sceneId}:${s.cases.map((c) => c.caseId).join(",")}`);
    expect(shape(b)).toEqual(shape(a));
    expect(allText(b.scene("S04"))).toContain("名刺管理スマート");
    expect(allText(b.scene("S04"))).not.toContain("勤怠らくらくクラウド");
  });

  it("T23 承認済みノウハウなし：AI提案/DEMOと確定ノウハウを区別", async () => {
    const { scenes, svc } = await gen("NO_KEYMAN_NAME");
    // 承認済みナレッジは該当場面のものだけ。DEMO生成はナレッジを使わず、出力は確定ノウハウと表示しない
    expect(svc.store.data.knowledge.filter((k) => k.status === "CONFIRMED").map((k) => k.id).sort()).toEqual(["kn_seed_opening_structure", "kn_seed_precheck_objection"]);
    expect(scenes.every((s) => s.reviewStatus === "DEMO" && s.generatedBy === "demo")).toBe(true);
    const md = svc.exportMarkdown(svc.store.data.scripts[0].id);
    expect(md).toContain("DEMO（テンプレート生成・未承認）");
    expect(md).not.toContain("承認済みノウハウに基づく");
  });

  it("T24 AIで一場面だけ修正：対象シーンだけ差分、他場面は不変、不正な場面への変更は除外", async () => {
    const ai = new FakeAi();
    const svc = newService(ai);
    const p = project(svc, "NO_KEYMAN_NAME");
    const { script } = await svc.generate(p.id, { mode: "demo" });
    const before = JSON.parse(JSON.stringify(latest(script).scenes));
    const prop = await svc.proposeRevision(script.id, { instruction: "受付の第一声を20字程度短く", sceneIds: ["S01"] });
    expect(prop.generatedBy).toBe("ai");
    expect(prop.changes.length).toBe(1);
    expect(prop.changes[0].sceneId).toBe("S01");
    expect(prop.diffs[0].some((d) => d.op !== "eq")).toBe(true);
    // 採用前は反映されない
    expect(latest(svc.getScript(p.id)).version).toBe(1);
    const after = svc.applyRevision(prop.id);
    const v2 = latest(after);
    expect(v2.version).toBe(2);
    expect(v2.changedScenes).toEqual(["S01"]);
    for (const s of v2.scenes.filter((x) => x.sceneId !== "S01")) expect(s).toEqual(before.find((b: { sceneId: string }) => b.sceneId === s.sceneId));
    // 元に戻す
    const v3 = latest(svc.revert(script.id, 1));
    expect(v3.scenes).toEqual(before);
  });

  it("T24b DEMOモードの規則ベース修正（短く）も対象場面に限定される", async () => {
    const { svc, script } = await gen("NO_KEYMAN_NAME");
    const prop = await svc.proposeRevision(script.id, { instruction: "短くして", sceneIds: ["S03"] });
    expect(prop.changes.length).toBeGreaterThan(0);
    expect(prop.changes.every((c) => c.sceneId === "S03")).toBe(true);
    // 短くしても、依頼・確認の文（〜でしょうか）や変数は失われない
    const p2 = await svc.proposeRevision(script.id, { instruction: "短く", sceneIds: ["S01", "S05"] });
    for (const c of p2.changes) {
      const asks = (t: string) => (t.match(/でしょうか/g) ?? []).length;
      expect(asks(c.after), `${c.sceneId}/${c.caseId}`).toBe(asks(c.before));
      const vars = (t: string) => (t.match(/〔[^〕]+〕/g) ?? []).join();
      expect(vars(c.after)).toBe(vars(c.before));
    }
    const unknown = await svc.proposeRevision(script.id, { instruction: "もっと情熱的に", sceneIds: ["S03"] });
    expect(unknown.changes.length).toBe(0);
    expect(unknown.impactNotes[0]).toContain("DEMOモード");
  });

  it("T25 生成後に新規→既存顧客へ変更：影響する場面を示し再生成候補にする", async () => {
    const { svc, p } = await gen("HAS_KEYMAN_NAME");
    expect(svc.analysis(p.id).impact).toEqual([]);
    svc.updateProject(p.id, { answers: { listOrigin: "existing", contactStrength: "strong" } });
    const impact = svc.analysis(p.id).impact.map((i) => i.sceneId);
    expect(impact).toEqual(expect.arrayContaining(["S02", "S03", "S11"]));
    expect(impact).not.toContain("S09");
    const { script } = await svc.generate(p.id, { sceneIds: impact });
    expect(latest(script).changedScenes.sort()).toEqual([...impact].sort());
    expect(svc.analysis(p.id).impact).toEqual([]);
    expect(latest(script).scenes.find((s) => s.sceneId === "S02")!.cases[0].variants[1].text).toContain("ご利用いただき");
  });

  it("T26 強い拒否・クレーム／取引不可：再勧誘・反論を作らず、品質チェックが再勧誘を検出する", async () => {
    const { svc, p, scene } = await gen("NO_KEYMAN_NAME");
    const s15 = scene("S15");
    expect(qualityWarnings(svc.store.project(p.id)!, s15).filter((w) => w.includes("再連絡"))).toEqual([]);
    const bad = JSON.parse(JSON.stringify(s15));
    bad.cases.find((c: { caseId: string }) => c.caseId === "no_call_person").variants[0].text = "失礼しました。また時期を改めてご連絡いたします。せめて資料だけでも。";
    const w = qualityWarnings(svc.store.project(p.id)!, bad);
    expect(w.some((x) => x.includes("再連絡"))).toBe(true);
    expect(w.some((x) => x.includes("押し付け"))).toBe(true);
  });
});

describe("入力・選択ロジック", () => {
  it("目的に商談がなければ S13 を除外し理由を示す", () => {
    const svc = newService();
    const p = project(svc, "NO_KEYMAN_NAME", { goals: ["materials"] });
    const sel = selectScenes(svc.store.project(p.id)!);
    const s13 = sel.find((s) => s.scene.sceneId === "S13")!;
    expect(s13.included).toBe(false);
    expect(s13.reason).toContain("商談");
    expect(included(svc, p.id)).toContain("S14");
  });
  it("不足質問は重要なものから少数（5件）で、不明・省略は再質問しない", () => {
    const svc = newService();
    const p = svc.createProject({ name: "空案件", flowType: "NO_KEYMAN_NAME" });
    const q1 = svc.analysis(p.id).questions;
    expect(q1.questions.length).toBe(5);
    expect(q1.questions[0].priority).toBeLessThanOrEqual(q1.questions[4].priority);
    svc.updateProject(p.id, { answers: { callerCompany: { value: "", status: "unknown" } as never } });
    const q2 = svc.analysis(p.id).questions;
    expect(q2.questions.map((q) => q.field)).not.toContain("callerCompany");
    expect(q2.totalMissing).toBe(q1.totalMissing - 1);
  });
  it("未入力項目は【要確認】として残し、事実を補完しない", async () => {
    const svc = newService();
    const p = svc.createProject({ name: "最小", flowType: "NO_KEYMAN_NAME", answers: { productName: "テスト商材" } });
    const { script } = await svc.generate(p.id);
    const s01 = latest(script).scenes.find((s) => s.sceneId === "S01")!;
    expect(allText(s01)).toContain("【要確認：名乗る会社名】");
    expect(s01.uncertainties.join()).toContain("未入力");
  });
  it("矛盾（新規なのに接点が強い）を確認事項として提示", () => {
    const svc = newService();
    const p = project(svc, "HAS_KEYMAN_NAME", { listOrigin: "new", contactStrength: "strong" });
    expect(svc.analysis(p.id).contradictions.length).toBe(1);
  });
  it("根拠資料にない数値・NG表現を検出", async () => {
    const { svc, p, scene } = await gen("NO_KEYMAN_NAME");
    const s = JSON.parse(JSON.stringify(scene("S11")));
    s.cases[0].variants[0].text = "導入企業は500社以上、業界No.1のサービスです。";
    const w = qualityWarnings(svc.store.project(p.id)!, s);
    expect(w.some((x) => x.includes("500社"))).toBe(true);
    expect(w.some((x) => x.includes("業界No.1"))).toBe(true);
  });
  it("DEMO生成結果は既定入力で品質警告が出ない（再勧誘・受付文言の混入なし）", async () => {
    for (const flow of ["NO_KEYMAN_NAME", "HAS_KEYMAN_NAME"] as const) {
      const { scenes } = await gen(flow);
      const w = scenes.flatMap((s) => s.qualityWarnings.filter((x) => !x.includes("要確認")));
      expect(w, flow).toEqual([]);
    }
  });
  it("Markdown出力に台本化しない結果一覧を含む", async () => {
    const { svc, script } = await gen("HAS_KEYMAN_NAME");
    const md = svc.exportMarkdown(script.id);
    expect(md).toContain("## S08");
    expect(md).toContain("鳴りっぱなし");
  });
});
