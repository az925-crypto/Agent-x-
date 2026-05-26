import React from 'react';
import { Text } from 'ink';

// ─── Helpers ──────────────────────────────────────────────────────

let _idCounter = 0;
export const uid = () => `log-${Date.now()}-${_idCounter++}`;
export const fmt = (ms: number) => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;

// ─── Investigation Helpers ───────────────────────────────────────

export function invNow(): string {
  return new Date().toTimeString().slice(0, 8);
}

export function invSessionTime(startMs: number): string {
  const s = Math.floor((Date.now() - startMs) / 1000);
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `00:${m}:${ss}`;
}

export function progressBar(pct: number, width: number, color: string): React.ReactElement {
  const filled = Math.round((pct / 100) * width);
  const empty = width - filled;
  return (
    <Text>
      <Text color={color as any}>{'█'.repeat(filled)}</Text>
      <Text dimColor>{'░'.repeat(empty)}</Text>
    </Text>
  );
}
