import BrowserBridge
import Composer
import Foundation
import os

/// Points Chrome and Yandex Browser at the helper inside this app bundle, so
/// the call companion extension can reach Audelin. A failure is logged and
/// leaves the app running: only the browser channel is missing then.
func installBrowserHost(appBundle: URL) {
    let log = Logger(subsystem: "dev.igor1309.audelin", category: "browser")
    do {
        let outcomes = try NativeHostInstaller(home: FileManager.default.homeDirectoryForCurrentUser, appBundle: appBundle).install()
        for (browser, outcome) in outcomes where outcome == .written || outcome == .foreignFile {
            log.notice("native host for \(browser.rawValue, privacy: .public): \(String(describing: outcome), privacy: .public)")
        }
    } catch {
        log.error("native host install failed: \(error.localizedDescription, privacy: .public)")
    }
}

/// Opens the socket the extension's native host connects to, with the secret
/// only that host can read. Nil, logged, when the socket cannot be opened: the
/// recording goes on without names from the browser.
@Sendable func openBrowserChannel() -> BrowserChannel? {
    let home = FileManager.default.homeDirectoryForCurrentUser
    do {
        let secret = try BrowserSocketSecret.prepare(at: BrowserSocketSecret.path(home: home))
        let listener = try BrowserSocketListener(path: BrowserSocket.path(home: home), secret: secret)
        return BrowserChannel(connections: listener.connections, stop: { listener.stop() })
    } catch {
        Logger(subsystem: "dev.igor1309.audelin", category: "browser")
            .error("browser channel failed to open: \(String(describing: error), privacy: .public)")
        return nil
    }
}
