#!/usr/bin/env bash

set -euo pipefail

toolchain="${SWIFT_WASM_SWIFT:-$HOME/Library/Developer/Toolchains/swift-6.2-RELEASE.xctoolchain/usr/bin/swift}"
sdk="${SWIFT_WASM_SDK:-6.2-RELEASE-wasm32-unknown-wasip1}"
triple="${SWIFT_WASM_TRIPLE:-wasm32-unknown-wasip1}"

"$toolchain" build --swift-sdk "$sdk" --triple "$triple" --product NexumWeb "$@"
