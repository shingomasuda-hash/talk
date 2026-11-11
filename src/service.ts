/** アプリのユースケース（HTTP層から独立させ、テストから直接呼べるようにする） */
import { FLOWS, FLOW_LABEL, type FlowType } from "./domain/flowModel.js";
import { SCENE_MAP, FIELD_MAP, CHAPTERS, type ProjectField } from "./domain/scenes.js";
import { answerText, contradictions, coverageFor, impactedScenes, includedScenes, missingQuestions, selectScenes } from "./domain/selection.js";
import { demoScene } from "./domain/demoGenerator.js";
import { qualityWarnings } from "./domain/quality.js";
import { diffText } from "./domain/diff.js";
import { applyProposal, demoRevision, getText, latest, manualEdit, replaceScenes, revertTo, setSceneStatus } from "./domain/revision.js";
import type { Answer, KnowledgeEntry, Project, RevisionProposal, Script, ScriptScene, SourceDocument, Variant } from "./domain/types.js";
import { Store } from "./store.js";
import type { ScriptAi } from "./ai/claude.js";

export class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

const now = () => new Date().toISOString();

export class Service {
  constructor(public store: Store, public ai: ScriptAi) {}

  // ---------------- 案件 ----------------
  createProject(input: { name: string; flowType: FlowType; answers?: Record<string, Answer | string | string[]> }): Project {
    if (!input.name?.trim()) throw new HttpError(400, "案件名は必須です");
    if (!FLOWS[input.flowType]) throw new HttpError(400, "リスト種別（①キーマン名なし／②キーマン名あり）の選択は必須です");
    const p: Project = { id: Store.id("prj"), name: input.name.trim(), flowType: input.flowType, answers: {}, documents: [], createdAt: now(), updatedAt: now() };
    if (input.answers) this.applyAnswers(p, input.answers);
    this.store.data.projects.push(p);
    this.store.save();
    return publicProject(p);
  }

  private need(id: string): Project {
    const p = this.store.project(id);
    if (!p) throw new HttpError(404, "案件が見つかりません");
    return p;
  }

  private applyAnswers(p: Project, answers: Record<string, Answer | string | string[] | { value: unknown; status: string }>) {
    for (const [k, raw] of Object.entries(answers)) {
      if (!FIELD_MAP[k]) continue;
      let a: Answer;
      if (raw && typeof raw === "object" && !Array.isArray(raw) && "status" in raw) {
        const r = raw as { value: unknown; status: string };
        const status = (["answered", "unknown", "skipped"].includes(r.status) ? r.status : "answered") as Answer["status"];
        a = { value: (r.value as string | string[]) ?? "", status, updatedAt: now() };
      } else {
        a = { value: raw as string | string[], status: "answered", updatedAt: now() };
      }
      const empty = Array.isArray(a.value) ? a.value.length === 0 : !String(a.value ?? "").trim();
      if (a.status === "answered" && empty) delete p.answers[k as ProjectField];
      else p.answers[k as ProjectField] = a;
    }
  }

  updateProject(id: string, patch: { name?: string; flowType?: FlowType; answers?: Record<string, Answer | string | string[]> }): Project {
    const p = this.need(id);
    if (patch.name !== undefined) p.name = patch.name;
    if (patch.flowType !== undefined) {
      if (!FLOWS[patch.flowType]) throw new HttpError(400, "不正なリスト種別です");
      const s = this.store.scriptOf(id);
      if (s && s.flowType !== patch.flowType) throw new HttpError(409, "スクリプト生成後はリスト種別を変更できません。別案件として作成してください。");
      p.flowType = patch.flowType;
    }
    if (patch.answers) this.applyAnswers(p, patch.answers);
    p.updatedAt = now();
    this.store.save();
    return publicProject(p);
  }

