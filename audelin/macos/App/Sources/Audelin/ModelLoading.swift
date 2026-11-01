import Composer
import LiveText

func loadModel(
    recognizerSource: @escaping @Sendable () async throws -> any Recognizer,
    sink: any LogSink
) -> Task<Void, any Error> {

    Task {
        sink.write(.init(category: .model, message: "load started"))
        do {
            _ = try await recognizerSource()
            sink.write(.init(category: .model, message: "load finished"))
        } catch {
            sink.write(.init(category: .model, message: "load failed", error: String(describing: error)))
            throw error
        }
    }
}
