/** JSONファイルによる最小の永続化（data/db.json）。単一プロセス前提。 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { KnowledgeEntry, Project, RevisionProposal, Script } from "./domain/types.js";
import { SEED_KNOWLEDGE } from "./domain/knowledgeSeed.js";

export interface Db {
  projects: Project[];
  scripts: Script[];
  proposals: RevisionProposal[];
  knowledge: KnowledgeEntry[];
}

export class Store {
  private db: Db;
  constructor(private file: string | null) {
    this.db = { projects: [], scripts: [], proposals: [], knowledge: structuredClone(SEED_KNOWLEDGE) };
    if (file && fs.existsSync(file)) {
      const loaded = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<Db>;
      this.db = { ...this.db, ...loaded };
    }
  }
  get data(): Db { return this.db; }
  save(): void {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.db, null, 2));
    fs.renameSync(tmp, this.file);
  }
  static id(prefix: string): string { return `${prefix}_${crypto.randomBytes(6).toString("hex")}`; }
  project(id: string) { return this.db.projects.find((p) => p.id === id); }
  scriptOf(projectId: string) { return this.db.scripts.find((s) => s.projectId === projectId); }
  script(id: string) { return this.db.scripts.find((s) => s.id === id); }
  proposal(id: string) { return this.db.proposals.find((p) => p.id === id); }
}
