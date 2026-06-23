import { execSync, execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const MANIFEST_DIR = dirname(fileURLToPath(import.meta.url));
const PROFILE = process.env.PROFILE || "debug";

function getTarget() {
  if (process.env.TARGET) return process.env.TARGET;
  try {
    const output = execSync("rustc -vV", { encoding: "utf-8" });
    const match = output.match(/host:\s*(.+)/);
    if (match) return match[1].trim();
  } catch {}
  return "unknown";
}

function getHostTarget() {
  try {
    const output = execSync("rustc -vV", { encoding: "utf-8" });
    const match = output.match(/host:\s*(.+)/);
    if (match) return match[1].trim();
  } catch {}
  return "unknown";
}

const TARGET = getTarget();
const HOST_TARGET = getHostTarget();
const isWindows = TARGET.includes("windows");

// Determine source directory
let srcDir;
if (TARGET === HOST_TARGET || TARGET === "unknown") {
  srcDir = join(MANIFEST_DIR, "target", PROFILE === "release" ? "release" : "debug");
} else {
  srcDir = join(MANIFEST_DIR, "target", TARGET, PROFILE === "release" ? "release" : "debug");
}

const destDir = join(MANIFEST_DIR, "binaries");
mkdirSync(destDir, { recursive: true });

function copyBinary(baseName) {
  const binName = isWindows ? `${baseName}.exe` : baseName;
  const source = join(srcDir, binName);

  let destName = `${baseName}-${TARGET}`;
  if (isWindows) destName += ".exe";
  const dest = join(destDir, destName);

  if (existsSync(source)) {
    copyFileSync(source, dest);
    console.log(`Copied ${binName} to ${dest}`);
  } else {
    console.log(`Warning: Binary not found at ${source} — creating placeholder`);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, "");
    console.log(`Created empty placeholder at ${dest}`);
  }
}

copyBinary("donut-proxy");

// Only enforce dist existence for production builds (tauri build, PROFILE=release).
// During dev (tauri dev), dist is served by Next.js dev server and doesn't need a static build.
if (PROFILE === "release" && !existsSync(join(MANIFEST_DIR, "..", "dist"))) {
  console.log("Dist not found, next build will run");
  process.exit(1);
}
