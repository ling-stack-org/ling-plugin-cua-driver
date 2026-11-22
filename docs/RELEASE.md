# Provider releases

Build the provider for macOS arm64 or Windows x64 with the native toolchain in the pinned [source inputs](../provider/0.8.3-ling.1/source-build-inputs.json). The [reproducibility runbook](../provider/0.8.3-ling.1/README.md) covers independent A/B runs and promotion.

The committed [provider lock](../provider/0.8.3-ling.1/provider-lock.json) authorizes the recorded Darwin source build by its exact input and artifact digests. Changes to source inputs, including the managed MCP integration test, require fresh A/B evidence and review before promotion. Windows requires an initial promotion of its platform record. Both platforms require verified final platform signatures and installed runtime evidence for distribution.

The Provider native build workflow checks the locked inputs, runs two independent builds and compares their output. The macOS runner must expose the exact Xcode and SDK in the source inputs. The Windows job provisions Microsoft Build Tools 17.14.36, Visual Studio build `17.14.37502.11`. The Windows candidate pins the observed MSVC toolset directory `14.44.35207`, the selected compiler product version `14.44.35228.0`, and the SDK. The downloadable workflow outputs are pre-sign candidates.

The Windows native test opens the managed MCP session for each child with `initialize` and `ling/managed_readiness` before calling configuration tools. Positive acceptance requires the host and provider to share an unlocked interactive Windows session.

The release runtime probe verifies its managed state directory under the native parent lease before launching the provider. On Windows the owner is the current user and the protected DACL grants FullControl only to that user. On macOS the directory is owned by the effective user with mode `0700`. The probe also verifies configuration persistence across two launches and rejects linked state paths.

The Windows build validates that the owned probe can run at Medium integrity before compiling the provider. The build process prepares the state root and passes its native directory identities to the probe. On an elevated runner the native launcher restricts the probe to the same user and interactive session at Medium integrity. The probe reopens the state root under the native parent lease and checks the actual integrity of both the host and provider.

A reviewed, signed runtime tree preserves the Ling resource layout under `runtime/providers/cua-driver/<distribution-revision>/`. Include the lock, license and notices, the native binary, the provider seal, and the Windows integrity catalog when applicable. Publish the platform archive with its provenance and submit its immutable release URL to the [official catalog](https://github.com/ling-stack-org/ling-stack/blob/main/docs/design/plugin-independent-packaging.md).
