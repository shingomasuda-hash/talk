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

/** 初回はサンプル案件（①名なし・②名あり、架空の商材）を生成済みの状態で用意する */
const SAMPLE: Record<string, string | string[]> = {
  callerCompany: "株式会社サンプルHR（DEMO）", productName: "勤怠らくらくクラウド（DEMO商材）",
  productSummary: "中小企業の勤怠管理と給与計算の連携を自動化するクラウドサービスです。",
  valueProps: "打刻データを給与計算ソフトへ自動で連携できます。\n残業時間の上限超過を事前にお知らせします。",
  callReason: "来年4月の制度改定に向けて勤怠管理の見直しをされる企業様が増えているため。",
  goals: ["meeting", "materials"], targetDepartment: "人事部", targetRole: "勤怠管理のご担当者様", targetIndustry: "製造業・従業員50〜300名",
  materials: "サービス概要資料（PDF・8ページ）", meetingFormat: "オンラインで30分",
  hearingItems: "現在の勤怠管理の方法\n給与計算との連携で困っていること\n見直しの検討時期",
  emailContent: "サービス概要資料と、オンライン説明のご案内", ngExpressions: "業界No.1",
  operatorPoints: "料金を聞かれたら資料でご案内する（口頭で金額を言わない）\n「制度改定」は強調して話す",
  preCheckFacts: "求人サイトで勤怠管理・給与計算担当の募集を出しているかを確認し、募集中の企業には『担当の方を募集されていますよね』と切り出す",
};
export const sampleReady: Promise<void> = (async () => {
  if (store.data.projects.length) return;
  const a = service.createProject({ name: "【サンプル】勤怠SaaS 新規開拓（①名なし）", flowType: "NO_KEYMAN_NAME", answers: { ...SAMPLE, listOrigin: "new", contactStrength: "none" } });
  await service.generate(a.id);
  const b = service.createProject({ name: "【サンプル】勤怠SaaS 展示会来場者（②名あり）", flowType: "HAS_KEYMAN_NAME", answers: { ...SAMPLE, listOrigin: "exhibition", contactStrength: "weak", contactHistory: "2025年秋のHRテック展で名刺交換をした" } });
  await service.generate(b.id);
})();
const ctx = { service, layout: layout as unknown as FlowLayout, model: null, staticDemo: true };

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
  if (!url.pathname.startsWith("/api/")) return realFetch(input, init);
  await sampleReady;
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
