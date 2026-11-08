import Foundation

/// What call to rehearse, from the command line.
public struct RehearsalOptions: Sendable {

    /// The call's length; with `speech` and no `--minutes`, the speech's own length.
    public var minutes: Double?
    public var speed = 10.0
    /// Every this many seconds, one side talks without a pause.
    public var monologueEvery: Double?
    public var monologueLength = 120.0
    public var keep = false
    /// Where to append the progress lines too, as a profiler hides stdout.
    public var report: String?
    public var recordingsDirectory: String?
    /// Speech fed on both sides, at its own rate, to the real Parakeet recognizers.
    public var speech: String?
    /// Speech for their side instead, so a recorded call replays its two tracks.
    public var theirSpeech: String?

    public static let usage = """
        usage: AudelinRehearsal|AudelinBaseline [--minutes 180] [--speed 10] [--monologue-every SECONDS] [--monologue-length 120] [--keep]
                                [--speech FILE] [--their-speech FILE]
          --minutes           the call's length in audio minutes (default 180, or the speech's length)
          --speed             audio seconds fed each wall-clock second
          --monologue-every   every this many seconds my side talks without a pause
          --monologue-length  how long each monologue lasts, in seconds
          --keep              keep the recorded call folder
          --report FILE       append the progress lines to FILE too
          --recordings-dir DIR  record into DIR (the profiling script owns its cleanup)
          --speech FILE       feed FILE on both sides, looped, to real Parakeet (AudelinBaseline only)
          --their-speech FILE  feed FILE on their side instead of --speech
        """

    public init(_ arguments: [String]) throws {

        var rest = arguments[...]
        func number(_ flag: String) throws -> Double {
            guard let text = rest.popFirst(), let value = Double(text), value > 0 else { throw Failure("\(flag) needs a positive number") }
            return value
        }
        while let flag = rest.popFirst() {
            switch flag {
            case "--minutes": minutes = try number(flag)
            case "--speed": speed = try number(flag)
            case "--monologue-every": monologueEvery = try number(flag)
            case "--monologue-length": monologueLength = try number(flag)
            case "--keep": keep = true
            case "--report":
                guard let path = rest.popFirst() else { throw Failure("--report needs a file") }
                report = path
            case "--recordings-dir":
                guard let path = rest.popFirst() else { throw Failure("--recordings-dir needs a directory") }
                recordingsDirectory = path
            case "--speech":
                guard let path = rest.popFirst() else { throw Failure("--speech needs an audio file") }
                speech = path
            case "--their-speech":
                guard let path = rest.popFirst() else { throw Failure("--their-speech needs an audio file") }
                theirSpeech = path
            case "--help": throw Failure("")
            default: throw Failure("unknown option \(flag)")
            }
        }
        if theirSpeech != nil, speech == nil { throw Failure("--their-speech needs --speech") }
        if speech != nil, monologueEvery != nil { throw Failure("--monologue-every needs the fake recognisers, not --speech") }
        if let every = monologueEvery, monologueLength >= every { throw Failure("--monologue-length must be shorter than --monologue-every") }
    }

    public struct Failure: Error, CustomStringConvertible {

        public let description: String
        public init(_ description: String) { self.description = description }
    }
}
