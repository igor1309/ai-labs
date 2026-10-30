import Testing
@testable import DesignSystem

struct MotionTests {
    @Test func reducedMotionUsesCrossfadeOrNoAnimation() {
        #expect(Motion.fast(reduced: true) == Motion.crossfade)
        #expect(Motion.standard(reduced: true) == Motion.crossfade)
        #expect(Motion.panel(reduced: true) == Motion.crossfade)
        #expect(Motion.tick(reduced: true) == nil)
    }

    @Test func fadeThroughLetsTheOldViewGoBeforeTheNewOneComes() {
        #expect(Motion.fadeOut.delay == 0)
        #expect(Motion.fadeIn.delay >= Motion.fadeOut.duration)
    }
}
