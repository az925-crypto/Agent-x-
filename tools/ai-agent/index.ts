import type { AIClient } from './provider';
import { terminalTools, type ToolDef, type ToolContext } from '../terminal/index';
import { runIG, runScan, runSherlock, runIGMedia, runIGDownload, runIGFollowers, runIGFollowing } from '../orchestrator';
import { SYSTEM_PROMPT } from './shared';
import { addMemory, queryMemories, getMemoryStats } from './memory';
import { appendFile, mkdir } from 'fs/promises';
import path from 'path';
import os from 'os';

// FIX #5: Audit log outside cwd — not readable by agent
const AUDIT_DIR = path.join(os.tmpdir(), '.agent-x');
const AUDIT_LOG = path.join(AUDIT_DIR, 'audit.log');

const MAX_HISTORY_LENGTH  = 100;
const MAX_HISTORY_TOKENS  = 100_000;
const DESTRUCTIVE_LIMIT   = 5;
const DESTRUCTIVE_WINDOW_MS = 60_000;

// FIX #9: Total session timeout — increased because IG tools can take 5+ min
const SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes

interface ToolFn {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

type ToolErrorType = 'rate_limit' | 'timeout' | 'not_found' | 'auth_error' | 'unknown';

function classifyError(e: unknown): { type: ToolErrorType; message: string } {
  const msg = e instanceof Error ? e.message : String(e);
  const lower = msg.toLowerCase();
  if (lower.includes('rate limit') || lower.includes('too many requests')) return { type: 'rate_limit', message: msg };
  if (lower.includes('timeout') || lower.includes('timed out'))            return { type: 'timeout',    message: msg };
  if (lower.includes('not found') || lower.includes('404'))                return { type: 'not_found',  message: msg };
  if (lower.includes('auth') || lower.includes('login') || lower.includes('unauthorized')) return { type: 'auth_error', message: msg };
  return { type: 'unknown', message: msg };
}

// FIX #9: toolName param → fewer retries for ig_ tools (prone to timeout)
async function withRetry<T>(fn: () => Promise<T>, toolName?: string): Promise<T> {
    const maxRetries = toolName?.startsWith('ig_') ? 2 : 1;
  let lastErr: unknown;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const err = classifyError(e);
      if (err.type !== 'rate_limit' && err.type !== 'timeout') break;
      if (i < maxRetries) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastErr;
}

// FIX #5: Mask sensitive fields before logging
function sanitizeAuditArgs(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
  const safe = { ...args };
  const MASK_FIELDS: Record<string, string[]> = {
    write_file:  ['content'],
    append_file: ['content'],
  };
  for (const key of (MASK_FIELDS[toolName] || [])) {
    if (key in safe) {
      const val = String(safe[key]);
      safe[key] = `[${val.length} chars]`;
    }
  }
  return safe;
}

async function logAudit(entry: Record<string, unknown>) {
  try {
    await mkdir(AUDIT_DIR, { recursive: true });
    await appendFile(AUDIT_LOG, JSON.stringify({ ts: Date.now(), ...entry }) + '\n', 'utf-8');
  } catch (err) { console.error('[Audit] write failed:', err); }
}

const osintTools: ToolFn[] = [
  {
    name: 'ig_profile',
    description: 'Instagram profile analysis via instagrapi. Returns profile, followers, following.',
    parameters: {
      type: 'object',
      properties: {
        username:       { type: 'string', description: 'Instagram username' },
        followersLimit: { type: 'number', description: 'Max followers count (optional)' },
        followingLimit: { type: 'number', description: 'Max following count (optional)' }
      },
      required: ['username']
    },
    execute: async (args) => {
      // FIX #14: type guards
      const username = typeof args.username === 'string' ? args.username : '';
      if (!username) return { error: 'username must be a non-empty string' };
      const followersLimit = typeof args.followersLimit === 'number' ? args.followersLimit : undefined;
      const followingLimit = typeof args.followingLimit === 'number' ? args.followingLimit : undefined;
      const result = await runIG(username);
      const data = (result as { data?: Record<string, unknown> }).data;
      if (data) {
        if (followersLimit && Array.isArray(data.followerList) && data.followerList.length > followersLimit) {
          data.followerList = data.followerList.slice(0, followersLimit);
        }
        if (followingLimit && Array.isArray(data.followingList) && data.followingList.length > followingLimit) {
          data.followingList = data.followingList.slice(0, followingLimit);
        }
      }
      return result;
    }
  },
  {
    name: 'scan',
    description: 'DNS/GeoIP scan for domain, IP, or email.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Target (domain, IP, or email)' }
      },
      required: ['target']
    },
    execute: async (args) => {
      if (typeof args.target !== 'string' || !args.target.trim()) {
        return { error: 'target must be a non-empty string' };
      }
      return runScan(args.target);
    }
  },
  {
    name: 'ig_media',
    description: 'Fetch Instagram posts with comments and likers.',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Instagram username' },
        amount:   { type: 'number', description: 'Number of posts (default: 5)' },
        download: { type: 'boolean', description: 'Download media to local storage (default: false)' }
      },
      required: ['username']
    },
    execute: async (args) => {
      const username = typeof args.username === 'string' ? args.username : '';
      if (!username) return { error: 'username must be a non-empty string' };
      const amount = typeof args.amount === 'number' ? Math.min(args.amount, 50) : 5;
      const result = await runIGMedia(username, amount);
      if (args.download === true) {
        const dl = await runIGDownload(username, amount);
        return { posts: result, downloaded: dl };
      }
      return result;
    }
  },
  {
    name: 'similar',
    description: 'Check username availability on 7 platforms (GitHub, GitLab, Reddit, TikTok, Medium, Vimeo, VK).',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Username to search' }
      },
      required: ['username']
    },
    execute: async (args) => {
      if (typeof args.username !== 'string' || !args.username.trim()) {
        return { error: 'username must be a non-empty string' };
      }
      return runSherlock(args.username);
    }
  },
  {
    name: 'ig_followers',
    description: 'Get full Instagram followers list (username, full_name, is_private). Check who follows the target and expand to related accounts.',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Instagram username target' }
      },
      required: ['username']
    },
    execute: async (args) => {
      const username = typeof args.username === 'string' ? args.username : '';
      if (!username) return { error: 'username must be a non-empty string' };
      return runIGFollowers(username);
    }
  },
  {
    name: 'ig_following',
    description: 'Get full Instagram following list (username, full_name, is_private). Check who the target follows — identify institution accounts, teachers, friends.',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Instagram username target' }
      },
      required: ['username']
    },
    execute: async (args) => {
      const username = typeof args.username === 'string' ? args.username : '';
      if (!username) return { error: 'username must be a non-empty string' };
      return runIGFollowing(username);
    }
  }
];

