# Provider releases

Build the provider for macOS arm64 or Windows x64 with the native toolchain in the pinned [source inputs](../provider/0.8.3-ling.1/source-build-inputs.json). The [reproducibility runbook](../provider/0.8.3-ling.1/README.md) covers independent A/B runs and promotion.

The committed [provider lock](../provider/0.8.3-ling.1/provider-lock.json) records the reviewed macOS arm64 and Windows x64 build inputs and pre-sign artifact digests. Both platforms require fresh native A/B attestations bound to the reviewed lock, verified final platform signatures and installed runtime evidence for distribution.

The platform records derive from two independent builds per platform. The review matched the archive digests, runner and source identities, five patch digests, stable member inventories, and the exact records copied into the lock. [Platform lock review](https://github.com/ling-stack-org/ling-plugin-cua-driver/pull/5)

The rebuilds at `cb4c332cfab7` ran the managed MCP readiness and configuration probes with the reviewed lock. Each pair matched the stable member inventory, seven files for macOS arm64 and eight for Windows x64. The merge commit `42c7c24bb3b9` has the same tree. The retained archives are pre-sign inputs for the platform release steps below. [macOS arm64 A/B](https://github.com/ling-stack-org/ling-plugin-cua-driver/actions/runs/45160025646) · [Windows x64 A/B](https://github.com/ling-stack-org/ling-plugin-cua-driver/actions/runs/45160031136)

The Provider native build workflow checks the locked inputs, runs two independent builds and compares their output. The macOS runner must expose the exact Xcode and SDK in the source inputs. The Windows job provisions Microsoft Build Tools 17.14.36, Visual Studio build `17.14.37502.11`. The Windows candidate pins the observed MSVC toolset directory `14.44.35207`, the selected compiler product version `14.44.35228.0`, and the SDK. The downloadable workflow outputs are pre-sign candidates.

The Windows native test opens the managed MCP session for each child with `initialize` and `ling/managed_readiness` before calling configuration tools. Positive acceptance requires the host and provider to share an unlocked interactive Windows session.

The release runtime probe verifies its managed state directory under the native parent lease before launching the provider. On Windows the owner is the current user and the protected DACL grants FullControl only to that user. On macOS the directory is owned by the effective user with mode `0700`. The probe also verifies configuration persistence across two launches and rejects linked state paths.

The Windows build validates that the owned probe can run at Medium integrity before compiling the provider. The build process prepares the state root and passes its native directory identities to the probe. On an elevated runner the native launcher restricts the probe to the same user and interactive session at Medium integrity. The probe reopens the state root under the native parent lease and checks the actual integrity of both the host and provider.

The native workflow validates each candidate attestation and repeats the executable version check in an owned process. On Windows this uses the locked compiler environment. The compare job checks the candidate payload digests across the two runners.

Build the release archive on the corresponding target after approving the source build and signing its native runtime. The signed revision directory contains the promoted lock, license, notices, platform executable and provider seal. Windows also includes the signed integrity catalog. The packaging command verifies the promoted lock, sealed digests and the platform signatures before archiving the selected files.

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm package:release /path/to/signed/0.8.3-ling.1 /path/to/output 0.6.1
```

Pass the minimum Ling version supported by the reviewed runtime. On macOS, set `LING_CUA_DARWIN_EXPECTED_TEAM_ID` to the release Team ID. On Windows, use the SDK Developer shell with `signtool.exe` on PATH and set `LING_CUA_PROVIDER_SIGNER_SHA256` and `LING_CUA_CATALOG_SIGNER_SHA256` to the reviewed production certificate fingerprints.

Create the Windows integrity catalog from `win32-x64/payload` after signing the executable and writing the seal. The catalog covers exactly `ling-cua-driver.exe` and `provider-seal.json`. Sign and timestamp the catalog, then place it at `win32-x64/provider-integrity.cat`. Release packaging checks catalog membership against the staged copies of both files.

Build both platform archives from the same source commit. Publish them and their SHA-256 sidecars under a new stable tag matching the plugin version after completing the platform release checks. Submit the tag, source commit and both archive digests to the [official Ling catalog](https://github.com/ling-stack-org/ling-stack/blob/main/docs/design/plugin-independent-packaging.md).
