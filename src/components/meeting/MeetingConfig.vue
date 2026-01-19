<script setup lang="ts">
import { computed, ref } from "vue";
import { useMeetingStore } from "@/stores/meeting";
import { storeToRefs } from "pinia";
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

const props = defineProps<{
    meetingId: string;
}>();

const emit = defineEmits<{
    startMeeting: [];
}>();

const meetingStore = useMeetingStore();
const { activeMeeting, availableModels } = storeToRefs(meetingStore);

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
});

const isEditMode = computed(() => editingRoleId.value !== null);

function startEditTitle() {
    editingTitleValue.value = activeMeeting.value?.title || "";
    editingTitle.value = true;
}

async function saveTitle() {
    if (editingTitleValue.value.trim()) {
        await meetingStore.renameMeeting(props.meetingId, editingTitleValue.value.trim());
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
    await meetingStore.updateMeetingSummary(props.meetingId, editingSummaryValue.value);
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
    };
    roleDialogOpen.value = true;
}

async function saveRole() {
    if (!roleForm.value.name.trim()) {
        alert("请输入角色名称");
        return;
    }

    if (isEditMode.value && editingRoleId.value) {
        await meetingStore.updateRole(props.meetingId, editingRoleId.value, {
            name: roleForm.value.name,
            avatar: roleForm.value.avatar,
            modelId: roleForm.value.modelId,
            systemPrompt: roleForm.value.systemPrompt,
            color: roleForm.value.color,
        });
    } else {
        await meetingStore.addRole(props.meetingId, {
            name: roleForm.value.name,
            avatar: roleForm.value.avatar,
            modelId: roleForm.value.modelId,
            systemPrompt: roleForm.value.systemPrompt,
            color: roleForm.value.color,
        });
    }

    roleDialogOpen.value = false;
}

async function deleteRole(roleId: string) {
    if (confirm("确定要删除此角色吗？")) {
        await meetingStore.deleteRole(props.meetingId, roleId);
    }
}

function startMeeting() {
    if (!activeMeeting.value?.roles.length) {
        alert("请至少添加一个角色");
        return;
    }
    emit("startMeeting");
}

function onModelSelect(model: ModelInfo | null) {
    if (model) {
        roleForm.value.modelId = model.id;
    }
}

const selectedModel = computed(() => {
    return availableModels.value.find((m) => m.id === roleForm.value.modelId) || null;
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
                            <Button
                                variant="ghost"
                                size="sm"
                                @click="startEditTitle"
                            >
                                <Edit class="w-4 h-4" />
                            </Button>
                        </div>
                        <div v-else class="flex items-center gap-2 mt-1">
                            <Input
                                v-model="editingTitleValue"
                                placeholder="输入会议名称"
                                @keyup.enter="saveTitle"
                                @keyup.esc="cancelEditTitle"
                            />
                            <Button size="sm" @click="saveTitle">保存</Button>
                            <Button
                                size="sm"
                                variant="outline"
                                @click="cancelEditTitle"
                            >
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
                            <Button
                                variant="outline"
                                size="sm"
                                class="mt-2"
                                @click="startEditSummary"
                            >
                                <Edit class="w-4 h-4 mr-2" />
                                编辑背景
                            </Button>
                        </div>
                        <div v-else class="space-y-2">
                            <Textarea
                                v-model="editingSummaryValue"
                                rows="6"
                                placeholder="描述会议的主题、目标、背景信息..."
                            />
                            <div class="flex gap-2">
                                <Button size="sm" @click="saveSummary">保存</Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    @click="cancelEditSummary"
                                >
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
                    <div
                        v-if="!activeMeeting?.roles.length"
                        class="text-center py-12 text-muted-foreground"
                    >
                        <Users class="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>还没有添加角色</p>
                        <p class="text-sm mt-1">点击上方按钮添加第一个角色</p>
                    </div>
                    <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card
                            v-for="role in activeMeeting?.roles"
                            :key="role.id"
                            class="border"
                        >
                            <CardContent class="pt-6">
                                <div class="flex items-start gap-3">
                                    <div
                                        class="w-12 h-12 rounded-full flex items-center justify-center text-2xl shrink-0"
                                        :style="{ backgroundColor: role.color + '20' }"
                                    >
                                        {{ role.avatar || "👤" }}
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <h3 class="font-semibold truncate">
                                            {{ role.name }}
                                        </h3>
                                        <p class="text-xs text-muted-foreground mt-1">
                                            模型: {{ role.modelId }}
                                        </p>
                                        <p
                                            class="text-sm mt-2 line-clamp-2 text-muted-foreground"
                                        >
                                            {{ role.systemPrompt || "无角色设定" }}
                                        </p>
                                    </div>
                                    <div class="flex gap-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            @click="openEditRoleDialog(role)"
                                        >
                                            <Edit class="w-4 h-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            @click="deleteRole(role.id)"
                                        >
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
                <Button
                    size="lg"
                    @click="startMeeting"
                    :disabled="!activeMeeting?.roles.length"
                    class="gap-2"
                >
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
                        <Input
                            v-model="roleForm.name"
                            placeholder="例如：产品经理、技术专家、用户代表..."
                            class="mt-1"
                        />
                    </div>

                    <div>
                        <Label>头像 (Emoji)</Label>
                        <Input
                            v-model="roleForm.avatar"
                            placeholder="输入一个 emoji，例如：👨‍💼"
                            class="mt-1"
                        />
                    </div>

                    <div>
                        <Label>角色颜色</Label>
                        <Input
                            v-model="roleForm.color"
                            type="color"
                            class="mt-1 h-10"
                        />
                    </div>

                    <div>
                        <Label>使用模型 *</Label>
                        <ModelSelectorPicker
                            :models="availableModels"
                            :selected-model="selectedModel"
                            @update:selected-model="onModelSelect"
                            class="mt-1"
                        />
                    </div>

                    <div>
                        <Label>角色设定 (System Prompt)</Label>
                        <p class="text-xs text-muted-foreground mt-1 mb-2">
                            定义角色的人设、专业领域、说话风格、立场观点等
                        </p>
                        <Textarea
                            v-model="roleForm.systemPrompt"
                            rows="6"
                            placeholder="例如：你是一位资深的产品经理，擅长用户体验设计和需求分析。你总是以用户为中心思考问题，善于提出建设性的意见..."
                            class="mt-1"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button
                        variant="outline"
                        @click="roleDialogOpen = false"
                    >
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