type Finding = {
  category: string;
  detail: string;
  source: string;
  confidence: 'high' | 'medium' | 'low';
};

const dangerousTools = ['write_file', 'append_file', 'make_dir', 'delete_file', 'run_command'];

function toGeminiToolDef(t: ToolFn) {
  return {
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  };
}

function estimateTokens(msg: Message): number {
  if ('text' in msg)             return Math.ceil(msg.text.length * 0.4);
  if ('functionCall' in msg)     return Math.ceil(JSON.stringify(msg.functionCall.args).length * 0.3);
  if ('functionCalls' in msg)    return msg.functionCalls.reduce((sum, fc) => sum + Math.ceil(JSON.stringify(fc.args).length * 0.3), 0);
  if ('functionResponse' in msg) return Math.ceil(JSON.stringify(msg.functionResponse.response).length * 0.3);
  return 1;
}

// FIX #11: Include recent findings in trim summary
function injectTrimSummary(history: Message[], trimmed: Message[], invFindings: Finding[]) {
  if (trimmed.length === 0) return;
  const toolCalls = new Set<string>();
  const results = trimmed.filter(m => 'functionResponse' in m).length;
  const texts   = trimmed.filter(m => 'text' in m).length;
  for (const m of trimmed) {
    if ('functionCall' in m) toolCalls.add(m.functionCall.name);
    if ('functionCalls' in m) m.functionCalls.forEach(fc => toolCalls.add(fc.name));
  }
  const tools = toolCalls.size > 0 ? ` Tools used: ${[...toolCalls].join(', ')}.` : '';

  // Inject recent findings so agent doesn't forget context
  let findingsSummary = '';
  if (invFindings.length > 0) {
    const recent = invFindings.slice(-5);
    findingsSummary = ` Key findings: ${recent.map(f =>
      `[${f.category}] ${f.detail.slice(0, 100)} (via ${f.source})`
    ).join('; ')}.`;
  }

  history.splice(1, 0, {
    role: 'user',
    text: `[Context trimmed: ${trimmed.length} messages (${results} results, ${texts} texts).${tools}${findingsSummary} Continuing with remaining context.]`
  });
}

