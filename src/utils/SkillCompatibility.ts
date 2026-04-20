import YAML from "yaml";

import { join } from "@tauri-apps/api/path";
import { readDir, readFile, stat } from "@tauri-apps/plugin-fs";

import {
    parseMcpServerConfigs,
    stripJsonComments,
    type McpServerImportConfig,
} from "@/utils/McpServerImport";
import { dedupeMcpConfigs } from "@/utils/McpImportUtils";

export type SkillSourceKind = "directory" | "file" | "url";

export interface ISkillSourceInfo {
    kind: SkillSourceKind;
    original: string;
    canonical: string;
    label: string;
}

export interface ISkillPackageMeta {
    kind:
        | "agent-skill"
        | "clawhub-skill"
        | "openclaw-plugin"
        | "clawhub-plugin"
        | "generic-bundle";
    packageName?: string;
    displayName?: string;
    summary?: string;
    runtimeId?: string;
    sourceRepo?: string;
    sourceTag?: string;
    capabilityTags: string[];
    toolNames: string[];
    bundledSkillNames: string[];
}

export interface ISkillFileSummary {
    path: string;
    size: number;
    kind: "script" | "reference" | "asset" | "other";
}

export interface IImportedSkill {
    id: string;
    dedupeKey: string;
    slug: string;
    name: string;
    description: string;
    rawMarkdown: string;
    instructions: string;
    compatibility: string;
    license: string;
    allowedTools: string[];
    metadata: Record<string, string>;
    enabled: boolean;
    importedAt: number;
    updatedAt: number;
    source: ISkillSourceInfo;
    packageMeta?: ISkillPackageMeta;
    ecosystemTags: string[];
    warnings: string[];
    files: ISkillFileSummary[];
    bundledMcpCount: number;
}

export interface ICompatibilityImportResult {
    skills: IImportedSkill[];
    mcpConfigs: McpServerImportConfig[];
    warnings: string[];
    source: ISkillSourceInfo;
    detectedKinds: string[];
}

interface IBundleFile {
    path: string;
    size: number;
    bytes?: Uint8Array;
}

const decoder = new TextDecoder("utf-8");
const MAX_TEXT_FILE_SIZE = 1_000_000;
const MAX_STORED_FILE_SUMMARIES = 200;

function normalizeSlashes(input: string) {
    return String(input || "").replace(/\\/g, "/");
}

