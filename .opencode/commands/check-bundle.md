---
description: Check cli-ui.mjs consistency against source files
---

Review konsistensi **`cli-ui.mjs`** (bundle) terhadap source files.

## Baca file2 ini:
- `cli-ui.mjs`
- `cli-ui.tsx`
- `tools/ai-agent/provider.ts`
- `tools/ai-agent/index.ts`
- `tools/ai-agent/shared.ts`
- `tools/orchestrator.ts`
- `tools/scan/index.ts`
- `tools/sherlock/index.ts`
- `tools/terminal/index.ts`
- `tools/shared/types.ts`
- `src/utils.ts`
- `package.json`

## Yang WAJIB dicek:

### Provider System
- Pake `createAIProvider()` atau `new GoogleGenAI()` langsung?
- Ada `getModel()` atau masih `MODEL = () => process.env.GEMINI_MODEL`?
- Support Zen/OpenRouter/Gemini atau cuma Gemini?

### Function Sinkronisasi
- `streamAI()`, `startAgent()`, `commandIG` dll — param cocok?

### Build Freshness
- Timestamp bundle vs source? Coba `npm run build:cli` — error?
- Size before/after rebuild?

### Missing Features
- `reconnect` command? `Ctrl+R`? `getProviderInfo()` di status bar?

## Output
✅ / ⚠️ / ❌ per kategori + line numbers.

JANGAN edit file.
