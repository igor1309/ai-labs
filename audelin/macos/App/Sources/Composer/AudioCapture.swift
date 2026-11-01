protocol AudioCapture: Sendable {

    associatedtype Piece: Sendable

    var audio: AsyncThrowingStream<Piece, any Error> { get }
    func stop()
}
