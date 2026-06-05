import YAML from "yaml";
import { unzipSync } from "fflate";

import { appDataDir, join, resolveResource } from "@tauri-apps/api/path";
import {
    exists,
    mkdir,
    readDir,
    readFile,
    writeFile,
} from "@tauri-apps/plugin-fs";

import type { McpServer } from "@/utils/interface";
import type { useMcpStore } from "@/stores/mcp";

type McpRuntime = "python" | "node";

type ToolConfig = {
    name?: string;
    description?: string;
    mcp?: {
        runtime?: McpRuntime;
        entry?: string;
        cwd?: string;
        env?: Record<string, string>;
        args?: string[];
    };
};

type BundledMcpTool = {
    slug: string;
    archiveResource: string;
    manifestResource: string;
};

type BundledMcpManifest = {
    slug: string;
    archive: string;
    directory?: string;
    sourceUrl: string;
    commit: string;
    contentHash?: string;
    configPath: string;
    generatedAt: string;
};

type ResourceDirEntry = {
    name?: string;
    isFile?: boolean;
    isDir?: boolean;
    isDirectory?: boolean;
    children?: ResourceDirEntry[];
};

type McpStore = ReturnType<typeof useMcpStore>;

const DEFAULT_BUNDLED_MCP_TOOLS: BundledMcpTool[] = [
    {
        slug: "glosc-mcp",
        archiveResource: "resources/mcp-tools/glosc-mcp.zip",
        manifestResource: "resources/mcp-tools/glosc-mcp.json",
    },
];

async function ensureDir(path: string) {
    if (await exists(path)) return;
    await mkdir(path, { recursive: true });
}

function normalizeRelPath(path: string) {
    const normalized = String(path || "")
        .replace(/\\/g, "/")
        .replace(/^\/+/, "")
        .replace(/\.\.(\/|$)/g, "")
        .trim();

    return normalized === "." ? "" : normalized;
}

function hasDotPathSegment(path: string) {
    return path.split("/").some((part) => part.startsWith("."));
}

async function unzipToDir(params: { zipPath: string; outDir: string }) {
    const zipBytes = await readFile(params.zipPath);
    const files = unzipSync(zipBytes);

    await ensureDir(params.outDir);

    for (const [rawPath, data] of Object.entries(files)) {
        const rel = normalizeRelPath(rawPath);
        if (!rel) continue;
        if (hasDotPathSegment(rel)) continue;
        if (rel.endsWith("/")) {
            await ensureDir(await join(params.outDir, rel));
            continue;
        }

        const target = await join(params.outDir, rel);
        const parent = target.replace(/[\\/][^\\/]+$/, "");
        if (parent && parent !== target) {
            await ensureDir(parent);
        }

        await writeFile(target, data);
    }
}

async function copyResourceDirToDir(params: {
    resourceDir: string;
    outDir: string;
}) {
    await ensureDir(params.outDir);
    const entries = (await readDir(params.resourceDir)) as ResourceDirEntry[];

    for (const entry of entries) {
        const name = String(entry.name || "").trim();
        if (!name) continue;
        if (name.startsWith(".")) continue;

        const source = await join(params.resourceDir, name);
        const target = await join(params.outDir, name);
        const isDirectory = Boolean(
            entry.isDir ||
            entry.isDirectory ||
            (Array.isArray(entry.children) && !entry.isFile),
        );

        if (isDirectory) {
            await copyResourceDirToDir({ resourceDir: source, outDir: target });
            continue;
        }

        const bytes = await readFile(source);
        await writeFile(target, bytes);
    }
}

async function readTextFile(path: string) {
    const bytes = await readFile(path);
    return new TextDecoder("utf-8").decode(bytes);
}

function validateToolConfig(toolConfig: ToolConfig) {
    const mcp = toolConfig.mcp;
    if (!mcp) return;

    if (mcp.runtime && mcp.runtime !== "python" && mcp.runtime !== "node") {
        throw new Error(
            "默认 MCP 工具配置错误：mcp.runtime 仅支持 python 或 node",
        );
    }

    if (mcp.args && !Array.isArray(mcp.args)) {
        throw new Error("默认 MCP 工具配置错误：mcp.args 必须是字符串数组");
    }

    if (mcp.env && (typeof mcp.env !== "object" || Array.isArray(mcp.env))) {
        throw new Error("默认 MCP 工具配置错误：mcp.env 必须是对象");
    }
}

function pickServerName(toolConfig: ToolConfig, manifest: BundledMcpManifest) {
    return String(toolConfig.name || "").trim() || manifest.slug;
}

function pickServerDescription(toolConfig: ToolConfig) {
    return String(toolConfig.description || "").trim();
}

async function readManifest(tool: BundledMcpTool) {
    const manifestPath = await resolveResource(tool.manifestResource);
    const text = await readTextFile(manifestPath);
    return JSON.parse(text) as BundledMcpManifest;
}

