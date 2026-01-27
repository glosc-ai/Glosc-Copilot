<script setup lang="ts">
import { Button } from "@/components/ui/button";

import WorkspaceAiSession from "@/components/workspace/WorkspaceAiSession.vue";
import MonacoEditorPane from "@/components/workspace/MonacoEditorPane.vue";
import WorkspaceConsolePanel from "@/components/workspace/WorkspaceConsolePanel.vue";
import { FileTree } from "@/components/ai-elements/file-tree";

import { useColorMode, useDebounceFn, useIntervalFn } from "@vueuse/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
    readDir,
    readTextFile,
    writeTextFile,
    mkdir,
    remove,
    rename,
    exists,
} from "@tauri-apps/plugin-fs";

import { storeUtils } from "@/utils/StoreUtils";

import {
    File,
    FileArchive,
    FileAudio,
    FileCode,
    FileCog,
    FileImage,
    FileJson,
    FileSpreadsheet,
    FileText,
    FileVideo,
    Folder,
    FolderOpen,
    Plus,
    RefreshCcw,
    MoreHorizontal,
    Save,
    Trash2,
} from "lucide-vue-next";

type TreeNode = {
    name: string;
    path: string;
    isDir: boolean;
};

const workspaceRoot = ref<string | null>(null);
const activeFilePath = ref<string | null>(null);

const editorValue = ref<string>("");
const lastSavedValue = ref<string>("");
const fileLoadError = ref<string | null>(null);
const fileSaving = ref(false);

const expandedDirs = ref<Set<string>>(new Set());
const childrenByPath = ref<Record<string, TreeNode[]>>({});
const loadingDirs = ref<Set<string>>(new Set());
const dirLoadError = ref<string | null>(null);

// layout state
const leftPaneWidth = ref<number>(288);
const rightPaneWidth = ref<number>(320);
const consoleHeight = ref<number>(220);
const consoleVisible = ref<boolean>(true);

type WorkspaceLayoutState = {
    leftPaneWidth: number;
    rightPaneWidth: number;
    consoleHeight: number;
    consoleVisible: boolean;
};

const WORKSPACE_LAYOUT_KEY = "workspace_layout_v1";

const colorMode = useColorMode();
const editorTheme = computed(() =>
    colorMode.value === "dark" ? "vs-dark" : "vs",
);

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function clampLayout(layout: Partial<WorkspaceLayoutState>) {
    const left =
        typeof layout.leftPaneWidth === "number"
            ? clamp(layout.leftPaneWidth, 200, 520)
            : leftPaneWidth.value;
    const right =
        typeof layout.rightPaneWidth === "number"
            ? clamp(layout.rightPaneWidth, 220, 520)
            : rightPaneWidth.value;
    const consoleH =
        typeof layout.consoleHeight === "number"
            ? clamp(layout.consoleHeight, 120, 520)
            : consoleHeight.value;
    const visible =
        typeof layout.consoleVisible === "boolean"
            ? layout.consoleVisible
            : consoleVisible.value;

    leftPaneWidth.value = left;
    rightPaneWidth.value = right;
    consoleHeight.value = consoleH;
    consoleVisible.value = visible;
}

const persistLayout = useDebounceFn(async () => {
    const data: WorkspaceLayoutState = {
        leftPaneWidth: leftPaneWidth.value,
        rightPaneWidth: rightPaneWidth.value,
        consoleHeight: consoleHeight.value,
        consoleVisible: consoleVisible.value,
    };
    try {
        await storeUtils.set(WORKSPACE_LAYOUT_KEY, data);
    } catch {
        // ignore
    }
}, 200);

watch(
    [leftPaneWidth, rightPaneWidth, consoleHeight, consoleVisible],
    () => {
        void persistLayout();
    },
    { deep: false },
);

type DragKind = "left" | "right" | "console";

function startDrag(kind: DragKind, e: MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = leftPaneWidth.value;
    const startRight = rightPaneWidth.value;
    const startConsole = consoleHeight.value;

    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;

        // rough bounds; avoid over-engineering layout math
        if (kind === "left") {
            leftPaneWidth.value = clamp(startLeft + dx, 200, 520);
        } else if (kind === "right") {
            rightPaneWidth.value = clamp(startRight - dx, 220, 520);
        } else if (kind === "console") {
            // drag up -> bigger console; drag down -> smaller
            consoleHeight.value = clamp(startConsole - dy, 120, 520);
        }
    };

    const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.userSelect = prevUserSelect;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
}

