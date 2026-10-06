# Copilot instructions

## Commands

- `npm start` runs the bot and its HTTP/HUD API (`node index.js`).
- `node deploy-commands.js` registers the Discord slash commands.
- `npm run mcp` starts the OpenCode MCP service; `npm run tui` runs the terminal UI.
- `package.json` currently defines no build, lint, or test scripts, and there are no checked-in `*.test.js` or `*.spec.js` files. There is no single-test command yet.
- For a syntax-only check of one CommonJS file, use `node --check path\to\file.js`.

## Architecture

- `index.js` is the bootstrap: it loads the Discord client, starts the public API/HUD, and initializes monitors, scheduled jobs, skills, OpenCode, and plugins after Discord is ready. Shutdown handlers stop services and persist the LowDB store.
- `src/client.js` discovers and wires event handlers from `src/events/`. `messageCreate.js` handles natural-language activation, owner checks, conversation queuing, and AI dispatch; `interactionCreate.js` routes slash commands and their components while applying access checks.
- `src/ai.js` builds the conversational context, tries configured LLM providers in fallback order, and coordinates tools/skills. `src/actions.js` implements natural-language PC/app actions; `src/tools.js` dispatches native integrations or delegates work to OpenCode.
- Slash commands live in `src/commands/` and are discovered when `src/commands/index.js` loads. A command module exports `data` and `execute`; optional autocomplete, modal, and component handlers are routed by `interactionCreate.js`. Register command changes with `node deploy-commands.js`.
- `plugins/gerenciador.js` discovers plugin modules and manages their lifecycle. Plugins can expose tools and actions as well as `iniciar`/`parar` hooks.
- `src/api_publica.js` and related API modules serve the HTTP API and web HUD; `public/hud/` is the website, while `hud-app/` is the desktop HUD and `pendrive/` contains its distribution. Keep their behavior aligned when changing HUD features.
- Persistent user/conversation data is stored locally through LowDB in root `memory.json`; other integrations may keep their own local state under `data/` or dedicated directories.

## Repository-specific conventions

- This is a CommonJS Node.js project. Follow the existing module and command patterns rather than introducing another module system.
- Reuse the existing access-control helpers in `src/perm.js` and `src/permissions.js`. Message-level owner checks and slash-command permission gates are implemented in separate event paths, so changes to privileged behavior must account for both.
- Use the existing logger (`src/logger.js`) for operational errors and status. Long-running services should integrate with the bootstrap's startup/shutdown lifecycle.
- Keep secrets and machine/session state out of tracked files: never print or commit `.env`, credentials, tokens, `memory.json`, WhatsApp session data, or other private runtime data. Do not commit `AGENTS.md`.
- WhatsApp browser automation must remain visible (not headless). For group sends, use the UI flow (`abrir_conversa` then `enviar_ui`/`enviar_doc_ui`); the library send path is reliable only for DMs. See `docs/WHATSAPP_UI.md`.
- On this machine, do not use `Get-CimInstance`, `Get-WmiObject`, or `wmic`; use `Get-Process` or `tasklist` for process inspection. For PowerShell file reads involving UTF-8/JSON metadata, use `[System.IO.File]::ReadAllText(path, [System.Text.Encoding]::UTF8)`; prefer Node `fetch` for HTTP calls.
- After project changes, the repository's local workflow expects a commit and push. Stage only task-related files; never include unrelated worktree changes or secret-bearing files.
