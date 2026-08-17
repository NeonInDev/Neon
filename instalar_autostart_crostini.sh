#!/bin/bash
# instalar_autostart_crostini.sh - Prepara o Chromebook (Crostini) para acesso remoto:
# instala SSH server, ttyd (web terminal que roda na RAM) e opencode, e configura tudo
# para iniciar sozinho ao abrir o Linux.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERV="$DIR/servicos_chromebook.sh"
chmod +x "$SERV"

echo "[1/4] Instalando dependencias (pode pedir senha do sudo)..."
sudo apt update >/dev/null 2>&1
sudo apt install -y openssh-server ttyd >/dev/null 2>&1 || echo "   (aviso: instale openssh-server e ttyd manualmente se falhar)"
if ! command -v node >/dev/null 2>&1; then
  sudo apt install -y nodejs npm >/dev/null 2>&1 || echo "   (aviso: instale nodejs manualmente)"
fi
if ! command -v opencode >/dev/null 2>&1; then
  sudo npm install -g opencode-ai >/dev/null 2>&1 || echo "   (aviso: instale opencode manualmente)"
fi

echo "[2/4] SSH somente por chave (sem senha, sem root)..."
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?KbdInteractiveAuthentication.*/KbdInteractiveAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?ChallengeResponseAuthentication.*/ChallengeResponseAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
if command -v systemctl >/dev/null 2>&1; then
  sudo systemctl enable ssh >/dev/null 2>&1 || true
else
  sudo update-rc.d ssh defaults >/dev/null 2>&1 || true
fi

echo "[3/4] Configurando auto-start (bashrc + sessao Linux + cron)..."
MARKER="# NEON_ACESSO"
if ! grep -qF "$MARKER" ~/.bashrc 2>/dev/null; then
  {
    echo ""
    echo "$MARKER"
    echo "bash \"$SERV\" >/dev/null 2>&1"
  } >> ~/.bashrc
fi
mkdir -p ~/.config/autostart
cat > ~/.config/autostart/neon-acesso.desktop <<EOF
[Desktop Entry]
Type=Application
Name=Neon Acesso
Comment=SSH + ttyd + opencode
Exec=bash "$SERV"
X-GNOME-Autostart-enabled=true
EOF
chmod +x ~/.config/autostart/neon-acesso.desktop
( crontab -l 2>/dev/null | grep -vF "$SERV"; echo "@reboot bash \"$SERV\" >/dev/null 2>&1" ) | crontab -

echo "[4/4] Iniciando os servicos agora..."
bash "$SERV"

echo ""
echo "===== PRONTO ====="
echo "IP do container: $(hostname -I 2>/dev/null | tr -s ' ')"
echo ""
echo "SSH ............ ssh penguin@<IP acima>"
echo "Web terminal ... http://localhost:7681  (usuario: neon / senha: neon)"
echo "opencode ....... http://localhost:8182"
echo ""
echo "DICA: troque a senha do ttyd editando a linha '-c neon:neon' em servicos_chromebook.sh"
