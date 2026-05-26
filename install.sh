#!/usr/bin/env bash
set -euo pipefail

echo "========================================"
echo "  OSINT Agent-X — Full Install"
echo "========================================"
echo ""

# Detect Termux
if [ -n "${TERMUX_VERSION:-}" ]; then
  echo "[*] Termux detected"
  echo "[*] Make sure proot is installed: pkg install proot proot-distro"
  echo "[*] Run the CLI with: proot -0 node cli-ui.mjs"
  echo ""
fi

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "[!] Node.js not found. Install it first:"
  echo "  Ubuntu/Debian: curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt install -y nodejs"
  echo "  Termux: pkg install nodejs"
  echo "  macOS: brew install node@22"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
  echo "[!] Node.js $(node -v) detected — recommended >=22."
  echo "  Upgrade with:"
  echo "  Ubuntu/Debian: curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt install -y nodejs"
  echo "  Termux: pkg install nodejs"
  echo "  macOS: brew upgrade node"
  echo ""
  echo "[*] Melanjutkan instalasi dengan Node $(node -v) — mungkin ada warning."
fi
echo "[✓] Node.js $(node -v)"

# Check Python
PYTHON=""
if command -v python3 &> /dev/null; then
  PYTHON="python3"
elif command -v python &> /dev/null; then
  PYTHON="python"
else
  echo "[!] Python not found. Install it first."
  echo "  Termux: pkg install python"
  echo "  Ubuntu: sudo apt install -y python3"
  exit 1
fi
echo "[✓] $($PYTHON --version)"

# Install Node dependencies
echo ""
echo "[*] Installing Node.js dependencies..."
npm install

# Install Python dependencies (instagrapi)
echo ""
echo "[*] Installing Python dependencies (instagrapi)..."
$PYTHON -m pip install --break-system-packages -r tools/ig/requirements.txt 2>&1

# Build CLI bundle (.mjs)
echo ""
echo "[*] Building CLI bundle (cli-ui.mjs)..."
npm run build:cli 2>&1 | tail -3

# Build web UI
echo ""
echo "[*] Building web UI..."
npm run build 2>&1 | tail -3

# Done
echo ""
echo "========================================"
echo "  Install Complete!"
echo "========================================"
echo ""
echo "  Next steps:"
echo "  1. cp .env.example .env"
echo "  2. Edit .env with your API keys"
echo ""
echo "  Run CLI:     npm run cli"
echo "  Run Web:     npm run dev"
echo "  Prod CLI:    node cli-ui.mjs"
echo "  Termux:      proot -0 node cli-ui.mjs"
echo ""
