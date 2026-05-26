import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
import type { InvestEntry, InvestTool, InvestFinding, InvestTreeLine, InvestGraphNode, InvestGraphEdge } from './cli-ui-types';
import { invNow, invSessionTime, progressBar } from './cli-ui-helpers';
import { getModel } from './tools/ai-agent/provider';

// ─── Investigation Panel Components ─────────────────────────────

export function InvestTopBar({ sessionStart, width }: { sessionStart: number; width: number }) {
  const [tick, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(id); }, []);
  return (
    <Box width={width} borderStyle="single" borderColor="cyan" paddingX={1} justifyContent="space-between">
      <Text bold color="cyan">OSINT Agent-X <Text color="gray">v1.0.0</Text></Text>
      <Text><Text color="gray">MODE: </Text><Text color="red" bold>INVESTIGATION</Text></Text>
      <Text><Text color="gray">SESSION: </Text><Text color="green">{invSessionTime(sessionStart)}</Text></Text>
      <Text><Text color="gray">TIME: </Text><Text color="white">{invNow()}</Text></Text>
    </Box>
  );
}

export function InvestLeftPanel({ height, tools, findings, queue, phase, depth, entities }: {
  height: number; tools: InvestTool[]; findings: InvestFinding[]; queue: string[];
  phase: string; depth: number; entities: number;
}) {
  return (
    <Box flexDirection="column" width={28} height={height} borderStyle="single" borderColor="green" paddingX={1}>
      <Text bold color="green">AGENT STATUS</Text>
      <Box flexDirection="column" marginBottom={1}>
        <Text><Text dimColor>Status    : </Text><Text color="green" bold>RUNNING</Text></Text>
        <Text><Text dimColor>Phase     : </Text><Text color="cyan">{phase}</Text></Text>
        <Text><Text dimColor>Depth     : </Text><Text color="white">level {depth}/3 </Text><Text color={depth === 1 ? 'green' : depth === 2 ? 'yellow' : 'red'} dimColor>{depth === 1 ? 'basic' : depth === 2 ? 'medium' : 'max'}</Text></Text>
        <Text><Text dimColor>Entities  : </Text><Text color="white">{entities}</Text></Text>
        <Text><Text dimColor>Findings  : </Text><Text color="yellow">{findings.length}</Text></Text>
        <Text><Text dimColor>Memory    : </Text><Text color="white">active</Text></Text>
      </Box>

      <Text bold color="green">ACTIVE TOOLS</Text>
      <Box flexDirection="column" marginBottom={1}>
        {tools.map((t, i) => (
          <Text key={i}>
            <Text color={t.active ? 'cyan' : 'gray'}>{t.active ? '> ' : '  '}</Text>
            <Text color={t.active ? 'white' : 'gray'}>{t.name.padEnd(14)}</Text>
            <Text color={t.active ? 'yellow' : 'gray'} dimColor>{t.dur}</Text>
          </Text>
        ))}
      </Box>

      <Text bold color="green">TASK QUEUE</Text>
      <Box flexDirection="column" marginBottom={1}>
        {queue.length === 0 ? (
          <Text dimColor>  (idle)</Text>
        ) : (
          queue.map((q, i) => (
            <Text key={i} color="gray" dimColor>• {q}</Text>
          ))
        )}
      </Box>

      <Text bold color="green">RATE LIMITER</Text>
      <Box flexDirection="column" marginBottom={1}>
        <Text><Text dimColor>Instagram  </Text>{progressBar(tools.filter(t => t.name.startsWith('ig_')).length * 20, 8, 'cyan')} <Text color="gray">{tools.filter(t => t.name.startsWith('ig_')).length}/5</Text></Text>
        <Text><Text dimColor>DNS/GeoIP  </Text>{progressBar(tools.filter(t => t.name === 'scan').length * 20, 8, 'cyan')} <Text color="gray">{tools.filter(t => t.name === 'scan').length}/5</Text></Text>
        <Text><Text dimColor>Sherlock   </Text>{progressBar(tools.filter(t => t.name === 'similar').length * 20, 8, 'cyan')} <Text color="gray">{tools.filter(t => t.name === 'similar').length}/5</Text></Text>
        <Text color="gray" dimColor>Resets with new session</Text>
      </Box>

      <Text bold color="green">MEMORY HIGHLIGHTS</Text>
      <Box flexDirection="column">
        <Text color="gray" dimColor>• {findings.length} findings this session</Text>
        <Text color="gray" dimColor>• {entities} entities mapped</Text>
        <Text color="gray" dimColor>• Depth level {depth}/3</Text>
      </Box>
    </Box>
  );
}

