<script lang="ts" setup>
import { computed, ref, watch } from "vue";
import { formatModelName } from "@/utils/ModelApi";
import { isApiKeyOptionalForBaseUrl } from "@/utils/LocalAiProvider";
import { storeToRefs } from "pinia";
import type { ModelAssignmentKey, ModelInfo } from "@/utils/interface";
import { Check, ChevronsUpDown } from "lucide-vue-next";

const uiStore = useUiStore();
const settingsStore = useSettingsStore();
const chatStore = useChatStore();
const { availableModels, isLoadingModels, modelsError } =
    storeToRefs(chatStore);
const { hiddenModelIds } = storeToRefs(settingsStore);
const { customModelProviders } = storeToRefs(settingsStore);

type SettingsView = "main" | "models" | "custom-models";
const view = ref<SettingsView>("main");
const confirmDeleteProviderId = ref<string | null>(null);

const modelFilterType = ref<string>("all");
const modelFilterOwner = ref<string>("all");
const modelSearch = ref<string>("");

const totalModelCount = computed(() => (availableModels.value || []).length);

const hiddenCount = computed(() => {
    const hidden = new Set(hiddenModelIds.value || []);
    return (availableModels.value || []).filter((m) => hidden.has(m.id)).length;
});

const visibleCount = computed(() => totalModelCount.value - hiddenCount.value);

const availableModelTypes = computed(() => {
    const types = new Set<string>();
    for (const m of availableModels.value || []) {
        if (m?.type) types.add(m.type);
    }
    return Array.from(types).sort((a, b) => a.localeCompare(b));
});

const availableModelOwners = computed(() => {
    const owners = new Set<string>();
    for (const m of availableModels.value || []) {
        if (m?.owned_by) owners.add(m.owned_by);
    }
    return Array.from(owners).sort((a, b) => a.localeCompare(b));
});

function matchesModelFilter(m: ModelInfo) {
    if (modelFilterType.value !== "all" && m.type !== modelFilterType.value)
        return false;
    if (
        modelFilterOwner.value !== "all" &&
        (!m.owned_by || m.owned_by !== modelFilterOwner.value)
    )
        return false;
    const q = modelSearch.value.trim().toLowerCase();
    if (q) {
        const hay = [m.id, m.name, m.owned_by, m.type, m.description]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
        if (!hay.includes(q)) return false;
    }
    return true;
}

const filteredModels = computed(() =>
    (availableModels.value || []).filter(matchesModelFilter),
);

async function ensureModelsLoaded() {
    if ((availableModels.value || []).length > 0) return;
    await chatStore.loadAvailableModels();
}

async function openModelManager() {
    view.value = "models";
    await ensureModelsLoaded();
}

const modelAssignmentItems: Array<{
    key: ModelAssignmentKey;
    label: string;
    description: string;
}> = [
    {
        key: "chat",
        label: "聊天模型",
        description: "聊天页面默认使用的模型",
    },
    {
        key: "tool",
        label: "工具调用模型",
        description: "聊天请求启用 MCP 工具时优先使用",
    },
    {
        key: "conversationOrganizer",
        label: "整理会话模型",
        description: "侧栏 AI 整理会话分组时使用",
    },
    {
        key: "skills",
        label: "Skills 管理模型",
        description: "预留给 Skills 管理中的 AI 辅助能力",
    },
];

const selectableModels = computed(() =>
    (availableModels.value || []).filter(
        (m) => !settingsStore.isModelHidden(m.id),
    ),
);
const assignmentPickerOpen = ref<Record<ModelAssignmentKey, boolean>>({
    chat: false,
    tool: false,
    conversationOrganizer: false,
    skills: false,
});

function getAssignmentValue(key: ModelAssignmentKey) {
    return settingsStore.getAssignedModelId(key) || "__follow_chat__";
}

function getAssignmentLabel(key: ModelAssignmentKey) {
    const value = getAssignmentValue(key);
    if (value === "__follow_chat__") return "跟随聊天当前模型";
    const model = (availableModels.value || []).find((m) => m.id === value);
    return model ? formatModelName(model.id) : value;
}

