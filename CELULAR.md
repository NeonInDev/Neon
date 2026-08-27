# Controle do Celular pela Neon (PC)

Como a Neon (no PC) controla seu celular Android — espelho da tela, abrir apps, toque, swipe, digitar, print e comandos via Termux/SSH.

## Parte 1 — adb + scrcpy (espelho e controle da tela)

Instalados no PC:
- **adb** em `C:\Users\Pichau\Android\platform-tools`
- **scrcpy** 4.1 (via winget)

### O que fazer NO CELULAR (1 vez)

1. **Configurações → Sobre o telefone** → toque 7x em **"Número da versão"** até aparecer "Você agora é um desenvolvedor".
2. **Configurações → Sistema → Opções do desenvolvedor** → ative **Depuração USB** (aceite o aviso).
3. Conecte o celular no PC **via cabo USB** (mode "Transferência de arquivos").
4. No PC, confirme que o celular aparece:
   ```
   adb devices
   ```
   No celular, toque em **"Permitir depuração USB"** (marque "sempre permitir").

### Conexão sem fio (recomendado — depois do passo 4)

Opção A — Android 11 ou mais novo:
1. Em **Opções do desenvolvedor**, ative **Depuração wireless**.
2. Toque em **"Emparelhar dispositivo com código"** e anote o **IP:porta** e o **código**.
3. No PC: `adb pair IP:PORTA` → digite o código.
4. Anote o **IP:porta** principal da Depuração wireless (mostra na mesma tela).

Opção B — Android antigo (via USB 1x):
```
adb tcpip 5555
adb connect IP_DO_CELULAR:5555
```

### Configurar o IP na Neon

Fale pra Neon (ou use o MCP):

```
Neon, celular ip 192.168.X.X 5555
Neon, conecta o celular
```

### Comandos que funcionam

| Você diz | O que acontece |
|---|---|
| `Neon, espelha o celular` | Abre o scrcpy — controle total com mouse/teclado |
| `Neon, abre o whatsapp no celular` | Abre o app |
| `Neon, tira print do celular` | Print enviado no seu DM |
| `Neon, toca 540 1200 no celular` | Toque na coordenada |
| `Neon, desliza no celular de 500 1500 pra 500 300` | Swipe |
| `Neon, digita mensagem no celular` | Digita no campo focado |
| `Neon, aperta home no celular` | Tecla home/voltar/apps/power/volume |

## Parte 2 — Termux + SSH (rodar comandos no celular)

### O que fazer NO CELULAR (1 vez)

1. Instale o **Termux** (F-Droid: https://f-droid.org/packages/com.termux/ — a versão da Play Store é antiga).
2. Abra o Termux e rode:
   ```bash
   pkg update && pkg upgrade -y
   pkg install openssh termux-api -y
   termux-wake-lock
   ```
3. Configure a senha (ou chave):
   ```bash
   passwd
   whoami
   ```
   Anote o `whoami` (ex: `u0_a100`).
4. Descubra o IP do celular:
   ```bash
   ifconfig wlan0
   ```
   ou `ip addr` (procura o `inet 192.168.X.X`).
5. Suba o servidor SSH:
   ```bash
   sshd
   ```

> ⚠️ Depois de reiniciar o celular, rode `sshd` e `termux-wake-lock` de novo (pode criar um atalho ou usar um app de boot).

### Configurar na Neon

```
Neon, configura termux ip 192.168.X.X porta 8022 usuario u0_a100
```

Teste:
```
Neon, roda echo oi no termux
```

### Dicas

- Para autenticar por **chave** (sem senha), gere no PC: `ssh-keygen` e depois `ssh-copy-id -p 8022 usuario@IP` (ou copie `~/.ssh/id_ed25519.pub` pro `~/.ssh/authorized_keys` do Termux).
- Tudo isso também está disponível como **MCP server** (`src/mcp-celular.js`) pro opencode usar — registrado em `opencode.json`.
