import Foundation
import TranscriptFormat
@testable import Composer

let testTranscriptBuild = TranscriptBuild(version: "test-version", build: "test-build", mine: "test-microphone", theirs: "test-call")
let testTranscriptOrigin = TranscriptOrigin(start: Date(timeIntervalSince1970: 1000), build: testTranscriptBuild)

func expectedTranscriptOrigin(start: Date = Date(timeIntervalSince1970: 1000),
                              split: TranscriptFormat.Split? = nil,
                              cleaning: TranscriptFormat.Cleaning? = nil) -> TranscriptFormat.Origin {
    .init(calls: [.init(start: start, origin: .init(
        hearing: .init(version: "test-version", build: "test-build"),
        mine: "test-microphone", theirs: "test-call", split: split, cleaning: cleaning))])
}
