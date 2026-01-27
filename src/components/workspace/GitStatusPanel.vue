<template>
    <div class="h-full flex flex-col bg-sidebar border-r">
        <div
            class="h-9 px-3 border-b flex items-center justify-between shrink-0"
        >
            <div class="flex items-center gap-2 text-sm font-medium">
                <GitBranch class="w-4 h-4 text-muted-foreground" />
                <span
                    class="truncate max-w-[120px]"
                    :title="currentBranch || 'N/A'"
                >
                    {{ currentBranch || "N/A" }}
                </span>
            </div>
            <Button
                size="icon"
                variant="ghost"
                class="h-6 w-6"
                @click="refreshStatus"
                title="刷新状态"
            >
                <RefreshCw
                    class="w-3.5 h-3.5"
                    :class="{ 'animate-spin': loading }"
                />
            </Button>
        </div>

        <div class="flex-1 overflow-y-auto p-2 space-y-4">
            <div
                v-if="error"
                class="flex items-center gap-2 text-destructive bg-destructive/10 p-2 rounded-md"
            >
                <AlertCircle class="w-4 h-4 shrink-0" />
                <span class="text-xs break-all">{{ error }}</span>
            </div>

            <div
                v-else-if="!hasChanges"
                class="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2"
            >
                <CheckCircle2 class="w-8 h-8 text-green-500/50" />
                <span class="text-xs">工作区是干净的</span>
            </div>

            <div v-else class="space-y-4">
                <!-- 暂存区文件 -->
                <div v-if="stagedFiles.length > 0" class="space-y-1">
                    <div class="flex items-center justify-between px-1 mb-1">
                        <span
                            class="text-xs font-semibold uppercase text-muted-foreground"
                        >
                            暂存 ({{ stagedFiles.length }})
                        </span>
                    </div>
                    <div class="space-y-0.5">
                        <div
                            v-for="file in stagedFiles"
                            :key="file.path"
                            class="group flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent/50 text-sm"
                        >
                            <component
                                :is="getStatusIcon(file.status)"
                                class="w-3.5 h-3.5 shrink-0"
                                :class="getStatusColor(file.status)"
                            />
                            <span
                                class="truncate flex-1 font-mono text-xs"
                                :title="file.path"
                                >{{ file.path }}</span
                            >
                            <div
                                class="opacity-0 group-hover:opacity-100 flex items-center gap-1"
                            >
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    class="h-5 w-5"
                                    title="查看差异"
                                    @click="viewDiff(file.path, true)"
                                >
                                    <Eye class="w-3 h-3" />
                                </Button>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    class="h-5 w-5"
                                    title="取消暂存"
                                    @click="unstageFile(file.path)"
                                    :disabled="loading"
                                >
                                    <Minus class="w-3 h-3" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 未暂存文件 -->
                <div v-if="unstagedFiles.length > 0" class="space-y-1">
                    <div
                        class="flex items-center justify-between px-1 mb-1 group/header"
                    >
                        <span
                            class="text-xs font-semibold uppercase text-muted-foreground"
                        >
                            更改 ({{ unstagedFiles.length }})
                        </span>
                        <Button
                            size="icon"
                            variant="ghost"
                            class="h-5 w-5 opacity-0 group-hover/header:opacity-100"
                            @click="stageAll"
                            :disabled="loading"
                            title="全部暂存"
                        >
                            <Plus class="w-3.5 h-3.5" />
                        </Button>
                    </div>
                    <div class="space-y-0.5">
                        <div
                            v-for="file in unstagedFiles"
                            :key="file.path"
                            class="group flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent/50 text-sm"
                        >
                            <component
                                :is="getStatusIcon(file.status)"
                                class="w-3.5 h-3.5 shrink-0"
                                :class="getStatusColor(file.status)"
                            />
                            <span
                                class="truncate flex-1 font-mono text-xs"
                                :title="file.path"
                                >{{ file.path }}</span
                            >
                            <div
                                class="opacity-0 group-hover:opacity-100 flex items-center gap-1"
                            >
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    class="h-5 w-5"
                                    title="查看差异"
                                    @click="viewDiff(file.path, false)"
                                >
                                    <Eye class="w-3 h-3" />
                                </Button>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    class="h-5 w-5"
                                    title="暂存更改"
                                    @click="stageFile(file.path)"
                                    :disabled="loading"
                                >
                                    <Plus class="w-3 h-3" />
                                </Button>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    class="h-5 w-5 hover:text-destructive"
                                    title="放弃更改"
                                    @click="discardFile(file.path)"
                                    :disabled="loading"
                                >
                                    <Reply class="w-3 h-3" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 未跟踪文件 -->
                <div v-if="untrackedFiles.length > 0" class="space-y-1">
                    <div class="flex items-center justify-between px-1 mb-1">
                        <span
                            class="text-xs font-semibold uppercase text-muted-foreground"
                        >
                            未跟踪 ({{ untrackedFiles.length }})
                        </span>
                    </div>
                    <div class="space-y-0.5">
                        <div
                            v-for="file in untrackedFiles"
                            :key="file"
                            class="group flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent/50 text-sm"
                        >
                            <HelpCircle
                                class="w-3.5 h-3.5 shrink-0 text-orange-500"
                            />
                            <span
                                class="truncate flex-1 font-mono text-xs"
                                :title="file"
                                >{{ file }}</span
                            >
                            <div
                                class="opacity-0 group-hover:opacity-100 flex items-center gap-1"
                            >
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    class="h-5 w-5"
                                    title="暂存文件"
                                    @click="stageFile(file)"
                                    :disabled="loading"
                                >
                                    <Plus class="w-3 h-3" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div
            v-if="stagedFiles.length > 0"
            class="p-3 border-t bg-muted/30 space-y-2 shrink-0"
        >
            <Textarea
                v-model="commitMessage"
                placeholder="提交信息..."
                class="min-h-[80px] text-xs resize-none"
            />
            <Button
                size="sm"
                class="w-full"
                @click="commit"
                :disabled="!commitMessage.trim() || loading"
            >
                <GitCommit class="w-3.5 h-3.5 mr-2" />
                提交
            </Button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
    GitBranch,
    RefreshCw,
    AlertCircle,
    CheckCircle2,
    Eye,
    Plus,
    Minus,
    File,
    FilePlus,
    FileEdit,
    FileMinus,
    HelpCircle,
    Reply,
    GitCommit,
} from "lucide-vue-next";

