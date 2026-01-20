<template>
    <div class="tool-execution-panel">
        <div class="tool-header" @click="toggleExpanded">
            <div class="tool-icon">
                <component :is="getToolIcon()" class="w-4 h-4" />
            </div>
            <div class="tool-info flex-1">
                <div class="tool-name">{{ toolName }}</div>
                <div class="tool-args">{{ formatArgs(args) }}</div>
            </div>
            <div class="tool-status">
                <component
                    :is="getStatusIcon()"
                    class="w-4 h-4"
                    :class="getStatusClass()"
                />
            </div>
            <ChevronDown
                class="w-4 h-4 transition-transform"
                :class="{ 'rotate-180': expanded }"
            />
        </div>

        <div v-if="expanded" class="tool-body">
            <div v-if="status === 'running'" class="tool-loading">
                <Loader2 class="w-4 h-4 animate-spin" />
                <span>执行中...</span>
            </div>

            <div v-else-if="status === 'success'" class="tool-result">
                <div class="result-label">结果:</div>
                <pre class="result-content">{{ formatResult(result) }}</pre>
            </div>

            <div v-else-if="status === 'error'" class="tool-error">
                <AlertCircle class="w-4 h-4" />
                <div class="error-content">
                    <div class="error-label">错误:</div>
                    <div class="error-message">{{ error }}</div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import {
    FileText,
    FolderOpen,
    Search,
    Edit3,
    Trash2,
    FolderPlus,
    Move,
    CheckCircle2,
    XCircle,
    Loader2,
    ChevronDown,
    AlertCircle,
} from "lucide-vue-next";

const props = defineProps<{
    toolName: string;
    args: Record<string, any>;
    status: "running" | "success" | "error" | "pending";
    result?: any;
    error?: string;
}>();

const expanded = ref(false);

function toggleExpanded() {
    expanded.value = !expanded.value;
}

function getToolIcon() {
    const iconMap: Record<string, any> = {
        read_file: FileText,
        write_file: Edit3,
        edit_file: Edit3,
        list_directory: FolderOpen,
        create_directory: FolderPlus,
        delete_file: Trash2,
        search_files: Search,
        grep_files: Search,
        move_file: Move,
    };
    return iconMap[props.toolName] || FileText;
}

function getStatusIcon() {
    switch (props.status) {
        case "running":
            return Loader2;
        case "success":
            return CheckCircle2;
        case "error":
            return XCircle;
        default:
            return Loader2;
    }
}

function getStatusClass() {
    switch (props.status) {
        case "running":
            return "text-blue-500 animate-spin";
        case "success":
            return "text-green-500";
        case "error":
            return "text-red-500";
        default:
            return "text-gray-400";
    }
}

function formatArgs(args: Record<string, any>): string {
    const keys = Object.keys(args);
    if (keys.length === 0) return "";

    const primary = keys[0];
    const value = args[primary];
    const display = typeof value === "string" ? value : JSON.stringify(value);

    if (display.length > 50) {
        return `${display.substring(0, 50)}...`;
    }
    return display;
}

function formatResult(result: any): string {
    if (!result) return "";

    if (typeof result === "string") {
        return result;
    }

    if (result.content && Array.isArray(result.content)) {
        return result.content
            .map((c: any) => c.text || JSON.stringify(c))
            .join("\n");
    }

    return JSON.stringify(result, null, 2);
}
</script>

<style scoped>
.tool-execution-panel {
    @apply border border-border rounded-lg mb-2 overflow-hidden;
}

.tool-header {
    @apply flex items-center gap-2 p-3 cursor-pointer hover:bg-accent/50 transition-colors;
}

.tool-icon {
    @apply flex items-center justify-center w-8 h-8 rounded-md bg-primary/10;
}

.tool-info {
    @apply flex flex-col gap-1;
}

.tool-name {
    @apply text-sm font-medium;
}

.tool-args {
    @apply text-xs text-muted-foreground truncate;
}

.tool-status {
    @apply flex items-center justify-center;
}

.tool-body {
    @apply px-3 pb-3 border-t border-border/50 mt-2 pt-3;
}

.tool-loading {
    @apply flex items-center gap-2 text-sm text-muted-foreground;
}

.tool-result {
    @apply space-y-2;
}

.result-label {
    @apply text-xs font-medium text-muted-foreground;
}

.result-content {
    @apply text-xs bg-muted p-3 rounded-md overflow-x-auto max-h-96 overflow-y-auto;
}

.tool-error {
    @apply flex items-start gap-2 text-red-500;
}

.error-content {
    @apply flex-1;
}

.error-label {
    @apply text-xs font-medium mb-1;
}

.error-message {
    @apply text-sm;
}
</style>
