import BrowserBridge
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
