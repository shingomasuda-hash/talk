/**
 * 生成結果の型・構造・品質の検証（指示書§6 スクリプト品質の検証項目）。
 * 警告は「生成を止める」ためではなく、設計担当者が確認すべき箇所を示すために使う。
 */
import { z } from "zod/v4";
import { SCENE_MAP } from "./scenes.js";
import type { Project, ScriptScene } from "./types.js";
import { answerText } from "./selection.js";

/** AIの1場面出力のスキーマ（structured outputs で使う） */
export const AiSceneSchema = z.object({
  scene_id: z.string(),
  cases: z.array(
    z.object({
      case_id: z.string(),
      intent: z.string(),
      short: z.string(),
      standard: z.string(),
      supplement: z.string(),
    }),
  ),
  avoid: z.array(z.string()),
  evidence_refs: z.array(z.string()),
  uncertainties: z.array(z.string()),
});
export type AiScene = z.infer<typeof AiSceneSchema>;

export const AiRevisionSchema = z.object({
  changes: z.array(
    z.object({
      scene_id: z.string(),
      case_id: z.string(),
      style: z.enum(["short", "standard", "supplement"]),
      new_text: z.string(),
      reason: z.string(),
    }),
  ),
  impact_notes: z.array(z.string()),
});
export type AiRevision = z.infer<typeof AiRevisionSchema>;

/** AI出力の構造検証：シーンID不一致・未定義ケース・欠落・重複・出典不整合 */
export function structuralErrors(out: AiScene, expectedSceneId: string, validRefs: Set<string>): string[] {
  const errs: string[] = [];
  const def = SCENE_MAP[expectedSceneId];
  if (!def) return [`未定義の場面ID: ${expectedSceneId}`];
  if (out.scene_id !== expectedSceneId) errs.push(`scene_id 不一致: ${out.scene_id} (期待: ${expectedSceneId})`);
  const expected = def.cases.map((c) => c.caseId);
  const seen = new Set<string>();
  for (const c of out.cases) {
    if (seen.has(c.case_id)) errs.push(`case_id 重複: ${c.case_id}`);
    seen.add(c.case_id);
    if (!expected.includes(c.case_id)) errs.push(`未定義の case_id: ${c.case_id}`);
    if (!c.short.trim() || !c.standard.trim()) errs.push(`内容欠落: ${c.case_id}`);
  }
  for (const id of expected) if (!seen.has(id)) errs.push(`ケース欠落: ${id}`);
  for (const r of out.evidence_refs) if (!validRefs.has(r)) errs.push(`出典不整合（存在しない参照）: ${r}`);
  return errs;
}

const PUSHY = ["そこを何とか", "少しだけでも", "せめて", "お時間は取らせません", "絶対", "必ず儲か", "今だけ", "損をします"];
const RECONTACT = ["改めてお電話", "改めてご連絡", "またご連絡", "またお電話", "再度ご連絡", "再度お電話", "時期を改めて", "後日"];

function sourceCorpus(p: Project): string {
  const parts: string[] = [];
  for (const a of Object.values(p.answers)) if (a) parts.push(answerText(a));
  for (const d of p.documents) parts.push(d.text);
  return parts.join("\n");
}

/** 1場面の品質警告 */
export function qualityWarnings(p: Project, scene: ScriptScene): string[] {
  const w: string[] = [];
  const def = SCENE_MAP[scene.sceneId];
  if (!def) return [`未定義の場面: ${scene.sceneId}`];
  const corpus = sourceCorpus(p);
  const ng = answerText(p.answers.ngExpressions)
    .split(/[\n、,]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);

  for (const c of scene.cases) {
    const cdef = def.cases.find((x) => x.caseId === c.caseId);
    for (const v of c.variants) {
      const t = v.text;
      const where = `${c.label}／${v.style}`;
      // 名なしと名ありの差
      if (p.flowType === "NO_KEYMAN_NAME" && t.includes("〔キーマン氏名〕"))
        w.push(`［${where}］①名なしなのに〔キーマン氏名〕を使っています`);
      if (scene.sceneId === "S02" && v.style !== "supplement" && !t.includes("〔キーマン氏名〕"))
        w.push(`［${where}］②の指名取次に〔キーマン氏名〕がありません`);
      // 本人宛の場面に受付向け取次文言
      if (def.speaker === "本人宛" && /お取り次ぎ|お取次ぎ|おつなぎいただけ/.test(t))
        w.push(`［${where}］本人宛の場面に受付向けの取次ぎ文言があります`);
      // 次回コール不可・強い拒否への再勧誘
      if (cdef?.noRecontact) {
        const hit = RECONTACT.find((k) => t.includes(k));
        if (hit) w.push(`［${where}］再連絡・再勧誘を示唆する表現「${hit}」があります（相手の意思を尊重してください）`);
      }
      const push = PUSHY.find((k) => t.includes(k));
      if (push) w.push(`［${where}］押し付けの強い表現「${push}」があります`);
      // 根拠のない数値
      const nums = t.match(/[0-9０-９]+(?:[.,][0-9]+)?\s*(?:%|％|社|件|円|万|億|倍|名|人)/g) ?? [];
      for (const num of nums) {
        const digits = num.replace(/[^0-9０-９.]/g, "");
        if (!corpus.includes(digits)) w.push(`［${where}］根拠資料にない数値「${num}」があります`);
      }
      for (const word of ng) if (t.includes(word)) w.push(`［${where}］NG表現「${word}」が含まれています`);
      // 読み上げ適性
      const longLine = t.split("\n").find((l) => l.length > 90);
      if (longLine) w.push(`［${where}］1文が長すぎます（${longLine.length}字）。読み上げやすく区切ってください`);
      if (/【要確認：/.test(t)) w.push(`［${where}］未入力の情報（【要確認】）が残っています`);
      // 強調（**語**）：優先1シート「強調すべき単語はハイライト」
      const marks = (t.match(/\*\*/g) ?? []).length;
      if (marks % 2 === 1) w.push(`［${where}］強調記号（**）の対応が取れていません`);
      else if (marks / 2 > 2) w.push(`［${where}］強調が多すぎます（${marks / 2}か所）。1〜2か所に絞ってください`);
    }
  }
  return [...new Set(w)];
}
