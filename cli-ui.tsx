import React, { useState, useCallback, useRef, useEffect } from 'react';
import { render, Box, Text, useInput, useApp, Static } from 'ink';
import { startAgent } from './tools/ai-agent/index';
import type { AgentConfig } from './tools/ai-agent/index';
import { analyzeWithAIStream } from './tools/ai-agent/shared';
import { createAIProvider, getModel, getProviderInfo, recreateProvider } from './tools/ai-agent/provider';
import type { AIClient } from './tools/ai-agent/provider';
import 'dotenv/config';

import type { LogEntry, TaskCtx, ConfirmReq, InvestEntry, InvestTool, InvestFinding, InvestTreeLine, InvestGraphNode, InvestGraphEdge, InvestStatus } from './cli-ui-types';
import { uid, fmt, invNow } from './cli-ui-helpers';
import { LogLine, ActiveTask, DotsProgress } from './cli-ui-log';
import { InvestigationUI } from './cli-ui-investigation';
import { useCommands } from './cli-ui-commands';

function App() {
  const { exit } = useApp();

  const bannerLogs: LogEntry[] = [
    { id: uid(), type: 'text', content: '  █████╗  ██████╗ ███████╗███╗   ██╗████████╗    ██╗  ██╗', color: 'blue' },
    { id: uid(), type: 'text', content: ' ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝    ╚██╗██╔╝', color: 'blue' },
    { id: uid(), type: 'text', content: ' ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║        ╚███╔╝ ', color: 'blue' },
    { id: uid(), type: 'text', content: ' ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║        ██╔██╗ ', color: 'blue' },
    { id: uid(), type: 'text', content: ' ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║       ██╔╝ ██╗', color: 'blue' },
    { id: uid(), type: 'text', content: ' ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝       ╚═╝  ╚═╝', color: 'blue' },
    { id: uid(), type: 'blank' },
    { id: uid(), type: 'text', content: '  Tools OSINT AI Base — Author: zaaam', color: 'blue', dim: true },
    { id: uid(), type: 'blank' },
  ];
  const [completedLogs, setCompletedLogs] = useState<LogEntry[]>(bannerLogs);
  const [activeLines, setActiveLines] = useState<string[]>([]);
  const [streamText, setStreamText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const [inputValue, setInputValue] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [logCount, setLogCount] = useState(0);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const COMMANDS = ['ig', 'similar', 'scan', 'followers', 'following', 'media', 'download', 'chat', 'reconnect', 'review-ui', 'help', 'clear', 'exit'];

  const [confirmReq, setConfirmReq] = useState<ConfirmReq | null>(null);
  const [confirmInput, setConfirmInput] = useState('');

  const [investStatus, setInvestStatus] = useState<InvestStatus>('idle');
  const [investFeed, setInvestFeed] = useState<InvestEntry[]>([]);
  const [investTools, setInvestTools] = useState<InvestTool[]>([]);
  const [investFindings, setInvestFindings] = useState<InvestFinding[]>([]);
  const [investTree, setInvestTree] = useState<InvestTreeLine[]>([]);
  const [investQueue, setInvestQueue] = useState<string[]>([]);
  const [investPhase, setInvestPhase] = useState('IDLE');
  const [investDepth, setInvestDepth] = useState(0);
  const investDepthRef = useRef(0);
  const [investEntities, setInvestEntities] = useState(0);
  const [investGraphNodes, setInvestGraphNodes] = useState<InvestGraphNode[]>([]);
  const [investGraphEdges, setInvestGraphEdges] = useState<InvestGraphEdge[]>([]);

  const treeDepthRef = useRef(0);

  const isRunningRef = useRef(false);
  const isChatModeRef = useRef(false);
  const confirmRef = useRef<ConfirmReq | null>(null);
  const pendingFindingsRef = useRef<Array<{detail: string; confidence: string}>>([]);

  const ai = useRef<AIClient | null>(null);
  const sessionStartRef = useRef(Date.now());
  const [providerVersion, setProviderVersion] = useState(0);

  const reconnectProvider = useCallback(() => {
    try {
      ai.current = recreateProvider();
      setProviderVersion(v => v + 1);
    } catch {
      ai.current = null;
      setProviderVersion(v => v + 1);
    }
  }, []);

  useEffect(() => {
    try {
      ai.current = createAIProvider();
    } catch {
      ai.current = null;
    }
  }, [providerVersion]);

  const pushLog = useCallback((entry: Omit<LogEntry, 'id'>) => {
    const e = { ...entry, id: uid() };
    setCompletedLogs(prev => [...prev, e]);
    setLogCount(c => c + 1);
  }, []);

  const pushBlank = useCallback(() => pushLog({ type: 'blank' }), [pushLog]);

  const createTask = useCallback((label: string, detail: string): [TaskCtx, number] => {
    const start = Date.now();
    pushLog({ type: 'start', label, detail });
    setActiveLines([]);
    return [{
      progress: (msg: string) => {
        setActiveLines(prev => [...prev.slice(-12), msg]);
      },
      done: (result?: string) => {
        setActiveLines([]);
        pushLog({ type: 'done', content: result, elapsed: Date.now() - start });
      },
      fail: (err: string) => {
        setActiveLines([]);
        pushLog({ type: 'fail', content: err, elapsed: Date.now() - start });
      },
      elapsed: () => Date.now() - start,
    }, start];
  }, [pushLog]);

  const streamAI = useCallback(async (prompt: string): Promise<string> => {
    if (!ai.current) throw new Error('AI not configured');
    setIsStreaming(true);
    setStreamText('');
    let accumulated = '';
    const result = await analyzeWithAIStream(
      ai.current,
      getModel(),
      prompt,
      (token: string) => {
        accumulated += token;
        setStreamText(accumulated);
      },
      { responseMimeType: 'application/json' }
    );
    setIsStreaming(false);
    if (accumulated) {
      pushLog({ type: 'stream', content: accumulated });
      setStreamText('');
    }
    return result;
  }, [pushLog]);

  const {
    commandHelp, commandIG, commandSimilar, commandScan,
    commandFollowers, commandFollowing, commandMedia, commandDownload
  } = useCommands({ ai, pushLog, pushBlank, createTask, streamAI });

  const commandChat = useCallback(async () => {
    if (!ai.current) { pushLog({ type: 'fail', content: 'AI not configured', elapsed: 0 }); return; }

    pushLog({ type: 'text', content: '  Chat mode — type a target to investigate. Use "depth 1/2/3" to set depth.' });
    pushBlank();

    const agentConfig: AgentConfig = {};
    if (investDepthRef.current === 0) { investDepthRef.current = 2; setInvestDepth(2); }

    const agent = await startAgent(ai.current, getModel(), {
      cwd: process.cwd(),
      confirm: async (msg: string): Promise<boolean> => {
        return new Promise<boolean>((resolve) => {
          const req: ConfirmReq = { message: msg, resolve };
          confirmRef.current = req;
          setConfirmReq(req);
        });
      }
    }, {
      onToolCall: (name: string, args: Record<string, unknown>) => {
        const argStr = Object.entries(args).map(([k, v]) => `${k}=${String(v).slice(0, 40)}`).join(' ');
        pushLog({ type: 'start', label: name, detail: argStr });

        if (name === 'add_finding') {
          pendingFindingsRef.current.push({
            detail: String(args.detail || args.category || ''),
            confidence: String(args.confidence || 'medium')
          });
        }

        if (name === 'init_investigation') {
          setInvestStatus('investigating');
          setInvestFeed([]);
          setInvestTools([]);
          setInvestFindings([]);
          setInvestGraphNodes([]);
          setInvestGraphEdges([]);
          treeDepthRef.current = 0;
          const target = String(args.target || 'TARGET');
          setInvestTree([{ txt: `[${target}]`, color: 'cyan', depth: 0 }]);
          setInvestGraphNodes(prev => [...prev, { id: 'target', label: target, type: 'target', color: 'cyan', parentId: null }]);
          setInvestQueue([]);
          setInvestPhase('INITIALIZING');
          setInvestEntities(0);
        } else if (name === 'add_finding') {
          setInvestFeed(prev => [...prev, { time: invNow(), tag: 'result', color: 'yellow', msg: `🔍 ${String(args.detail || '').slice(0, 120)}` }]);
          const d = treeDepthRef.current + 1;
          setInvestTree(prev => [...prev, { txt: String(args.detail || 'finding').slice(0, 28), color: 'green', depth: d }]);
        } else {
          const depth = name.startsWith('ig_followers') || name.startsWith('ig_following') || name.startsWith('ig_media') ? 2 : 1;
          treeDepthRef.current = depth;
          setInvestTree(prev => [...prev, { txt: `${name}${argStr ? ' ' + argStr.slice(0, 20) : ''}`, color: name.startsWith('ig_') ? 'white' : 'gray', depth }]);
          const username = String(args.username || args.target || '');
          const nodeType = name.startsWith('ig_') ? 'social' : name === 'scan' ? 'network' : 'social';
          if (username) {
            const parentId = depth === 2 ? 'target' : null;
            setInvestGraphNodes(prev => {
              const existing = prev.find(n => n.label === username);
              if (existing) return prev;
              return [...prev, { id: `${nodeType}-${username}`, label: username, type: nodeType, color: nodeType === 'social' ? 'cyan' : 'magenta', parentId }];
            });
            setInvestGraphEdges(prev => {
              const edgeFrom = parentId || 'target';
              const edgeTo = `${nodeType}-${username}`;
              const edgeLabel = name.startsWith('ig_') ? 'follows' : name === 'scan' ? 'scans' : 'similar';
              if (prev.find(e => e.from === edgeFrom && e.to === edgeTo)) return prev;
              return [...prev, { from: edgeFrom, to: edgeTo, label: edgeLabel }];
            });
          }
        }
        const tag = name === 'init_investigation' ? 'planner' : name.startsWith('ig_') ? 'tool' : 'tool';
        const color = name === 'init_investigation' ? 'magenta' : 'cyan';
        if (name.startsWith('ig_')) setInvestPhase('EXPAND_NETWORK');
        else if (name === 'similar' || name === 'scan') setInvestPhase('OSINT_SCAN');
        else if (name === 'add_finding') setInvestPhase('ANALYZING');
        setInvestFeed(prev => [...prev, { time: invNow(), tag, color, msg: `${name} ${argStr ? '→ ' + argStr : ''}` }]);
        setInvestTools(prev => {
          const exists = prev.find(t => t.name === name);
          if (exists) return prev.map(t => t.name === name ? { ...t, active: true } : t);
          return [...prev, { name, dur: 'active', active: true }];
        });
        setInvestQueue(prev => prev.includes(name) ? prev : [...prev, name]);
      },
      onToolResult: (name: string, result: unknown, ms: number) => {
        const hasError = result && typeof result === 'object' && 'error' in (result as Record<string, unknown>);
        if (hasError) {
          pushLog({ type: 'fail', content: String((result as Record<string, unknown>).error), elapsed: ms });
          setInvestFeed(prev => [...prev, { time: invNow(), tag: 'result', color: 'red', msg: `❌ ${name}: ${String((result as Record<string, unknown>).error).slice(0, 80)}` }]);
        } else {
          pushLog({ type: 'done', elapsed: ms });
          const durStr = ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
          setInvestFeed(prev => [...prev, { time: invNow(), tag: 'result', color: 'green', msg: `✓ ${name} (${durStr})` }]);

          if (name === 'add_finding') {
            const pending = pendingFindingsRef.current.shift();
            if (pending && pending.detail) {
              const pct = pending.confidence === 'high' ? 92 : pending.confidence === 'medium' ? 72 : 50;
              setInvestFindings(prev => {
                if (prev.find(f => f.label === pending.detail.slice(0, 40))) return prev;
                return [...prev, { label: pending.detail.slice(0, 40), pct, color: pct > 80 ? 'green' : 'yellow' }];
              });
              const d = treeDepthRef.current + 1;
              setInvestTree(prev => [...prev, { txt: pending.detail.slice(0, 28), color: 'green', depth: d }]);
            }
          }

          if (name === 'init_investigation') setInvestPhase('ANALYZING');
        }
        setInvestTools(prev => prev.map(t => t.name === name ? { ...t, dur: fmt(ms), active: false } : t));
        setInvestEntities(prev => prev + 1);
        setInvestQueue(prev => {
          const idx = prev.indexOf(name);
          return idx >= 0 ? [...prev.slice(0, idx), ...prev.slice(idx + 1)] : prev;
        });
      }
    }, agentConfig);

    setIsChatMode(true);
    isChatModeRef.current = true;
    chatAgentRef.current = agent;
  }, [pushLog, pushBlank]);

  const [isChatMode, setIsChatMode] = useState(false);
  const chatAgentRef = useRef<{ sendMessage: (msg: string) => Promise<string>; abort?: () => void } | null>(null);

  const handleChatMessage = useCallback(async (msg: string) => {
    const lower = msg.toLowerCase().trim();
    if (lower === 'exit' || lower === 'quit') {
      chatAgentRef.current?.abort?.();
      setIsChatMode(false);
      isChatModeRef.current = false;
      chatAgentRef.current = null;
      setInvestStatus('idle');
      pushLog({ type: 'text', content: '  Exited investigation mode' });
      pushBlank();
      return;
    }
    if (lower === '/review' || lower === 'review') {
      if (investFindings.length > 0) {
        setInvestFeed(prev => [...prev, { time: invNow(), tag: 'note', color: 'cyan', msg: `=== INVESTIGATION SUMMARY (${investFindings.length} findings) ===` }]);
        investFindings.forEach(f => {
          setInvestFeed(prev => [...prev, { time: invNow(), tag: 'result', color: f.color, msg: `  ${f.label} [${f.pct}%]` }]);
        });
        setInvestFeed(prev => [...prev, { time: invNow(), tag: 'note', color: 'cyan', msg: `Entity: ${investEntities} · Depth: ${investDepth}/3` }]);
      } else {
        setInvestFeed(prev => [...prev, { time: invNow(), tag: 'note', color: 'yellow', msg: 'No findings yet. Investigation is still running or not started.' }]);
      }
      return;
    }
    const depthMatch = lower.match(/^depth\s+(\d)$/);
    if (depthMatch) {
      const d = parseInt(depthMatch[1]);
      if (d >= 1 && d <= 3) {
        investDepthRef.current = d; setInvestDepth(d);
        pushLog({ type: 'done', content: `Depth set to ${d}`, elapsed: 0 });
      }
    }
    try {
      setIsRunning(true);
      isRunningRef.current = true;
      const reply = await chatAgentRef.current!.sendMessage(msg);
      if (reply && reply !== '...') {
        pushBlank();
        pushLog({ type: 'divider', content: '┌─ Investigation Complete ─────────────────────┐' });
        if (investFindings.length > 0) {
          pushLog({ type: 'divider', content: `│ Findings: ${investFindings.length}` });
          investFindings.forEach(f => {
            pushLog({ type: 'text', content: `  ${f.label} [${f.pct}%]`, color: f.color, dim: false });
          });
        }
        pushBlank();
        pushLog({ type: 'stream', content: reply });
        pushLog({ type: 'divider', content: '└──────────────────────────────────────────────┘' });
        pushBlank();
      }
      setInvestStatus('idle');
    } catch (e: unknown) {
      pushLog({ type: 'fail', content: e instanceof Error ? e.message : String(e), elapsed: 0 });
      setInvestFeed(prev => [...prev, { time: invNow(), tag: 'error', color: 'red', msg: `Error: ${e instanceof Error ? e.message : String(e)}` }]);
    } finally {
      setIsRunning(false);
      isRunningRef.current = false;
      setActiveLines([]);
    }
  }, [pushLog, pushBlank]);

  const handleCommand = useCallback(async (raw: string) => {
    const args = raw.trim().split(' ').filter(Boolean);
    const cmd = args[0]?.toLowerCase();
    if (!cmd) return;

    pushLog({ type: 'text', content: `  $ ${raw}` });

    if (cmd === 'exit' || cmd === 'quit') {
      if (investStatus === 'investigating') {
        chatAgentRef.current?.abort?.();
        setIsChatMode(false); isChatModeRef.current = false; setInvestStatus('idle');
        chatAgentRef.current = null;
        pushLog({ type: 'text', content: '  Exited investigation mode' });
        pushBlank();
      } else { exit(); }
      return;
    }
    if (cmd === 'clear') {
      if (investStatus === 'investigating') { setInvestFeed([]); }
      else { setCompletedLogs([{ id: uid(), type: 'blank' }]); setLogCount(0); }
      return;
    }
    if (cmd === 'depth' && args[1]) {
      const d = parseInt(args[1]);
      if (d >= 1 && d <= 3) {
        investDepthRef.current = d; setInvestDepth(d);
        pushLog({ type: 'done', content: `Depth set to ${d}`, elapsed: 0 });
        if (isChatMode && chatAgentRef.current) {
          chatAgentRef.current.sendMessage(`[System: Investigation depth set to level ${d}. Adjust detail level accordingly.]`);
        }
      } else {
        pushLog({ type: 'fail', content: 'Depth: 1 (basic) / 2 (medium) / 3 (max)', elapsed: 0 });
      }
      return;
    }

    setIsRunning(true);
    isRunningRef.current = true;

    try {
      if (cmd === 'help')       await commandHelp();
      else if (cmd === 'ig')    { if (args[1]) await commandIG(args[1]); else pushLog({ type: 'fail', content: 'usage: ig <username>', elapsed: 0 }); }
      else if (cmd === 'similar') { if (args[1]) await commandSimilar(args[1]); else pushLog({ type: 'fail', content: 'usage: similar <username>', elapsed: 0 }); }
      else if (cmd === 'scan')   { if (args[1]) await commandScan(args[1]); else pushLog({ type: 'fail', content: 'usage: scan <target>', elapsed: 0 }); }
      else if (cmd === 'followers') { if (args[1]) await commandFollowers(args[1]); else pushLog({ type: 'fail', content: 'usage: followers <username>', elapsed: 0 }); }
      else if (cmd === 'following') { if (args[1]) await commandFollowing(args[1]); else pushLog({ type: 'fail', content: 'usage: following <username>', elapsed: 0 }); }
      else if (cmd === 'media')    { if (args[1]) await commandMedia(args[1], parseInt(args[2]) || 5); else pushLog({ type: 'fail', content: 'usage: media <username> [n]', elapsed: 0 }); }
      else if (cmd === 'download') { if (args[1]) await commandDownload(args[1], parseInt(args[2]) || 5); else pushLog({ type: 'fail', content: 'usage: download <username> [n]', elapsed: 0 }); }
      else if (cmd === 'chat')  await commandChat();
      else if (cmd === 'reconnect') {
        reconnectProvider();
        const info = getProviderInfo();
        pushLog({ type: 'done', content: `Provider reloaded: ${info.type} / ${info.model}`, elapsed: 0 });
      }
      else pushLog({ type: 'fail', content: `unknown command: ${cmd}`, elapsed: 0 });
    } finally {
      setIsRunning(false);
      isRunningRef.current = false;
      setActiveLines([]);
    }
  }, [commandHelp, commandIG, commandSimilar, commandScan, commandFollowers, commandFollowing, commandMedia, commandDownload, commandChat, isChatMode, investStatus, pushLog, pushBlank, exit]);

  useInput((input, key) => {
    if (confirmRef.current) {
      if (key.return) {
        const answer = confirmInput.trim().toLowerCase();
        const ok = answer === 'y' || answer === 'yes';
        confirmRef.current.resolve(ok);
        confirmRef.current = null;
        setConfirmReq(null);
        setConfirmInput('');
        if (!isChatMode) { setIsRunning(false); isRunningRef.current = false; }
      } else if (key.backspace || key.delete) {
        setConfirmInput(prev => prev.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setConfirmInput(prev => prev + input);
      }
      return;
    }

    if (isRunningRef.current && !isChatMode) {
      if (key.ctrl && input === 'c') { exit(); }
      return;
    }

    if (key.return) {
      const val = inputValue.trim();
      if (!val) return;
      setCommandHistory(prev => [val, ...prev].slice(0, 50));
      setHistoryIndex(-1);
      setInputValue('');
      if (isChatMode) handleChatMessage(val);
      else handleCommand(val);
    } else if (key.upArrow && !isChatMode) {
      setHistoryIndex(prev => {
        const next = Math.min(prev + 1, commandHistory.length - 1);
        if (next >= 0) setInputValue(commandHistory[next]);
        return next;
      });
    } else if (key.downArrow && !isChatMode) {
      setHistoryIndex(prev => {
        const next = prev - 1;
        if (next < 0) { setInputValue(''); return -1; }
        setInputValue(commandHistory[next]);
        return next;
      });
    } else if (key.tab && !isChatMode) {
      const partial = inputValue.trimStart().toLowerCase();
      if (partial) {
        const match = COMMANDS.find(c => c.startsWith(partial));
        if (match) setInputValue(match + ' ');
      }
    } else if (key.backspace || key.delete) {
      setInputValue(prev => prev.slice(0, -1));
    } else if (key.ctrl && input === 'c') {
      exit();
    } else if (key.ctrl && input === 'r') {
      if (!isRunningRef.current) {
        reconnectProvider();
        const info = getProviderInfo();
        pushLog({ type: 'done', content: `Provider reloaded: ${info.type} / ${info.model}`, elapsed: 0 });
      }
    } else if (key.ctrl && input === 'l') {
      setCompletedLogs([{ id: uid(), type: 'blank' }]);
      setLogCount(0);
    } else if (input && !key.ctrl && !key.meta) {
      setInputValue(prev => prev + input);
    }
  });

  if (investStatus === 'investigating') {
    return (
      <Box flexDirection="column">
        <InvestigationUI
          key={sessionStartRef.current}
          sessionStart={sessionStartRef.current}
          feed={investFeed}
          tools={investTools}
          findings={investFindings}
          tree={investTree}
          queue={investQueue}
          phase={investPhase}
          depth={investDepth}
          entities={investEntities}
          graphNodes={investGraphNodes}
          graphEdges={investGraphEdges}
          input={inputValue}
          onInput={setInputValue}
          onExit={() => { setIsChatMode(false); isChatModeRef.current = false; setInvestStatus('idle'); }}
          onClear={() => setInvestFeed([])}
        />
        {confirmReq && (
          <Box flexDirection="column" paddingLeft={2} marginTop={1}>
            <Box>
              <Text color="yellow">⚠ </Text>
              <Text bold>{confirmReq.message}</Text>
            </Box>
            <Box borderStyle="single" borderColor="yellow" paddingX={1} marginTop={1}>
              <Text color="yellow">Confirm (y/N): </Text>
              <Text>{confirmInput}</Text>
              <Text color="yellow">▌</Text>
            </Box>
          </Box>
        )}
      </Box>
    );
  }

  const isActive = isRunning || isStreaming;
  const promptPrefix = isChatMode ? 'chat' : 'agent-x';
  const promptColor = isChatMode ? 'magenta' : 'blue';

  return (
    <Box flexDirection="column">
      <Static items={completedLogs}>
        {(entry: LogEntry) => (
          <Box key={entry.id} paddingLeft={2}>
            <LogLine entry={entry} />
          </Box>
        )}
      </Static>

      {activeLines.length > 0 && (
        <Box paddingLeft={2}>
          <ActiveTask lines={activeLines} />
        </Box>
      )}

      {isStreaming && streamText && (
        <Box paddingLeft={2}>
          <Text bold color="cyan">▸ </Text>
          <Text wrap="wrap">{streamText}</Text>
        </Box>
      )}

      {confirmReq && (
        <Box flexDirection="column" paddingLeft={2} marginTop={1}>
          <Box>
            <Text color="yellow">⚠ </Text>
            <Text bold>{confirmReq.message}</Text>
          </Box>
          <Box borderStyle="single" borderColor="yellow" paddingX={1} marginTop={1}>
            <Text color="yellow">Confirm (y/N): </Text>
            <Text>{confirmInput}</Text>
            <Text color="yellow">▌</Text>
          </Box>
        </Box>
      )}

      {!confirmReq && (
        <Box flexDirection="column" paddingTop={1}>
          <Box borderLeft borderColor={promptColor} paddingLeft={1}>
            <Box flexDirection="column">
              <Box>
                <Text dimColor>{promptPrefix}@osint:~$ </Text>
                <Text>{!isActive ? inputValue : ''}</Text>
                {!isActive && <Text color={promptColor}>▌</Text>}
                {isActive && <Text dimColor>running...</Text>}
              </Box>
              <Text dimColor>
                {'Agent-X · '}{getProviderInfo().type}{' · '}{getModel()}
              </Text>
            </Box>
          </Box>

          <Box justifyContent="space-between" paddingTop={1}>
            <Box gap={2}>
              <DotsProgress active={isActive} />
              <Text dimColor>↑↓ hist</Text>
              <Text dimColor>tab cmp</Text>
            </Box>
            <Box gap={2}>
              <Text dimColor>{logCount} lines</Text>
              <Text dimColor>ctrl+r reload</Text>
              <Text dimColor>ctrl+l clear</Text>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}

console.clear();
render(<App />, { interactive: true });
