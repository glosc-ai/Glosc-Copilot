import { resolveAiFetch } from "@/utils/LocalAiProvider";

const DEFAULT_TRANSCRIPTION_BASE_URL = "https://one.gloscai.com/v1";
const TRANSCRIPTION_MODEL = "openai/whisper-1";
// const FALLBACK_TRANSCRIPTION_MODEL = "whisper-1";

function normalizeBaseUrl(url: string) {
    const trimmed = String(url || "").trim();
    return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function getTranscriptionBaseUrl() {
    return normalizeBaseUrl(
        import.meta.env.VITE_TRANSCRIPTION_API_BASE_URL ||
            DEFAULT_TRANSCRIPTION_BASE_URL,
    );
}

function getGatewayKey() {
    return String(import.meta.env.VITE_GLOSCAI_GATEWAY_KEY || "").trim();
}

function writeAscii(view: DataView, offset: number, value: string) {
    for (let i = 0; i < value.length; i += 1) {
        view.setUint8(offset + i, value.charCodeAt(i));
    }
}

function encodeWav(audioBuffer: AudioBuffer): Blob {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const bytesPerSample = 2;
    const blockAlign = numberOfChannels * bytesPerSample;
    const samples = audioBuffer.length;
    const dataSize = samples * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    writeAscii(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeAscii(view, 8, "WAVE");
    writeAscii(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true);
    writeAscii(view, 36, "data");
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < samples; i += 1) {
        for (let channel = 0; channel < numberOfChannels; channel += 1) {
            const sample = Math.max(
                -1,
                Math.min(1, audioBuffer.getChannelData(channel)[i] || 0),
            );
            view.setInt16(
                offset,
                sample < 0 ? sample * 0x8000 : sample * 0x7fff,
                true,
            );
            offset += bytesPerSample;
        }
    }

    return new Blob([buffer], { type: "audio/wav" });
}

async function convertAudioToWav(audio: Blob): Promise<Blob> {
    if (audio.type.toLowerCase().includes("wav")) return audio;
    if (typeof AudioContext === "undefined") return audio;

    const arrayBuffer = await audio.arrayBuffer();
    const audioContext = new AudioContext();

    try {
        const decoded = await audioContext.decodeAudioData(arrayBuffer);
        return encodeWav(decoded);
    } finally {
        void audioContext.close();
    }
}

async function readErrorMessage(response: Response): Promise<string> {
    const text = await response.text().catch(() => "");
    if (!text) return response.statusText || "转写请求失败";

    try {
        const json = JSON.parse(text);
        return (
            String(json?.error?.message || json?.message || "").trim() || text
        );
    } catch {
        return text;
    }
}

async function requestTranscription(params: {
    baseUrl: string;
    gatewayKey: string;
    audioFile: File;
    model: string;
}): Promise<Response> {
    const formData = new FormData();
    formData.append("file", params.audioFile);
    formData.append("model", params.model);

    const fetchImpl = resolveAiFetch(params.baseUrl);
    return await fetchImpl(`${params.baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${params.gatewayKey}`,
        },
        body: formData,
    });
}

export async function transcribeAudio(params: {
    audio: Blob;
}): Promise<string> {
    const baseUrl = getTranscriptionBaseUrl();
    if (!baseUrl) throw new Error("语音转文字服务地址不能为空。");

    const gatewayKey = getGatewayKey();
    if (!gatewayKey) {
        throw new Error(
            "缺少 VITE_GLOSCAI_GATEWAY_KEY，无法调用语音转文字服务。",
        );
    }

    const uploadAudio = await convertAudioToWav(params.audio);
    const audioFile = new File([uploadAudio], "speech-input.wav", {
        type: "audio/wav",
    });

    let response = await requestTranscription({
        baseUrl,
        gatewayKey,
        audioFile,
        model: TRANSCRIPTION_MODEL,
    });

    if (!response.ok) {
        const errorMessage = await readErrorMessage(response);
        if (errorMessage.toLowerCase().includes("invalid content-type")) {
            response = await requestTranscription({
                baseUrl,
                gatewayKey,
                audioFile,
                model: TRANSCRIPTION_MODEL,
            });
        } else {
            throw new Error(
                `语音转文字失败(${response.status})：${errorMessage}`,
            );
        }
    }

    if (!response.ok) {
        throw new Error(
            `语音转文字失败(${response.status})：${await readErrorMessage(response)}`,
        );
    }

    const json: any = await response.json();
    const text = String(json?.text || json?.data?.text || "").trim();
    if (!text) throw new Error("语音转文字服务没有返回文本。");
    return text;
}
