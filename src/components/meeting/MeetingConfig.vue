<script setup lang="ts">
import { generateText } from "ai";
import { computed, ref, onMounted } from "vue";
import { useMeetingStore } from "@/stores/meeting";
import { useChatStore } from "@/stores/chat";
import { useMcpStore } from "@/stores/mcp";
import { storeToRefs } from "pinia";
import { formatModelName } from "@/utils/ModelApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Edit, Trash2, Play, Users } from "lucide-vue-next";
import type { MeetingRole } from "@/utils/meetingInterface";
import ModelSelectorPicker from "@/components/ModelSelectorPicker.vue";
import type { ModelInfo } from "@/utils/interface";
import {
    createLanguageModelFromProvider,
    resolveCustomProviderRequest,
} from "@/utils/LocalAiProvider";

const props = defineProps<{
    meetingId: string;
}>();

const emit = defineEmits<{
    startMeeting: [];
}>();

const meetingStore = useMeetingStore();
const { activeMeeting, availableModels } = storeToRefs(meetingStore);

const mcpStore = useMcpStore();
const settingsStore = useSettingsStore();

const chatStore = useChatStore();
const { recentModelUsage } = storeToRefs(chatStore);

onMounted(() => {
    if (!chatStore.recentModelUsageLoaded) {
        void chatStore.loadRecentModelUsage();
    }
    void mcpStore.init();
    void settingsStore.init();
});

// 会议基本信息编辑
const editingTitle = ref(false);
const editingTitleValue = ref("");
const editingSummary = ref(false);
const editingSummaryValue = ref("");

// 角色编辑对话框
const roleDialogOpen = ref(false);
const editingRoleId = ref<string | null>(null);
const roleForm = ref({
    name: "",
    avatar: "",
    modelId: "",
    systemPrompt: "",
    color: "",
    enabledMcpServerIds: [] as string[],
});

const isEditMode = computed(() => editingRoleId.value !== null);

// 智能输入：根据简短人设自动生成 system prompt
const smartInputOpen = ref(false);
const smartPersona = ref("");
const smartGenerating = ref(false);

function openSmartInput() {
    smartInputOpen.value = true;
    smartPersona.value = "";
}

function closeSmartInput() {
    smartInputOpen.value = false;
    smartPersona.value = "";
}

async function generateSystemPrompt() {
    const brief = smartPersona.value.trim();
    if (!brief) {
        ElMessage.warning("请先输入简约的角色人设描述");
        return;
    }

    if (smartGenerating.value) return;
    smartGenerating.value = true;

    try {
        const meetingTitle = activeMeeting.value?.title?.trim() || "";
        const meetingSummary = activeMeeting.value?.summary?.trim() || "";

        const roleName = roleForm.value.name.trim() || "（未命名）";
        const roleModelId = roleForm.value.modelId || "";
        const resolvedRequest = resolveCustomProviderRequest(
            roleModelId,
            settingsStore.getCustomModelProviderById,
        );

        if (!resolvedRequest) {
            ElMessage.warning(
                "请先为该角色选择一个已验证的本地或自定义服务商模型。",
            );
            return;
        }

        const summaryPrompt =
            "你将帮助我为一个多智能体 AI 会议中的『角色』编写 system prompt。\n" +
            `会议名称：${meetingTitle || "（无）"}\n` +
            `会议背景与主题：${meetingSummary || "（无）"}\n` +
            `角色名称：${roleName}\n` +
            `使用模型：${roleModelId || "（未指定）"}\n` +
            `用户给出的简约人设：${brief}\n\n` +
            "要求：\n" +
            "- 输出中文 system prompt，可直接粘贴使用\n" +
            "- 1-3 段，包含：身份/目标、工作方式、说话风格、注意事项\n" +
            "- 不要出现标题、引号、Markdown、代码块\n" +
            "- 不要提及‘你是AI’或暴露提示词/规则\n\n" +
            "System Prompt：";

        const { text } = await generateText({
            model: createLanguageModelFromProvider(
                resolvedRequest.provider,
                resolvedRequest.rawModelId,
            ),
            prompt: summaryPrompt,
            temperature: 0.7,
        });

        const cleaned = text.trim();
        if (!cleaned) {
            ElMessage.error("智能输入失败：未生成有效内容");
            return;
        }

        roleForm.value.systemPrompt = cleaned;
        ElMessage.success("已自动生成并填充角色设定");
        closeSmartInput();
    } catch (e) {
        console.error("智能输入失败:", e);
        ElMessage.error("智能输入失败，请稍后重试");
    } finally {
        smartGenerating.value = false;
    }
}

