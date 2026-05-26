import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MEMORY_FILE = path.resolve(__dirname, 'memory.json');

export interface MemoryEntry {
  id: string;
  category: string;
  pattern: string;
  confidence: 'high' | 'medium' | 'low';
  tags: string[];
  createdAt: number;
  lastUsed: number;
  useCount: number;
}

interface MemoryStore {
  patterns: MemoryEntry[];
}

function defaultStore(): MemoryStore {
  return { patterns: [] };
}

let _cache: MemoryStore | null = null;
let _lock: Promise<void> = Promise.resolve();
let _memIdCounter = 0;
const memUid = () => `mem-${Date.now()}-${_memIdCounter++}`;

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = _lock;
  let release: () => void = () => {};
  _lock = new Promise<void>(resolve => { release = resolve; });
  return prev.then(() => fn()).finally(release);
}

async function load(): Promise<MemoryStore> {
  if (_cache) return _cache;
  try {
    const raw = await readFile(MEMORY_FILE, 'utf-8');
    _cache = JSON.parse(raw) as MemoryStore;
    return _cache!;
  } catch {
    _cache = defaultStore();
    return _cache;
  }
}

async function save(): Promise<void> {
  if (!_cache) return;
  try {
    await mkdir(path.dirname(MEMORY_FILE), { recursive: true });
    await writeFile(MEMORY_FILE, JSON.stringify(_cache, null, 2), 'utf-8');
  } catch (err) { console.error('[Memory] save failed:', err); }
}

export async function addMemory(
  category: string,
  pattern: string,
  confidence: 'high' | 'medium' | 'low',
  tags: string[]
): Promise<{ ok: boolean; id: string; total: number }> {
  return withLock(async () => {
    const store = await load();
    const entry: MemoryEntry = {
      id: memUid(),
      category,
      pattern,
      confidence,
      tags,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      useCount: 0,
    };
    store.patterns.push(entry);
    await save();
    return { ok: true, id: entry.id, total: store.patterns.length };
  });
}

export async function queryMemories(query?: {
  category?: string;
  tags?: string[];
  limit?: number;
}): Promise<MemoryEntry[]> {
  return withLock(async () => {
    const store = await load();
    let results = [...store.patterns];

    if (query?.category) {
      results = results.filter(m => m.category === query.category);
    }
    if (query?.tags && query.tags.length > 0) {
      results = results.filter(m =>
        query.tags!.some(t => m.tags.includes(t))
      );
    }

    // Sort by useCount desc (most used first), then by confidence
    results.sort((a, b) => {
      const confScore: Record<string, number> = { high: 3, medium: 2, low: 1 };
      const scoreA = a.useCount * 10 + (confScore[a.confidence] || 0);
      const scoreB = b.useCount * 10 + (confScore[b.confidence] || 0);
      return scoreB - scoreA;
    });

    const limit = query?.limit ?? 10;
    results = results.slice(0, limit);

    // Update lastUsed
    for (const r of results) {
      r.lastUsed = Date.now();
      r.useCount++;
    }
    await save();

    return results;
  });
}

export async function getAllMemories(): Promise<MemoryEntry[]> {
  return withLock(async () => {
    const store = await load();
    return store.patterns;
  });
}

export async function getMemoryStats(): Promise<{
  total: number;
  byCategory: Record<string, number>;
  byConfidence: Record<string, number>;
}> {
  return withLock(async () => {
    const store = await load();
    const byCategory: Record<string, number> = {};
    const byConfidence: Record<string, number> = {};
    for (const m of store.patterns) {
      byCategory[m.category] = (byCategory[m.category] || 0) + 1;
      byConfidence[m.confidence] = (byConfidence[m.confidence] || 0) + 1;
    }
    return { total: store.patterns.length, byCategory, byConfidence };
  });
}
