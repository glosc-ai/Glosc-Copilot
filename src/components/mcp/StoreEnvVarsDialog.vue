<script setup lang="ts">
import { Eye, EyeOff } from "lucide-vue-next";

type EnvVarDef = {
    key: string;
    defaultValue?: string;
    placeholder?: string;
    description?: string;
};

const props = defineProps<{
    open: boolean;
    title?: string;
    envVars: EnvVarDef[];
}>();

const emit = defineEmits<{
    (e: "update:open", v: boolean): void;
    (e: "confirm", values: Record<string, string>): void;
}>();

const localOpen = computed({
    get: () => props.open,
    set: (v) => emit("update:open", v),
});

const values = ref<Record<string, string>>({});
const showSecrets = ref<Record<string, boolean>>({});

const normalizedDefs = computed(() => {
    const defs = Array.isArray(props.envVars) ? props.envVars : [];
    return defs
        .map((d) => ({
            key: String(d?.key || "").trim(),
            defaultValue: String(d?.defaultValue || "").trim(),
            placeholder: String(d?.placeholder || "").trim(),
            description: String(d?.description || "").trim(),
        }))
        .filter((d) => d.key);
});

const isLikelySecretKey = (key: string) => {
    const k = String(key || "").toUpperCase();
    return (
        k.includes("KEY") ||
        k.includes("TOKEN") ||
        k.includes("SECRET") ||
        k.includes("PASSWORD") ||
        k.includes("PASS")
    );
};

const initValues = () => {
    const next: Record<string, string> = {};
    const nextShow: Record<string, boolean> = {};
    for (const d of normalizedDefs.value) {
        next[d.key] = d.defaultValue || "";
        nextShow[d.key] = false;
    }
    values.value = next;
    showSecrets.value = nextShow;
};

watch(
    () => localOpen.value,
    (open) => {
        if (!open) return;
        initValues();
    },
);

function toggleShow(key: string) {
    showSecrets.value = {
        ...showSecrets.value,
        [key]: !showSecrets.value[key],
    };
}

function onConfirm() {
    const defs = normalizedDefs.value;
    if (!defs.length) {
        localOpen.value = false;
        emit("confirm", {});
        return;
    }

    for (const d of defs) {
        if (/^GLOSC_/i.test(d.key)) {
            ElMessage.error(`环境变量 key 不允许以 GLOSC_ 开头：${d.key}`);
            return;
        }
    }

    const out: Record<string, string> = {};
    for (const d of defs) {
        const raw = values.value[d.key];
        const v = String(raw ?? "").trim();
        if (v) out[d.key] = v;
        else if (d.defaultValue) out[d.key] = d.defaultValue;
    }

    localOpen.value = false;
    emit("confirm", out);
}
</script>

<template>
    <Dialog v-model:open="localOpen">
        <DialogContent class="w-[92vw] sm:max-w-xl">
            <DialogHeader>
                <DialogTitle>
                    {{ title || "安装前配置环境变量" }}
                </DialogTitle>
                <DialogDescription>
                    这些值将写入本地 MCP server 的 env（仅保存在你的设备上）。
                </DialogDescription>
            </DialogHeader>

            <div class="space-y-4 max-h-[60vh] overflow-auto pr-1">
                <div
                    v-for="d in normalizedDefs"
                    :key="d.key"
                    class="rounded-md border p-3 space-y-2"
                >
                    <div class="flex items-center justify-between gap-2">
                        <div class="font-medium text-sm">
                            {{ d.key }}
                        </div>
                        <Button
                            v-if="isLikelySecretKey(d.key)"
                            size="sm"
                            variant="ghost"
                            @click="toggleShow(d.key)"
                        >
                            <EyeOff
                                v-if="showSecrets[d.key]"
                                class="w-4 h-4 mr-2"
                            />
                            <Eye v-else class="w-4 h-4 mr-2" />
                            {{ showSecrets[d.key] ? "隐藏" : "显示" }}
                        </Button>
                    </div>

                    <div class="flex items-center gap-2">
                        <Input
                            v-model="values[d.key]"
                            :type="
                                isLikelySecretKey(d.key) && !showSecrets[d.key]
                                    ? 'password'
                                    : 'text'
                            "
                            :placeholder="d.placeholder || d.defaultValue || ''"
                        />
                    </div>

                    <div
                        v-if="d.description"
                        class="text-xs text-muted-foreground"
                    >
                        {{ d.description }}
                    </div>

                    <div
                        v-if="d.defaultValue"
                        class="text-xs text-muted-foreground"
                    >
                        默认值：{{ d.defaultValue }}
                    </div>
                </div>

                <div
                    v-if="!normalizedDefs.length"
                    class="text-sm text-muted-foreground"
                >
                    该插件未定义需要填写的环境变量。
                </div>
            </div>

            <DialogFooter class="gap-2 sm:gap-0">
                <Button variant="outline" @click="localOpen = false"
                    >取消</Button
                >
                <Button @click="onConfirm">继续安装</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
