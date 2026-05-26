import React, { useState, useEffect, useRef } from 'react';
import { OsintTarget, OsintReport } from '../types';

interface LogEntry {
  id: string;
  timestamp: string;
  text: string;
  type: 'info' | 'warn' | 'error' | 'success' | 'input';
}

// Animated dots for the status bar
function DotsProgress({ active }: { active: boolean }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!active) { setFrame(0); return; }
    const id = setInterval(() => setFrame(f => (f + 1) % 9), 120);
    return () => clearInterval(id);
  }, [active]);

  return (
    <span className="tracking-widest text-[11px]">
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          className={
            active && i === frame
              ? 'text-blue-400'
              : active && (i === (frame + 8) % 9 || i === (frame + 7) % 9)
              ? 'text-blue-600'
              : 'text-zinc-800'
          }
        >
          ·
        </span>
      ))}
    </span>
  );
}

export function TerminalApp() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeReport, setActiveReport] = useState<OsintReport | null>(null);
  const [thoughtTime, setThoughtTime] = useState(0);
  const [providerInfo, setProviderInfo] = useState<{ type: string; model: string; status: string } | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isMounted = useRef(true);
  const logIdCounter = useRef(0);
  const thoughtTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    isMounted.current = true;
    addLog('System initialized. Agent-X OSINT platform ready.', 'info');
    addLog('Type "help" for available commands.', 'info');
    fetch('/api/status')
      .then(r => r.json())
      .then(d => {
        if (isMounted.current) {
          setProviderInfo({ type: d.provider, model: d.model, status: d.aiStatus });
        }
      })
      .catch(() => {});
    return () => { isMounted.current = false; };
  }, []);

  // Start/stop thought timer when processing changes
  useEffect(() => {
    if (isProcessing) {
      setThoughtTime(0);
      thoughtTimerRef.current = setInterval(() => {
        setThoughtTime(t => t + 100);
      }, 100);
    } else {
      if (thoughtTimerRef.current) clearInterval(thoughtTimerRef.current);
    }
    return () => { if (thoughtTimerRef.current) clearInterval(thoughtTimerRef.current); };
  }, [isProcessing]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        document.activeElement !== inputRef.current &&
        document.activeElement.tagName === 'INPUT'
      ) return;

      if (['F1', 'F2', 'F5', 'F9', 'F12'].includes(e.key)) {
        e.preventDefault();
      } else return;

      if (e.key === 'F12') {
        addLog('Session terminated.', 'warn');
        if (isMounted.current) {
          setIsProcessing(false);
          setLogs([]);
          setActiveReport(null);
        }
        return;
      }

      if (isProcessing) return;

      switch (e.key) {
        case 'F1':
          addLog('> help', 'input');
          addLog('Available commands:', 'info');
          addLog('  help             - Show this help message', 'info');
          addLog('  clear            - Clear terminal output', 'info');
          addLog('  scan <target>    - Initiate AI-driven OSINT scan on target (IP, Domain, Email)', 'info');
          addLog('  status           - Check agent and system status', 'info');
          break;
        case 'F2':
          setInputValue('scan ');
          inputRef.current?.focus();
          break;
        case 'F5':
          setLogs([]);
          setActiveReport(null);
          break;
        case 'F9':
          if (activeReport) {
            addLog('> report', 'input');
            addLog(`Last report: ${activeReport.target.value} — ${activeReport.threatLevel}`, 'success');
            activeReport.findings.forEach(f => addLog(f, 'info'));
          } else {
            addLog('No active report.', 'error');
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeReport, isProcessing]);

  // Auto-scroll
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, isProcessing, activeReport]);

  const addLog = (text: string, type: LogEntry['type'] = 'info') => {
    if (!isMounted.current) return;
    setLogs(prev => [
      ...prev,
      {
        id: `log-${logIdCounter.current++}`,
        timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
        text,
        type,
      },
    ]);
  };

  const handleCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isProcessing) return;

    const cmd = inputValue.trim();
    setInputValue('');
    addLog(`> ${cmd}`, 'input');

    const [action, ...args] = cmd.split(' ');

    if (action.toLowerCase() === 'help') {
      addLog('Available commands:', 'info');
      addLog('  help             - Show this help message', 'info');
      addLog('  clear            - Clear terminal output', 'info');
      addLog('  scan <target>    - Initiate AI-driven OSINT scan on target (IP, Domain, Email)', 'info');
      addLog('  status           - Check agent and system status', 'info');
      return;
    }

    if (action.toLowerCase() === 'clear') {
      setLogs([]);
      setActiveReport(null);
      return;
    }

    if (action.toLowerCase() === 'status') {
      addLog('Checking agent status...', 'info');
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const response = await fetch('/api/status', { signal: controller.signal });
        clearTimeout(timeoutId);
        const data = await response.json();
        addLog('Agent Core: ONLINE', 'success');
        addLog('Agent-X OSINT Platform v5.0', 'info');
        const provider = data.provider || 'unknown';
        const model = data.model || 'unknown';
        setProviderInfo({ type: provider, model, status: data.aiStatus });
        if (data.aiStatus === 'NOT_CONFIGURED') {
          addLog(`${provider} API: NOT CONFIGURED — add ${provider.toUpperCase()}_API_KEY to .env`, 'error');
        } else if (data.aiStatus === 'CONNECTED') {
          addLog(`${provider} API: CONNECTED (${model})`, 'success');
        } else if (data.aiStatus === 'ERROR') {
          addLog(`${provider} API: ERROR — ${data.reason}`, 'warn');
        }
      } catch (err: unknown) {
        addLog(`Failed to fetch status: ${err instanceof Error ? err.message : 'unknown'}`, 'error');
      }
      return;
    }

    if (action.toLowerCase() === 'scan') {
      if (args.length === 0) {
        addLog('Missing target. Usage: scan <target>', 'error');
        return;
      }
      const targetStr = args.join(' ');
      let type: OsintTarget['type'] = 'domain';
      if (targetStr.includes('@')) type = 'email';
      else if (/^\d{1,3}(\.\d{1,3}){3}$/.test(targetStr)) type = 'ip';
      else if (!targetStr.includes('.')) type = 'username';
      await runScan({ type, value: targetStr });
      return;
    }

    addLog(`Command not found: ${action}. Type "help" for a list of commands.`, 'error');
  };

  const runScan = async (target: OsintTarget) => {
    setIsProcessing(true);
    setActiveReport(null);
    addLog(`Initializing scan on [${target.type}]: ${target.value}`, 'warn');

    try {
      addLog('Running network resolution, DNS, GeoIP, and AI analysis...', 'info');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const response = await fetch('/api/osint/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await response.json();
      if (!isMounted.current) return;
      if (!response.ok) throw new Error(data.error || 'Server error');

      const report: OsintReport = data.report;
      if (report) {
        addLog('Analysis complete.', 'success');
        setActiveReport(report);
      }
    } catch (err) {
      if (!isMounted.current) return;
      addLog(`Scan failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    } finally {
      if (isMounted.current) {
        setIsProcessing(false);
        setTimeout(() => isMounted.current && inputRef.current?.focus(), 100);
      }
    }
  };

  // ─── Render helpers ───────────────────────────────────────────

  const getThreatColor = (level: string) => {
    switch (level) {
      case 'CRITICAL': return 'text-red-400';
      case 'HIGH':     return 'text-orange-400';
      case 'MEDIUM':   return 'text-amber-400';
      case 'LOW':      return 'text-emerald-400';
      default:         return 'text-zinc-400';
    }
  };

  const renderLog = (log: LogEntry) => {
    // User input — boxed with indigo left border
    if (log.type === 'input') {
      return (
        <div key={log.id} className="border-l-2 border-indigo-500 bg-zinc-950 pl-3 pr-4 py-2 my-2">
          <span className="text-zinc-600 select-none text-[12px]">agent-x@osint:~$ </span>
          <span className="text-zinc-100 text-[12px]">
            {log.text.startsWith('> ') ? log.text.slice(2) : log.text}
          </span>
        </div>
      );
    }

    const styles: Record<LogEntry['type'], { prefix: string; color: string }> = {
      success: { prefix: '+', color: 'text-emerald-400' },
      info:    { prefix: '-', color: 'text-zinc-500' },
      warn:    { prefix: '!', color: 'text-amber-400' },
      error:   { prefix: '×', color: 'text-red-400' },
      input:   { prefix: '$', color: 'text-zinc-100' }, // fallback
    };

    const { prefix, color } = styles[log.type] ?? styles.info;

    return (
      <div key={log.id} className="flex gap-3 px-1 py-[2px] hover:bg-white/[0.015] rounded group">
        <span className={`shrink-0 text-[12px] w-3 text-center mt-[1px] ${color} select-none`}>
          {prefix}
        </span>
        <span className={`text-[12px] leading-relaxed break-words flex-1 ${color}`}>
          {log.text}
        </span>
        <span className="text-[10px] text-zinc-800 group-hover:text-zinc-700 shrink-0 mt-[2px] hidden sm:block">
          {log.timestamp}
        </span>
      </div>
    );
  };

  const renderReport = (report: OsintReport) => (
    <div className="my-3 border border-zinc-800 text-[12px]">
      {/* Report header */}
      <div className="bg-zinc-950 border-b border-zinc-800 px-4 py-2 flex items-center justify-between">
        <span className="text-zinc-500"># Threat Assessment — {report.target.value}</span>
        <span className={`font-bold ${getThreatColor(report.threatLevel)}`}>
          {report.threatLevel}
        </span>
      </div>

      {/* Meta row */}
      <div className="px-4 py-3 grid grid-cols-2 gap-4 border-b border-zinc-900">
        <div>
          <div className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1">Target</div>
          <div className="text-zinc-300 break-all">{report.target.value}</div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1">Type</div>
          <div className="text-emerald-400 uppercase">{report.target.type}</div>
        </div>
      </div>

      {/* Narrative */}
      <div className="px-4 py-3 border-b border-zinc-900">
        <div className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Summary</div>
        <div className="text-zinc-400 leading-relaxed border-l border-zinc-700 pl-3">
          {report.narrative}
        </div>
      </div>

      {/* Findings */}
      <div className="px-4 py-3">
        <div className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Findings</div>
        <div className="space-y-1">
          {report.findings.map((f, i) => (
            <div
              key={`finding-${i}-${f.slice(0, 15)}`}
              className="flex gap-2 text-zinc-300"
            >
              <span className="text-zinc-700 shrink-0 select-none">·</span>
              <span>{f}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const hasUserInteracted = logs.some(l => l.type === 'input');
  const thoughtDisplay =
    thoughtTime < 1000
      ? `${thoughtTime}ms`
      : `${(thoughtTime / 1000).toFixed(1)}s`;

  // ─── JSX ──────────────────────────────────────────────────────

  return (
    <div className="w-full h-screen bg-[#0a0a0a] text-zinc-300 font-mono flex flex-col overflow-hidden">

      {/* Minimal top bar */}
      <div className="px-4 py-1.5 border-b border-zinc-900 flex items-center justify-between shrink-0">
        <span className="text-zinc-700 text-[11px] tracking-widest">agent-x</span>
        <div className="flex gap-4 text-[10px] text-zinc-800">
          <span>F1 help</span>
          <span>F5 clear</span>
          <span>F9 report</span>
          <span>F12 reset</span>
        </div>
      </div>

      {/* Log area */}
      <div
        className="flex-1 overflow-y-auto custom-scrollbar"
        onClick={() => inputRef.current?.focus()}
      >
        {/* Splash — shown before first user command */}
        {!hasUserInteracted && (
          <div className="flex flex-col items-center justify-center py-20 opacity-30 select-none pointer-events-none">
            <div className="text-[40px] font-bold tracking-tight text-zinc-500 leading-none">
              agent-x
            </div>
            <div className="text-[11px] text-zinc-700 mt-2 tracking-widest uppercase">
              OSINT Intelligence Platform
            </div>
          </div>
        )}

        <div className="px-4 py-3 space-y-0">
          {logs.map(renderLog)}
        </div>

        {/* Thought indicator (processing) */}
        {isProcessing && (
          <div className="px-4 py-1 flex items-center gap-2">
            <span className="text-amber-500 text-[12px]">+ Thought: {thoughtDisplay}</span>
            <span className="text-amber-700 animate-pulse text-[11px]">·</span>
          </div>
        )}

        {/* Inline report */}
        {activeReport && (
          <div className="px-4 pb-2 animate-fade-in">
            {renderReport(activeReport)}
          </div>
        )}

        <div ref={logsEndRef} />
      </div>

      {/* Input area */}
      <div className="px-4 pt-2 pb-4 border-t border-zinc-900 shrink-0">
        <form onSubmit={handleCommand}>
          {/* Input box — blue left border like OpenCode */}
          <div className="border-l-2 border-blue-600 pl-3 bg-zinc-950 py-2 pr-3">
            <div className="flex items-center gap-1">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
                disabled={isProcessing}
                className="flex-1 bg-transparent border-none outline-none text-zinc-100 placeholder-zinc-700 caret-blue-400 text-[13px]"
                placeholder={isProcessing ? '' : 'Ask anything... "scan example.com"'}
                autoFocus
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            {/* Model label — dynamic from /api/status */}
            <div className="text-[10px] text-zinc-700 mt-1 flex items-center gap-1">
              <span className="text-blue-700">Build</span>
              <span>·</span>
              <span className="font-semibold">Agent-X</span>
              <span className="text-zinc-800">{providerInfo ? `${providerInfo.model} ${providerInfo.type}` : 'loading...'}</span>
            </div>
          </div>
        </form>

        {/* Status bar */}
        <div className="flex items-center justify-between mt-2 px-0.5">
          <div className="flex items-center gap-3 text-[11px] text-zinc-700">
            <DotsProgress active={isProcessing} />
            <span
              className="hover:text-zinc-500 cursor-pointer transition-colors"
              onClick={() => {
                if (isProcessing) { setIsProcessing(false); }
              }}
            >
              esc interrupt
            </span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-zinc-700">
            <span>{logs.length} entries</span>
            <span className="text-zinc-800">ctrl+p commands</span>
          </div>
        </div>
      </div>
    </div>
  );
}