export function InvestCenterPanel({ height, width, feed, input, onInput, onExit, onClear }: {
  height: number; width: number; feed: InvestEntry[];
  input: string; onInput: (v: string) => void;
  onExit: () => void; onClear: () => void;
}) {
  const feedHeight = Math.max(1, height - 5);
  const visible = feed.slice(-feedHeight);

  return (
    <Box flexDirection="column" width={width} height={height} borderStyle="single" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">INVESTIGATION FEED <Text dimColor>({feed.length} events)</Text></Text>
      <Box flexDirection="column" flexGrow={1}>
        {visible.map((entry, i) => (
          <Box key={i} flexDirection="column">
            <Box>
              <Text dimColor>{entry.time} </Text>
              <Text color={entry.color as any}>[{entry.tag.padEnd(10)}]</Text>
              {entry.tag === 'ai' ? (
                <Box flexGrow={1} flexDirection="column">
                  <Text wrap="wrap"> {entry.msg}</Text>
                </Box>
              ) : (
                <Text color="white"> {entry.msg}</Text>
              )}
            </Box>
          </Box>
        ))}
      </Box>
      <Box borderStyle="single" borderColor="gray" paddingX={1} marginTop={1}>
        <Text color="green" bold>agent-x </Text>
        <Text color="gray">❯ </Text>
        <Text color="white">{input}</Text>
        <Text color="green">▌</Text>
      </Box>
      <Text dimColor color="gray">  ketik 'exit' keluar • 'clear' bersihkan</Text>
    </Box>
  );
}

function renderTreeLine(txt: string, depth: number, color: string, maxWidth: number, lines: InvestTreeLine[], index: number): React.ReactNode {
  if (depth === 0) return <Text color={color as any}>{txt.slice(0, Math.max(4, maxWidth))}</Text>;

  const hasSameDepthSibling = lines.slice(index + 1).some(l => l.depth === depth);
  const branch = hasSameDepthSibling ? '├── ' : '└── ';

  let prefix = '';
  for (let d = 1; d < depth; d++) {
    const hasSiblingAtLevel = lines.slice(index + 1).some(l => l.depth === d);
    prefix += hasSiblingAtLevel ? '│   ' : '    ';
  }
  prefix += branch;

  const available = Math.max(4, maxWidth - prefix.length);
  return <Text color={color as any}>{prefix}{txt.slice(0, available)}</Text>;
}

function renderGraphFromNodes(nodes: InvestGraphNode[], edges: InvestGraphEdge[], maxWidth: number): React.ReactNode[] {
  if (nodes.length === 0) {
    return [<Text key="empty" dimColor>(no entities)</Text>];
  }
  const root = nodes.find(n => n.parentId === null);
  if (!root) return [<Text key="err" dimColor>(building...)</Text>];

  const result: React.ReactNode[] = [];
  const center = Math.floor(maxWidth / 2);

  result.push(<Text key="root" color={root.color as any}>{' '.repeat(Math.max(0, center - Math.floor(root.label.length / 2)))}{root.label}</Text>);

  const rootEdges = edges.filter(e => e.from === root.id || (e.from === 'target' && root.id === 'target'));
  const children = rootEdges
    .map(e => ({ node: nodes.find(n => n.id === e.to), edge: e }))
    .filter((c): c is { node: InvestGraphNode; edge: InvestGraphEdge } => c.node !== undefined);

  if (children.length === 1) {
    const { node: child, edge } = children[0];
    const edgeHint = edge.label ? ` [${edge.label}]` : '';
    result.push(<Text key="pipe1" color="gray">{' '.repeat(center)}|</Text>);
    result.push(
      <Text key="c1" color={child.color as any}>
        {' '.repeat(Math.max(0, center - Math.floor((child.label + edgeHint).length / 2)))}
        {child.label}<Text dimColor>{edgeHint}</Text>
      </Text>
    );
    const gcEdges = edges.filter(e => e.from === child.id);
    if (gcEdges.length > 0) {
      result.push(<Text key="pipe2" color="gray">{' '.repeat(center)}|</Text>);
      gcEdges.forEach((gcEdge, i) => {
        const gcNode = nodes.find(n => n.id === gcEdge.to);
        if (!gcNode) return;
        const prefix = i < gcEdges.length - 1 ? '├─ ' : '└─ ';
        const gcHint = gcEdge.label ? ` [${gcEdge.label}]` : '';
        result.push(
          <Text key={`gc-${i}`} color={gcNode.color as any}>
            {' '.repeat(Math.max(0, center - 6))}{prefix}{gcNode.label.slice(0, 12)}{gcHint}
          </Text>
        );
      });
    }
  } else if (children.length > 1) {
    result.push(<Text key="branch" color="gray">{' '.repeat(Math.max(0, center - 4))}/  \\</Text>);
    const mid = Math.floor(children.length / 2);
    const left = children.slice(0, mid);
    const right = children.slice(mid);
    const leftText = left.map(c => `${c.node.label}${c.edge.label ? '~' + c.edge.label : ''}`).join(' ');
    const rightText = right.map(c => `${c.node.label}${c.edge.label ? '~' + c.edge.label : ''}`).join(' ');
    result.push(<Text key="siblings"><Text color="cyan">{' '.repeat(Math.max(0, center - Math.floor(leftText.length / 2) - 6))}{leftText}</Text><Text color="gray">  </Text><Text color="cyan">{rightText}</Text></Text>);
  }

  return result;
}

