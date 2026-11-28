public enum SplitPart: Equatable, Sendable { case first, second }

public enum SplitMessage: Equatable, Sendable {
    case checking, noChoices, busy, finishing
    case failed(SplitPortFailure)
    case refreshFailed(String), recoveryRequired(String)
}

public struct RecordingsSplitState: Equatable, Sendable {
    public enum Choices: Equatable, Sendable {
        case unchecked, checking, ready(SplitChoices), failed(SplitPortFailure)
    }

    public enum Control: Equatable, Sendable {
        case available
        case unavailable(SplitMessage, text: String)
    }

    public struct Draft: Equatable, Sendable {
        public var call: RecordedCall
        public var cut: Int?
        public var firstTitle: String
        public var secondTitle: String
        public var failure: String?

        public init(call: RecordedCall, cut: Int?, firstTitle: String, secondTitle: String, failure: String? = nil) {
            self.call = call
            self.cut = cut
            self.firstTitle = firstTitle
            self.secondTitle = secondTitle
            self.failure = failure
        }
    }

    public var selectedID: String?
    public var request: Int
    public var choices: Choices
    public var control: Control?
    public var draft: Draft?
    public var publishing: SplitReplacement?
    /// A completed list is ready to select and reopen part one.
    public var listedReplacement: SplitReplacement?
    public var publicationMessage: String?
    public var refreshFailed: Bool

    public init(selectedID: String? = nil, request: Int = 0, choices: Choices = .unchecked, control: Control? = nil,
                draft: Draft? = nil, publishing: SplitReplacement? = nil, publicationMessage: String? = nil,
                refreshFailed: Bool = false, listedReplacement: SplitReplacement? = nil) {
        self.selectedID = selectedID
        self.request = request
        self.choices = choices
        self.control = control
        self.draft = draft
        self.publishing = publishing
        self.listedReplacement = listedReplacement
        self.publicationMessage = publicationMessage
        self.refreshFailed = refreshFailed
    }
}

extension RecordingsReducer {
    func reduceSplit(_ given: RecordingsState, _ event: RecordingsEvent) -> (RecordingsState, RecordingsEffect?)? {
        var state = given
        switch event {
        case let .splitSelectionChanged(id):
            guard state.split.draft == nil, id != state.split.selectedID else { break }
            state.split.selectedID = id
            state.split.choices = .unchecked
        case let .splitChoicesRead(id, request, result):
            guard id == state.split.selectedID, request == state.split.request,
                  state.split.choices == .checking else { break }
            switch result {
            case let .success(choices):
                state.split.choices = .ready(choices)
                if state.split.draft != nil, choices.choices.isEmpty { state.split.draft?.failure = splitMessage(.noChoices) }
            case let .failure(failure):
                state.split.choices = .failed(failure)
                if state.split.draft != nil { state.split.draft?.failure = splitMessage(.failed(failure)) }
            }
        case .openSplit:
            guard state.split.control == .available, splitCanStart(state, phase: .idle),
                  case let .ready(choices) = state.split.choices, let choice = choices.choices.first,
                  let call = state.calls.first(where: { $0.id == state.split.selectedID }) else { break }
            state.phase = .choosingSplit
            state.split.draft = .init(call: call, cut: choice.cut, firstTitle: call.title, secondTitle: call.title)
        case .cancelSplit:
            guard state.phase == .choosingSplit else { break }
            state.phase = .idle
            state.split.draft = nil
        case let .chooseSplit(cut):
            guard state.phase == .choosingSplit, case let .ready(choices) = state.split.choices,
                  choices.choices.contains(where: { $0.cut == cut }) else { break }
            state.split.draft?.cut = cut
        case let .editSplitTitle(part, title):
            guard state.phase == .choosingSplit else { break }
            switch part {
            case .first: state.split.draft?.firstTitle = title
            case .second: state.split.draft?.secondTitle = title
            }
        case .confirmSplit:
            guard state.phase == .choosingSplit, let draft = state.split.draft, let cut = draft.cut,
                  case let .ready(choices) = state.split.choices else { break }
            guard splitCanStart(state, phase: .choosingSplit) else {
                state.split.draft?.failure = splitMessage(.busy)
                break
            }
            state.phase = .runningSplit
            state.split.draft?.failure = nil
            state.failure = nil
            state.replacement = nil
            state.split.listedReplacement = nil
            return (state, .split(.init(id: draft.call.id, transcriptIdentity: choices.transcriptIdentity, cut: cut,
                                        firstTitle: draft.firstTitle, secondTitle: draft.secondTitle)))
        case let .splitFinished(result):
            guard state.phase == .runningSplit, let original = state.split.draft?.call.id else { break }
            switch result {
            case let .success(replacement):
                state.phase = .publishingSplit
                state.split.publishing = replacement
                state.replacement = .init(removed: [original], published: [replacement.first, replacement.second])
                let effect = Self.requestList(&state)
                return (state, effect)
            case let .failure(.refused(.committed(_, reason))), let .failure(.refused(.recoveryRequired(reason))):
                // The on-disk transaction must be reconciled before another mutation.
                state.phase = .publishingSplit
                state.split.publicationMessage = splitMessage(.recoveryRequired(reason))
            case let .failure(failure):
                state.phase = .choosingSplit
                state.split.draft?.failure = splitMessage(.failed(failure))
                switch failure {
                case .refused(.expiredTranscript), .refused(.invalidChoice), .refused(.inactiveFolder), .refused(.folderMove):
                    state.split.draft?.cut = nil
                    state.split.choices = .unchecked
                default: break
                }
            }
        case .refreshSplit:
            guard state.phase == .publishingSplit, state.split.refreshFailed, !state.stopping else { break }
            state.split.refreshFailed = false
            state.split.publicationMessage = nil
            let effect = Self.requestList(&state)
            return (state, effect)
        case let .listed(request, calls) where state.phase == .publishingSplit:
            guard state.isListing, request == state.listRequest, let replacement = state.split.publishing else { break }
            guard calls.contains(where: { $0.id == replacement.first }),
                  calls.contains(where: { $0.id == replacement.second }) else {
                return splitListFailed(state, splitMessage(.finishing))
            }
            state.calls = calls
            state.isListing = false
            state.phase = .idle
            state.split.listedReplacement = replacement
            state.split.selectedID = replacement.first
            state.split.choices = .unchecked
            state.split.draft = nil
            state.split.publishing = nil
            state.split.publicationMessage = nil
        case let .listFailed(request, reason) where state.phase == .publishingSplit:
            guard state.isListing, request == state.listRequest else { break }
            return splitListFailed(state, reason)
        default: return nil
        }
        return (state, nil)
    }

