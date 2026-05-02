/// Write-only storage interface for captured items.
/// Owned by the capture service — implementations live in adapters.
public protocol CaptureStore: Sendable {
    func save(_ item: CapturedItem) async throws
}