async function setAssignmentValue(key: ModelAssignmentKey, modelId: string) {
    const clean = modelId === "__follow_chat__" ? "" : modelId;
    await settingsStore.setAssignedModelId(key, clean || null);
    assignmentPickerOpen.value = {
        ...assignmentPickerOpen.value,
        [key]: false,
    };
    if (key === "chat") {
        const model = (availableModels.value || []).find((m) => m.id === clean);
        if (model) chatStore.selectModel(model);
    }
}

async function openCustomModelManager() {
    view.value = "custom-models";
    void settingsStore.init();
}

function closeModelSettings() {
    uiStore.closeModelSettings();
}

const customProviderCount = computed(
    () => (customModelProviders.value || []).length,
);

const enabledCustomProviderCount = computed(
    () => (customModelProviders.value || []).filter((p) => p.enabled).length,
);

const providerPresets = [
    {
        key: "glosc-ai",
        label: "Glosc AI",
        name: "Glosc AI",
        baseUrl: "https://one.gloscai.com/v1",
        apiKey: "",
        description: "云服务，需要 API Key",
    },
] as const;

const customDraft = ref({
    name: "",
    apiKey: "",
    baseUrl: "https://one.gloscai.com/v1",
});

const customDraftAllowsEmptyKey = computed(() =>
    isApiKeyOptionalForBaseUrl(customDraft.value.baseUrl),
);

const customSaving = ref(false);

function maskKey(key: string) {
    const k = String(key || "");
    if (!k) return "未设置（本地/无需 Key）";
    if (k.length <= 8) return "********";
    return `${k.slice(0, 3)}********${k.slice(-4)}`;
}

function applyProviderPreset(presetKey: string) {
    const preset = providerPresets.find((item) => item.key === presetKey);
    if (!preset) return;

    customDraft.value = {
        name: preset.name,
        apiKey: preset.apiKey,
        baseUrl: preset.baseUrl,
    };
}

