<template>
    <div class="task-plan-view">
        <div class="plan-header">
            <div class="flex items-center gap-2">
                <ListChecks class="w-5 h-5" />
                <h3 class="text-lg font-semibold">任务计划</h3>
            </div>
            <div class="status-badge" :class="getStatusBadgeClass()">
                {{ getStatusText() }}
            </div>
        </div>

        <div class="plan-body">
            <div
                v-for="(step, index) in steps"
                :key="index"
                class="plan-step"
                :class="getStepClass(step)"
            >
                <div class="step-number">{{ index + 1 }}</div>
                <div class="step-content">
                    <div class="step-title">{{ step.title }}</div>
                    <div v-if="step.description" class="step-description">
                        {{ step.description }}
                    </div>

                    <!-- Tool executions for this step -->
                    <div v-if="step.tools && step.tools.length > 0" class="step-tools">
                        <ToolExecutionPanel
                            v-for="(tool, toolIndex) in step.tools"
                            :key="toolIndex"
                            :tool-name="tool.name"
                            :args="tool.args"
                            :status="tool.status"
                            :result="tool.result"
                            :error="tool.error"
                        />
                    </div>

                    <div v-if="step.status === 'running'" class="step-progress">
                        <Loader2 class="w-4 h-4 animate-spin" />
                        <span>执行中...</span>
                    </div>
                </div>
                <div class="step-status">
                    <component
                        :is="getStepIcon(step)"
                        class="w-5 h-5"
                        :class="getStepIconClass(step)"
                    />
                </div>
            </div>
        </div>

        <div v-if="status === 'completed'" class="plan-footer">
            <CheckCircle2 class="w-4 h-4 text-green-500" />
            <span class="text-sm text-green-600">所有任务已完成</span>
        </div>

        <div v-else-if="status === 'failed'" class="plan-footer error">
            <XCircle class="w-4 h-4 text-red-500" />
            <span class="text-sm text-red-600">任务执行失败</span>
        </div>
    </div>
</template>

<script setup lang="ts">
import {
    ListChecks,
    CheckCircle2,
    Circle,
    Loader2,
    XCircle,
    AlertCircle,
} from "lucide-vue-next";
import ToolExecutionPanel from "./ToolExecutionPanel.vue";

export interface TaskStep {
    title: string;
    description?: string;
    status: "pending" | "running" | "completed" | "failed";
    tools?: Array<{
        name: string;
        args: Record<string, any>;
        status: "running" | "success" | "error" | "pending";
        result?: any;
        error?: string;
    }>;
}

const props = defineProps<{
    steps: TaskStep[];
    status: "planning" | "running" | "completed" | "failed";
}>();

function getStatusText(): string {
    switch (props.status) {
        case "planning":
            return "规划中";
        case "running":
            return "执行中";
        case "completed":
            return "已完成";
        case "failed":
            return "失败";
        default:
            return "";
    }
}

function getStatusBadgeClass(): string {
    switch (props.status) {
        case "planning":
            return "badge-planning";
        case "running":
            return "badge-running";
        case "completed":
            return "badge-completed";
        case "failed":
            return "badge-failed";
        default:
            return "";
    }
}

function getStepClass(step: TaskStep): string {
    return `step-${step.status}`;
}

function getStepIcon(step: TaskStep) {
    switch (step.status) {
        case "completed":
            return CheckCircle2;
        case "running":
            return Loader2;
        case "failed":
            return XCircle;
        default:
            return Circle;
    }
}

function getStepIconClass(step: TaskStep): string {
    switch (step.status) {
        case "completed":
            return "text-green-500";
        case "running":
            return "text-blue-500 animate-spin";
        case "failed":
            return "text-red-500";
        default:
            return "text-gray-400";
    }
}
</script>

<style scoped>
.task-plan-view {
    @apply bg-card border border-border rounded-lg overflow-hidden;
}

.plan-header {
    @apply flex items-center justify-between p-4 border-b border-border bg-muted/30;
}

.status-badge {
    @apply px-3 py-1 rounded-full text-xs font-medium;
}

.badge-planning {
    @apply bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400;
}

.badge-running {
    @apply bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400;
}

.badge-completed {
    @apply bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400;
}

.badge-failed {
    @apply bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400;
}

.plan-body {
    @apply p-4 space-y-4;
}

.plan-step {
    @apply flex gap-3 p-3 rounded-lg border border-border transition-all;
}

.step-pending {
    @apply bg-muted/20;
}

.step-running {
    @apply bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800;
}

.step-completed {
    @apply bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800;
}

.step-failed {
    @apply bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800;
}

.step-number {
    @apply flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-sm font-medium flex-shrink-0;
}

.step-content {
    @apply flex-1 space-y-2;
}

.step-title {
    @apply text-sm font-medium;
}

.step-description {
    @apply text-xs text-muted-foreground;
}

.step-tools {
    @apply mt-2 space-y-2;
}

.step-progress {
    @apply flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 mt-2;
}

.step-status {
    @apply flex items-center justify-center flex-shrink-0;
}

.plan-footer {
    @apply flex items-center gap-2 p-4 border-t border-border bg-muted/30;
}

.plan-footer.error {
    @apply bg-red-50 dark:bg-red-900/10;
}
</style>