function normalizeRelPath(input: string) {
    return normalizeSlashes(input)
        .replace(/^\/+/, "")
        .replace(/\/+/g, "/")
        .replace(/(^|\/)\.\.(?=\/|$)/g, "")
        .replace(/^\.\//, "")
        .trim();
}

function dirnameLike(input: string) {
    const normalized = normalizeRelPath(input);
    const index = normalized.lastIndexOf("/");
    return index === -1 ? "" : normalized.slice(0, index);
}

function basenameLike(input: string) {
    const normalized = normalizeRelPath(input);
    const index = normalized.lastIndexOf("/");
    return index === -1 ? normalized : normalized.slice(index + 1);
}

function extnameLike(input: string) {
    const base = basenameLike(input);
    const index = base.lastIndexOf(".");
    return index === -1 ? "" : base.slice(index).toLowerCase();
}

function toRelPath(root: string, fullPath: string) {
    const normalizedRoot = normalizeSlashes(root).replace(/\/+$/, "");
    const normalizedPath = normalizeSlashes(fullPath);
    if (!normalizedRoot) return normalizeRelPath(normalizedPath);
    if (normalizedPath === normalizedRoot) return "";
    if (normalizedPath.startsWith(normalizedRoot + "/")) {
        return normalizeRelPath(normalizedPath.slice(normalizedRoot.length + 1));
    }
    return normalizeRelPath(normalizedPath);
}

function shouldReadFileContent(path: string, size: number) {
    if (size > MAX_TEXT_FILE_SIZE) return false;
    return [".md", ".markdown", ".json", ".jsonc", ".yaml", ".yml", ".txt"].includes(
        extnameLike(path),
    );
}

function decodeBytes(bytes?: Uint8Array) {
    if (!bytes) return "";
    return decoder.decode(bytes);
}

function stripSingleRootDir(files: IBundleFile[]) {
    const roots = new Set<string>();

    for (const file of files) {
        const normalized = normalizeRelPath(file.path);
        if (!normalized) continue;
        const first = normalized.split("/")[0];
        if (first) roots.add(first);
    }

    if (roots.size !== 1) return files;

    const [root] = Array.from(roots);
    const prefix = `${root}/`;
    const next = files
        .map((file) => {
            const normalized = normalizeRelPath(file.path);
            if (normalized === root) return null;
            return normalized.startsWith(prefix)
                ? {
                      ...file,
                      path: normalized.slice(prefix.length),
                  }
                : {
                      ...file,
                      path: normalized,
                  };
        })
        .filter(Boolean) as IBundleFile[];

    return next.length > 0 ? next : files;
}

function splitAllowedTools(input: unknown) {
    const raw = String(input || "").trim();
    if (!raw) return [] as string[];
    return raw
        .split(/\s+/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function toStringRecord(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {} as Record<string, string>;
    }

    const out: Record<string, string> = {};
    for (const [key, rawValue] of Object.entries(value)) {
        if (rawValue == null) continue;
        out[String(key)] = typeof rawValue === "string" ? rawValue : String(rawValue);
    }
    return out;
}

function parseSkillMarkdown(markdown: string) {
    const trimmed = String(markdown || "");
    const matched = trimmed.match(
        /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n)?([\s\S]*)$/,
    );

    if (!matched) {
        return {
            frontmatter: {} as Record<string, unknown>,
            body: trimmed.trim(),
        };
    }

    const yamlRaw = matched[1] || "";
    const body = matched[2] || "";

    return {
        frontmatter: ((YAML.parse(yamlRaw) || {}) as Record<string, unknown>) || {},
        body: body.trim(),
    };
}

function slugifySkillName(input: string) {
    const normalized = String(input || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/-{2,}/g, "-")
        .replace(/^-+|-+$/g, "");

    return normalized || "imported-skill";
}

function uniqueStrings(values: string[]) {
    return Array.from(
        new Set(
            values
                .map((value) => String(value || "").trim())
                .filter(Boolean),
        ),
    );
}

function detectClawHubRepo(html: string) {
    const sourceRepo = html.match(/sourceRepo:"([^"]+)"/)?.[1] || "";
    const sourceTag = html.match(/sourceTag:"([^"]+)"/)?.[1] || "";

    if (!sourceRepo || !sourceTag) return null;

    return { sourceRepo, sourceTag };
}

function toGitHubArchiveUrl(repo: string, tag: string) {
    return `https://github.com/${repo}/archive/${encodeURIComponent(tag)}.zip`;
}

function contentTypeIsText(contentType: string) {
    return (
        /^text\//i.test(contentType) ||
        /(json|yaml|yml|markdown)/i.test(contentType)
    );
}

function buildSingleFileBundle(params: {
    path: string;
    content: Uint8Array;
}): IBundleFile[] {
    return [
        {
            path: normalizeRelPath(params.path),
            size: params.content.byteLength,
            bytes: params.content,
        },
    ];
}

async function readDirectoryBundle(rootPath: string) {
    const files: IBundleFile[] = [];

    async function walk(dirPath: string): Promise<void> {
        const entries = await readDir(dirPath);

        for (const entry of entries) {
            const entryPath = await join(dirPath, entry.name);
            const isDir = entry.isDirectory;
            if (!entryPath) continue;

            if (isDir) {
                await walk(entryPath);
                continue;
            }

            const relPath = toRelPath(rootPath, entryPath);
            if (!relPath) continue;

            const info = await stat(entryPath);
            const size = Number(info.size || 0);
            const file: IBundleFile = {
                path: relPath,
                size,
            };

            if (shouldReadFileContent(relPath, size)) {
                file.bytes = await readFile(entryPath);
            }

            files.push(file);
        }
    }

    await walk(rootPath);
    return files;
}

