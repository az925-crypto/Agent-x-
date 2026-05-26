# OSINT Agent-X

**Alat OSINT** dengan 3 tampilan: **CLI** (Ink/React di terminal), **Web** (React + Vite), **API** (Express). Bisa scrape Instagram, DNS/GeoIP, cek username di 7 platform, dan **mode AI investigasi** (50-turn loop, simpan ke memory).
---
#error/bug report  
jika mengalami bug/masalah instalasi hubungi kami +212 786-555238
---

## ⚠️ **PENTING — INSTALASI UNTUK PEMULA (Termux/Android)**

> **Kalo lo di Termux**, harus pake `proot` biar gak kena error izin. Ikuti langkah ini **step by step**:

### 1. Install proot + Ubuntu
```bash
pkg install proot proot-distro
proot-distro install ubuntu
```

### 2. Masuk Ubuntu
```bash
proot-distro login ubuntu
# Di sini lo udah di shell Ubuntu — semua perintah jalan
```

### 3. Update system
```bash
apt update && apt upgrade -y
apt install nodejs npm python3 python3-pip git -y
```

### ⚠️ **Sebelum instalasi, pastikan Node.js ≥22**
```bash
node -v   # harus v22.x.x atau lebih baru
```
Cek di `package.json` → `"engines": { "node": ">=22" }`.

### 4. Clone repo
```bash
git clone https://github.com/az925-crypto/Agent-x-.git
cd Agent-x-.git
```

### 5. Install semua (1 perintah)
```bash
chmod +x install.sh && ./install.sh
```
Ini otomatis install **Node.js + Python (instagrapi) + build CLI bundle (.mjs)**.

