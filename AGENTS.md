# OSINT Agent-X — Project Guide

## Overview
AI-powered OSINT tool with 3 UI modes: CLI (Ink), Web (React/Vite), API (Express). Uses Gemini/OpenRouter/Zen AI to orchestrate Instagram scraping, DNS/GeoIP scanning, cross-platform username search, and sandboxed terminal.

## Quick Start
```bash
npm run dev      # Web UI + API (localhost:3000)
npm run cli      # Interactive CLI (Ink terminal)
npm run build    # Production build (dist/)
npm start        # Run production server
```

## Architecture

```
cli-ui.tsx ──── Ink (React for terminal) ───┐
src/main.tsx ── React + Vite (web UI) ──────┤
server.ts ───── Express API ─────────────────┘
  │
  └── tools/orchestrator.ts ─── tool bridge
        ├── tools/ai-agent/index.ts  ← agent runtime (50-turn loop)
        │     ├── provider.ts  ← Gemini/OpenRouter/Zen abstraction
        │     ├── shared.ts   ← system prompt + analyzeWithAIStream
        │     └── memory.ts   ← persistent memory (memory.json)
        ├── tools/scan/index.ts       ← DNS + GeoIP
        ├── tools/sherlock/index.ts   ← 7-platform username check
        ├── tools/terminal/index.ts   ← sandboxed file/shell (10 tools)
        └── tools/ig/*.py            ← Instagram scraping (instagrapi)
```

## Key Commands
| Command | Description |
|---------|------------|
| `ig <user>` | Instagram profile + AI analysis |
| `similar <user>` | Cross-platform search |
| `scan <target>` | DNS/GeoIP + AI |
| `chat` | Agentic AI mode (autonomous investigation) |
| `reconnect` | Reload AI provider from .env |

## Dependencies
- **React 19** — UI (both Ink CLI & web)
- **Ink 7** — React for terminal
- **Vite 6** — Build/dev server
- **Express 4** — API
- **@google/genai** — Gemini SDK
- **instagrapi** — Python Instagram API
- **tsx** — TypeScript execution

## AI Provider
`.env` → `AI_PROVIDER=gemini|openrouter|zen` with `*_API_KEY`. Provider created at startup via `createAIProvider()`.

## Conventions
- `.tsx` = JSX components; `.ts` = pure logic
- Python scripts output JSON via `out()` to stdout
- All file paths in agent tools use `tools/terminal/index.ts` sandbox (allowlist + path guard)
- Memory stored in `memory.json`, auto-loaded on investigation start
- `.env` never committed; `.env.example` is the template

## Tests
```bash
npm test    # vitest run (server.test.ts)
npm run lint  # tsc --noEmit
```

## Important Files
| File | Purpose |
|------|---------|
| `cli-ui.tsx` | CLI entry (574 lines) |
| `cli-ui-commands.tsx` | CLI command handlers (260 lines) |
| `cli-ui-investigation.tsx` | Chat/investigation UI (270 lines) |
| `tools/ai-agent/index.ts` | Agent runtime, function calling loop (624 lines) |
| `tools/ai-agent/provider.ts` | AI provider abstraction (Gemini/OpenRouter/Zen) |
| `tools/ai-agent/shared.ts` | System prompt + stream helpers |
| `tools/terminal/index.ts` | Sandboxed terminal tools (503 lines) |
| `tools/orchestrator.ts` | Python/TS tool bridge |
| `server.ts` | Express API + rate limiting |
| `src/components/TerminalApp.tsx` | Web terminal UI (471 lines) |
