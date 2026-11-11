/**
 * 場面選択ルール（docs/04-generation-rules.md の実装）。
 * 案件（フロー種別・目的・入力状況）から、生成対象の場面／対象外の場面と理由／不足質問を決める。
 */
import { FLOWS, type FlowType, type FlowNode, type CoverageStatus } from "./flowModel.js";
import { FIELDS, FIELD_MAP, SCENES, type ProjectField, type SceneDefinition } from "./scenes.js";
import type { Project, Answer } from "./types.js";

export interface SceneSelection {
  scene: SceneDefinition;
  included: boolean;
  reason: string;
  missingInputs: ProjectField[];
}

export function answerText(a: Answer | undefined): string {
  if (!a || a.status !== "answered") return "";
  return Array.isArray(a.value) ? a.value.join(",") : a.value.trim();
}

export function goalsOf(p: Project): string[] {
  const a = p.answers.goals;
  if (!a || a.status !== "answered") return [];
  return Array.isArray(a.value) ? a.value : a.value.split(",").map((s) => s.trim()).filter(Boolean);
}

export function selectScenes(p: Project): SceneSelection[] {
  const goals = goalsOf(p);
  const goalsKnown = goals.length > 0;
  return SCENES.map((scene) => {
    const missing = [...scene.requiredInputs].filter((f) => !answerText(p.answers[f]));
    if (!scene.flows.includes(p.flowType)) {
      const other = scene.flows.includes("NO_KEYMAN_NAME") ? "①キーマン名なし" : "②キーマン名あり";
      return { scene, included: false, reason: `${other}リスト固有の場面のため対象外`, missingInputs: [] };
    }
    if (scene.requiresGoal) {
      if (goalsKnown && !goals.includes(scene.requiresGoal)) {
        const g = scene.requiresGoal === "meeting" ? "商談" : "資料送付";
        return { scene, included: false, reason: `架電目的に「${g}」が含まれないため対象外（目的を変更すると生成対象になります）`, missingInputs: [] };
      }
      if (!goalsKnown) {
        return { scene, included: true, reason: "架電目的が未入力のため暫定的に生成対象（目的の確認が必要）", missingInputs: missing };
      }
    }
    return { scene, included: true, reason: "選択フローに含まれる発話場面", missingInputs: missing };
  });
}

export function includedScenes(p: Project): SceneDefinition[] {
  return selectScenes(p).filter((s) => s.included).map((s) => s.scene);
}

export interface IntakeQuestionView {
  field: ProjectField;
  label: string;
  question: string;
  purpose: string;
  sufficient: string;
  followUp: string;
  contradictionCheck?: string;
  affectedScenes: string[];
  priority: number;
}

/** 不足情報の質問：重要なものから少数ずつ（既定5件） */
export function missingQuestions(p: Project, limit = 5): { questions: IntakeQuestionView[]; totalMissing: number } {
  const scenes = includedScenes(p);
  const need = new Map<ProjectField, Set<string>>();
  for (const s of scenes) {
    for (const f of [...s.requiredInputs, ...s.optionalInputs]) {
      if (!need.has(f)) need.set(f, new Set());
      need.get(f)!.add(s.sceneId);
    }
  }
  need.set("goals", need.get("goals") ?? new Set(["S13", "S14"]));
  const all: IntakeQuestionView[] = [];
  for (const [field, sceneIds] of need) {
    const a = p.answers[field];
    if (a && (a.status === "answered" || a.status === "unknown" || a.status === "skipped")) continue;
    const def = FIELD_MAP[field];
    const required = scenes.some((s) => s.requiredInputs.includes(field));
    all.push({
      field,
      label: def.label,
      question: def.question,
      purpose: def.purpose,
      sufficient: def.sufficient,
      followUp: def.followUp,
      contradictionCheck: def.contradictionCheck,
      affectedScenes: [...sceneIds].sort(),
      priority: def.priority + (required ? 0 : 3),
    });
  }
  all.sort((x, y) => x.priority - y.priority || y.affectedScenes.length - x.affectedScenes.length);
  return { questions: all.slice(0, limit), totalMissing: all.length };
}