const isDirExpanded = (dirPath: string) => expandedDirs.value.has(dirPath);

const rootNodes = computed<TreeNode[]>(() => {
    if (!workspaceRoot.value) return [];
    return childrenByPath.value[workspaceRoot.value] || [];
});

const isDirty = computed(() => editorValue.value !== lastSavedValue.value);

function joinPath(base: string, name: string) {
    const useBackslash = base.includes("\\");
    const sep = useBackslash ? "\\" : "/";
    if (base.endsWith(sep)) return `${base}${name}`;
    return `${base}${sep}${name}`;
}

function basename(p: string) {
    const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
    return idx >= 0 ? p.slice(idx + 1) : p;
}

function dirname(p: string) {
    const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
    return idx > 0 ? p.slice(0, idx) : "";
}

function normalizePathForCompare(p: string) {
    // Windows 默认大小写不敏感；统一成 / 并转小写，便于前缀判断
    return (p || "").replace(/\\/g, "/").toLowerCase();
}

function isDescendantPath(parent: string, child: string) {
    const a = normalizePathForCompare(parent);
    const b = normalizePathForCompare(child);
    if (!a || !b) return false;
    if (a === b) return true;
    return b.startsWith(a.endsWith("/") ? a : a + "/");
}

async function loadDir(dirPath: string, silent = false) {
    if (loadingDirs.value.has(dirPath)) return;

    if (!silent) {
        dirLoadError.value = null;
        loadingDirs.value = new Set(loadingDirs.value).add(dirPath);
    }
    try {
        const entries = await readDir(dirPath);
        const nodes: TreeNode[] = (entries || [])
            .map((e: any) => {
                const name = e?.name ?? "";
                const path =
                    e?.path ?? (name ? joinPath(dirPath, name) : dirPath);
                const isDir = Boolean(
                    e?.isDir ??
                    e?.isDirectory ??
                    (Array.isArray(e?.children) && e.children.length >= 0),
                );
                return { name, path, isDir };
            })
            .filter((n: any) => Boolean(n.name))
            .sort((a: any, b: any) => {
                if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
                return a.name.localeCompare(b.name);
            });

        childrenByPath.value = {
            ...childrenByPath.value,
            [dirPath]: nodes,
        };
    } catch (e: any) {
        if (!silent) {
            dirLoadError.value =
                e instanceof Error
                    ? e.message
                    : typeof e === "string"
                      ? e
                      : "读取目录失败";
        }
    } finally {
        if (!silent) {
            const next = new Set(loadingDirs.value);
            next.delete(dirPath);
            loadingDirs.value = next;
        }
    }
}

useIntervalFn(() => {
    if (!workspaceRoot.value) return;
    loadDir(workspaceRoot.value, true);
    for (const dir of expandedDirs.value) {
        loadDir(dir, true);
    }
}, 3000);

async function toggleDir(node: TreeNode) {
    if (!node.isDir) return;
    const next = new Set(expandedDirs.value);
    if (next.has(node.path)) {
        next.delete(node.path);
        expandedDirs.value = next;
        return;
    }

    next.add(node.path);
    expandedDirs.value = next;
    if (!childrenByPath.value[node.path]) {
        await loadDir(node.path);
    }
}

function getFileExtension(fileName: string) {
    const name = (fileName || "").toLowerCase();
    // dotfiles like .env / .gitignore
    if (name.startsWith(".") && !name.includes(".", 1)) return name.slice(1);
    const idx = name.lastIndexOf(".");
    if (idx <= 0 || idx === name.length - 1) return "";
    return name.slice(idx + 1);
}

