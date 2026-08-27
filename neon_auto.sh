#!/bin/bash
# neon_auto.sh - Auto-launcher da Neon para Linux (ChromeOS / Crostini)
# Inicia a Neon em segundo plano se ela nao estiver rodando.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG="$DIR/logs/neon_auto.log"
mkdir -p "$DIR/logs"

stamp() { date '+%Y-%m-%d %H:%M:%S'; }

# Se ja esta rodando, nao duplica
if pgrep -f "node index.js" >/dev/null 2>&1; then
  echo "[$(stamp)] Neon ja esta rodando." >> "$LOG"
  exit 0
fi

cd "$DIR" || exit 1

# Instala dependencias na primeira vez
if [ ! -d "$DIR/node_modules" ]; then
  echo "[$(stamp)] node_modules ausente -> npm install" >> "$LOG"
  npm install >> "$LOG" 2>&1
fi

nohup node index.js >> "$DIR/logs/neon.log" 2>&1 &
echo $! > "$DIR/neon.pid"
echo "[$(stamp)] Neon iniciada (PID $!)" >> "$LOG"
