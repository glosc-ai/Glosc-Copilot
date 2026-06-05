<script setup lang="ts">
import { open } from "@tauri-apps/plugin-dialog";
import {
    Eye,
    FileArchive,
    FolderOpen,
    Globe,
    Loader2,
    RefreshCw,
    StickyNote,
    Trash2,
} from "lucide-vue-next";

import { upsertMcpServersInStore } from "@/utils/McpImportUtils";
import {
    importCompatibleSource,
    type IImportedSkill,
} from "@/utils/SkillCompatibility";
import { openInExplorer } from "@/utils/ExplorerUtils";
import { useSkillsStore } from "@/stores/skills";

const uiStore = useUiStore();
const skillsStore = useSkillsStore();
const mcpStore = useMcpStore();

const loadedOnce = ref(false);
const importingKind = ref<"url" | "file" | "directory" | null>(null);
const urlDialogOpen = ref(false);
const directoriesDialogOpen = ref(false);
const urlInput = ref("");
const previewSkill = ref<IImportedSkill | null>(null);

// 备注编辑弹窗状态
const noteDialogOpen = ref(false);
const noteEditingSkill = ref<IImportedSkill | null>(null);
const noteDraft = ref("");

const enabledCount = computed(() => skillsStore.enabledSkillCount);
const enabledDirectoryCount = computed(
    () =>
        skillsStore.skillDirectories.filter((directory) => directory.enabled)
            .length,
);

const canUseLocalDialog = computed(() =>
    Boolean((window as any).__TAURI_INTERNALS__),
);

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
    const source =
        skill.source.kind === "url"
            ? "URL"
            : skill.source.kind === "file"
              ? "文件"
              : "目录";
    return `${source} · ${skill.source.label}`;
}

function dirnameLike(path: string) {
    const normalized = String(path || "").replace(/\\/g, "/");
    const index = normalized.lastIndexOf("/");
    return index > 0 ? normalized.slice(0, index) : "";
}

function getSkillDirectoryPath(skill: IImportedSkill) {
    const managedRoot = String(
        skill.metadata["skillDirectory.root"] || "",
    ).trim();
    if (managedRoot) return managedRoot;

    if (skill.source.kind === "directory") {
        return skill.source.canonical || skill.source.original;
    }

    if (skill.source.kind === "file") {
        return dirnameLike(skill.source.canonical || skill.source.original);
    }

    return "";
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
            error instanceof Error
                ? error.message
                : String(error || "导入失败"),
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
        title: "选择 Skills 目录",
    });

    if (!selected || Array.isArray(selected)) return;
    await skillsStore.addSkillDirectory({
        path: String(selected),
        agent: "Custom",
        autoDiscovered: false,
    });
    await skillsStore.syncSkillDirectories();
    ElMessage.success("Skills 目录已添加并同步");
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
                extensions: [
                    "zip",
                    "md",
                    "markdown",
                    "json",
                    "jsonc",
                    "yaml",
                    "yml",
                ],
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

// 打开备注编辑弹窗
function openNoteDialog(skill: IImportedSkill) {
    noteEditingSkill.value = skill;
    noteDraft.value = skill.userNote || "";
    noteDialogOpen.value = true;
}

// 保存备注
async function saveSkillNote() {
    const skill = noteEditingSkill.value;
    if (!skill) return;
    await skillsStore.setSkillNote(skill.id, noteDraft.value.trim());
    skill.userNote = noteDraft.value.trim();
    noteDialogOpen.value = false;
    noteEditingSkill.value = null;
}

async function openSkillDirectory(skill: IImportedSkill) {
    const directoryPath = getSkillDirectoryPath(skill);
    if (!directoryPath) {
        ElMessage.warning("该 Skill 没有可打开的本地目录");
        return;
    }

    try {
        await openInExplorer(directoryPath, { isDir: true });
    } catch (error) {
        ElMessage.error(
            error instanceof Error
                ? error.message
                : String(error || "打开目录失败"),
        );
    }
}

async function openDirectoryPath(path: string) {
    try {
        await openInExplorer(path, { isDir: true });
    } catch (error) {
        ElMessage.error(
            error instanceof Error
                ? error.message
                : String(error || "打开目录失败"),
        );
    }
}

async function setAllEnabled(enabled: boolean) {
    await skillsStore.setSkillEnabledAll(enabled);
}

