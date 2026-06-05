import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const DEFAULT_MCP_TOOLS = [
    {
        slug: "glosc-mcp",
        sourceDir: path.join(rootDir, "Plugins", "Glosc-Mcp"),
        resourceName: "glosc-mcp",
        sourceUrl: "https://github.com/glosc-ai/Glosc-Mcp",
    },
];

async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

function readGitCommit(sourceDir) {
    try {
        return execFileSync("git", ["-C", sourceDir, "rev-parse", "HEAD"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
    } catch {
        return "unknown";
    }
}

async function addDirToZip(zip, dir, zipRoot = "") {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;

        const fullPath = path.join(dir, entry.name);
        const zipPath = path.posix.join(zipRoot, entry.name);

        if (entry.isDirectory()) {
            await addDirToZip(zip, fullPath, zipPath);
            continue;
        }

        if (!entry.isFile()) continue;
        zip.addLocalFile(fullPath, path.posix.dirname(zipPath));
    }
}

async function copyDir(sourceDir, targetDir) {
    await fs.mkdir(targetDir, { recursive: true });
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });

    for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;

        const sourcePath = path.join(sourceDir, entry.name);
        const targetPath = path.join(targetDir, entry.name);

        if (entry.isDirectory()) {
            await copyDir(sourcePath, targetPath);
            continue;
        }

        if (!entry.isFile()) continue;
        await fs.copyFile(sourcePath, targetPath);
    }
}

async function addDirToHash(hash, dir, hashRoot = "") {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;

        const fullPath = path.join(dir, entry.name);
        const hashPath = path.posix.join(hashRoot, entry.name);

        if (entry.isDirectory()) {
            hash.update(`dir:${hashPath}\n`);
            await addDirToHash(hash, fullPath, hashPath);
            continue;
        }

        if (!entry.isFile()) continue;
        hash.update(`file:${hashPath}\n`);
        hash.update(await fs.readFile(fullPath));
        hash.update("\n");
    }
}

async function hashDir(dir) {
    const hash = createHash("sha256");
    await addDirToHash(hash, dir);
    return hash.digest("hex");
}

async function prepareTool(tool) {
    if (!(await fileExists(tool.sourceDir))) {
        throw new Error(
            `[prepare-mcp-tools] Missing default MCP tool: ${path.relative(
                rootDir,
                tool.sourceDir,
            )}. Run: git submodule update --init --recursive`,
        );
    }

    const configPath = path.join(tool.sourceDir, "config.yml");
    if (!(await fileExists(configPath))) {
        throw new Error(
            `[prepare-mcp-tools] Missing config.yml: ${path.relative(
                rootDir,
                configPath,
            )}`,
        );
    }

    const outDir = path.join(rootDir, "src-tauri", "resources", "mcp-tools");
    await fs.mkdir(outDir, { recursive: true });

    const resourceDir = path.join(outDir, tool.resourceName);
    await fs.rm(resourceDir, { recursive: true, force: true });
    await copyDir(tool.sourceDir, resourceDir);

    const zip = new AdmZip();
    await addDirToZip(zip, tool.sourceDir);

    const archivePath = path.join(outDir, `${tool.resourceName}.zip`);
    zip.writeZip(archivePath);

    const commit = readGitCommit(tool.sourceDir);
    const contentHash = await hashDir(tool.sourceDir);

    const manifest = {
        slug: tool.slug,
        archive: `${tool.resourceName}.zip`,
        directory: tool.resourceName,
        sourceUrl: tool.sourceUrl,
        commit,
        contentHash,
        configPath: "config.yml",
        generatedAt: new Date().toISOString(),
    };

    const manifestPath = path.join(outDir, `${tool.resourceName}.json`);
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 4)}\n`);

    console.log(
        `[prepare-mcp-tools] Packed ${tool.slug}: ${path.relative(
            rootDir,
            archivePath,
        )}`,
    );
}

for (const tool of DEFAULT_MCP_TOOLS) {
    await prepareTool(tool);
}