async function readLocalFileBundle(filePath: string) {
    const bytes = await readFile(filePath);
    const base = basenameLike(filePath) || "imported-file";
    const lowerBase = base.toLowerCase();

    if (lowerBase.endsWith(".zip")) {
        const { unzipSync } = await import("fflate");
        const unpacked = unzipSync(bytes);
        const files = Object.entries(unpacked).map(([path, fileBytes]) => ({
            path: normalizeRelPath(path),
            size: fileBytes.byteLength,
            bytes: fileBytes,
        }));
        return stripSingleRootDir(files);
    }

    return buildSingleFileBundle({ path: base, content: bytes });
}

async function readRemoteBundle(url: string) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`下载失败：HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    const canonicalUrl = response.url || url;

    if (/html/i.test(contentType) && /clawhub\.ai/i.test(canonicalUrl)) {
        const html = await response.text();
        const repoInfo = detectClawHubRepo(html);
        if (!repoInfo) {
            throw new Error("未能从 ClawHub 页面解析到源仓库信息");
        }

        const archiveUrl = toGitHubArchiveUrl(
            repoInfo.sourceRepo,
            repoInfo.sourceTag,
        );
        return {
            files: await readRemoteBundleArchive(archiveUrl),
            canonicalUrl: archiveUrl,
            clawHubRepo: repoInfo,
        };
    }

    if (contentTypeIsText(contentType)) {
        const text = await response.text();
        const filename =
            basenameLike(new URL(canonicalUrl).pathname) || "remote-skill.txt";
        return {
            files: buildSingleFileBundle({
                path: filename,
                content: new TextEncoder().encode(text),
            }),
            canonicalUrl,
        };
    }

    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    if (
        bytes.length >= 4 &&
        bytes[0] === 0x50 &&
        bytes[1] === 0x4b &&
        bytes[2] === 0x03 &&
        bytes[3] === 0x04
    ) {
        const files = await readRemoteBundleArchive(canonicalUrl, bytes);
        return { files, canonicalUrl };
    }

    const filename =
        basenameLike(new URL(canonicalUrl).pathname) || "remote-bundle.bin";
    return {
        files: buildSingleFileBundle({ path: filename, content: bytes }),
        canonicalUrl,
    };
}

async function readRemoteBundleArchive(url: string, presetBytes?: Uint8Array) {
    let bytes = presetBytes;
    if (!bytes) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`下载归档失败：HTTP ${response.status}`);
        }
        bytes = new Uint8Array(await response.arrayBuffer());
    }
    const { unzipSync } = await import("fflate");
    const unpacked = unzipSync(bytes);
    const files = Object.entries(unpacked).map(([path, fileBytes]) => ({
        path: normalizeRelPath(path),
        size: fileBytes.byteLength,
        bytes: fileBytes,
    }));
    return stripSingleRootDir(files);
}

function parseMaybeJson(text: string) {
    try {
        return JSON.parse(stripJsonComments(text));
    } catch {
        return null;
    }
}

function parseMaybeYaml(text: string) {
    try {
        return YAML.parse(text);
    } catch {
        return null;
    }
}

function looksLikeMcpShape(data: unknown) {
    if (!data || typeof data !== "object") return false;
    const record = data as Record<string, unknown>;

    if (
        Object.prototype.hasOwnProperty.call(record, "mcpServers") ||
        Object.prototype.hasOwnProperty.call(record, "servers")
    ) {
        return true;
    }

    if (
        (Object.prototype.hasOwnProperty.call(record, "command") ||
            Object.prototype.hasOwnProperty.call(record, "url")) &&
        (Object.prototype.hasOwnProperty.call(record, "args") ||
            Object.prototype.hasOwnProperty.call(record, "env") ||
            Object.prototype.hasOwnProperty.call(record, "headers") ||
            Object.prototype.hasOwnProperty.call(record, "type"))
    ) {
        return true;
    }

    return false;
}

function parseMcpConfigsFromFile(file: IBundleFile) {
    if (!file.bytes) return [] as McpServerImportConfig[];

    const text = decodeBytes(file.bytes);
    const extension = extnameLike(file.path);

    if (extension === ".json" || extension === ".jsonc") {
        const parsed = parseMaybeJson(text);
        if (!looksLikeMcpShape(parsed)) return [];
        return parseMcpServerConfigs(parsed);
    }

    if (extension === ".yaml" || extension === ".yml") {
        const parsed = parseMaybeYaml(text);
        if (!looksLikeMcpShape(parsed)) return [];
        return parseMcpServerConfigs(parsed);
    }

    return [];
}

function parseOpenClawPluginMeta(file: IBundleFile): ISkillPackageMeta | null {
    if (!file.bytes || basenameLike(file.path) !== "openclaw.plugin.json") {
        return null;
    }

    const parsed = parseMaybeJson(decodeBytes(file.bytes));
    if (!parsed || typeof parsed !== "object") return null;

    const record = parsed as Record<string, unknown>;
    const capabilities =
        record.capabilities && typeof record.capabilities === "object"
            ? (record.capabilities as Record<string, unknown>)
            : {};

    const capabilityTags = Array.isArray(capabilities.capabilityTags)
        ? capabilities.capabilityTags.map((item) => String(item))
        : [];
    const toolNames = Array.isArray(capabilities.toolNames)
        ? capabilities.toolNames.map((item) => String(item))
        : [];
    const bundledSkills = Array.isArray(capabilities.bundledSkills)
        ? capabilities.bundledSkills.map((item) => String(item))
        : [];

    return {
        kind: "openclaw-plugin",
        packageName: String(record.name || "").trim() || undefined,
        displayName: String(record.displayName || "").trim() || undefined,
        summary: String(record.summary || record.description || "").trim() || undefined,
        runtimeId: String(record.runtimeId || "").trim() || undefined,
        capabilityTags: uniqueStrings(capabilityTags),
        toolNames: uniqueStrings(toolNames),
        bundledSkillNames: uniqueStrings(bundledSkills),
    };
}

function mergePackageMeta(
    base: ISkillPackageMeta | null,
    extra: ISkillPackageMeta | null,
) {
    if (!base) return extra;
    if (!extra) return base;

    return {
        ...base,
        ...extra,
        kind:
            base.kind === "clawhub-plugin" || base.kind === "clawhub-skill"
                ? base.kind
                : extra.kind,
        packageName: extra.packageName || base.packageName,
        displayName: extra.displayName || base.displayName,
        summary: extra.summary || base.summary,
        runtimeId: extra.runtimeId || base.runtimeId,
        sourceRepo: base.sourceRepo || extra.sourceRepo,
        sourceTag: base.sourceTag || extra.sourceTag,
        capabilityTags: uniqueStrings([
            ...base.capabilityTags,
            ...extra.capabilityTags,
        ]),
        toolNames: uniqueStrings([...base.toolNames, ...extra.toolNames]),
        bundledSkillNames: uniqueStrings([
            ...base.bundledSkillNames,
            ...extra.bundledSkillNames,
        ]),
    };
}

function classifySkillFile(relPath: string): ISkillFileSummary["kind"] {
    const normalized = normalizeRelPath(relPath);
    if (normalized.startsWith("scripts/")) return "script";
    if (normalized.startsWith("references/")) return "reference";
    if (normalized.startsWith("assets/")) return "asset";
    return "other";
}

function collectSkillFiles(rootDir: string, files: IBundleFile[]) {
    const prefix = rootDir ? `${normalizeRelPath(rootDir)}/` : "";
    const next = files
        .filter((file) => {
            const normalized = normalizeRelPath(file.path);
            if (!prefix) return normalized !== "SKILL.md";
            return normalized.startsWith(prefix) && normalized !== `${prefix}SKILL.md`;
        })
        .map((file) => {
            const normalized = normalizeRelPath(file.path);
            const relativePath = prefix ? normalized.slice(prefix.length) : normalized;
            return {
                path: relativePath,
                size: file.size,
                kind: classifySkillFile(relativePath),
            } satisfies ISkillFileSummary;
        })
        .slice(0, MAX_STORED_FILE_SUMMARIES);

    return next;
}

function buildDetectedKinds(params: {
    source: ISkillSourceInfo;
    packageMeta: ISkillPackageMeta | null;
    skillCount: number;
    mcpCount: number;
}) {
    const kinds = new Set<string>();

    kinds.add(params.source.kind);
    if (params.skillCount > 0) kinds.add("skills");
    if (params.mcpCount > 0) kinds.add("mcp");
    if (params.packageMeta?.kind) kinds.add(params.packageMeta.kind);

    return Array.from(kinds);
}

export function buildCompatibleSkillsPrompt(
    skills: IImportedSkill[],
    options?: {
        title?: string;
        maxSkills?: number;
        maxChars?: number;
    },
) {
    const enabledSkills = skills.filter((skill) => skill.enabled);
    if (enabledSkills.length === 0) return "";

    const title = options?.title || "【兼容 Skills】";
    const maxSkills = Math.max(1, options?.maxSkills ?? 6);
    const maxChars = Math.max(1000, options?.maxChars ?? 24_000);
    const lines: string[] = [
        title,
        "- 以下内容来自用户导入的 Agent Skills / ClawHub 兼容技能包。",
        "- 仅在任务与技能描述匹配时使用；若与更高优先级指令冲突，以更高优先级为准。",
        "",
    ];

    let used = lines.join("\n").length;
    let included = 0;

    for (const skill of enabledSkills) {
        if (included >= maxSkills) break;

        const blockLines = [
            `### ${skill.name}`,
            `- 描述：${skill.description}`,
            ...(skill.compatibility ? [`- 兼容性：${skill.compatibility}`] : []),
            ...(skill.allowedTools.length > 0
                ? [`- allowed-tools：${skill.allowedTools.join(", ")}`]
                : []),
            skill.instructions,
            "",
        ];
        const block = blockLines.join("\n").trimEnd();

        if (used + block.length > maxChars) break;

        lines.push(block);
        lines.push("");
        used += block.length + 2;
        included += 1;
    }

    const omitted = enabledSkills.length - included;
    if (omitted > 0) {
        lines.push(`- 其余 ${omitted} 个已启用技能因上下文限制未展开，请在需要时手动禁用无关技能。`);
    }

    return lines.join("\n").trim();
}

