import Foundation
import Synchronization

public struct HTTPClient: HTTPRequesting {
    private let sleep: @Sendable () async throws -> Void
    private let limit: Int
    public init(limit: Int, sleep: @escaping @Sendable () async throws -> Void) { self.limit = limit; self.sleep = sleep }
    public func request(url: URL, headers: [String: String], body: Data, loopback: Bool) async throws -> HTTPResponse {
        let request = Collection(limit: limit)
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { done in
                let configuration = URLSessionConfiguration.ephemeral
                configuration.urlCache = nil
                configuration.httpCookieStorage = nil
                configuration.urlCredentialStorage = nil
                configuration.timeoutIntervalForRequest = 120
                configuration.timeoutIntervalForResource = 120
                configuration.waitsForConnectivity = false
                if loopback { configuration.connectionProxyDictionary = [:] }
                let session = URLSession(configuration: configuration, delegate: request, delegateQueue: nil)
                var message = URLRequest(url: url)
                message.httpMethod = "POST"; message.httpBody = body
                message.allHTTPHeaderFields = headers
                let task = session.dataTask(with: message)
                request.start(task: task, session: session, continuation: done)
                let timer = Task {
                    do { try await sleep(); request.stop(.timeout) } catch {}
                }
                request.timer(timer)
            }
        } onCancel: { request.stop(.cancelled) }
    }
}
private final class Collection: NSObject, URLSessionDataDelegate, Sendable {
    private struct State {
        var body = Data()
        var status = 0
        var task: URLSessionDataTask?
        var session: URLSession?
        var continuation: CheckedContinuation<HTTPResponse, any Error>?
        var timer: Task<Void, Never>?
        var failure: Failure?
    }
    private let state = Mutex(State())
    private let limit: Int
    init(limit: Int) { self.limit = limit }
    func start(task: URLSessionDataTask, session: URLSession, continuation: CheckedContinuation<HTTPResponse, any Error>) {
        state.withLock { value in
            value.task = task; value.session = session; value.continuation = continuation
            task.resume()
            if value.failure != nil { task.cancel() }
        }
    }
    func timer(_ task: Task<Void, Never>) {
        state.withLock { value in
            if value.continuation == nil { task.cancel() } else { value.timer = task }
        }
    }
    func stop(_ failure: Failure) {
        state.withLock { value in
            if value.failure == nil { value.failure = failure }
            value.task?.cancel()
        }
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
        stop(.transport); completionHandler(nil)
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                    completionHandler: @escaping @Sendable (URLSession.ResponseDisposition) -> Void) {
        state.withLock { $0.status = (response as? HTTPURLResponse)?.statusCode ?? 0 }
        if response.expectedContentLength > limit { stop(.outputLimit); completionHandler(.cancel) }
        else { completionHandler(.allow) }
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        state.withLock { value in
            guard value.failure == nil else { return }
            if value.body.count + data.count > limit { value.failure = .outputLimit; value.task?.cancel() }
            else { value.body.append(data) }
        }
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: (any Error)?) {
        let result = state.withLock { value -> (CheckedContinuation<HTTPResponse, any Error>?, Result<HTTPResponse, any Error>) in
            value.timer?.cancel(); value.timer = nil
            let continuation = value.continuation
            value.continuation = nil; value.task = nil; value.session = nil
            if let failure = value.failure { return (continuation, .failure(failure)) }
            if error != nil { return (continuation, .failure(Failure.transport)) }
            return (continuation, .success(.init(status: value.status, body: value.body)))
        }
        session.finishTasksAndInvalidate()
        result.0?.resume(with: result.1)
    }
}
