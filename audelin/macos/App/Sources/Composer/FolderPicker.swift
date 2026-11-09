import Foundation

public struct FolderPickerDidNotOpen: Error, CustomStringConvertible {
    public var description: String { "folder picker did not appear" }
}

/// Runs a picker whose completion may never come: when the panel cannot open,
/// `NSOpenPanel.begin` neither shows it nor calls back (LAB-1117). If the picker is
/// not visible after `grace` and has not answered, the wait ends with an error.
@MainActor
public func presentPicker(
    begin: (@escaping @MainActor (URL?) -> Void) -> Void,
    isVisible: @escaping @MainActor () -> Bool,
    grace: Duration = .seconds(1),
    sleep: @escaping @Sendable (Duration) async throws -> Void = { try await Task.sleep(for: $0) }
) async throws -> URL? {

    final class Once { var done = false }
    let once = Once()
    return try await withCheckedThrowingContinuation { (done: CheckedContinuation<URL?, any Error>) in
        begin { url in
            guard !once.done else { return }
            once.done = true
            done.resume(returning: url)
        }
        Task { @MainActor in
            try? await sleep(grace)
            guard !once.done, !isVisible() else { return }
            once.done = true
            done.resume(throwing: FolderPickerDidNotOpen())
        }
    }
}
