import type { McpServer } from "@/utils/interface";

export type McpServerImportConfig =
    | {
          type?: "stdio";
          name: string;
          command: string;
          args?: string[];
          env?: Record<string, string>;
          cwd?: string;
      }
    | {
          type: "http";
          name: string;
          url: string;
          headers?: Record<string, string>;
      };

export function stripJsonComments(jsonStr: string) {
    return String(jsonStr || "").replace(
        /\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g,
        (m, g) => (g ? "" : m)
    );
}

export function splitCommandLine(commandLine: string) {
    const text = String(commandLine || "").trim();
    if (!text) return { command: "", args: [] as string[] };

    const parts: string[] = [];
    let current = "";
    let inSingle = false;
    let inDouble = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (ch === "\\" && i + 1 < text.length && inDouble) {
            const next = text[i + 1];
            if (next === '"' || next === "\\") {
                current += next;
                i++;
                continue;
            }
        }

        if (ch === "'" && !inDouble) {
            inSingle = !inSingle;
            continue;
        }
        if (ch === '"' && !inSingle) {
            inDouble = !inDouble;
            continue;
        }

        if (!inSingle && !inDouble && /\s/.test(ch)) {
            if (current) {
                parts.push(current);
                current = "";
            }
            continue;
        }

        current += ch;
    }

    if (current) parts.push(current);
    const [command, ...args] = parts;
    return { command: command ?? "", args };
}

function normalizeEnv(value: unknown): Record<string, string> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(value as any)) {
        if (v == null) continue;
        out[String(k)] = typeof v === "string" ? v : String(v);
    }
    return out;
}

function normalizeHeaders(value: unknown): Record<string, string> {
    return normalizeEnv(value);
}

export function parseMcpServerConfigs(
    input: string | unknown
): McpServerImportConfig[] {
    const data =
        typeof input === "string"
            ? JSON.parse(stripJsonComments(input))
            : input;

    const configs: any[] = [];

    // VSCode/Claude wrapper: { mcpServers: { name: { ... } } }
    if (data && typeof data === "object" && (data as any).mcpServers) {
        const servers = (data as any).mcpServers;
        if (servers && typeof servers === "object") {
            for (const name of Object.keys(servers)) {
                const cfg = servers[name] || {};
                configs.push({ name, ...cfg });
            }
            if (configs.length) return normalizeConfigs(configs);
        }
    }

    // Standard wrapper: { servers: { name: { ... } } }
    if (data && typeof data === "object" && (data as any).servers) {
        const servers = (data as any).servers;
        if (servers && typeof servers === "object") {
            for (const name of Object.keys(servers)) {
                const cfg = servers[name] || {};
                configs.push({ name, ...cfg });
            }
            if (configs.length) return normalizeConfigs(configs);
        }
    }

    // Direct: { name, type, command, args, env } or http fields
    if (data && typeof data === "object") {
        return normalizeConfigs([data as any]);
    }

    return [];
}

function normalizeConfigs(raw: any[]): McpServerImportConfig[] {
    const out: McpServerImportConfig[] = [];

    for (const data of raw) {
        const type: "stdio" | "http" =
            data?.type === "http" || data?.url ? "http" : "stdio";
        const name = String(data?.name || "").trim();
        if (!name) continue;

        if (type === "http") {
            const url = String(data?.url || "").trim();
            if (!url) continue;
            out.push({
                type: "http",
                name,
                url,
                headers: normalizeHeaders(data?.headers),
            });
            continue;
        }

        let command = data?.command;
        let args = Array.isArray(data?.args) ? data.args : [];

        if (typeof command === "string" && args.length === 0) {
            const parsed = splitCommandLine(command);
            if (parsed.command) {
                command = parsed.command;
                args = parsed.args;
            }
        }

        command = String(command || "").trim();
        if (!command) continue;

        out.push({
            type: "stdio",
            name,
            command,
            args: args.map((x: any) => String(x)),
            env: normalizeEnv(data?.env),
            cwd: typeof data?.cwd === "string" ? data.cwd : undefined,
        });
    }

    return out;
}

export function decodeBase64Url(input: string) {
    const raw = String(input || "").trim();
    if (!raw) return "";

    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const padLen = (4 - (b64.length % 4)) % 4;
    const padded = b64 + "=".repeat(padLen);

    // Browser env
    if (typeof atob === "function") {
        const bin = atob(padded);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    }

    // Should never happen in the webview, but keep a safe fallback.
    return padded;
}

export function isMcpServerEqual(a: McpServer, b: McpServerImportConfig) {
    if (a.type !== b.type) return false;
    if (a.name !== b.name) return false;

    if (a.type === "http" && b.type === "http") {
        return a.url === b.url;
    }

    if (a.type === "stdio" && b.type !== "http") {
        const argsA = a.args || [];
        const argsB = b.args || [];
        return (
            a.command === b.command &&
            argsA.join("\u0000") === argsB.join("\u0000")
        );
    }

    return false;
}
