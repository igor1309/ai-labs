import CallsList
import Testing

struct CallsListEffectHandlerTests {
    @Test(arguments: [CallsListEffect.clearFailure, .rename(id: "call a", title: "New title"),
                      .rename(id: "call b", title: ""), .rename(id: "call c", title: "  Звонок 🐦  ")])
    func forwardsRequestToRecordings(effect: CallsListEffect) async {
        let (sut, spy) = makeSUT()
        await sut.handle(effect)
        #expect(await spy.requests == [effect])
    }
}

private func makeSUT() -> (CallsListEffectHandler, RecordingsSpy) {
    let spy = RecordingsSpy()
    return (CallsListEffectHandler(recordings: { await spy.send($0) }), spy)
}

private actor RecordingsSpy {
    private(set) var requests: [CallsListEffect] = []

    func send(_ request: CallsListEffect) { requests.append(request) }
}
