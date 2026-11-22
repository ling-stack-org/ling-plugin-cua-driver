# Ling Cua Driver

This repository owns the provider source-build inputs, Ling patch series, and native build and reproducibility workflow. Ling Desktop owns process lifetime, interactive-session checks, approval policy and the integration with operating-system permissions.

- [Source and A/B build instructions](provider/0.8.3-ling.1/README.md)
- [Platform release requirements](docs/RELEASE.md)
- [Desktop host and provider contracts](docs/cua-driver-bundled-embedded.md)

Run `node --test test/*.test.mjs` to validate the source-build and promotion contracts.
