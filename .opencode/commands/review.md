---
description: Full review — ALL project files including cli-ui.mjs
---

Lakukan review menyeluruh terhadap SETIAP file proyek tanpa terkecuali.

## PENTING — cli-ui.mjs
File `cli-ui.mjs` adalah BUNDLE hasil build dari `cli-ui.tsx` + semua tools.
Dia HARUS konsisten dengan source files. Cek:
- Isi fungsi/provider/model selector cocok dengan `provider.ts`?
- UPDATE lebih baru atau lebih lama dari source TSX?
- Apa ada fitur di source yang tidak kebundle?
- Apakah isinya benar-benar hasil rebuild terkini?

## WAJIB — Automatisasi
1. `tsc --noEmit` — laporkan semua TypeScript errors
2. `vitest run` — laporkan hasil test
3. `python3 -m py_compile` untuk SETIAP file .py di `tools/ig/`

## Daftar LENGKAP File — Baca SATU PER SATU

### ROOT (24 file)
1. `cli.ts` — readline CLI, command routing, AI streaming, progress system
2. `cli-ui.tsx` — Ink UI, React state, tab completion, chat mode, reconnect
3. **`cli-ui.mjs`** — ⭐ BUNDLE dari cli-ui.tsx, WAJIB cek konsistensi
4. `server.ts` — Express server, CSRF, rate limit, AI provider, reload endpoint
5. `server.test.ts` — unit test vitest
6. `vite.config.ts` — Vite + Tailwind build config
7. `tsconfig.json` — TypeScript strict config
8. `package.json` — dependencies + scripts (build:cli untuk rebuild mjs)
9. `package-lock.json` — lockfile
10. `opencode.json` — OpenCode command definitions
11. `index.html` — Vite SPA entry
12. `.env` — environment variables (API keys, credentials)
13. `.env.example` — template env
14. `.gitignore` — git ignore rules
15. `.project-info.md` — project structure docs
16. `metadata.json` — AI Studio metadata
17. `README.md` — project readme
18. `log.txt` — runtime log (Instagram error trace)
19. `fix-bundle.cjs` — build fix script (no-op)
20. `test-ink.tsx` — Ink test source
21. `test-ink.mjs` — Ink test ESM
22. `test-ink.cjs` — Ink test CommonJS
23. `test2.mjs` — Ink test
24. `backup.zip` — binary archive (skip content, sebutkan aja)

### src/ (6 file)
25. `src/main.tsx` — React 19 entry
26. `src/App.tsx` — root component
27. `src/index.css` — Tailwind + custom scrollbar
28. `src/types.ts` — OsintTarget, OsintReport
29. `src/utils.ts` — GeoIP, DNS, validation, resolveTargetData
30. `src/components/TerminalApp.tsx` — web terminal UI (459 line)

### tools/ (14 file)
31. `tools/orchestrator.ts` — Python/TS tool bridge (runIG, runScan, runSherlock)
32. `tools/scan/index.ts` — DNS + GeoIP scanner
33. `tools/sherlock/index.ts` — cross-platform username search (7 platform)
34. `tools/terminal/index.ts` — 10 sandboxed file/shell tools
35. **`tools/ai-agent/index.ts`** — agent runtime, function calling loop
36. **`tools/ai-agent/shared.ts`** — system prompt + analyzeWithAI functions
37. **`tools/ai-agent/provider.ts`** — AI provider abstraction (Gemini/OpenRouter/Zen)
38. `tools/shared/types.ts` — shared type definitions
39. `tools/ig/main.py` — IG profile scraper
40. `tools/ig/ig_followers.py` — IG followers list
41. `tools/ig/ig_following.py` — IG following list
42. `tools/ig/ig_media.py` — posts + comments + likers
43. `tools/ig/ig_download.py` — download photo/video/album
44. `tools/ig/requirements.txt` — Python deps

### public/ (1 file)
45. `public/favicon.svg` — terminal favicon

### .opencode/ (4 file)
46. `.opencode/commands/review.md` — THIS FILE
47. `.opencode/commands/check-ig.md` — IG check prompt
48. `.opencode/package.json` — opencode plugin deps
49. `.opencode/.gitignore` — opencode ignore

### .venv/ (2 file)
50. `.venv/pyvenv.cfg` — Python 3.13.7 venv config
51. `.venv/.gitignore` — venv ignore

## Yang WAJIB Dicek PER FILE
1. Logic errors / race conditions / infinite loops
2. Path dan import inconsistencies (relative path, extension, bare specifier)
3. Missing error handling (unhandled promise, missing try/catch)
4. Type mismatches: camelCase vs snake_case antar Python, unsafe type assertions
5. Dead code / unused variables / unreachable branches
6. Security: hardcoded secrets, path traversal, command injection
7. API contract inconsistencies (client vs server request/response)
8. Provider/model mismatch: apakah model string cocok dengan provider yang aktif?
9. `cli-ui.mjs` vs `cli-ui.tsx`: apakah bundle konsisten dengan source?

## Output
Buat tabel per file dengan status ✅ / ⚠️ / ❌ dan alasan singkat.
JANGAN edit file apapun. Cuma lapor.
