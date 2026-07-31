Repositório: https://github.com/NeonInDev/Neon

Comandos recomendados para Windows (instalar/configurar GCM e push):

1) Instalar Git Credential Manager (se não tiver):
   - Baixar o instalador: https://github.com/git-ecosystem/git-credential-manager/releases/latest
   - Executar o instalador GUI ou o executável "gcmuser-win-x64-*.exe" (modo silencioso: /S)
   - Alternativa: instalar/atualizar Git for Windows (vem com GCM bundled)

2) Configurar helper do Git:
   git config --global credential.helper manager-core

3) Verificar remote e ajustar para HTTPS se necessário:
   git remote -v
   # Se o origin for SSH e quiser usar HTTPS:
   git remote set-url origin https://github.com/<seu-usuario>/<seu-repo>.git

4) Fazer push (vai abrir janela de login do GitHub via GCM):
   git push origin main

Alternativa com GitHub CLI (recomendada para login web):
   gh auth login --web
   git push origin main

Observações:
- Não compartilhe tokens/senhas aqui.
- Se o push falhar aqui pelo ambiente remoto, rode os mesmos comandos no seu terminal local e autentique quando a janela do GCM abrir.
