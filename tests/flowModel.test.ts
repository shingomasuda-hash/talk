import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { FLOWS } from "../src/domain/flowModel.js";
import { SCENES, SCENE_MAP } from "../src/domain/scenes.js";

const extraction = JSON.parse(fs.readFileSync(new URL("../source/flow-extraction.json", import.meta.url), "utf8"));

describe("フロー読解と抽出データの整合", () => {
  for (const flow of Object.values(FLOWS)) {
    const sheet = extraction.sheets.find((s: { sheet_name: string }) => s.sheet_name === flow.sheetName);
    it(`${flow.sheetName}: 全図形を1回ずつ、ラベル一致で分類している`, () => {
      expect(sheet).toBeTruthy();
      const ids = flow.nodes.map((n) => n.shapeId);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.sort()).toEqual(sheet.nodes.map((n: { shape_id: string }) => n.shape_id).sort());
      for (const n of sheet.nodes) expect(flow.nodes.find((x) => x.shapeId === n.shape_id)!.label).toBe(n.label);
    });
    it(`${flow.sheetName}: 全接続線を方向読解済みで保持（端点集合が一致）`, () => {
      expect(flow.edges.length).toBe(sheet.connections.length);
      for (const c of sheet.connections) {
        const e = flow.edges.find((x) => x.connectorId === c.connector_id)!;
        expect(e, c.connector_id).toBeTruthy();
        expect([e.from, e.to].sort()).toEqual([c.endpoint_a_shape_id, c.endpoint_b_shape_id].sort());
        expect(e.reversed).toBe(e.from !== c.endpoint_a_shape_id);
      }
    });
    it(`${flow.sheetName}: 根から全ての非注記図形に到達できる`, () => {
      const reach = new Set([flow.rootShapeId]);
      let changed = true;
      while (changed) { changed = false; for (const e of flow.edges) if (reach.has(e.from) && !reach.has(e.to)) { reach.add(e.to); changed = true; } }
      const unreached = flow.nodes.filter((n) => !["N", "F"].includes(n.cls) && !reach.has(n.shapeId)).map((n) => n.shapeId);
      expect(unreached).toEqual([]);
    });
    it(`${flow.sheetName}: 図形が参照する場面はカタログに存在し、そのフローの場面である`, () => {
      for (const n of flow.nodes) for (const s of n.scenes) {
        expect(SCENE_MAP[s], s).toBeTruthy();
        expect(SCENE_MAP[s].flows).toContain(flow.flowType);
      }
    });
  }
  it("全図形数96・接続線数89（指示書記載と一致）", () => {
    expect(FLOWS.NO_KEYMAN_NAME.nodes.length + FLOWS.HAS_KEYMAN_NAME.nodes.length).toBe(96);
    expect(FLOWS.NO_KEYMAN_NAME.edges.length + FLOWS.HAS_KEYMAN_NAME.edges.length).toBe(89);
  });
  it("場面カタログのケースが参照する図形は実在する", () => {
    for (const s of SCENES) for (const c of s.cases) for (const [ft, ids] of Object.entries(c.sourceNodes)) {
      expect(s.flows).toContain(ft);
      for (const id of ids!) expect(FLOWS[ft as keyof typeof FLOWS].nodes.some((n) => n.shapeId === id), `${s.sceneId}/${c.caseId}/${id}`).toBe(true);
    }
  });
});
