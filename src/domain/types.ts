import type { FlowType } from "./flowModel.js";
import type { ProjectField } from "./scenes.js";

export type ReviewStatus = "CONFIRMED" | "AI_PROPOSAL" | "NEEDS_CONFIRMATION" | "DEMO";

export interface Answer {
  value: string | string[];
  status: "answered" | "unknown" | "skipped";
  updatedAt: string;
}

export interface SourceDocument {
  id: string;
  name: string;
  kind: "file" | "url" | "paste" | "existing_script" | "minutes";
  text: string; // 抽出済みテキスト（URLは未取得なら空）
  fetchStatus: "parsed" | "not_fetched" | "unsupported" | "pdf_for_ai";
  /** PDF（AIモードのときだけClaudeへ文書として渡す）。base64 */
  pdfBase64?: string;
  /** 資料の区分（議事録の指摘：基本的な商材理解と具体的なサービス資料を分けて読み込ませる） */
  category?: "product_basics" | "service_material" | "other";
  addedAt: string;
}

export interface Project {
  id: string;
  name: string;
  flowType: FlowType;
  answers: Partial<Record<ProjectField, Answer>>;
  documents: SourceDocument[];
  createdAt: string;
  updatedAt: string;
}

export interface Variant {
  style: "short" | "standard" | "supplement";
  text: string;
}

export interface ScriptCase {
  caseId: string;
  label: string;
  condition: string;
  intent: string;
  variants: Variant[];
}

export interface ScriptScene {
  sceneId: string;
  title: string;
  applicabilityConditions: string[];
  purpose: string;
  cases: ScriptCase[];
  avoid: string[];
  evidenceRefs: string[];
  uncertainties: string[];
  reviewStatus: ReviewStatus;
  generatedBy: "ai" | "demo" | "human";
  /** 生成時に参照した入力のスナップショット（条件変更の影響判定に使う） */
  inputSnapshot: Record<string, string>;
  qualityWarnings: string[];
  /** 形式・言い回しの参考にした既存スクリプト（案件名 vN） */
  referenceFrom?: string;
}

export interface ScriptVersion {
  version: number;
  createdAt: string;
  reason: string;
  scenes: ScriptScene[];
  changedScenes: string[];
  approved: boolean;
}

export interface Script {
  id: string;
  projectId: string;
  flowType: FlowType;
  versions: ScriptVersion[];
  openQuestions: string[];
}

export interface RevisionChange {
  sceneId: string;
  caseId: string;
  style: Variant["style"];
  before: string;
  after: string;
  reason: string;
}

export interface RevisionProposal {
  id: string;
  scriptId: string;
  baseVersion: number;
  instruction: string;
  targetScenes: string[];
  changes: RevisionChange[];
  impactNotes: string[];
  generatedBy: "ai" | "demo";
  status: "pending" | "applied" | "rejected";
  createdAt: string;
}

export interface KnowledgeEntry {
  id: string;
  sceneIds: string[];
  principle: string;
  reason: string;
  conditions: string;
  exceptions: string;
  exampleTalk: string;
  source: string;
  status: ReviewStatus;
  updatedAt: string;
}
