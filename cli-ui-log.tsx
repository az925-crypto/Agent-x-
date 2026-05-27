import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { LogEntry } from './cli-ui-types';
import { fmt } from './cli-ui-helpers';
import { MarkdownRenderer, isMarkdown } from './cli-ui-markdown';

// ─── Log line renderer ────────────────────────────────────────────

export function LogLine({ entry }: { entry: LogEntry }) {
  switch (entry.type) {
    case 'start':
      return (
        <Box>
          <Text color="cyan">● </Text>
          <Text bold>{entry.label} </Text>
          <Text dimColor>{entry.detail}</Text>
        </Box>
      );
    case 'progress':
      return (
        <Box>
          <Text dimColor>│  {entry.content}</Text>
        </Box>
      );
    case 'done':
      return (
        <Box>
          <Text color="green">✓ </Text>
          {entry.content && <Text>{entry.content} </Text>}
          <Text dimColor>({fmt(entry.elapsed || 0)})</Text>
        </Box>
      );
    case 'fail':
      return (
        <Box>
          <Text color="red">✗ </Text>
          <Text color="red">{entry.content} </Text>
          {(entry.elapsed || 0) > 0 && <Text dimColor>({fmt(entry.elapsed || 0)})</Text>}
        </Box>
      );
    case 'stream':
      if (entry.content && isMarkdown(entry.content)) {
        return (
          <Box flexDirection="column" marginBottom={1} marginTop={1}>
            <MarkdownRenderer content={entry.content} />
          </Box>
        );
      }
      return (
        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Text bold color="cyan">▸ </Text>
            <Text wrap="wrap">{entry.content}</Text>
          </Box>
        </Box>
      );
    case 'divider':
      return (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>{entry.content}</Text>
        </Box>
      );
    case 'text':
      return entry.color
        ? <Text color={entry.color} dimColor={entry.dim}>{entry.content}</Text>
        : <Text dimColor={entry.dim}>{entry.content}</Text>;
    case 'blank':
      return <Text> </Text>;
    default:
      return null;
  }
}

// ─── Active task display (live updates) ──────────────────────────

export function ActiveTask({ lines }: { lines: string[] }) {
  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <Box key={i}>
          <Text dimColor>│  {line}</Text>
        </Box>
      ))}
    </Box>
  );
}

// ─── Dots progress indicator ──────────────────────────────────────

export function DotsProgress({ active }: { active: boolean }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!active) { setFrame(0); return; }
    const id = setInterval(() => setFrame(f => (f + 1) % 9), 100);
    return () => clearInterval(id);
  }, [active]);
  return (
    <Text>
      {Array.from({ length: 9 }, (_, i) => {
        const isHead = active && i === frame;
        const isTail = active && (i === (frame + 8) % 9 || i === (frame + 7) % 9);
        return (
          <Text key={i} color={isHead ? 'blue' : isTail ? 'gray' : undefined} dimColor={!isHead && !isTail}>
            ·
          </Text>
        );
      })}
    </Text>
  );
}
