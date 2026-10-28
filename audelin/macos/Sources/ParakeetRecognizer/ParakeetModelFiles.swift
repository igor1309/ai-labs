import FluidAudio
import Foundation

extension ParakeetRecognizer {

    /// Where FluidAudio downloads Parakeet v3 and loads it from.
    public static var modelsDirectory: URL { AsrModels.defaultCacheDirectory(for: .v3) }

    /// The models a recognizer needs whose files are not complete in `directory`.
    ///
    /// `AsrModels.modelsExist` only sees that each bundle's directory exists,
    /// which a download creates before its files arrive. So each required
    /// bundle must also pass FluidAudio's own cache-validity rule: a root
    /// `coremldata.bin` and no `*.partial` staging file.
    public static func missingModels(in directory: URL) -> [String] {

        let complete = AsrModels.modelsExist(at: directory, version: .v3)
            && ModelNames.ASR.requiredModelsV3().allSatisfy { bundleComplete(directory.appendingPathComponent($0)) }
        return complete ? [] : ["Parakeet v3"]
    }

    private static func bundleComplete(_ bundle: URL) -> Bool {

        guard FileManager.default.fileExists(atPath: bundle.appendingPathComponent("coremldata.bin").path) else { return false }
        let items = FileManager.default.enumerator(at: bundle, includingPropertiesForKeys: nil)
        while let item = items?.nextObject() as? URL {
            if item.pathExtension == "partial" { return false }
        }
        return true
    }
}
