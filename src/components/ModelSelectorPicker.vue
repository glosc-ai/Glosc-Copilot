<script setup lang="ts">
import { computed, ref } from "vue";
import {
    Check,
    ChevronsUpDown,
    Coins,
    Maximize2,
    MessageSquare,
    X,
} from "lucide-vue-next";

import { cn } from "@/lib/utils";
import { formatModelName, groupModelsByProvider } from "@/utils/ModelApi";
import type { ModelInfo } from "@/utils/interface";

import {
    ModelSelector,
    ModelSelectorContent,
    ModelSelectorEmpty,
    ModelSelectorGroup,
    ModelSelectorInput,
    ModelSelectorItem,
    ModelSelectorList,
    ModelSelectorLogo,
    ModelSelectorName,
    ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";

const props = withDefaults(
    defineProps<{
        models: ModelInfo[];
        selectedModel?: ModelInfo | null;
        /**
         * 当 selectedModel 还没加载出来时用于展示/高亮。
         */
        selectedModelId?: string;
        recentUsage?: Record<string, number>;
        allowRemoveRecent?: boolean;
        open?: boolean;
    }>(),
    {
        models: () => [],
        selectedModel: null,
        selectedModelId: "",
        recentUsage: () => ({}),
        allowRemoveRecent: false,
        open: undefined,
    },
);

const emit = defineEmits<{
    (e: "update:open", value: boolean): void;
    (e: "select", model: ModelInfo): void;
    (e: "remove-recent", modelId: string): void;
}>();

const internalOpen = ref(false);
const openProxy = computed({
    get: () =>
        typeof props.open === "boolean" ? props.open : internalOpen.value,
    set: (value: boolean) => {
        internalOpen.value = value;
        emit("update:open", value);
    },
});

const selectedId = computed(
    () => props.selectedModel?.id || props.selectedModelId || "",
);

const selectedModelSearchTerm = computed(() =>
    selectedId.value ? getModelSearchTermId(selectedId.value) : "",
);

const selectedModelType = ref<string>("all");
const selectedModelTags = ref<string[]>([]);
const selectedModelOwners = ref<string[]>([]);

const availableModelTypes = computed(() => {
    const types = new Set<string>();
    for (const m of props.models || []) {
        if (m?.type) types.add(m.type);
    }
    return Array.from(types).sort((a, b) => a.localeCompare(b));
});

const availableModelTags = computed(() => {
    const tags = new Set<string>();
    for (const m of props.models || []) {
        for (const t of m?.tags || []) {
            if (t) tags.add(t);
        }
    }
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
});

const availableModelOwners = computed(() => {
    const owners = new Set<string>();
    for (const m of props.models || []) {
        if (m?.owned_by) owners.add(m.owned_by);
    }
    return Array.from(owners).sort((a, b) => a.localeCompare(b));
});

function clearModelFilters() {
    selectedModelType.value = "all";
    selectedModelTags.value = [];
    selectedModelOwners.value = [];
}

function updateSelectedTag(tag: string, checked: boolean) {
    const next = new Set(selectedModelTags.value);
    if (checked) next.add(tag);
    else next.delete(tag);
    selectedModelTags.value = Array.from(next);
}

function updateSelectedOwner(owner: string, checked: boolean) {
    const next = new Set(selectedModelOwners.value);
    if (checked) next.add(owner);
    else next.delete(owner);
    selectedModelOwners.value = Array.from(next);
}

function matchesModelFilters(m: ModelInfo) {
    if (selectedModelType.value !== "all" && m.type !== selectedModelType.value)
        return false;
    if (selectedModelTags.value.length > 0) {
        const tags = m.tags || [];
        // 多选标签：采用“必须全部包含”的筛选语义
        if (!selectedModelTags.value.every((t) => tags.includes(t)))
            return false;
    }
    if (selectedModelOwners.value.length > 0) {
        // 多选开发商：采用“命中任意一个”的筛选语义
        if (!m.owned_by || !selectedModelOwners.value.includes(m.owned_by))
            return false;
    }
    return true;
}

const recentModels = computed(() => {
    const usage = props.recentUsage || {};
    return (props.models || [])
        .filter((m) => !!usage[m.id])
        .filter(matchesModelFilters)
        .sort((a, b) => (usage[b.id] || 0) - (usage[a.id] || 0));
});

const recentModelIdSet = computed(
    () => new Set(recentModels.value.map((m) => m.id)),
);

const filteredModels = computed(() =>
    (props.models || [])
        .filter((m) => !recentModelIdSet.value.has(m.id))
        .filter(matchesModelFilters),
);

const groupedModels = computed(() =>
    groupModelsByProvider(filteredModels.value),
);

function getModelSearchTerm(item: ModelInfo) {
    return [
        item.id,
        item.name,
        item.owned_by,
        item.description,
        item.type,
        ...(item.tags || []),
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
}

function getModelSearchTermId(modelId: string) {
    const hit = (props.models || []).find((m) => m.id === modelId);
    if (!hit) return modelId.toLowerCase();
    return getModelSearchTerm(hit);
}

function handleSelectModel(item: ModelInfo) {
    emit("select", item);
    openProxy.value = false;
}
</script>

<template>
    <ModelSelector v-model:open="openProxy">
        <ModelSelectorTrigger as-child>
            <Button
                variant="ghost"
                role="combobox"
                :aria-expanded="openProxy"
                class="justify-between border-none bg-transparent font-medium text-muted-foreground shadow-none hover:bg-accent hover:text-foreground"
            >
                <div class="flex items-center gap-2 truncate">
                    <ModelSelectorLogo
                        v-if="selectedModel?.owned_by"
                        :provider="selectedModel.owned_by"
                    />
                    <ModelSelectorName>
                        {{
                            selectedId
                                ? formatModelName(selectedId)
                                : "选择模型..."
                        }}
                    </ModelSelectorName>
                </div>
                <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
        </ModelSelectorTrigger>

        <ModelSelectorContent :model-value="selectedModelSearchTerm">
            <ModelSelectorInput placeholder="搜索模型..." />

            <div class="px-3 pb-2 flex items-center gap-2 flex-wrap">
                <Select v-model="selectedModelType">
                    <SelectTrigger class="h-8 w-40">
                        <SelectValue placeholder="类型" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">全部类型</SelectItem>
                        <SelectItem
                            v-for="t in availableModelTypes"
                            :key="t"
                            :value="t"
                        >
                            {{ t }}
                        </SelectItem>
                    </SelectContent>
                </Select>

                <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                        <Button variant="outline" class="h-8">
                            标签
                            <span
                                v-if="selectedModelTags.length"
                                class="ml-1 text-muted-foreground"
                            >
                                ({{ selectedModelTags.length }})
                            </span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent class="w-64 max-h-72 overflow-auto">
                        <DropdownMenuLabel>标签筛选</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuCheckboxItem
                            v-for="tag in availableModelTags"
                            :key="tag"
                            :checked="selectedModelTags.includes(tag)"
                            @select.prevent="
                                updateSelectedTag(
                                    tag,
                                    !selectedModelTags.includes(tag),
                                )
                            "
                            :class="{
                                'bg-blue-500!': selectedModelTags.includes(tag),
                            }"
                        >
                            {{ tag }}
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            :disabled="selectedModelTags.length === 0"
                            @click="selectedModelTags = []"
                        >
                            清空标签
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                        <Button variant="outline" class="h-8">
                            开发商
                            <span
                                v-if="selectedModelOwners.length"
                                class="ml-1 text-muted-foreground"
                            >
                                ({{ selectedModelOwners.length }})
                            </span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent class="w-64 max-h-72 overflow-auto">
                        <DropdownMenuLabel
                            >开发商筛选 (owned_by)</DropdownMenuLabel
                        >
                        <DropdownMenuSeparator />
                        <DropdownMenuCheckboxItem
                            v-for="owner in availableModelOwners"
                            :key="owner"
                            :checked="selectedModelOwners.includes(owner)"
                            @select.prevent="
                                updateSelectedOwner(
                                    owner,
                                    !selectedModelOwners.includes(owner),
                                )
                            "
                            :class="{
                                'bg-blue-500!':
                                    selectedModelOwners.includes(owner),
                            }"
                        >
                            {{ owner }}
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            :disabled="selectedModelOwners.length === 0"
                            @click="selectedModelOwners = []"
                        >
                            清空开发商
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                <Button
                    v-if="
                        selectedModelType !== 'all' ||
                        selectedModelTags.length ||
                        selectedModelOwners.length
                    "
                    variant="ghost"
                    class="h-8 px-2"
                    @click="clearModelFilters"
                >
                    清除
                </Button>
            </div>

            <ModelSelectorList>
                <ModelSelectorEmpty>未找到模型。</ModelSelectorEmpty>

                <ModelSelectorGroup
                    v-if="recentModels.length"
                    heading="最近使用"
                >
                    <ModelSelectorItem
                        v-for="item in recentModels"
                        :key="item.id"
                        :value="getModelSearchTerm(item)"
                        :class="
                            cn(
                                'flex items-start gap-2 py-3',
                                selectedId === item.id
                                    ? 'bg-accent text-accent-foreground'
                                    : '',
                            )
                        "
                        @select="() => handleSelectModel(item)"
                    >
                        <Check
                            :class="
                                cn(
                                    'mt-1 h-4 w-4 shrink-0',
                                    selectedId === item.id
                                        ? 'opacity-100'
                                        : 'opacity-0',
                                )
                            "
                        />
                        <div class="flex flex-col gap-1 w-full min-w-0">
                            <div
                                class="flex items-center justify-between gap-2"
                            >
                                <div class="flex items-center gap-2 truncate">
                                    <ModelSelectorLogo
                                        :provider="item.owned_by"
                                    />
                                    <ModelSelectorName
                                        class="font-medium truncate"
                                    >
                                        {{ formatModelName(item.id) }}
                                    </ModelSelectorName>
                                </div>
                                <div class="flex items-center gap-1">
                                    <span
                                        class="text-[10px] uppercase text-muted-foreground border px-1 rounded"
                                    >
                                        {{ item.type }}
                                    </span>
                                    <Button
                                        v-if="allowRemoveRecent"
                                        variant="ghost"
                                        size="sm"
                                        class="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
                                        @click.stop="
                                            emit('remove-recent', item.id)
                                        "
                                    >
                                        <X class="h-3 w-3" />
                                    </Button>
                                </div>
                            </div>

                            <div
                                class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"
                            >
                                <span
                                    v-if="item.context_window"
                                    class="flex items-center gap-1"
                                    title="上下文窗口"
                                >
                                    <Maximize2 class="w-3 h-3" />
                                    {{
                                        (item.context_window / 1000).toFixed(0)
                                    }}k
                                </span>
                                <span
                                    v-if="item.max_tokens"
                                    class="flex items-center gap-1"
                                    title="最大输出 Token"
                                >
                                    <MessageSquare class="w-3 h-3" />
                                    {{ (item.max_tokens / 1000).toFixed(0) }}k
                                </span>
                            </div>

                            <div
                                v-if="item.pricing"
                                class="flex items-center gap-2 text-[10px] text-muted-foreground/80"
                            >
                                <Coins class="w-3 h-3" />
                                <span>输入: {{ item.pricing.input }}</span>
                                <span>输出: {{ item.pricing.output }}</span>
                            </div>

                            <div
                                v-if="item.tags && item.tags.length"
                                class="flex flex-wrap gap-1 mt-1"
                            >
                                <span
                                    v-for="tag in item.tags"
                                    :key="tag"
                                    class="bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded text-[10px]"
                                >
                                    {{ tag }}
                                </span>
                            </div>
                        </div>
                    </ModelSelectorItem>
                </ModelSelectorGroup>

                <ModelSelectorGroup
                    v-for="(groupModels, provider) in groupedModels"
                    :key="provider"
                    :heading="provider"
                >
                    <ModelSelectorItem
                        v-for="item in groupModels"
                        :key="item.id"
                        :value="getModelSearchTerm(item)"
                        :class="
                            cn(
                                'flex items-start gap-2 py-3',
                                selectedId === item.id
                                    ? 'bg-accent text-accent-foreground'
                                    : '',
                            )
                        "
                        @select="() => handleSelectModel(item)"
                    >
                        <Check
                            :class="
                                cn(
                                    'mt-1 h-4 w-4 shrink-0',
                                    selectedId === item.id
                                        ? 'opacity-100'
                                        : 'opacity-0',
                                )
                            "
                        />
                        <div class="flex flex-col gap-1 w-full min-w-0">
                            <div
                                class="flex items-center justify-between gap-2"
                            >
                                <div class="flex items-center gap-2 truncate">
                                    <ModelSelectorLogo
                                        :provider="item.owned_by"
                                    />
                                    <ModelSelectorName
                                        class="font-medium truncate"
                                    >
                                        {{ formatModelName(item.id) }}
                                    </ModelSelectorName>
                                </div>
                                <span
                                    class="text-[10px] uppercase text-muted-foreground border px-1 rounded"
                                >
                                    {{ item.type }}
                                </span>
                            </div>

                            <div
                                class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"
                            >
                                <span
                                    v-if="item.context_window"
                                    class="flex items-center gap-1"
                                    title="上下文窗口"
                                >
                                    <Maximize2 class="w-3 h-3" />
                                    {{
                                        (item.context_window / 1000).toFixed(0)
                                    }}k
                                </span>
                                <span
                                    v-if="item.max_tokens"
                                    class="flex items-center gap-1"
                                    title="最大输出 Token"
                                >
                                    <MessageSquare class="w-3 h-3" />
                                    {{ (item.max_tokens / 1000).toFixed(0) }}k
                                </span>
                            </div>

                            <div
                                v-if="item.pricing"
                                class="flex items-center gap-2 text-[10px] text-muted-foreground/80"
                            >
                                <Coins class="w-3 h-3" />
                                <span>输入: {{ item.pricing.input }}</span>
                                <span>输出: {{ item.pricing.output }}</span>
                            </div>

                            <div
                                v-if="item.tags && item.tags.length"
                                class="flex flex-wrap gap-1 mt-1"
                            >
                                <span
                                    v-for="tag in item.tags"
                                    :key="tag"
                                    class="bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded text-[10px]"
                                >
                                    {{ tag }}
                                </span>
                            </div>
                        </div>
                    </ModelSelectorItem>
                </ModelSelectorGroup>
            </ModelSelectorList>
        </ModelSelectorContent>
    </ModelSelector>
</template>
