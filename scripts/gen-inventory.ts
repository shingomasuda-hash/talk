// docs/02-flow-inventory.md と docs/03-scene-coverage-matrix.md をコード上のフローモデルから生成する
// 実行: npm run gen:docs
import fs from "node:fs";
import { FLOWS, FLOW_DIFFERENCES } from "../src/domain/flowModel.js";
import { SCENES, FIELD_MAP } from "../src/domain/scenes.js";

const CLS: Record<string, string> = { S: "S 発話場面", D: "D 判断・条件", I: "I 情報取得結果", R: "R 結果・状態", N: "注記", F: "F 将来運用機能" };
const COV: Record<string, string> = { COVERED: "網羅", NO_SCRIPT_INTENDED: "意図的にスクリプト対象外", NEEDS_CONFIRMATION: "要確認" };
const one = (s: string) => s.replace(/\n/g, "").replace(/\|/g, "／");

let inv = `# 02. フロー一覧（有効2シートの場面・結果・条件）

> 自動生成：\`npm run gen:docs\`（元データ：\`src/domain/flowModel.ts\`／\`source/flow-extraction.json\`）。
> 図形ラベルは抽出データと完全一致することをテスト（tests/flowModel.test.ts）で保証している。
> 接続線は抽出時に方向が保証されないため、図の配置と業務上の意味から「前の状況→次の状況」を読解した。\`逆向き\` は抽出データの endpoint_a→b と逆に読解したもの。

## 2つのフローの違い

| 観点 | ①キーマン名なし | ②キーマン名あり |
|---|---|---|
${FLOW_DIFFERENCES.map((d) => `| ${d.topic} | ${d.a} | ${d.b} |`).join("\n")}
`;

for (const f of Object.values(FLOWS)) {
  const byId = new Map(f.nodes.map((n) => [n.shapeId, n]));
  const lab = (id: string) => one(byId.get(id)?.label ?? id);
  // ツリー表示
  const children = (id: string) => f.edges.filter((e) => e.from === id).map((e) => e.to);
  const lines: string[] = [];
  const walk = (id: string, depth: number, seen: Set<string>) => {
    const n = byId.get(id)!;
    lines.push(`${"  ".repeat(depth)}- [${n.cls}] ${id}「${one(n.label)}」${n.scenes.length ? ` → ${n.scenes.join(",")}` : ""}${seen.has(id) ? "（合流・既出）" : ""}`);
    if (seen.has(id)) return;
    seen.add(id);
    for (const c of children(id)) walk(c, depth + 1, seen);
  };
  walk(f.rootShapeId, 0, new Set());
  const notes = f.nodes.filter((n) => n.cls === "N" || (n.cls === "F" && !f.edges.some((e) => e.to === n.shapeId)));
  inv += `
## ${f.sheetName}（図形 ${f.nodes.length}件／接続線 ${f.edges.length}件）

${f.description}

### 分岐ツリー（読解後）

${lines.join("\n")}

### 注記（接続線なし・配置で対象を判断）

${notes.map((n) => `- ${n.shapeId}「${one(n.label)}」→ 対象: ${n.parent ? `${n.parent}「${lab(n.parent)}」` : "シート全体"}｜${n.note}`).join("\n")}

### 接続線（読解済みの向き）

| コネクタ | 前の状況 | 次の状況 | 抽出データとの向き |
|---|---|---|---|
${f.edges.map((e) => `| ${e.connectorId} | ${e.from}「${lab(e.from)}」 | ${e.to}「${lab(e.to)}」 | ${e.reversed ? "逆向き" : "同じ"} |`).join("\n")}
`;
}
fs.writeFileSync("docs/02-flow-inventory.md", inv);

let cov = `# 03. 場面網羅マトリクス

> 自動生成：\`npm run gen:docs\`。分類：S=発話場面（台本生成）／D=判断・条件／I=情報取得結果／R=結果・状態（原則台本化しない）／F=将来運用機能／注記。
> **全図形について「網羅／意図的にスクリプト対象外／要確認」を記録**している。「全図形にセリフを作る」ことは目的ではない。

## A. 図形 → 分類・関連場面

`;
for (const f of Object.values(FLOWS)) {
  const byId = new Map(f.nodes.map((n) => [n.shapeId, n]));
  const counts: Record<string, number> = {};
  for (const n of f.nodes) counts[n.coverage] = (counts[n.coverage] ?? 0) + 1;
  cov += `### ${f.sheetName}（${Object.entries(counts).map(([k, v]) => `${COV[k]} ${v}`).join("／")}）

| 図形ID | ラベル | 分類 | 前の状況 | 関連場面 | 網羅状況 | 扱い・理由 |
|---|---|---|---|---|---|---|
${f.nodes.map((n) => `| ${n.shapeId} | ${one(n.label)} | ${CLS[n.cls]} | ${n.parent ? one(byId.get(n.parent)?.label ?? "") : ""} | ${n.scenes.join(", ") || "—"} | ${COV[n.coverage]} | ${n.note} |`).join("\n")}

`;
}
cov += `## B. 発話場面 → 必要入力・ケース・元図形・参照ノウハウ

| 場面 | 名称 | 対象フロー | 話し相手 | 必須入力 | 任意入力 | ケース（元図形 ①／②） | 参照ノウハウ |
|---|---|---|---|---|---|---|---|
${SCENES.map((s) => `| ${s.sceneId} | ${s.title} | ${s.scope} | ${s.speaker} | ${s.requiredInputs.map((k) => FIELD_MAP[k].label).join("、") || "—"} | ${s.optionalInputs.map((k) => FIELD_MAP[k].label).join("、") || "—"} | ${s.cases.map((c) => `${c.label}（${c.sourceNodes.NO_KEYMAN_NAME?.join(",") ?? "—"}／${c.sourceNodes.HAS_KEYMAN_NAME?.join(",") ?? "—"}）${c.noRecontact ? "※再勧誘禁止" : ""}`).join("<br>")} | 承認済みノウハウ未登録（AI提案扱い）${s.openQuestions.length ? "<br>要確認: " + s.openQuestions.join("／") : ""} |`).join("\n")}
`;
fs.writeFileSync("docs/03-scene-coverage-matrix.md", cov);
console.log("docs/02, docs/03 を生成しました");
