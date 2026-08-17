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
# Credencial vem de ~/.config/neon/ttyd_pass (gerada na 1a vez, aleatoria).
# Padrao: escuta em 127.0.0.1 (acesso remoto via tunel SSH).
# Chromebook com app Terminal bloqueado: TTYD_BIND=0.0.0.0 para o browser
# do proprio ChromeOS abrir via port-forward do Crostini (localhost:7681).
TTYD_BIN=ttyd
TTYD_CFG="$HOME/.config/neon/ttyd_pass"
TTYD_USER="neon"
TTYD_BIND="${TTYD_BIND:-127.0.0.1}"
if [ -d /dev/shm ] && [ -w /dev/shm ] && command -v ttyd >/dev/null 2>&1; then
  if [ ! -x /dev/shm/ttyd ]; then cp "$(command -v ttyd)" /dev/shm/ttyd; fi
  TTYD_BIN=/dev/shm/ttyd
fi
if ! pgrep -f "ttyd -p 7681" >/dev/null 2>&1; then
  if command -v ttyd >/dev/null 2>&1; then
    if [ ! -f "$TTYD_CFG" ]; then
      mkdir -p "$(dirname "$TTYD_CFG")"
      TTYD_PASS="$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 16)"
      (umask 077; printf '%s\n' "$TTYD_PASS" > "$TTYD_CFG")
      log "Credencial do ttyd criada em $TTYD_CFG (senha aleatoria, chmod 600)."
    fi
    TTYD_PASS="$(cat "$TTYD_CFG")"
    nohup $TTYD_BIN -p 7681 -i "$TTYD_BIND" -c "$TTYD_USER:$TTYD_PASS" bash >>"$DIR/logs/ttyd.log" 2>&1 &
    sleep 1
    log "Web terminal: http://localhost:7681 (bind $TTYD_BIND; usuario neon; senha em $TTYD_CFG)"
    if [ "$TTYD_BIND" = "127.0.0.1" ]; then
      log "Acesso remoto: ssh -L 7681:localhost:7681 <usuario>@<IP> e abra http://localhost:7681"
    else
      log "OBS: bind 0.0.0.0 e so para o browser do proprio ChromeOS (port-forward do Crostini); senha forte mantida."
    fi
  else
    log "ttyd nao instalado (rode o instalador)"
  fi
else
  log "ttyd ja rodando"
fi

# ---------- 3) opencode serve (API headless) ----------
# Somente localhost; acesso remoto via tunel SSH (mesma regra do ttyd).
if ! pgrep -f "opencode serve" >/dev/null 2>&1; then
  if command -v opencode >/dev/null 2>&1; then
    nohup opencode serve --port 8182 --hostname 127.0.0.1 >>"$DIR/logs/opencode.log" 2>&1 &
    sleep 1
    log "opencode serve: http://localhost:8182 (so local; remoto via tunel SSH)"
  else
    log "opencode nao instalado"
  fi
else
  log "opencode ja rodando"
fi

log "IP do container: $(hostname -I 2>/dev/null | tr -s ' ')"
