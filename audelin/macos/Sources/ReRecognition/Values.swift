/// Values at ReRecognition's boundary; tracks are opaque handles resolved by its ports.
extension ReRecognition {
    public struct OriginalCall: Equatable, Sendable {
        public let id: String
        public let farTrack: String
        public let microphoneTrack: String
        public let duration: Double

        public init(id: String, farTrack: String, microphoneTrack: String, duration: Double) {
            self.id = id; self.farTrack = farTrack; self.microphoneTrack = microphoneTrack
            self.duration = duration
        }
    }

    public struct Build: Equatable, Sendable {
        public let version: String
        public let number: String
        public init(version: String, number: String) { self.version = version; self.number = number }
    }

    public struct TimeRange: Equatable, Sendable {
        public let start: Double
        public let end: Double
        public init(start: Double, end: Double) { self.start = start; self.end = end }
    }

    public struct Word: Equatable, Sendable {
        public let text: String
        public let time: TimeRange
        public init(text: String, time: TimeRange) { self.text = text; self.time = time }
    }

    public struct Heard: Equatable, Sendable {
        public let words: [Word]
        public let model: String
        public init(words: [Word], model: String) { self.words = words; self.model = model }
    }

    public struct Speaker: Equatable, Sendable {
        public let id: Int
        public var name: String?
        public let words: [Word]
        public init(id: Int, name: String?, words: [Word]) {
            self.id = id; self.name = name; self.words = words
        }
    }

    /// Timed remote names from the current transcript, in that transcript's time coordinate.
    public struct OldSpeaker: Equatable, Sendable {
        public let name: String?
        public let ranges: [TimeRange]
        public init(name: String?, ranges: [TimeRange]) { self.name = name; self.ranges = ranges }
    }

    public struct Split: Equatable, Sendable {
        public let speakers: [Speaker]
        public let diarizer: String
        public init(speakers: [Speaker], diarizer: String) {
            self.speakers = speakers; self.diarizer = diarizer
        }
    }

    public struct Origin: Equatable, Sendable {
        public enum Splitting: Equatable, Sendable { case done(diarizer: String), nothingKept }
        public enum Cleaning: Equatable, Sendable { case done, nothingKept }
        public let build: Build
        public let farModel: String
        public let microphoneModel: String
        public let splitting: Splitting
        public let cleaning: Cleaning
        public init(build: Build, farModel: String, microphoneModel: String,
                    splitting: Splitting, cleaning: Cleaning) {
            self.build = build; self.farModel = farModel; self.microphoneModel = microphoneModel
            self.splitting = splitting; self.cleaning = cleaning
        }
    }

    public struct FinishedCall: Equatable, Sendable {
        public let original: OriginalCall
        public let far: [Speaker]
        public let microphone: [Word]
        public let origin: Origin
        public init(original: OriginalCall, far: [Speaker], microphone: [Word], origin: Origin) {
            self.original = original; self.far = far; self.microphone = microphone; self.origin = origin
        }
    }

    public struct Transcript: Equatable, Sendable {
        public let originals: [FinishedCall]
        public init(originals: [FinishedCall]) { self.originals = originals }
    }

    public enum Wait: Equatable, Sendable {
        case preparing, hearing(Double), finishing
    }

    public enum Outcome: Equatable, Sendable {
        case made, stopped
        /// A nil original identifies a failure of the whole run's input.
        case failed(original: String?, reason: String)
    }
}
