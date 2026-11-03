import ParakeetRecognizer
import SessionRehearsal

// The rehearsal with `--speech FILE` on both sides, each heard by its own real
// Parakeet v3 recogniser; both share one model load, timed before the call.

rehearsalMain { options in
    guard let speech = options.speech else { throw RehearsalOptions.Failure("AudelinBaseline needs --speech FILE") }
    let clock = ContinuousClock(), loading = clock.now
    let mine = try await ParakeetRecognizer(), theirs = try await ParakeetRecognizer()
    let load = loading.duration(to: clock.now)
    return try SpeechVoices(speech: speech, mine: mine, theirs: theirs,
                            modelLoad: Double(load.components.seconds) + Double(load.components.attoseconds) / 1e18)
}
