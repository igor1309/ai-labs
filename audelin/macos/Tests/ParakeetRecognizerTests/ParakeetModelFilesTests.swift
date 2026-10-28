import FluidAudio
import Foundation
import Testing
import ParakeetRecognizer

struct ParakeetModelFilesTests {

    enum Download: CaseIterable, Sendable {

        case none
        case started
        case finished
    }

    /// Contract test: FluidAudio's model files in a real directory.
    @Test(arguments: Download.allCases)
    func modelIsMissingUntilItsDownloadFinishes(download: Download) throws {

        let root = FileManager.default.temporaryDirectory.appendingPathComponent("parakeet-models-\(UUID())")
        defer { try? FileManager.default.removeItem(at: root) }
        let directory = root.appendingPathComponent(Repo.parakeetV3.folderName, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        if download != .none {
            for bundle in ModelNames.ASR.requiredModelsV3() {
                let weights = directory.appendingPathComponent(bundle).appendingPathComponent("weights")
                try FileManager.default.createDirectory(at: weights, withIntermediateDirectories: true)
                let file = download == .finished ? "weight.bin" : "weight.bin.partial"
                try Data([1]).write(to: weights.appendingPathComponent(file))
                if download == .finished {
                    try Data([1]).write(to: directory.appendingPathComponent(bundle).appendingPathComponent("coremldata.bin"))
                }
            }
            try Data("{}".utf8).write(to: directory.appendingPathComponent(ModelNames.ASR.vocabularyFile))
        }

        #expect(ParakeetRecognizer.missingModels(in: directory) == (download == .finished ? [] : ["Parakeet v3"]))
    }
}
