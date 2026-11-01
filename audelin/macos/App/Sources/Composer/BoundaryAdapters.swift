import CallAudioAccess
import CoreAudioProcesses
import LiveText

struct BoundaryProcesses: ProcessBinding {
    let base: any CallProcessSource
    func processObjects() throws -> [UInt32] { try base.processObjects() }
    func pid(of object: UInt32) -> Int32? { base.pid(of: object) }
    func bundleID(of object: UInt32) -> String? { base.bundleID(of: object) }
    func name(of object: UInt32) -> String { base.name(of: object) }
    func isRunningInput(_ object: UInt32) -> Bool { base.isRunningInput(object) }
    func onProcessListChange(_ changed: @escaping @Sendable () -> Void) throws -> Cancellation {
        let token = try base.onProcessListChange(changed)
        return Cancellation { token.cancel() }
    }
    func onProcessChange(_ object: UInt32, _ changed: @escaping @Sendable () -> Void) throws -> Cancellation {
        let token = try base.onProcessChange(object, changed)
        return Cancellation { token.cancel() }
    }
}

struct BoundaryCallClock: CallClock {
    let time: any ComposerClock
    func after(_ delay: Duration, _ fire: @escaping @Sendable () -> Void) -> Cancellation {
        let token = time.after(delay, fire)
        return Cancellation { token.cancel() }
    }
}

func accessPolicy(_ access: any CallAudioAccessSource) -> AccessPolicy {
    AccessPolicy(refresh: access.refresh, reserve: access.reserve, release: access.release, states: {
        let states = await access.states()
        return AsyncStream { output in
            let task = Task {
                for await available in states {
                    var state = AccessState()
                    state.evidence = available ? .heard : .silent
                    output.yield(state)
                }
                output.finish()
            }
            output.onTermination = { _ in task.cancel() }
        }
    }, invalidate: access.invalidate)
}

struct BoundaryRecognizer: Recognizer {
    let base: any SpeechRecognizer
    func hear(_ chunk: AudioChunk) async throws -> Hearing {
        map(try await base.hear(SpeechAudio(samples: chunk.samples, sampleRate: chunk.sampleRate)))
    }
    func finish() async throws -> Hearing { map(try await base.finish()) }
    private func map(_ hearing: SpeechHearing) -> Hearing {
        Hearing(words: hearing.words.map { Word($0.text, start: $0.start, end: $0.end) },
                from: hearing.from, finalThrough: hearing.finalThrough, noWordBefore: hearing.noWordBefore)
    }
}
