# Project Vortex (Fora iOS)

Due to the size and complexity of the project it is essential to use `-quiet` with `xcodebuild` to reduce output.
Xcode project file is located in a subfolder `Vortex`.

## BUILD
cd Vortex &&                             \
xcodebuild build -quiet                  \
  -scheme Vortex-SELECTED_TESTS          \
  -destination 'platform=iOS Simulator,arch=arm64,id=421676B1-6579-4377-8198-F8747A1328A7' \
  OTHER_SWIFT_FLAGS='-suppress-warnings' \
  | xcpretty -s                          \
&& cd ..

## TEST
cd Vortex &&                             \
xcodebuild test -quiet                   \
  -scheme Vortex-SELECTED_TESTS          \
  -destination 'platform=iOS Simulator,arch=arm64,id=421676B1-6579-4377-8198-F8747A1328A7' \
  OTHER_SWIFT_FLAGS='-suppress-warnings' \
  | xcpretty -s                          \
&& cd ..

# MODULE
cd swift-vortex &&                                                  \
xcodebuild test -quiet                                              \
  -scheme CVVPIN_Services                                           \
  -destination 'platform=macOS,arch=arm64,name=My Mac'              \
  -only-testing:CVVPIN_ServicesTests/OrchestratorTests              \
  -only-testing:CVVPIN_ServicesTests/OrchestratorReducerTests       \
  -only-testing:CVVPIN_ServicesTests/OrchestratorEffectHandlerTests \
  -only-testing:CVVPIN_ServicesTests/ChangePINServiceAdapterTests   \
  | xcpretty -s \
&& cd ..

cd swift-vortex && swift build --target CVVPIN_ServicesTests \
&& cd ..