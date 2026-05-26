# OSINT Agent-X

AI-powered OSINT tool with 3 UI modes: **CLI** (Ink terminal), **Web** (React/Vite), **API** (Express). Uses Gemini/OpenRouter/Zen AI to orchestrate Instagram scraping, DNS/GeoIP scanning, cross-platform username search, and sandboxed terminal.

## Features

- **Instagram OSINT** — profile, followers, following, posts/comments/likers, media download
- **DNS/GeoIP Scan** — domain resolution, MX records, GeoIP location, ASN info
- **Cross-Platform Search** — check username on 7 platforms (GitHub, GitLab, Reddit, TikTok, Medium, Vimeo, VK)
- **AI Agent Mode** — autonomous investigation loop with function calling (50-turn max, chain analysis)
- **Memory System** — AI learns patterns across sessions (saved to `memory.json`)
- **Sandboxed Terminal** — allowlisted commands, path guard, no-shell `spawn`, auto-approve for read-only
- **3 AI Providers** — Gemini, OpenRouter, or Zen (OpenCode)

## Quick Start

### Prerequisites
- Node.js 22+
- Python 3.10+
- Instagram account (for IG tools)

### Install & Run

```bash
# Clone
git clone https://github.com/yourusername/osint-agent-x.git
cd osint-agent-x

# Install all dependencies (Node + Python + build)
chmod +x install.sh && ./install.sh

# Copy & edit .env
cp .env.example .env
# Edit .env with your API keys (see below)
```

### Run CLI (Terminal UI)

```bash
# Development mode (with tsx):
npm run cli

# Production mode (bundled .mjs - RECOMMENDED for stability):
npm run build:cli
node cli-ui.mjs
```

### Run Web UI + API

```bash
npm run dev
# Open http://localhost:3000
```

### Run Production Server

```bash
npm run build
npm start
```

## .env Configuration

Create `.env` from `.env.example`:

```env
# AI Provider: "gemini" (default), "openrouter", or "zen"
AI_PROVIDER="gemini"

# Gemini (default)
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_MODEL="gemini-2.5-flash"

# OpenRouter (alternative)
# OPENROUTER_API_KEY="sk-or-v1-..."
# OPENROUTER_MODEL="opencode/big-pickle"

# Zen (alternative - https://opencode.ai/auth)
# ZEN_API_KEY="zen-..."
# ZEN_MODEL="big-pickle"

# Instagram (required for IG tools)
IG_USERNAME="your-instagram-username"
IG_PASSWORD="your-instagram-password"
# OR use session ID (from browser cookies):
# IG_SESSIONID="your-session-id"

# GitHub (optional - increases rate limit to 5000/hr)
# GITHUB_TOKEN="your-github-token"
```

## Commands

| Command | Description |
|---------|-------------|
| `ig <user>` | Instagram profile + AI analysis |
| `followers <user>` | Instagram followers list |
| `following <user>` | Instagram following list |
| `media <user> [n]` | Instagram posts + comments |
| `download <user> [n]` | Download Instagram media |
| `similar <user>` | Cross-platform username search |
| `scan <target>` | DNS/GeoIP + AI analysis |
| `chat` | Agentic AI investigation mode |
| `reconnect` | Reload AI provider from .env |
| `depth 1/2/3` | Set investigation depth |
| `help` | Show commands |
| `clear` | Clear screen |
| `exit` | Exit |

### Chat Mode

The `chat` command starts an autonomous AI agent that can chain investigations:

```
investigate @target
```

The agent will:
1. Get Instagram profile + followers + following
2. Identify institution/class accounts
3. Expand to related accounts
4. Cross-reference with other platforms
5. Save patterns to memory
6. Generate investigation report

## Termux (Android)

This tool runs on Termux with **proot**. Install proot first:

```bash
pkg install proot proot-distro
# Then run the CLI inside proot:
proot -0 node cli-ui.mjs
```

The bundled `.mjs` file (`cli-ui.mjs`) is recommended for Termux because:
- No TypeScript compilation needed
- Single-file bundle
- More memory-efficient
- Works better with proot

Build it:
```bash
npm run build:cli
node cli-ui.mjs
```

## Architecture

```
cli-ui.tsx ──── Ink (React for terminal) ───┐
src/main.tsx ── React + Vite (web UI) ──────┤
server.ts ───── Express API ─────────────────┘
  │
  └── tools/orchestrator.ts ─── tool bridge
        ├── tools/ai-agent/     ← agent runtime (50-turn loop)
        │     ├── index.ts      ← function calling loop + retry + audit
        │     ├── provider.ts   ← Gemini/OpenRouter/Zen abstraction
        │     ├── shared.ts     ← system prompt + stream helpers
        │     └── memory.ts     ← persistent memory (memory.json)
        ├── tools/scan/         ← DNS + GeoIP
        ├── tools/sherlock/     ← 7-platform username check
        ├── tools/terminal/     ← sandboxed file/shell (10 tools)
        └── tools/ig/*.py       ← Instagram scraping (instagrapi)
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run cli` | CLI dev mode (tsx) |
| `npm run dev` | Web UI + API dev server |
| `npm run build` | Build for production |
| `npm start` | Run production server |
| `npm run build:cli` | Build CLI bundle (cli-ui.mjs) |
| `npm test` | Run tests |
| `npm run lint` | TypeScript type check |

## Notes

- `.env` is gitignored — never commit secrets
- `tools/custom/` is gitignored — for temporary analysis scripts
- Python scripts output JSON to stdout via `out()`
- Session files stored in `/tmp/.agent-x-ig-session.json`
- Audit log at `/tmp/.agent-x/audit.log`
