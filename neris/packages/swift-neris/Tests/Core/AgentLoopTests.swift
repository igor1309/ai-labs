import Foundation
@testable import NerisCore
import Testing

final class AgentLoopTests: TestContext {

    @Test(arguments: [false, true])
    func test_process_shouldReleaseProducerDependencies_beforeStreamCompletion(failing: Bool) async throws {
        weak var loop: SUT?
        weak var respondSpy: RespondSpy?
        weak var executeSpy: ExecuteSpy?
        let stream: SUT.EventStream
        do {
            let stub: RespondSpy.Stub = failing
                ? .failure(makeSomeError())
                : .success(.text(makeSomeString()))
            let (sut, respond, execute) = makeSUT(respondStubs: [stub])
            loop = sut
            respondSpy = respond
            executeSpy = execute
            stream = await sut.process(makeSomeString())
        }
        do {
            _ = try await collect(stream)
            #expect(!failing)
        } catch {
            #expect(failing)
        }
        #expect(loop == nil)
        #expect(respondSpy == nil)
        #expect(executeSpy == nil)
    }

    @Test func test_process_shouldPassUserMessageToRespond() async throws {

        let query = makeSomeString()
        let (sut, respond, _) = makeSUT(respondStubs: [.success(.text(makeSomeString()))])

        _ = try await collect(sut.process(query))

        #expect(respond.payloads.first == [.user(query)])
    }

    @Test func test_process_shouldYieldTextEvent() async throws {

        let expected = makeSomeString()
        let (sut, _, _) = makeSUT(respondStubs: [.success(.text(expected))])

        let events = try await collect(sut.process(makeSomeString()))

        #expect(events == [.text(expected)])
    }

    @Test func test_process_shouldYieldToolCallAndResultEvents() async throws {

        let toolCall = makeToolCall()
        let (toolResult, text) = (makeSomeString(), makeSomeString())
        let (sut, _, _) = makeSUT(
            respondStubs: [.success(.toolCalls([toolCall])), .success(.text(text))],
            executeStubs: [.success(toolResult)]
        )

        let events = try await collect(sut.process(makeSomeString()))

        #expect(events == [.toolCall(toolCall), .toolResult(toolResult), .text(text)])
    }

    @Test func test_process_shouldCallExecuteWithToolCall() async throws {

        let toolCall = makeToolCall()
        let (sut, _, execute) = makeSUT(respondStubs: [.success(.toolCalls([toolCall])), .success(.text(makeSomeString()))])

        _ = try await collect(sut.process(makeSomeString()))

        #expect(execute.payloads == [toolCall])
    }

    @Test func test_process_shouldNotCallExecute_onTextResponse() async throws {

        let (sut, _, execute) = makeSUT(respondStubs: [.success(.text(makeSomeString()))])

        _ = try await collect(sut.process(makeSomeString()))

        #expect(execute.callCount == 0)
    }

    @Test func test_process_shouldLoopOnMultipleToolCalls() async throws {

        let (toolCall1, toolCall2) = (makeToolCall(), makeToolCall())
        let (sut, _, execute) = makeSUT(
            respondStubs: [.success(.toolCalls([toolCall1])), .success(.toolCalls([toolCall2])), .success(.text(makeSomeString()))],
            executeStubs: [.success(makeSomeString()), .success(makeSomeString())]
        )

        _ = try await collect(sut.process(makeSomeString()))

        #expect(execute.payloads == [toolCall1, toolCall2])
    }

    @Test func test_process_shouldStopLooping_onTextResponse() async throws {

        let (sut, _, execute) = makeSUT(
            respondStubs: [.success(.toolCalls([makeToolCall()])), .success(.text(makeSomeString())), .success(.toolCalls([makeToolCall()]))],
            executeStubs: [.success(makeSomeString()), .success(makeSomeString())]
        )

        _ = try await collect(sut.process(makeSomeString()))

        #expect(execute.callCount == 1)
    }

