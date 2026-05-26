# Agent-X: Rencana Agentik

> Dokumen ini adalah "life rencana" — catatan kerja agar AI lain bisa melanjutkan.
> Update document ini setiap ada perubahan signifikan.

---

## Status Saat Ini

**Project**: OSINT Agent-X — AI-powered OSINT tool dengan 3 UI (CLI, React, API).
**Tahun**: 2026
**Masalah utama**: AI agent di chat mode terasa **"kaku"** — tidak bisa melakukan investigasi berantai secara mandiri.

---

## Arsitektur Lengkap

```
cli-ui.tsx (React/Ink UI)
├── Command Mode         → ig, followers, following, media, scan, similar
└── Chat Mode            → startAgent (tools/ai-agent/index.ts)
    └── agentTools = [
        ...terminalTools,           ← read/write/run_command/dll
        ...osintTools,              ← ig_profile, ig_media, scan, similar
        ...agentInvestigationTools  ← init_investigation, add_finding, get_investigation_summary
    ]

tools/orchestrator.ts (bridge)
├── runIG(username)              → main.py (profil + 100 following + 100 followers)
├── runIGFollowers(username)     → ig_followers.py (100 followers)
├── runIGFollowing(username)     → ig_following.py (100 following)
├── runIGMedia(username, amount) → ig_media.py (posts + comments + likers)
├── runIGDownload(username)      → ig_download.py (download media)
├── runScan(target)              → scan/index.ts (DNS/GeoIP)
└── runSherlock(username)        → sherlock/index.ts (cross-platform)

tools/ig/*.py (Python scraper)
├── main.py          ← profil IG + 100 following + 100 followers
├── ig_followers.py  ← followers list
├── ig_following.py  ← following list
├── ig_media.py      ← posts + comments + likers
└── ig_download.py   ← download media
```

---

## Yang Udah Dilakukan

### Fix Bug
- **Fix #1** `cli-ui.tsx:598` — removed `if (!isChatModeRef.current)` guard → chat mode ga stuck "running..."
- **Fix #2** `tools/ai-agent/provider.ts` + `tools/ai-agent/index.ts` — Zen/DeepSeek `reasoning_content` 400 error
- **Fix #3** `tools/ai-agent/index.ts:19` — SESSION_TIMEOUT_MS 300s→600s
- **Fix #4** `tools/orchestrator.ts:31` — Python timeout 180s→600s

### Investigasi Manual Target
- Full profile (followers, following, posts bertema institusi)
- Cross-reference: @akun_kelas teridentifikasi (nama kelas, angkatan)
- Followers akun kelas → seluruh siswa teridentifikasi
- Following akun kelas → guru + akun sekolah teridentifikasi
- Akun guru (private)
- Akun sekolah official (lokasi, kontak)
- TikTok target terdeteksi (similar tool)
- **Ini yang AI belum bisa lakukan sendiri.**

---

## Akar Masalah "Kaku"

### 1. Tools yang Hilang di Agent (`tools/ai-agent/index.ts:80-170`)

```typescript
const osintTools: ToolFn[] = [
  { name: 'ig_profile', ... },     // ✅ ADA - panggil main.py
  { name: 'scan', ... },           // ✅ ADA
  { name: 'ig_media', ... },       // ✅ ADA
  { name: 'similar', ... },        // ✅ ADA
  // { name: 'ig_followers', ... }, // ❌ TIDAK ADA - padahal runIGFollowers ada!
  // { name: 'ig_following', ... }, // ❌ TIDAK ADA - padahal runIGFollowing ada!
];
```

**Efek**: AI tidak bisa chain-investigation. Contoh rantai yang putus:
```
ig_profile @target → nemu @akun_kelas
ig_followers @akun_kelas → ❌ TIDAK BISA
ig_following @akun_kelas → ❌ TIDAK BISA
```

### 2. Constraint Terlalu Ketat (`tools/ai-agent/index.ts`)

| Constraint | Line | Value | Masalah |
|-----------|------|-------|---------|
| `maxTurns` | 350 | 15 | 1 tool call = 1 turn. Investigasi butuh 20+ turn |
| `SESSION_TIMEOUT_MS` | 19 | 10 menit | 1x ig_followers = 2 menit. 6x panggil + analisis = >10 menit |
| `run_command` confirm | terminal/index.ts:290 | Selalu | Tiap perintah Python butuh confirm user |
| `write_file` confirm | terminal/index.ts:170 | Selalu | Tiap buat script butuh confirm |

### 3. `ig_profile` Return Data Minimal (`tools/ig/main.py:52-70`)

- `followerList` cuma return: username, fullName, isPrivate, isVerified — **tanpa bio, followerCount, followingCount**
- `followingList` juga minimal
- Padahal `ig_followers.py` dan `ig_following.py` return lebih lengkap

### 4. System Prompt Tahu Tapi Ga Bisa (`tools/ai-agent/shared.ts`)

