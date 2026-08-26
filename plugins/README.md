# Pasta de plugins

Aqui ficam todos os plugins da Neon. Cada arquivo `.js` nesta pasta é um plugin no formato:

```js
module.exports = {
  nome: "MeuPlugin",
  versao: "1.0",
  desc: "O que ele faz",
  async iniciar(client) {},       // roda quando a Neon inicia
  async parar() {},               // roda quando a Neon desliga
  ferramentas: [                  // ferramentas que a IA pode chamar
    { nome, desc, async executar(args) {} }
  ],
  acoes: [                        // comandos/texto que disparam ações
    { padrao: /regex/i, async executar(texto, userId) {} }
  ],
};
```

O `gerenciador.js` carrega automaticamente todos os plugins da pasta ao iniciar.

## Plugins atuais

| Arquivo        | Plugin     | Status                  | Dependências            |
|----------------|------------|-------------------------|-------------------------|
| `opencode.js`  | OpenCode   | Ativo (delega tarefas)  | OPENROUTER_API_KEY      |
| `notion.js`    | Notion     | Ativo (banco + agenda)  | NOTION_API_KEY          |
| `whatsapp.js`  | WhatsApp   | Ativo (sob demanda)     | Sessão .whatsapp/       |
| `tailscale.js` | Tailscale  | Ativo (gerencia rede)   | Tailscale instalado     |
| `strava.js`    | Strava     | Ativo (export CSV)      | STRAVA_EXPORT_DIR       |
| `medal.js`     | Medal      | Ativo (clips recentes)  | Medal instalado         |
| `alerta_chuva.js` | Chuva  | Ativo (alerta diário)   | CLIMA_CIDADE            |
| `exemplo.js`   | Exemplo    | Template de referência  | —                       |

## Config

Credenciais e IDs de cada plugin ficam no `.env` na raiz (nunca commitadas).
- Notion: `NOTION_API_KEY`, `NOTION_DATABASE_ID`, `NOTION_AGENDA_ID`
- Strava: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`
- Tailscale: precisa do `tailscale.exe` em `C:\Program Files\Tailscale\`
- WhatsApp: sessão em `.whatsapp/` (gitignored)
- Chuva: `ALERTA_CHUVA`, `ALERTA_CHUVA_HORA`, `CLIMA_CIDADE`
