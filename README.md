# Neon — IA Assistente Pessoal

Neon é a assistente pessoal do dono: uma IA com personalidade própria, memória de longo prazo, controle total do PC/celular, integração com Discord, WhatsApp, Google, Spotify e muito mais — tudo conversando por linguagem natural.

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js 25+ |
| Discord API | discord.js v14 + @discordjs/voice |
| IA | OpenRouter (multi-provedor), Groq, OmniRoute, DeepSeek (fallback) |
| Banco | LowDB (JSON local) |
| Browser | Playwright (Opera GX) |
| WhatsApp | whatsapp-web.js (headful) |
| Google | googleapis (Calendar, Tasks, Gmail, Drive) |
| Voz | Edge TTS, Whisper local (@xenova/transformers), scrcpy/ADB |

## Início rápido

```bash
npm install
# preencha o .env (veja src/config.js)
npm start          # sobe o bot + API/HUD
node deploy-commands.js   # registra os slash commands
```

## Comandos por linguagem natural

A Neon entende frases diretas no Discord (prefixo `neon`, `@Neon`, reply à mensagem dela ou DM). As principais categorias:

### Rotina
- `bom dia` — liga Spotify/Steam/Medal, clima e dica do dia
- `boa noite` — previsão de amanhã + confirma desligar o PC
- `daddy is home` — rotina de chegada em casa

### Controle do PC
- `desligar` / `reiniciar` / `suspender` / `bloquear`
- `status do pc` — CPU, RAM, disco, temperatura, bateria
- `volume 20%` / `muta` / `print` / `clipboard`
- `processos` (listar/matar), `rede`, `bateria`
- `executa <comando>` (terminal), `digita <texto>`

### Apps, jogos e navegador
- `abrir spotify/steam/youtube/opera/whatsapp/...` (30+ apps)
- `jogar cs2/gta/elden ring/...` (20+ jogos Steam)
- `vai pra <url>` / `entra em <site>`

### Spotify / YouTube
- `toca <música>`, `pular`, `voltar`, `pausar`, `continuar`, `letra de <música>`
- `coloca <vídeo> no youtube`, `tela cheia`, `PiP`

### Comunicação
- `manda msg pra <alvo>: <texto>` (Discord DM)
- `manda zap pra <contato>: <texto>` (WhatsApp)
- `liga pra <alvo>` (chamada de voz Discord)
- `muda status do discord` (online/idle/dnd/invisível/personalizado)

### Celular (ADB/scrcpy)
- `conecta o celular`, `espelha o celular`, `abre <app> no celular`
- `print do celular`, `toca em X,Y`, `desliza`, `digita no celular`

### IA / Informação
- `pesquisa <query>`, `o que é <termo> no wikipedia`
- `quanto é <expressão>` (calculadora), `cotação <moeda/crypto/ação>`
- `clima em <cidade>`, `vai chover?`, `cep <n>`, `qual meu ip`
- `notícias`, `cinema <cidade>`, `define <palavra>`

### Entretenimento
- `piada`, `conselho`, `trivia`, `gera imagem de <prompt>`
- `mostra foto de <assunto>`, `gera qr code de <texto>`, `gera senha`

### Utilidades
- `lembra de <texto>` / `me lembra em X minutos de Y` (+ recorrências: `todo dia às 08:00`, `toda segunda às 07:30`)
- `traduz <texto> pra <idioma>`, `fala <texto>` (TTS), `remove fundo da imagem`
- `notifica <título> <msg>`, `começa a gravar` (OBS)

### Escola / Estudo
- `boletim` / `notas`, `versala`, flashcards (`criar deck`, `estudar <deck>`)
- `o que tem na agenda` / `cria evento` (Google Calendar)
- `cria tarefa <texto>` (Google Tasks), `quais emails não li` (Gmail)

### Gestão do servidor (dono/mod)
- `protocolo lockdown @user [por N horas] [motivo]` / `unlockdown @user`
- `protocolo emergência` (mata Chrome/Opera/Spotify)
- `neon expulse <id>` (skill kick), `neon clipe` (último clipe do Medal)

## Slash commands

Registrados pela pasta `src/commands/` (auto-descobertos). Destaques:

| Comando | Descrição |
|---|---|
| `/neon <msg>` | Conversar com a Neon |
| `/google <ação>` | Calendar/Tasks/Gmail/Drive |
| `/convidar` | Invite (guild ou perfil) |
| `/blacklist` `/unblacklist` `/afinidade` `/mood` | Admin (requer master key) |
| `/memoria` `/perfil` `/gostos` `/personalidade` | Perfil do usuário |
| `/entrar` `/sair` `/voz` | Canal de voz Discord |

> Admin via **DM**: envie a `MASTER_KEY` no PV da Neon para ativar o modo mestre.

## API HTTP / HUD (YGGDRASIL)

Servidor HTTP/HTTPS próprio (~70 endpoints), dashboard web em `/hud`, controle de gestos em `/gesture` e documentação OpenAPI em `/doc`.

