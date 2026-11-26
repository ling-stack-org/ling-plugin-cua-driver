import { execFileSync } from "node:child_process";

export function verifyWindowsReleaseCatalog(catalogPath, payloadPath) {
  const status = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", [
    "$ErrorActionPreference = 'Stop'",
    "$check = Microsoft.PowerShell.Security\\Test-FileCatalog -CatalogFilePath $env:LING_CUA_RELEASE_CATALOG -Path $env:LING_CUA_RELEASE_PAYLOAD -Detailed",
    "[string]$check.Status",
  ].join("\n")], {
    env: { ...process.env, LING_CUA_RELEASE_CATALOG: catalogPath, LING_CUA_RELEASE_PAYLOAD: payloadPath },
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 64 * 1024,
  }).trim();
  if (status !== "Valid") {
    throw new Error("The Windows integrity catalog must cover exactly the staged provider executable and seal.");
  }
}
