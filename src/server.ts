import express, { type NextFunction, type Request, type Response } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { FLOWS, FLOW_DIFFERENCES, FLOW_LABEL, type FlowType } from "./domain/flowModel.js";
import { CHAPTERS, FIELDS, SCENES } from "./domain/scenes.js";
import { coverageFor } from "./domain/selection.js";
import { Store } from "./store.js";
import { ClaudeScriptAi, MODEL, AiOutputError, AiUnavailableError, type ScriptAi } from "./ai/claude.js";
import { HttpError, Service } from "./service.js";
import { PRINCIPLE_MAPPINGS, SOURCE_MATERIALS, UNUSED_SHEET_DIFFS } from "./domain/sources.js";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LAYOUT = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "source", "flow-layout.json"), "utf8")) as {
  source_file: string;
  sheets: { sheet_name: string; shapes: unknown[]; connectors: unknown[] }[];
  excluded_sheets: unknown[];
};

export function createApp(service: Service) {
  const app = express();
  app.use(express.json({ limit: "16mb" }));

  // 最小限の認証（APP_PASSWORD を設定した場合のみ Basic 認証）
  const pw = process.env.APP_PASSWORD;
  if (pw) {
    app.use((req, res, next) => {
      const h = req.headers.authorization ?? "";
      const [, b64] = h.split(" ");
      const pass = b64 ? Buffer.from(b64, "base64").toString().split(":").slice(1).join(":") : "";
      if (pass === pw) return next();
      res.setHeader("WWW-Authenticate", 'Basic realm="script-ai"');
      res.status(401).send("認証が必要です");
    });
  }

  app.use(express.static(path.join(__dirname, "..", "public")));

  type Req = Request<Record<string, string>>;
  const h = (fn: (req: Req, res: Response) => unknown) => async (req: Req, res: Response, next: NextFunction) => {
    try { const out = await fn(req, res); if (!res.headersSent) res.json(out === undefined ? { ok: true } : out); } catch (e) { next(e); }
  };

  app.get("/api/meta", h(() => ({
    aiEnabled: service.ai.enabled,
    model: service.ai.enabled ? MODEL : null,
    flows: Object.values(FLOWS).map((f) => ({ flowType: f.flowType, sheetName: f.sheetName, shortName: f.shortName, description: f.description, nodeCount: f.nodes.length, edgeCount: f.edges.length })),
    differences: FLOW_DIFFERENCES,
    scenes: SCENES,
    chapters: CHAPTERS,
    fields: FIELDS,
  })));
  app.get("/api/flows/:flowType", h((req) => {
    const f = FLOWS[req.params.flowType as FlowType];
    if (!f) throw new HttpError(404, "フローが見つかりません");
    const layout = LAYOUT.sheets.find((x) => x.sheet_name === f.sheetName);
    return { ...f, label: FLOW_LABEL[f.flowType], coverage: coverageFor(f.flowType), layout, layoutSource: LAYOUT.source_file };
  }));

  app.get("/api/sources", h(() => ({ materials: SOURCE_MATERIALS, principles: PRINCIPLE_MAPPINGS, excludedSheets: LAYOUT.excluded_sheets, unusedDiffs: UNUSED_SHEET_DIFFS })));
  app.get("/api/projects", h(() => service.store.data.projects.map((p) => ({ id: p.id, name: p.name, flowType: p.flowType, updatedAt: p.updatedAt, hasScript: !!service.store.scriptOf(p.id) }))));
  app.post("/api/projects", h((req) => service.createProject(req.body)));
  app.get("/api/projects/:id", h((req) => service.analysis(req.params.id)));
  app.put("/api/projects/:id", h((req) => service.updateProject(req.params.id, req.body)));
  app.post("/api/projects/:id/duplicate", h((req) => service.duplicateProject(req.params.id, req.body ?? {})));
  app.post("/api/projects/:id/documents", h((req) => service.addDocument(req.params.id, req.body)));
  app.delete("/api/projects/:id/documents/:docId", h((req) => service.removeDocument(req.params.id, req.params.docId)));
  app.post("/api/projects/:id/generate", h((req) => service.generate(req.params.id, req.body ?? {})));
  app.get("/api/projects/:id/script", h((req) => service.store.scriptOf(req.params.id) ?? null));

  app.post("/api/scripts/:id/revisions", h((req) => service.proposeRevision(req.params.id, req.body)));
  app.post("/api/revisions/:id/apply", h((req) => service.applyRevision(req.params.id, req.body?.indexes)));
  app.post("/api/revisions/:id/reject", h((req) => service.rejectRevision(req.params.id)));
  app.put("/api/scripts/:id/scenes/:sceneId", h((req) => service.manualEdit(req.params.id, req.params.sceneId, req.body.caseId, req.body.style, String(req.body.text ?? ""))));
  app.post("/api/scripts/:id/scenes/:sceneId/status", h((req) => service.setSceneStatus(req.params.id, req.params.sceneId, req.body.status)));
  app.post("/api/scripts/:id/revert", h((req) => service.revert(req.params.id, Number(req.body.version))));
  app.post("/api/scripts/:id/approve", h((req) => service.approveVersion(req.params.id, Number(req.body.version))));
  app.get("/api/scripts/:id/briefing", h((req) => service.briefing(req.params.id, req.query.version ? Number(req.query.version) : undefined)));
  app.get("/api/scripts/:id/compare", h((req) => service.compareVersions(req.params.id, Number(req.query.a), Number(req.query.b))));
  app.get("/api/scripts/:id/export.md", (req, res, next) => {
    try {
      const md = service.exportMarkdown(req.params.id, req.query.version ? Number(req.query.version) : undefined);
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="script-${req.params.id}.md"`);
      res.send(md);
    } catch (e) { next(e); }
  });

  app.get("/api/knowledge", h(() => service.store.data.knowledge));
  app.post("/api/knowledge", h((req) => service.upsertKnowledge(req.body)));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err instanceof AiUnavailableError) return res.status(503).json({ error: err.message });
    if (err instanceof AiOutputError) return res.status(502).json({ error: err.message });
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "AI APIのレート制限に達しました。しばらく待って再試行してください。" });
    if (err instanceof Anthropic.AuthenticationError) return res.status(502).json({ error: "AI APIの認証に失敗しました。APIキーを確認してください。" });
    if (err instanceof Anthropic.APIError) return res.status(502).json({ error: `AI APIエラー（${err.status ?? "接続"}）。再試行してください。` });
    console.error(err instanceof Error ? err.message : err); // 内容・キーはログに出さない
    res.status(500).json({ error: "サーバーエラーが発生しました" });
  });
  return app;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const dbFile = process.env.DATA_FILE || path.join(__dirname, "..", "data", "db.json");
  const ai: ScriptAi = new ClaudeScriptAi();
  const service = new Service(new Store(dbFile), ai);
  const port = Number(process.env.PORT || 3000);
  createApp(service).listen(port, () => {
    console.log(`スクリプト簡単作成AI: http://localhost:${port}  （AI: ${ai.enabled ? `有効 ${MODEL}` : "無効（DEMOモード）"}）`);
  });
}
