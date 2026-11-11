/**
 * 最小の永続化。サーバーでは JSON ファイル（data/db.json、単一プロセス前提）、
 * 公開デモ（ブラウザ版）では onSave で localStorage に保存する。
 * fs/path はファイルモードでしか使わない（ブラウザ版のビルドでは空のスタブに置き換える）。
 */
import fs from "node:fs";
import path from "node:path";
import type { KnowledgeEntry, Project, RevisionProposal, Script } from "./domain/types.js";
import { SEED_KNOWLEDGE, SEED_ORIGINAL_AT } from "./domain/knowledgeSeed.js";

export interface Db {
  projects: Project[];
  scripts: Script[];
  proposals: RevisionProposal[];
  knowledge: KnowledgeEntry[];
}

export interface StoreOptions {
  /** 保存済みデータ（ブラウザ版で localStorage から読んだもの） */
  initial?: Partial<Db> | null;
  /** 保存のたびに呼ばれる（ブラウザ版の保存先） */
  onSave?: (db: Db) => void;
}

export class Store {
  private db: Db;
  constructor(private file: string | null, private opts: StoreOptions = {}) {
    this.db = { projects: [], scripts: [], proposals: [], knowledge: structuredClone(SEED_KNOWLEDGE) };
    let loaded: Partial<Db> | null = opts.initial ?? null;
    if (!loaded && file && fs.existsSync(file)) loaded = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<Db>;
    if (loaded) {
      this.db = { ...this.db, ...loaded };
      // 後から追加された初期ナレッジを既存データにも足す（既存の編集内容は上書きしない）
      for (const k of SEED_KNOWLEDGE) {
        const cur = this.db.knowledge.find((x) => x.id === k.id);
        if (!cur) this.db.knowledge.push(structuredClone(k));
        // 初期値のまま（ユーザー未編集）の項目は、承認などの更新を反映する
        else if (cur.updatedAt === SEED_ORIGINAL_AT && k.updatedAt !== SEED_ORIGINAL_AT) Object.assign(cur, structuredClone(k));
      }
    }
  }
  get data(): Db { return this.db; }
  save(): void {
    this.opts.onSave?.(this.db);
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.db, null, 2));
    fs.renameSync(tmp, this.file);
  }
  static id(prefix: string): string {
    const b = globalThis.crypto.getRandomValues(new Uint8Array(6));
    return `${prefix}_${[...b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
  }
  project(id: string) { return this.db.projects.find((p) => p.id === id); }
  scriptOf(projectId: string) { return this.db.scripts.find((s) => s.projectId === projectId); }
  script(id: string) { return this.db.scripts.find((s) => s.id === id); }
  proposal(id: string) { return this.db.proposals.find((p) => p.id === id); }
}
