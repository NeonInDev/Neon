# Integração Discord UI — sua conta (via navegador web)

Como a Neon age **na SUA conta do Discord** (mensagem + chamada de voz) pela interface web, em vez de como bot (conta Neon#5390). Módulo: `src/discord_ui.js`.

## O que resolve

O envio como bot (`discord_msg.enviarDM`) manda pela conta da Neon (prefixa "💬 **Neon:**"). Isso aqui é diferente: a Neon abre o Discord Web logado como **você** e digita/envia/clica como você. Útil pra "manda uma mensagem dizendo X pra fulano" e "liga pra fulano" parecendo você.

## Arquitetura

- **Navegador VISÍVEL** (Playwright + Opera GX): igual o WhatsApp, headless não é confiável pra UI interativa. Abre o Opera com um perfil dedicado.
- **Perfil**: `C:\Users\Pichau\AppData\Local\neon_discord_profile` (SEM credenciais no git). **Na primeira vez** você precisa abrir o Discord web nesse perfil e logar 1x; depois a sessão fica salva e a Neon reutiliza.
- **Fechamento por inatividade**: mantém aberto se você estiver usando; fecha após ~4min sem comando. Reabre só quando precisar.
- **Flag de segurança**: `DISCORD_UI_AUTONOMO` no `.env` (`0`/vazio = pede confirmação antes de agir como você; `1` = age direto). Default `0`.

## Fluxo

1. `resolverUsuario(alvo)` (de `discord_msg.js`) resolve "fulano" / "123" → ID real. A Neon **não digita nome na busca**: navega direto pra `https://discord.com/channels/@me/{ID}`. Mais confiável.
2. `enviarMensagem(alvo, texto)` — abre o DM, foca `div[role="textbox"][contenteditable="true"]`, digita, Enter, e confirma que o texto apareceu em `[data-list-id="chat-messages"]`.
3. `ligar(alvo)` — abre o DM e clica no botão de chamada de voz (por `aria-label` contendo "iniciar chamada"/"start call"/etc.).

## Seletores do Discord Web

| Elemento | Seletor |
|---|---|
| Caixa de texto | `main div[role="textbox"][contenteditable="true"]` |
| Lista de mensagens | `[data-list-id="chat-messages"]` |
| Botão chamada de voz | `button[aria-label~="Chamada de voz"]` (por `aria-label` contendo "iniciar chamada"/"start call") |

> Dominada em 2026; se o Discord mudar os seletores, as funções `seletoresCaixaTexto()` e o fallback de clique por `<svg>` precisam de ajuste.

## Rotas da API (src/api_publica.js)

Sob `/api/discord/ui/*` com chave (`X-Hud-Key` ou `?key=`):

- `POST /api/discord/ui/enviar {usuario, mensagem}` — envia na sua conta
- `POST /api/discord/ui/ligar {usuario}` — inicia chamada de voz na sua conta

## Palavras-chave na Neon (src/actions.js)

- Categoria `mensagem` (não-whatsapp): agora usa a **sua conta** via `discord_ui.enviarMensagem`, exceto alvo "mim/me/eu/dono/owner" (continua no seu PV via bot).
- Categoria nova `ligar`: "liga pra <fulano>", "ligar para <fulano>", "chama <fulano>" → `discord_ui.ligar`.
- Sem `DISCORD_UI_AUTONOMO=1`: a Neon pergunta "Confirmo? (sim/não)" e só age na confirmação (via `acaoPendente{ tipo:"discordUI" }`).

## Armadilhas

- Se retornar `precisaLogin`, o perfil não está logado → abra o Discord nesse perfil 1x.
- O navegador abre visível: se você estiver usando o PC, verá a aba abrir/agir. É o comportamento esperado.
- Não confundir com `discordUI` (bot) — se quiser voltar ao envio como bot num alvo específico, reverter o bloco "mensagem" pra `usuarioDiscord.send(...)`.