const props = defineProps<{
    workspaceRoot: string | null;
}>();

const emit = defineEmits<{
    viewDiff: [file: string, staged: boolean];
}>();

interface FileChange {
    path: string;
    status: "A" | "M" | "D" | "R" | "C" | "U";
}

const currentBranch = ref<string>("");
const stagedFiles = ref<FileChange[]>([]);
const unstagedFiles = ref<FileChange[]>([]);
const untrackedFiles = ref<string[]>([]);
const commitMessage = ref<string>("");
const loading = ref(false);
const error = ref<string>("");

const hasChanges = computed(
    () =>
        stagedFiles.value.length > 0 ||
        unstagedFiles.value.length > 0 ||
        untrackedFiles.value.length > 0,
);

function getStatusIcon(status: string) {
    if (typeof status === "string" && status.includes("?")) return HelpCircle;

    switch (status) {
        case "A":
            return FilePlus;
        case "M":
            return FileEdit;
        case "D":
            return FileMinus;
        default:
            return File;
    }
}

function getStatusColor(status: string) {
    if (typeof status === "string" && status.includes("?"))
        return "text-orange-500";

    switch (status) {
        case "A":
            return "text-green-500";
        case "M":
            return "text-blue-500";
        case "D":
            return "text-destructive";
        default:
            return "text-muted-foreground";
    }
}

async function refreshStatus() {
    // TODO: 实现通过 MCP git_status 工具获取状态
    // 这里需要调用 Git MCP 服务器的 git_status 工具
    console.log("刷新 Git 状态");
}

async function stageFile(path: string) {
    // TODO: 实现通过 MCP git_add 工具暂存文件
    console.log("暂存文件:", path);
}

async function unstageFile(path: string) {
    // TODO: 实现通过 MCP git_reset 工具取消暂存
    console.log("取消暂存:", path);
}

async function discardFile(path: string) {
    // TODO: 实现通过 MCP git_checkout/restore 工具放弃更改
    console.log("放弃更改:", path);
}

async function stageAll() {
    // TODO: 实现通过 MCP git_add 工具暂存所有文件
    console.log("暂存所有文件");
}

async function commit() {
    if (!commitMessage.value.trim()) return;
    // TODO: 实现通过 MCP git_commit 工具提交
    console.log("提交:", commitMessage.value);
    commitMessage.value = "";
}

function viewDiff(file: string, staged: boolean) {
    emit("viewDiff", file, staged);
}

// 初始化时加载状态
onMounted(() => {
    if (props.workspaceRoot) {
        refreshStatus();
    }
});

watch(
    () => props.workspaceRoot,
    (newRoot) => {
        if (newRoot) {
            refreshStatus();
        }
    },
);
</script>
