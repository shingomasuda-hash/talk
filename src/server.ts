import express, { type NextFunction, type Request, type Response } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { Store } from "./store.js";
import { ClaudeScriptAi, MODEL, AiOutputError, AiUnavailableError, type ScriptAi } from "./ai/claude.js";
import { HttpError, Service } from "./service.js";
import { dispatch, type FlowLayout, type RouteContext } from "./routes.js";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LAYOUT = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "source", "flow-layout.json"), "utf8")) as FlowLayout;

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

  const ctx: RouteContext = { service, layout: LAYOUT, model: MODEL };
  app.all(/^\/api\//, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const out = await dispatch(ctx, { method: req.method, path: req.path, query: req.query as Record<string, string>, body: req.body });
      if ("text" in out) {
        res.setHeader("Content-Type", out.contentType);
        if (out.filename) res.setHeader("Content-Disposition", `attachment; filename="${out.filename}"`);
        res.send(out.text);
      } else res.json(out.json);
    } catch (e) { next(e); }
  });

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
