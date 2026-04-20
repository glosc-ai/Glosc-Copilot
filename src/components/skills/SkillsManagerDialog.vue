<script setup lang="ts">
import { open } from "@tauri-apps/plugin-dialog";
import {
    Eye,
    FileArchive,
    FolderOpen,
    Globe,
    Loader2,
    Trash2,
} from "lucide-vue-next";

import { upsertMcpServersInStore } from "@/utils/McpImportUtils";
import {
    importCompatibleSource,
    type IImportedSkill,
} from "@/utils/SkillCompatibility";
import { useSkillsStore } from "@/stores/skills";

const uiStore = useUiStore();
const skillsStore = useSkillsStore();
const mcpStore = useMcpStore();

const loadedOnce = ref(false);
const importingKind = ref<"url" | "file" | "directory" | null>(null);
const urlDialogOpen = ref(false);
const urlInput = ref("");
const previewSkill = ref<IImportedSkill | null>(null);

const enabledCount = computed(() => skillsStore.enabledSkillCount);

const canUseLocalDialog = computed(() => Boolean((window as any).__TAURI_INTERNALS__));

const ensureLoaded = async () => {
    await Promise.all([skillsStore.init(), mcpStore.init()]);
    loadedOnce.value = true;
};

watch(
    () => uiStore.skillsManagerOpen,
    async (openState) => {
        if (!openState) return;
        if (!loadedOnce.value) {
            await ensureLoaded();
        }
    },
    { immediate: true },
);

function formatSourceLabel(skill: IImportedSkill) {
    const source = skill.source.kind === "url" ? "URL" : skill.source.kind === "file" ? "文件" : "目录";
    return `${source} · ${skill.source.label}`;
}

async function runImport(kind: "url" | "file" | "directory", value: string) {
    importingKind.value = kind;
    try {
        const result = await importCompatibleSource({
            kind,
            value,
        });

        if (result.skills.length > 0) {
            await skillsStore.upsertImportedSkills(result.skills);
        }

        let mcpSummaryText = "";
        if (result.mcpConfigs.length > 0) {
            const summary = await upsertMcpServersInStore({
                mcpStore,
                configs: result.mcpConfigs,
                enableImported: true,
            });
            if (summary.added > 0 || summary.updated > 0) {
                mcpSummaryText = `，MCP 新增 ${summary.added} 个、更新 ${summary.updated} 个`;
            }
        }

        ElMessage.success(
            `导入完成：Skills ${result.skills.length} 个${mcpSummaryText}`,
        );

        if (result.warnings.length > 0) {
            ElMessage.warning(result.warnings.join("；"));
        }
    } catch (error) {
        ElMessage.error(
            error instanceof Error ? error.message : String(error || "导入失败"),
        );
    } finally {
        importingKind.value = null;
    }
}

async function importFromUrl() {
    const value = urlInput.value.trim();
    if (!value) {
        ElMessage.warning("请输入 URL");
        return;
    }
    await runImport("url", value);
    urlDialogOpen.value = false;
    urlInput.value = "";
}

async function importFromDirectory() {
    if (!canUseLocalDialog.value) {
        ElMessage.warning("当前环境仅支持 URL 导入");
        return;
    }

    const selected = await open({
        directory: true,
        recursive: true,
        multiple: false,
        title: "选择 Skill / 插件目录",
    });

    if (!selected || Array.isArray(selected)) return;
    await runImport("directory", String(selected));
}

async function importFromFile() {
    if (!canUseLocalDialog.value) {
        ElMessage.warning("当前环境仅支持 URL 导入");
        return;
    }

    const selected = await open({
        directory: false,
        multiple: false,
        title: "选择 Skill 文件或压缩包",
        filters: [
            {
                name: "兼容包",
                extensions: ["zip", "md", "markdown", "json", "jsonc", "yaml", "yml"],
            },
        ],
    });

    if (!selected || Array.isArray(selected)) return;
    await runImport("file", String(selected));
}

async function toggleSkill(skill: IImportedSkill, checked: boolean) {
    await skillsStore.toggleSkill(skill.id, checked);
}

