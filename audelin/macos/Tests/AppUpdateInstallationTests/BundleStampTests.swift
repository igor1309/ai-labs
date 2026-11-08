import BlockingTestWork
import Foundation
import Testing

struct BundleStampTests {
    /// Contract test: the bundle shell script writes a plist, with build and signing tools supplied as spies.
    @Test(arguments: [false, true])
    func stampsCommitDirtinessAndOneUTCInstant(dirty: Bool) async throws {
        let script = URL(filePath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().appendingPathComponent("scripts/bundle.sh")
        let root = try await offPool {
            let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
            return root
        }
        try await withCleanup {
            let process = try await offPool {
                let tools = root.appendingPathComponent("tools")
                let binaries = root.appendingPathComponent("binaries")
                try FileManager.default.createDirectory(at: tools, withIntermediateDirectories: true)
                try FileManager.default.createDirectory(at: binaries.appendingPathComponent("Audelin_GlassLedger.bundle"), withIntermediateDirectories: true)
                try Data("executable fixture".utf8).write(to: binaries.appendingPathComponent("Audelin"))
                let stubs: [String: String] = [
                    "swift": "case \"$*\" in *--show-bin-path*) printf '%s\\n' '\(binaries.path)';; esac",
                    "git": "case \"$*\" in 'rev-parse --short HEAD') echo abc12345;; 'status --porcelain') \(dirty ? "echo ' M source.swift'" : ":");; *) exit 62;; esac",
                    "date": "[ \"$*\" = '-u +%Y%m%dT%H%M%SZ' ] || exit 63; echo 20261108T063502Z",
                    "codesign": "exit 0",
                    "xcrun": """
                    while [ "$#" -gt 0 ]; do
                        if [ "$1" = --output-partial-info-plist ]; then
                            shift
                            cat > "$1" <<'PLIST'
                    <?xml version="1.0"?><plist version="1.0"><dict>
                    <key>CFBundleIconName</key><string>Audelin</string>
                    <key>CFBundleIconFile</key><string>Audelin.icns</string>
                    </dict></plist>
                    PLIST
                            exit 0
                        fi
                        shift
                    done
                    exit 64
                    """,
                ]
                for (name, source) in stubs {
                    let file = tools.appendingPathComponent(name)
                    try ("#!/bin/sh\nset -eu\n" + source + "\n").write(to: file, atomically: true, encoding: .utf8)
                    try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: file.path)
                }
                let process = Process()
                process.executableURL = URL(filePath: "/bin/sh")
                process.arguments = [script.path]
                process.currentDirectoryURL = root
                process.environment = ["PATH": tools.path + ":/usr/bin:/bin", "AUDELIN_SIGN_IDENTITY": "-"]
                process.standardOutput = FileHandle.nullDevice
                process.standardError = FileHandle.nullDevice
                return process
            }
            #expect(try await exitStatus(of: process) == 0)
            let values = try await offPool {
                let data = try Data(contentsOf: root.appendingPathComponent(".build/Audelin.app/Contents/Info.plist"))
                let plist = try PropertyListSerialization.propertyList(from: data, format: nil) as! [String: Any]
                return (plist["AudelinBuildID"] as? String, plist["CFBundleVersion"] as? String)
            }
            #expect(values.0 == "abc12345\(dirty ? "-dirty" : "")-20261108T063502Z")
            #expect(values.1 == "20261108063502")
        } cleanup: {
            try FileManager.default.removeItem(at: root)
        }
    }
}
