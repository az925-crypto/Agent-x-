// ─── Types ────────────────────────────────────────────────────────

export type LogType =
  | 'start'     // ● label  detail
  | 'progress'  // │  msg
  | 'done'      // ✓ result (Xs)
  | 'fail'      // ✗ error (Xs)
  | 'stream'    // ▸ AI text (completed)
  | 'text'      // plain text
  | 'divider'   // ┌─ Header ─┐
  | 'blank';    // empty line

export interface LogEntry {
  id: string;
  type: LogType;
  label?: string;
  detail?: string;
  elapsed?: number;
  content?: string;
  color?: string;
  dim?: boolean;
}

export interface TaskCtx {
  progress: (msg: string) => void;
  done: (result?: string) => void;
  fail: (err: string) => void;
  elapsed: () => number;
}

export interface ConfirmReq {
  message: string;
  resolve: (val: boolean) => void;
}

// ─── Investigation UI Types ──────────────────────────────────────

export type InvestStatus = 'idle' | 'investigating' | 'completed';

export interface InvestEntry {
  time: string;
  tag: string;
  color: string;
  msg: string;
}

export interface InvestTool {
  name: string;
  dur: string;
  active: boolean;
}

export interface InvestFinding {
  label: string;
  pct: number;
  color: string;
}

export interface InvestTreeLine {
  txt: string;
  color: string;
  depth: number;
}

export interface InvestGraphNode {
  id: string;
  label: string;
  type: 'target' | 'social' | 'network' | 'finding';
  color: string;
  parentId: string | null;
}

export interface InvestGraphEdge {
  from: string;
  to: string;
  label?: string;
}
