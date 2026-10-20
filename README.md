# Neon

Assistente pessoal em Node.js para Discord, com conversa por IA e um conjunto enxuto de recursos de voz, mídia, visão e jogos. Funcionalidades legadas e seus dados locais foram preservados, mas superfícies fora do escopo atual estão desativadas.

## Recursos ativos

- Conversa com a Neon por `/neon` e mensagens direcionadas.
- Busca e controle de músicas no Spotify; busca de vídeos no YouTube.
- TTS e STT por voz e API HTTP.
- Análise de imagens anexadas e pelo endpoint de visão.
- MCPs de web, navegador, sistema de arquivos (limitado ao repositório Neon), voz e ferramentas Steam/Spotify.
- Busca, início, instalação e desinstalação de jogos pela Steam. Instalação e desinstalação exigem confirmação explícita; a Steam mantém sua própria confirmação de desinstalação.

Hydra e outros launchers não estão integrados. Só serão considerados com um fluxo oficial documentado para jogos que o usuário possui.

## Início rápido

```bash
npm install
# Configure as credenciais no .env; não as compartilhe nem as versione.
npm start
npm test
node deploy-commands.js
```

`npm start` inicia o bot Discord, a API HTTP/HUD, o servidor OpenCode e a verificação dos provedores de IA. Não inicia gravação automática de chamadas, módulos proativos, lembretes, plugins externos ou skills executáveis.

## Comandos Discord ativos

`/neon`, `/saude`, `/spotify`, `/youtube`, `/letra`, `/ping` e `/sair`.

Os comandos antigos continuam no repositório para recuperação, mas não são carregados nem registrados pelo deploy atual. O roteador de ações de voz também aceita apenas mídia, jogos Steam, TTS e controles de microfone.

## API principal

Rotas `/api/*` não listadas abaixo retornam `404`. Rotas que exigem autenticação usam `X-Hud-Key` com a chave mestra local. `/doc`, `/global/health`, `/global/event` e `/session/{id}/message` permanecem como endpoints de documentação, eventos e compatibilidade OpenCode.

| Método | Rota | Uso |
|---|---|---|
| `GET` | `/health`, `/api/status`, `/api/saude` | Estado do serviço e provedores de IA |
| `POST` | `/api/chat` | Conversa autenticada |
| `POST` | `/api/visao` | Analisa uma imagem em base64 |
| `GET/POST` | `/api/modo` | Consulta e configura o modo de voz |
| `GET` | `/api/pc` | Estado básico do PC |
| `POST` | `/api/pc/volume`, `/api/pc/screenshot` | Volume e captura para visão |
| `POST` | `/api/voz/falar`, `/api/voz/audio`, `/api/voz/stt` | Voz, síntese e transcrição |
| `GET` | `/api/jogos/steam/buscar?q=...` | Pesquisa na loja Steam |
| `POST` | `/api/jogos/steam/instalar` | Abre instalação após confirmação explícita |
| `POST` | `/api/jogos/steam/desinstalar` | Abre confirmação de desinstalação da Steam |

Para instalação/desinstalação via API, envie `{"appid":"...", "confirmar":true}` somente depois da confirmação do usuário. O site `/hud` continua disponível; endpoints de recursos desativados não podem ser usados por ele.

## MCPs ativos

- `web`: pesquisa e leitura de páginas.
- `browser`: automação de navegação usada por mídia/web.
- `filesystem`: acesso somente a `src`, `test`, `docs` e `public\hud` do projeto; `.env` e dados locais ficam fora do escopo.
- `pc`: Steam e Spotify, com instalação/desinstalação sujeitas a confirmação.
- `voice`: fala em um canal Discord ativo.
- `neon`: estado e cálculo local.

As permissões de edição e terminal do OpenCode continuam configuradas para pedir aprovação. MCPs de celular, GitHub, Git e Yggdrasil, assim como integrações externas antigas, estão desativados.

## Estrutura principal

```text
index.js                 Inicialização mínima e encerramento
src/ai.js                Conversa, provedores e análise de anexos
src/feature-policy.js    Lista de comandos e ações ativos
src/api-policy.js        Lista de rotas HTTP ativas
src/api_publica.js       API HTTP/HUD
src/mcp-*.js             Servidores MCP locais
src/tts.js / src/stt.js  Síntese e transcrição de áudio
src/visao.js             Análise de imagens
src/pc.js                Integrações Steam e Spotify selecionadas
test/                    Testes de regressão
```

## Segurança e dados

- `.env`, credenciais, memória, sessões e dados locais não devem ser commitados.
- A API não deve ser exposta publicamente sem VPN e autenticação.
- Acesso MCP ao sistema de arquivos fica restrito ao projeto Neon.
- Funcionalidades fora da lista estão desativadas; seus módulos e dados legados não foram apagados nesta etapa.
