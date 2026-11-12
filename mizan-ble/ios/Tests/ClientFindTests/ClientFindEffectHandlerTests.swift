import ClientFind
import Testing

@MainActor
struct ClientFindEffectHandlerTests {
    @Test func startScanningStartsTheScanner() {
        let (sut, scanner) = makeSUT()

        _ = sut.handle(.startScanning)

        #expect(scanner.calls == [.start])
    }

    @Test func startScanningDeliversScanStartedOnceTheScannerReturns() {
        let (sut, _) = makeSUT()

        expect(sut, with: .startScanning, toDeliver: .scanningStarted)
    }

    @Test func stopScanningStopsTheScanner() {
        let (sut, scanner) = makeSUT()

        _ = sut.handle(.stopScanning)

        #expect(scanner.calls == [.stop])
    }

    @Test func stopScanningDeliversScanStoppedOnceTheScannerReturns() {
        let (sut, _) = makeSUT()

        expect(sut, with: .stopScanning, toDeliver: .scanningStopped)
    }
}

// MARK: - Helpers

@MainActor
private func makeSUT() -> (ClientFind.EffectHandler, ScannerSpy) {
    let scanner = ScannerSpy()
    return (ClientFind.EffectHandler(scanner: scanner), scanner)
}

@MainActor
private func expect(
    _ sut: ClientFind.EffectHandler,
    with effect: ClientFind.Effect,
    toDeliver expected: ClientFind.Event,
    sourceLocation: SourceLocation = #_sourceLocation
) {
    #expect(sut.handle(effect) == expected, sourceLocation: sourceLocation)
}

@MainActor
private final class ScannerSpy: ClientFind.Scanner {
    enum Call: Equatable { case start, stop }
    private(set) var calls: [Call] = []

    func start() { calls.append(.start) }
    func stop() { calls.append(.stop) }
}
