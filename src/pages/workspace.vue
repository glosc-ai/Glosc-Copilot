<script setup lang="ts">
import ChatArea from "@/components/ChatArea.vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { open } from "@tauri-apps/plugin-dialog";
import { readDir } from "@tauri-apps/plugin-fs";
import { Command, type Child } from "@tauri-apps/plugin-shell";

import {
    ChevronDown,
    ChevronRight,
    FileText,
    Folder,
    Plus,
    Terminal,
    Trash2,
} from "lucide-vue-next";

type TreeNode = {
    name: string;
    path: string;
    isDir: boolean;
};

const workspaceRoot = ref<string | null>(null);
const taskModeEnabled = ref(false);

const expandedDirs = ref<Set<string>>(new Set());
const childrenByPath = ref<Record<string, TreeNode[]>>({});
const loadingDirs = ref<Set<string>>(new Set());
const dirLoadError = ref<string | null>(null);

const isDirLoading = (dirPath: string) => loadingDirs.value.has(dirPath);
const isDirExpanded = (dirPath: string) => expandedDirs.value.has(dirPath);

async function loadDir(dirPath: string) {
    if (loadingDirs.value.has(dirPath)) return;

    dirLoadError.value = null;
    loadingDirs.value = new Set(loadingDirs.value).add(dirPath);
    try {
        const entries = await readDir(dirPath);
        const nodes: TreeNode[] = (entries || [])
            .map((e: any) => {
                const name = e?.name ?? "";
                const path = e?.path ?? (name ? `${dirPath}/${name}` : dirPath);
                const isDir = Boolean(e?.isDir);
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

type FlattenedNode = {
    node: TreeNode;
    depth: number;
};

function flatten(nodes: TreeNode[], depth: number): FlattenedNode[] {
    const result: FlattenedNode[] = [];
    for (const node of nodes) {
        result.push({ node, depth });
        if (node.isDir && expandedDirs.value.has(node.path)) {
            const children = childrenByPath.value[node.path] || [];
            result.push(...flatten(children, depth + 1));
        }
    }
    return result;
}

const flattenedNodes = computed<FlattenedNode[]>(() => {
    if (!workspaceRoot.value) return [];
    const rootChildren = childrenByPath.value[workspaceRoot.value] || [];
    return flatten(rootChildren, 0);
});

async function createWorkspace() {
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
    if (workspaceRoot.value) {
        expandedDirs.value = new Set([workspaceRoot.value]);
        await loadDir(workspaceRoot.value);
        await restartTerminal();
    }
}

function clearWorkspace() {
    workspaceRoot.value = null;
    childrenByPath.value = {};
    expandedDirs.value = new Set();
    dirLoadError.value = null;
    stopTerminal();
}

// ===== 终端（简易） =====
const terminalChild = shallowRef<Child | null>(null);
const terminalLog = ref<string[]>([]);
const terminalInput = ref<string>("");
const terminalStarting = ref(false);

function appendTerminal(text: string) {
    if (!text) return;
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    terminalLog.value = [...terminalLog.value, ...lines];
}

function stopTerminal() {
    const child = terminalChild.value;
    terminalChild.value = null;
    if (child) {
        void child.kill();
    }
}

async function startTerminal() {
    if (!workspaceRoot.value) return;
    if (terminalChild.value || terminalStarting.value) return;

    terminalStarting.value = true;
    try {
        const candidates: Array<{ cmd: string; args: string[] }> = [
            { cmd: "pwsh", args: ["-NoLogo", "-NoExit", "-Command", "-"] },
            {
                cmd: "powershell",
                args: ["-NoLogo", "-NoExit", "-Command", "-"],
            },
            { cmd: "cmd", args: ["/Q", "/K"] },
        ];

        let lastError: unknown = null;
        for (const candidate of candidates) {
            try {
                const cmd = Command.create(candidate.cmd, candidate.args, {
                    cwd: workspaceRoot.value,
                });

                cmd.stdout.on("data", (chunk: any) => {
                    appendTerminal(String(chunk));
                });
                cmd.stderr.on("data", (chunk: any) => {
                    appendTerminal(String(chunk));
                });
                cmd.on("close", () => {
                    appendTerminal("\n[terminal] 已退出");
                    terminalChild.value = null;
                });

                terminalChild.value = await cmd.spawn();
                appendTerminal(`[terminal] 已启动: ${candidate.cmd}`);
                lastError = null;
                break;
            } catch (e) {
                lastError = e;
            }
        }

        if (!terminalChild.value && lastError) {
            appendTerminal(
                "[terminal] 启动失败：" +
                    (lastError instanceof Error
                        ? lastError.message
                        : String(lastError))
            );
        }
    } finally {
        terminalStarting.value = false;
    }
}

async function restartTerminal() {
    stopTerminal();
    terminalLog.value = [];
    terminalInput.value = "";
    await startTerminal();
}

async function runTerminalCommand() {
    const cmd = terminalInput.value.trim();
    if (!cmd) return;
    if (!terminalChild.value) {
        await startTerminal();
        if (!terminalChild.value) return;
    }

    appendTerminal(`> ${cmd}`);
    terminalInput.value = "";
    try {
        await terminalChild.value.write(cmd + "\r\n");
    } catch (e: any) {
        appendTerminal(
            "[terminal] 写入失败：" +
                (e instanceof Error ? e.message : String(e))
        );
    }
}

function clearTerminalLog() {
    terminalLog.value = [];
}

onBeforeUnmount(() => {
    stopTerminal();
});

const chatApiPath = computed(() =>
    taskModeEnabled.value ? "/api/agent" : "/api/chat"
);
</script>

<template>
    <div
        class="flex flex-col h-[calc(100vh-40px)] overflow-hidden bg-background text-foreground"
    >
        <div class="flex flex-1 overflow-hidden">
            <!-- 左侧：文件/文件夹列表 -->
            <aside class="w-72 shrink-0 border-r bg-muted/10">
                <div class="p-3 border-b flex items-center gap-2">
                    <Button size="sm" class="gap-2" @click="createWorkspace">
                        <Plus class="w-4 h-4" />
                        新建工作区
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
                        请先点击“新建工作区”选择文件夹。
                    </div>

                    <div
                        v-else-if="dirLoadError"
                        class="p-2 text-sm text-destructive"
                    >
                        {{ dirLoadError }}
                    </div>

                    <div v-else class="space-y-1">
                        <div
                            v-for="item in flattenedNodes"
                            :key="item.node.path"
                            class="flex items-center gap-1 rounded px-2 py-1 text-sm hover:bg-accent/40 cursor-pointer"
                            :style="{ paddingLeft: `${8 + item.depth * 14}px` }"
                            @click="toggleDir(item.node)"
                        >
                            <span class="w-4 inline-flex justify-center">
                                <template v-if="item.node.isDir">
                                    <ChevronDown
                                        v-if="isDirExpanded(item.node.path)"
                                        class="w-4 h-4 text-muted-foreground"
                                    />
                                    <ChevronRight
                                        v-else
                                        class="w-4 h-4 text-muted-foreground"
                                    />
                                </template>
                                <span v-else class="w-4"></span>
                            </span>

                            <Folder
                                v-if="item.node.isDir"
                                class="w-4 h-4 text-muted-foreground"
                            />
                            <FileText
                                v-else
                                class="w-4 h-4 text-muted-foreground"
                            />

                            <span class="truncate">{{ item.node.name }}</span>

                            <span
                                v-if="
                                    item.node.isDir &&
                                    isDirLoading(item.node.path)
                                "
                                class="ml-auto text-xs text-muted-foreground"
                            >
                                读取中…
                            </span>
                        </div>
                    </div>
                </div>
            </aside>

            <!-- 右侧：上对话 / 下终端 -->
            <main class="flex-1 min-w-0">
                <div
                    class="h-full grid grid-rows-[minmax(0,1fr)_minmax(0,260px)]"
                >
                    <section class="min-h-0 border-b">
                        <div class="px-4 py-2 border-b flex items-center gap-2">
                            <span class="text-sm font-medium">对话</span>
                            <Button
                                size="sm"
                                variant="outline"
                                class="ml-auto"
                                :class="cn(taskModeEnabled ? 'bg-accent' : '')"
                                @click="taskModeEnabled = !taskModeEnabled"
                            >
                                {{
                                    taskModeEnabled
                                        ? "任务模式：开 (/api/agent)"
                                        : "任务模式：关 (/api/chat)"
                                }}
                            </Button>
                        </div>
                        <div class="h-[calc(100%-41px)]">
                            <ChatArea
                                :key="chatApiPath"
                                :api-path="chatApiPath"
                            />
                        </div>
                    </section>

                    <section class="min-h-0">
                        <div class="px-4 py-2 border-b flex items-center gap-2">
                            <Terminal class="w-4 h-4 text-muted-foreground" />
                            <span class="text-sm font-medium">终端</span>
                            <Button
                                size="sm"
                                variant="outline"
                                class="ml-auto"
                                :disabled="!workspaceRoot"
                                @click="restartTerminal"
                            >
                                重启
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                @click="clearTerminalLog"
                            >
                                清屏
                            </Button>
                        </div>

                        <div class="h-[calc(100%-41px)] flex flex-col">
                            <div
                                class="flex-1 overflow-auto p-3 font-mono text-xs whitespace-pre-wrap"
                            >
                                <div
                                    v-if="terminalLog.length === 0"
                                    class="text-muted-foreground"
                                >
                                    {{
                                        workspaceRoot
                                            ? "终端未输出。输入命令并回车。"
                                            : "未选择工作区，无法启动终端。"
                                    }}
                                </div>
                                <div
                                    v-for="(line, idx) in terminalLog"
                                    :key="idx"
                                >
                                    {{ line }}
                                </div>
                            </div>

                            <div class="border-t p-2 flex items-center gap-2">
                                <Input
                                    v-model="terminalInput"
                                    placeholder="输入命令，回车执行"
                                    :disabled="!workspaceRoot"
                                    @keydown.enter.prevent="runTerminalCommand"
                                />
                                <Button
                                    size="sm"
                                    :disabled="!workspaceRoot"
                                    @click="runTerminalCommand"
                                >
                                    运行
                                </Button>
                            </div>
                        </div>
                    </section>
                </div>
            </main>
        </div>
    </div>
</template>
