import SessionRehearsal

// A long synthetic call through the app's composition and panel, fed faster
// than real time with the fake recognisers, so a profiler sees a 3-hour call
// in minutes. Real speech through the real model is the baseline benchmark's
// (`Benchmarks/Baseline`), so this executable never links the model.

rehearsalMain { options in
    guard options.speech == nil else { throw RehearsalOptions.Failure("--speech is the baseline benchmark's: Benchmarks/Baseline") }
    return FakeVoices(options)
}