async function readToolConfig(params: {
    installDir: string;
    manifest: BundledMcpManifest;
}) {
    const configPath = await join(
        params.installDir,
        params.manifest.configPath,
    );
    const text = await readTextFile(configPath);
    const toolConfig = (YAML.parse(text) || {}) as ToolConfig;
    validateToolConfig(toolConfig);
    return toolConfig;
}

async function installBundledToolFiles(params: {
    tool: BundledMcpTool;
    manifest: BundledMcpManifest;
}) {
    const root = await appDataDir();
    const toolsDir = await join(root, "glosc-tools");
    const installDir = await join(toolsDir, params.tool.slug, "bundled");
    const markerPath = await join(installDir, "glosc-bundled-commit");
    const installFingerprint =
        params.manifest.contentHash || params.manifest.commit;

    await ensureDir(await join(toolsDir, params.tool.slug));

    const existingCommit = (await exists(markerPath))
        ? (await readTextFile(markerPath)).trim()
        : "";

    if (existingCommit !== installFingerprint) {
        let copiedFromDirectory = false;
        const directoryResource = params.manifest.directory || params.tool.slug;

        try {
            const resourceDir = await resolveResource(
                `resources/mcp-tools/${directoryResource}`,
            );
            if (await exists(resourceDir)) {
                await copyResourceDirToDir({
                    resourceDir,
                    outDir: installDir,
                });
                copiedFromDirectory = true;
            }
        } catch (e) {
            console.warn("copy bundled MCP directory resource failed", e);
        }

        if (!copiedFromDirectory) {
            const archivePath = await resolveResource(
                params.tool.archiveResource,
            );
            await unzipToDir({ zipPath: archivePath, outDir: installDir });
        }

        await writeFile(
            markerPath,
            new TextEncoder().encode(`${installFingerprint}\n`),
        );
    }

    return installDir;
}

async function buildServerConfig(params: {
    tool: BundledMcpTool;
    manifest: BundledMcpManifest;
    installDir: string;
    toolConfig: ToolConfig;
    enabled: boolean;
}): Promise<Omit<Extract<McpServer, { type: "stdio" }>, "id">> {
    const mcp = params.toolConfig.mcp || {};
    const runtime = mcp.runtime || "python";
    const entryRel = normalizeRelPath(mcp.entry || "main.py");
    const cwdRel = normalizeRelPath(mcp.cwd || "");
    const entryAbs = cwdRel
        ? await join(params.installDir, cwdRel, entryRel)
        : await join(params.installDir, entryRel);
    const cwd = cwdRel
        ? await join(params.installDir, cwdRel)
        : params.installDir;

    const command = runtime === "node" ? "node" : "python";
    const serverDescription = pickServerDescription(params.toolConfig);

    return {
        type: "stdio",
        name: pickServerName(params.toolConfig, params.manifest),
        command,
        args: [entryAbs, ...(mcp.args || [])],
        cwd,
        env: {
            ...(mcp.env || {}),
            GLOSC_BUNDLED_PLUGIN: params.tool.slug,
            GLOSC_BUNDLED_COMMIT: params.manifest.commit,
            GLOSC_BUNDLED_SOURCE: params.manifest.sourceUrl,
            GLOSC_TOOL_DIR: params.installDir,
            GLOSC_STORE_DESCRIPTION: serverDescription,
        },
        enabled: params.enabled,
    };
}

async function upsertBundledToolServer(params: {
    mcpStore: McpStore;
    tool: BundledMcpTool;
    server: Omit<Extract<McpServer, { type: "stdio" }>, "id">;
}) {
    const existing = params.mcpStore.servers.find(
        (server) =>
            server.type === "stdio" &&
            server.env?.GLOSC_BUNDLED_PLUGIN === params.tool.slug,
    );

    if (!existing) {
        await params.mcpStore.addServer(params.server);
        return;
    }

    await params.mcpStore.updateServer(existing.id, {
        ...params.server,
        enabled: existing.enabled,
    });
}

async function ensureBundledMcpToolInstalled(params: {
    mcpStore: McpStore;
    tool: BundledMcpTool;
}) {
    const manifest = await readManifest(params.tool);
    const installDir = await installBundledToolFiles({
        tool: params.tool,
        manifest,
    });
    const toolConfig = await readToolConfig({ installDir, manifest });

    const server = await buildServerConfig({
        tool: params.tool,
        manifest,
        installDir,
        toolConfig,
        enabled: false,
    });

    await upsertBundledToolServer({
        mcpStore: params.mcpStore,
        tool: params.tool,
        server,
    });
}

export async function ensureBundledMcpToolsInstalled(params: {
    mcpStore: McpStore;
}) {
    for (const tool of DEFAULT_BUNDLED_MCP_TOOLS) {
        await ensureBundledMcpToolInstalled({
            mcpStore: params.mcpStore,
            tool,
        });
    }
}