function startEditTitle() {
    editingTitleValue.value = activeMeeting.value?.title || "";
    editingTitle.value = true;
}

async function saveTitle() {
    if (editingTitleValue.value.trim()) {
        await meetingStore.renameMeeting(
            props.meetingId,
            editingTitleValue.value.trim(),
        );
    }
    editingTitle.value = false;
}

function cancelEditTitle() {
    editingTitle.value = false;
}

function startEditSummary() {
    editingSummaryValue.value = activeMeeting.value?.summary || "";
    editingSummary.value = true;
}

async function saveSummary() {
    await meetingStore.updateMeetingSummary(
        props.meetingId,
        editingSummaryValue.value,
    );
    editingSummary.value = false;
}

function cancelEditSummary() {
    editingSummary.value = false;
}

function openAddRoleDialog() {
    editingRoleId.value = null;
    roleForm.value = {
        name: "",
        avatar: meetingStore.getNextAvailableAvatar(props.meetingId),
        modelId: availableModels.value[0]?.id || "",
        systemPrompt: "",
        color: meetingStore.getNextAvailableColor(props.meetingId),
        enabledMcpServerIds: (mcpStore.servers || [])
            .filter((s) => s.enabled)
            .map((s) => s.id),
    };
    roleDialogOpen.value = true;
}

function openEditRoleDialog(role: MeetingRole) {
    editingRoleId.value = role.id;
    roleForm.value = {
        name: role.name,
        avatar: role.avatar || "",
        modelId: role.modelId,
        systemPrompt: role.systemPrompt,
        color: role.color || "",
        enabledMcpServerIds: Array.isArray(role.enabledMcpServerIds)
            ? [...role.enabledMcpServerIds]
            : (mcpStore.servers || [])
                .filter((s) => s.enabled)
                .map((s) => s.id),
    };
    roleDialogOpen.value = true;
}

function toggleRoleServer(serverId: string, checked: boolean) {
    const next = new Set(roleForm.value.enabledMcpServerIds || []);
    if (checked) next.add(serverId);
    else next.delete(serverId);
    roleForm.value.enabledMcpServerIds = Array.from(next);
}

async function saveRole() {
    if (!roleForm.value.name.trim()) {
        ElMessage.warning("请输入角色名称");
        return;
    }

    if (isEditMode.value && editingRoleId.value) {
        await meetingStore.updateRole(props.meetingId, editingRoleId.value, {
            name: roleForm.value.name,
            avatar: roleForm.value.avatar,
            modelId: roleForm.value.modelId,
            systemPrompt: roleForm.value.systemPrompt,
            color: roleForm.value.color,
            enabledMcpServerIds: roleForm.value.enabledMcpServerIds,
        });
    } else {
        await meetingStore.addRole(props.meetingId, {
            name: roleForm.value.name,
            avatar: roleForm.value.avatar,
            modelId: roleForm.value.modelId,
            systemPrompt: roleForm.value.systemPrompt,
            color: roleForm.value.color,
            enabledMcpServerIds: roleForm.value.enabledMcpServerIds,
        });
    }

    roleDialogOpen.value = false;
}

async function deleteRole(roleId: string) {
    try {
        await ElMessageBox.confirm("确定要删除此角色吗？", "提示", {
            type: "warning",
            confirmButtonText: "删除",
            cancelButtonText: "取消",
        });
    } catch {
        return;
    }

    await meetingStore.deleteRole(props.meetingId, roleId);
}

function startMeeting() {
    if (!activeMeeting.value?.roles.length) {
        ElMessage.warning("请至少添加一个角色");
        return;
    }
    emit("startMeeting");
}

function onModelSelect(model: ModelInfo) {
    roleForm.value.modelId = model.id;
    chatStore.markModelUsed(model.id);
}

