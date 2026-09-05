# Spotify — Tocar em outros dispositivos (cross-device)

A Neon agora consegue tocar música do Spotify em **qualquer dispositivo da conta**
(celular, TV, outro PC). Para isso usa a **Spotify Web API**.

**Importante:** a conta do Spotify precisa ser **PREMIUM** (playback via API é
exclusivo Premium). E os dispositivos de destino precisam estar ligados/conectados
na conta Spotify.

## Passo 1 — Criar o app (uma única vez, ~3 min)

1. Abra https://developer.spotify.com/dashboard e faça login com a conta do Spotify.
2. Clique em **Create app** (criar aplicativo).
3. Preencha:
   - App name: `Neon`
   - App description: `Controle de audio da Neon`
   - Website / Redirect URI: **`http://localhost:8888/callback`**
   - Marque "Web API" (é automático).
4. Clique **Save**.
5. Na página do app, copie:
   - **Client ID** (roda de 32 caracteres)
   - Click em **Show client secret** → **Client Secret**

## Passo 2 — Colocar Client ID/Secret no .env

Edite `C:\Users\Pichau\Neon\.env` e acrescente:

```
SPOTIFY_CLIENT_ID=SEU_CLIENT_ID
SPOTIFY_CLIENT_SECRET=SEU_CLIENT_SECRET
SPOTIFY_REFRESH_TOKEN=
```

(Não precisa commitar — `.env` já é gitignored.)

## Passo 3 — Gerar o REFRESH_TOKEN (autorização única)

Rode:

```
cd C:\Users\Pichau\Neon
node spotify_auth.js
```

- O navegador abre, você faz login no Spotify e clica em **Concordo**.
- O script captura a volta e imprime as 3 linhas prontas.
- Copie `SPOTIFY_REFRESH_TOKEN=...` para o `.env` (completa a linha).

## Passo 4 — Reiniciar a Neon

Reinicie a Neon (método "dispara e esquece"). Depois testa falando:

> "Neon, quais dispositivos estão no Spotify?" → lista os aparelhos
> "Neon, toca Viva la Vida no celular" → toca no device escolhido
> "Neon, toca um rock no PC" → usa o dispositivo ativo/local

## Nova fraseologia das tools

- `pc_spotify_dispositivos` — lista dispositivos conectados (id, nome, tipo, ativo).
- `pc_spotify_tocar_em` — toca busca ou ID/URL numa device específica.
- `pc_spotify_buscar_tocar` / `pc_spotify_tocar_id` / `pc_spotify_controle` —
  continuam funcionando no player local (fallback quando sem API).

## Troubleshooting

| Problema | Causa / Solução |
|---|---|
| `Spotify Web API não configurada` | Faltam as 3 chaves no `.env` — faça os passos 1–3. |
| `Falha ao tocar (403)` | Conta não é Premium OU dispositivo inativo. Use um device ligado. |
| `Erro 429` | Rate limit da API — aguarde alguns segundos e repita. |
| Dispositivo não aparece | O aparelho precisa estar aberto no Spotify (na conta certa). |