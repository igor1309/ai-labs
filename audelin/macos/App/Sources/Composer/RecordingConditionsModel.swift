import Foundation
import IMRxObservation
import Observation
import Recording
import RecordingConditions

/// Composes the RecordingConditions machine: readings and call-audio access go in, changed conditions go to Recording.
@MainActor
final class RecordingConditionsModel {

    typealias State = RecordingConditionsState
    typealias Event = RecordingConditionsEvent
    typealias Effect = RecordingConditionsEffect

    private let model: ObservableModel<State, Event, Effect>
    private let publications: AsyncStream<Publication>.Continuation
    private let forwarding: Task<Void, Never>
    private let access: Task<Void, Never>
    private let read: @Sendable () -> ConditionReadings

    init(read: @escaping @Sendable () -> ConditionReadings, accessStates: @escaping @Sendable () async -> AsyncStream<Bool>,
         publication: any ConditionPublication) {
        let handler = RecordingConditionsEffectHandler(publication: publication, read: read)
        let (stream, publications) = AsyncStream.makeStream(of: Publication.self)
        self.read = read
        self.publications = publications
        let reducer = RecordingConditionsReducer()
        let model = ObservableModel<State, Event, Effect>(initialState: .init(), reduce: reducer.reduce, handleEffect: { effect in
            publications.yield(.effect(effect))
            return AsyncStream { $0.finish() }
        })
        self.model = model
        // Effects are queued in the order they are reduced, so Recording hears each condition's changes in order.
        forwarding = Task { @MainActor [weak model] in
            for await item in stream {
                switch item {
                case let .effect(effect): if let event = await handler.handle(effect) { model?.event(event) }
                case let .handled(done): done.resume()
                }
            }
        }
        access = Task { @MainActor [weak model] in
            for await available in await accessStates() { model?.event(.callAudioAccess(available)) }
        }
    }

    /// Returns once the readings taken now, or newer ones, are published.
    func refresh() async {
        let readings = read()
        model.event(.read(readings))
        await published { ($0.readings?.takenAt ?? -.infinity) >= readings.takenAt }
    }

    /// Returns once the move's effect on the calls folder is published: at a move's end,
    /// once the reading it asks for has decided the folder.
    func setStorageMoving(_ moving: Bool) async {
        model.event(.storageMoving(moving))
        await published { moving ? $0.storageMoving : !$0.storageMoving && $0.awaitedReading == nil }
    }

    private func published(_ reduced: @escaping @MainActor (State) -> Bool) async {
        for await state in Observations({ self.model.state }) where reduced(state) { break }
        // Each effect of that reduction is already queued; wait until the queue reaches this point.
        await withCheckedContinuation { publications.yield(.handled($0)) }
    }

    isolated deinit {
        access.cancel()
        publications.finish()
    }

    private enum Publication {
        case effect(Effect)
        case handled(CheckedContinuation<Void, Never>)
    }
}

func composeRecordingConditions(recording: RecordingInputs, callsURL: URL, boundary: ComposerBoundary, currentFolder: (@Sendable () -> URL)? = nil) async -> RecordingConditionsModel {

    let disk = DiskReadingsAdapter(folder: currentFolder ?? { callsURL }, capacity: boundary.capacity)
    let permission = boundary.microphonePermission, time = boundary.time
    return await RecordingConditionsModel(
        read: { ConditionReadings(microphoneAccess: permission.authorized(), disk: disk.read(), takenAt: time.monotonicNow()) },
        accessStates: boundary.access.states,
        publication: RecordingPublication(send: recording.send, sink: boundary.log)
    )
}

/// Logs each changed condition and sends it to Recording.
private struct RecordingPublication: ConditionPublication {

    let send: @Sendable (RecordingEvent) async -> Void
    let sink: any LogSink

    func publish(_ condition: RecordingConditions.RecordingCondition, _ availability: Availability) async {
        let mapped = recordingCondition(condition)
        sink.write(.init(category: .conditions, message: "condition=\(mapped) available=\(logged(availability))"))
        await send(.conditionChanged(mapped, available: availability == .available))
    }
}

private func recordingCondition(_ condition: RecordingConditions.RecordingCondition) -> Recording.RecordingCondition {
    switch condition {
    case .microphoneAccess: .microphoneAccess
    case .callAudioAccess: .callAudioAccess
    case .callsFolder: .callsFolder
    case .room: .room
    }
}

private func logged(_ availability: Availability) -> String {
    switch availability {
    case .available: "true"
    case .unavailable: "false"
    case .moving: "moving"
    }
}
