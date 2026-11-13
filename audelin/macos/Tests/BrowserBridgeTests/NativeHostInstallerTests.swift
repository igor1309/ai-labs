import BrowserBridge
import Foundation
import Testing

@Suite struct NativeHostInstallerTests {
    @Test func writesTheManifestForBothBrowsers() throws {
        let home = try TempHome(browsers: [.chrome, .yandex])
        let sut = home.installer()

        #expect(try sut.install() == [.chrome: .written, .yandex: .written])
        for browser in NativeHostInstaller.Browser.allCases {
            let manifest = try home.manifest(sut, browser)
            #expect(manifest["name"] as? String == "app.audelin.call_companion")
            #expect(manifest["path"] as? String == "/Applications/Audelin.app/Contents/MacOS/audelin-browser-host")
            #expect(manifest["type"] as? String == "stdio")
            #expect(manifest["allowed_origins"] as? [String] == ["chrome-extension://boljabpcnipijdcdjjnmnpbfbdjjodkf/"])
        }
        #expect(sut.manifestURL(for: .chrome).path.hasSuffix("Library/Application Support/Google/Chrome/NativeMessagingHosts/app.audelin.call_companion.json"))
        #expect(sut.manifestURL(for: .yandex).path.hasSuffix("Library/Application Support/Yandex/YandexBrowser/NativeMessagingHosts/app.audelin.call_companion.json"))
    }

    @Test func aSecondRunChangesNothing() throws {
        let home = try TempHome(browsers: [.chrome, .yandex])
        let sut = home.installer()
        _ = try sut.install()
        let before = try home.snapshot(sut)

        #expect(try sut.install() == [.chrome: .unchanged, .yandex: .unchanged])
        #expect(try home.snapshot(sut) == before)
    }

    @Test func skipsABrowserThatIsNotInstalled() throws {
        let home = try TempHome(browsers: [.yandex])
        let sut = home.installer()

        #expect(try sut.install() == [.chrome: .browserAbsent, .yandex: .written])
        #expect(!FileManager.default.fileExists(atPath: sut.manifestURL(for: .chrome).deletingLastPathComponent().path))
    }

    @Test func repairsAStaleManifestOfOurs() throws {
        let home = try TempHome(browsers: [.chrome])
        _ = try home.installer(app: "/old/place/Audelin.app").install()
        let sut = home.installer()

        #expect(try sut.install()[.chrome] == .written)
        #expect(try home.manifest(sut, .chrome)["path"] as? String == "/Applications/Audelin.app/Contents/MacOS/audelin-browser-host")
    }

    @Test func leavesAFileItDidNotWriteAlone() throws {
        let home = try TempHome(browsers: [.chrome])
        let sut = home.installer()
        let foreign = Data(#"{"name":"app.audelin.call_companion","description":"someone else's","path":"/x","type":"stdio","allowed_origins":[]}"#.utf8)
        let url = sut.manifestURL(for: .chrome)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try foreign.write(to: url)

        #expect(try sut.install()[.chrome] == .foreignFile)
        #expect(try Data(contentsOf: url) == foreign)
    }
}

private struct TempHome {
    let url: URL

    init(browsers: [NativeHostInstaller.Browser]) throws {
        url = FileManager.default.temporaryDirectory.appending(path: "audelin-home-\(UUID().uuidString)")
        let folders = [NativeHostInstaller.Browser.chrome: "Google/Chrome", .yandex: "Yandex/YandexBrowser"]
        for browser in browsers {
            try FileManager.default.createDirectory(at: url.appending(path: "Library/Application Support/\(folders[browser]!)"), withIntermediateDirectories: true)
        }
    }

    func installer(app: String = "/Applications/Audelin.app") -> NativeHostInstaller {
        NativeHostInstaller(home: url, appBundle: URL(filePath: app))
    }

    func manifest(_ sut: NativeHostInstaller, _ browser: NativeHostInstaller.Browser) throws -> [String: Any] {
        try #require(try JSONSerialization.jsonObject(with: Data(contentsOf: sut.manifestURL(for: browser))) as? [String: Any])
    }

    func snapshot(_ sut: NativeHostInstaller) throws -> [String] {
        try NativeHostInstaller.Browser.allCases.map { browser in
            let url = sut.manifestURL(for: browser)
            let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
            return "\(try Data(contentsOf: url).base64EncodedString()) \(attributes[.modificationDate]!) \(attributes[.systemFileNumber]!)"
        }
    }
}
