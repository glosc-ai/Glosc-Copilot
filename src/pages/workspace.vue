<script setup lang="ts">
import { Button } from "@/components/ui/button";

import AiSessionPlaceholder from "@/components/workspace/AiSessionPlaceholder.vue";
import MonacoEditorPane from "@/components/workspace/MonacoEditorPane.vue";
import WorkspaceTreeItem from "@/components/workspace/WorkspaceTreeItem.vue";

import { open } from "@tauri-apps/plugin-dialog";
import { readDir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

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

async function loadDir(dirPath: string) {
    if (loadingDirs.value.has(dirPath)) return;

    dirLoadError.value = null;
    loadingDirs.value = new Set(loadingDirs.value).add(dirPath);
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
                    (Array.isArray(e?.children) && e.children.length >= 0)
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
        dirLoadError.value =
            e instanceof Error
                ? e.message
                : typeof e === "string"
                  ? e
                  : "读取目录失败";
    } finally {
        const next = new Set(loadingDirs.value);
        next.delete(dirPath);
        loadingDirs.value = next;
    }
}

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
    const lower = filePath.toLowerCase();
    if (lower.endsWith(".ts")) return "typescript";
    if (lower.endsWith(".tsx")) return "typescript";
    if (lower.endsWith(".js")) return "javascript";
    if (lower.endsWith(".jsx")) return "javascript";
    if (lower.endsWith(".vue")) return "html";
    if (lower.endsWith(".json")) return "json";
    if (lower.endsWith(".css")) return "css";
    if (lower.endsWith(".scss")) return "scss";
    if (lower.endsWith(".less")) return "less";
    if (lower.endsWith(".md")) return "markdown";
    if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "yaml";
    if (lower.endsWith(".rs")) return "rust";
    return "plaintext";
}

const activeLanguage = computed(() =>
    activeFilePath.value ? languageFromPath(activeFilePath.value) : "plaintext"
);

async function openFile(node: TreeNode) {
    if (node.isDir) {
        await toggleDir(node);
        return;
    }

    if (isDirty.value) {
        const ok = window.confirm("当前文件有未保存的修改，确定要切换文件吗？");
        if (!ok) return;
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
        window.alert(msg);
    } finally {
        fileSaving.value = false;
    }
}

function updateEditorValue(v: string) {
    editorValue.value = v;
}

async function createWorkspace() {
    if (isDirty.value) {
        const ok = window.confirm(
            "当前文件有未保存的修改，确定要切换工作区吗？"
        );
        if (!ok) return;
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
    const savedRoot = await storeUtils.get<string>("workspace_root");
    if (!savedRoot) return;
    workspaceRoot.value = savedRoot;
    childrenByPath.value = {};
    expandedDirs.value = new Set([savedRoot]);
    try {
        await loadDir(savedRoot);
    } catch {
        // ignore
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
        await createWorkspace();
        clearPickQuery();
    },
    { immediate: true }
);
</script>

<template>
    <div
        class="flex flex-col h-[calc(100vh-40px)] overflow-hidden bg-background text-foreground"
    >
        <div class="flex flex-1 overflow-hidden">
            <!-- 左侧：工作区文件树 -->
            <aside class="w-72 shrink-0 border-r bg-muted/10">
                <div class="p-3 border-b flex items-center gap-2">
                    <Button size="sm" class="gap-2" @click="createWorkspace">
                        <Plus class="w-4 h-4" />
                        选择文件夹
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        class="gap-2"
                        :disabled="!workspaceRoot"
                        @click="clearWorkspace"
                    >
                        <Trash2 class="w-4 h-4" />
                        清空
                    </Button>
                </div>

                <div class="p-3 border-b">
                    <div class="text-xs text-muted-foreground">当前工作区</div>
                    <div class="mt-1 text-sm break-all">
                        {{ workspaceRoot || "未选择" }}
                    </div>
                </div>

                <div class="flex-1 overflow-auto p-2">
                    <div
                        v-if="!workspaceRoot"
                        class="p-2 text-sm text-muted-foreground"
                    >
                        请选择一个文件夹作为工作区。
                    </div>

                    <div
                        v-else-if="dirLoadError"
                        class="p-2 text-sm text-destructive"
                    >
                        {{ dirLoadError }}
                    </div>

                    <div v-else class="space-y-1">
                        <WorkspaceTreeItem
                            v-for="node in rootNodes"
                            :key="node.path"
                            :node="node"
                            :depth="0"
                            :expanded-dirs="expandedDirs"
                            :children-by-path="childrenByPath"
                            :loading-dirs="loadingDirs"
                            :active-file-path="activeFilePath"
                            :get-node-icon="getNodeIcon"
                            :on-select="openFile"
                        />
                    </div>
                </div>
            </aside>

            <!-- 中间：编辑器 -->
            <main class="flex-1 min-w-0 flex flex-col">
                <div class="px-4 py-2 border-b flex items-center gap-2">
                    <div class="min-w-0 flex-1">
                        <div class="text-sm font-medium truncate">
                            {{ activeFilePath || "未打开文件" }}
                            <span v-if="isDirty" class="text-muted-foreground"
                                >（未保存）</span
                            >
                        </div>
                        <div class="text-xs text-muted-foreground">
                            {{ activeLanguage }}
                        </div>
                    </div>
                    <Button
                        size="sm"
                        class="gap-2"
                        :disabled="!activeFilePath || !isDirty || fileSaving"
                        @click="saveActiveFile"
                    >
                        <Save class="w-4 h-4" />
                        保存 (Ctrl+S)
                    </Button>
                </div>

                <div v-if="fileLoadError" class="p-3 text-sm text-destructive">
                    {{ fileLoadError }}
                </div>

                <div class="flex-1 min-h-0">
                    <MonacoEditorPane
                        :value="editorValue"
                        :language="activeLanguage"
                        @update:value="updateEditorValue"
                        @save="saveActiveFile"
                    />
                </div>
            </main>

            <!-- 右侧：AI 会话（占位） -->
            <aside class="w-80 shrink-0 border-l bg-muted/10">
                <AiSessionPlaceholder />
            </aside>
        </div>
    </div>
</template>
