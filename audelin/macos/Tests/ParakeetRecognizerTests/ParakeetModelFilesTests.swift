import BlockingTestWork
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
    func modelIsMissingUntilItsDownloadFinishes(download: Download) async throws {

        let root = FileManager.default.temporaryDirectory.appendingPathComponent("parakeet-models-\(UUID())")
        try await withCleanup {
            let directory = root.appendingPathComponent(Repo.parakeetV3.folderName, isDirectory: true)
            try await offPool { try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true) }
            if download != .none {
                for bundle in ModelNames.ASR.requiredModelsV3() {
                    let weights = directory.appendingPathComponent(bundle).appendingPathComponent("weights")
                    try await offPool { try FileManager.default.createDirectory(at: weights, withIntermediateDirectories: true) }
                    let file = download == .finished ? "weight.bin" : "weight.bin.partial"
                    try await offPool { try Data([1]).write(to: weights.appendingPathComponent(file)) }
                    if download == .finished {
                        try await offPool { try Data([1]).write(to: directory.appendingPathComponent(bundle).appendingPathComponent("coremldata.bin")) }
                    }
                }
                try await offPool { try Data("{}".utf8).write(to: directory.appendingPathComponent(ModelNames.ASR.vocabularyFile)) }
            }

            #expect(ParakeetRecognizer.missingModels(in: directory) == (download == .finished ? [] : ["Parakeet v3"]))
        } cleanup: {
            try FileManager.default.removeItem(at: root)
        }
    }
}
