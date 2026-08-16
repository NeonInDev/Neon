# Neon

## Regras de ambiente (IMPORTANTE)

- **NUNCA usar `Get-CimInstance`** (nem `Get-WmiObject`/`wmic`) neste PC — trava o sistema e interrompe os processos. Para inspecionar processos, use `Get-Process` ou `tasklist`.
- Evitar comandos que mantenham o shell bloqueado por muito tempo (timeouts longos com processos interativos).
- Neon deve permanecer ligada; reiniciar somente quando necessário (mudança de código/config).
- **SEMPRE commitar e pushar os projetos após QUALQUER alteração.** Não importa o que seja — sempre fazer commit + push ao finalizar mudanças.
