# Neon

## Regras de ambiente (IMPORTANTE)

- **NUNCA usar `Get-CimInstance`** (nem `Get-WmiObject`/`wmic`) neste PC — trava o sistema e interrompe os processos. Para inspecionar processos, use `Get-Process` ou `tasklist`.
- Evitar comandos que mantenham o shell bloqueado por muito tempo (timeouts longos com processos interativos).
- Neon deve permanecer ligada; reiniciar somente quando necessário (mudança de código/config).
- **SEMPRE commitar e pushar os projetos após QUALQUER alteração.** Não importa o que seja — sempre fazer commit + push ao finalizar mudanças.
- **Sempre que a Neon iniciar, enviar uma DM ao dono** informando que está online e incluindo um resumo das mudanças recentes do Git.

## WhatsApp (ver docs/WHATSAPP_UI.md)

- Navegador do WhatsApp roda **VISÍVEL** (headless quebra o envio). Não trocar.
- Para mandar mensagem/documento: `abrir_conversa` → `enviar_ui` / `enviar_doc_ui`. A lib (`enviar`/`enviar_raw`) só é confiável pra DM.
- **Encoding**: chamadas HTTP pro Neon devem ser feitas direto do Node (fetch), não de .ps1. Se usar PowerShell: ler arquivos com `[System.IO.File]::ReadAllText(caminho, [Text.Encoding]::UTF8)` (Get-Content -Raw corrompe JSON com metadados) e nunca acento em .ps1 sem BOM.
- Sessão em `.whatsapp/` é secreta — nunca commitar (já ignorada no .gitignore).
