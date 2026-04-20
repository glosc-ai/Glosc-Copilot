import { useMcpStore } from "@/stores/mcp";
import {
    isMcpServerEqual,
    type McpServerImportConfig,
} from "@/utils/McpServerImport";

export type McpImportSummary = {
    added: number;
    updated: number;
    unchanged: number;
};

function configKey(config: McpServerImportConfig) {
    if (config.type === "http") {
        return ["http", config.name, config.url].join("\u0000");
    }

    return [
        "stdio",
        config.name,
        config.command,
        (config.args || []).join("\u0000"),
    ].join("\u0000");
}

export function dedupeMcpConfigs(configs: McpServerImportConfig[]) {
    const seen = new Set<string>();
    const next: McpServerImportConfig[] = [];

    for (const config of configs) {
        const key = configKey(config);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(config);
    }

    return next;
}

export async function upsertMcpServersInStore(params: {
    mcpStore: ReturnType<typeof useMcpStore>;
    configs: McpServerImportConfig[];
    enableImported?: boolean;
}) {
    const summary: McpImportSummary = {
        added: 0,
        updated: 0,
        unchanged: 0,
    };

    const uniqueConfigs = dedupeMcpConfigs(params.configs);

    for (const config of uniqueConfigs) {
        const existing = params.mcpStore.servers.find(
            (server) => server.type === config.type && server.name === config.name,
        );

        if (existing) {
            const nextEnabled =
                params.enableImported === undefined
                    ? existing.enabled
                    : params.enableImported;

            if (!isMcpServerEqual(existing, config) || existing.enabled !== nextEnabled) {
                if (config.type === "http") {
                    await params.mcpStore.updateServer(existing.id, {
                        type: "http",
                        name: config.name,
                        url: config.url,
                        headers: config.headers,
                        enabled: nextEnabled,
                    });
                } else {
                    await params.mcpStore.updateServer(existing.id, {
                        type: "stdio",
                        name: config.name,
                        command: config.command,
                        args: config.args || [],
                        env: config.env,
                        cwd: config.cwd,
                        enabled: nextEnabled,
                    });
                }
                summary.updated += 1;
            } else {
                summary.unchanged += 1;
            }
            continue;
        }

        const enabled = params.enableImported ?? true;

        if (config.type === "http") {
            await params.mcpStore.addServer({
                type: "http",
                name: config.name,
                url: config.url,
                headers: config.headers,
                enabled,
            });
        } else {
            await params.mcpStore.addServer({
                type: "stdio",
                name: config.name,
                command: config.command,
                args: config.args || [],
                env: config.env,
                cwd: config.cwd,
                enabled,
            });
        }

        summary.added += 1;
    }

    return summary;
}