  addDocument(id: string, doc: { name: string; kind: SourceDocument["kind"]; text?: string; url?: string; pdfBase64?: string; category?: SourceDocument["category"] }): SourceDocument {
    const p = this.need(id);
    const ext = (doc.name.split(".").pop() || "").toLowerCase();
    let text = (doc.text ?? "").slice(0, 200_000);
    let fetchStatus: SourceDocument["fetchStatus"] = "parsed";
    let pdfBase64: string | undefined;
    if (doc.kind === "url") { fetchStatus = "not_fetched"; text = ""; }
    else if (doc.kind === "file" && ext === "pdf") {
      // PDFはサーバーでは解析せず、AIモードの生成時にClaudeへ文書として渡す
      const b64 = (doc.pdfBase64 ?? "").replace(/^data:[^,]*,/, "");
      if (!b64 || !/^[A-Za-z0-9+/=\s]+$/.test(b64)) throw new HttpError(400, "PDFの内容を読み取れませんでした");
      if (b64.length > 14_000_000) throw new HttpError(413, "PDFは10MBまでです");
      let head = "";
      try { head = atob(b64.replace(/\s/g, "").slice(0, 8)); } catch { /* 不正なbase64 */ }
      if (!head.startsWith("%PDF")) throw new HttpError(400, "PDFファイルではありません");
      fetchStatus = "pdf_for_ai"; text = ""; pdfBase64 = b64.replace(/\s/g, "");
    }
    else if (doc.kind === "file" && !["txt", "md", "csv", "json", "tsv", "html"].includes(ext)) { fetchStatus = "unsupported"; text = ""; }
    const category = (["product_basics", "service_material", "other"] as const).includes(doc.category as never) ? doc.category : "other";
    const d: SourceDocument = { id: Store.id("doc"), name: doc.kind === "url" ? (doc.url || doc.name) : doc.name, kind: doc.kind, text, fetchStatus, pdfBase64, category, addedAt: now() };
    p.documents.push(d);
    p.updatedAt = now();
    this.store.save();
    return stripDoc(d);
  }

  /** 別リスト用に案件を複製（議事録：同じ商材でも新規／既存などリストでスクリプトを変える） */
  duplicateProject(id: string, input: { name?: string; flowType?: FlowType; answers?: Record<string, Answer | string | string[]> }): Project {
    const src = this.need(id);
    const flowType = input.flowType ?? src.flowType;
    if (!FLOWS[flowType]) throw new HttpError(400, "不正なリスト種別です");
    const p: Project = {
      id: Store.id("prj"),
      name: input.name?.trim() || `${src.name}（別リスト）`,
      flowType,
      answers: JSON.parse(JSON.stringify(src.answers)),
      documents: src.documents.map((d) => ({ ...d, id: Store.id("doc") })),
      createdAt: now(),
      updatedAt: now(),
    };
    if (input.answers) this.applyAnswers(p, input.answers);
    this.store.data.projects.push(p);
    this.store.save();
    return publicProject(p);
  }

  /** 参考スクリプトに使える案件（スクリプトがあるもの） */
  referenceCandidates(excludeId: string) {
    return this.store.data.scripts
      .filter((s) => s.projectId !== excludeId)
      .map((s) => {
        const p = this.store.project(s.projectId);
        const v = [...s.versions].reverse().find((x) => x.approved) ?? latest(s);
        return p ? { projectId: p.id, name: p.name, flowType: p.flowType, version: v.version, approved: v.approved } : null;
      })
      .filter(Boolean);
  }

  removeDocument(id: string, docId: string) {
    const p = this.need(id);
    p.documents = p.documents.filter((d) => d.id !== docId);
    this.store.save();
  }

  // ---------------- 分析（不足質問・場面選択・網羅） ----------------
  analysis(id: string) {
    const p = this.need(id);
    const script = this.store.scriptOf(id);
    const cur = script ? latest(script) : undefined;
    const sel = selectScenes(p);
    return {
      project: publicProject(p),
      referenceCandidates: this.referenceCandidates(id),
      flow: { flowType: p.flowType, label: FLOW_LABEL[p.flowType], description: FLOWS[p.flowType].description },
      selection: sel.map((s) => ({ sceneId: s.scene.sceneId, title: s.scene.title, included: s.included, reason: s.reason, missingInputs: s.missingInputs.map((f) => FIELD_MAP[f].label), generated: !!cur?.scenes.some((x) => x.sceneId === s.scene.sceneId) })),
      questions: missingQuestions(p),
      contradictions: contradictions(p),
      coverage: coverageFor(p.flowType, cur?.scenes.map((s) => s.sceneId) ?? includedScenes(p).map((s) => s.sceneId)),
      impact: cur ? impactedScenes(p, cur.scenes) : [],
      transitions: this.transitions(p.flowType),
      aiEnabled: this.ai.enabled,
    };
  }

