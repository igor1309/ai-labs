import NerisCore
import Testing

final class GateTests: TestContext {

    @Test func test_shouldDeliverResponse_onSignalAfterWait() async throws {
        let response = makeSomeString()
        let sut = makeSUT()

        async let waited = sut.wait()
        await Task.yield()
        await sut.signal(response)

        #expect(await waited == response)
    }

    @Test func test_shouldReturnNil_onCancel() async throws {
        let sut = makeSUT()

        async let waited = sut.wait()
        await Task.yield()
        await sut.cancel()

        #expect(await waited == nil)
    }

    @Test func test_shouldReturnNilImmediately_onWaitAfterCancel() async throws {
        let sut = makeSUT()

        await sut.cancel()

        let result = await sut.wait()
        #expect(result == nil)
    }

    @Test func test_shouldReportCancelled_onCancel() async throws {
        let sut = makeSUT()

        await sut.cancel()

        #expect(await sut.isCancelled)
    }

    @Test func test_shouldNotReportCancelled_beforeCancel() async throws {
        let sut = makeSUT()

        #expect(await !sut.isCancelled)
    }

    @Test func test_shouldDropSignal_onSignalBeforeWait() async throws {
        let sut = makeSUT()

        await sut.signal(makeSomeString())

        async let waited = sut.wait()
        await Task.yield()
        await sut.cancel()

        #expect(await waited == nil)
    }

    // MARK: - Helpers

    private typealias SUT = Gate<String>

    private func makeSUT(
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> SUT {
        SUT()
    }
}
