import Foundation
import TranscriptFormat
@testable import Composer

let testTranscriptBuild = TranscriptBuild(version: "test-version", build: "test-build", mine: "test-microphone", theirs: "test-call")
let testTranscriptOrigin = TranscriptOrigin(start: Date(timeIntervalSince1970: 1000), build: testTranscriptBuild)
