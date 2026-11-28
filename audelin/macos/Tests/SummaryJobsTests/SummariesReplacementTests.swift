import SummaryJobs
import Testing

@Suite struct SummariesReplacementTests {
    @Test func aRunningJobSettlesBeforeItsReusedCallIDIsLoaded() {
        let old = makeJob()
        let original = makeState(calls: [
            "call": .init(stage: .noting, job: old),
            "other": .init(stage: .pending, job: makeJob(call: "other")),
            "unrelated": .init(stage: .waiting),
        ])
        let format = FormatSpy()
        let sut = SummariesReducer(format: format.call, badge: { _ in .none })

        let (retiring, abort) = sut.reduce(original, .replaced(removed: ["call", "other"], published: ["call"]))
        var expected = original
        expected.replacements = ["call": .init(recover: true, cleanup: .cancelling),
                                 "other": .init(recover: false, cleanup: .ready(nil))]
        #expect(retiring == expected && abort == .abort(old))
        #expect(format.payloads.isEmpty)

        let (releasing, release) = sut.reduce(retiring, .noted("call", "obsolete notes"))
        expected.calls["call"] = nil
        expected.replacements["call"]?.cleanup = .releasing
        #expect(releasing == expected && release == .releaseReplacement(old))

        let (restoring, load) = sut.reduce(releasing, .replacementReleased("call"))
        expected.calls["other"] = nil
        expected.calls["call"] = .init(stage: .recovering, status: "recovering:false")
        expected.replacements = [:]
        #expect(restoring == expected && load == .load("call"))
        #expect(format.payloads == [.init(stage: .recovering, warning: false)])
    }

    @Test func aRefreshCannotRestoreTheRemovedJob() {
        let old = makeJob()
        let original = makeState(calls: ["call": .init(stage: .observed, job: old)])
        let format = FormatSpy()
        let sut = SummariesReducer(format: format.call, badge: { _ in .none })
        let (refreshing, refresh) = sut.reduce(original, .refresh)
        #expect(refresh == .reload(["call"]))

        let (retiring, effect) = sut.reduce(refreshing, .replaced(removed: ["call"], published: ["call"]))
        var expected = refreshing
        expected.calls["call"] = nil
        expected.replacements["call"] = .init(recover: true, cleanup: .ready(nil))
        #expect(retiring == expected && effect == nil)

        let (restoring, load) = sut.reduce(retiring, .reloaded(["call": .init(stage: .observed, job: old)]))
        expected.refreshing = false
        expected.calls["call"] = .init(stage: .recovering, status: "recovering:false")
        expected.replacements = [:]
        #expect(restoring == expected && load == .load("call"))
        #expect(format.payloads == [.init(stage: .recovering, warning: false)])
    }

    @Test func replacingReleasesTheOldLeaseWithoutWritingToThePublishedFolder() async {
        let storage = StorageSpy(), generation = GenerationsSpy()
        let sut = SummariesEffectHandler(keeping: { true }, templates: TemplatesSpy(), preparation: PreparationSpy(),
                                         claims: ClaimsSpy(), records: RecordsSpy(), starts: StartsSpy(),
                                         storage: storage, generation: generation)
        let event = await sut.handle(.releaseReplacement(makeJob()))
        #expect(event == .replacementReleased("call"))
        #expect(storage.payloads == [.release(makeJob())])
        #expect(generation.payloads.isEmpty)
    }
}