  /** フロー間の移行条件（指示書§2） */
  transitions(flowType: FlowType) {
    if (flowType === "NO_KEYMAN_NAME")
      return [
        { to: "HAS_KEYMAN_NAME", condition: "キーマン名を入手した（図形16）", sourceShapes: ["16"], status: "NEEDS_CONFIRMATION", note: "次回架電は②キーマン名ありリストとして扱う。指示書の記載に基づく。" },
        { to: "HAS_KEYMAN_NAME", condition: "キーマンと対話でき、商談OK／資料送付OKとなった（図形18・19の直下に注記75『②キーマンありリストへ』）", sourceShapes: ["75", "18", "19"], status: "NEEDS_CONFIRMATION", note: "注記の配置からの読解。移行条件の範囲は要確認。" },
      ];
    return [{ to: "HAS_KEYMAN_NAME", condition: "後任者を入手した（図形119・注記2）", sourceShapes: ["119", "2"], status: "COVERED", note: "後任者へ取次依頼し、②キーマン名ありコールとして対象キーマン情報を更新する。" }];
  }

  // ---------------- 生成 ----------------
  async generate(id: string, opts: { sceneIds?: string[]; mode?: "auto" | "demo"; referenceProjectId?: string } = {}): Promise<{ script: Script; errors: { sceneId: string; message: string }[]; mode: "ai" | "demo"; notes: string[] }> {
    const p = this.need(id);
    const included = includedScenes(p).map((s) => s.sceneId);
    const targets = (opts.sceneIds?.length ? opts.sceneIds : included).filter((s) => included.includes(s));
    if (!targets.length) throw new HttpError(400, "生成対象の場面がありません");
    const useAi = opts.mode !== "demo" && this.ai.enabled;
    const notes: string[] = [];
    // 参考スクリプト：承認版があればそれ、無ければ最新版
    let ref: { name: string; version: number; scenes: ScriptScene[] } | undefined;
    if (opts.referenceProjectId) {
      const rs = this.store.scriptOf(opts.referenceProjectId);
      const rp = this.store.project(opts.referenceProjectId);
      if (!rs || !rp) throw new HttpError(400, "参考にするスクリプトが見つかりません");
      const v = [...rs.versions].reverse().find((x) => x.approved) ?? latest(rs);
      ref = { name: rp.name, version: v.version, scenes: v.scenes };
      if (!useAi) notes.push("DEMOモードでは参考スクリプトを使えません（AIモードで有効）");
    }
    const errors: { sceneId: string; message: string }[] = [];
    const scenes: ScriptScene[] = [];
    if (useAi) {
      const queue = [...targets];
      const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
        while (queue.length) {
          const sid = queue.shift()!;
          const refScene = ref?.scenes.find((x) => x.sceneId === sid);
          try {
            const sc = await this.ai.generateScene(p, SCENE_MAP[sid], this.store.data.knowledge, refScene ? { reference: { projectName: ref!.name, scene: refScene } } : undefined);
            if (refScene) sc.referenceFrom = `${ref!.name} v${ref!.version}`;
            scenes.push(sc);
          }
          catch (e) { errors.push({ sceneId: sid, message: (e as Error).message }); }
        }
      });
      await Promise.all(workers);
    } else {
      for (const sid of targets) scenes.push(demoScene(p, SCENE_MAP[sid]));
    }
    for (const s of scenes) s.qualityWarnings = qualityWarnings(p, s);
    scenes.sort((a, b) => a.sceneId.localeCompare(b.sceneId));

    let script = this.store.scriptOf(id);
    const reason = `${useAi ? "AI生成" : "DEMO生成"}：${opts.sceneIds?.length ? targets.join(",") : "全場面"}`;
    if (!script) {
      script = { id: Store.id("scr"), projectId: id, flowType: p.flowType, versions: [], openQuestions: [] };
      script.versions.push({ version: 1, createdAt: now(), reason, scenes, changedScenes: scenes.map((s) => s.sceneId), approved: false });
      this.store.data.scripts.push(script);
    } else if (scenes.length) {
      // 生成対象外になった場面は全体再生成時に外す
      const v = replaceScenes(script, scenes, reason);
      if (!opts.sceneIds?.length) v.scenes = v.scenes.filter((s) => included.includes(s.sceneId));
      script.versions.push(v);
    }
    script.openQuestions = [...new Set(scenes.flatMap((s) => s.uncertainties))];
    this.store.save();
    return { script, errors, mode: useAi ? "ai" : "demo", notes };
  }

  getScript(projectId: string) {
    const s = this.store.scriptOf(projectId);
    if (!s) throw new HttpError(404, "スクリプトはまだ生成されていません");
    return s;
  }

  private needScript(scriptId: string) {
    const s = this.store.script(scriptId);
    if (!s) throw new HttpError(404, "スクリプトが見つかりません");
    return s;
  }

  // ---------------- 修正 ----------------
  async proposeRevision(scriptId: string, input: { instruction: string; sceneIds?: string[]; mode?: "auto" | "demo" }): Promise<RevisionProposal & { diffs: ReturnType<typeof diffText>[] }> {
    const script = this.needScript(scriptId);
    const p = this.need(script.projectId);
    if (!input.instruction?.trim()) throw new HttpError(400, "修正指示を入力してください");
    const cur = latest(script);
    const targets = input.sceneIds?.length ? input.sceneIds : cur.scenes.map((s) => s.sceneId);
    const targetScenes = cur.scenes.filter((s) => targets.includes(s.sceneId));
    if (!targetScenes.length) throw new HttpError(400, "対象の場面がありません");
    const useAi = input.mode !== "demo" && this.ai.enabled;
    let changes: RevisionProposal["changes"] = [];
    let notes: string[] = [];
    if (useAi) {
      const out = await this.ai.revise(p, targetScenes, input.instruction);
      changes = out.changes
        .filter((c) => targets.includes(c.scene_id))
        .map((c) => ({ sceneId: c.scene_id, caseId: c.case_id, style: c.style, before: getText(cur.scenes, c.scene_id, c.case_id, c.style) ?? "", after: c.new_text.trim(), reason: c.reason }))
        .filter((c) => c.before !== c.after);
      notes = out.impact_notes;
    } else {
      const r = demoRevision(cur.scenes, targets, input.instruction);
      changes = r.changes.map((c) => ({ ...c, before: getText(cur.scenes, c.sceneId, c.caseId, c.style) ?? "" }));
      notes = r.notes;
    }
    const proposal: RevisionProposal = {
      id: Store.id("rev"), scriptId, baseVersion: cur.version, instruction: input.instruction, targetScenes: targets,
      changes, impactNotes: notes, generatedBy: useAi ? "ai" : "demo", status: "pending", createdAt: now(),
    };
    this.store.data.proposals.push(proposal);
    this.store.save();
    return { ...proposal, diffs: changes.map((c) => diffText(c.before, c.after)) };
  }

  applyRevision(proposalId: string, indexes?: number[]) {
    const prop = this.store.proposal(proposalId);
    if (!prop) throw new HttpError(404, "修正提案が見つかりません");
    if (prop.status !== "pending") throw new HttpError(409, "この提案は処理済みです");
    const script = this.needScript(prop.scriptId);
    if (latest(script).version !== prop.baseVersion) throw new HttpError(409, "提案作成後にスクリプトが更新されています。もう一度提案を作成してください。");
    const p = this.need(script.projectId);
    const v = applyProposal(script, prop, indexes);
    for (const s of v.scenes) if (v.changedScenes.includes(s.sceneId)) s.qualityWarnings = qualityWarnings(p, s);
    script.versions.push(v);
    prop.status = "applied";
    this.store.save();
    return script;
  }

  rejectRevision(proposalId: string) {
    const prop = this.store.proposal(proposalId);
    if (!prop) throw new HttpError(404, "修正提案が見つかりません");
    prop.status = "rejected";
    this.store.save();
    return prop;
  }

  manualEdit(scriptId: string, sceneId: string, caseId: string, style: Variant["style"], text: string) {
    const script = this.needScript(scriptId);
    const p = this.need(script.projectId);
    const v = manualEdit(script, sceneId, caseId, style, text);
    const s = v.scenes.find((x) => x.sceneId === sceneId)!;
    s.qualityWarnings = qualityWarnings(p, s);
    script.versions.push(v);
    this.store.save();
    return script;
  }

  setSceneStatus(scriptId: string, sceneId: string, status: ScriptScene["reviewStatus"]) {
    if (!["CONFIRMED", "NEEDS_CONFIRMATION", "AI_PROPOSAL"].includes(status)) throw new HttpError(400, "不正な承認状態です");
    const script = this.needScript(scriptId);
    script.versions.push(setSceneStatus(script, sceneId, status));
    this.store.save();
    return script;
  }

  revert(scriptId: string, version: number) {
    const script = this.needScript(scriptId);
    script.versions.push(revertTo(script, version));
    this.store.save();
    return script;
  }

  approveVersion(scriptId: string, version: number) {
    const script = this.needScript(scriptId);
    const v = script.versions.find((x) => x.version === version);
    if (!v) throw new HttpError(404, "版が見つかりません");
    v.approved = true;
    this.store.save();
    return script;
  }

  compareVersions(scriptId: string, a: number, b: number) {
    const script = this.needScript(scriptId);
    const va = script.versions.find((x) => x.version === a), vb = script.versions.find((x) => x.version === b);
    if (!va || !vb) throw new HttpError(404, "版が見つかりません");
    const out: { sceneId: string; caseId: string; style: string; diff: ReturnType<typeof diffText> }[] = [];
    for (const sb of vb.scenes) {
      const sa = va.scenes.find((s) => s.sceneId === sb.sceneId);
      for (const cb of sb.cases) for (const v of cb.variants) {
        const before = sa?.cases.find((c) => c.caseId === cb.caseId)?.variants.find((x) => x.style === v.style)?.text ?? "";
        if (before !== v.text) out.push({ sceneId: sb.sceneId, caseId: cb.caseId, style: v.style, diff: diffText(before, v.text) });
      }
    }
    return out;
  }

  /** 完成版の冒頭に出す「注意事項・変更点・ポイント」（優先1シートの画面案） */
  briefing(scriptId: string, version?: number) {
    const script = this.needScript(scriptId);
    const p = this.need(script.projectId);
    const v = version ? script.versions.find((x) => x.version === version) : latest(script);
    if (!v) throw new HttpError(404, "版が見つかりません");
    const lines = (t: string) => t.split(/\n+/).map((x) => x.replace(/^[・\-\s]+/, "").trim()).filter(Boolean);
    const notes: string[] = [];
    const ng = answerText(p.answers.ngExpressions);
    if (ng) notes.push(`使わない表現：${lines(ng).join("、")}`);
    const needConfirm = v.scenes.filter((s) => s.cases.some((c) => c.variants.some((x) => x.text.includes("【要確認"))));
    if (needConfirm.length) notes.push(`未確定の情報（【要確認】）が残っている場面：${needConfirm.map((s) => s.sceneId).join(", ")}`);
    const unapproved = v.scenes.filter((s) => s.reviewStatus !== "CONFIRMED");
    if (unapproved.length) notes.push(`未承認の場面：${unapproved.length}/${v.scenes.length}（AI提案・DEMOは確定ノウハウではありません）`);
    const base = [...script.versions].reverse().find((x) => x.approved && x.version < v.version);
    let changes: string[];
    if (!base) changes = ["承認版がないため、変更点は初版からの差分として扱います（承認版を作ると、次版で変更点が表示されます）"];
    else {
      const changed = v.scenes.filter((s) => JSON.stringify(s.cases) !== JSON.stringify(base.scenes.find((b) => b.sceneId === s.sceneId)?.cases));
      const added = v.scenes.filter((s) => !base.scenes.some((b) => b.sceneId === s.sceneId));
      changes = changed.length ? changed.map((s) => `${s.sceneId} ${s.title}${added.includes(s) ? "（追加）" : ""}`) : ["変更なし"];
      changes.unshift(`比較元：承認版 v${base.version}`);
    }
    const points = lines(answerText(p.answers.operatorPoints));
    return { version: v.version, notes, changes, points };
  }

  exportMarkdown(scriptId: string, version?: number): string {
    const script = this.needScript(scriptId);
    const p = this.need(script.projectId);
    const v = version ? script.versions.find((x) => x.version === version) : latest(script);
    if (!v) throw new HttpError(404, "版が見つかりません");
    const st: Record<string, string> = { CONFIRMED: "承認済み", AI_PROPOSAL: "AI提案（未承認）", NEEDS_CONFIRMATION: "要確認", DEMO: "DEMO（テンプレート生成・未承認）" };
    const styleLabel: Record<string, string> = { short: "短い版（一言）", standard: "標準版（三言）", supplement: "必要時の補足" };
    const b = this.briefing(scriptId, v.version);
    const lines: string[] = [
      `# ${p.name}｜${FLOW_LABEL[p.flowType]} スクリプト v${v.version}${v.approved ? "（承認版）" : ""}`,
      "",
      `- 作成日時: ${v.createdAt}`,
      `- 改訂理由: ${v.reason}`,
      `- 〔 〕は架電時に差し込む変数、【要確認】は未確定の情報、**太字**は強調して話す言葉です。`,
      "",
      "## 注意事項・変更点・ポイント",
      "",
      "**注意事項**", "", ...(b.notes.length ? b.notes.map((x) => `- ${x}`) : ["- なし"]), "",
      "**変更点**", "", ...b.changes.map((x) => `- ${x}`), "",
      "**ポイント**", "", ...(b.points.length ? b.points.map((x) => `- ${x}`) : ["- （未入力：情報入力の「オペレーター向けの注意事項・ポイント」）"]), "",
      "## Contents",
      "",
      ...CHAPTERS.filter((c) => v.scenes.some((s) => c.scenes.includes(s.sceneId))).map((c) => `- ${c.label}：${v.scenes.filter((s) => c.scenes.includes(s.sceneId)).map((s) => `${s.sceneId} ${s.title}`).join("／")}`),
      "",
    ];
    for (const ch of CHAPTERS) {
      const scenes = v.scenes.filter((s) => ch.scenes.includes(s.sceneId));
      if (!scenes.length) continue;
      lines.push(`# 【${ch.label}】`, "");
      for (const s of scenes) {
        lines.push(`## ${s.sceneId} ${s.title}`, "", `- 承認状態: ${st[s.reviewStatus]}`, `- 目的: ${s.purpose}`, `- 使用条件: ${s.applicabilityConditions.join("／")}`, `- 避ける表現: ${s.avoid.join("／")}`, ...(s.referenceFrom ? [`- 参考にしたスクリプト: ${s.referenceFrom}`] : []), "");
        for (const c of s.cases) {
          lines.push(`### ${c.label}`, "", `条件: ${c.condition}　／　意図: ${c.intent}`, "");
          for (const vv of c.variants) lines.push(`**${styleLabel[vv.style]}**`, "", vv.text.split("\n").map((l) => `> ${l}`).join("\n"), "");
        }
        if (s.uncertainties.length) lines.push("要確認:", ...s.uncertainties.map((u) => `- ${u}`), "");
      }
    }
    const R = FLOWS[p.flowType].nodes.filter((nd) => nd.scenes.length === 0 && nd.cls !== "D");
    lines.push("## 台本化しない結果・状態（意図的に対象外／要確認）", "", ...R.map((nd) => `- ${nd.shapeId}「${nd.label.replace(/\n/g, "")}」: ${nd.note}`), "");
    return lines.join("\n");
  }

  // ---------------- ナレッジ ----------------
  upsertKnowledge(input: Partial<KnowledgeEntry>): KnowledgeEntry {
    const list = this.store.data.knowledge;
    const status = (input.status ?? "NEEDS_CONFIRMATION") as KnowledgeEntry["status"];
    if (!["CONFIRMED", "AI_PROPOSAL", "NEEDS_CONFIRMATION"].includes(status)) throw new HttpError(400, "不正なステータスです");
    if (!input.principle?.trim()) throw new HttpError(400, "原則は必須です");
    const existing = input.id ? list.find((k) => k.id === input.id) : undefined;
    const entry: KnowledgeEntry = {
      id: existing?.id ?? Store.id("kn"),
      sceneIds: input.sceneIds ?? existing?.sceneIds ?? [],
      principle: input.principle, reason: input.reason ?? "", conditions: input.conditions ?? "", exceptions: input.exceptions ?? "",
      exampleTalk: input.exampleTalk ?? "", source: input.source ?? "", status, updatedAt: now(),
    };
    if (existing) Object.assign(existing, entry); else list.push(entry);
    this.store.save();
    return entry;
  }
}

/** API応答からPDF本体（base64）を除く */
function stripDoc(d: SourceDocument): SourceDocument {
  const { pdfBase64: _omit, ...rest } = d;
  return rest;
}
export function publicProject(p: Project): Project {
  return { ...p, documents: p.documents.map(stripDoc) };
}
