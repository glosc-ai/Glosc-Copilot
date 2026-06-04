# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Glosc Copilot is a cross-platform (Windows/macOS/Linux) AI desktop assistant built with **Tauri 2** (Rust backend) + **Vue 3 + TypeScript** (frontend). It has three modes: Chat, Meeting (multi-role AI simulation), and Workspace (Claude Code-style programming assistant with Monaco editor, integrated terminal, git status, and task planning).

- AI calls use an **offline-first** design — connects directly to user-configured OpenAI-compatible providers (OpenAI, Ollama, LM Studio, custom). Login is only needed for Glosc Store.
- Supports **MCP (Model Context Protocol)** tools, **Agent Skills / ClawHub** compatible skill packages, and **Glosc Store** plugins.

## Essential Commands

| Command | Description |
|---|---|
| `yarn dev` | Start Vite dev server |
| `yarn build` | Type-check + build frontend (`vue-tsc --noEmit && vite build`) |
| `yarn lint` | Type-check only (`vue-tsc --noEmit`) |
| `yarn tauri:dev` | Prepare binaries + run Tauri dev mode (use this for full app dev) |
| `yarn tauri:build` | Prepare binaries + build Tauri app for production |
| `yarn tauri:build:appstore` | Build for App Store |

After any changes, run `yarn tauri:build` to verify there are no compilation errors.

## Architecture

### Frontend (`src/`) — Vue 3 + TypeScript + Pinia

The app uses **file-based routing** (`unplugin-vue-router`), **auto-imports** (`unplugin-auto-import` — Vue, vue-router, Pinia, stores, utils, UI components are auto-imported), and a layout system (`vite-plugin-vue-layouts`).

**Key directories:**
- `src/pages/` — Page components: `index.vue` (chat), `workspace.vue`, `meeting/`, `mcp.vue`, `plan.vue`, `tasks.vue`
- `src/stores/` — Pinia stores: `chat.ts`, `meeting.ts`, `workspaceChat.ts`, `mcp.ts`, `skills.ts`, `settings.ts`, `auth.ts`, `ui.ts`
- `src/utils/` — Core logic: `LocalAiProvider.ts` (AI provider), `BuiltinTools.ts` (agent tools), `McpUtils.ts`, `SkillCompatibility.ts`, `ChatUtils.ts`, `MarkdownIt.ts`, `MonacoSetup.ts`
- `src/components/` — Vue components organized by feature:
  - `ai-elements/` — AI chat UI components (message, loader, file-tree, task, terminal, etc.)
  - `ui/` — shadcn-vue components (button, dialog, dropdown-menu, input, select, tabs, etc.)
  - `chat/` — Chat components
  - `meeting/` — Meeting mode components (Room, Config, RoleList, SpeakerQueue)
  - `workspace/` — Workspace mode components (AiSession, ConsolePanel, GitStatusPanel, MonacoEditorPane, TaskPlanView)
  - `mcp/` — MCP management dialogs
  - `skills/` — Skills manager

### Backend (`src-tauri/`) — Rust + Tauri 2

Lightweight Tauri backend handling CLI args, single-instance coordination, debug/devtools, and plugin registration (fs, shell, dialog, store, updater, positioner, opener, cors-fetch). Custom commands: `greet`, `is_debug_enabled`, `open_devtools`, `get_cli_args`.

### Key Libraries
- **Tauri 2** — Desktop framework (fs, shell, dialog, store, updater plugins)
- **AI SDK** (`ai` + `@ai-sdk/vue` + `@ai-sdk/openai-compatible`) — Streaming chat, MCP tool integration
- **AI Elements Vue** — AI chat UI component library
- **MCP SDK** (`@modelcontextprotocol/sdk`) — MCP server management via stdio transport
- **Tailwind CSS 4** + **shadcn-vue** — UI components (New York style)
- **Monaco Editor** — Code editor in workspace mode
- **Pinia 3** — State management
- **Vite 6** — Build tool
- **Element Plus** + **Reka UI** + **Lucide Icons** — Additional UI primitives

## Code Style (from `CodeStyle.md`)

- **Naming**: PascalCase classes, camelCase variables/functions, kebab-case files, `I` prefix for interfaces, `E` prefix for enums
- **Indentation**: 4 spaces, no tabs
- **Braces**: same-line style (e.g. `if {`)
- **Spacing**: space after keywords (`if `, `else `), space before `()` in function declarations
- **TypeScript**: avoid `any`, use const over readonly, prefer default params over overloads
- **Imports**: one import per statement, no namespaces, use ES6 modules
- **Comments**: Chinese preferred
- **UI**: minimal, modern, compact design; use shadcn-vue components first, write custom components only when necessary
- Prefer TypeScript over Rust; use Rust only when TypeScript cannot achieve the goal