# OSINT Agent-X

**Alat OSINT** dengan 3 tampilan: **CLI** (terminal), **Web** (React), **API** (Express). Bisa scraping Instagram, DNS/GeoIP, cek username di 7 platform, dan investigasi pakai AI (Gemini/OpenRouter/Zen).

---

## ⚠️ **Untuk Pengguna Android (Termux) — BACA INI DULU**

> **Kritis:** Kalo lo di Termux, pake **`proot`** biar gak error izin. Ikuti langkah di bawah step-by-step.

### Step 1: Install proot + Ubuntu
```bash
pkg install proot proot-distro
proot-distro install ubuntu
```
Pilih **ubuntu** — yang paling stabil untuk proot.

### Step 2: Masuk ke Ubuntu (dalam proot)
```bash
proot-distro login ubuntu
```
Sekarang lo di **shell Ubuntu** — semua perintah jalan normal.

### Step 3: Update + install Node.js
```bash
apt update && apt upgrade -y
apt install nodejs npm python3 python3-pip -y
```

### Step 4: Clone repo
```bash
git clone https://github.com/az925-crypto/Agent-x-.git
cd Agent-x-.git
```

### Step 5: Install semua (Node + Python)
```bash
chmod +x install.sh && ./install.sh
```
Ini 1 kali jalan, selesai semua.

### Step 6: Setup `.env` — isi API key
```bash
cp .env.example .env
nano .env
```
**Paling penting** yang harus diisi:
| Variabel | Dapat dari mana |
|----------|---------------|
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/) — gratis |
| `IG_USERNAME` | Username Instagram lo |
| `IG_PASSWORD` | Password Instagram lo |
| `AI_PROVIDER` | Tulis `"gemini"` (default) |

### Step 7: Jalankan! (bundled .mjs — RECOMMENDED)
```bash
node cli-ui.mjs
```
> **Kenapa `.mjs`?** — Bundled, gak perlu compile, ringan, cocok buat proot.

### Step 8: Mulai pake
Di dalam CLI, ketik:
```
ig @username  →  Scrape Instagram + AI analisis
chat          →  Mode investigasi AI (otomatis)
help          →  Lihat semua perintah
```

---

## 📦 Cara Cepat (Semua Platform)

```bash
git clone https://github.com/az925-crypto/Agent-x-.git
cd Agent-x-.git
chmod +x install.sh && ./install.sh   # Install semua
cp .env.example .env                  # Setup API key
npm run cli                            # Jalanin CLI
```

---

## 🔧 Perintah CLI

| Perintah | Fungsi |
|----------|--------|
| `ig <user>` | Scrape Instagram + analisis AI |
| `followers <user>` | Daftar pengikut |
| `following <user>` | Daftar mengikuti |
| `media <user> [n]` | Postingan + komentar |
| `download <user> [n]` | Download foto/video |
| `similar <user>` | Cek username di 7 platform |
| `scan <target>` | DNS + GeoIP + analisis |
| `chat` | Mode AI investigasi (otomatis) |
| `reconnect` | Reload API key dari .env |
| `help` | Tampilkan semua perintah |
| `clear` | Bersihkan layar |
| `exit` | Keluar |

---

## 🗺️ Arsitektur

```
cli-ui.tsx  ── CLI (Ink, React di terminal)
src/        ── Web UI (React + Vite)
server.ts   ── API (Express)
  │
  └── tools/ ── Alat-alat OSINT
        ├── ai-agent/     ← AI 50-turn loop
        ├── scan/         ← DNS + GeoIP
        ├── sherlock/     ← 7 platform
        ├── terminal/     ← 10 perintah sandbox
        └── ig/*.py       ← Instagram scraper
```

---

## 📝 Catatan

- `.env` jangan di-commit — rahasia
- `tools/custom/` — untuk script sementara
- Session file di `/tmp/.agent-x-ig-session.json`
- Audit log di `/tmp/.agent-x/audit.log`