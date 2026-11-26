import { execFileSync, spawnSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { join } from "node:path";
import { cuaDriverArtifactLayoutFor, cuaDriverArtifactPlatformForRuntime } from "./cua-driver-artifact-layout.mjs";
import { inspectArm64MachO, inspectWindowsPe } from "./cua-driver-binary-identity.mjs";
import { CUA_DRIVER_COMMITTED_LOCK_SHA256 } from "./cua-driver-package-staging-contract.mjs";
import { assertSafeTree, readBoundedFileSnapshot, readBoundedJsonSnapshot } from "./cua-driver-package-staging-files.mjs";
import { validateCuaDriverProviderLockContract } from "./cua-driver-provider-lock-contract.mjs";
import { canonicalJson, sha256Bytes, sha256File } from "./cua-driver-signing/signing-contract.mjs";

const DARWIN_PROVIDER_IDENTIFIER = "com.lingstack.desktop.cua-driver";
const COMMAND_OPTIONS = { encoding: "utf8", timeout: 30_000, maxBuffer: 64 * 1024 };

export function releaseProviderLayout() {
  if (!["darwin/arm64", "win32/x64"].includes(`${process.platform}/${process.arch}`)) {
    throw new Error("Run on the native release target (macOS arm64 or Windows x64).");
  }
  return cuaDriverArtifactLayoutFor(cuaDriverArtifactPlatformForRuntime(process.platform));
}

export async function inspectSignedProviderSeal(revisionRoot) {
  const { platform } = process;
  const layout = releaseProviderLayout();
  await assertSafeTree(revisionRoot, revisionRoot);
  const executable = join(revisionRoot, layout.packagedExecutableRelativePath);
  const [lock, binary, licenseSha256] = await Promise.all([
    readBoundedJsonSnapshot(join(revisionRoot, "provider-lock.json"), 256 * 1024, "provider_lock"),
    readBoundedFileSnapshot(executable, 128 * 1024 * 1024, "provider_binary"),
    sha256File(join(revisionRoot, "LICENSE.md")),
  ]);
  if (lock.sha256 !== CUA_DRIVER_COMMITTED_LOCK_SHA256) {
    throw new Error("Provider lock must match the promoted repository lock.");
  }
  const distribution = validateCuaDriverProviderLockContract(lock.value, {
    platform, architecture: layout.architecture, requireReleaseEvidence: true,
  });
  if (licenseSha256 !== distribution.upstream.licenseSha256) {
    throw new Error("Provider license does not match the promoted lock.");
  }
  const platformLock = platform === "darwin" ? distribution.platforms.darwin : distribution.platforms.win32X64;
  const identity = platform === "darwin"
    ? verifyDarwinProvider(executable, binary, platformLock)
    : verifyWindowsProvider(executable, binary, platformLock);
  if (await sha256File(executable) !== binary.sha256) {
    throw new Error("Provider executable changed during signature verification.");
  }
  return createSignedProviderSeal({ platform, distribution, lockSha256: lock.sha256, providerSha256: binary.sha256, identity });
}

export function createSignedProviderSeal({ platform, distribution, lockSha256, providerSha256, identity }) {
  const platformLock = platform === "darwin" ? distribution.platforms.darwin : distribution.platforms.win32X64;
  const common = {
    platform,
    componentId: platformLock.componentId,
    lockSha256,
    distributionRevision: distribution.distributionRevision,
    providerVersion: distribution.upstream.version,
    serverInitializeProtocolVersion: platformLock.compatibility.serverInitializeProtocolVersion,
    healthSchemaVersion: platformLock.compatibility.healthSchemaVersion,
    toolsListCanonicalSha256: platformLock.compatibility.toolsListSha256,
    stateSchemaVersion: platformLock.runtime.stateSchemaVersion,
    signingTier: "production_signed",
    distributionChannel: "production",
    productionEligible: true,
  };
  if (platform === "darwin") {
    return {
      schemaVersion: 1,
      ...common,
      executableRelativePath: cuaDriverArtifactLayoutFor("darwin").packagedExecutableName,
      executableSha256: providerSha256,
      architectures: platformLock.binary.architectures,
      cdhashes: { arm64: identity.cdhash },
      codeIdentifier: identity.codeIdentifier,
      teamId: identity.teamId,
      designatedRequirement: identity.designatedRequirement,
      designatedRequirementSha256: sha256Bytes(identity.designatedRequirement),
      hardenedRuntime: true,
      entitlementsCanonicalSha256: platformLock.binary.requiredEntitlementsCanonicalSha256,
    };
  }
  return {
    schemaVersion: 2,
    ...common,
    limitations: platformLock.runtime.limitations,
    main: {
      relativePath: platformLock.binary.mainRelativePath,
      sha256: providerSha256,
      architecture: platformLock.binary.architecture,
      peManifestCanonicalSha256: platformLock.binary.mainManifestCanonicalSha256,
      authenticodeStatus: "Valid",
      signerSubject: identity.signerSubject,
      certificateSha256: identity.certificateSha256,
      timestampPolicy: "rfc3161-required",
      timestampStatus: "Valid",
    },
    integrityCatalogRelativePath: platformLock.binary.integrityCatalogRelativePathBySigningTier.production_signed,
  };
}

function verifyDarwinProvider(path, snapshot, lock) {
  if (!(snapshot.mode & 0o100)) throw new Error("The macOS release provider must be executable.");
  const executable = inspectArm64MachO(snapshot.bytes);
  if (executable.minimumOSVersion !== lock.binary.minimumMacOS) {
    throw new Error("macOS provider binary does not match the locked deployment target.");
  }
  const team = process.env.LING_CUA_DARWIN_EXPECTED_TEAM_ID;
  if (!/^[A-Z0-9]{10}$/u.test(team ?? "")) throw new Error("A reviewed release Team ID is required.");
  codesign(["--verify", "--strict", "--all-architectures",
    `-R=anchor apple generic and identifier "${DARWIN_PROVIDER_IDENTIFIER}" and certificate leaf[subject.OU] = "${team}" and certificate leaf[field.1.2.840.113635.100.6.1.13] exists`, path]);
  const details = codesign(["--display", "--verbose=4", "--arch", "arm64", path]);
  const requirements = codesign(["--display", "--requirements", "-", "--arch", "arm64", path]);
  const identity = parseDarwinReleaseIdentity(details, requirements, team);
  const entitlements = codesign(["--display", "--entitlements", "-", "--xml", "--arch", "arm64", path]);
  const plist = /<\?xml[\s\S]+<\/plist>/u.exec(entitlements)?.[0];
  if (!plist) throw new Error("codesign did not report the provider entitlements.");
  const asJson = execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", "--", "-"], { ...COMMAND_OPTIONS, input: plist });
  const parsed = JSON.parse(asJson);
  if (!isDeepStrictEqual(parsed, lock.binary.requiredEntitlements)
    || sha256Bytes(canonicalJson(parsed)) !== lock.binary.requiredEntitlementsCanonicalSha256) {
    throw new Error("macOS provider entitlements do not match the promoted lock.");
  }
  return identity;
}

export function parseDarwinReleaseIdentity(details, requirements, team) {
  const field = (name) => new RegExp(`^${name}=([^\\r\\n]+)`, "mu").exec(details)?.[1].trim();
  const codeIdentifier = field("Identifier");
  const teamId = field("TeamIdentifier");
  const cdhash = field("CDHash");
  const designatedRequirement = /^\s*designated\s*=>\s*(.+)$/mu.exec(requirements)?.[1].trim();
  if (codeIdentifier !== DARWIN_PROVIDER_IDENTIFIER || teamId !== team || !/^[a-f0-9]{40}$/u.test(cdhash ?? "")
    || !/^CodeDirectory .*flags=.*[,(]runtime[,)]/mu.test(details) || !designatedRequirement) {
    throw new Error("codesign did not report the expected hardened provider identity.");
  }
  return { codeIdentifier, teamId, cdhash, designatedRequirement };
}

function codesign(args) {
  const result = spawnSync("/usr/bin/codesign", args, COMMAND_OPTIONS);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`codesign failed: ${result.stderr.trim()}`);
  return `${result.stdout}\n${result.stderr}`;
}

