import Foundation
import SummaryRuntime

/// The normal runtime protocol with script-controlled completion and no model or network.
actor LiveSummaryService: HTTPRequesting {
    enum Stage: String, Sendable { case started, completed, cancelled }
    private let wait: @Sendable (Int) async throws -> Void
    private let report: @Sendable (Int, Stage) throws -> Void
    private var nextRequest = 0

    init(wait: @escaping @Sendable (Int) async throws -> Void,
         report: @escaping @Sendable (Int, Stage) throws -> Void) {
        self.wait = wait; self.report = report
    }

    func request(url: URL, headers: [String: String], body: Data, loopback: Bool) async throws -> HTTPResponse {
        nextRequest += 1
        let request = nextRequest
        try report(request, .started)
        do {
            try await wait(request)
            try Task.checkCancellation()
            let data = try JSONSerialization.data(withJSONObject: ["choices": [[
                "finish_reason": "stop", "message": ["content": Self.notes],
            ]]])
            try report(request, .completed)
            return HTTPResponse(status: 200, body: data)
        } catch {
            if Task.isCancelled || error is CancellationError { try report(request, .cancelled) }
            throw error
        }
    }

    static let notes = """
    ## О чём встреча

    Обсудили выпуск Audelin.

    ## Ключевые моменты

    Проверяем итоги звонка.

    ## Решения

    Выпустить обновление после проверки.

    ## Задачи

    Проверить итоги перед выпуском [00:03].
    """ + "\n"
}
