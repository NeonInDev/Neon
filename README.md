# Neon — Bot de IA para Discord

Assistente social com personalidade própria, memória de longo prazo, sistema de afinidade e processamento de imagens via OpenRouter.

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js 25+ |
| Discord API | discord.js v14 |
| IA | OpenRouter (GPT-4o-mini) |
| Banco | LowDB (JSON local) |
| HTTP | Axios |

## Estrutura

```
├── index.js                  # Bootstrap — sobe o client, registra handlers de processo
├── deploy-commands.js        # Registro dos slash commands na API do Discord
├── .env                      # Variáveis de ambiente (gitignorado)
├── memory.json               # Banco de dados (gitignorado)
└── src/
    ├── client.js             # Client Discord + registro dinâmico de eventos
    ├── db.js                 # LowDB (path absoluto, independente de cwd)
    ├── config.js             # Validação e exportação de env vars
    ├── logger.js             # Log estruturado [timestamp] [LEVEL] msg {meta}
    ├── ai.js                 # Lógica da OpenRouter — askNeon()
    ├── user.js               # Criação e gerenciamento de usuários
    ├── moderation.js         # Blacklist + detecção de jailbreak
    ├── events/
    │   ├── ready.js          # Inicialização do banco ao conectar
    │   ├── messageCreate.js  # Processamento de mensagens (prefixo, reply, DM)
    │   └── interactionCreate.js  # Roteamento de slash commands
    └── commands/             # Um arquivo por comando
        ├── index.js          # Registry automático (fs.readdirSync)
        ├── neon.js           # /neon — conversar com a Neon
        ├── blacklist.js      # /blacklist — bloquear usuário
        ├── unblacklist.js    # /unblacklist — desbloquear
        ├── afinidade.js      # /afinidade — alterar score
        ├── mood.js           # /mood — alterar humor global
        ├── apelido.js        # /apelido — definir apelido
        ├── memoria.js        # /memoria — adicionar observação
        ├── limparmemoria.js  # /limparmemoria — resetar memórias
        ├── perfil.js         # /perfil — visualizar dados
        ├── gostos.js         # /gostos — registrar interesse
        ├── personalidade.js  # /personalidade — registrar traço
        ├── convidar.js       # /convidar — link de invite do bot
        └── revogar.js        # /revogar — remover acesso mestre
```

## Setup

### 1. Pré-requisitos

