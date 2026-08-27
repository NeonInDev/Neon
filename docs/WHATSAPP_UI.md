# Integração WhatsApp — Guia de UI e Lições Aprendidas

Como a Neon conversa com o WhatsApp Web (via `plugins/whatsapp.js` + whatsapp-web.js PR #5772, versão 1.34.5-alpha.3) e tudo que descobrimos na prática pra fazer isso funcionar.

## Arquitetura

- **Navegador VISÍVEL** (`headless: false`, Edge): o headless quebrava o envio — `sendMessage` resolvia mas a mensagem nunca saía (ficava com relógio ⏱ pendente). Com janela real, tudo funciona. **Não voltar pra headless.**
- **Sessão**: `LocalAuth` em `.whatsapp/` (ignorada no git — contém credenciais). Se travar: parar node pela porta 3000, matar msedge, apagar `.whatsapp/session/lockfile`.
- **Popup "Novidades do WhatsApp Web"** aparece a cada carregamento e bloqueia a UI → `fecharModais()` clica em "Continuar" (roda sozinho 8s após ready).

## Por que envio pela UI (e não pela lib)

`client.sendMessage` / stores da lib ficam desconectados do app real nessa versão (stores vazias, `getChats()` falha). O caminho confiável é **operar a interface**:

1. `abrirConversa(termo)` — acha o item `[data-testid^="list-item-"]` cujo `[data-testid="cell-frame-title"]` é igual ao termo, rola até ele (`scrollIntoView`) e clica com **mouse real** (`page.mouse.click`). Eventos sintéticos (`el.click()`) são ignorados pelo React.
2. `enviarUI(texto)` — foca o composer e insere com `document.execCommand("insertText", ...)` + Enter. Funciona com textos longos (13k+ chars).
3. `enviarDocUI(arquivo, legenda)` — clica anexar → item "Documento" → `uploadFile` no `input[type=file]` → legenda → Enter.

## Seletores reais desta versão do WA Web

| Elemento | Seletor |
|---|---|
| Itens da lista de chats | `[data-testid^="list-item-"]` |
| Título do chat no item | `[data-testid="cell-frame-title"]` |
| Container da busca | `[data-testid="chat-list-search-container"]` |
| Header da conversa aberta | `[data-testid="conversation-info-header"]` |
| Composer | `[data-testid="conversation-compose-box-input"]` ou `footer div[contenteditable="true"]` |

## Rotas da API (src/api_publica.js)

Todas sob `/api/whatsapp/*` com chave (`X-Hud-Key` ou `?key=`):

- `GET status` | `GET qr` | `POST fechar_modais`
- `POST abrir_conversa {termo}` — abre conversa pelo nome
- `POST enviar_ui {texto}` — manda texto na conversa aberta
- `POST enviar_doc_ui {arquivo, legenda}` — manda documento na conversa aberta
- `POST enviar {numero, mensagem}` / `POST enviar_raw {destino, texto}` — via lib (só funcionam pra DM; **não usar pra grupo**, `enviar` reescreve o destino como número)
- Diagnóstico: `GET debug`, `POST extrair_ids {escopo?}`, `POST clicar_texto`, `POST diag_fiber`, `POST inspecionar`, `POST buscar_chat`, `POST entrar_grupo`, `POST info_chat`

## Scripts prontos (scripts/)

- `preparar_textos.js` — converte os `.md` de revisão em `.txt` limpos (sem markdown cru).
- `enviar_por_questao.js` — divide as revisões em mensagens por questão/parte/gabarito e envia pro grupo 8ºD via API. Rodar com `node scripts/enviar_por_questao.js`.

## ARMADILHAS DE ENCODING (Windows/PowerShell 5.1) — IMPORTANTE

1. **`.ps1` sem BOM é lido como ANSI** → "º" vira lixo ("ǽ"). Solução: evitar acentos em .ps1 ou montar com `[char]0xBA`.
2. **`Get-Content -Raw` anexa propriedades PSPath ao string** e `ConvertTo-Json` serializa essas notas → o JSON vai com `"texto": {"value": "...", "PSPath": ...}` → o Node faz `String(obj)` = `"[object Object]"` e **isso foi parar no grupo**. Solução: ler arquivo com `[System.IO.File]::ReadAllText(caminho, [System.Text.Encoding]::UTF8)`.
3. Melhor de todos: **fazer chamadas HTTP direto do Node** (`fetch` nativo) — zero problema de encoding. Foi o que funcionou.
4. Console do PowerShell exibe UTF-8 como "????" — é só exibição; o conteúdo vai certo se o body for `UTF8.GetBytes`.

## Outras lições

- Handler `ready` deve chamar `module.exports.fecharModais()`, nunca `exports.` (após reatribuir `module.exports`, `exports` fica velho → TypeError → crash em loop 8s após cada connect).
- Falha de init do puppeteer ("Navigating frame was detached") é transitória → retry automático em 12s já implementado.
- Extração de IDs por React fibers funciona mas o pareamento id↔rótulo sofre contaminação de componentes compartilhados — não confiar para descobrir "quem é quem"; confiar no título do item clicado.
- Eventos `message` da lib são instáveis; mensagens antigas chegam com autor `@lid`.
