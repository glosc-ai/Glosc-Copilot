<template>
    <div class="git-status-panel">
        <div class="git-header">
            <div class="flex items-center gap-2">
                <GitBranch class="w-4 h-4" />
                <span class="branch-name">{{ currentBranch || "N/A" }}</span>
            </div>
            <Button size="icon-sm" variant="ghost" @click="refreshStatus">
                <RefreshCw
                    class="w-3 h-3"
                    :class="{ 'animate-spin': loading }"
                />
            </Button>
        </div>

        <div v-if="error" class="git-error">
            <AlertCircle class="w-4 h-4" />
            <span class="text-xs">{{ error }}</span>
        </div>

        <div v-else-if="!hasChanges" class="git-clean">
            <CheckCircle2 class="w-4 h-4 text-green-500" />
            <span class="text-xs text-muted-foreground">工作区是干净的</span>
        </div>

        <div v-else class="git-changes">
            <!-- 暂存区文件 -->
            <div v-if="stagedFiles.length > 0" class="changes-section">
                <div class="section-title">
                    <span>暂存区 ({{ stagedFiles.length }})</span>
                </div>
                <div class="file-list">
                    <div
                        v-for="file in stagedFiles"
                        :key="file.path"
                        class="file-item staged"
                    >
                        <component
                            :is="getStatusIcon(file.status)"
                            class="w-3 h-3"
                        />
                        <span class="file-path">{{ file.path }}</span>
                        <Button
                            size="sm"
                            variant="ghost"
                            @click="viewDiff(file.path, true)"
                        >
                            <Eye class="w-3 h-3" />
                        </Button>
                    </div>
                </div>
            </div>

            <!-- 未暂存文件 -->
            <div v-if="unstagedFiles.length > 0" class="changes-section">
                <div class="section-title">
                    <span>更改 ({{ unstagedFiles.length }})</span>
                    <Button
                        size="sm"
                        variant="ghost"
                        @click="stageAll"
                        :disabled="loading"
                    >
                        <Plus class="w-3 h-3 mr-1" />
                        全部暂存
                    </Button>
                </div>
                <div class="file-list">
                    <div
                        v-for="file in unstagedFiles"
                        :key="file.path"
                        class="file-item"
                    >
                        <component
                            :is="getStatusIcon(file.status)"
                            class="w-3 h-3"
                        />
                        <span class="file-path">{{ file.path }}</span>
                        <div class="file-actions">
                            <Button
                                size="icon-sm"
                                variant="ghost"
                                @click="viewDiff(file.path, false)"
                            >
                                <Eye class="w-3 h-3" />
                            </Button>
                            <Button
                                size="icon-sm"
                                variant="ghost"
                                @click="stageFile(file.path)"
                                :disabled="loading"
                            >
                                <Plus class="w-3 h-3" />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 未跟踪文件 -->
            <div v-if="untrackedFiles.length > 0" class="changes-section">
                <div class="section-title">
                    <span>未跟踪 ({{ untrackedFiles.length }})</span>
                </div>
                <div class="file-list">
                    <div
                        v-for="file in untrackedFiles"
                        :key="file"
                        class="file-item untracked"
                    >
                        <FileQuestion class="w-3 h-3" />
                        <span class="file-path">{{ file }}</span>
                        <Button
                            size="icon-sm"
                            variant="ghost"
                            @click="stageFile(file)"
                            :disabled="loading"
                        >
                            <Plus class="w-3 h-3" />
                        </Button>
                    </div>
                </div>
            </div>

            <!-- 提交操作 -->
            <div v-if="stagedFiles.length > 0" class="commit-section">
                <Textarea
                    v-model="commitMessage"
                    placeholder="提交信息..."
                    class="text-xs"
                    rows="2"
                />
                <Button
                    size="sm"
                    class="w-full"
                    @click="commit"
                    :disabled="!commitMessage.trim() || loading"
                >
                    <GitCommit class="w-3 h-3 mr-2" />
                    提交
                </Button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
    GitBranch,
    RefreshCw,
    CheckCircle2,
    AlertCircle,
    Plus,
    Eye,
    FileQuestion,
    GitCommit,
    FilePlus,
    FileEdit,
    FileX,
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
    switch (status) {
        case "A":
            return FilePlus;
        case "M":
            return FileEdit;
        case "D":
            return FileX;
        default:
            return FileEdit;
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

<style scoped>
.git-status-panel {
    @apply flex flex-col h-full bg-card border-l border-border;
}

.git-header {
    @apply flex items-center justify-between p-3 border-b border-border bg-muted/30;
}

.branch-name {
    @apply text-sm font-medium;
}

.git-error {
    @apply flex items-center gap-2 p-3 text-red-500 text-xs;
}

.git-clean {
    @apply flex items-center gap-2 p-3;
}

.git-changes {
    @apply flex-1 overflow-y-auto p-2 space-y-3;
}

.changes-section {
    @apply space-y-1;
}

.section-title {
    @apply flex items-center justify-between px-2 py-1 text-xs font-medium text-muted-foreground;
}

.file-list {
    @apply space-y-0.5;
}

.file-item {
    @apply flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/50 transition-colors;
}

.file-item.staged {
    @apply bg-green-50 dark:bg-green-900/10;
}

.file-item.untracked {
    @apply text-muted-foreground;
}

.file-path {
    @apply flex-1 text-xs truncate;
}

.file-actions {
    @apply flex items-center gap-1;
}

.commit-section {
    @apply space-y-2 p-2 border-t border-border;
}
</style>