    @Test func test_process_shouldPropagateRespondError() async throws {

        let error = makeSomeError(domain: makeSomeString())
        let (sut, _, _) = makeSUT(respondStubs: [.failure(error)])

        await #expect {
            _ = try await self.collect(sut.process(makeSomeString()))
        } throws: {
            ($0 as NSError).domain == (error as NSError).domain
        }
    }

    @Test func test_process_shouldPropagateExecuteError() async throws {

        let error = makeSomeError(domain: makeSomeString())
        let (sut, _, _) = makeSUT(
            respondStubs: [.success(.toolCalls([makeToolCall()]))],
            executeStubs: [.failure(error)]
        )

        await #expect {
            _ = try await self.collect(sut.process(makeSomeString()))
        } throws: {
            ($0 as NSError).domain == (error as NSError).domain
        }
    }

    @Test func test_process_shouldPropagateRespondError_afterExecute() async throws {

        let error = makeSomeError(domain: makeSomeString())
        let (sut, _, _) = makeSUT(
            respondStubs: [.success(.toolCalls([makeToolCall()])), .failure(error)],
            executeStubs: [.success(makeSomeString())]
        )

        await #expect {
            _ = try await self.collect(sut.process(makeSomeString()))
        } throws: {
            ($0 as NSError).domain == (error as NSError).domain
        }
    }

    @Test func test_process_shouldPassToolCallAndResultToRespond() async throws {

        let query = makeSomeString()
        let toolCall = makeToolCall()
        let toolResult = makeSomeString()
        let (sut, respond, _) = makeSUT(
            respondStubs: [.success(.toolCalls([toolCall])), .success(.text(makeSomeString()))],
            executeStubs: [.success(toolResult)]
        )

        _ = try await collect(sut.process(query))

        #expect(respond.payloads == [
            [.user(query)],
            [.user(query), .assistant(.toolCalls([toolCall])), .tool(id: toolCall.id, content: toolResult)]
        ])
    }

    @Test func test_process_shouldPassPreviousTurnHistory_onSecondCall() async throws {

        let (query1, response1, query2) = (makeSomeString(), makeSomeString(), makeSomeString())
        let (sut, respond, _) = makeSUT(respondStubs: [.success(.text(response1)), .success(.text(makeSomeString()))])

        _ = try await collect(sut.process(query1))
        _ = try await collect(sut.process(query2))

        #expect(respond.payloads.last == [
            .user(query1),
            .assistant(.text(response1)),
            .user(query2)
        ])
    }

    @Test func test_process_shouldPassToolCallHistory_onSecondCall() async throws {

        let toolCall = makeToolCall()
        let (query1, toolResult, textResponse, query2) =
            (makeSomeString(), makeSomeString(), makeSomeString(), makeSomeString())
        let (sut, respond, _) = makeSUT(
            respondStubs: [.success(.toolCalls([toolCall])), .success(.text(textResponse)), .success(.text(makeSomeString()))],
            executeStubs: [.success(toolResult)]
        )

        _ = try await collect(sut.process(query1))
        _ = try await collect(sut.process(query2))

        #expect(respond.payloads.last == [
            .user(query1),
            .assistant(.toolCalls([toolCall])),
            .tool(id: toolCall.id, content: toolResult),
            .assistant(.text(textResponse)),
            .user(query2)
        ])
    }

    @Test func test_process_shouldRecordError_onRespondFailure() async throws {

        let (query1, query2) = (makeSomeString(), makeSomeString())
        let error = makeSomeError(domain: makeSomeString())
        let (sut, respond, _) = makeSUT(respondStubs: [.failure(error), .success(.text(makeSomeString()))])

        _ = try? await collect(sut.process(query1))
        _ = try await collect(sut.process(query2))

        #expect(respond.payloads.last == [
            .user(query1),
            .error(error.localizedDescription),
            .user(query2)
        ])
    }

    @Test func test_process_shouldRecordError_onExecuteFailure() async throws {

        let toolCall = makeToolCall()
        let (query1, query2) = (makeSomeString(), makeSomeString())
        let error = makeSomeError(domain: makeSomeString())
        let (sut, respond, _) = makeSUT(
            respondStubs: [.success(.toolCalls([toolCall])), .success(.text(makeSomeString()))],
            executeStubs: [.failure(error)]
        )

        _ = try? await collect(sut.process(query1))
        _ = try await collect(sut.process(query2))

        #expect(respond.payloads.last == [
            .user(query1),
            .assistant(.toolCalls([toolCall])),
            .error(error.localizedDescription),
            .user(query2)
        ])
    }

    @Test func test_process_shouldExecuteAllToolCallsFromOneResponse() async throws {

        let (call1, call2) = (makeToolCall(), makeToolCall())
        let (result1, result2, text) = (makeSomeString(), makeSomeString(), makeSomeString())
        let (sut, _, execute) = makeSUT(
            respondStubs: [.success(.toolCalls([call1, call2])), .success(.text(text))],
            executeStubs: [.success(result1), .success(result2)]
        )

        let events = try await collect(sut.process(makeSomeString()))

        #expect(execute.payloads == [call1, call2])
        #expect(events == [
            .toolCall(call1), .toolResult(result1),
            .toolCall(call2), .toolResult(result2),
            .text(text)
        ])
    }

    // MARK: - Helpers

    private typealias SUT = ToolUseLoop
    private typealias RespondSpy = AsyncSpyOf<[SUT.Message], SUT.Response>
    private typealias ExecuteSpy = AsyncSpyOf<SUT.ToolCall, String>

    private func makeSUT(
        respondStubs: [RespondSpy.Stub]? = nil,
        executeStubs: [ExecuteSpy.Stub]? = nil,
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (SUT, RespondSpy, ExecuteSpy) {

        let respond = RespondSpy(stubs: respondStubs ?? [.success(.toolCalls([makeToolCall()])), .success(.text(makeSomeString()))])
        let execute = ExecuteSpy(stubs: executeStubs ?? [.success(makeSomeString())])
        let sut = SUT(
            respond: respond.call(payload:),
            execute: execute.call(payload:)
        )
        trackForMemoryLeaks(sut, sourceLocation: sourceLocation)
        trackForMemoryLeaks(respond, sourceLocation: sourceLocation)
        trackForMemoryLeaks(execute, sourceLocation: sourceLocation)
        return (sut, respond, execute)
    }

    private func collect(_ stream: SUT.EventStream) async throws -> [SUT.Event] {

        var events = [SUT.Event]()
        for try await event in stream {
            events.append(event)
        }
        return events
    }

    private func makeToolCall() -> SUT.ToolCall {

        .init(id: makeSomeString(), name: makeSomeString(), arguments: makeSomeString())
    }
}