function trimHistory(history: Message[], invFindings: Finding[]) {
  let trimmed: Message[] = [];

  // Phase 1: By message count
  if (history.length > MAX_HISTORY_LENGTH) {
    const targetLen = MAX_HISTORY_LENGTH - 1;
    trimmed = history.splice(1, history.length - targetLen);
    injectTrimSummary(history, trimmed, invFindings);
    return;
  }

  // Phase 2: By token count
  let totalTokens = 0;
  for (const msg of history) totalTokens += estimateTokens(msg);
  if (totalTokens <= MAX_HISTORY_TOKENS) return;

  let tokensToRemove = totalTokens - MAX_HISTORY_TOKENS;
  let removeCount = 0;
  for (let i = 1; i < history.length && tokensToRemove > 0; i++) {
    tokensToRemove -= estimateTokens(history[i]);
    removeCount++;
  }

  if (removeCount > 0) {
    trimmed = history.splice(1, removeCount);
    injectTrimSummary(history, trimmed, invFindings);
  } else if (history.length === 1 && totalTokens > MAX_HISTORY_TOKENS) {
    // FIX #7: Single message overflow — truncate the message itself
    const maxChars = Math.floor(MAX_HISTORY_TOKENS * 2.5 * 0.75); // 75% of budget
    const msg = history[0];
    if ('text' in msg && msg.text.length > maxChars) {
      const original = msg.text.length;
      msg.text = msg.text.slice(0, maxChars) +
        `\n\n[System: message trimmed from ${original} to ${maxChars} chars due to context budget.]`;
    }
  }
}

type Message =
  | { role: 'user';  text: string }
  | { role: 'model'; text: string; reasoningContent?: string }
  | { role: 'model'; functionCall: { name: string; args: Record<string, unknown> }; reasoningContent?: string }
  | { role: 'model'; functionCalls: Array<{ name: string; args: Record<string, unknown> }>; reasoningContent?: string }
  | { role: 'user';  functionResponse: { name: string; response: unknown } };

export interface AgentCallbacks {
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  onToolResult?: (name: string, result: unknown, durationMs: number) => void;
  onToken?: (token: string) => void;
}

export interface AgentConfig {
  maxTurns?: number;
  sessionTimeoutMs?: number;
}