export function InvestRightPanel({ height, tree, findings, graphNodes, graphEdges }: {
  height: number; tree: InvestTreeLine[]; findings: InvestFinding[]; graphNodes: InvestGraphNode[]; graphEdges: InvestGraphEdge[];
}) {
  const treeHeight = Math.max(1, Math.floor(height * 0.35));
  const findingsHeight = Math.max(1, Math.floor(height * 0.2));
  const graphHeight = Math.max(1, height - treeHeight - findingsHeight - 4);
  const visibleTree = tree.slice(-treeHeight);

  return (
    <Box flexDirection="column" width={34} height={height} borderStyle="single" borderColor="green" paddingX={1}>
      <Text bold color="green">INVESTIGATION TREE</Text>
      <Box flexDirection="column" height={treeHeight} marginBottom={1}>
        {visibleTree.map((l, i) => (
          <Box key={i}>
            {renderTreeLine(l.txt, l.depth, l.color, 30, visibleTree, i)}
          </Box>
        ))}
      </Box>

      <Text bold color="green">TOP FINDINGS</Text>
      <Box flexDirection="column" height={findingsHeight} marginBottom={1}>
        {findings.slice(0, 4).map((f, i) => (
          <Box key={i} flexDirection="column">
            <Text dimColor>{f.label.slice(0, 28)}</Text>
            <Box>
              {progressBar(f.pct, 12, f.color)}
              <Text color={f.color as any}> {f.pct}%</Text>
            </Box>
          </Box>
        ))}
      </Box>

      <Text bold color="green">ENTITY GRAPH</Text>
      <Box flexDirection="column" height={graphHeight}>
        {renderGraphFromNodes(graphNodes, graphEdges, 30)}
      </Box>
    </Box>
  );
}

export function InvestBottomBar({ width, findings, tools, queue, depth, entities, sessionStart }: {
  width: number; findings: InvestFinding[]; tools: InvestTool[]; queue: string[];
  depth: number; entities: number; sessionStart: number;
}) {
  return (
    <Box width={width} borderStyle="single" borderColor="cyan" paddingX={1} justifyContent="space-between">
      <Text><Text color="cyan" bold>OSINT Agent-X</Text><Text color="gray"> v1.0.0</Text></Text>
      <Text><Text color="gray">MODEL:</Text><Text color="green"> {getModel()}</Text></Text>
      <Text><Text color="gray">MEM:</Text><Text color="green"> {findings.length}</Text></Text>
      <Text><Text color="gray">ENT:</Text><Text color="white"> {entities}</Text></Text>
      <Text><Text color="gray">TOOLS:</Text><Text color="cyan"> {tools.filter(t => t.active).length}</Text></Text>
      <Text><Text color="gray">DPTH:</Text><Text color="yellow"> {depth}/3</Text></Text>
      <Text><Text color="gray">SES:</Text><Text color="green"> {invSessionTime(sessionStart)}</Text></Text>
    </Box>
  );
}

export function InvestigationUI({ sessionStart, feed, tools, findings, tree, queue, phase, depth, entities, graphNodes, graphEdges, input, onInput, onExit, onClear }: {
  sessionStart: number;
  feed: InvestEntry[]; tools: InvestTool[]; findings: InvestFinding[]; tree: InvestTreeLine[]; queue: string[];
  phase: string; depth: number; entities: number; graphNodes: InvestGraphNode[]; graphEdges: InvestGraphEdge[];
  input: string; onInput: (v: string) => void;
  onExit: () => void; onClear: () => void;
}) {
  const { stdout } = useStdout();
  const W = stdout?.columns ?? 120;
  const H = stdout?.rows ?? 40;
  const centerW = Math.max(10, W - 28 - 34 - 6);
  const panelH = Math.max(10, H - 5);

  return (
    <Box flexDirection="column" width={W}>
      <InvestTopBar sessionStart={sessionStart} width={W} />
      <Box flexDirection="row">
        <InvestLeftPanel height={panelH} tools={tools} findings={findings} queue={queue} phase={phase} depth={depth} entities={entities} />
        <InvestCenterPanel height={panelH} width={centerW} feed={feed} input={input} onInput={onInput} onExit={onExit} onClear={onClear} />
        <InvestRightPanel height={panelH} tree={tree} findings={findings} graphNodes={graphNodes} graphEdges={graphEdges} />
      </Box>
      <InvestBottomBar width={W} findings={findings} tools={tools} queue={queue} depth={depth} entities={entities} sessionStart={sessionStart} />
    </Box>
  );
}
