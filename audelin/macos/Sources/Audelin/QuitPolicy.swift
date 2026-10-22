/// Whether «Выйти» quits at once or asks first: a stray click must not end a
/// recording or leave a folder move half done (quit spec, Decided 1–2).
enum QuitPolicy {
    enum Answer: Equatable {
        case quit
        case confirm
    }

    static func answer(recording: Bool, moving: Bool) -> Answer {
        recording || moving ? .confirm : .quit
    }
}