export async function startAgent(
  ai: AIClient,
  model: string,
  ctx: ToolContext,
  callbacks?: AgentCallbacks,
  config?: AgentConfig
) {
  const history: Message[] = [];
  const abortController = new AbortController();

  let invTarget: string | null = null;
  let invFindings: Finding[] = [];
  let invStartedAt = 0;

  const agentInvestigationTools: ToolFn[] = [
    {
      name: 'init_investigation',
      description: 'Start a new OSINT investigation for a target. Reset previous findings.',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'Target investigasi (username, domain, email)' }
        },
        required: ['target']
      },
      execute: async (args) => {
        invTarget = typeof args.target === 'string' ? args.target : String(args.target);
        invFindings = [];
        invStartedAt = Date.now();
        // Auto-load relevant memories for context
        const memories = await queryMemories({ limit: 8 });
        let memoryContext = '';
        if (memories.length > 0) {
          memoryContext = `\n\n[Memory: ${memories.length} relevant patterns from previous investigations]\n`;
          for (const m of memories) {
            memoryContext += `- [${m.confidence}] ${m.category}: ${m.pattern}\n`;
          }
          memoryContext += '[Use save_memory to store new patterns after investigation.]';
        }
        return { ok: true, target: invTarget, totalFindings: 0, message: `Investigation for "${invTarget}" started.${memoryContext}` };
      }
    },
    {
      name: 'add_finding',
      description: 'Record investigation findings.',
      parameters: {
        type: 'object',
        properties: {
          category:   { type: 'string', description: 'Kategori: profile | email | domain | ip | platform | connection | other' },
          detail:     { type: 'string', description: 'Finding details' },
          source:     { type: 'string', description: 'Sumber/tool' },
          confidence: { type: 'string', description: 'high / medium / low' }
        },
        required: ['category', 'detail', 'source']
      },
      execute: async (args) => {
        if (!invTarget) return { error: 'Belum ada investigasi aktif. Panggil init_investigation dulu.' };
        invFindings.push({
          category:   typeof args.category   === 'string' ? args.category   : 'other',
          detail:     typeof args.detail     === 'string' ? args.detail     : String(args.detail),
          source:     typeof args.source     === 'string' ? args.source     : 'unknown',
          confidence: (['high', 'medium', 'low'].includes(String(args.confidence)) ? String(args.confidence) : 'medium') as Finding['confidence']
        });
        return { ok: true, totalFindings: invFindings.length };
      }
    },
    {
      name: 'get_investigation_summary',
      description: 'Get active investigation summary.',
      parameters: { type: 'object', properties: {} },
      execute: async () => {
        if (!invTarget) return { error: 'Tidak ada investigasi aktif.' };
        return {
          target: invTarget,
          totalFindings: invFindings.length,
          findings: invFindings,
          elapsedSeconds: Math.floor((Date.now() - invStartedAt) / 1000)
        };
      }
    },
    {
      name: 'save_memory',
      description: 'Save anonymous patterns/insights from investigation to long-term memory. Only save PATTERNS — never save real usernames, real names, or personal data.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Category: institution_account | name_pattern | strategy | tool_chain | indicator | correlation' },
          pattern: { type: 'string', description: 'Pattern description (ANONYMOUS, no real usernames)' },
          confidence: { type: 'string', description: 'high / medium / low' },
          tags: { type: 'string', description: 'Tags pisah koma contoh: sekolah,kelas,following' }
        },
        required: ['category', 'pattern', 'confidence']
      },
      execute: async (args) => {
        const category = typeof args.category === 'string' ? args.category : 'other';
        const pattern = typeof args.pattern === 'string' ? args.pattern : '';
        const confidence = (['high', 'medium', 'low'].includes(String(args.confidence)) ? String(args.confidence) : 'medium') as 'high' | 'medium' | 'low';
        const tagsRaw = typeof args.tags === 'string' ? args.tags : '';
        const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
        if (!pattern) return { error: 'pattern is required' };
        return addMemory(category, pattern, confidence, tags);
      }
    },
    {
      name: 'load_memories',
      description: 'Load relevant investigation memory patterns. Call at the start of investigation to learn from previous experience.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Filter by category (optional)' },
          tags: { type: 'string', description: 'Filter by tags, comma-separated (optional)' },
          limit: { type: 'number', description: 'Maks hasil (default 10)' }
        }
      },
      execute: async (args) => {
        const category = typeof args.category === 'string' ? args.category : undefined;
        const tagsRaw = typeof args.tags === 'string' ? args.tags : '';
        const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
        const limit = typeof args.limit === 'number' ? args.limit : 10;
        const memories = await queryMemories({ category, tags: tags.length > 0 ? tags : undefined, limit });
        return { memories, total: memories.length };
      }
    },
    {
      name: 'memory_stats',
      description: 'View saved memory statistics (total per category and confidence).',
      parameters: { type: 'object', properties: {} },
      execute: async () => getMemoryStats()
    }
  ];

  const agentTools = [...terminalTools, ...osintTools, ...agentInvestigationTools];

  async function sendMessage(userInput: string): Promise<string> {
    history.push({ role: 'user', text: userInput });

    const functionDeclarations = agentTools.map(toGeminiToolDef);
    let turns = 0;
    const maxTurns = config?.maxTurns ?? 50;
    const sessionTimeoutMs = config?.sessionTimeoutMs ?? SESSION_TIMEOUT_MS;
    const crossTurnCalls: Array<{ name: string; args: string }> = [];

    // FIX #9: Session timeout
    const sessionStart = Date.now();

    // FIX #15: Sliding window rate limiter for destructive tools
    const destructiveTimestamps: number[] = [];

    while (turns < maxTurns) {
      if (abortController.signal.aborted) {
        return '⚠️ Investigation aborted by user.';
      }
      // FIX #9: Check total session time
      if (Date.now() - sessionStart > sessionTimeoutMs) {
        const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
        const checkpoint = invFindings.length > 0
          ? ` ${invFindings.length} findings saved for "${invTarget}". Run get_investigation_summary.`
          : '';
        return `⚠️ Session timeout after ${elapsed}s.${checkpoint}`;
      }

      turns++;
      trimHistory(history, invFindings);

      const contents = history.map(msg => {
        if ('functionResponse' in msg) {
          return {
            role: 'user',
            parts: [{ functionResponse: { name: msg.functionResponse.name, response: { output: msg.functionResponse.response } } }]
          };
        }
        if ('functionCalls' in msg) {
          const c: { role: string; parts: { functionCall: { name: string; args: Record<string, unknown> } }[]; reasoningContent?: string } = { role: 'model', parts: msg.functionCalls.map(fc => ({ functionCall: { name: fc.name, args: fc.args } })) };
          if ('reasoningContent' in msg && msg.reasoningContent) {
            c.reasoningContent = msg.reasoningContent;
          }
          return c;
        }
        if ('functionCall' in msg) {
          const c: { role: string; parts: { functionCall: { name: string; args: Record<string, unknown> } }[]; reasoningContent?: string } = { role: 'model', parts: [{ functionCall: { name: msg.functionCall.name, args: msg.functionCall.args } }] };
          if ('reasoningContent' in msg && msg.reasoningContent) {
            c.reasoningContent = msg.reasoningContent;
          }
          return c;
        }
        const c: { role: string; parts: { text: string }[]; reasoningContent?: string } = { role: msg.role, parts: [{ text: msg.text }] };
        if ('reasoningContent' in msg && msg.reasoningContent) {
          c.reasoningContent = msg.reasoningContent;
        }
        return c;
      });

      // FIX #8: Wrap Gemini API call in try-catch — partial progress saved
      let response;
      try {
        const result = await ai.generateContent({
          model,
          contents,
          systemInstruction: SYSTEM_PROMPT,
          tools: [{ functionDeclarations }],
          config: { temperature: 0.7 },
        });
        response = result;
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        const checkpoint = invFindings.length > 0
          ? ` ${invFindings.length} findings saved. Run get_investigation_summary to see results.`
          : ' Retry the command.';
        return `⚠️ Error API di iterasi ${turns}: ${errMsg}.${checkpoint}`;
      }

      const functionCalls = response.functionCalls;

      if (!functionCalls || functionCalls.length === 0) {
        const reply = response.text || '...';
        history.push({
          role: 'model',
          text: reply,
          ...(response.reasoningContent ? { reasoningContent: response.reasoningContent } : {})
        });
        return reply;
      }

      // Group ALL function calls from this response into ONE model entry
      // This is REQUIRED by DeepSeek/Zen: when reasoning_content is present,
      // all tool_calls from one response must be in a single assistant message.
      const pendingCalls: Array<{
        name: string;
        args: Record<string, unknown>;
        result?: unknown;
        error?: string;
        skipped?: boolean;
      }> = [];
      let loopDetected = false;

      for (const fc of functionCalls) {
        const fnName = fc.name!;
        const fnArgs = (fc.args || {}) as Record<string, unknown>;
        const callKey = JSON.stringify({ name: fnName, args: fnArgs });

        crossTurnCalls.push({ name: fnName, args: callKey });
        const recent3 = crossTurnCalls.slice(-3);
        if (!loopDetected && recent3.length === 3 && recent3.every(c => c.name === recent3[0].name && c.args === recent3[0].args)) {
          await logAudit({ type: 'loop_detected', tool: fnName, turn: turns });
          loopDetected = true;
        }
        if (loopDetected) {
          pendingCalls.push({ name: fnName, args: fnArgs, error: 'Loop detected: same tool+args 3x consecutive', skipped: true });
          continue;
        }

        const tool = agentTools.find(t => t.name === fnName);
        if (!tool) {
          pendingCalls.push({ name: fnName, args: fnArgs, error: `Tool "${fnName}" not found.` });
          continue;
        }

        if (dangerousTools.includes(tool.name)) {
          const now = Date.now();
          while (destructiveTimestamps.length > 0 && destructiveTimestamps[0] < now - DESTRUCTIVE_WINDOW_MS) {
            destructiveTimestamps.shift();
          }
          if (destructiveTimestamps.length >= DESTRUCTIVE_LIMIT) {
            pendingCalls.push({ name: fnName, args: fnArgs, error: `Rate limit: max ${DESTRUCTIVE_LIMIT} destructive operations per minute.` });
            continue;
          }
          destructiveTimestamps.push(now);

          if (ctx.headless) {
            pendingCalls.push({ name: fnName, args: fnArgs, error: 'Destructive operations disabled in headless mode.' });
            continue;
          }

          const msg = `⚠️ AI ingin: **${tool.name}**\nArgs:\n${JSON.stringify(fnArgs, null, 2)}\nSetuju? (y/N): `;
          const confirmed = await ctx.confirm(msg);
          if (!confirmed) {
            pendingCalls.push({ name: fnName, args: fnArgs, error: 'User declined', skipped: true });
            continue;
          }
        }

        if (callbacks?.onToolCall) callbacks.onToolCall(fnName, fnArgs);
        const toolStart = Date.now();
        let result: unknown;
        try {
          result = await withRetry(() => tool.execute(fnArgs, ctx), fnName);
        } catch (e) {
          result = { error: classifyError(e).message };
        }
        if (callbacks?.onToolResult) callbacks.onToolResult(fnName, result, Date.now() - toolStart);

        await logAudit({
          type: 'tool_call',
          tool: fnName,
          args: sanitizeAuditArgs(fnName, fnArgs),
          turn: turns,
          hasError: result && typeof result === 'object' && 'error' in result
        });

        pendingCalls.push({ name: fnName, args: fnArgs, result });
      }

      if (pendingCalls.length > 0) {
        history.push({
          role: 'model',
          functionCalls: pendingCalls.map(p => ({ name: p.name, args: p.args })),
          ...(response.reasoningContent ? { reasoningContent: response.reasoningContent } : {})
        });
        for (const p of pendingCalls) {
          if (p.error) {
            history.push({ role: 'user', functionResponse: { name: p.name, response: { error: p.error, ...(p.skipped ? { skipped: true } : {}) } } });
          } else {
            history.push({ role: 'user', functionResponse: { name: p.name, response: p.result } });
          }
        }
      }
    }

    return '⚠️ Reached maximum iteration limit. Try clarifying your command.';
  }

  return { sendMessage, history, abort: () => abortController.abort() };
}