function verifyWindowsProvider(path, snapshot, lock) {
  const executable = inspectWindowsPe(snapshot.bytes);
  if (!executable.embeddedCertificateTablePresent || executable.manifest.uiAccess
    || executable.manifest.sha256 !== lock.binary.mainManifestCanonicalSha256) {
    throw new Error("Windows provider must be signed and match the locked standard PE manifest.");
  }
  return verifyReleaseAuthenticode(path, process.env.LING_CUA_PROVIDER_SIGNER_SHA256);
}

export function verifyReleaseAuthenticode(path, expectedSha256) {
  if (!/^[a-f0-9]{64}$/u.test(expectedSha256 ?? "")) {
    throw new Error("A reviewed SHA-256 signing certificate fingerprint is required.");
  }
  const powershell = join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const result = execFileSync(powershell, ["-NoProfile", "-NonInteractive", "-Command", [
    "$ErrorActionPreference = 'Stop'",
    "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
    "$signature = Microsoft.PowerShell.Security\\Get-AuthenticodeSignature -LiteralPath $env:LING_CUA_RELEASE_VERIFY_PATH",
    "if ($signature.Status -ne 'Valid' -or !$signature.SignerCertificate -or !$signature.TimeStamperCertificate) { exit 1 }",
    "$digest = [System.Security.Cryptography.SHA256]::Create().ComputeHash($signature.SignerCertificate.RawData)",
    "@{ signerSubject = $signature.SignerCertificate.Subject; certificateSha256 = [BitConverter]::ToString($digest).Replace('-', '').ToLowerInvariant() } | Microsoft.PowerShell.Utility\\ConvertTo-Json -Compress",
  ].join("\n")], { ...COMMAND_OPTIONS, env: { ...process.env, LING_CUA_RELEASE_VERIFY_PATH: path } });
  const identity = JSON.parse(result);
  if (identity.certificateSha256 !== expectedSha256 || typeof identity.signerSubject !== "string"
    || !identity.signerSubject || identity.signerSubject.trim() !== identity.signerSubject) {
    throw new Error("The production signature identity does not match the reviewed certificate.");
  }
  return identity;
}