function getNodeIcon(node: TreeNode) {
    if (node.isDir) {
        return isDirExpanded(node.path) ? FolderOpen : Folder;
    }

    const ext = getFileExtension(node.name);
    if (
        [
            "ts",
            "tsx",
            "js",
            "jsx",
            "vue",
            "rs",
            "py",
            "go",
            "java",
            "c",
            "cc",
            "cpp",
            "h",
            "hpp",
            "cs",
            "php",
            "rb",
            "swift",
            "kt",
            "kts",
            "sql",
            "sh",
            "bash",
            "ps1",
        ].includes(ext)
    ) {
        return FileCode;
    }
    if (["json", "jsonc"].includes(ext)) return FileJson;
    if (["md", "txt", "log"].includes(ext)) return FileText;
    if (["png", "jpg", "jpeg", "gif", "svg", "webp", "ico"].includes(ext))
        return FileImage;
    if (["mp3", "wav", "flac", "m4a", "ogg"].includes(ext)) return FileAudio;
    if (["mp4", "mov", "mkv", "webm"].includes(ext)) return FileVideo;
    if (["zip", "rar", "7z", "tar", "gz", "bz2", "xz"].includes(ext))
        return FileArchive;
    if (["csv", "tsv", "xls", "xlsx"].includes(ext)) return FileSpreadsheet;
    if (["yaml", "yml", "toml", "ini", "env"].includes(ext)) return FileCog;
    return File;
}

function languageFromPath(filePath: string) {
    const lower = (filePath || "").toLowerCase();
    const fileName = lower.split(/[\\/]/).pop() || lower;

    // Special filenames (no extension)
    if (fileName === "dockerfile") return "dockerfile";
    if (fileName === "makefile") return "makefile";
    if (fileName === "caddyfile") return "plaintext";

    // dotfiles
    if (fileName === ".gitignore") return "plaintext";
    if (fileName === ".gitattributes") return "plaintext";
    if (fileName === ".editorconfig") return "ini";
    if (fileName === ".env" || fileName.startsWith(".env.")) return "dotenv";

    const ext = getFileExtension(fileName);
    const map: Record<string, string> = {
        // Web
        ts: "typescript",
        tsx: "typescript",
        js: "javascript",
        jsx: "javascript",
        mjs: "javascript",
        cjs: "javascript",
        vue: "html",
        html: "html",
        htm: "html",
        css: "css",
        scss: "scss",
        sass: "scss",
        less: "less",

        // Data / configs
        json: "json",
        jsonc: "json",
        md: "markdown",
        markdown: "markdown",
        yaml: "yaml",
        yml: "yaml",
        toml: "toml",
        ini: "ini",
        conf: "plaintext",
        cfg: "plaintext",
        env: "dotenv",
        xml: "xml",
        svg: "xml",

        // Backend / scripts
        rs: "rust",
        py: "python",
        pyw: "python",
        go: "go",
        java: "java",
        kt: "kotlin",
        kts: "kotlin",
        cs: "csharp",
        php: "php",
        rb: "ruby",
        swift: "swift",

        // C/C++
        c: "c",
        h: "c",
        cc: "cpp",
        cpp: "cpp",
        cxx: "cpp",
        hpp: "cpp",
        hxx: "cpp",

        // Shell
        sh: "shell",
        bash: "shell",
        zsh: "shell",
        fish: "shell",
        ps1: "powershell",

        // DB
        sql: "sql",

        // Misc
        graphql: "graphql",
        gql: "graphql",
        proto: "protobuf",
        log: "plaintext",
        txt: "plaintext",
    };

    return map[ext] || "plaintext";
}

const activeLanguage = computed(() =>
    activeFilePath.value ? languageFromPath(activeFilePath.value) : "plaintext",
);

async function openFile(node: TreeNode) {
    if (node.isDir) {
        await toggleDir(node);
        return;
    }

    if (activeFilePath.value === node.path) return;

    if (isDirty.value) {
        try {
            await ElMessageBox.confirm(
                "当前文件有未保存的修改，确定要切换文件吗？",
                "提示",
                {
                    type: "warning",
                    confirmButtonText: "切换",
                    cancelButtonText: "取消",
                },
            );
        } catch {
            return;
        }
    }

    fileLoadError.value = null;
    try {
        const content = await readTextFile(node.path);
        activeFilePath.value = node.path;
        editorValue.value = content ?? "";
        lastSavedValue.value = content ?? "";
    } catch (e: any) {
        fileLoadError.value =
            e instanceof Error
                ? e.message
                : typeof e === "string"
                  ? e
                  : "读取文件失败";
    }
}

async function saveActiveFile() {
    if (!activeFilePath.value) return;
    if (fileSaving.value) return;

    fileSaving.value = true;
    try {
        await writeTextFile(activeFilePath.value, editorValue.value);
        lastSavedValue.value = editorValue.value;
    } catch (e: any) {
        const msg =
            e instanceof Error
                ? e.message
                : typeof e === "string"
                  ? e
                  : "保存失败";
        ElMessage.error(msg);
    } finally {
        fileSaving.value = false;
    }
}

