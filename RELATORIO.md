# Relatório — Manutenção da Neon

## Atualização 10/08/2026

- **Modo proativo (Jarvis) com flag `PROATIVO`:** `index.js` agora só chama `proativo.iniciar()` se `PROATIVO != 0`. Com `PROATIVO=0` a Neon não age mais sozinha (não responde sem request) — log de confirmação no boot.
- **`.env`:** `PROATIVO=0` (autonomia desligada) e `OPENROUTER_MODEL=openrouter/openai/gpt-4o-mini` (modelo mais rápido e barato que o nemotron-free).
- **Dashboard Next.js (`next-dashboard/`):** frontend em React/TS com chat com a Neon, painel do PC (CPU/RAM/disco, screenshot, volume, notificações), terminal remoto e explorador de arquivos. Acessa a API da Neon por proxy `/api/neon/*` — a `MASTER_KEY` fica no `.env.local` do dashboard (nunca sai pro navegador). Rodar com `npm run dev` na porta 3001.

---

## Relatório 04/08/2026

Data: 04/08/2026

## 1. Bugs críticos corrigidos

### 1.1 Boot da Neon quebrado (API e opencode serve nunca subiam)
- **Causa:** `src/monitor.js` usava `log(...)` sem importar `log` do logger. Quando o evento `clientReady` disparava, `monitor.iniciar()` lançava `ReferenceError: log is not defined` e **abortava o resto do handler** — `opencode.iniciarServer()` e `apiPublica.iniciar()` nunca rodavam (porta 3000 ficava fora do ar, serve não iniciava).
- **Correção:** import de `log` adicionado; corrigidos também `user` indefinido em `verificarDesligamento()` e `resumoDiario()` (agora buscam o usuário via `client.users.fetch(OWNER)`).
- **Blindagem extra em `index.js`:** cada módulo (`monitor`, `proativo`, `agendados`, `alarmes`, `opencode`, `apiPublica`) agora inicia em `try/catch` próprio. Uma falha isolada não derruba o resto do boot.

### 1.2 TTS (fala) quebrado
- **Causa:** `src/tts.js` usava caminho fixo `C:\ffmpeg\ffmpeg.exe` (inexistente) para converter o MP3 do Edge TTS em WAV. Log: `O sistema não pode encontrar o caminho especificado`.
- **Correção:** passou a usar `require("ffmpeg-static")` (binário já instalado em `node_modules`). Testado: MP3 gerado + conversão WAV OK.

## 2. Conflito com o opencode (trava ao iniciar a Neon)

- O `opencode serve` da Neon compartilhava o banco global do opencode (`C:\Users\Pichau\.local\share\opencode\opencode.db`) com a sua sessão, causando contenção/travamento.
- **Correções em `src/opencode.js`:**
  - **Lazy start:** o serve só sobe na primeira vez que uma ferramenta for usada (antes subia no boot). Boot ficou leve.
  - **Isolamento de dados:** o serve agora roda com `XDG_DATA_HOME=%TEMP%\neon-ocdata`, ou seja, cria banco próprio e não toca mais no seu opencode.

## 3. Segurança (rodadas anteriores, mantidas)

- **CORS restrito** (sem `*`): só `localhost`, IPs IPv6 e Tailscale `100.x.x.x`.
- **Auth `x-hud-key` (MASTER_KEY)** exigida em: `/api/chat`, `/api/modo` (POST), `/api/pc`, `/api/pc/volume`, `/api/pc/screenshot`, `/api/pc/notificar`, `/api/visao`, `/api/voz/*`, `/api/gesture`, `/api/terminal`, `/api/arquivos*`.
- **Anti-DoS no STT:** limite de 25 MB no `/api/voz/stt`.
- **Path traversal** case-insensitive (403 fora do `public/`).
- **Injeção de comando no `pc.js`:** janelas, mouse, teclado, toast, kill de processo, clipboard, TTS fallback e e-mail sanitizados com `psEsc()`/`cmdEsc()`.

## 4. Novo: Controle por gestos (webcam do celular)

Como o PC não tem webcam, o celular vira a câmera. Mãos na frente da câmera controlam o PC.

**Backend:**
- `src/pc.js`: novas funções `tamanhoTela()` (resolução da tela primária) e `scroll(delta)` (roda do mouse via `mouse_event`).
- `src/api_publica.js`:
  - Endpoint `POST /api/gesture` (autenticado com `x-hud-key`) com ações: `mover`, `clique`, `duplo`, `scroll`, `tecla`, `volume`, `notificar`.
  - Movimento do mouse com coalescência (não enche de processos PowerShell).
  - Cache da resolução da tela (30s).
  - **HTTPS na porta 3443** (cert auto-assinado em `ssl/neon.pfx`) — necessário porque o navegador do celular só libera a câmera (`getUserMedia`) em contexto seguro (https).

**Frontend:** `public/gesture.html` — usa MediaPipe Hands (CDN) no navegador do celular, desenha a mão e traduz gestos em ações.

### Como usar os gestos
1. No celular (conectado na Tailscale), abra: `https://100.115.96.52:3443/gesture`
2. Aceite o aviso do certificado (primeira vez).
3. Digite a chave `TESEU` → botão **Testar** (aparece um toast no PC se OK).
4. **Ligar controle** + **Ligar câmera**.
5. **Calibrar centro:** deixe a mão onde quer que vire o centro da tela.
6. Gestos:
   - Indicador esticado = move o mouse
   - Pinça (polegar + indicador) = clique esquerdo (2x rápido = duplo clique)
   - Pinça (polegar + médio) = clique direito
   - Indicador + médio esticados = rolar a página (move a mão pra cima/baixo)
   - Mão aberta = volume +
   - Punho = volume −
   - Slider de sensibilidade para ajustar.

## 5. Como verificar / reiniciar

- Log principal: `C:\Users\Pichau\Neon\logs\neon.log`
- Boot: `[API] Pública rodando em http://0.0.0.0:3000`, `[API] Segura rodando em https://0.0.0.0:3443`
- Teste rápido da API: `curl.exe -H "x-hud-key: TESEU" http://localhost:3000/api/gesture -X POST -d "{\"tipo\":\"notificar\",\"titulo\":\"x\",\"mensagem\":\"y\"}"`
- Reiniciar: `node index.js` dentro de `C:\Users\Pichau\Neon` (ou `npm start`).

## 6. Se algo der errado

- **PC trava ao iniciar Neon:** feche programas pesados (Spotify/Discord) — RAM de 14GB é o gargalo (iGPU divide memória). O opencode serve já é lazy; o Whisper (STT) só carrega sob demanda.
- **Gesto não funciona:** confirme que está em `https://` (não `http://`), chave correta, e internet no celular (o modelo do MediaPipe baixa na primeira vez).
- **Mudou o IP Tailscale:** o certificado precisa ser regenerado com o novo IP:
  `New-SelfSignedCertificate -DnsName "localhost","<NOVO_IP>" -CertStoreLocation Cert:\CurrentUser\My -KeyExportPolicy Exportable -NotAfter (Get-Date).AddYears(3)` e exportar pra `ssl/neon.pfx` (senha `neonssl2026`).
- **`npm install` quebrado por scripts bloqueados:** o `allowScripts` em `package.json` cobre `sharp`, `ffmpeg-static` e `protobufjs`.
