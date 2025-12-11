<script setup lang="ts">
import { ref } from "vue";
import { Button } from "@/components/ui/button";
import {
    Box,
    FileJson,
    LayoutTemplate,
    MessageSquare,
    ChevronDown,
    ChevronUp,
} from "lucide-vue-next";

const props = defineProps<{
    serverId: string;
    capabilities: any;
}>();

const activeTab = ref<"tools" | "resources" | "templates" | "prompts">("tools");
const expandedToolSchemas = ref<Set<string>>(new Set());

const toggleToolSchema = (toolName: string) => {
    const key = `${props.serverId}-${toolName}`;
    const newSet = new Set(expandedToolSchemas.value);
    if (newSet.has(key)) {
        newSet.delete(key);
    } else {
        newSet.add(key);
    }
    expandedToolSchemas.value = newSet;
};
</script>

<template>
    <div class="border-t bg-muted/30 p-4">
        <div class="flex items-center gap-2 border-b pb-2 mb-4">
            <Button
                v-for="tab in ['tools', 'resources', 'templates', 'prompts']"
                :key="tab"
                variant="ghost"
                size="sm"
                :class="[
                    'capitalize',
                    activeTab === tab
                        ? 'bg-background shadow-sm font-medium text-foreground'
                        : 'text-muted-foreground',
                ]"
                @click="activeTab = tab as any"
            >
                <component
                    :is="
                        tab === 'tools'
                            ? Box
                            : tab === 'resources'
                              ? FileJson
                              : tab === 'templates'
                                ? LayoutTemplate
                                : MessageSquare
                    "
                    class="w-4 h-4 mr-2"
                />
                {{ tab }}
                <span
                    class="ml-2 text-xs bg-muted-foreground/20 px-1.5 rounded-full"
                >
                    {{
                        tab === "tools"
                            ? capabilities?.tools?.tools?.length
                            : tab === "resources"
                              ? capabilities?.resources?.resources?.length
                              : tab === "templates"
                                ? capabilities?.templates?.resourceTemplates
                                      ?.length
                                : tab === "prompts"
                                  ? capabilities?.prompts?.prompts?.length
                                  : 0
                    }}
                </span>
            </Button>
        </div>

        <div class="max-h-[400px] overflow-y-auto pr-2">
            <div v-if="activeTab === 'tools'" class="grid gap-4">
                <div
                    v-if="!capabilities.tools?.tools?.length"
                    class="text-center py-8 text-muted-foreground"
                >
                    未发现工具
                </div>
                <div
                    v-for="tool in capabilities.tools?.tools"
                    :key="tool.name"
                    class="border rounded-lg p-4 bg-card"
                >
                    <div class="flex items-center justify-between mb-2">
                        <div class="flex items-center gap-2">
                            <div class="p-2 bg-primary/10 rounded-md">
                                <Box class="w-4 h-4 text-primary" />
                            </div>
                            <h3 class="font-semibold">
                                {{ tool.name }}
                            </h3>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            class="h-6 w-6 p-0"
                            @click="toggleToolSchema(tool.name)"
                        >
                            <component
                                :is="
                                    expandedToolSchemas.has(
                                        `${serverId}-${tool.name}`
                                    )
                                        ? ChevronUp
                                        : ChevronDown
                                "
                                class="w-4 h-4"
                            />
                        </Button>
                    </div>
                    <p class="text-sm text-muted-foreground mb-3">
                        {{ tool.description || "无描述" }}
                    </p>
                    <div
                        v-if="
                            expandedToolSchemas.has(`${serverId}-${tool.name}`)
                        "
                        class="bg-muted/50 rounded-md p-3 text-xs font-mono overflow-x-auto"
                    >
                        <pre>{{
                            JSON.stringify(tool.inputSchema, null, 2)
                        }}</pre>
                    </div>
                </div>
            </div>

            <div v-else-if="activeTab === 'resources'" class="grid gap-4">
                <div
                    v-if="!capabilities.resources?.resources?.length"
                    class="text-center py-8 text-muted-foreground"
                >
                    未发现资源
                </div>
                <div
                    v-for="resource in capabilities.resources?.resources"
                    :key="resource.uri"
                    class="border rounded-lg p-4 bg-card"
                >
                    <div class="flex items-center gap-2 mb-2">
                        <div class="p-2 bg-blue-500/10 rounded-md">
                            <FileJson class="w-4 h-4 text-blue-500" />
                        </div>
                        <h3 class="font-semibold">
                            {{ resource.name }}
                        </h3>
                    </div>
                    <div class="grid gap-1 text-sm">
                        <div class="flex gap-2">
                            <span class="text-muted-foreground w-16">URI:</span>
                            <code class="bg-muted px-1 rounded">{{
                                resource.uri
                            }}</code>
                        </div>
                        <div class="flex gap-2">
                            <span class="text-muted-foreground w-16"
                                >MIME:</span
                            >
                            <span>{{ resource.mimeType || "Unknown" }}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div v-else-if="activeTab === 'templates'" class="grid gap-4">
                <div
                    v-if="!capabilities.templates?.resourceTemplates?.length"
                    class="text-center py-8 text-muted-foreground"
                >
                    未发现模板
                </div>
                <div
                    v-for="template in capabilities.templates
                        ?.resourceTemplates"
                    :key="template.uriTemplate"
                    class="border rounded-lg p-4 bg-card"
                >
                    <div class="flex items-center gap-2 mb-2">
                        <div class="p-2 bg-orange-500/10 rounded-md">
                            <LayoutTemplate class="w-4 h-4 text-orange-500" />
                        </div>
                        <h3 class="font-semibold">
                            {{ template.name }}
                        </h3>
                    </div>
                    <div class="grid gap-1 text-sm">
                        <div class="flex gap-2">
                            <span class="text-muted-foreground w-24"
                                >URI Template:</span
                            >
                            <code class="bg-muted px-1 rounded">{{
                                template.uriTemplate
                            }}</code>
                        </div>
                        <div
                            v-if="template.description"
                            class="text-muted-foreground mt-1"
                        >
                            {{ template.description }}
                        </div>
                    </div>
                </div>
            </div>

            <div v-else-if="activeTab === 'prompts'" class="grid gap-4">
                <div
                    v-if="!capabilities.prompts?.prompts?.length"
                    class="text-center py-8 text-muted-foreground"
                >
                    未发现提示词
                </div>
                <div
                    v-for="prompt in capabilities.prompts?.prompts"
                    :key="prompt.name"
                    class="border rounded-lg p-4 bg-card"
                >
                    <div class="flex items-center gap-2 mb-2">
                        <div class="p-2 bg-green-500/10 rounded-md">
                            <MessageSquare class="w-4 h-4 text-green-500" />
                        </div>
                        <h3 class="font-semibold">
                            {{ prompt.name }}
                        </h3>
                    </div>
                    <p class="text-sm text-muted-foreground mb-3">
                        {{ prompt.description || "无描述" }}
                    </p>
                    <div v-if="prompt.arguments?.length" class="mt-2">
                        <h4 class="text-xs font-semibold mb-1">参数:</h4>
                        <div class="grid gap-2">
                            <div
                                v-for="arg in prompt.arguments"
                                :key="arg.name"
                                class="text-xs bg-muted/50 p-2 rounded flex items-center justify-between"
                            >
                                <span class="font-mono text-primary">{{
                                    arg.name
                                }}</span>
                                <span class="text-muted-foreground">{{
                                    arg.description
                                }}</span>
                                <span
                                    v-if="arg.required"
                                    class="text-[10px] bg-destructive/10 text-destructive px-1 rounded"
                                    >Required</span
                                >
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