/** 入力間の矛盾チェック（確定せず確認を促す） */
export function contradictions(p: Project): string[] {
  const out: string[] = [];
  const origin = answerText(p.answers.listOrigin);
  const strength = answerText(p.answers.contactStrength);
  if (origin === "new" && strength === "strong") out.push("リスト来歴が『新規（接点なし）』ですが、接点の強さが『強い』になっています。どちらが正しいか確認してください。");
  if (origin === "existing" && strength === "none") out.push("リスト来歴が『既存顧客』ですが、接点の強さが『なし』になっています。確認してください。");
  if (p.flowType === "NO_KEYMAN_NAME" && origin === "existing" && strength === "strong")
    out.push("既存顧客で接点が強いのに①キーマン名なしリストが選択されています。担当者名が分かる場合は②の方が適切か確認してください。");
  return out;
}

/** 場面ごとの入力スナップショット（条件変更の影響判定用） */
export function inputSnapshot(p: Project, scene: SceneDefinition): Record<string, string> {
  const snap: Record<string, string> = { flowType: p.flowType };
  const fields = new Set<ProjectField>([...scene.requiredInputs, ...scene.optionalInputs, "ngExpressions"]);
  if (scene.requiresGoal) fields.add("goals");
  if (["S02", "S03", "S11"].includes(scene.sceneId)) { fields.add("listOrigin"); fields.add("contactStrength"); fields.add("contactHistory"); }
  for (const f of fields) {
    const a = p.answers[f];
    snap[f] = a ? `${a.status}:${answerText(a)}` : "none";
  }
  return snap;
}

export interface ImpactItem { sceneId: string; title: string; changedFields: string[] }

/** 生成済みスクリプトの各場面について、現在の案件条件と異なる入力を列挙（T25） */
export function impactedScenes(
  p: Project,
  scenes: { sceneId: string; inputSnapshot: Record<string, string> }[],
): ImpactItem[] {
  const out: ImpactItem[] = [];
  for (const s of scenes) {
    const def = SCENES.find((d) => d.sceneId === s.sceneId);
    if (!def) continue;
    const now = inputSnapshot(p, def);
    const changed = Object.keys(now).filter((k) => (s.inputSnapshot[k] ?? "none") !== now[k]);
    if (changed.length) out.push({ sceneId: s.sceneId, title: def.title, changedFields: changed.map((k) => FIELD_MAP[k]?.label ?? k) });
  }
  return out;
}

/** フロー網羅表（指示書§7：全図形について 網羅／意図的に対象外／要確認） */
export interface CoverageRow {
  shapeId: string;
  label: string;
  cls: FlowNode["cls"];
  parentLabel: string;
  scenes: string[];
  coverage: CoverageStatus;
  note: string;
  /** この案件で、関連場面のいずれかが生成対象か */
  projectStatus: "GENERATED" | "EXCLUDED_BY_CONDITION" | "NO_SCRIPT" | "BRANCH" | "NEEDS_CONFIRMATION";
}

export function coverageFor(flowType: FlowType, generatedSceneIds?: string[]): CoverageRow[] {
  const flow = FLOWS[flowType];
  const byId = new Map(flow.nodes.map((nd) => [nd.shapeId, nd]));
  return flow.nodes.map((nd) => {
    let projectStatus: CoverageRow["projectStatus"];
    if (nd.coverage === "NEEDS_CONFIRMATION") projectStatus = "NEEDS_CONFIRMATION";
    else if (nd.scenes.length === 0) projectStatus = nd.cls === "D" ? "BRANCH" : "NO_SCRIPT";
    else if (!generatedSceneIds) projectStatus = "GENERATED";
    else projectStatus = nd.scenes.some((s) => generatedSceneIds.includes(s)) ? "GENERATED" : "EXCLUDED_BY_CONDITION";
    return {
      shapeId: nd.shapeId,
      label: nd.label,
      cls: nd.cls,
      parentLabel: nd.parent ? (byId.get(nd.parent)?.label ?? "") : "",
      scenes: nd.scenes,
      coverage: nd.coverage,
      note: nd.note,
      projectStatus,
    };
  });
}

export { FIELDS };
