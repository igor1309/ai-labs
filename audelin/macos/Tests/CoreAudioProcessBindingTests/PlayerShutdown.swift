/// Child liveness, rather than Foundation's exit notification, owns cleanup:
/// a player can exit without its Process instance delivering that notification.
struct PlayerShutdown: Sendable {

    let isAlive: @Sendable () -> Bool
    let terminate: @Sendable () -> Void
    let forceKill: @Sendable () -> Void
    let now: @Sendable () -> Duration
    let pause: @Sendable () async -> Void

    struct StillRunning: Error {}

    func stop() async throws {

        guard isAlive() else { return }
        terminate()
        await waitForExit()
        guard isAlive() else { return }
        forceKill()
        await waitForExit()
        if isAlive() { throw StillRunning() }
    }

    private func waitForExit() async {

        let deadline = now() + .seconds(5)
        while isAlive(), now() < deadline { await pause() }
    }
}
