import type { useMcpStore } from "@/stores/mcp";
import { McpUtils } from "@/utils/McpUtils";
import type { McpServer } from "@/utils/interface";
import type {
    IImportedSkill,
    ISkillDirectoryDiscoveryResult,
    IWorkspaceInstalledSkillsResult,
} from "@/utils/SkillCompatibility";

type McpStore = ReturnType<typeof useMcpStore>;

interface IGloscReadSkillsDirectoryResult {
    skills?: IImportedSkill[];
    warnings?: string[];
    scannedCandidates?: string[];
}

interface IGloscReadWorkspaceSkillsResult extends IGloscReadSkillsDirectoryResult {
    skillsDir?: string | null;
    lockPath?: string | null;
    lockEntries?: IWorkspaceInstalledSkillsResult["lockEntries"];
}

function getBundledGloscMcpServer(mcpStore: McpStore) {
    return mcpStore.servers.find(
        (server) =>
            server.type === "stdio" &&
            server.env?.GLOSC_BUNDLED_PLUGIN === "glosc-mcp",
    ) as McpServer | undefined;
}

function extractToolText(result: unknown) {
    if (typeof result === "string") return result;

    if (!result || typeof result !== "object") {
        return String(result || "");
    }

    const record = result as Record<string, unknown>;
    if (record.toolResult != null) {
        return typeof record.toolResult === "string"
            ? record.toolResult
            : JSON.stringify(record.toolResult);
    }

    const content = Array.isArray(record.content) ? record.content : [];
    return content
        .map((part) => {
            if (!part || typeof part !== "object") return "";
            const partRecord = part as Record<string, unknown>;
            return partRecord.type === "text"
                ? String(partRecord.text || "")
                : "";
        })
        .filter(Boolean)
        .join("\n");
}

function parseJsonResult<T>(result: unknown) {
    const text = extractToolText(result).trim();
    if (!text) {
        throw new Error("Glosc-Mcp readSkills 返回为空");
    }

    return JSON.parse(text) as T;
}

async function callReadSkills(
    mcpStore: McpStore,
    input: { path: string; mode: "directory" | "workspace" },
) {
    await mcpStore.init();
    const server = getBundledGloscMcpServer(mcpStore);
    if (!server) {
        throw new Error(
            "默认 Glosc-Mcp 工具不可用，请先在 MCP 设置中完成默认工具初始化。",
        );
    }

    return await McpUtils.callTool(server, "readSkills", input);
}

export async function readSkillsDirectoryWithGloscMcp(
    mcpStore: McpStore,
    directoryPath: string,
) {
    const result = parseJsonResult<IGloscReadSkillsDirectoryResult>(
        await callReadSkills(mcpStore, {
            path: directoryPath,
            mode: "directory",
        }),
    );

    return {
        skills: Array.isArray(result.skills) ? result.skills : [],
        warnings: Array.isArray(result.warnings) ? result.warnings : [],
        scannedCandidates: Array.isArray(result.scannedCandidates)
            ? result.scannedCandidates
            : [],
    } satisfies ISkillDirectoryDiscoveryResult;
}

export async function readWorkspaceInstalledSkillsWithGloscMcp(
    mcpStore: McpStore,
    workspaceRoot: string,
) {
    const result = parseJsonResult<IGloscReadWorkspaceSkillsResult>(
        await callReadSkills(mcpStore, {
            path: workspaceRoot,
            mode: "workspace",
        }),
    );

    return {
        skills: Array.isArray(result.skills) ? result.skills : [],
        warnings: Array.isArray(result.warnings) ? result.warnings : [],
        skillsDir: result.skillsDir || null,
        lockPath: result.lockPath || null,
        lockEntries: Array.isArray(result.lockEntries)
            ? result.lockEntries
            : [],
    } satisfies IWorkspaceInstalledSkillsResult;
}