async function removeSkill(skill: IImportedSkill) {
    try {
        await ElMessageBox.confirm(
            `确定删除 Skill「${skill.name}」吗？`,
            "删除 Skill",
            {
                confirmButtonText: "删除",
                cancelButtonText: "取消",
                type: "warning",
            },
        );
        await skillsStore.removeSkill(skill.id);
        if (previewSkill.value?.id === skill.id) {
            previewSkill.value = null;
        }
    } catch {
        // 用户取消
    }
}

async function setAllEnabled(enabled: boolean) {
    await skillsStore.setSkillEnabledAll(enabled);
}

function openPreview(skill: IImportedSkill) {
    previewSkill.value = skill;
}

function closePreview() {
    previewSkill.value = null;
}
</script>

<template>
    <Dialog v-model:open="uiStore.skillsManagerOpen">
        <DialogContent class="w-[92vw] md:max-w-225 h-[85vh] flex flex-col">
            <DialogHeader>
                <div class="flex items-center justify-between gap-3">
                    <div>
                        <DialogTitle>Skills 管理</DialogTitle>
                        <DialogDescription>
                            导入并管理 Agent Skills / ClawHub 兼容技能包。
                        </DialogDescription>
                    </div>
                    <div class="flex items-center gap-2">
                        <Button variant="outline" @click="urlDialogOpen = true">
                            <Globe class="w-4 h-4 mr-2" />
                            从 URL 导入
                        </Button>
                        <Button variant="outline" @click="importFromDirectory">
                            <FolderOpen class="w-4 h-4 mr-2" />
                            导入目录
                        </Button>
                        <Button variant="outline" @click="importFromFile">
                            <FileArchive class="w-4 h-4 mr-2" />
                            导入文件
                        </Button>
                        <Button variant="ghost" @click="uiStore.closeSkillsManager">
                            关闭
                        </Button>
                    </div>
                </div>
            </DialogHeader>

            <div class="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                <div class="text-muted-foreground">
                    共 {{ skillsStore.skills.length }} 个 Skills，已启用
                    {{ enabledCount }} 个。
                </div>
                <div class="flex items-center gap-2">
                    <Button variant="outline" size="sm" @click="setAllEnabled(true)">
                        全部启用
                    </Button>
                    <Button variant="outline" size="sm" @click="setAllEnabled(false)">
                        全部停用
                    </Button>
                </div>
            </div>

            <div class="flex-1 overflow-y-auto pr-1">
                <div
                    v-if="skillsStore.skills.length === 0"
                    class="h-full flex items-center justify-center text-sm text-muted-foreground"
                >
                    暂无已导入 Skills。可导入 Agent Skills 标准目录、zip、SKILL.md，
                    或 ClawHub/OpenClaw 页面 URL。
                </div>

                <div v-else class="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    <div
                        v-for="skill in skillsStore.skills"
                        :key="skill.id"
                        class="rounded-lg border bg-card p-4 flex flex-col gap-3"
                    >
                        <div class="space-y-2">
                            <div class="flex items-start justify-between gap-3">
                                <div class="min-w-0 flex-1">
                                    <div class="font-semibold truncate">
                                        {{ skill.name }}
                                    </div>
                                    <div class="text-xs text-muted-foreground mt-1 line-clamp-2">
                                        {{ skill.description }}
                                    </div>
                                </div>
                                <input
                                    type="checkbox"
                                    class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                    :checked="skill.enabled"
                                    @change="
                                        toggleSkill(
                                            skill,
                                            ($event.target as HTMLInputElement).checked,
                                        )
                                    "
                                />
                            </div>

                            <div class="flex flex-wrap gap-2">
                                <Badge variant="secondary">
                                    {{ skill.enabled ? "已启用" : "已停用" }}
                                </Badge>
                                <Badge
                                    v-for="tag in skill.ecosystemTags.slice(0, 3)"
                                    :key="tag"
                                    variant="outline"
                                >
                                    {{ tag }}
                                </Badge>
                                <Badge v-if="skill.bundledMcpCount > 0" variant="outline">
                                    bundled MCP {{ skill.bundledMcpCount }}
                                </Badge>
                            </div>

                            <div class="text-xs text-muted-foreground break-all">
                                {{ formatSourceLabel(skill) }}
                            </div>
                        </div>

                        <div class="text-xs text-muted-foreground space-y-1">
                            <div>
                                文件 {{ skill.files.length }} 个
                                <span v-if="skill.allowedTools.length > 0">
                                    · allowed-tools:
                                    {{ skill.allowedTools.join(", ") }}
                                </span>
                            </div>
                            <div v-if="skill.packageMeta?.summary">
                                {{ skill.packageMeta.summary }}
                            </div>
                        </div>

                        <div class="mt-auto flex items-center justify-end gap-2">
                            <Button variant="outline" size="sm" @click="openPreview(skill)">
                                <Eye class="w-4 h-4 mr-1" />
                                查看
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                class="text-destructive hover:text-destructive"
                                @click="removeSkill(skill)"
                            >
                                <Trash2 class="w-4 h-4 mr-1" />
                                删除
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <Dialog v-model:open="urlDialogOpen">
                <DialogContent class="max-w-xl">
                    <DialogHeader>
                        <DialogTitle>从 URL 导入</DialogTitle>
                        <DialogDescription>
                            支持 ClawHub 页面、zip 包、SKILL.md、JSON/YAML MCP 配置 URL。
                        </DialogDescription>
                    </DialogHeader>
                    <div class="space-y-3">
                        <Input
                            v-model="urlInput"
                            placeholder="https://clawhub.ai/... 或 https://.../skill.zip"
                            @keydown.enter.prevent="importFromUrl"
                        />
                        <div class="flex justify-end gap-2">
                            <Button variant="ghost" @click="urlDialogOpen = false">
                                取消
                            </Button>
                            <Button :disabled="importingKind === 'url'" @click="importFromUrl">
                                <Loader2
                                    v-if="importingKind === 'url'"
                                    class="w-4 h-4 mr-2 animate-spin"
                                />
                                导入
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog :open="Boolean(previewSkill)" @update:open="(openState) => !openState && closePreview()">
                <DialogContent class="w-[92vw] md:max-w-4xl h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>{{ previewSkill?.name || "Skill 详情" }}</DialogTitle>
                        <DialogDescription>
                            {{ previewSkill?.description || "查看导入的 Skill 指令与元数据" }}
                        </DialogDescription>
                    </DialogHeader>

                    <div
                        v-if="previewSkill"
                        class="flex-1 overflow-y-auto space-y-4 text-sm"
                    >
                        <div class="grid gap-2 rounded-lg border p-4">
                            <div><strong>来源：</strong>{{ formatSourceLabel(previewSkill) }}</div>
                            <div v-if="previewSkill.compatibility">
                                <strong>兼容性：</strong>{{ previewSkill.compatibility }}
                            </div>
                            <div v-if="previewSkill.license">
                                <strong>License：</strong>{{ previewSkill.license }}
                            </div>
                            <div v-if="previewSkill.allowedTools.length > 0">
                                <strong>allowed-tools：</strong>
                                {{ previewSkill.allowedTools.join(", ") }}
                            </div>
                            <div v-if="previewSkill.packageMeta?.sourceRepo">
                                <strong>源仓库：</strong>{{ previewSkill.packageMeta.sourceRepo }}
                                <span v-if="previewSkill.packageMeta.sourceTag">
                                    @{{ previewSkill.packageMeta.sourceTag }}
                                </span>
                            </div>
                            <div v-if="previewSkill.warnings.length > 0">
                                <strong>兼容提醒：</strong>
                                {{ previewSkill.warnings.join("；") }}
                            </div>
                        </div>

                        <div class="grid gap-2 rounded-lg border p-4">
                            <div class="font-medium">文件</div>
                            <div
                                v-if="previewSkill.files.length === 0"
                                class="text-muted-foreground"
                            >
                                无附带文件摘要
                            </div>
                            <div
                                v-else
                                class="max-h-40 overflow-y-auto rounded border bg-muted/20 p-3 text-xs"
                            >
                                <div
                                    v-for="file in previewSkill.files"
                                    :key="file.path"
                                    class="flex items-center justify-between gap-3 py-1"
                                >
                                    <span class="truncate">{{ file.path }}</span>
                                    <span class="shrink-0 text-muted-foreground">
                                        {{ file.kind }} · {{ file.size }} B
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div class="grid gap-2 rounded-lg border p-4 min-h-0">
                            <div class="font-medium">SKILL.md</div>
                            <Textarea
                                :model-value="previewSkill.rawMarkdown"
                                rows="20"
                                readonly
                                class="resize-none font-mono text-xs"
                            />
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </DialogContent>
    </Dialog>
</template>
