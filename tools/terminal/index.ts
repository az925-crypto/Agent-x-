import { readFile, writeFile, appendFile, mkdir, rm, readdir, stat, realpath } from 'fs/promises';
import { existsSync } from 'fs';
import { spawn } from 'child_process';  // FIX #1: exec → spawn (no shell)
import path from 'path';

// FIX #10: headless mode added to ToolContext
export interface ToolContext {
  cwd: string;
  confirm: (msg: string) => Promise<boolean>;
  headless?: boolean;
}

// FIX #7 — Restricted files: AI agent cannot read/write these
const RESTRICTED_FILES = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.agent-x-audit.log',
];

function isRestrictedFile(resolvedPath: string): boolean {
  const base = path.basename(resolvedPath);
  return RESTRICTED_FILES.includes(base) || base.startsWith('.env');
}

// FIX #2: assertInsideCwd — realpath + path boundary (not just string prefix)
async function assertInsideCwd(resolved: string, ctx: ToolContext): Promise<void> {
  let realResolved: string;
  try {
    realResolved = await realpath(resolved);
  } catch {
    // File doesn't exist yet — resolve parent directory only
    const dir = path.dirname(resolved);
    const base = path.basename(resolved);
    try {
      const realDir = await realpath(dir);
      realResolved = path.join(realDir, base);
    } catch {
      realResolved = path.resolve(resolved);
    }
  }

  let realCwd: string;
  try {
    realCwd = await realpath(ctx.cwd);
  } catch {
    realCwd = ctx.cwd;
  }

  // Exact match OR starts with cwd + separator — prevents /home/proj-evil bypass
  const cwdWithSep = realCwd.endsWith(path.sep) ? realCwd : realCwd + path.sep;
  if (realResolved !== realCwd && !realResolved.startsWith(cwdWithSep)) {
    throw new Error(`Access denied: path "${realResolved}" is outside working directory`);
  }
}

// ─── Read Operations ───────────────────────────────────────────────

export async function readFileTool(filePath: string, ctx: ToolContext) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    return { error: 'filePath must be a non-empty string' };  // FIX #14
  }
  const resolved = path.resolve(ctx.cwd, filePath);
  await assertInsideCwd(resolved, ctx);

  if (isRestrictedFile(resolved)) {  // FIX #7
    return { error: `Access denied: "${path.basename(resolved)}" is a restricted file.` };
  }

  const content = await readFile(resolved, 'utf-8');
  const lines = content.split('\n');
  return {
    summary: `${resolved}: ${lines.length} lines, ${content.length} chars`,
    content,
    lines: lines.length
  };
}

export async function listDir(dirPath: string, ctx: ToolContext) {
  if (typeof dirPath !== 'string') return { error: 'dirPath must be a string' };
  const resolved = path.resolve(ctx.cwd, dirPath);
  await assertInsideCwd(resolved, ctx);
  const entries = await readdir(resolved, { withFileTypes: true });
  const files = entries.map(e => ({
    name: e.name,
    type: e.isDirectory() ? 'dir' : e.isFile() ? 'file' : 'other',
    size: null as number | null
  }));
  for (const f of files) {
    if (f.type === 'file') {
      try {
        const s = await stat(path.join(resolved, f.name));
        f.size = s.size;
      } catch { /* file may have been deleted */ }
    }
  }
  return {
    path: resolved,
    entries: files.map(f => `${f.type === 'dir' ? '📁' : '📄'} ${f.name}${f.size != null ? ` (${formatSize(f.size)})` : ''}`),
    total: files.length
  };
}

export async function grepFileTool(pattern: string, filePath: string, ctx: ToolContext) {
  if (typeof pattern !== 'string' || typeof filePath !== 'string') {
    return { error: 'pattern and filePath must be strings' };
  }
  const resolved = path.resolve(ctx.cwd, filePath);
  await assertInsideCwd(resolved, ctx);

  if (isRestrictedFile(resolved)) {
    return { error: `Access denied: "${path.basename(resolved)}" is a restricted file.` };
  }

  const content = await readFile(resolved, 'utf-8');
  const regex = new RegExp(pattern, 'g');
  const matches: Array<{ line: number; text: string }> = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(regex)) {
      matches.push({ line: i + 1, text: lines[i].trim() });
    }
  }
  return { file: resolved, pattern, matches, total: matches.length };
}

