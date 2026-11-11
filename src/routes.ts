/**
 * API ルート表。Express サーバー（src/server.ts）と公開デモのブラウザ版（src/browser/demo.ts）で共用する。
 */
import { FLOWS, FLOW_DIFFERENCES, FLOW_LABEL, type FlowType } from "./domain/flowModel.js";
import { CHAPTERS, FIELDS, SCENES } from "./domain/scenes.js";
import { coverageFor } from "./domain/selection.js";
import { PRINCIPLE_MAPPINGS, SOURCE_MATERIALS, UNUSED_SHEET_DIFFS } from "./domain/sources.js";
import { HttpError, type Service } from "./service.js";

export interface FlowLayout {
  source_file: string;
  sheets: { sheet_name: string; shapes: unknown[]; connectors: unknown[] }[];
  excluded_sheets: unknown[];
}

export interface RouteContext {
  service: Service;
  layout: FlowLayout;
  model: string | null;
  /** ブラウザだけで動く公開デモ（データは閲覧者のブラウザに保存） */
  staticDemo?: boolean;
}

export interface RouteRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export type RouteResult = { json: unknown } | { text: string; contentType: string; filename?: string };

type Handler = (ctx: RouteContext, p: Record<string, string>, req: RouteRequest) => unknown;

const routes: [string, string, Handler][] = [
  ["GET", "/api/meta", (c) => ({
    aiEnabled: c.service.ai.enabled,
    model: c.service.ai.enabled ? c.model : null,
    staticDemo: !!c.staticDemo,
    flows: Object.values(FLOWS).map((f) => ({ flowType: f.flowType, sheetName: f.sheetName, shortName: f.shortName, description: f.description, nodeCount: f.nodes.length, edgeCount: f.edges.length })),
    differences: FLOW_DIFFERENCES,
    scenes: SCENES,
    chapters: CHAPTERS,
    fields: FIELDS,
  })],
  ["GET", "/api/flows/:flowType", (c, p) => {
    const f = FLOWS[p.flowType as FlowType];
    if (!f) throw new HttpError(404, "フローが見つかりません");
    const layout = c.layout.sheets.find((x) => x.sheet_name === f.sheetName);
    return { ...f, label: FLOW_LABEL[f.flowType], coverage: coverageFor(f.flowType), layout, layoutSource: c.layout.source_file };
  }],
  ["GET", "/api/sources", (c) => ({ materials: SOURCE_MATERIALS, principles: PRINCIPLE_MAPPINGS, excludedSheets: c.layout.excluded_sheets, unusedDiffs: UNUSED_SHEET_DIFFS })],
  ["GET", "/api/projects", (c) => c.service.store.data.projects.map((p) => ({ id: p.id, name: p.name, flowType: p.flowType, updatedAt: p.updatedAt, hasScript: !!c.service.store.scriptOf(p.id) }))],
  ["POST", "/api/projects", (c, _p, r) => c.service.createProject(r.body)],
  ["GET", "/api/projects/:id", (c, p) => c.service.analysis(p.id)],
  ["PUT", "/api/projects/:id", (c, p, r) => c.service.updateProject(p.id, r.body)],
  ["POST", "/api/projects/:id/duplicate", (c, p, r) => c.service.duplicateProject(p.id, r.body ?? {})],
  ["POST", "/api/projects/:id/documents", (c, p, r) => c.service.addDocument(p.id, r.body)],
  ["DELETE", "/api/projects/:id/documents/:docId", (c, p) => c.service.removeDocument(p.id, p.docId)],
  ["POST", "/api/projects/:id/generate", (c, p, r) => c.service.generate(p.id, r.body ?? {})],
  ["GET", "/api/projects/:id/script", (c, p) => c.service.store.scriptOf(p.id) ?? null],
  ["POST", "/api/scripts/:id/revisions", (c, p, r) => c.service.proposeRevision(p.id, r.body)],
  ["POST", "/api/revisions/:id/apply", (c, p, r) => c.service.applyRevision(p.id, r.body?.indexes)],
  ["POST", "/api/revisions/:id/reject", (c, p) => c.service.rejectRevision(p.id)],
  ["PUT", "/api/scripts/:id/scenes/:sceneId", (c, p, r) => c.service.manualEdit(p.id, p.sceneId, r.body.caseId, r.body.style, String(r.body.text ?? ""))],
  ["POST", "/api/scripts/:id/scenes/:sceneId/status", (c, p, r) => c.service.setSceneStatus(p.id, p.sceneId, r.body.status)],
  ["POST", "/api/scripts/:id/revert", (c, p, r) => c.service.revert(p.id, Number(r.body.version))],
  ["POST", "/api/scripts/:id/approve", (c, p, r) => c.service.approveVersion(p.id, Number(r.body.version))],
  ["GET", "/api/scripts/:id/briefing", (c, p, r) => c.service.briefing(p.id, r.query.version ? Number(r.query.version) : undefined)],
  ["GET", "/api/scripts/:id/compare", (c, p, r) => c.service.compareVersions(p.id, Number(r.query.a), Number(r.query.b))],
  ["GET", "/api/scripts/:id/export.md", (c, p, r) => ({
    __text: c.service.exportMarkdown(p.id, r.query.version ? Number(r.query.version) : undefined),
    __filename: `script-${p.id}.md`,
  })],
  ["GET", "/api/knowledge", (c) => c.service.store.data.knowledge],
  ["POST", "/api/knowledge", (c, _p, r) => c.service.upsertKnowledge(r.body)],
];

const compiled = routes.map(([method, pattern, fn]) => {
  const keys: string[] = [];
  const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_m, k) => { keys.push(k); return "([^/]+)"; }).replace(/\./g, "\\.") + "$");
  return { method, re, keys, fn };
});

export async function dispatch(ctx: RouteContext, req: RouteRequest): Promise<RouteResult> {
  for (const r of compiled) {
    if (r.method !== req.method.toUpperCase()) continue;
    const m = r.re.exec(req.path);
    if (!m) continue;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    const out = (await r.fn(ctx, params, req)) as unknown;
    if (out && typeof out === "object" && "__text" in out) {
      const t = out as { __text: string; __filename: string };
      return { text: t.__text, contentType: "text/markdown; charset=utf-8", filename: t.__filename };
    }
    return { json: out === undefined ? { ok: true } : out };
  }
  throw new HttpError(404, "APIが見つかりません");
}