function applyPathReplace(oldBase: string, newBase: string, p: string) {
    const oldN = normalizePathForCompare(oldBase);
    const pN = normalizePathForCompare(p);
    if (!oldN || !pN) return p;
    if (pN === oldN) return newBase;
    if (!pN.startsWith(oldN.endsWith("/") ? oldN : oldN + "/")) return p;

    // 保留原始路径的剩余部分（使用原字符串切片，避免破坏分隔符风格）
    // 这里用旧 base 的长度做切分：旧 base 可能是 \，但 normalize 后长度不同。
    // 所以用“按原字符串”前缀判断：再做一次更保守的替换。
    if (p.startsWith(oldBase)) return newBase + p.slice(oldBase.length);
    const oldAlt = oldBase.includes("\\")
        ? oldBase.replace(/\\/g, "/")
        : oldBase.replace(/\//g, "\\");
    if (p.startsWith(oldAlt)) return newBase + p.slice(oldAlt.length);
    return p;
}

function updateActivePathAfterRenameOrMove(oldPath: string, newPath: string) {
    if (!activeFilePath.value) return;
    const updated = applyPathReplace(oldPath, newPath, activeFilePath.value);
    if (updated !== activeFilePath.value) {
        activeFilePath.value = updated;
    }
}

function updateExpandedAfterRenameOrMove(oldPath: string, newPath: string) {
    const next = new Set<string>();
    for (const p of expandedDirs.value) {
        const updated = applyPathReplace(oldPath, newPath, p);
        next.add(updated);
    }
    expandedDirs.value = next;
}

function maybeClearOpenFileIfRemoved(removedPath: string) {
    if (!activeFilePath.value) return;
    if (isDescendantPath(removedPath, activeFilePath.value)) {
        activeFilePath.value = null;
        editorValue.value = "";
        lastSavedValue.value = "";
        fileLoadError.value = null;
    }
}

async function revealInExplorer(path: string, isDir: boolean) {
    // Vite 浏览器预览下无法调用系统资源管理器
    if (!(window as any).__TAURI_INTERNALS__) {
        ElMessage.warning("浏览器预览模式不支持打开资源管理器");
        return;
    }

    // 使用 plugin-shell 的 Command（需要在 capabilities 里 allow-spawn 对应程序）
    try {
        const { Command } = await import("@tauri-apps/plugin-shell");

        const ua = navigator.userAgent || "";
        const platform = /Windows/i.test(ua)
            ? "windows"
            : /Mac OS|Macintosh/i.test(ua)
              ? "macos"
              : /Linux/i.test(ua)
                ? "linux"
                : "";

        if (platform === "windows") {
            if (isDir) {
                await Command.create("explorer.exe", [path]).spawn();
            } else {
                await Command.create("explorer.exe", [
                    `/select,${path}`,
                ]).spawn();
            }
            return;
        }

        // macOS: open -R
        if (platform === "macos") {
            if (isDir) {
                await Command.create("open", [path]).spawn();
            } else {
                await Command.create("open", ["-R", path]).spawn();
            }
            return;
        }

        // linux / others: xdg-open folder
        const folder = isDir ? path : dirname(path);
        if (folder) {
            await Command.create("xdg-open", [folder]).spawn();
            return;
        }
    } catch (e) {
        // 这里不再降级到 plugin-opener：opener 会拒绝本地路径（会报 Not allowed to open url）
        console.log(e);
        ElMessage.error(
            "打开资源管理器失败：请检查 Tauri capabilities 是否允许 shell spawn（explorer.exe/open/xdg-open）",
        );
    }
}

async function createFileInDir(dirPath: string, name: string) {
    if (!dirPath) return;
    const filePath = joinPath(dirPath, name);
    if (await exists(filePath)) {
        ElMessage.warning("同名文件已存在");
        return;
    }
    try {
        await writeTextFile(filePath, "", { create: true });
        await loadDir(dirPath, true);
        await openFile({ name, path: filePath, isDir: false });
    } catch (e: any) {
        const msg =
            e instanceof Error
                ? e.message
                : typeof e === "string"
                  ? e
                  : "新建文件失败";
        ElMessage.error(msg);
    }
}

async function createFolderInDir(dirPath: string, name: string) {
    if (!dirPath) return;
    const folderPath = joinPath(dirPath, name);
    if (await exists(folderPath)) {
        ElMessage.warning("同名文件夹已存在");
        return;
    }
    try {
        await mkdir(folderPath);
        await loadDir(dirPath, true);
        expandedDirs.value = new Set(expandedDirs.value).add(folderPath);
        await loadDir(folderPath, true);
    } catch (e: any) {
        const msg =
            e instanceof Error
                ? e.message
                : typeof e === "string"
                  ? e
                  : "新建文件夹失败";
        ElMessage.error(msg);
    }
}

async function deletePath(path: string, isDir: boolean) {
    try {
        // 如果删除的是当前文件且有未保存修改，先确认
        if (
            activeFilePath.value &&
            isDescendantPath(path, activeFilePath.value) &&
            isDirty.value
        ) {
            await ElMessageBox.confirm(
                "当前打开的文件有未保存修改，仍然要删除吗？",
                "提示",
                {
                    type: "warning",
                    confirmButtonText: "继续删除",
                    cancelButtonText: "取消",
                },
            );
        }

        await remove(path, { recursive: isDir });
        maybeClearOpenFileIfRemoved(path);

        // 收起/清理展开状态
        if (isDir) {
            const next = new Set<string>();
            for (const p of expandedDirs.value) {
                if (!isDescendantPath(path, p)) next.add(p);
            }
            expandedDirs.value = next;
        }

        // 为保证 childrenByPath key 一致性，结构性变更后直接重载
        await reloadWorkspaceTree();
    } catch (e: any) {
        const msg =
            e instanceof Error
                ? e.message
                : typeof e === "string"
                  ? e
                  : "删除失败";
        ElMessage.error(msg);
    }
}

async function renamePath(path: string, newName: string) {
    const parent = dirname(path);
    if (!parent) return;
    const newPath = joinPath(parent, newName);
    if (await exists(newPath)) {
        ElMessage.warning("目标名称已存在");
        return;
    }

    try {
        await rename(path, newPath);
        updateActivePathAfterRenameOrMove(path, newPath);
        updateExpandedAfterRenameOrMove(path, newPath);
        await reloadWorkspaceTree();
    } catch (e: any) {
        const msg =
            e instanceof Error
                ? e.message
                : typeof e === "string"
                  ? e
                  : "重命名失败";
        ElMessage.error(msg);
    }
}

async function movePath(srcPath: string, destDirPath: string) {
    if (!srcPath || !destDirPath) return;
    const name = basename(srcPath);
    const destPath = joinPath(destDirPath, name);

    if (normalizePathForCompare(srcPath) === normalizePathForCompare(destPath))
        return;

    // 禁止把文件夹拖进自己/子目录
    if (isDescendantPath(srcPath, destDirPath)) {
        ElMessage.warning("不能移动到自身或其子目录");
        return;
    }

    if (await exists(destPath)) {
        ElMessage.warning("目标位置已存在同名项");
        return;
    }

    try {
        await rename(srcPath, destPath);
        updateActivePathAfterRenameOrMove(srcPath, destPath);
        updateExpandedAfterRenameOrMove(srcPath, destPath);
        await reloadWorkspaceTree();
    } catch (e: any) {
        const msg =
            e instanceof Error
                ? e.message
                : typeof e === "string"
                  ? e
                  : "移动失败";
        ElMessage.error(msg);
    }
}

watch(activeFilePath, (path) => {
    if (path) {
        void storeUtils.set("last_open_file", path);
    }
});

function updateEditorValue(v: string) {
    editorValue.value = v;
}

async function tryOpenDefaultFile(root: string) {
    // 1. Last opened
    try {
        const lastFile = await storeUtils.get<string>("last_open_file");
        if (lastFile && lastFile.startsWith(root) && (await exists(lastFile))) {
            await openFile({ name: "", path: lastFile, isDir: false });
            return;
        }
    } catch {}

    // 2. Index / Readme
    // We rely on childrenByPath[root] being populated.
    const nodes = childrenByPath.value[root] || [];
    const candidates = [
        /^readme\.md$/i,
        /^index\.(ts|js|html|vue)$/i,
        /^main\.(ts|js|rs|go|py)$/i,
        /^cargo\.toml$/i,
        /^package\.json$/i,
    ];

    for (const pattern of candidates) {
        const found = nodes.find((n) => !n.isDir && pattern.test(n.name));
        if (found) {
            await openFile(found);
            return;
        }
    }
}

async function createWorkspace() {
    if (isDirty.value) {
        try {
            await ElMessageBox.confirm(
                "当前文件有未保存的修改，确定要切换工作区吗？",
                "提示",
                {
                    type: "warning",
                    confirmButtonText: "切换",
                    cancelButtonText: "取消",
                },
            );
        } catch {
            return;
        }
    }

    const selected = await open({
        directory: true,
        multiple: false,
        title: "选择工作区文件夹",
    });

    if (!selected) return;
    if (Array.isArray(selected)) {
        workspaceRoot.value = selected[0] ?? null;
    } else {
        workspaceRoot.value = selected;
    }

    childrenByPath.value = {};
    expandedDirs.value = new Set();
    activeFilePath.value = null;
    editorValue.value = "";
    lastSavedValue.value = "";
    fileLoadError.value = null;
    dirLoadError.value = null;
    if (workspaceRoot.value) {
        expandedDirs.value = new Set([workspaceRoot.value]);
        await loadDir(workspaceRoot.value);
        await storeUtils.set("workspace_root", workspaceRoot.value);
        await tryOpenDefaultFile(workspaceRoot.value);
    }
}

async function openLastWorkspaceIfAny() {
    const savedRoot = await storeUtils.get<string>("workspace_root");
    if (!savedRoot) return false;
    workspaceRoot.value = savedRoot;
    childrenByPath.value = {};
    expandedDirs.value = new Set([savedRoot]);
    dirLoadError.value = null;
    try {
        await loadDir(savedRoot);
        await tryOpenDefaultFile(savedRoot);
        return true;
    } catch {
        // 兜底：路径失效时清理（onMounted 也会处理）
        workspaceRoot.value = null;
        childrenByPath.value = {};
        expandedDirs.value = new Set();
        await storeUtils.delete("workspace_root");
        dirLoadError.value = "上次的工作区文件夹不可用，请重新选择。";
        return false;
    }
}

async function reloadWorkspaceTree() {
    const root = workspaceRoot.value;
    if (!root) return;
    dirLoadError.value = null;
    try {
        // 保留展开状态，但确保根目录在展开集合中
        if (!expandedDirs.value.has(root)) {
            expandedDirs.value = new Set(expandedDirs.value).add(root);
        }

        await loadDir(root);
        for (const dir of expandedDirs.value) {
            if (dir === root) continue;
            await loadDir(dir, true);
        }
    } catch (e: any) {
        dirLoadError.value =
            e instanceof Error
                ? e.message
                : typeof e === "string"
                  ? e
                  : "读取目录失败";
    }
}

function clearWorkspace() {
    workspaceRoot.value = null;
    childrenByPath.value = {};
    expandedDirs.value = new Set();
    dirLoadError.value = null;
    activeFilePath.value = null;
    editorValue.value = "";
    lastSavedValue.value = "";
    fileLoadError.value = null;
    void storeUtils.delete("workspace_root");
}

onMounted(async () => {
    // 恢复布局（与具体 workspaceRoot 无关，作为全局偏好）
    try {
        const layout =
            await storeUtils.get<WorkspaceLayoutState>(WORKSPACE_LAYOUT_KEY);
        if (layout) clampLayout(layout);
    } catch {
        // ignore
    }

    const savedRoot = await storeUtils.get<string>("workspace_root");
    if (!savedRoot) return;
    workspaceRoot.value = savedRoot;
    childrenByPath.value = {};
    expandedDirs.value = new Set([savedRoot]);
    await tryOpenDefaultFile(savedRoot);
    try {
        await loadDir(savedRoot);
    } catch {
        // 路径可能已不存在或无权限，清理并让用户重新选择
        workspaceRoot.value = null;
        childrenByPath.value = {};
        expandedDirs.value = new Set();
        await storeUtils.delete("workspace_root");
        dirLoadError.value = "上次的工作区文件夹不可用，请重新选择。";
    }
});

const route = useRoute();
const router = useRouter();

function clearPickQuery() {
    const { pick, ...rest } = route.query as Record<string, any>;
    void router.replace({ path: route.path, query: rest });
}

watch(
    () => route.query.pick,
    async (v) => {
        if (!v) return;
        // 外部可能通过 query.pick 触发“打开工作区”。
        // 需求：首次弹窗选择；后续默认打开上次目录，不再重复弹窗。
        const opened = await openLastWorkspaceIfAny();
        if (!opened) {
            await createWorkspace();
        }
        clearPickQuery();
    },
    { immediate: true },
);
</script>

<template>
    <div
        class="flex flex-col h-[calc(100vh-40px)] overflow-hidden bg-background text-foreground"
    >
        <div class="flex flex-1 overflow-hidden">
            <!-- 左侧：工作区文件树 -->
            <aside
                class="shrink-0 border-r bg-sidebar flex flex-col"
                :style="{ width: leftPaneWidth + 'px' }"
            >
                <div
                    class="h-10 px-3 border-b flex items-center justify-between bg-sidebar-accent/50"
                >
                    <DropdownMenu>
                        <DropdownMenuTrigger as-child>
                            <Button
                                variant="ghost"
                                size="sm"
                                class="-ml-2 h-8 gap-2 px-2 text-sidebar-foreground/80 hover:text-sidebar-foreground"
                            >
                                <FolderOpen class="w-4 h-4" />
                                <span class="truncate font-medium">工作区</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent class="w-48" align="start">
                            <DropdownMenuGroup>
                                <DropdownMenuItem @click="createWorkspace">
                                    <Plus class="w-4 h-4 mr-2" />
                                    选择文件夹
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    :disabled="!workspaceRoot"
                                    @click="reloadWorkspaceTree"
                                >
                                    <RefreshCcw class="w-4 h-4 mr-2" />
                                    刷新目录
                                </DropdownMenuItem>
                            </DropdownMenuGroup>

                            <DropdownMenuSeparator />

                            <DropdownMenuGroup>
                                <DropdownMenuItem
                                    :disabled="!workspaceRoot"
                                    @click="clearWorkspace"
                                >
                                    <Trash2 class="w-4 h-4 mr-2" />
                                    清空工作区
                                </DropdownMenuItem>
                            </DropdownMenuGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <div
                        class="text-xs text-muted-foreground truncate max-w-[120px]"
                        :title="workspaceRoot || ''"
                    >
                        {{
                            workspaceRoot
                                ? workspaceRoot.split(/[\\/]/).pop()
                                : "未选择"
                        }}
                    </div>
                </div>

                <div
                    v-if="!workspaceRoot"
                    class="p-4 flex flex-col items-center justify-center h-40 text-center"
                >
                    <div class="text-sm font-medium text-foreground">
                        未打开工作区
                    </div>
                    <div class="mt-2 text-xs text-muted-foreground w-3/4">
                        点击上方按钮选择文件夹，之后会自动记住位置。
                    </div>
                    <Button
                        size="sm"
                        variant="outline"
                        class="mt-4"
                        @click="createWorkspace"
                    >
                        打开文件夹
                    </Button>
                </div>

                <div class="flex-1 overflow-auto p-2">
                    <div
                        v-if="dirLoadError"
                        class="p-2 text-sm text-destructive bg-destructive/10 rounded-md m-2"
                    >
                        {{ dirLoadError }}
                    </div>

                    <div v-else-if="workspaceRoot" class="space-y-0.5">
                        <FileTree
                            :nodes="rootNodes"
                            :expanded="expandedDirs"
                            :children-by-path="childrenByPath"
                            :loading="loadingDirs"
                            :selected-path="activeFilePath"
                            :get-node-icon="getNodeIcon"
                            :on-select="openFile"
                            :on-create-file="createFileInDir"
                            :on-create-folder="createFolderInDir"
                            :on-reveal-in-explorer="revealInExplorer"
                            :on-delete="deletePath"
                            :on-rename="renamePath"
                            :on-move="movePath"
                        />
                    </div>
                </div>
            </aside>

            <!-- 竖向拖拽条（左/中） -->
            <div
                class="w-1 shrink-0 cursor-col-resize bg-border/50 hover:bg-border"
                @mousedown="startDrag('left', $event)"
            />

            <!-- 中间：编辑器 + 控制台 -->
            <main
                class="flex-1 min-w-0 flex flex-col overflow-hidden bg-background"
            >
                <div
                    class="h-10 px-4 border-b flex items-center gap-3 bg-background/50 backdrop-blur-sm z-10"
                >
                    <div class="min-w-0 flex-1 flex items-center gap-2">
                        <span class="text-sm font-medium truncate">
                            {{
                                activeFilePath
                                    ? activeFilePath.split(/[\\/]/).pop()
                                    : "无文件"
                            }}
                        </span>
                        <span
                            v-if="activeFilePath && isDirty"
                            class="w-2 h-2 rounded-full bg-yellow-500"
                            title="未保存"
                        ></span>
                        <span
                            v-if="activeFilePath"
                            class="text-xs text-muted-foreground/50 border px-1.5 rounded-sm uppercase tracking-wider scale-90 origin-left"
                        >
                            {{ activeLanguage }}
                        </span>
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger as-child>
                            <Button
                                size="sm"
                                variant="ghost"
                                class="h-8 w-8 p-0"
                            >
                                <MoreHorizontal class="w-4 h-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                                <DropdownMenuItem
                                    :disabled="
                                        !activeFilePath ||
                                        !isDirty ||
                                        fileSaving
                                    "
                                    @click="saveActiveFile"
                                >
                                    <Save class="w-4 h-4 mr-2" />
                                    保存 (Ctrl+S)
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    @click="consoleVisible = !consoleVisible"
                                >
                                    {{
                                        consoleVisible
                                            ? "隐藏控制台"
                                            : "显示控制台"
                                    }}
                                </DropdownMenuItem>
                            </DropdownMenuGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuGroup>
                                <DropdownMenuItem @click="createWorkspace">
                                    <Plus class="w-4 h-4 mr-2" />
                                    选择文件夹
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    :disabled="!workspaceRoot"
                                    @click="reloadWorkspaceTree"
                                >
                                    <RefreshCcw class="w-4 h-4 mr-2" />
                                    刷新目录
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    :disabled="!workspaceRoot"
                                    @click="clearWorkspace"
                                >
                                    <Trash2 class="w-4 h-4 mr-2" />
                                    清空工作区
                                </DropdownMenuItem>
                            </DropdownMenuGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                <div v-if="fileLoadError" class="p-3 text-sm text-destructive">
                    {{ fileLoadError }}
                </div>

                <div
                    class="flex-1 min-h-0 flex flex-col overflow-hidden relative"
                >
                    <div class="absolute inset-0 flex flex-col">
                        <div class="flex-1 min-h-0">
                            <div
                                v-if="!activeFilePath"
                                class="h-full flex flex-col items-center justify-center text-muted-foreground"
                            >
                                <div
                                    class="w-16 h-16 rounded-xl bg-muted/40 flex items-center justify-center mb-4"
                                >
                                    <FileText class="w-8 h-8 opacity-50" />
                                </div>
                                <div class="text-sm">选择左侧文件以编辑</div>
                            </div>
                            <MonacoEditorPane
                                v-else
                                :value="editorValue"
                                :language="activeLanguage"
                                :theme="editorTheme"
                                @update:value="updateEditorValue"
                                @save="saveActiveFile"
                            />
                        </div>

                        <template v-if="consoleVisible">
                            <!-- 横向拖拽条（编辑器/控制台） -->
                            <div
                                class="h-1 cursor-row-resize bg-border/20 hover:bg-primary/50 transition-colors z-10"
                                @mousedown="startDrag('console', $event)"
                            />

                            <div
                                class="shrink-0 border-t bg-black"
                                :style="{ height: consoleHeight + 'px' }"
                            >
                                <WorkspaceConsolePanel :cwd="workspaceRoot" />
                            </div>
                        </template>
                    </div>
                </div>
            </main>

            <!-- 竖向拖拽条（中/右） -->
            <div
                class="w-1 shrink-0 cursor-col-resize bg-border/20 hover:bg-primary/50 transition-colors z-10"
                @mousedown="startDrag('right', $event)"
            />

            <!-- 右侧：AI 会话 -->
            <aside
                class="shrink-0 border-l bg-muted/10"
                :style="{ width: rightPaneWidth + 'px' }"
            >
                <WorkspaceAiSession :workspace-root="workspaceRoot" />
            </aside>
        </div>
    </div>
</template>