function newProviderId() {
    try {
        return crypto.randomUUID();
    } catch {
        return `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }
}

async function addCustomProviderAndProbe() {
    if (customSaving.value) return;

    const name = customDraft.value.name.trim();
    const apiKey = customDraft.value.apiKey.trim();
    const baseUrl = customDraft.value.baseUrl.trim();

    if (!name) {
        ElMessage.warning("请填写配置名称");
        return;
    }
    if (!apiKey && !isApiKeyOptionalForBaseUrl(baseUrl)) {
        ElMessage.warning("请填写 API Key");
        return;
    }
    if (!baseUrl) {
        ElMessage.warning("请填写 Base URL（OpenAI 兼容 /v1）");
        return;
    }

    customSaving.value = true;
    const id = newProviderId();
    try {
        await settingsStore.upsertCustomModelProvider({
            id,
            name,
            enabled: true,
            apiKey,
            baseUrl,
            models: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            lastValidatedAt: undefined,
        } as any);

        const models =
            await settingsStore.probeAndUpdateCustomModelProviderModels(id);

        ElMessage.success(`验证成功，发现 ${models.length} 个模型`);

        // 刷新模型列表（合并自定义分组）
        await chatStore.loadAvailableModels();

        // 清空表单
        customDraft.value = {
            name: "",
            apiKey: "",
            baseUrl: "https://one.gloscai.com/v1",
        };
    } catch (e: any) {
        const msg =
            e instanceof Error
                ? e.message
                : typeof e === "string"
                  ? e
                  : "验证失败";
        ElMessage.error(msg);
        // 失败时保留配置，方便用户修改/重试
    } finally {
        customSaving.value = false;
    }
}

async function refreshCustomProvider(id: string) {
    try {
        const models =
            await settingsStore.probeAndUpdateCustomModelProviderModels(id);
        ElMessage.success(`已刷新，发现 ${models.length} 个模型`);
        await chatStore.loadAvailableModels();
    } catch (e: any) {
        ElMessage.error(
            e instanceof Error
                ? e.message
                : typeof e === "string"
                  ? e
                  : "刷新失败",
        );
    }
}

async function removeCustomProvider(id: string) {
    confirmDeleteProviderId.value = id;
}

async function confirmDeleteProvider() {
    const id = confirmDeleteProviderId.value;
    if (!id) return;
    confirmDeleteProviderId.value = null;

    await settingsStore.removeCustomModelProvider(id);
    await chatStore.loadAvailableModels();
    ElMessage.success("已删除");
}

function resetModelFilters() {
    modelFilterType.value = "all";
    modelFilterOwner.value = "all";
    modelSearch.value = "";
}

async function hideFilteredModels() {
    await settingsStore.hideModels(filteredModels.value.map((m) => m.id));
}

async function showFilteredModels() {
    await settingsStore.showModels(filteredModels.value.map((m) => m.id));
}

async function showAllModels() {
    await settingsStore.showAllModels();
}

async function toggleModelVisible(modelId: string, visible: boolean) {
    // visible=true => hidden=false
    await settingsStore.setModelHidden(modelId, !visible);
}

watch(
    () => uiStore.modelSettingsOpen,
    async (open) => {
        if (!open) {
            view.value = "main";
            resetModelFilters();
            return;
        }
        // 进入设置时确保 settings 已初始化（main.ts 会先 init，但这里兜底）
        await settingsStore.init();
        await ensureModelsLoaded();
    },
    { immediate: true },
);
</script>

<template>
    <Dialog v-model:open="uiStore.modelSettingsOpen">
        <DialogContent
            class="w-[92vw] max-w-3xl max-h-[82vh] overflow-hidden flex flex-col"
        >
            <DialogHeader>
                <DialogTitle class="flex items-center gap-2">
                    <Button
                        v-if="view !== 'main'"
                        variant="ghost"
                        size="sm"
                        class="h-8 px-2"
                        @click="view = 'main'"
                    >
                        返回
                    </Button>
                    <span>
                        {{
                            view === "models"
                                ? "模型管理"
                                : view === "custom-models"
                                  ? "自定义模型"
                                  : "模型设置"
                        }}
                    </span>
                </DialogTitle>
            </DialogHeader>

            <div class="flex-1 overflow-y-auto pr-1">
                <div v-if="view === 'main'" class="space-y-6">
                    <div class="grid gap-2">
                        <div class="text-xs text-muted-foreground">
                            模型管理
                        </div>
                        <div class="flex items-center justify-between gap-3">
                            <div class="text-sm">
                                <span class="text-muted-foreground">显示</span>
                                {{ visibleCount }}
                                <span class="text-muted-foreground">/</span>
                                {{ totalModelCount }}
                                <span class="text-muted-foreground"
                                    >；已隐藏</span
                                >
                                {{ hiddenCount }}
                            </div>
                            <Button
                                size="sm"
                                variant="outline"
                                @click="openModelManager"
                            >
                                显示所有模型
                            </Button>
                        </div>
                    </div>

                    <div class="grid gap-2">
                        <div class="text-xs text-muted-foreground">
                            自定义模型
                        </div>
                        <div class="flex items-center justify-between gap-3">
                            <div class="text-sm">
                                <span class="text-muted-foreground">配置</span>
                                {{ enabledCustomProviderCount }}
                                <span class="text-muted-foreground">/</span>
                                {{ customProviderCount }}
                                <span class="text-muted-foreground"
                                    >已启用</span
                                >
                            </div>
                            <Button
                                size="sm"
                                variant="outline"
                                @click="openCustomModelManager"
                            >
                                管理自定义模型
                            </Button>
                        </div>
                        <div class="text-xs text-muted-foreground">
                            自定义模型配置与 Key
                            只保存在本地，调用时直接连接你配置的 AI 服务商。
                        </div>
                    </div>
                    <div class="grid gap-3">
                        <div class="text-xs text-muted-foreground">
                            功能模型分配
                        </div>
                        <div class="rounded-md border divide-y">
                            <div
                                v-for="item in modelAssignmentItems"
                                :key="item.key"
                                class="grid grid-cols-[1fr_auto] items-center gap-4 px-3 py-3"
                            >
                                <div class="min-w-0">
                                    <div class="text-sm font-medium">
                                        {{ item.label }}
                                    </div>
                                    <div class="text-xs text-muted-foreground">
                                        {{ item.description }}
                                    </div>
                                </div>
                                <Popover
                                    v-model:open="
                                        assignmentPickerOpen[item.key]
                                    "
                                >
                                    <PopoverTrigger as-child>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            :aria-expanded="
                                                assignmentPickerOpen[item.key]
                                            "
                                            class="h-8 w-72 justify-between font-medium"
                                        >
                                            <span class="truncate">
                                                {{
                                                    getAssignmentLabel(item.key)
                                                }}
                                            </span>
                                            <ChevronsUpDown
                                                class="ml-2 h-4 w-4 shrink-0 opacity-50"
                                            />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent
                                        class="w-72 p-0"
                                        align="end"
                                    >
                                        <Command>
                                            <CommandInput
                                                placeholder="搜索模型..."
                                            />
                                            <CommandList class="max-h-80">
                                                <CommandEmpty>
                                                    未找到模型
                                                </CommandEmpty>
                                                <CommandGroup>
                                                    <CommandItem
                                                        value="跟随聊天当前模型 follow current chat model"
                                                        class="py-2"
                                                        @select="
                                                            () =>
                                                                setAssignmentValue(
                                                                    item.key,
                                                                    '__follow_chat__',
                                                                )
                                                        "
                                                    >
                                                        <Check
                                                            class="h-4 w-4"
                                                            :class="{
                                                                'opacity-100':
                                                                    getAssignmentValue(
                                                                        item.key,
                                                                    ) ===
                                                                    '__follow_chat__',
                                                                'opacity-0':
                                                                    getAssignmentValue(
                                                                        item.key,
                                                                    ) !==
                                                                    '__follow_chat__',
                                                            }"
                                                        />
                                                        <span class="truncate"
                                                            >跟随聊天当前模型</span
                                                        >
                                                    </CommandItem>
                                                    <CommandItem
                                                        v-for="m in selectableModels"
                                                        :key="`${item.key}:${m.id}`"
                                                        :value="`${formatModelName(m.id)} ${m.id} ${m.owned_by || ''} ${m.type || ''}`"
                                                        class="py-2"
                                                        @select="
                                                            () =>
                                                                setAssignmentValue(
                                                                    item.key,
                                                                    m.id,
                                                                )
                                                        "
                                                    >
                                                        <Check
                                                            class="h-4 w-4"
                                                            :class="{
                                                                'opacity-100':
                                                                    getAssignmentValue(
                                                                        item.key,
                                                                    ) === m.id,
                                                                'opacity-0':
                                                                    getAssignmentValue(
                                                                        item.key,
                                                                    ) !== m.id,
                                                            }"
                                                        />
                                                        <div class="min-w-0">
                                                            <div
                                                                class="truncate"
                                                            >
                                                                {{
                                                                    formatModelName(
                                                                        m.id,
                                                                    )
                                                                }}
                                                            </div>
                                                            <div
                                                                class="truncate text-xs text-muted-foreground"
                                                            >
                                                                {{ m.owned_by }}
                                                                · {{ m.type }} ·
                                                                {{ m.id }}
                                                            </div>
                                                        </div>
                                                    </CommandItem>
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                    </div>
                </div>

                <div v-else-if="view === 'models'" class="space-y-4">
                    <div class="flex items-center gap-2 flex-wrap">
                        <Select v-model="modelFilterType">
                            <SelectTrigger class="h-8 w-48">
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

                        <Select v-model="modelFilterOwner">
                            <SelectTrigger class="h-8 w-56">
                                <SelectValue placeholder="开发商" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部开发商</SelectItem>
                                <SelectItem
                                    v-for="o in availableModelOwners"
                                    :key="o"
                                    :value="o"
                                >
                                    {{ o }}
                                </SelectItem>
                            </SelectContent>
                        </Select>

                        <Input
                            v-model="modelSearch"
                            class="h-8 w-64"
                            placeholder="搜索模型（名称/ID/描述）"
                        />
                    </div>

                    <div class="flex items-center gap-2 flex-wrap">
                        <Button
                            size="sm"
                            variant="outline"
                            @click="showFilteredModels"
                        >
                            显示当前筛选
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            @click="hideFilteredModels"
                        >
                            隐藏当前筛选
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            @click="showAllModels"
                        >
                            全部显示
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            @click="resetModelFilters"
                        >
                            清空筛选
                        </Button>

                        <div class="text-xs text-muted-foreground ml-auto">
                            当前筛选：{{ filteredModels.length }}
                        </div>
                    </div>

                    <div
                        v-if="isLoadingModels"
                        class="text-sm text-muted-foreground py-6 text-center"
                    >
                        正在加载模型列表...
                    </div>
                    <div
                        v-else-if="modelsError"
                        class="text-sm text-destructive py-6 text-center"
                    >
                        {{ modelsError }}
                    </div>
                    <div
                        v-else
                        class="max-h-[52vh] overflow-auto rounded-md border"
                    >
                        <div
                            v-if="filteredModels.length === 0"
                            class="text-sm text-muted-foreground py-6 text-center"
                        >
                            没有匹配的模型
                        </div>
                        <label
                            v-for="m in filteredModels"
                            :key="m.id"
                            class="flex items-center gap-3 px-3 py-2 border-b last:border-b-0"
                        >
                            <input
                                type="checkbox"
                                class="h-4 w-4"
                                :checked="!settingsStore.isModelHidden(m.id)"
                                @change="
                                    toggleModelVisible(
                                        m.id,
                                        ($event.target as HTMLInputElement)
                                            .checked,
                                    )
                                "
                            />
                            <div class="min-w-0 flex-1">
                                <div
                                    class="text-sm font-medium truncate"
                                    :title="m.id"
                                >
                                    {{ formatModelName(m.id) }}
                                </div>
                                <div
                                    class="text-xs text-muted-foreground truncate"
                                >
                                    {{ m.owned_by }} · {{ m.type }} · {{ m.id }}
                                </div>
                            </div>
                            <Badge
                                v-if="settingsStore.isModelHidden(m.id)"
                                variant="secondary"
                            >
                                已隐藏
                            </Badge>
                        </label>
                    </div>
                </div>

                <div v-else class="space-y-4">
                    <div class="text-sm text-muted-foreground">
                        支持 OpenAI 兼容接口（`GET {baseUrl}/models`）。Key
                        将加密存储在本地；本地服务如 Ollama / LM Studio 可不填写
                        Key。
                    </div>

                    <div class="rounded-md border p-3 space-y-3">
                        <div class="text-sm font-medium">添加新配置</div>

                        <div class="grid gap-2">
                            <div class="text-xs text-muted-foreground">
                                快速预设
                            </div>
                            <div class="flex flex-wrap gap-2">
                                <Button
                                    v-for="preset in providerPresets"
                                    :key="preset.key"
                                    size="sm"
                                    variant="outline"
                                    @click="applyProviderPreset(preset.key)"
                                >
                                    {{ preset.label }}
                                </Button>
                            </div>
                            <div class="text-xs text-muted-foreground">
                                {{
                                    providerPresets
                                        .map(
                                            (preset) =>
                                                `${preset.label}：${preset.description}`,
                                        )
                                        .join("；")
                                }}
                            </div>
                            <div class="text-xs text-muted-foreground">
                                没有API？<a
                                    class="underline underline-offset-4 hover:text-foreground"
                                    href="https://one.gloscai.com/keys"
                                    target="_blank"
                                    rel="noreferrer"
                                    >在这里获取</a
                                >
                            </div>
                        </div>

                        <div class="grid grid-cols-1 gap-3">
                            <div class="grid gap-2">
                                <div class="text-xs text-muted-foreground">
                                    组名
                                </div>
                                <Input
                                    v-model="customDraft.name"
                                    class="h-8"
                                    placeholder="例如：我的私有模型组"
                                />
                            </div>

                            <div class="grid gap-2">
                                <div class="text-xs text-muted-foreground">
                                    API Key
                                </div>
                                <Input
                                    v-model="customDraft.apiKey"
                                    class="h-8"
                                    :placeholder="
                                        customDraftAllowsEmptyKey
                                            ? '本地服务可留空；有 Key 也可填写'
                                            : '粘贴你的 Key（本地加密保存）'
                                    "
                                    type="password"
                                />
                            </div>

                            <div class="grid gap-2">
                                <div class="text-xs text-muted-foreground">
                                    Base URL
                                </div>
                                <Input
                                    v-model="customDraft.baseUrl"
                                    class="h-8"
                                    placeholder="例如：https://api.openai.com/v1（必须包含 /v1）"
                                />
                            </div>

                            <div class="flex items-center gap-2">
                                <Button
                                    size="sm"
                                    variant="default"
                                    :disabled="customSaving"
                                    @click="addCustomProviderAndProbe"
                                >
                                    {{
                                        customSaving
                                            ? "验证中..."
                                            : "验证并保存"
                                    }}
                                </Button>
                                <div class="text-xs text-muted-foreground">
                                    验证会直接调用该服务商接口拉取模型列表
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="rounded-md border overflow-hidden">
                        <div
                            v-if="(customModelProviders || []).length === 0"
                            class="text-sm text-muted-foreground py-6 text-center"
                        >
                            暂无自定义模型配置
                        </div>

                        <div
                            v-for="p in customModelProviders"
                            :key="p.id"
                            class="px-3 py-3 border-b last:border-b-0 flex items-start gap-3"
                        >
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2">
                                    <div class="text-sm font-medium truncate">
                                        {{ p.name }}
                                    </div>
                                    <Badge v-if="p.enabled" variant="secondary">
                                        已启用
                                    </Badge>
                                    <Badge v-else variant="outline"
                                        >已禁用</Badge
                                    >
                                </div>
                                <div class="text-xs text-muted-foreground mt-1">
                                    Key：{{ maskKey(p.apiKey) }}
                                </div>
                                <div
                                    v-if="p.baseUrl"
                                    class="text-xs text-muted-foreground truncate"
                                >
                                    BaseUrl：{{ p.baseUrl }}
                                </div>
                                <div class="text-xs text-muted-foreground mt-1">
                                    模型数：{{ (p.models || []).length }}
                                    <span v-if="p.lastValidatedAt">
                                        · 最近验证：{{
                                            new Date(
                                                p.lastValidatedAt,
                                            ).toLocaleString()
                                        }}
                                    </span>
                                </div>
                            </div>

                            <div class="flex items-center gap-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    @click="
                                        settingsStore.setCustomModelProviderEnabled(
                                            p.id,
                                            !p.enabled,
                                        )
                                    "
                                >
                                    {{ p.enabled ? "禁用" : "启用" }}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    @click="refreshCustomProvider(p.id)"
                                >
                                    验证/刷新
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    class="text-destructive"
                                    @click="confirmDeleteProviderId === p.id ? confirmDeleteProvider() : removeCustomProvider(p.id)"
                                >
                                    {{ confirmDeleteProviderId === p.id ? '确认删除' : '删除' }}
                                </Button>
                                <Button
                                    v-if="confirmDeleteProviderId === p.id"
                                    size="sm"
                                    variant="outline"
                                    @click="confirmDeleteProviderId = null"
                                >
                                    取消
                                </Button></div>
                        </div>
                    </div>
                </div>
            </div>

            <DialogFooter>
                <Button variant="ghost" @click="closeModelSettings"
                    >关闭</Button
                >
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
