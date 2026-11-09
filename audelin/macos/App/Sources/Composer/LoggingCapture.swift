import LiveAudio

/// Observes the mono stream consumed by LiveAudio, preserving its pieces and errors.
actor LoggingCapture: Capture {

    let base: any Capture
    let sink: any LogSink
    let side: String
    private var receiving: Task<Summary, Never>?

    private struct Summary: Sendable {
        var pieces = 0
        var frames = 0
        var failure: String?
    }

    init(base: any Capture, sink: any LogSink, side: String) {
        self.base = base
        self.sink = sink
        self.side = side
    }

    func start() async throws -> AsyncThrowingStream<AudioPiece, any Error> {
        sink.write(.init(category: .capture, message: "\(side) stream start"))
        let stream: AsyncThrowingStream<AudioPiece, any Error>
        do { stream = try await base.start() }
        catch {
            sink.write(.init(category: .capture, message: "\(side) stream start failed pieces=0 frames=0", error: String(describing: error)))
            throw error
        }
        let output = AsyncThrowingStream<AudioPiece, any Error>.makeStream()
        let sink = sink, side = side
        let task = Task {
            var summary = Summary()
            do {
                for try await piece in stream {
                    if summary.pieces == 0 {
                        sink.write(.init(category: .capture, message: "\(side) first piece sampleRate=\(piece.sampleRate) channels=1 frames=\(piece.samples.count)"))
                    }
                    summary.pieces += 1
                    summary.frames += piece.samples.count
                    output.continuation.yield(piece)
                }
                output.continuation.finish()
            } catch {
                summary.failure = String(describing: error)
                output.continuation.finish(throwing: error)
            }
            return summary
        }
        receiving = task
        output.continuation.onTermination = { _ in task.cancel() }
        return output.stream
    }

    func stop() async throws {
        var failure: (any Error)?
        do { try await base.stop() }
        catch {
            failure = error
            // A failing stop can leave the source open; join the observer as well.
            receiving?.cancel()
        }
        let summary = await receiving?.value ?? Summary()
        let errors = [summary.failure, failure.map { String(describing: $0) }].compactMap { $0 }
        sink.write(.init(category: .capture, message: "\(side) stream stopped pieces=\(summary.pieces) frames=\(summary.frames)", error: errors.isEmpty ? nil : errors.joined(separator: "; ")))
        if let failure { throw failure }
    }
}
