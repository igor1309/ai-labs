/// Who has the calls folder: work on it that must not overlap.
public enum CallsFolderHolder: Equatable, Sendable {
    case recording, move, relaunch, split
}

/// Names one grant of the calls folder; releasing it frees only that grant.
public struct CallsFolderToken: Hashable, Sendable {
    public let rawValue: UInt64
    public init(rawValue: UInt64) { self.rawValue = rawValue }
}

/// The answer to taking the calls folder, given at once.
public enum CallsFolderTake: Equatable, Sendable {
    case granted(CallsFolderToken)
    case refused(by: CallsFolderHolder)
}

extension CallsStorage {

    /// Grants the calls folder with a new token, or names the holder that has it.
    public func takeFolder(for holder: CallsFolderHolder) -> CallsFolderTake {
        folderClaim.withLock { claim in
            if let (current, _) = claim.holder { return .refused(by: current) }
            claim.lastToken += 1
            let token = CallsFolderToken(rawValue: claim.lastToken)
            claim.holder = (holder, token)
            return .granted(token)
        }
    }

    /// Frees the calls folder if `token` is the current grant; any other token changes nothing.
    public func releaseFolder(_ token: CallsFolderToken) {
        folderClaim.withLock { claim in
            if claim.holder?.1 == token { claim.holder = nil }
        }
    }
}