- Node.js 18+
- Um bot no [Discord Developer Portal](https://discord.com/developers/applications)
- Uma chave no [OpenRouter](https://openrouter.ai/)

### 2. Instalar dependências

```bash
npm install
```

### 3. Configurar ambiente

Crie um arquivo `.env` na raiz:

```env
TOKEN=seu_token_do_discord
CLIENT_ID=id_do_seu_bot
OPENROUTER_API_KEY=sk-or-v1-sua_chave
MASTER_KEY=senha_secreta_mestra
# API local; para acesso pelo celular, use apenas o IP Tailscale desta máquina
API_HOST=127.0.0.1
API_PORT=3000
# Necessário somente se houver ssl/neon.pfx
SSL_PASS=senha_do_certificado
```

| Variável | Obrigatório | Descrição |
|---|---|---|
| `TOKEN` | Sim | Token do bot no Discord |
| `CLIENT_ID` | Sim | ID numérico do bot |
| `OPENROUTER_API_KEY` | Sim | Chave da API OpenRouter |
| `MASTER_KEY` | Sim | Senha para ativar modo administrador |
| `DOCS_PORT` | Não | Porta do servidor de documentação (default: 3000) |
| `API_HOST` | Não | Interface da API; padrão seguro: `127.0.0.1` |
| `API_PORT` | Não | Porta da API/HUD (default: 3000) |
| `SSL_PASS` | Condicional | Senha do `ssl/neon.pfx`; necessária para iniciar HTTPS |

**Segurança:** A chave mestra só funciona em DM, nunca em canais públicos. Não publique o `.env`, certificados nem a `MASTER_KEY`.

### Acesso pelo celular via Tailscale

Por padrão, a API aceita conexões apenas no próprio PC (`127.0.0.1`). Para usar o HUD no celular, instale e conecte o Tailscale nos dois dispositivos e defina o IP Tailscale do PC no `.env`:

```env
API_HOST=100.x.y.z
API_PORT=3000
SSL_PASS=senha_do_certificado
```

Reinicie a Neon e abra `https://100.x.y.z:3443/hud` no celular. Use somente o IP Tailscale — não configure `0.0.0.0`, não exponha portas no roteador e mantenha a `MASTER_KEY` exclusiva.

### 4. Registrar comandos

```bash
node deploy-commands.js
```

Registra todos os slash commands descobertos em `src/commands/` na API do Discord.

### 5. Iniciar

```bash
npm start
```

### Documentação

Ao iniciar, o bot sobe um servidor HTTP com a documentação interativa dos comandos em `http://localhost:3000` (ou porta definida em `DOCS_PORT`).

## Comandos

### Público

| Comando | Descrição |
|---|---|
| `/neon <mensagem>` | Conversar com a Neon |
| `/convidar` | Link para adicionar a Neon em servidores ou no perfil |
| `/google` | Integração Google: calendário, tarefas, gmail e drive |

### Admin (requer chave mestra)

| Comando | Descrição |
|---|---|
| `/blacklist <usuario>` | Bloquear acesso ao bot |
| `/unblacklist <usuario>` | Desbloquear acesso |
| `/afinidade <usuario> <valor>` | Definir afinidade (-1000 a 1000) |
| `/mood <tipo>` | Alterar humor global do bot |
| `/apelido <usuario> <apelido>` | Definir apelido (máx 50 caracteres) |
| `/memoria <usuario> <texto>` | Adicionar observação ao perfil |
| `/limparmemoria <usuario>` | Limpar todas as observações |
| `/perfil <usuario>` | Exibir perfil completo |
| `/gostos <usuario> <texto>` | Registrar interesse |
| `/personalidade <usuario> <texto>` | Registrar traço de personalidade |
| `/revogar <usuario>` | Remover acesso mestre de outro admin |

### Ativar como mestre

Envie a `MASTER_KEY` em **DM** para o bot. Após ativado, todos os comandos admin ficam disponíveis.

## User Install (App de Usuário)

A Neon pode ser instalada como **app de usuário**, permitindo usar `/neon` em qualquer DM — inclusive no meio da conversa com outra pessoa.

**Para instalar:** use `/convidar` e clique em "Perfil", ou acesse diretamente:

```
https://discord.com/oauth2/authorize?client_id=SEU_CLIENT_ID&integration_type=1&scope=applications.commands
```

Após autorizar, o comando `/neon` aparece no menu de slash commands de **qualquer DM**.

> **Nota:** Comandos admin (`/blacklist`, `/afinidade`, etc.) só funcionam no PV do bot e em servidores, não em DMs de outros usuários.

## Integração Google

A Neon conversa com Google Calendar, Tasks, Gmail e Drive — por slash command ou por linguagem natural no `/neon` (ex.: "quais emails não li", "adiciona tarefa comprar pão", "cria evento amanhã às 14h").

### Setup (1 vez, na máquina da Neon)

1. Crie as credenciais em [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → **Create OAuth client ID** → tipo **Desktop app** (ou Web com redirect `http://localhost:8787`). Baixe o JSON.
2. Salve como `google_credentials.json` na raiz do projeto.
3. Rode:
   ```
   node google_oauth_setup.js
   ```
   Abra a URL impressa, autorize e o token será salvo em `google_token.json` (não commite este arquivo).
4. Reinicie a Neon e rode `/google status` para confirmar.

> Escopos pedidos: `calendar`, `tasks`, `gmail.readonly`, `drive`. Variáveis de ambiente opcionais: `GOOGLE_CREDENTIALS_PATH`, `GOOGLE_TOKEN_PATH`, `GOOGLE_OAUTH_PORT`, `GOOGLE_REDIRECT_URI`.

### Exemplos de uso

| Frase | Efeito |
|---|---|
| "o que tem hoje na agenda?" | Eventos de hoje |
| "próximos eventos" | Próximos 5 eventos |
| "cria evento almoço amanhã às 12h" | Cria evento no Calendar |
| "quais tarefas tenho pra fazer?" | Lista tarefas do Tasks |
| "adiciona tarefa pagar o aluguel" | Cria tarefa |
| "quais emails não li?" | Conta não lidos no Gmail |
| "procura arquivo relatório no drive" | Busca no Drive |

## Arquitetura

### Fluxo de mensagens

```
Mensagem → messageCreate.js
  ├── É bot? → Ignora
  ├── Está na blacklist? → Ignora
  ├── É chave mestra? → Ativa admin, retorna
  ├── Já está sendo processada? → Ignora (Set guard)
  ├── ativou? (prefixo/reply/DM) → Aplica cooldown
  │   └── askNeon() → OpenRouter → Histórico → Responde
  └── Erro? → Log + mensagem de erro
```

### Sistema de comandos

Cada comando em `src/commands/` exporta:

```js
module.exports = {
  data: SlashCommandBuilder,    // Definição para deploy
  adminOnly: true,              // Requer auth? (true = só admin)
  async execute(interaction) {} // Handler
};
```

O `src/commands/index.js` descobre automaticamente todos os arquivos via `fs.readdirSync` e monta um `Map<nome, comando>`. O `deploy-commands.js` percorre o mesmo diretório para registrar na API do Discord — **garantia de que todo comando registrado tem handler e vice-versa**.

### Segurança

- Chave mestra validada **só em DM**
- Blacklist verificada **antes** da chave mestra
- `adminOnly: true` bloqueia comandos no router central
- Input do usuário truncado em 2000 caracteres antes da API
- Observações limitadas a 200 entradas (FIFO)
- Cooldown de 3s entre mensagens por usuário
- `Set` de IDs evita processamento duplicado concorrente
- `db.write()` executado no SIGINT/SIGTERM — sem perda de dados

### Logs

```
[2026-05-14 23:51:31] [INFO] Client conectado {"tag":"Neon#1234","guilds":5}
[2026-05-14 23:51:31] [INFO] Processando pergunta {"usuario":"Fulano","pergunta":"qual o sentido..."}
[2026-05-14 23:51:31] [INFO] Resposta gerada {"usuario":"Fulano","tempo_ms":1234,"caracteres":432}
[2026-05-14 23:51:31] [WARN] Chave mestra rejeitada — só funciona em DM
[2026-05-14 23:51:31] [ERROR] Falha na OpenRouter {"tempo_ms":5000,"erro":"timeout"}
```

Níveis: `INFO`, `WARN`, `ERROR`.

## Manutenção

### Adicionar um comando

1. Crie `src/commands/meucomando.js`:

```js
const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("meucomando")
    .setDescription("Descrição")
    .setContexts(
      InteractionContextType.Guild,
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel
    )
    .setIntegrationTypes(
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall
    ),
  adminOnly: true,
  async execute(interaction) {
    await interaction.reply("funciona!");
  },
};
```

2. Rode `node deploy-commands.js` para registrar na API.

### Limpar histórico do git (secrets)

Se o `.env` foi commitado acidentalmente:

1. Revogue os tokens no Discord Developer Portal e OpenRouter
2. Atualize o `.env` com os novos valores
3. Use `git filter-branch` ou `git filter-repo` para remover do histórico

```bash
# Exemplo com git filter-repo
pip install git-filter-repo
git filter-repo --path .env --invert-paths
```

## Licença

ISC
