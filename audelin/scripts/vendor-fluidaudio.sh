#!/bin/sh
# Writes audelin/macos/Vendor/FluidAudio: FluidAudio's library at one
# upstream tag, trimmed to what Audelin uses, Parakeet and Nemotron speech
# recognition with their shared code, and the Nemotron 3 diarizer for the
# after-call speaker pass (LAB-1123). Speech synthesis, diarization,
# enhancement, speaker and the other recognition models never ship in
# Audelin, yet were most of every build. The files kept from those areas
# define types the remaining code names.
#
# Usage: vendor-fluidaudio.sh <tag>   (for example v0.17.7)
# Rerun on each upgrade; if the build then names a missing type, add the
# file defining it to `keep`.
set -eu

tag=${1:?usage: vendor-fluidaudio.sh <tag>}
here=$(cd "$(dirname "$0")" && pwd)
dest=$here/../macos/Vendor/FluidAudio
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

git -c advice.detachedHead=false clone -q --depth 1 --branch "$tag" \
    https://github.com/FluidInference/FluidAudio.git "$work/upstream"
src=$work/upstream/Sources/FluidAudio

keep="
ASR/Canary/CanaryConfig.swift
Diarizer/Core/DiarizerTypes.swift
Diarizer/DiarizerProtocol.swift
Diarizer/DiarizerTimeline.swift
Diarizer/Nemotron3/Nemotron3Diarizer.swift
Diarizer/Nemotron3/Nemotron3Models.swift
Diarizer/Nemotron3/Nemotron3StateUpdater.swift
Diarizer/Nemotron3/Nemotron3Types.swift
Diarizer/Sortformer/SortformerTypes.swift
Enhancement/LocalVQE/LocalVqeManager.swift
Enhancement/LocalVQE/LocalVqeStream.swift
Enhancement/LocalVQE/LocalVqeTypes.swift
TTS/Chatterbox/Nano/ChatterboxNanoConstants.swift
TTS/Inflect/InflectConstants.swift
TTS/Inflect/InflectVariant.swift
TTS/PocketTTS/PocketTtsConstants.swift
"
for f in $keep; do
    mkdir -p "$work/kept/$(dirname "$f")"
    cp "$src/$f" "$work/kept/$f"
done
for d in TTS Diarizer Enhancement Speaker ASR/Canary ASR/Cohere ASR/Paraformer ASR/SenseVoice; do
    rm -rf "${src:?}/$d"
done
cp -R "$work/kept/." "$src/"
rm -f "$src/ASR/Parakeet/Unified/benchmark.md"

rm -rf "$dest"
mkdir -p "$dest/Sources"
cp -R "$src" "$work/upstream/Sources/FastClusterWrapper" \
    "$work/upstream/Sources/MachTaskSelfWrapper" "$dest/Sources/"
cp -R "$work/upstream/LICENSE" "$work/upstream/ThirdPartyLicenses" "$dest/"
revision=$(git -C "$work/upstream" rev-parse HEAD)

cat > "$dest/Package.swift" <<SWIFT
// swift-tools-version: 6.2
// FluidAudio $tag ($revision), library only, trimmed by
// audelin/scripts/vendor-fluidaudio.sh. Do not edit by hand.
import PackageDescription

let package = Package(
    name: "FluidAudio",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "FluidAudio", targets: ["FluidAudio"]),
    ],
    targets: [
        .target(
            name: "FluidAudio",
            dependencies: ["FastClusterWrapper", "MachTaskSelfWrapper", "NemoTextProcessing"],
            path: "Sources/FluidAudio"
        ),
        .binaryTarget(
            name: "NemoTextProcessing",
            url: "https://github.com/FluidInference/text-processing-rs/releases/download/v0.3.1/NemoTextProcessing.xcframework.zip",
            checksum: "5fa8c10d4ec26c1bb2413125f351a7222a4c68a23b74476680fbada7e26fc6aa"
        ),
        .target(name: "FastClusterWrapper", path: "Sources/FastClusterWrapper", publicHeadersPath: "include"),
        .target(name: "MachTaskSelfWrapper", path: "Sources/MachTaskSelfWrapper", publicHeadersPath: "include"),
    ],
    cxxLanguageStandard: .cxx17
)
SWIFT
echo "vendored FluidAudio $tag ($revision) into $dest"