### 6. Setup API key
```bash
cp .env.example .env
nano .env
```
**WAJIB diisi:**
| Variabel | Isi | Dari mana |
|----------|-----|-----------|
| `AI_PROVIDER` | `"gemini"` (default) | Pilih aja |
| `GEMINI_API_KEY` | `kunci-lho` | [Google AI Studio](https://aistudio.google.com/) — gratis |
| `IG_USERNAME` | username IG lo | Instagram lo |
| `IG_PASSWORD` | password IG lo | Instagram lo |

> **Bisa juga pake `OPENROUTER_API_KEY` atau `ZEN_API_KEY`** — ganti `AI_PROVIDER="openrouter"` atau `"zen"`.

### 7. Jalankan! (bundled .mjs — recommended)
```bash
node cli-ui.mjs
```
Kenapa `.mjs`? → **Bundled**, gak perlu compile, cuma 1 file, ringan, cocok buat proot.

### 8. Mulai pake
Di dalam CLI, ketik perintah:

| Perintah | Apa yang terjadi |
|----------|------------------|
| `ig @username` | Scrape Instagram + AI analisis |
| `chat` | **Mode investigasi AI** — 50-turn loop otomatis |
| `help` | Lihat semua perintah |

---

## 📦 Cara Cepat (non-Android)

```bash
git clone https://github.com/az925-crypto/Agent-x-.git
cd Agent-x-.git
chmod +x install.sh && ./install.sh
cp .env.example .env  # isi API key
npm run cli           # jalan (butuh tsx)
```

> **Prasyarat:** Node.js ≥22, Python ≥3.10, dan akses `pip`.

---

## 🔧 Daftar Perintah Lengkap

| Perintah | Fungsi |
|----------|--------|
| `ig <user>` | Ambil profil Instagram + 100 followers/following + analisis AI |
| `followers <user>` | Ambil **semua** followers (list lengkap) |
| `following <user>` | Ambil **semua** following (list lengkap) |
| `media <user> [n]` | Ambil `n` postingan + komentar + likers |
| `download <user> [n]` | Download foto/video Instagram |
| `similar <user>` | Cek username di **7 platform**: GitHub, GitLab, Reddit, TikTok, Medium, Vimeo, VK |
| `scan <target>` | DNS resolution + GeoIP + analisis AI |
| `chat` | **Mode AI investigasi** — loop 50-turn, panggil tools sendiri |
| `reconnect` | Reload API key dari `.env` (tanpa restart) |
| `depth 1/2/3` | Atur kedalaman investigasi (1=basic, 2=medium, 3=max) |
| `clear` | Bersihkan layar |
| `exit` | Keluar |

---

## 🧠 Mode Chat — Cara Kerja

`chat` memulai **agent AI** yang bisa panggil alat sendiri dalam **50-turn loop**:

```
1. init_investigation(@target)   → mulai session
2. ig_profile(@target)           → ambil profil + followers/following
3. scan(domain.com)              → DNS + GeoIP
4. similar(@target)              → cek 7 platform
5. ig_followers(@target)         → ambil semua followers
6. add_finding(...)               → simpan ke memory
7. save_memory(...)               → simpan pola ke memory.json
...
```

### 3 Level Depth

| Depth | Cakupan |
|-------|---------|
| **1** | Basic — IG profile + followers/following |
| **2** | Medium — + similar (7 platform) + DNS/GeoIP |
| **3** | Max — + deep chain, expand ke related accounts |

### Yang bisa dipanggil agent:
- `ig_profile` — Instagram profile
- `ig_followers`, `ig_following` — daftar pengikut
- `ig_media` — postingan + komentar
- `scan` — DNS/GeoIP
- `similar` — 7 platform search
- `read_file`, `list_dir`, `grep`, `glob`, `write_file` — terminal sandbox
- `save_memory`, `load_memories` — memory ke `memory.json`
- **Bisa juga** buat script Python kustom → `write_file` + `run_command`

---

## ⚙️ Cara Kerja Alat-alat

```
Tool Bridge (tools/orchestrator.ts)
  │
  ├── runIG(username)          → python3 tools/ig/main.py
  ├── runIGFollowers(username)  → python3 tools/ig/ig_followers.py
  ├── runIGFollowing(username)   → python3 tools/ig/ig_following.py
  ├── runIGMedia(username, n)   → python3 tools/ig/ig_media.py
  ├── runIGDownload(username, n)→ python3 tools/ig/ig_download.py
  ├── runScan(target)           → tools/scan/index.ts (DNS/GeoIP)
  └── runSherlock(username)     → tools/sherlock/index.ts (7 platform)
```

Semua Python script jalan lewat `spawn()` (bukan shell), timeout 600 detik.

---

## 🗂️ Struktur File Penting

| File | Isinya |
|------|--------|
| `cli-ui.tsx` | **CLI utama** (574 baris) — input handler, output log, chat UI |
| `cli-ui-commands.tsx` | Handler perintah (ig, scan, similar, dll) |
| `cli-ui-investigation.tsx` | UI 4-panel untuk mode chat |
| `cli-ui.mjs` | **Bundled** (135KB) — build dari `cli-ui.tsx`, jalan tanpa tsx |
| `server.ts` | **API Express** — `/api/osint/scan`, `/api/admin/reload-provider` |
| `src/components/TerminalApp.tsx` | **Web terminal** (React) — 471 baris |
| `tools/ai-agent/index.ts` | **Agent runtime** (635 baris) — loop 50-turn, retry, audit |
| `tools/ai-agent/provider.ts` | **3 AI provider** — Gemini, OpenRouter, Zen |
| `tools/ai-agent/shared.ts` | **System prompt** (315 baris) — aturan agent, tool descriptions |
| `tools/ai-agent/memory.ts` | **Persistent memory** — CRUD, query by category/tags |
| `tools/terminal/index.ts` | **Sandbox** — 10 tools, restricted files, path guard |
| `tools/orchestrator.ts` | **Bridge** — panggil Python dari TypeScript |
| `tools/ig/main.py` | Scraper Instagram (profile + 100 followers) |
| `tools/ig/ig_followers.py` | Scraper followers (lengkap) |
| `tools/ig/ig_following.py` | Scraper following (lengkap) |
| `tools/ig/ig_media.py` | Scraper posts + comments |

---

## 📝 Catatan Penting

- **`.env` jangan di-commit** — disimpan di gitignore
- **`tools/custom/`** — tempat script sementara (di-gitignore)
- **Session file** → `/tmp/.agent-x-ig-session.json`
- **Audit log** → `/tmp/.agent-x/audit.log` (gak bisa dibaca agent)
- **Rate limit** → `/api/osint/*` 10 request/menit
- **Hanya localhost** yang bisa pake API (CSRF protection)
- **Read-only commands** (cat, ls, head, python3 tools/ig/*.py) jalan **otomatis tanpa confirm**
- **Write/delete/run_command** butuh **confirm** dulu

---

## 📐 Info Build

| Script | Output |
|--------|--------|
| `npm run cli` | `tsx cli-ui.tsx` — dev mode (butuh tsx) |
| `npm run dev` | `tsx server.ts` — web + API |
| `npm run build` | `dist/` — production |
| `npm run build:cli` | `cli-ui.mjs` — bundled (135KB, 1 file) |
| `npm test` | `vitest run` (server.test.ts) |
| `npm run lint` | `tsc --noEmit` (type checking) |

---

## 🧪 Testing

```bash
npm test   # server.test.ts — validateTarget, resolveTargetData
npm run lint  # tsc --noEmit
```

Tests udah ada 3 test case: `validateTarget` (email format, valid/invalid), `isValidIP`, `resolveTargetData` (case-insensitive).

---

## 🔄 Cara Push ke GitHub

```bash
git add .
git commit -m "update readme"
git push origin main
```

Kalo error auth, generate **GitHub token** di Settings → Developer settings → Personal access tokens, lalu:
```bash
git remote set-url origin https://TOKEN@github.com/az925-crypto/Agent-x-.git
```
