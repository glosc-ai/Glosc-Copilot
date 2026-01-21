import {
    resolveResource,
    dirname,
    join,
    appDataDir,
} from "@tauri-apps/api/path";
import { exists, mkdir, readFile, writeFile } from "@tauri-apps/plugin-fs";
import { unzipSync } from "fflate";

async function ensureDir(path: string) {
    const ok = await exists(path);
    if (ok) return;
    await mkdir(path, { recursive: true });
}

function normalizeRelPath(p: string) {
    return String(p || "")
        .replace(/\\/g, "/")
        .replace(/^\/+/, "")
        .replace(/\.\.(\/|$)/g, "")
        .trim();
}

async function unzipToDir(params: { zipPath: string; outDir: string }) {
    const zipBytes = await readFile(params.zipPath);
    const files = unzipSync(zipBytes);

    await ensureDir(params.outDir);

    for (const [rawPath, data] of Object.entries(files)) {
        const rel = normalizeRelPath(rawPath);
        if (!rel) continue;
        if (rel.endsWith("/")) {
            await ensureDir(await join(params.outDir, rel));
            continue;
        }

        const target = await join(params.outDir, rel);
        const parent = target.replace(/[\\/][^\\/]+$/, "");
        if (parent && parent !== target) {
            await ensureDir(parent);
        }

        await writeFile(target, data);
    }
}

export type EnsureBundledNpmResult = {
    rootDir: string;
    npxCliPath: string;
    sourceZipPath: string;
};

let inflight: Promise<EnsureBundledNpmResult> | null = null;

/**
 * 确保 npm 资源是“展开后的目录结构”，优先展开到安装目录的 resources/npm。
 * 若安装目录不可写（例如装在 Program Files），则回退到 appDataDir()/glosc-runtime/npm。
 */
export async function ensureBundledNpmExpanded(): Promise<EnsureBundledNpmResult> {
    if (inflight) return inflight;

    inflight = (async () => {
        const zipPath = await resolveResource("resources/npm.zip");
        const resourcesDir = await dirname(zipPath);

        const installNpmRoot = await join(resourcesDir, "npm");
        const installNpxCli = await join(installNpmRoot, "bin", "npx-cli.js");

        if (await exists(installNpxCli)) {
            return {
                rootDir: installNpmRoot,
                npxCliPath: installNpxCli,
                sourceZipPath: zipPath,
            };
        }

        try {
            await unzipToDir({ zipPath, outDir: installNpmRoot });
            if (await exists(installNpxCli)) {
                return {
                    rootDir: installNpmRoot,
                    npxCliPath: installNpxCli,
                    sourceZipPath: zipPath,
                };
            }
            throw new Error("missing bin/npx-cli.js after unzip");
        } catch (e) {
            // 安装目录可能不可写，回退到 appData。
            console.warn(
                "[npm] failed to expand into install resources dir, fallback to appData",
                e,
            );
        }

        const root = await appDataDir();
        const dataNpmRoot = await join(root, "glosc-runtime", "npm");
        const dataNpxCli = await join(dataNpmRoot, "bin", "npx-cli.js");

        if (!(await exists(dataNpxCli))) {
            await unzipToDir({ zipPath, outDir: dataNpmRoot });
        }

        if (!(await exists(dataNpxCli))) {
            throw new Error("npm 资源解压失败：缺少 bin/npx-cli.js");
        }

        return {
            rootDir: dataNpmRoot,
            npxCliPath: dataNpxCli,
            sourceZipPath: zipPath,
        };
    })().finally(() => {
        inflight = null;
    });

    return inflight;
}