- Baris 26-29: udah menyebut path `ig_followers.py` dan `ig_following.py`
- Baris 138-166 (Skenario 2): "ig_followers akun kelas → dapat semua follower"
- **AI tahu apa yang harus dilakukan** tapi **tidak punya functionDeclarations** untuk melakukannya

---

---

## ✅ Sudah Diimplementasikan (2026-05-26)

| # | Perubahan | File | Status |
|---|-----------|------|--------|
| A | `ig_followers` + `ig_following` ditambah ke `osintTools` | `tools/ai-agent/index.ts:153-188` | ✅ |
| B | `run_command` auto-approve untuk read-only commands | `tools/terminal/index.ts:233-241, 296-299` | ✅ |
| C | `maxTurns: 15→50`, `SESSION_TIMEOUT: 10m→60m`, retry IG: 1→2 | `tools/ai-agent/index.ts:19,42,354` | ✅ |
| D | System prompt update — tool list, prosedur expand, read-only policy | `tools/ai-agent/shared.ts` | ✅ |
| E | **Memory system** — AI belajar dari pengalaman lintas sesi | `tools/ai-agent/memory.ts` + `index.ts` | ✅ |

### Detail Implementasi

**A — Tools Baru di Agent:**
```typescript
// tools/ai-agent/index.ts
import { runIGFollowers, runIGFollowing } from '../orchestrator';

// osintTools tambahan:
{ name: 'ig_followers', execute: (args) => runIGFollowers(args.username) }
{ name: 'ig_following', execute: (args) => runIGFollowing(args.username) }
```

**B — Auto-approve Read-Only:**
```typescript
// tools/terminal/index.ts
const READONLY_PREFIXES = [
  'python3 tools/ig/',   // scraping tools — auto jalan
  'python3 tools/custom/', // custom analysis — auto jalan
  'cat ', 'ls ', 'head ', 'tail ', 'sort ',
  'echo ', 'date ', 'whoami', 'hostname',
  'ping ', 'nslookup ', 'dig ',
  'curl ', 'wget ',
  'git log', 'git status', 'git diff',
];
// Semua command di atas: TANPA confirm user
// Write_file, append_file, delete_file + run_command non-readonly: tetap confirm
```

**C — Limit Naik:**
```typescript
SESSION_TIMEOUT_MS = 60 * 60 * 1000;  // 10m → 60m
maxRetries IG: 1 → 2  // lebih tahan timeout
maxTurns: 15 → 50      // cukup untuk chain 5-6 level
```

---

### E — Memory System

**File baru**: `tools/ai-agent/memory.ts` + `tools/ai-agent/memory.json`

AI bisa **belajar dari pengalaman** lintas sesi. Cara kerja:

1. **Auto-load**: Saat `init_investigation` dipanggil, 8 memori paling relevan otomatis dimuat ke context
2. **Save**: AI panggil `save_memory` setelah menemukan pola berharga
3. **Query**: `load_memories` untuk cari pola spesifik
4. **Anonim**: WAJIB hanya simpan pola/strategi — TIDAK BOLEH username/nama asli

```typescript
// tools/ai-agent/memory.ts
interface MemoryEntry {
  id: string;
  category: string;     // akun_institusi | pola_nama | strategi | tool_chain | indikator | korelasi
  pattern: string;      // "Akun dengan bio 'X students' adalah akun kelas"
  confidence: 'high' | 'medium' | 'low';
  tags: string[];        // ["sekolah", "kelas"]
  createdAt: number;
  lastUsed: number;
  useCount: number;
}
```

**Tools baru di agent**:
- `save_memory(pattern, category, confidence, tags)` — simpan pola anonim
- `load_memories(category?, tags?, limit?)` — cari pola relevan
- `memory_stats()` — lihat statistik

**Contoh isi memori yang baik** (tanpa PII):
```
[high] akun_institusi: Akun dengan pola nama XI/XII + PEMINATAN/IPA/IPS = akun kelas SMA
[high] strategi: Chain ig_followers akun kelas + ig_following target = teman sekelas
[medium] indikator: Bio "X students, part of @sekolah" mengonfirmasi akun kelas
[high] tool_chain: ig_followers akun_mading + ig_following target = cross-reference circle
```

---

## Sisa yang Belum Dikerjakan

| # | Item | Prioritas | Catatan |
|---|------|-----------|---------|
| 1 | `write_file` auto-approve untuk `tools/custom/` | Medium | Biar bikin script kustom tanpa confirm |
| 2 | `ig_profile` diperkuat return data lebih detail | Low | Sekarang udah cukup dgn tools terpisah |
| 3 | Test chat mode: `selidiki @target` | **High** | Perlu diverifikasi chain jalan mulus |

## Proposal Solusi Maksimal (referensi)

### A. Tambah Tools ke Agent (`tools/ai-agent/index.ts`)

Tambahkan di `osintTools` array (setelah `similar` tool):

```typescript
{
  name: 'ig_followers',
  description: 'Ambil daftar followers Instagram.',
  parameters: {
    type: 'object',
    properties: {
      username: { type: 'string', description: 'Instagram username' }
    },
    required: ['username']
  },
  execute: async (args) => runIGFollowers(String(args.username))
}
```

