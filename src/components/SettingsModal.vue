<script lang="ts" setup>
import { computed, ref, watch } from "vue";
import { formatModelName } from "@/utils/ModelApi";
import { storeToRefs } from "pinia";
import type { ModelInfo } from "@/utils/interface";

const uiStore = useUiStore();
const settingsStore = useSettingsStore();
const chatStore = useChatStore();
const authStore = useAuthStore();
const { availableModels, isLoadingModels, modelsError } =
    storeToRefs(chatStore);
const { hiddenModelIds } = storeToRefs(settingsStore);
const { customModelProviders } = storeToRefs(settingsStore);

type SettingsView = "main" | "models" | "custom-models";
const view = ref<SettingsView>("main");

const themeModeProxy = computed({
    get: () => settingsStore.themeMode,
    set: (v: any) => {
        void settingsStore.setThemeMode(v);
    },
});

const languageProxy = computed({
    get: () => settingsStore.language,
    set: (v: any) => {
        void settingsStore.setLanguage(v);
    },
});

const modelFilterType = ref<string>("all");
const modelFilterOwner = ref<string>("all");
const modelSearch = ref<string>("");

const totalModelCount = computed(() => (availableModels.value || []).length);

const hiddenCount = computed(() => {
    const hidden = new Set(hiddenModelIds.value || []);
    return (availableModels.value || []).filter((m) => hidden.has(m.id)).length;
});

const visibleCount = computed(() => totalModelCount.value - hiddenCount.value);

const allowedDirsDraft = ref("");

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

async function openCustomModelManager() {
    view.value = "custom-models";
    void settingsStore.init();
}

function closeSettings() {
    uiStore.closeSettings();
}

const customProviderCount = computed(
    () => (customModelProviders.value || []).length,
);

const enabledCustomProviderCount = computed(
    () => (customModelProviders.value || []).filter((p) => p.enabled).length,
);

const customDraft = ref({
    name: "",
    apiKey: "",
    baseUrl: "https://api.openai.com/v1",
});

const customSaving = ref(false);

function maskKey(key: string) {
    const k = String(key || "");
    if (k.length <= 8) return "********";
    return `${k.slice(0, 3)}********${k.slice(-4)}`;
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

    if (!authStore.isLoggedIn) {
        ElMessage.warning("请先登录后再配置自定义模型");
        void authStore.startLogin();
        return;
    }

    const name = customDraft.value.name.trim();
    const apiKey = customDraft.value.apiKey.trim();
    const baseUrl = customDraft.value.baseUrl.trim();

    if (!name) {
        ElMessage.warning("请填写配置名称");
        return;
    }
    if (!apiKey) {
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
            baseUrl: "https://api.openai.com/v1",
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
    if (!authStore.isLoggedIn) {
        ElMessage.warning("请先登录后再验证 Key");
        void authStore.startLogin();
        return;
    }
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
    try {
        await ElMessageBox.confirm(
            "确定要删除该自定义模型配置吗？（本地加密保存的 Key 也会一并删除）",
            "提示",
            {
                type: "warning",
                confirmButtonText: "删除",
                cancelButtonText: "取消",
            },
        );
    } catch {
        return;
    }

    await settingsStore.removeCustomModelProvider(id);
    await chatStore.loadAvailableModels();
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
    () => uiStore.settingsOpen,
    async (open) => {
        if (!open) {
            view.value = "main";
            resetModelFilters();
            return;
        }
        // 进入设置时确保 settings 已初始化（main.ts 会先 init，但这里兜底）
        void settingsStore.init();

        // 同步草稿
        allowedDirsDraft.value = (settingsStore.allowedDirectories || []).join(
            "\n",
        );
    },
    { immediate: true },
);
</script>

<template>
    <Dialog v-model:open="uiStore.settingsOpen">
        <DialogContent
            class="w-[92vw] max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
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
                                  : "设置"
                        }}
                    </span>
                </DialogTitle>
            </DialogHeader>

            <div class="flex-1 overflow-y-auto pr-1">
                <div v-if="view === 'main'" class="space-y-6">
                    <div class="grid gap-2">
                        <div class="text-xs text-muted-foreground">主题</div>
                        <Select v-model="themeModeProxy">
                            <SelectTrigger class="h-8 w-56">
                                <SelectValue placeholder="选择主题" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="system">跟随系统</SelectItem>
                                <SelectItem value="dark">暗色</SelectItem>
                                <SelectItem value="light">亮色</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div class="grid gap-2">
                        <div class="text-xs text-muted-foreground">语言</div>
                        <Select v-model="languageProxy" disabled>
                            <SelectTrigger class="h-8 w-56">
                                <SelectValue placeholder="选择语言" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="zh-CN">简体中文</SelectItem>
                            </SelectContent>
                        </Select>
                        <div class="text-xs text-muted-foreground">
                            当前仅支持简体中文
                        </div>
                    </div>

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
                            自定义模型使用你的第三方 Key，不消耗 Glosc
                            额度/余额；仍需要登录。
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
                        将加密存储在本地。
                    </div>

                    <div class="rounded-md border p-3 space-y-3">
                        <div class="text-sm font-medium">添加新配置</div>

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
                                    placeholder="粘贴你的 Key（本地加密保存）"
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
                                    验证会调用第三方接口拉取模型列表
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
                                    @click="removeCustomProvider(p.id)"
                                >
                                    删除
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <DialogFooter>
                <Button variant="ghost" @click="closeSettings">关闭</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