- `POST /api/chat` — conversa com a Neon
- `/api/pc/*`, `/api/gesture`, `/api/terminal`, `/api/arquivos/*` — controle remoto
- `/api/whatsapp/*` — envio/status do WhatsApp
- `/api/discord/*` — enviar canais, DMs, canais de voz
- `/api/celular/*`, `/api/braco/*`, `/api/watch/*` — hardware
- `POST /api/discord/enviar_canal` — enviar mensagem/arquivos para canal (ex.: tabelas, GIFs)
- `/api/visao` — análise de imagem por IA
- `/global/event` — WebSocket/SSE de eventos

Acesso remoto seguro via **Tailscale** (ex.: `https://100.x.y.z:3443/hud`). Nunca exponha em `0.0.0.0` fora da VPN.

## Integrações

Discord (API + UI do dono), WhatsApp, Google (Calendar/Tasks/Gmail/Drive), Notion, Spotify, YouTube, Steam, Medal.tv, Strava, OBS Studio, Blender, Tailscale, OpenCode (delegar código), termux/ADB, Neo Zero ARQUIMEDES, braço robótico, NeonWatch (relógio), HUD desktop, Poderes/lore do servidor RPG.

## Voz

TTS por Edge TTS (neural, PT-BR) e SAPI como fallback; STT local via Whisper. A Neon entra em canais de voz Discord, fala, escuta (`neon ...`) e responde. Emoções mudam tom/velocidade.

## Monitoramento proativo

- **Resumo diário** às 07:00 em DM (PC, clima, agenda de hoje, previsões)
- Alertas de RAM/CPU/disco/temperatura >90%
- Detecção de desligamento inesperado (Event ID 41)
- Modo Jarvis: ciclo a cada 15 min decide se faz algo útil
- **Pings no Discord**: quando alguém menciona o dono, a Neon resume e avisa (voz ou DM)

## Lembretes e recorrências

- `me lembra em 30 minutos de X`
- `me lembra todo dia às 08:00 de X` — repete diariamente
- `me lembra toda segunda às 07:30 de X` — semanal
- `me lembra a cada 3 horas de X` — intervalo

## Arquitetura

```
index.js                  Bootstrap (client, handlers, plugins)
src/
  ai.js                   askNeon() — multi-provedor + tool calling
  actions.js              Motor de ações por linguagem natural (50+ categorias)
  timers.js               Lembretes + recorrências
  proativo.js             Modo Jarvis (decide ações a cada 15min)
  monitor.js              Resumo diário + alertas de sistema
  pings.js                Resumo de menções ao dono
  voz.js / voice.js       Canal de voz Discord (falar/ouvir) e microfone local
  tts.js / stt.js         Text-to-Speech e Speech-to-Text
  pc.js                   Controle do PC (info, volume, teclado, energia)
  celular.js              ADB/scrcpy (espelhar, tocar, abrir apps)
  browser.js              Playwright (navegação, Spotify, YouTube)
  api.js / api_publica.js APIs externas + servidor HTTP/HUD
  google/                 Calendar, Tasks, Gmail, Drive (OAuth2)
  events/messageCreate.js Roteamento central de mensagens
  events/interactionCreate.js  Slash commands
  commands/               Um arquivo por comando (auto-descoberto)
plugins/                  Notion, WhatsApp, OpenCode, Tailscale, Strava, Medal
skills/                   Skills invocáveis pela IA
public/hud/               Dashboard YGGDRASIL (web)
hud-app/                  App desktop (NeonHud.exe / WebView2)
data/                     Dados persistentes (skills, lore, guests...)
```

### Fluxo de mensagens

```
Mensagem → messageCreate.js
  ├── bot/blacklist → ignora
  ├── chave mestra (DM) → ativa admin
  ├── ping no dono → pings.js resume e avisa (voz/DM)
  ├── ativou? (neon/@bot/reply/DM) → cooldown 3s + debounce 1.5s
  │     └── askNeon() → resposta (com molde, arquivos, multi-parte)
  └── senão → ignora (mas segue monitorando)
```

## Setup Google (1 vez)

1. Credenciais OAuth2 em [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → Desktop app
2. Salve como `google_credentials.json` (raiz do projeto, gitignorado)
3. `node google_oauth_setup.js` → autorize → token em `google_token.json`
4. Reinicie e teste com `/google status` ou "o que tem hoje na agenda?"

Escopos: `calendar`, `tasks`, `gmail.readonly`, `drive`.

## Segurança

- `MASTER_KEY` só em DM; blacklist antes de tudo
- Input truncado em 2000 chars; cooldown de 3s por usuário
- `.env`, certificados, tokens e bancos **nunca** vão pro git
- API exposta apenas via Tailscale (sem `0.0.0.0` público)
- Persistência em `db.write()` no SIGINT/SIGTERM

## Manutenção

- **Novo comando**: crie `src/commands/nome.js` (exporta `data` + `execute`) e rode `node deploy-commands.js`
- **Nova ação**: adicione categoria/regex em `src/actions.js`
- **Nova skill**: crie em `skills/` com `_manifest.json`
- **Logs**: `[timestamp] [LEVEL] msg {meta}` em `logs/`

## Licença

ISC