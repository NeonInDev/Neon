# Neon no Render — Problema do Discord (IP banido)

## Status
**API web/chat no Render: FUNCIONANDO** (https://neon-4bqf.onrender.com)
**Login do Discord no Render: BLOQUEADO** — sem solução gratuita viável. A Neon continua conectando no Discord via PC local.

## O problema
O deploy no Render passou (build OK, serviço `live`, healthcheck `/health` responde), mas o **Discord nunca conecta**. Diagnóstico feito via logs da API do Render:

```
[INFO] [BOOT] Diagnostico Discord REST {"status":429,...}
[WARN] [BOOT] Login no Discord ainda pendente (60s)...
```

O status **429 (Too Many Requests)** com resposta HTML do Cloudflare indica que o Discord **bana por rate limit o IP do datacenter do Render** (IP compartilhado entre vários usuários). O WebSocket do gateway (`wss://gateway.discord.gg`) fica pendente para sempre porque o Discord recusa o IP antes mesmo do handshake.

- Localmente no PC funciona porque o IP é residencial.
- Não é bug no código: teste local de `client.login()` conecta em segundos.

## O que foi tentado
1. **Porta no Render** — corrigido: a API agora escuta em `PORT` + `0.0.0.0` quando `RENDER=true` (index.js / api_publica.js).
2. **Crash sem TOKEN/MASTER_KEY** — corrigido: config.js não faz mais `process.exit(1)` no Render; API sobe no boot independente do Discord (index.js).
3. **DNS IPv4** — tentado `dns.setDefaultResultOrder("ipv4first")`: não resolveu (o problema é o ban de IP, não DNS).
4. **Diagnóstico REST do Discord** — confirmou o 429 (foi removido depois de diagnosticar).

## Soluções possíveis (avaliadas)
| Opção | Custo | Veredito |
|---|---|---|
| Manter Discord no PC + API no Render | Grátis | **ESCOLHIDO** |
| Migrar gateway pro Railway (IPs dedicados) | Grátis ~1 mês (crédito) | Viável se quiser 24/7 |
| QuotaGuard (egress IP fixo no Render) | ~US$7/mês | Descartado |

## Como manter o Discord no PC (24/7 o quanto possível)
A Neon roda no PC via `start.bat` e conecta no Discord normalmente. A hibernação automática (12:40 → 17:25) desliga o bot nesse intervalo — aceito por enquanto.

## Arquivos alterados nesta frente
- `render.yaml` — blueprint com env vars e healthcheck `/health`
- `index.js` — API sobe no boot; login com retry; `ipv4first`; não `exit` no Render
- `src/config.js` — não `process.exit(1)` sem chaves quando `RENDER=true`
- `src/api_publica.js` — `API_HOST` = `0.0.0.0` quando `RENDER=true`; aceita `PORT`
- `package.json` — `overrides` protobufjs@7 + sharp@0.35 (eliminou as 5 vulnerabilidades)