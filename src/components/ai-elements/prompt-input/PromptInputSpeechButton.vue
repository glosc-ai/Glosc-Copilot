<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
import { transcribeAudio } from "@/utils/AudioTranscriptionApi";
import { Loader2Icon, MicIcon, SquareIcon } from "lucide-vue-next";
import { ElMessage } from "element-plus";
import { computed, onUnmounted, ref } from "vue";
import { usePromptInput } from "./context";
import PromptInputButton from "./PromptInputButton.vue";

type PromptInputSpeechButtonProps = InstanceType<
    typeof PromptInputButton
>["$props"];

interface Props extends /* @vue-ignore */ PromptInputSpeechButtonProps {
    class?: HTMLAttributes["class"];
}

const props = defineProps<Props>();

const { displayTextInput, setDisplayTextInput } = usePromptInput();

const isListening = ref(false);
const isTranscribing = ref(false);
const mediaRecorder = ref<MediaRecorder | null>(null);
const mediaStream = ref<MediaStream | null>(null);
const chunks: Blob[] = [];

const isSupported = computed(
    () =>
        typeof navigator !== "undefined" &&
        Boolean(navigator.mediaDevices?.getUserMedia) &&
        typeof MediaRecorder !== "undefined",
);

const buttonTitle = computed(() => {
    if (!isSupported.value) return "当前环境不支持录音";
    if (isTranscribing.value) return "正在转写";
    if (isListening.value) return "停止录音并转写";
    return "语音输入";
});

const isDisabled = computed(
    () =>
        Boolean((props as any).disabled) ||
        !isSupported.value ||
        isTranscribing.value,
);

onUnmounted(() => {
    const recorder = mediaRecorder.value;
    if (recorder?.state === "recording") {
        recorder.onstop = null;
        recorder.stop();
    }
    stopMediaStream();
});

function getBestAudioMimeType(): string | undefined {
    const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/mpeg",
        "audio/wav",
    ];

    return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function stopMediaStream() {
    mediaStream.value?.getTracks().forEach((track) => track.stop());
    mediaStream.value = null;
}

function appendTranscript(text: string) {
    const current = displayTextInput.value;
    const cleanText = text.trim();
    if (!cleanText) return;

    const separator =
        current && !/[\s，。！？；：,.!?;:]$/.test(current) ? " " : "";
    setDisplayTextInput(`${current}${separator}${cleanText}`);
}

async function startRecording() {
    if (!isSupported.value) {
        ElMessage.warning("当前环境不支持录音。");
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
        });
        mediaStream.value = stream;
        chunks.length = 0;

        const mimeType = getBestAudioMimeType();
        const recorder = new MediaRecorder(
            stream,
            mimeType ? { mimeType } : undefined,
        );

        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) chunks.push(event.data);
        };

        recorder.onstop = () => {
            const audio = new Blob(chunks, {
                type: recorder.mimeType || chunks[0]?.type || "audio/webm",
            });
            chunks.length = 0;
            stopMediaStream();
            void transcribeRecording(audio);
        };

        mediaRecorder.value = recorder;
        recorder.start();
        isListening.value = true;
    } catch (error) {
        stopMediaStream();
        const message =
            error instanceof Error ? error.message : "无法访问麦克风。";
        ElMessage.error(`无法访问麦克风：${message}`);
    }
}

async function stopRecording() {
    const recorder = mediaRecorder.value;
    if (!recorder) return;

    if (recorder.state !== "inactive") {
        recorder.stop();
    }
    mediaRecorder.value = null;
    isListening.value = false;
}

async function transcribeRecording(audio: Blob) {
    if (audio.size === 0) return;

    isTranscribing.value = true;
    const loadingMessage = ElMessage({
        message: "正在转文字...",
        duration: 0,
        type: "info",
    });

    try {
        const text = await transcribeAudio({
            audio,
        });
        appendTranscript(text);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "语音转文字失败。";
        console.error("Audio transcription error:", error);
        ElMessage.error(message);
    } finally {
        loadingMessage.close();
        isTranscribing.value = false;
    }
}

function toggleListening() {
    if (isTranscribing.value) return;
    if (isListening.value) {
        void stopRecording();
    } else {
        void startRecording();
    }
}
</script>

<template>
    <PromptInputButton
        v-bind="props"
        :disabled="isDisabled"
        :title="buttonTitle"
        :aria-label="buttonTitle"
        :class="
            cn(
                'relative transition-all duration-200',
                isListening && 'animate-pulse bg-accent text-accent-foreground',
                isTranscribing && 'opacity-80',
                props.class,
            )
        "
        @click="toggleListening"
    >
        <Loader2Icon v-if="isTranscribing" class="size-4 animate-spin" />
        <SquareIcon v-else-if="isListening" class="size-4" />
        <MicIcon v-else class="size-4" />
    </PromptInputButton>
</template>
