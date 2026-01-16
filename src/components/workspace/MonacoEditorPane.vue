<script setup lang="ts">
import * as monaco from "monaco-editor";
import "monaco-editor/esm/vs/editor/editor.all.js";
import "monaco-editor/min/vs/editor/editor.main.css";

import { ensureMonacoWorkers } from "@/utils/MonacoSetup";

const props = withDefaults(
    defineProps<{
        value: string;
        language?: string;
        theme?: string;
        readOnly?: boolean;
    }>(),
    {
        language: "plaintext",
        theme: "vs-dark",
        readOnly: false,
    }
);

const emit = defineEmits<{
    (e: "update:value", v: string): void;
    (e: "save"): void;
}>();

const containerRef = ref<HTMLElement | null>(null);

let editor: monaco.editor.IStandaloneCodeEditor | null = null;
let suppressChange = false;

function syncValueIntoEditor(v: string) {
    if (!editor) return;
    const current = editor.getValue();
    if (current === v) return;
    suppressChange = true;
    editor.setValue(v ?? "");
    suppressChange = false;
}

function setEditorLanguage(language: string) {
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;
    monaco.editor.setModelLanguage(model, language || "plaintext");
}

onMounted(() => {
    ensureMonacoWorkers();

    if (!containerRef.value) return;

    editor = monaco.editor.create(containerRef.value, {
        value: props.value ?? "",
        language: props.language,
        theme: props.theme,
        readOnly: props.readOnly,
        automaticLayout: true,
        minimap: { enabled: true },
        fontSize: 13,
        tabSize: 4,
        insertSpaces: true,
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        wordWrap: "on",
    });

    editor.onDidChangeModelContent(() => {
        if (suppressChange) return;
        emit("update:value", editor?.getValue() ?? "");
    });

    // Ctrl/Cmd + S
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        emit("save");
    });
});

watch(
    () => props.value,
    (v) => {
        syncValueIntoEditor(v ?? "");
    }
);

watch(
    () => props.language,
    (lang) => {
        setEditorLanguage(lang ?? "plaintext");
    }
);

watch(
    () => props.theme,
    (t) => {
        if (!editor) return;
        monaco.editor.setTheme(t || "vs-dark");
    }
);

watch(
    () => props.readOnly,
    (ro) => {
        editor?.updateOptions({ readOnly: Boolean(ro) });
    }
);

onBeforeUnmount(() => {
    editor?.dispose();
    editor = null;
});
</script>

<template>
    <div ref="containerRef" class="h-full w-full" />
</template>