Sama untuk `ig_following`. Juga perkuat `ig_profile` supaya return followers/following lebih detail (atau merge data dari main.py + followers.py).

### B. Auto-Approve Read-Only Commands (`tools/terminal/index.ts`)

Modifikasi `runCommandTool` agar **read-only commands tidak perlu confirm**.

**Read-only** (auto-approve):
```
python3 tools/ig/*.py        ← scraping tools
python3 tools/custom/*.py    ← custom analysis
python3 tools/*.py           ← tools lain
cat, ls, head, tail, sort    ← read-only shell
curl, wget                    ← fetch
dig, nslookup, ping, whoami   ← network
echo, date                    ← info
git log, git status           ← read-only git
```

**Write/destructive** (tetap confirm):
```
write_file, append_file       ← write operations
rm, mv, cp                    ← filesystem mods
git push, git commit          ← git write
python3 (script di luar tools/) ← unknown script
```

Cara implementasi: tambah `allowList` untuk argumen/command pattern yang auto-approve. Bisa juga parameter `readonly: true` di tool definition.

### C. Naikin Limit (`tools/ai-agent/index.ts`)

```typescript
const MAX_HISTORY_LENGTH   = 100;        // OK
const MAX_HISTORY_TOKENS   = 100_000;    // OK
const SESSION_TIMEOUT_MS   = 60 * 60 * 1000;   // 10m → 60m
// ...
const maxTurns = 50; // 15 → 50
```

Juga: retry untuk `ig_` tools dinaikin dari 1 ke 2.

### D. Perkuat System Prompt (`tools/ai-agent/shared.ts`)

Tambah arahan spesifik:
- "Kamu punya akses ke `ig_followers` dan `ig_following` — pakai untuk ekspansi"
- "Ikuti setiap lead sampai mentok"
- "Buat script kustom Python di `tools/custom/` untuk analisis lanjutan"
- "Jangan berhenti di layer 1 — cek followers orang, cek postingan, cari pola"

---

## File yang Perlu Diubah

| File | Perubahan |
|------|-----------|
| `tools/ai-agent/index.ts:80-170` | Tambah `ig_followers` + `ig_following` ke `osintTools` |
| `tools/ai-agent/index.ts:350` | `maxTurns: 15 → 50` |
| `tools/ai-agent/index.ts:19` | `SESSION_TIMEOUT_MS: 600000 → 3600000` |
| `tools/terminal/index.ts:256-315` | Auto-approve read-only commands |
| `tools/ai-agent/shared.ts` | Update system prompt + tool list |
| `tools/ig/main.py:63-67` | (Optional) return followers/following lebih lengkap |

---

## Cara Test

1. `npm run cli` → `chat` → `selidiki @target`
2. AI harus bisa chain: profil → followers → nemu akun kelas → followers akun kelas → siswa
3. Tanpa interupsi confirm dari user (kecuali write/destructive)
4. Selesai dalam 1 sesi (tidak timeout)
5. Laporan: ringkasan + key findings + connection chain + gaps

---

## Catatan Penting

- **.gitignore**: `tools/custom/` harus di-gitignore (script temporary)
- **Session file**: `.agent-x-ig-session.json` ada di `/tmp/` — auto-clean
- **Log**: audit log di `/tmp/.agent-x/audit.log`
- **Env**: `.env` (git-ignored) berisi IG_USERNAME, IG_PASSWORD/IG_SESSIONID, ZEN_API_KEY/GEMINI_API_KEY

---

## Referensi Kode Penting

```
# Agent runtime
tools/ai-agent/index.ts:80-170    → osintTools definisi
tools/ai-agent/index.ts:343       → agentTools = gabungan semua
tools/ai-agent/index.ts:345-508   → sendMessage → agent loop
tools/ai-agent/index.ts:350       → maxTurns
tools/ai-agent/index.ts:372-386   → contents mapping
tools/ai-agent/index.ts:406-413   → response handling
tools/ai-agent/index.ts:19        → SESSION_TIMEOUT_MS

# Terminal tools
tools/terminal/index.ts:256-315   → runCommandTool (confirm logic)
tools/terminal/index.ts:290       → ctx.confirm → ini yang harus auto-approve
tools/terminal/index.ts:336-484   → terminalTools array

# System prompt
tools/ai-agent/shared.ts:3-254    → SYSTEM_PROMPT lengkap

# Memory system
tools/ai-agent/memory.ts          → MemoryStore (CRUD memory.json)
tools/ai-agent/memory.json        → Persistent memory file (auto-created)
tools/ai-agent/index.ts:init_investigation → auto-load memories

# Python scripts
tools/ig/main.py:52-70           → profile data structure
tools/ig/ig_followers.py:55-62   → followers data structure
tools/ig/ig_following.py:55-62   → following data structure

# CLI UI
cli-ui.tsx:507-531               → startAgent initialization
cli-ui.tsx:537-560               → handleChatMessage (send + receive)
cli-ui.tsx:509-514               → confirm callback
```
