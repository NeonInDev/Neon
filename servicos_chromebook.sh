#!/bin/bash
# servicos_chromebook.sh - Liga sozinho: SSH + web terminal (ttyd) + opencode serve
# Roda de forma idempotente (pode chamar varias vezes, nao duplica processos).
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG="$DIR/logs/chromebook_servicos.log"
mkdir -p "$DIR/logs"

stamp() { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "[$(stamp)] $1" >> "$LOG"; }

# ---------- 1) SSH server ----------
if ! pgrep -x sshd >/dev/null 2>&1; then
  if command -v service >/dev/null 2>&1; then
    sudo service ssh start >>"$LOG" 2>&1
  else
    sudo /usr/sbin/sshd >>"$LOG" 2>&1
  fi
  sleep 1
  if pgrep -x sshd >/dev/null 2>&1; then log "SSH iniciado"; else log "FALHA ao iniciar SSH"; fi
else
  log "SSH ja rodando"
fi

# ---------- 2) Web terminal portatil (ttyd) rodando da RAM ----------
TTYD_BIN=ttyd
if [ -d /dev/shm ] && [ -w /dev/shm ] && command -v ttyd >/dev/null 2>&1; then
  if [ ! -x /dev/shm/ttyd ]; then cp "$(command -v ttyd)" /dev/shm/ttyd; fi
  TTYD_BIN=/dev/shm/ttyd
fi
if ! pgrep -f "ttyd -p 7681" >/dev/null 2>&1; then
  if command -v ttyd >/dev/null 2>&1; then
    nohup $TTYD_BIN -p 7681 -i 0.0.0.0 -c neon:neon bash >>"$DIR/logs/ttyd.log" 2>&1 &
    sleep 1
    log "Web terminal: http://localhost:7681  (login neon / senha neon)"
  else
    log "ttyd nao instalado (rode o instalador)"
  fi
else
  log "ttyd ja rodando"
fi

# ---------- 3) opencode serve (API headless) ----------
if ! pgrep -f "opencode serve" >/dev/null 2>&1; then
  if command -v opencode >/dev/null 2>&1; then
    nohup opencode serve --port 8182 --hostname 0.0.0.0 >>"$DIR/logs/opencode.log" 2>&1 &
    sleep 1
    log "opencode serve: http://localhost:8182"
  else
    log "opencode nao instalado"
  fi
else
  log "opencode ja rodando"
fi

log "IP do container: $(hostname -I 2>/dev/null | tr -s ' ')"