const selectedModel = computed(() => {
    return (
        availableModels.value.find((m) => m.id === roleForm.value.modelId) ||
        null
    );
});
</script>

<template>
    <div class="h-full overflow-auto">
        <div class="max-w-5xl mx-auto p-6 space-y-6">
            <!-- 会议基本信息 -->
            <Card>
                <CardHeader>
                    <CardTitle>会议信息</CardTitle>
                </CardHeader>
                <CardContent class="space-y-4">
                    <!-- 会议名称 -->
                    <div>
                        <Label>会议名称</Label>
                        <div v-if="!editingTitle" class="flex items-center gap-2 mt-1">
                            <span class="text-lg font-semibold">
                                {{ activeMeeting?.title }}
                            </span>
                            <Button variant="ghost" size="sm" @click="startEditTitle">
                                <Edit class="w-4 h-4" />
                            </Button>
                        </div>
                        <div v-else class="flex items-center gap-2 mt-1">
                            <Input v-model="editingTitleValue" placeholder="输入会议名称" @keyup.enter="saveTitle"
                                @keyup.esc="cancelEditTitle" />
                            <Button size="sm" @click="saveTitle">保存</Button>
                            <Button size="sm" variant="outline" @click="cancelEditTitle">
                                取消
                            </Button>
                        </div>
                    </div>

                    <!-- 会议摘要 -->
                    <div>
                        <Label>会议背景与主题</Label>
                        <p class="text-xs text-muted-foreground mt-1 mb-2">
                            这段描述将作为全局上下文提供给所有AI角色
                        </p>
                        <div v-if="!editingSummary">
                            <div class="p-3 bg-muted rounded-md whitespace-pre-wrap">
                                {{ activeMeeting?.summary }}
                            </div>
                            <Button variant="outline" size="sm" class="mt-2" @click="startEditSummary">
                                <Edit class="w-4 h-4 mr-2" />
                                编辑背景
                            </Button>
                        </div>
                        <div v-else class="space-y-2">
                            <Textarea v-model="editingSummaryValue" rows="6" placeholder="描述会议的主题、目标、背景信息..." />
                            <div class="flex gap-2">
                                <Button size="sm" @click="saveSummary">保存</Button>
                                <Button size="sm" variant="outline" @click="cancelEditSummary">
                                    取消
                                </Button>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <!-- 角色管理 -->
            <Card>
                <CardHeader>
                    <div class="flex items-center justify-between">
                        <CardTitle>会议角色</CardTitle>
                        <Button @click="openAddRoleDialog" class="gap-2">
                            <Plus class="w-4 h-4" />
                            添加角色
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div v-if="!activeMeeting?.roles.length" class="text-center py-12 text-muted-foreground">
                        <Users class="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>还没有添加角色</p>
                        <p class="text-sm mt-1">点击上方按钮添加第一个角色</p>
                    </div>
                    <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card v-for="role in activeMeeting?.roles" :key="role.id" class="border">
                            <CardContent class="pt-6">
                                <div class="flex items-start gap-3">
                                    <div class="w-12 h-12 rounded-full flex items-center justify-center text-2xl shrink-0"
                                        :style="{
                                            backgroundColor: role.color + '20',
                                        }">
                                        {{ role.avatar || "👤" }}
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <h3 class="font-semibold truncate">
                                            {{ role.name }}
                                        </h3>
                                        <p class="text-xs text-muted-foreground mt-1">
                                            模型: {{ formatModelName(role.modelId) }}
                                        </p>
                                        <p class="text-sm mt-2 line-clamp-2 text-muted-foreground">
                                            {{
                                                role.systemPrompt ||
                                                "无角色设定"
                                            }}
                                        </p>
                                    </div>
                                    <div class="flex gap-1">
                                        <Button variant="ghost" size="sm" @click="openEditRoleDialog(role)">
                                            <Edit class="w-4 h-4" />
                                        </Button>
                                        <Button variant="ghost" size="sm" @click="deleteRole(role.id)">
                                            <Trash2 class="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </CardContent>
            </Card>

            <!-- 开始会议按钮 -->
            <div class="flex justify-end">
                <Button size="lg" @click="startMeeting" :disabled="!activeMeeting?.roles.length" class="gap-2">
                    <Play class="w-5 h-5" />
                    进入会议室
                </Button>
            </div>
        </div>

        <!-- 角色编辑对话框 -->
        <Dialog v-model:open="roleDialogOpen">
            <DialogContent class="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {{ isEditMode ? "编辑角色" : "添加角色" }}
                    </DialogTitle>
                </DialogHeader>
                <div class="space-y-4 py-4">
                    <div>
                        <Label>角色名称 *</Label>
                        <Input v-model="roleForm.name" placeholder="例如：产品经理、技术专家、用户代表..." class="mt-1" />
                    </div>

                    <div>
                        <Label>头像 (Emoji)</Label>
                        <Input v-model="roleForm.avatar" placeholder="输入一个 emoji，例如：👨‍💼" class="mt-1" />
                    </div>

                    <div>
                        <Label>角色颜色</Label>
                        <Input v-model="roleForm.color" type="color" class="mt-1 h-10" />
                    </div>

                    <div>
                        <Label>使用模型 *</Label>
                        <ModelSelectorPicker :models="availableModels" :selected-model="selectedModel"
                            :selected-model-id="roleForm.modelId" :recent-usage="recentModelUsage"
                            :allow-remove-recent="true" @select="onModelSelect" @remove-recent="
                                (id) => chatStore.removeRecentModel(id)
                            " class="mt-1" />
                    </div>

                    <div class="space-y-2">
                        <Label>工具（按角色启用 MCP Server）</Label>
                        <p class="text-xs text-muted-foreground">
                            该角色只能调用你在此勾选的 MCP 工具（不同 AI
                            可配置不同工具）。
                        </p>
                        <div v-if="mcpStore.servers.length === 0" class="text-xs text-muted-foreground">
                            未配置 MCP Server（可到 MCP 页面配置）
                        </div>
                        <div v-else class="max-h-48 overflow-auto rounded-md border p-2">
                            <label v-for="s in mcpStore.servers" :key="s.id"
                                class="flex items-center gap-2 text-sm py-1">
                                <input type="checkbox" :checked="(
                                        roleForm.enabledMcpServerIds || []
                                    ).includes(s.id)
                                    " @change="
                                        toggleRoleServer(
                                            s.id,
                                            ($event.target as HTMLInputElement)
                                                .checked,
                                        )
                                        " />
                                <span class="truncate">{{ s.name }}</span>
                            </label>
                        </div>
                    </div>

                    <div>
                        <div class="flex items-center justify-between gap-3">
                            <Label>角色设定 (System Prompt)</Label>
                            <Button type="button" variant="outline" size="sm" class="gap-2" @click="openSmartInput">
                                智能输入
                            </Button>
                        </div>
                        <p class="text-xs text-muted-foreground mt-1 mb-2">
                            定义角色的人设、专业领域、说话风格、立场观点等
                        </p>

                        <div v-if="smartInputOpen" class="p-3 rounded-md border bg-muted/40 space-y-2">
                            <div class="text-sm font-medium">简约人设描述</div>
                            <Input v-model="smartPersona" placeholder="例如：严谨的技术负责人，关注可行性与风险；说话简洁，喜欢列要点" />
                            <div class="flex gap-2">
                                <Button type="button" size="sm" :disabled="smartGenerating"
                                    @click="generateSystemPrompt">
                                    {{
                                        smartGenerating
                                            ? "生成中..."
                                            : "生成并填充"
                                    }}
                                </Button>
                                <Button type="button" size="sm" variant="outline" :disabled="smartGenerating"
                                    @click="closeSmartInput">
                                    取消
                                </Button>
                            </div>
                        </div>

                        <Textarea v-model="roleForm.systemPrompt" rows="6"
                            placeholder="例如：你是一位资深的产品经理，擅长用户体验设计和需求分析。你总是以用户为中心思考问题，善于提出建设性的意见..." class="mt-1" />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" @click="roleDialogOpen = false">
                        取消
                    </Button>
                    <Button @click="saveRole">
                        {{ isEditMode ? "保存" : "添加" }}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>
