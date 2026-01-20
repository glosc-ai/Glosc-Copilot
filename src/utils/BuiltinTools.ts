import {
    readDir,
    readTextFile,
    readFile,
    writeTextFile,
    mkdir,
    exists,
    remove,
    rename,
    stat,
} from "@tauri-apps/plugin-fs";
import { Command } from "@tauri-apps/plugin-shell";

export type ClientTool = {
    description?: string;
    // Keep it JSON-serializable (backend may accept JSON Schema).
    parameters?: any;
    execute: (input: any, ctx?: any) => Promise<any>;
};

export type BuiltinToolsOptions = {
    enabled?: {
        filesystem?: boolean;
        git?: boolean;
    };
    cwd?: string | null;
    allowedDirectories?: string[] | null;
    // safety limits
    maxReadBytes?: number;
    maxSearchFiles?: number;
    maxSearchDepth?: number;
    maxGrepBytesPerFile?: number;
};

const DEFAULTS = {
    maxReadBytes: 1024 * 1024 * 2, // 2MB
    maxSearchFiles: 2000,
    maxSearchDepth: 25,
    maxGrepBytesPerFile: 1024 * 1024, // 1MB
} as const;

function isTauriRuntime(): boolean {
    return (
        typeof window !== "undefined" &&
        Boolean((window as any).__TAURI_INTERNALS__)
    );
}

function normalizeForCompare(p: string): string {
    const raw = String(p || "").trim();
    // Normalize separators; keep drive letters.
    let s = raw.replace(/\\/g, "/");
    // Remove trailing slash (except root like C:/)
    while (s.length > 3 && s.endsWith("/")) s = s.slice(0, -1);
    return s.toLowerCase();
}

function joinPath(base: string, rel: string): string {
    const b = String(base || "");
    const r = String(rel || "");
    if (!b) return r;
    if (!r) return b;
    const useBackslash = b.includes("\\");
    const sep = useBackslash ? "\\" : "/";
    const normalizedBase = b.endsWith(sep) ? b.slice(0, -1) : b;
    const normalizedRel = r.startsWith(sep) ? r.slice(1) : r;
    return `${normalizedBase}${sep}${normalizedRel}`;
}

function isAbsolutePath(p: string): boolean {
    const s = String(p || "").trim();
    if (!s) return false;
    if (s.startsWith("/")) return true;
    // Windows drive: C:\ or C:/
    if (/^[a-zA-Z]:[\\/]/.test(s)) return true;
    return false;
}

function resolvePath(inputPath: string, cwd?: string | null): string {
    const p = String(inputPath || "").trim();
    if (!p) return p;
    if (isAbsolutePath(p)) return p;
    const c = String(cwd || "").trim();
    if (!c) return p;
    return joinPath(c, p);
}

function ensureAllowed(path: string, allowedDirectories: string[]): void {
    const target = normalizeForCompare(path);
    const allowed = (allowedDirectories || [])
        .map((x) => String(x || "").trim())
        .filter(Boolean)
        .map(normalizeForCompare);

    if (allowed.length === 0) {
        throw new Error("未配置允许访问的目录（allowedDirectories 为空）");
    }

    const ok = allowed.some((root) => {
        if (!root) return false;
        if (target === root) return true;
        return target.startsWith(root.endsWith("/") ? root : `${root}/`);
    });

    if (!ok) {
        throw new Error(`路径不在允许范围内：${path}`);
    }
}

function toBase64(bytes: Uint8Array): string {
    // Uint8Array -> base64 (browser)
    let binary = "";
    for (let i = 0; i < bytes.length; i++)
        binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

function guessMimeType(path: string): string {
    const lower = String(path || "").toLowerCase();
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".gif")) return "image/gif";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".svg")) return "image/svg+xml";
    if (lower.endsWith(".mp3")) return "audio/mpeg";
    if (lower.endsWith(".wav")) return "audio/wav";
    if (lower.endsWith(".mp4")) return "video/mp4";
    if (lower.endsWith(".webm")) return "video/webm";
    if (lower.endsWith(".pdf")) return "application/pdf";
    return "application/octet-stream";
}

