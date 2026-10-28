@testable import CoreAudioProcesses
import Testing

struct CallAppNameTests {

    @Test func everyDetectedCallAppHasAName() {

        #expect(!CoreAudioProcesses.callApps.isEmpty)
        for app in CoreAudioProcesses.callApps {
            #expect(CoreAudioProcesses.callAppName(app.bundleID)?.isEmpty == false, "\(app.bundleID)")
        }
    }

    @Test func anUndetectedAppHasNoName() {

        #expect(CoreAudioProcesses.callAppName("com.example.other") == nil)
    }
}