export async function importCompatibleSource(params: {
    kind: SkillSourceKind;
    value: string;
}) {
    const original = String(params.value || "").trim();
    if (!original) {
        throw new Error("导入来源不能为空");
    }

    let source: ISkillSourceInfo = {
        kind: params.kind,
        original,
        canonical: original,
        label: original,
    };
    let files: IBundleFile[] = [];
    let packageMeta: ISkillPackageMeta | null = null;
    const warnings: string[] = [];

    if (params.kind === "directory") {
        files = await readDirectoryBundle(original);
        source = {
            ...source,
            label: basenameLike(original) || original,
        };
    } else if (params.kind === "file") {
        files = await readLocalFileBundle(original);
        source = {
            ...source,
            label: basenameLike(original) || original,
        };
    } else {
        const remote = await readRemoteBundle(original);
        files = remote.files;
        source = {
            ...source,
            canonical: remote.canonicalUrl,
            label: remote.canonicalUrl,
        };

        if (remote.clawHubRepo) {
            packageMeta = {
                kind: /\/plugins\//i.test(original) ? "clawhub-plugin" : "clawhub-skill",
                sourceRepo: remote.clawHubRepo.sourceRepo,
                sourceTag: remote.clawHubRepo.sourceTag,
                capabilityTags: [],
                toolNames: [],
                bundledSkillNames: [],
            };
        }
    }

    files = files.map((file) => ({
        ...file,
        path: normalizeRelPath(file.path),
    }));

    const pluginFile = files.find(
        (file) => basenameLike(file.path) === "openclaw.plugin.json",
    );
    packageMeta = mergePackageMeta(
        packageMeta,
        pluginFile ? parseOpenClawPluginMeta(pluginFile) : null,
    );

    const mcpConfigs = dedupeMcpConfigs(
        files.flatMap((file) => parseMcpConfigsFromFile(file)),
    );

    const skillFiles = files.filter(
        (file) => basenameLike(file.path).toUpperCase() === "SKILL.MD",
    );

    const importedAt = Date.now();
    const skills = skillFiles.map((skillFile, index) => {
        const rawMarkdown = decodeBytes(skillFile.bytes);
        const parsed = parseSkillMarkdown(rawMarkdown);
        const skillRoot = dirnameLike(skillFile.path);
        const folderName = basenameLike(skillRoot);
        const fallbackName =
            packageMeta?.displayName ||
            packageMeta?.packageName ||
            folderName ||
            `imported-skill-${index + 1}`;
        const frontmatter = parsed.frontmatter;
        const name = String(frontmatter.name || fallbackName).trim() || fallbackName;
        const description =
            String(
                frontmatter.description ||
                    packageMeta?.summary ||
                    `${name} 导入的兼容技能`,
            ).trim() || `${name} 导入的兼容技能`;
        const slug = slugifySkillName(name);
        const skillWarnings: string[] = [];

        if (!frontmatter.name) {
            skillWarnings.push("缺少标准 name frontmatter，已使用兼容回退名称。");
        }
        if (!frontmatter.description) {
            skillWarnings.push("缺少标准 description frontmatter，已使用兼容回退描述。");
        }

        const ecosystemTags = uniqueStrings([
            "agent-skills",
            ...(packageMeta ? [packageMeta.kind] : []),
            ...(mcpConfigs.length > 0 ? ["bundled-mcp"] : []),
        ]);

        return {
            id: crypto.randomUUID(),
            dedupeKey: `${source.canonical}::${slug}`,
            slug,
            name,
            description,
            rawMarkdown,
            instructions: parsed.body,
            compatibility: String(frontmatter.compatibility || "").trim(),
            license: String(frontmatter.license || "").trim(),
            allowedTools: splitAllowedTools(frontmatter["allowed-tools"]),
            metadata: toStringRecord(frontmatter.metadata),
            enabled: true,
            importedAt,
            updatedAt: importedAt,
            source,
            packageMeta: packageMeta || undefined,
            ecosystemTags,
            warnings: skillWarnings,
            files: collectSkillFiles(skillRoot, files),
            bundledMcpCount: mcpConfigs.length,
        } satisfies IImportedSkill;
    });

    if (!packageMeta && skills.length > 0) {
        packageMeta = {
            kind: "agent-skill",
            displayName: skills[0]?.name,
            summary: skills[0]?.description,
            capabilityTags: [],
            toolNames: [],
            bundledSkillNames: skills.map((skill) => skill.slug),
        };
    }

    if (skillFiles.length === 0 && packageMeta?.kind?.includes("plugin")) {
        warnings.push("已识别 OpenClaw/ClawHub 插件元数据，但包内未发现可导入的 SKILL.md。");
    }

    if (skills.length === 0 && mcpConfigs.length === 0) {
        throw new Error("未在导入内容中发现可兼容的 Skill 或 MCP 配置");
    }

    return {
        skills,
        mcpConfigs,
        warnings,
        source,
        detectedKinds: buildDetectedKinds({
            source,
            packageMeta,
            skillCount: skills.length,
            mcpCount: mcpConfigs.length,
        }),
    } satisfies ICompatibilityImportResult;
}