function safeJsonSchemaObject(
    props: Record<string, any>,
    required: string[] = [],
) {
    return {
        type: "object",
        additionalProperties: false,
        properties: props,
        ...(required.length ? { required } : {}),
    };
}

async function runGit(
    args: string[],
    cwd?: string | null,
): Promise<{ code: number; stdout: string; stderr: string }> {
    if (!isTauriRuntime()) {
        throw new Error("Git 工具仅在桌面版（Tauri）可用");
    }

    const cmd = Command.create("git", args, {
        cwd: cwd || undefined,
    });

    const output = await cmd.execute();
    return {
        code: output.code ?? 0,
        stdout: String(output.stdout || ""),
        stderr: String(output.stderr || ""),
    };
}

function parseGitStatusPorcelain(text: string) {
    const lines = String(text || "")
        .split(/\r?\n/)
        .filter(Boolean);

    let branch = "";
    let ahead = 0;
    let behind = 0;

    const staged: Array<{ path: string; status: string }> = [];
    const unstaged: Array<{ path: string; status: string }> = [];
    const untracked: string[] = [];

    for (const line of lines) {
        if (line.startsWith("## ")) {
            // ## main...origin/main [ahead 1, behind 2]
            const header = line.slice(3).trim();
            const m = header.match(/^([^ .]+)(?:\.\.\.[^ ]+)?(?: \[(.+)\])?$/);
            if (m) {
                branch = m[1] || branch;
                const ab = m[2] || "";
                const ma = ab.match(/ahead\s+(\d+)/);
                const mb = ab.match(/behind\s+(\d+)/);
                if (ma) ahead = Number(ma[1]) || 0;
                if (mb) behind = Number(mb[1]) || 0;
            } else {
                branch = header.split("...")[0] || header;
            }
            continue;
        }

        if (line.startsWith("?? ")) {
            untracked.push(line.slice(3));
            continue;
        }

        // XY <path>
        const x = line[0];
        const y = line[1];
        const rest = line.slice(3);
        const path = rest.split(" -> ").pop() || rest;

        if (x && x !== " ") staged.push({ path, status: x });
        if (y && y !== " ") unstaged.push({ path, status: y });
    }

    return { branch, ahead, behind, staged, unstaged, untracked };
}