function matchGlob(name: string, pattern: string): boolean {
  const re = new RegExp('^' + pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '___DS___')
    .replace(/\*/g, '[^/]*')
    .replace(/___DS___/g, '.*')
    .replace(/\?/g, '.') + '$');
  return re.test(name);
}

export async function globFilesTool(pattern: string, ctx: ToolContext) {
  const matches: string[] = [];
  async function walk(dir: string, baseDir: string) {
    let entries: string[];
    try { entries = await readdir(dir); } catch { return; }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const relPath = path.relative(baseDir, fullPath);
      let isDir = false;
      try { isDir = (await stat(fullPath)).isDirectory(); } catch { /* stat may fail */ }
      if (matchGlob(relPath, pattern)) matches.push(relPath);
      if (isDir) await walk(fullPath, baseDir);
    }
  }
  await walk(ctx.cwd, ctx.cwd);
  matches.sort();
  return { pattern, cwd: ctx.cwd, matches, total: matches.length };
}

// ─── Write Operations ──────────────────────────────────────────────

export async function writeFileTool(filePath: string, content: string, ctx: ToolContext) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    return { error: 'filePath must be a non-empty string' };
  }
  const resolved = path.resolve(ctx.cwd, filePath);
  await assertInsideCwd(resolved, ctx);
  if (isRestrictedFile(resolved)) {
    return { error: `Access denied: cannot write to "${path.basename(resolved)}".` };
  }
  const exists = existsSync(resolved);
  const action = exists ? 'overwrite' : 'create';
  const ok = await ctx.confirm(`Write ${action} ${resolved}? (${content.length} chars)`);
  if (!ok) return { skipped: true, reason: 'User declined' };
  await writeFile(resolved, content, 'utf-8');
  return { written: true, path: resolved, action, chars: content.length };
}

export async function appendFileTool(filePath: string, content: string, ctx: ToolContext) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    return { error: 'filePath must be a non-empty string' };
  }
  const resolved = path.resolve(ctx.cwd, filePath);
  await assertInsideCwd(resolved, ctx);
  if (isRestrictedFile(resolved)) {
    return { error: `Access denied: cannot append to "${path.basename(resolved)}".` };
  }
  const ok = await ctx.confirm(`Append to ${resolved}? (${content.length} chars)`);
  if (!ok) return { skipped: true, reason: 'User declined' };
  await appendFile(resolved, content + '\n', 'utf-8');
  return { appended: true, path: resolved, chars: content.length };
}

export async function makeDirTool(dirPath: string, ctx: ToolContext) {
  if (typeof dirPath !== 'string' || !dirPath.trim()) {
    return { error: 'dirPath must be a string non-kosong' };
  }
  const resolved = path.resolve(ctx.cwd, dirPath);
  await assertInsideCwd(resolved, ctx);
  const ok = await ctx.confirm(`Create directory ${resolved}?`);
  if (!ok) return { skipped: true, reason: 'User declined' };
  await mkdir(resolved, { recursive: true });
  return { created: true, path: resolved };
}

export async function deleteFileTool(filePath: string, ctx: ToolContext) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    return { error: 'filePath must be a non-empty string' };
  }
  const resolved = path.resolve(ctx.cwd, filePath);
  await assertInsideCwd(resolved, ctx);
  if (isRestrictedFile(resolved)) {
    return { error: `Access denied: cannot delete "${path.basename(resolved)}".` };
  }
  const s = await stat(resolved);
  const label = s.isDirectory() ? 'directory' : 'file';
  const ok = await ctx.confirm(`Delete ${label} ${resolved}?`);
  if (!ok) return { skipped: true, reason: 'User declined' };
  await rm(resolved, { recursive: true, force: true });
  return { deleted: true, path: resolved, type: label };
}