    private func splitListFailed(_ given: RecordingsState, _ reason: String) -> (RecordingsState, RecordingsEffect?) {
        var state = given
        state.isListing = false
        state.split.refreshFailed = true
        state.split.publicationMessage = splitMessage(.refreshFailed(reason))
        return (state, nil)
    }

    private func splitCanStart(_ state: RecordingsState, phase: RecordingsState.Phase) -> Bool {
        state.phase == phase && state.mergeAvailable && state.recordingID == nil && state.transcriptRun == nil &&
        state.callsFolderAvailable && !state.stopping && !state.isListing && state.tagsSave == nil
    }

    func updateSplit(_ state: inout RecordingsState, from previous: RecordingsState, effect: RecordingsEffect?) -> RecordingsEffect? {
        let selected = state.split.selectedID
        if (state.transcriptChanged != previous.transcriptChanged && state.transcriptChanged?.id == selected)
            || state.callsFolder != previous.callsFolder || state.callsFolderAvailable != previous.callsFolderAvailable
            || (state.mergedCallID != previous.mergedCallID && state.mergedCallID == selected)
            || (selected != nil && state.recordingID == selected)
            || (previous.isListing && !state.isListing && state.phase == .idle) {
            state.split.choices = .unchecked
            state.split.draft?.cut = nil
        }
        let callExists = selected != nil && state.calls.contains { $0.id == selected }
        if !callExists { state.split.choices = .unchecked }
        var effect = effect
        if effect == nil, let selected, callExists, state.split.choices == .unchecked, !state.isListing,
           state.callsFolderAvailable, !state.stopping, state.mergeAvailable, state.recordingID == nil,
           state.phase == .idle || state.phase == .choosingSplit {
            state.split.request += 1
            state.split.choices = .checking
            effect = .readSplitChoices(id: selected, request: state.split.request)
        }
        let reason: SplitMessage?
        switch state.phase {
        case .runningSplit, .publishingSplit: reason = .finishing
        default:
            if !callExists {
                // Before the first selection there is no availability to announce.
                state.split.control = nil
                return effect
            } else if !splitCanStart(state, phase: .idle) {
                reason = .busy
            } else {
                switch state.split.choices {
                case .unchecked, .checking: reason = .checking
                case let .ready(choices): reason = choices.choices.isEmpty ? .noChoices : nil
                case let .failed(failure): reason = .failed(failure)
                }
            }
        }
        if let reason {
            if case let .unavailable(previousReason, _) = state.split.control, previousReason == reason { return effect }
            state.split.control = .unavailable(reason, text: splitMessage(reason))
        } else {
            state.split.control = .available
        }
        return effect
    }
}
