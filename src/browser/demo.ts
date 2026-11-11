/**
 * 公開デモ（ブラウザだけで動く版）。サーバーの代わりに、同じサービス層とルート表をブラウザ内で動かす。
 * - AIは使わない（DEMOテンプレート生成・規則ベース修正のみ）。
 * - データは閲覧者のブラウザ（localStorage）にのみ保存。取得できない環境でもメモリ上で動く。
 */
import { Store, type Db } from "../store.js";
import { HttpError, Service } from "../service.js";
import { dispatch, type FlowLayout } from "../routes.js";
import type { ScriptAi } from "../ai/claude.js";
import layout from "../../source/flow-layout.json";

const KEY = "script-ai-demo-db-v1";
let initial: Partial<Db> | null = null;
try { const raw = localStorage.getItem(KEY); if (raw) initial = JSON.parse(raw); } catch { initial = null; }

const noAi: ScriptAi = {
  enabled: false,
  generateScene: async () => { throw new HttpError(503, "公開デモではAI生成は使えません"); },
  revise: async () => { throw new HttpError(503, "公開デモではAI修正は使えません"); },
};
const store = new Store(null, {
  initial,
  onSave: (db) => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* 保存できない環境ではメモリのみ */ } },
});
const service = new Service(store, noAi);
const ctx = { service, layout: layout as unknown as FlowLayout, model: null, staticDemo: true };

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
  if (!url.pathname.startsWith("/api/")) return realFetch(input, init);
  const method = (init?.method || "GET").toUpperCase();
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  try {
    const out = await dispatch(ctx, { method, path: url.pathname, query: Object.fromEntries(url.searchParams), body });
    if ("text" in out) return new Response(out.text, { status: 200, headers: { "Content-Type": out.contentType } });
    return new Response(JSON.stringify(out.json), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    const msg = e instanceof HttpError ? e.message : "エラーが発生しました";
    if (!(e instanceof HttpError)) console.warn(e);
    return new Response(JSON.stringify({ error: msg }), { status, headers: { "Content-Type": "application/json" } });
  }
};

/** デモのデータを消して最初からやり直す */
(window as unknown as { resetDemo: () => void }).resetDemo = () => {
  try { localStorage.removeItem(KEY); localStorage.removeItem("pid"); } catch { /* noop */ }
  location.reload();
};
