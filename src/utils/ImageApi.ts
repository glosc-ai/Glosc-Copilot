import { generateImage } from "ai";
import { useSettingsStore } from "@/stores/settings";
import {
    createImageModelFromProvider,
    resolveCustomProviderRequest,
} from "@/utils/LocalAiProvider";

export type GeneratedImageResult = {
    url: string;
    mimeType?: string;
    revoke?: () => void;
};

export type GenerateImageRequest = {
    model: string;
    prompt: string;
    aspectRatio?: `${number}:${number}`;
    n?: number;
    size?: `${number}x${number}`;
    seed?: number;
    providerOptions?: Record<string, any>;
};

export async function requestGeneratedImage(
    input: GenerateImageRequest,
): Promise<GeneratedImageResult> {
    const model = String(input.model || "").trim();
    const trimmedPrompt = String(input.prompt || "").trim();
    if (!model || !trimmedPrompt) {
        throw new Error("model 和 prompt 不能为空");
    }

    const settingsStore = useSettingsStore();
    await settingsStore.init();

    const resolvedRequest = resolveCustomProviderRequest(
        model,
        settingsStore.getCustomModelProviderById,
    );
    if (!resolvedRequest) {
        throw new Error(
            "图片生成仅支持已配置并验证过的本地或自定义 AI 服务商模型。",
        );
    }

    const result = await generateImage({
        model: createImageModelFromProvider(
            resolvedRequest.provider,
            resolvedRequest.rawModelId,
        ),
        prompt: trimmedPrompt,
        aspectRatio: input.aspectRatio,
        n: input.n,
        seed: input.seed,
        size: input.size,
        providerOptions: input.providerOptions ?? {},
    });

    const generatedImage = result.images?.[0] || result.image;
    if (!generatedImage) {
        throw new Error("未生成图片");
    }

    const mimeType = generatedImage.mediaType || "image/png";
    const blob = new Blob([generatedImage.uint8Array], { type: mimeType });
    const url = URL.createObjectURL(blob);

    return {
        url,
        mimeType,
        revoke: () => URL.revokeObjectURL(url),
    };
}
