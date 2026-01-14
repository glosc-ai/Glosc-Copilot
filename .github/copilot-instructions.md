# Copilot instructions (Glosc Copilot)

## Big picture

- Desktop app built with **Tauri v2 (Rust)** + **Vue 3 + Vite + TypeScript**.
- UI routes are **file-based** via `unplugin-vue-router`: add pages in `src/pages/*.vue` and layouts in `src/layouts/*.vue` (wired by `vite-plugin-vue-layouts`). Router uses `createMemoryHistory()` in `src/router/index.ts` (fits Tauri; avoid switching history mode casually).
- Core domains:
    - Chat UI + persistence: `src/components/ChatArea.vue`, `src/stores/chat.ts`
    - MCP integration (tools/resources/prompts): `src/stores/mcp.ts`, `src/utils/McpUtils.ts`, `src/utils/TauriStdioTransport.ts`
    - Model/image backend calls (Vercel AI Gateway style): `src/utils/ChatUtils.ts`, `src/utils/ModelApi.ts`, `src/utils/ImageApi.ts`

## Dev workflows (commands that matter)

- Package manager is **Yarn**: use `yarn install` / `yarn add`, and keep `yarn.lock` as the single lockfile (don’t introduce npm/pnpm lockfiles).
- Web (browser): `yarn dev` (Vite)
- Typecheck + build: `yarn build` (runs `vue-tsc --noEmit` then `vite build`)
- Desktop (Tauri): `yarn tauri:dev` / `yarn tauri:build`
    - These run `yarn prepare:uv` first to download the `uv` sidecar into `src-tauri/binaries/` (see `scripts/prepare-uv.mjs`).
    - Tauri’s `beforeDevCommand`/`beforeBuildCommand` in `src-tauri/tauri.conf.json` also assume **yarn**.

## Project conventions (important for agent edits)

- **Auto-imports are intentional**: `vite.config.ts` configures `unplugin-auto-import` for `vue`, `vue-router`, `pinia` plus project dirs:
    - `src/stores`, `src/utils`, `src/components/ai-elements/**`, `src/components/ui/**`
    - Many files rely on this (e.g. `src/pages/mcp.vue` uses `useRouter()`/`useMcpStore()` without imports).
- Treat generated typing files as read-only: `auto-imports.d.ts`, `components.d.ts`, `typed-router.d.ts`.
- UI stack is mixed but consistent:
    - Tailwind v4 + shadcn-vue primitives in `src/components/ui/**`
    - Element Plus is enabled and auto-resolved (`ElementPlusResolver`) for components/messages.
- Codebase is primarily in **Chinese**: comments, UI text, and variable names use Chinese (e.g., `会话相关` for conversation-related).
- Tokenization uses `@lenml/tokenizers` with Claude config for message counting (`src/components/ChatArea.vue`).

## Persistence & settings

- Use `storeUtils` (`src/utils/StoreUtils.ts`) backed by `@tauri-apps/plugin-store`.
    - Default is **encrypted**; unencrypted values are stored as `PLAIN:` prefix.
    - Follow existing choices: MCP server configs are saved unencrypted (`src/stores/mcp.ts` uses `storeUtils.set(..., false)`).

## MCP (tools) execution model

- MCP servers are configured in the MCP page and persisted in `mcp_servers` via `src/stores/mcp.ts`.
- Server lifecycle + capability probing:
    - Use `McpUtils.startServer/stopServer/getActiveCapabilities/getTools` in `src/utils/McpUtils.ts`.
    - Store caches tool lists for 5s (`CACHE_DURATION_MS`) to avoid reloading on every message.
- Stdio MCP uses Tauri shell to spawn processes:
    - `TauriStdioTransport` in `src/utils/TauriStdioTransport.ts` supports `npx`, `node`, `python`, `uv/uvx`.
    - Sidecars are expected under `src-tauri/binaries/` and bundled via `src-tauri/tauri.conf.json` (`externalBin`) plus packaged JS resources under `src-tauri/resources/npm`.

## Backend/API expectations

- Backend is a separate project/repo; this codebase only contains the Tauri/Vue client.
- Client calls default to `VITE_API_HOST || http://localhost:3000`.
    - Models: `GET /api/models` (`src/utils/ModelApi.ts`)
    - Chat streaming: `ChatUtils.getChat()` hits `${host}/api/chat` or `${host}/api/agent` (`src/utils/ChatUtils.ts`, `src/pages/workspace.vue`).
    - Images: `POST /api/image` (`src/utils/ImageApi.ts`).

## Debugging hooks

- Production devtools hotkey: `F12` triggers the `open_devtools` Tauri command only when debug is enabled (`src/main.ts`).
- Debug enable flag is controlled by presence of a `DEV` file next to the executable or in CWD (`src-tauri/src/lib.rs`).
