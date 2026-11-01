@testable import Composer
import CoreAudioProcesses
import Foundation
import SessionRehearsal

struct FixtureMicrophone: MicrophoneSource {
    let begin: @Sendable () async throws -> StartedCapture<CaptureBuffer>
    func start() async throws -> StartedCapture<CaptureBuffer> { try await begin() }
}
struct FixtureCallAudio: CallAudioSource {
    let begin: @Sendable (CaptureSelection) async throws -> StartedCapture<CaptureBuffer>
    func start(_ selection: CaptureSelection) async throws -> StartedCapture<CaptureBuffer> { try await begin(selection) }
}
struct FixtureRecognizers: RecognizerSource {
    let source: @Sendable (ComposerSide) async throws -> any SpeechRecognizer
    let missing: @Sendable () -> [String]
    let load: @Sendable () -> Task<Void, any Error>
    func recognizer(for side: ComposerSide) async throws -> any SpeechRecognizer { try await source(side) }
    func missingModels() -> [String] { missing() }
    func startLoading() -> Task<Void, any Error> { load() }
}
struct FixtureProcesses: CallProcessSource {
    let binding: any ProcessBinding
    func processObjects() throws -> [UInt32] { try binding.processObjects() }
    func pid(of object: UInt32) -> Int32? { binding.pid(of: object) }
    func bundleID(of object: UInt32) -> String? { binding.bundleID(of: object) }
    func name(of object: UInt32) -> String { binding.name(of: object) }
    func isRunningInput(_ object: UInt32) -> Bool { binding.isRunningInput(object) }
    func onProcessListChange(_ changed: @escaping @Sendable () -> Void) throws -> BoundaryCancellation {
        let token = try binding.onProcessListChange(changed)
        return BoundaryCancellation { token.cancel() }
    }
    func onProcessChange(_ object: UInt32, _ changed: @escaping @Sendable () -> Void) throws -> BoundaryCancellation {
        let token = try binding.onProcessChange(object, changed)
        return BoundaryCancellation { token.cancel() }
    }
}
struct FixturePermission: MicrophonePermission {
    let status: @Sendable () -> Bool
    let prompt: @Sendable () async -> Void
    func authorized() -> Bool { status() }
    func request() async { await prompt() }
}
struct FixtureCapacity: FolderCapacity {
    let read: @Sendable (URL) -> Int64?
    func available(at folder: URL) -> Int64? { read(folder) }
}