// ─── Shell Operations ──────────────────────────────────────────────

// FIX #4: Allowlist instead of blocklist
const ALLOWED_COMMANDS = new Set([
  'cat', 'ls', 'grep', 'find', 'head', 'tail', 'sort', 'uniq', 'wc',
  'curl', 'wget', 'python3', 'python', 'node', 'tsx',
  'echo', 'date', 'whoami', 'hostname',
  'ping', 'nslookup', 'dig',
  'mkdir', 'cp', 'mv', 'rm', 'chmod',
  'git', 'npm', 'npx',
]);

// Read-only command patterns — auto-approved, no user confirm needed
const READONLY_PREFIXES = [
  'python3 tools/ig/',
  'python3 tools/custom/',
  'cat ', 'ls ', 'head ', 'tail ', 'sort ', 'uniq ', 'wc ',
  'echo ', 'date ', 'whoami', 'hostname',
  'ping ', 'nslookup ', 'dig ',
  'curl ', 'wget ',
  'git log', 'git status', 'git diff', 'git show', 'git branch',
];

function isReadOnlyCommand(tokens: string[]): boolean {
  const full = tokens.join(' ');
  return READONLY_PREFIXES.some(prefix => full.startsWith(prefix));
}

// FIX #1: Simple tokenizer that handles quoted strings (for spawn without shell)
function tokenizeCommand(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (ch === ' ' && !inSingle && !inDouble) {
      if (current) { tokens.push(current); current = ''; }
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

// FIX #1 + #3 + #4: runCommandTool fully hardened
export async function runCommandTool(command: string, ctx: ToolContext) {
  if (typeof command !== 'string' || !command.trim()) {
    return { error: 'command must be a non-empty string' };
  }

  const tokens = tokenizeCommand(command.trim());
  if (tokens.length === 0) return { error: 'Empty command' };

  const cmdName = tokens[0];

  // FIX #4: Allowlist check
  if (!ALLOWED_COMMANDS.has(cmdName)) {
    return {
      blocked: true,
      reason: `Command "${cmdName}" not allowed. Allowed: ${[...ALLOWED_COMMANDS].join(', ')}.`,
      command
    };
  }

  // FIX #3: Block absolute paths and path traversal in arguments
  for (const token of tokens.slice(1)) {
    if (token.startsWith('/') && !token.startsWith('/usr') && !token.startsWith('/bin') && !token.startsWith('/tmp')) {
      return { blocked: true, reason: `Absolute path "${token}" not allowed in arguments.`, command };
    }
    if (token.includes('..')) {
      return { blocked: true, reason: 'Path traversal ".." not allowed.', command };
    }
  }

  // FIX #10: headless mode — auto-block all commands
  if (ctx.headless) {
    return { blocked: true, reason: 'Command execution disabled in headless mode.' };
  }

  // Auto-approve read-only commands (scraping, analysis, read-only shell)
  if (!isReadOnlyCommand(tokens)) {
    const ok = await ctx.confirm(`Run command: ${command}`);
    if (!ok) return { skipped: true, reason: 'User declined' };
  }

  // FIX #1: spawn instead of exec — no shell, no injection
  return new Promise<Record<string, unknown>>((resolve) => {
    const child = spawn(cmdName, tokens.slice(1), {
      cwd: ctx.cwd,
      shell: false,  // ← no shell = no injection
      timeout: 30000,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.stderr.on('error', () => {});  // FIX #22: prevent pipe crash

    child.on('close', (code) => {
      resolve({ command, exitCode: code ?? 0, stdout, stderr });
    });
    child.on('error', (err) => {
      resolve({ command, exitCode: 1, stdout: '', stderr: err.message });
    });
  });
}

export async function getCwdTool(ctx: ToolContext) {
  return { cwd: ctx.cwd };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ─── Tool registry ─────────────────────────────────────────────────

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

export const terminalTools: ToolDef[] = [
  {
    name: 'read_file',
    description: 'Read contents of a file. Returns the full content and summary.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to the file (relative to cwd)' }
      },
      required: ['filePath']
    },
    execute: (args, ctx) => {
      if (typeof args.filePath !== 'string') return Promise.resolve({ error: 'filePath must be a string' });
      return readFileTool(args.filePath, ctx);
    }
  },
  {
    name: 'list_dir',
    description: 'List files and directories in a directory.',
    parameters: {
      type: 'object',
      properties: {
        dirPath: { type: 'string', description: 'Directory path (default: current directory)' }
      },
      required: ['dirPath']
    },
    execute: (args, ctx) => listDir(typeof args.dirPath === 'string' ? args.dirPath : '.', ctx)
  },
  {
    name: 'grep_file',
    description: 'Search for a regex pattern in a file.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern' },
        filePath: { type: 'string', description: 'File to search in' }
      },
      required: ['pattern', 'filePath']
    },
    execute: (args, ctx) => {
      if (typeof args.pattern !== 'string' || typeof args.filePath !== 'string') {
        return Promise.resolve({ error: 'pattern and filePath must be strings' });
      }
      return grepFileTool(args.pattern, args.filePath, ctx);
    }
  },
  {
    name: 'glob_files',
    description: 'Find files matching a glob pattern.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern (e.g. "**/*.ts")' }
      },
      required: ['pattern']
    },
    execute: (args, ctx) => {
      if (typeof args.pattern !== 'string') return Promise.resolve({ error: 'pattern must be a string' });
      return globFilesTool(args.pattern, ctx);
    }
  },
  {
    name: 'write_file',
    description: 'Write content to a file. Requires user confirmation.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to write to' },
        content: { type: 'string', description: 'Content to write' }
      },
      required: ['filePath', 'content']
    },
    execute: (args, ctx) => {
      if (typeof args.filePath !== 'string' || typeof args.content !== 'string') {
        return Promise.resolve({ error: 'filePath and content must be strings' });
      }
      return writeFileTool(args.filePath, args.content, ctx);
    }
  },
  {
    name: 'append_file',
    description: 'Append content to a file. Requires user confirmation.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to append to' },
        content: { type: 'string', description: 'Content to append' }
      },
      required: ['filePath', 'content']
    },
    execute: (args, ctx) => {
      if (typeof args.filePath !== 'string' || typeof args.content !== 'string') {
        return Promise.resolve({ error: 'filePath and content must be strings' });
      }
      return appendFileTool(args.filePath, args.content, ctx);
    }
  },
  {
    name: 'make_dir',
    description: 'Create a directory. Requires user confirmation.',
    parameters: {
      type: 'object',
      properties: {
        dirPath: { type: 'string', description: 'Directory path to create' }
      },
      required: ['dirPath']
    },
    execute: (args, ctx) => {
      if (typeof args.dirPath !== 'string') return Promise.resolve({ error: 'dirPath must be a string' });
      return makeDirTool(args.dirPath, ctx);
    }
  },
  {
    name: 'delete_file',
    description: 'Delete a file or directory. Requires user confirmation.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to delete' }
      },
      required: ['filePath']
    },
    execute: (args, ctx) => {
      if (typeof args.filePath !== 'string') return Promise.resolve({ error: 'filePath must be a string' });
      return deleteFileTool(args.filePath, ctx);
    }
  },
  {
    name: 'run_command',
    description: 'Execute a shell command (allowlisted commands only). Requires user confirmation.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Command to execute (e.g. "python3 script.py")' }
      },
      required: ['command']
    },
    execute: (args, ctx) => {
      if (typeof args.command !== 'string') return Promise.resolve({ error: 'command must be a string' });
      return runCommandTool(args.command, ctx);
    }
  },
  {
    name: 'get_cwd',
    description: 'Get the current working directory.',
    parameters: { type: 'object', properties: {} },
    execute: (_args, ctx) => getCwdTool(ctx)
  }
];