export function createBuiltinTools(
    options: BuiltinToolsOptions = {},
): Record<string, ClientTool> {
    const enabledFs = options.enabled?.filesystem ?? false;
    const enabledGit = options.enabled?.git ?? false;

    const cwd = options.cwd ?? null;
    const allowedDirectories = (options.allowedDirectories || []).filter(
        Boolean,
    );

    const maxReadBytes = options.maxReadBytes ?? DEFAULTS.maxReadBytes;
    const maxSearchFiles = options.maxSearchFiles ?? DEFAULTS.maxSearchFiles;
    const maxSearchDepth = options.maxSearchDepth ?? DEFAULTS.maxSearchDepth;
    const maxGrepBytesPerFile =
        options.maxGrepBytesPerFile ?? DEFAULTS.maxGrepBytesPerFile;

    const tools: Record<string, ClientTool> = {};

    if (enabledFs) {
        tools.list_allowed_directories = {
            description: "列出当前会话允许访问的目录（安全边界）",
            parameters: safeJsonSchemaObject({}, []),
            execute: async () => {
                return { directories: allowedDirectories };
            },
        };

        tools.read_text_file = {
            description: "读取文本文件内容（UTF-8）",
            parameters: safeJsonSchemaObject(
                {
                    path: {
                        type: "string",
                        description: "文件路径（相对 cwd 或绝对路径）",
                    },
                },
                ["path"],
            ),
            execute: async (input) => {
                if (!isTauriRuntime())
                    throw new Error("文件工具仅在桌面版（Tauri）可用");
                const p = resolvePath(input?.path, cwd);
                ensureAllowed(p, allowedDirectories);

                const info = await stat(p);
                if (info.size > maxReadBytes) {
                    throw new Error(
                        `文件过大：${info.size} bytes（上限 ${maxReadBytes}）`,
                    );
                }
                const text = await readTextFile(p);
                return text;
            },
        };

        // alias
        tools.read_file = tools.read_text_file;

        tools.read_media_file = {
            description:
                "读取媒体文件并以 base64 返回（适用于图片/音频/视频/二进制）",
            parameters: safeJsonSchemaObject(
                {
                    path: {
                        type: "string",
                        description: "文件路径（相对 cwd 或绝对路径）",
                    },
                    mimeType: {
                        type: "string",
                        description: "可选：指定 mimeType",
                    },
                },
                ["path"],
            ),
            execute: async (input) => {
                if (!isTauriRuntime())
                    throw new Error("文件工具仅在桌面版（Tauri）可用");
                const p = resolvePath(input?.path, cwd);
                ensureAllowed(p, allowedDirectories);

                const info = await stat(p);
                if (info.size > maxReadBytes) {
                    throw new Error(
                        `文件过大：${info.size} bytes（上限 ${maxReadBytes}）`,
                    );
                }

                const bytes = await readFile(p);
                const base64 = toBase64(bytes);
                const mimeType =
                    String(input?.mimeType || "").trim() || guessMimeType(p);
                return {
                    ok: true,
                    path: p,
                    mimeType,
                    mediaType: mimeType,
                    base64,
                    bytesRead: bytes.length,
                };
            },
        };

        tools.read_multiple_files = {
            description: "读取多个文本文件（UTF-8）",
            parameters: safeJsonSchemaObject(
                {
                    paths: {
                        type: "array",
                        items: { type: "string" },
                        description: "文件路径列表",
                    },
                },
                ["paths"],
            ),
            execute: async (input) => {
                if (!isTauriRuntime())
                    throw new Error("文件工具仅在桌面版（Tauri）可用");
                const paths: string[] = Array.isArray(input?.paths)
                    ? input.paths
                    : [];
                const files: Array<{
                    path: string;
                    content: string;
                    ok: boolean;
                    error?: string;
                }> = [];

                for (const raw of paths.slice(0, 50)) {
                    const p = resolvePath(raw, cwd);
                    try {
                        ensureAllowed(p, allowedDirectories);
                        const info = await stat(p);
                        if (info.size > maxReadBytes) {
                            throw new Error(
                                `文件过大：${info.size} bytes（上限 ${maxReadBytes}）`,
                            );
                        }
                        const content = await readTextFile(p);
                        files.push({ path: p, content, ok: true });
                    } catch (e: any) {
                        files.push({
                            path: p,
                            content: "",
                            ok: false,
                            error: e instanceof Error ? e.message : String(e),
                        });
                    }
                }

                return { ok: true, files };
            },
        };

        tools.write_file = {
            description: "写入文本文件（UTF-8），必要时自动创建父目录",
            parameters: safeJsonSchemaObject(
                {
                    path: {
                        type: "string",
                        description: "文件路径（相对 cwd 或绝对路径）",
                    },
                    content: { type: "string", description: "文件内容" },
                },
                ["path", "content"],
            ),
            execute: async (input) => {
                if (!isTauriRuntime())
                    throw new Error("文件工具仅在桌面版（Tauri）可用");
                const p = resolvePath(input?.path, cwd);
                ensureAllowed(p, allowedDirectories);

                const content = String(input?.content ?? "");

                const existedBefore = await exists(p);
                // ensure parent exists
                const parent = p.replace(/[\\/][^\\/]+$/, "");
                if (parent && parent !== p) {
                    await mkdir(parent, { recursive: true });
                }

                await writeTextFile(p, content);
                return {
                    ok: true,
                    action: existedBefore ? "overwrite" : "create",
                    path: p,
                    existedBefore,
                    bytesWritten: new TextEncoder().encode(content).length,
                };
            },
        };

        tools.edit_file = {
            description:
                "基于 oldText/newText 对文件进行精确替换（支持多段 edits）",
            parameters: safeJsonSchemaObject(
                {
                    path: {
                        type: "string",
                        description: "文件路径（相对 cwd 或绝对路径）",
                    },
                    edits: {
                        type: "array",
                        items: safeJsonSchemaObject(
                            {
                                oldText: { type: "string" },
                                newText: { type: "string" },
                            },
                            ["oldText", "newText"],
                        ),
                    },
                },
                ["path", "edits"],
            ),
            execute: async (input) => {
                if (!isTauriRuntime())
                    throw new Error("文件工具仅在桌面版（Tauri）可用");
                const p = resolvePath(input?.path, cwd);
                ensureAllowed(p, allowedDirectories);

                const edits: Array<{ oldText: string; newText: string }> =
                    Array.isArray(input?.edits)
                        ? input.edits.map((e: any) => ({
                              oldText: String(e?.oldText ?? ""),
                              newText: String(e?.newText ?? ""),
                          }))
                        : [];

                if (edits.length === 0) throw new Error("edits 不能为空");

                let text = await readTextFile(p);
                const applied: Array<{
                    ok: boolean;
                    oldTextLength: number;
                    newTextLength: number;
                    replaced: number;
                }> = [];

                for (const e of edits) {
                    if (!e.oldText) throw new Error("oldText 不能为空");
                    const occurrences = text.split(e.oldText).length - 1;
                    if (occurrences <= 0) {
                        throw new Error(
                            "未找到 oldText，无法应用补丁（请确保 oldText 与文件内容完全一致）",
                        );
                    }
                    text = text.replace(e.oldText, e.newText);
                    applied.push({
                        ok: true,
                        oldTextLength: e.oldText.length,
                        newTextLength: e.newText.length,
                        replaced: 1,
                    });
                }

                await writeTextFile(p, text);
                return {
                    ok: true,
                    path: p,
                    appliedEdits: applied.length,
                    bytesWritten: new TextEncoder().encode(text).length,
                };
            },
        };

        tools.create_directory = {
            description: "创建目录（递归创建）",
            parameters: safeJsonSchemaObject(
                {
                    path: { type: "string", description: "目录路径" },
                },
                ["path"],
            ),
            execute: async (input) => {
                if (!isTauriRuntime())
                    throw new Error("文件工具仅在桌面版（Tauri）可用");
                const p = resolvePath(input?.path, cwd);
                ensureAllowed(p, allowedDirectories);
                const existedBefore = await exists(p);
                await mkdir(p, { recursive: true });
                return { ok: true, path: p, existedBefore };
            },
        };

        tools.delete_file = {
            description: "删除文件或目录（递归）",
            parameters: safeJsonSchemaObject(
                {
                    path: { type: "string", description: "目标路径" },
                },
                ["path"],
            ),
            execute: async (input) => {
                if (!isTauriRuntime())
                    throw new Error("文件工具仅在桌面版（Tauri）可用");
                const p = resolvePath(input?.path, cwd);
                ensureAllowed(p, allowedDirectories);
                const existedBefore = await exists(p);
                if (!existedBefore)
                    return {
                        ok: true,
                        path: p,
                        existedBefore: false,
                        action: "noop",
                    };
                await remove(p, { recursive: true });
                return {
                    ok: true,
                    path: p,
                    existedBefore: true,
                    action: "delete",
                };
            },
        };

        tools.move_file = {
            description: "移动/重命名文件或目录",
            parameters: safeJsonSchemaObject(
                {
                    source: { type: "string" },
                    destination: { type: "string" },
                },
                ["source", "destination"],
            ),
            execute: async (input) => {
                if (!isTauriRuntime())
                    throw new Error("文件工具仅在桌面版（Tauri）可用");
                const src = resolvePath(input?.source, cwd);
                const dst = resolvePath(input?.destination, cwd);
                ensureAllowed(src, allowedDirectories);
                ensureAllowed(dst, allowedDirectories);

                const existedBefore = await exists(dst);
                const parent = dst.replace(/[\\/][^\\/]+$/, "");
                if (parent && parent !== dst)
                    await mkdir(parent, { recursive: true });

                await rename(src, dst);
                return {
                    ok: true,
                    source: src,
                    destination: dst,
                    existedBefore,
                };
            },
        };

        tools.list_directory = {
            description: "列出目录内容（不递归）",
            parameters: safeJsonSchemaObject(
                {
                    path: { type: "string", description: "目录路径" },
                },
                ["path"],
            ),
            execute: async (input) => {
                if (!isTauriRuntime())
                    throw new Error("文件工具仅在桌面版（Tauri）可用");
                const p = resolvePath(input?.path, cwd);
                ensureAllowed(p, allowedDirectories);

                const entries = await readDir(p);
                return (entries || [])
                    .map((e: any) => ({
                        name: e?.name ?? "",
                        path: e?.name ? joinPath(p, e.name) : p,
                        type: e?.isDirectory ? "directory" : "file",
                    }))
                    .filter((x: any) => x.name);
            },
        };

        tools.list_directory_with_sizes = {
            description: "列出目录内容并附带 size/mtime（不递归）",
            parameters: safeJsonSchemaObject(
                {
                    path: { type: "string", description: "目录路径" },
                },
                ["path"],
            ),
            execute: async (input) => {
                if (!isTauriRuntime())
                    throw new Error("文件工具仅在桌面版（Tauri）可用");
                const p = resolvePath(input?.path, cwd);
                ensureAllowed(p, allowedDirectories);

                const entries = await readDir(p);
                const rows: any[] = [];
                for (const e of entries || []) {
                    const name = e?.name ?? "";
                    const path = name ? joinPath(p, name) : p;
                    if (!name) continue;
                    try {
                        const info = await stat(path);
                        rows.push({
                            name,
                            path,
                            type: info.isDirectory
                                ? "directory"
                                : info.isFile
                                  ? "file"
                                  : "other",
                            size: info.size,
                            modifiedTime: info.mtime
                                ? info.mtime.toISOString()
                                : null,
                        });
                    } catch (err: any) {
                        rows.push({
                            name,
                            path,
                            type: "unknown",
                            error: err?.message || String(err),
                        });
                    }
                }
                return rows;
            },
        };

        tools.get_file_info = {
            description: "获取文件/目录信息（类型/大小/时间戳）",
            parameters: safeJsonSchemaObject(
                {
                    path: { type: "string" },
                },
                ["path"],
            ),
            execute: async (input) => {
                if (!isTauriRuntime())
                    throw new Error("文件工具仅在桌面版（Tauri）可用");
                const p = resolvePath(input?.path, cwd);
                ensureAllowed(p, allowedDirectories);

                const info = await stat(p);
                const type = info.isDirectory
                    ? "directory"
                    : info.isFile
                      ? "file"
                      : info.isSymlink
                        ? "symlink"
                        : "other";
                return {
                    ok: true,
                    path: p,
                    type,
                    size: info.size,
                    modifiedTime: info.mtime ? info.mtime.toISOString() : null,
                };
            },
        };

        tools.directory_tree = {
            description: "输出目录树（递归，可限制 depth/maxEntries）",
            parameters: safeJsonSchemaObject(
                {
                    path: { type: "string" },
                    depth: {
                        type: "number",
                        description: "最大深度（默认 6）",
                    },
                    maxEntries: {
                        type: "number",
                        description: "最大节点数（默认 400）",
                    },
                },
                ["path"],
            ),
            execute: async (input) => {
                if (!isTauriRuntime())
                    throw new Error("文件工具仅在桌面版（Tauri）可用");
                const root = resolvePath(input?.path, cwd);
                ensureAllowed(root, allowedDirectories);

                const depth = Number.isFinite(input?.depth)
                    ? Math.max(0, Math.floor(input.depth))
                    : 6;
                const maxEntries = Number.isFinite(input?.maxEntries)
                    ? Math.max(1, Math.floor(input.maxEntries))
                    : 400;

                let count = 0;

                const walk = async (
                    path: string,
                    level: number,
                ): Promise<any> => {
                    count += 1;
                    const info = await stat(path);
                    const node: any = {
                        name: String(path).split(/[\\/]/).pop() || path,
                        path,
                        type: info.isDirectory ? "directory" : "file",
                    };

                    if (!info.isDirectory) return node;
                    if (level >= depth) return { ...node, children: [] };
                    if (count >= maxEntries) return { ...node, children: [] };

                    const entries = await readDir(path);
                    const children: any[] = [];
                    for (const e of entries || []) {
                        if (count >= maxEntries) break;
                        const name = e?.name ?? "";
                        const childPath = name ? joinPath(path, name) : "";
                        if (!name || !childPath) continue;
                        try {
                            children.push(await walk(childPath, level + 1));
                        } catch {
                            // skip unreadable
                        }
                    }

                    return { ...node, children };
                };

                return await walk(root, 0);
            },
        };

        tools.search_files = {
            description: "在目录下搜索文件名（简单通配符 * ?）",
            parameters: safeJsonSchemaObject(
                {
                    path: { type: "string", description: "搜索根目录" },
                    pattern: {
                        type: "string",
                        description: "文件名模式，如 **/*.ts 或 *.vue",
                    },
                    maxResults: { type: "number" },
                },
                ["path", "pattern"],
            ),
            execute: async (input) => {
                if (!isTauriRuntime())
                    throw new Error("文件工具仅在桌面版（Tauri）可用");
                const root = resolvePath(input?.path, cwd);
                ensureAllowed(root, allowedDirectories);

                const pattern = String(input?.pattern || "").trim();
                if (!pattern) throw new Error("pattern 不能为空");

                const maxResults = Number.isFinite(input?.maxResults)
                    ? Math.max(1, Math.min(5000, Math.floor(input.maxResults)))
                    : 200;

                // Very small glob-like matcher for basename and relative paths.
                const esc = (s: string) =>
                    s.replace(/[.+^${}()|[\]\\]/g, "\\$&");
                const rx = new RegExp(
                    "^" +
                        esc(pattern)
                            .replace(/\\\*\\\*\\\//g, "(.*/)?")
                            .replace(/\\\*\\\*/g, ".*")
                            .replace(/\\\*/g, "[^/]*")
                            .replace(/\\\?/g, "[^/]") +
                        "$",
                    "i",
                );

                const matches: Array<{ path: string }> = [];
                let visited = 0;

                const walk = async (dir: string, depthLeft: number) => {
                    if (matches.length >= maxResults) return;
                    if (visited >= maxSearchFiles) return;
                    if (depthLeft < 0) return;

                    const entries = await readDir(dir);
                    for (const e of entries || []) {
                        if (matches.length >= maxResults) break;
                        if (visited >= maxSearchFiles) break;

                        const name = e?.name ?? "";
                        const p = name ? joinPath(dir, name) : "";
                        if (!name || !p) continue;

                        visited += 1;

                        const rel = normalizeForCompare(p)
                            .slice(normalizeForCompare(root).length)
                            .replace(/^\/+/, "");
                        if (rx.test(rel) || rx.test(name)) {
                            matches.push({ path: p });
                        }

                        if (e?.isDirectory) {
                            await walk(p, depthLeft - 1);
                        }
                    }
                };

                await walk(root, maxSearchDepth);
                return { ok: true, matches };
            },
        };

        tools.grep_files = {
            description: "在目录下 grep 文本（简单实现；会截断大文件/结果）",
            parameters: safeJsonSchemaObject(
                {
                    path: { type: "string", description: "搜索根目录" },
                    query: { type: "string", description: "要搜索的字符串" },
                    includePattern: {
                        type: "string",
                        description: "可选：文件名通配符，如 **/*.ts",
                    },
                    maxResults: { type: "number" },
                },
                ["path", "query"],
            ),
            execute: async (input) => {
                if (!isTauriRuntime())
                    throw new Error("文件工具仅在桌面版（Tauri）可用");
                const root = resolvePath(input?.path, cwd);
                ensureAllowed(root, allowedDirectories);

                const query = String(input?.query || "");
                if (!query) throw new Error("query 不能为空");

                const includePattern = String(
                    input?.includePattern || "",
                ).trim();
                const maxResults = Number.isFinite(input?.maxResults)
                    ? Math.max(1, Math.min(5000, Math.floor(input.maxResults)))
                    : 200;

                const esc = (s: string) =>
                    s.replace(/[.+^${}()|[\]\\]/g, "\\$&");
                const includeRx = includePattern
                    ? new RegExp(
                          "^" +
                              esc(includePattern)
                                  .replace(/\\\*\\\*\\\//g, "(.*/)?")
                                  .replace(/\\\*\\\*/g, ".*")
                                  .replace(/\\\*/g, "[^/]*")
                                  .replace(/\\\?/g, "[^/]") +
                              "$",
                          "i",
                      )
                    : null;

                const matches: Array<{
                    path: string;
                    line: number;
                    preview: string;
                }> = [];
                let visited = 0;

                const walk = async (dir: string, depthLeft: number) => {
                    if (matches.length >= maxResults) return;
                    if (visited >= maxSearchFiles) return;
                    if (depthLeft < 0) return;

                    const entries = await readDir(dir);
                    for (const e of entries || []) {
                        if (matches.length >= maxResults) break;
                        if (visited >= maxSearchFiles) break;

                        const name = e?.name ?? "";
                        const p = name ? joinPath(dir, name) : "";
                        if (!name || !p) continue;

                        visited += 1;

                        if (e?.isDirectory) {
                            await walk(p, depthLeft - 1);
                            continue;
                        }

                        const rel = normalizeForCompare(p)
                            .slice(normalizeForCompare(root).length)
                            .replace(/^\/+/, "");
                        if (
                            includeRx &&
                            !includeRx.test(rel) &&
                            !includeRx.test(name)
                        )
                            continue;

                        try {
                            const info = await stat(p);
                            if (info.size > maxGrepBytesPerFile) continue;
                            const content = await readTextFile(p);
                            const lines = content.split(/\r?\n/);
                            for (let i = 0; i < lines.length; i += 1) {
                                if (matches.length >= maxResults) break;
                                if (lines[i].includes(query)) {
                                    matches.push({
                                        path: p,
                                        line: i + 1,
                                        preview: lines[i].slice(0, 400),
                                    });
                                }
                            }
                        } catch {
                            // ignore unreadable
                        }
                    }
                };

                await walk(root, maxSearchDepth);
                return { ok: true, matches };
            },
        };
    }

    if (enabledGit) {
        tools.git_status = {
            description: "获取 Git 状态（分支/暂存/未暂存/未跟踪）",
            parameters: safeJsonSchemaObject(
                {
                    cwd: {
                        type: "string",
                        description: "可选：git 工作目录（默认使用会话 cwd）",
                    },
                },
                [],
            ),
            execute: async (input) => {
                const runCwd = String(input?.cwd || "").trim() || cwd || null;
                if (!runCwd)
                    throw new Error("git_status 需要 cwd（工作区根目录）");
                const { code, stdout, stderr } = await runGit(
                    ["status", "--porcelain=v1", "-b"],
                    runCwd,
                );
                if (code !== 0)
                    throw new Error(
                        stderr || stdout || `git status 失败（code=${code}）`,
                    );
                const parsed = parseGitStatusPorcelain(stdout);
                return { ok: true, cwd: runCwd, ...parsed };
            },
        };

        tools.git_diff = {
            description: "获取 Git diff（可选 staged/指定文件）",
            parameters: safeJsonSchemaObject(
                {
                    cwd: { type: "string" },
                    path: {
                        type: "string",
                        description: "可选：仅 diff 某个文件",
                    },
                    staged: { type: "boolean", description: "true = --cached" },
                },
                [],
            ),
            execute: async (input) => {
                const runCwd = String(input?.cwd || "").trim() || cwd || null;
                if (!runCwd)
                    throw new Error("git_diff 需要 cwd（工作区根目录）");
                const staged = Boolean(input?.staged);
                const filePath = String(input?.path || "").trim();

                const args = ["diff", ...(staged ? ["--cached"] : [])];
                if (filePath) args.push("--", filePath);

                const { code, stdout, stderr } = await runGit(args, runCwd);
                if (code !== 0)
                    throw new Error(
                        stderr || stdout || `git diff 失败（code=${code}）`,
                    );
                return { ok: true, cwd: runCwd, diff: stdout };
            },
        };

        tools.git_add = {
            description: "git add（支持 paths 或 all）",
            parameters: safeJsonSchemaObject(
                {
                    cwd: { type: "string" },
                    paths: { type: "array", items: { type: "string" } },
                    all: { type: "boolean" },
                },
                [],
            ),
            execute: async (input) => {
                const runCwd = String(input?.cwd || "").trim() || cwd || null;
                if (!runCwd)
                    throw new Error("git_add 需要 cwd（工作区根目录）");

                const all = Boolean(input?.all);
                const paths: string[] = Array.isArray(input?.paths)
                    ? input.paths.map((x: any) => String(x))
                    : [];

                const args = ["add"];
                if (all || paths.length === 0) {
                    args.push("-A");
                } else {
                    args.push("--", ...paths);
                }

                const { code, stdout, stderr } = await runGit(args, runCwd);
                if (code !== 0)
                    throw new Error(
                        stderr || stdout || `git add 失败（code=${code}）`,
                    );
                return { ok: true, cwd: runCwd };
            },
        };

        tools.git_commit = {
            description: "git commit -m",
            parameters: safeJsonSchemaObject(
                {
                    cwd: { type: "string" },
                    message: { type: "string" },
                },
                ["message"],
            ),
            execute: async (input) => {
                const runCwd = String(input?.cwd || "").trim() || cwd || null;
                if (!runCwd)
                    throw new Error("git_commit 需要 cwd（工作区根目录）");

                const message = String(input?.message || "").trim();
                if (!message) throw new Error("message 不能为空");

                const { code, stdout, stderr } = await runGit(
                    ["commit", "-m", message],
                    runCwd,
                );
                if (code !== 0)
                    throw new Error(
                        stderr || stdout || `git commit 失败（code=${code}）`,
                    );
                return { ok: true, cwd: runCwd, output: stdout };
            },
        };

        tools.git_log = {
            description: "git log（简化输出）",
            parameters: safeJsonSchemaObject(
                {
                    cwd: { type: "string" },
                    maxCount: { type: "number" },
                },
                [],
            ),
            execute: async (input) => {
                const runCwd = String(input?.cwd || "").trim() || cwd || null;
                if (!runCwd)
                    throw new Error("git_log 需要 cwd（工作区根目录）");

                const maxCount = Number.isFinite(input?.maxCount)
                    ? Math.max(1, Math.min(100, Math.floor(input.maxCount)))
                    : 20;
                const { code, stdout, stderr } = await runGit(
                    ["log", "-n", String(maxCount), "--pretty=oneline"],
                    runCwd,
                );
                if (code !== 0)
                    throw new Error(
                        stderr || stdout || `git log 失败（code=${code}）`,
                    );
                return {
                    ok: true,
                    cwd: runCwd,
                    lines: stdout.split(/\r?\n/).filter(Boolean),
                };
            },
        };

        tools.git_branch = {
            description: "列出分支（当前分支标记 *）",
            parameters: safeJsonSchemaObject(
                {
                    cwd: { type: "string" },
                },
                [],
            ),
            execute: async (input) => {
                const runCwd = String(input?.cwd || "").trim() || cwd || null;
                if (!runCwd)
                    throw new Error("git_branch 需要 cwd（工作区根目录）");
                const { code, stdout, stderr } = await runGit(
                    ["branch", "--list"],
                    runCwd,
                );
                if (code !== 0)
                    throw new Error(
                        stderr || stdout || `git branch 失败（code=${code}）`,
                    );
                const branches = stdout
                    .split(/\r?\n/)
                    .map((l) => l.trimEnd())
                    .filter(Boolean)
                    .map((l) => {
                        const current = l.startsWith("*");
                        const name = l.replace(/^\*\s*/, "").trim();
                        return { name, current };
                    });
                return { ok: true, cwd: runCwd, branches };
            },
        };
    }

    return tools;
}
