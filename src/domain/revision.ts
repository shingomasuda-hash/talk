/**
 * 修正提案の作成・適用・版管理。
 * AIは修正箇所だけを提案し（RevisionProposal）、人が採用して初めて新しい版になる。
 */
import type { RevisionChange, RevisionProposal, Script, ScriptScene, ScriptVersion, Variant } from "./types.js";

export function latest(script: Script): ScriptVersion {
  return script.versions[script.versions.length - 1];
}

export function getText(scenes: ScriptScene[], sceneId: string, caseId: string, style: Variant["style"]): string | undefined {
  return scenes.find((s) => s.sceneId === sceneId)?.cases.find((c) => c.caseId === caseId)?.variants.find((v) => v.style === style)?.text;
}

function clone<T>(x: T): T { return JSON.parse(JSON.stringify(x)); }

/** DEMOモード用：限定的な規則ベースの修正（APIキー未設定時） */
export function demoRevision(scenes: ScriptScene[], targetScenes: string[], instruction: string): { changes: Omit<RevisionChange, "before">[]; notes: string[] } {
  const changes: Omit<RevisionChange, "before">[] = [];
  const notes: string[] = [];
  const wantShort = /短く|簡潔|削|コンパクト|字程度/.test(instruction);
  const wantPolite = /丁寧|柔らか|やわらか|弱め|弱く|控えめ|押さない/.test(instruction);
  if (!wantShort && !wantPolite) {
    notes.push("DEMOモードでは『短く／簡潔に』『丁寧に／柔らかく／弱めに』の指示のみ規則ベースで処理します。自由な修正指示は ANTHROPIC_API_KEY を設定してAIモードで実行してください。");
    return { changes, notes };
  }
  for (const s of scenes.filter((x) => targetScenes.includes(x.sceneId))) {
    for (const c of s.cases) {
      for (const v of c.variants) {
        if (v.style === "supplement") continue;
        let t = v.text;
        if (wantShort) {
          t = t
            .replace(/(お忙しいところ恐れ入ります。|突然のお電話失礼いたします。)/g, "")
            .replace(/お忙しいところお電話代わっていただき/g, "お電話代わっていただき")
            .replace(/\n{2,}/g, "\n")
            .replace(/念のため、/g, "")
            .replace(/差し支えなければ、|もし差し支えなければ、/g, "")
            .replace(/\n?(お忙しいところ)?お時間をいただき、ありがとうございました。/g, "\nありがとうございました。");
        }
        if (wantPolite) {
          t = t
            .replace(/せめて|少しだけでも/g, "もしよろしければ")
            .replace(/(^|\n)(?!恐れ入りますが|もし|よろしければ)([^\n]*でしょうか。)/, (_m, p1, p2) => `${p1}恐れ入りますが、${p2}`);
        }
        t = t.trim();
        if (t && t !== v.text) changes.push({ sceneId: s.sceneId, caseId: c.caseId, style: v.style, after: t, reason: wantShort ? "クッション言葉・補足文を削り短くしました（DEMO規則）" : "クッション言葉を加え柔らかくしました（DEMO規則）" });
      }
    }
  }
  if (!changes.length) notes.push("規則ベースでは変更箇所が見つかりませんでした。");
  return { changes, notes };
}

/** 提案（の一部）を適用して新しい版を作る。対象外の場面は一切変更しない。 */
export function applyProposal(script: Script, proposal: RevisionProposal, indexes?: number[]): ScriptVersion {
  const base = latest(script);
  const scenes = clone(base.scenes);
  const selected = proposal.changes.filter((_, i) => !indexes || indexes.includes(i));
  const changed = new Set<string>();
  for (const ch of selected) {
    const scene = scenes.find((s) => s.sceneId === ch.sceneId);
    const kase = scene?.cases.find((c) => c.caseId === ch.caseId);
    if (!scene || !kase) continue;
    const v = kase.variants.find((x) => x.style === ch.style);
    if (v) v.text = ch.after;
    else kase.variants.push({ style: ch.style, text: ch.after });
    // 承認済みの場面が変わったら再承認が必要。DEMO文にAI修正が入ったらAI提案扱い。
    if (scene.reviewStatus === "CONFIRMED") scene.reviewStatus = "NEEDS_CONFIRMATION";
    else if (scene.reviewStatus === "DEMO" && proposal.generatedBy === "ai") scene.reviewStatus = "AI_PROPOSAL";
    changed.add(ch.sceneId);
  }
  const v: ScriptVersion = {
    version: base.version + 1,
    createdAt: new Date().toISOString(),
    reason: `修正指示：${proposal.instruction}`,
    scenes,
    changedScenes: [...changed],
    approved: false,
  };
  return v;
}

export function manualEdit(script: Script, sceneId: string, caseId: string, style: Variant["style"], text: string): ScriptVersion {
  const base = latest(script);
  const scenes = clone(base.scenes);
  const scene = scenes.find((s) => s.sceneId === sceneId);
  const kase = scene?.cases.find((c) => c.caseId === caseId);
  if (!scene || !kase) throw new Error("対象の場面・ケースが見つかりません");
  const v = kase.variants.find((x) => x.style === style);
  if (v) v.text = text; else kase.variants.push({ style, text });
  scene.generatedBy = "human";
  if (scene.reviewStatus === "CONFIRMED") scene.reviewStatus = "NEEDS_CONFIRMATION";
  return { version: base.version + 1, createdAt: new Date().toISOString(), reason: `手編集：${sceneId}/${caseId}/${style}`, scenes, changedScenes: [sceneId], approved: false };
}

export function setSceneStatus(script: Script, sceneId: string, status: ScriptScene["reviewStatus"]): ScriptVersion {
  const base = latest(script);
  const scenes = clone(base.scenes);
  const scene = scenes.find((s) => s.sceneId === sceneId);
  if (!scene) throw new Error("対象の場面が見つかりません");
  scene.reviewStatus = status;
  return { version: base.version + 1, createdAt: new Date().toISOString(), reason: `承認状態変更：${sceneId}→${status}`, scenes, changedScenes: [sceneId], approved: false };
}

export function revertTo(script: Script, version: number): ScriptVersion {
  const target = script.versions.find((v) => v.version === version);
  if (!target) throw new Error("指定の版が見つかりません");
  const base = latest(script);
  const changed = target.scenes.filter((s) => JSON.stringify(s) !== JSON.stringify(base.scenes.find((b) => b.sceneId === s.sceneId))).map((s) => s.sceneId);
  return { version: base.version + 1, createdAt: new Date().toISOString(), reason: `v${version} に戻す`, scenes: clone(target.scenes), changedScenes: changed, approved: false };
}

/** 再生成した場面を差し替えた新しい版（他の場面は維持） */
export function replaceScenes(script: Script, newScenes: ScriptScene[], reason: string): ScriptVersion {
  const base = latest(script);
  const scenes = clone(base.scenes).filter((s) => !newScenes.some((n) => n.sceneId === s.sceneId));
  scenes.push(...clone(newScenes));
  scenes.sort((a, b) => a.sceneId.localeCompare(b.sceneId));
  return { version: base.version + 1, createdAt: new Date().toISOString(), reason, scenes, changedScenes: newScenes.map((s) => s.sceneId), approved: false };
}
