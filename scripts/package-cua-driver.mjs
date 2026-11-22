import { cp, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
const root = resolve(import.meta.dirname, ".."); const platform = process.argv.find((arg) => arg.startsWith("--platform="))?.slice(11); const arch = process.argv.find((arg) => arg.startsWith("--arch="))?.slice(7);
if (!platform || !arch) throw new Error("package_cua_platform_required");
const work = resolve(root, ".ling-cua-driver-build", platform); const output = resolve(root, "dist"); await rm(work, { recursive: true, force: true }); await mkdir(work, { recursive: true });
const providerOutput = resolve(work, "provider"); const args = [resolve(root, "scripts/build-cua-driver-provider.mjs"), "--platform", platform === "darwin" ? "darwin" : "win32-x64", "--work-dir", resolve(work, "work"), "--output-dir", providerOutput]; await run(process.execPath, args);
const staged = resolve(root, ".ling-plugin-runtime"); await rm(staged, { recursive: true, force: true }); await mkdir(join(staged, ".ling-plugin"), { recursive: true }); for (const file of [".ling-plugin/plugin.json", "README.md", "mcp-server.json"]) await cp(resolve(root, file), resolve(staged, file)); await cp(providerOutput, resolve(staged, "runtime/providers/cua-driver"), { recursive: true });
await run(process.execPath, [resolve(root, "scripts/package-plugin.mjs"), "--root", staged, "--output", output, "--platform", platform, "--arch", arch, "--channel", "stable", "--repository", "ling-stack-org/ling-plugin-cua-driver"]);
function run(command, args) { return new Promise((resolveRun, reject) => { const child = spawn(command, args, { cwd: root, stdio: "inherit" }); child.once("error", reject); child.once("exit", (code) => code === 0 ? resolveRun() : reject(new Error(`${command} exited with ${code}`))); }); }