async function discoverDefaultDirectories() {
    await skillsStore.discoverDefaultDirectories();
    await skillsStore.syncSkillDirectories();
    ElMessage.success("已扫描默认 Agent Skills 目录");
    if (skillsStore.lastDirectorySyncWarnings.length > 0) {
        ElMessage.warning(skillsStore.lastDirectorySyncWarnings.join("；"));
    }
}

async function syncDirectories() {
    await skillsStore.syncSkillDirectories();
    ElMessage.success("Skills 目录同步完成");
    if (skillsStore.lastDirectorySyncWarnings.length > 0) {
        ElMessage.warning(skillsStore.lastDirectorySyncWarnings.join("；"));
    }
}

async function toggleDirectory(id: string, checked: boolean) {
    await skillsStore.toggleSkillDirectory(id, checked);
    if (checked) {
        await skillsStore.syncSkillDirectories();
    }
}

async function removeDirectory(id: string) {
    const directory = skillsStore.skillDirectories.find(
        (item) => item.id === id,
    );
    if (!directory) return;

    try {
        await ElMessageBox.confirm(
            `确定移除 Skills 目录「${directory.label}」吗？该目录来源的 Skills 也会从列表中移除。`,
            "移除 Skills 目录",
            {
                confirmButtonText: "移除",
                cancelButtonText: "取消",
                type: "warning",
            },
        );
        await skillsStore.removeSkillDirectory(id);
    } catch {
        // 用户取消
    }
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
                        <Button
                            variant="outline"
                            @click="directoriesDialogOpen = true"
                        >
                            <FolderOpen class="w-4 h-4 mr-2" />
                            Skills 目录
                        </Button>
                        <Button variant="outline" @click="importFromFile">
                            <FileArchive class="w-4 h-4 mr-2" />
                            导入文件
                        </Button>
                        <Button
                            variant="ghost"
                            @click="uiStore.closeSkillsManager"
                        >
                            关闭
                        </Button>
                    </div>
                </div>
            </DialogHeader>

            <div
                class="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2 text-xs"
            >
                <div class="text-muted-foreground">
                    共 {{ skillsStore.skills.length }} 个 Skills，已启用
                    {{ enabledCount }} 个；已管理
                    {{ skillsStore.skillDirectories.length }} 个目录，启用
                    {{ enabledDirectoryCount }} 个。
                </div>
                <div class="flex items-center gap-1.5">
                    <Button
                        variant="outline"
                        size="sm"
                        class="h-7"
                        :disabled="skillsStore.directoriesSyncing"
                        @click="directoriesDialogOpen = true"
                    >
                        <FolderOpen class="w-4 h-4 mr-1" />
                        管理目录
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        class="h-7"
                        @click="setAllEnabled(true)"
                    >
                        全部启用
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        class="h-7"
                        @click="setAllEnabled(false)"
                    >
                        全部停用
                    </Button>
                </div>
            </div>

            <div class="flex-1 overflow-y-auto pr-1">
                <div
                    v-if="skillsStore.skills.length === 0"
                    class="h-full flex items-center justify-center text-sm text-muted-foreground"
                >
                    暂无已导入 Skills。可导入 Agent Skills
                    标准目录、zip、SKILL.md， 或 ClawHub/OpenClaw 页面 URL。
                </div>

                <div v-else class="grid gap-1.5">
                    <div
                        v-for="skill in skillsStore.skills"
                        :key="skill.id"
                        class="rounded-md border bg-card px-3 py-2"
                    >
                        <div class="flex items-start gap-2.5">
                            <input
                                type="checkbox"
                                class="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-primary focus:ring-primary"
                                :checked="skill.enabled"
                                @change="
                                    toggleSkill(
                                        skill,
                                        ($event.target as HTMLInputElement)
                                            .checked,
                                    )
                                "
                            />
                            <div class="min-w-0 flex-1 space-y-1.5">
                                <!-- 名称 + 备注（暗色文本紧随其后） -->
                                <div
                                    class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
                                >
                                    <span class="font-semibold truncate">
                                        {{ skill.name }}
                                    </span>
                                    <span
                                        v-if="skill.userNote"
                                        class="truncate text-xs text-muted-foreground/70 italic"
                                    >
                                        {{ skill.userNote }}
                                    </span>
                                </div>

                                <div
                                    class="text-xs text-muted-foreground line-clamp-1"
                                >
                                    {{ skill.description }}
                                </div>

                                <div
                                    class="flex flex-wrap items-center gap-1.5"
                                >
                                    <Badge
                                        variant="secondary"
                                        class="px-1.5 py-0 text-[11px]"
                                    >
                                        {{
                                            skill.enabled ? "已启用" : "已停用"
                                        }}
                                    </Badge>
                                    <Badge
                                        v-for="tag in skill.ecosystemTags.slice(
                                            0,
                                            3,
                                        )"
                                        :key="tag"
                                        variant="outline"
                                        class="px-1.5 py-0 text-[11px]"
                                    >
                                        {{ tag }}
                                    </Badge>
                                    <Badge
                                        v-if="skill.bundledMcpCount > 0"
                                        variant="outline"
                                        class="px-1.5 py-0 text-[11px]"
                                    >
                                        bundled MCP {{ skill.bundledMcpCount }}
                                    </Badge>
                                    <span
                                        class="text-[11px] text-muted-foreground/80 truncate"
                                    >
                                        {{ formatSourceLabel(skill) }} · 文件
                                        {{ skill.files.length }} 个
                                    </span>
                                </div>
                            </div>

                            <div class="flex shrink-0 items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    class="h-7 w-7"
                                    title="备注"
                                    @click="openNoteDialog(skill)"
                                >
                                    <StickyNote class="w-4 h-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    class="h-7 w-7"
                                    title="打开目录"
                                    :disabled="!getSkillDirectoryPath(skill)"
                                    @click="openSkillDirectory(skill)"
                                >
                                    <FolderOpen class="w-4 h-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    class="h-7 w-7"
                                    title="查看"
                                    @click="openPreview(skill)"
                                >
                                    <Eye class="w-4 h-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    class="h-7 w-7 text-destructive hover:text-destructive"
                                    title="删除"
                                    @click="removeSkill(skill)"
                                >
                                    <Trash2 class="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <Dialog v-model:open="directoriesDialogOpen">
                <DialogContent
                    class="w-[92vw] md:max-w-4xl max-h-[80vh] flex flex-col"
                >
                    <DialogHeader>
                        <div class="flex items-center justify-between gap-3">
                            <div>
                                <DialogTitle>Skills 目录</DialogTitle>
                                <DialogDescription>
                                    管理 Claude、Codex、OpenClaw、OpenCode
                                    与自定义 Skills 目录。
                                </DialogDescription>
                            </div>
                            <div class="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    :disabled="skillsStore.directoriesSyncing"
                                    @click="discoverDefaultDirectories"
                                >
                                    <RefreshCw
                                        class="w-4 h-4 mr-1"
                                        :class="{
                                            'animate-spin':
                                                skillsStore.directoriesSyncing,
                                        }"
                                    />
                                    自动发现
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    :disabled="skillsStore.directoriesSyncing"
                                    @click="syncDirectories"
                                >
                                    <RefreshCw
                                        class="w-4 h-4 mr-1"
                                        :class="{
                                            'animate-spin':
                                                skillsStore.directoriesSyncing,
                                        }"
                                    />
                                    同步
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    @click="importFromDirectory"
                                >
                                    <FolderOpen class="w-4 h-4 mr-1" />
                                    添加
                                </Button>
                            </div>
                        </div>
                    </DialogHeader>

                    <div class="min-h-0 flex-1 overflow-y-auto">
                        <div
                            v-if="skillsStore.skillDirectories.length === 0"
                            class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground"
                        >
                            暂无已管理目录。点击“自动发现”或“添加”开始同步。
                        </div>

                        <div v-else class="grid gap-2">
                            <div
                                v-for="directory in skillsStore.skillDirectories"
                                :key="directory.id"
                                class="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-3"
                            >
                                <div class="min-w-0">
                                    <div class="flex items-center gap-2">
                                        <div
                                            class="truncate text-sm font-medium"
                                        >
                                            {{ directory.label }}
                                        </div>
                                        <Badge variant="outline">{{
                                            directory.agent
                                        }}</Badge>
                                        <Badge
                                            v-if="directory.autoDiscovered"
                                            variant="secondary"
                                        >
                                            自动发现
                                        </Badge>
                                    </div>
                                    <div
                                        class="truncate text-xs text-muted-foreground"
                                    >
                                        {{ directory.path }}
                                    </div>
                                    <div class="text-xs text-muted-foreground">
                                        <span v-if="directory.lastSyncedAt">
                                            已同步
                                            {{
                                                directory.lastSkillCount || 0
                                            }}
                                            个 Skill
                                        </span>
                                        <span v-if="directory.lastWarning">
                                            · {{ directory.lastWarning }}
                                        </span>
                                    </div>
                                </div>

                                <div class="flex shrink-0 items-center gap-2">
                                    <input
                                        type="checkbox"
                                        class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                        :checked="directory.enabled"
                                        @change="
                                            toggleDirectory(
                                                directory.id,
                                                (
                                                    $event.target as HTMLInputElement
                                                ).checked,
                                            )
                                        "
                                    />
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        @click="
                                            openDirectoryPath(directory.path)
                                        "
                                    >
                                        <FolderOpen class="w-4 h-4 mr-1" />
                                        打开
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        class="text-destructive hover:text-destructive"
                                        @click="removeDirectory(directory.id)"
                                    >
                                        <Trash2 class="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog v-model:open="noteDialogOpen">
                <DialogContent class="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>编辑备注</DialogTitle>
                        <DialogDescription>
                            为「{{
                                noteEditingSkill?.name
                            }}」添加仅自己可见的备注。
                        </DialogDescription>
                    </DialogHeader>
                    <div class="space-y-3">
                        <Textarea
                            v-model="noteDraft"
                            rows="4"
                            placeholder="添加仅自己可见的备注"
                            class="resize-none text-sm"
                        />
                        <div class="flex justify-end gap-2">
                            <Button
                                variant="ghost"
                                @click="noteDialogOpen = false"
                            >
                                取消
                            </Button>
                            <Button @click="saveSkillNote"> 保存 </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog v-model:open="urlDialogOpen">
                <DialogContent class="max-w-xl">
                    <DialogHeader>
                        <DialogTitle>从 URL 导入</DialogTitle>
                        <DialogDescription>
                            支持 ClawHub 页面、zip 包、SKILL.md、JSON/YAML MCP
                            配置 URL。
                        </DialogDescription>
                    </DialogHeader>
                    <div class="space-y-3">
                        <Input
                            v-model="urlInput"
                            placeholder="https://clawhub.ai/... 或 https://.../skill.zip"
                            @keydown.enter.prevent="importFromUrl"
                        />
                        <div class="flex justify-end gap-2">
                            <Button
                                variant="ghost"
                                @click="urlDialogOpen = false"
                            >
                                取消
                            </Button>
                            <Button
                                :disabled="importingKind === 'url'"
                                @click="importFromUrl"
                            >
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

            <Dialog
                :open="Boolean(previewSkill)"
                @update:open="(openState) => !openState && closePreview()"
            >
                <DialogContent
                    class="w-[92vw] md:max-w-4xl h-[80vh] flex flex-col"
                >
                    <DialogHeader>
                        <DialogTitle>{{
                            previewSkill?.name || "Skill 详情"
                        }}</DialogTitle>
                        <DialogDescription>
                            {{
                                previewSkill?.description ||
                                "查看导入的 Skill 指令与元数据"
                            }}
                        </DialogDescription>
                    </DialogHeader>

                    <div
                        v-if="previewSkill"
                        class="flex-1 overflow-y-auto space-y-4 text-sm"
                    >
                        <div class="grid gap-2 rounded-lg border p-4">
                            <div>
                                <strong>来源：</strong
                                >{{ formatSourceLabel(previewSkill) }}
                            </div>
                            <div v-if="previewSkill.compatibility">
                                <strong>兼容性：</strong
                                >{{ previewSkill.compatibility }}
                            </div>
                            <div v-if="previewSkill.license">
                                <strong>License：</strong
                                >{{ previewSkill.license }}
                            </div>
                            <div v-if="previewSkill.allowedTools.length > 0">
                                <strong>allowed-tools：</strong>
                                {{ previewSkill.allowedTools.join(", ") }}
                            </div>
                            <div v-if="previewSkill.packageMeta?.sourceRepo">
                                <strong>源仓库：</strong
                                >{{ previewSkill.packageMeta.sourceRepo }}
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
                                    <span class="truncate">{{
                                        file.path
                                    }}</span>
                                    <span
                                        class="shrink-0 text-muted-foreground"
                                    >
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
