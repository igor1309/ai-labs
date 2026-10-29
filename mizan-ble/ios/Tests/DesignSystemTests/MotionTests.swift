import Testing
@testable import DesignSystem

struct MotionTests {
    @Test func reducedMotionUsesCrossfadeOrNoAnimation() {
        #expect(Motion.fast(reduced: true) == Motion.crossfade)
        #expect(Motion.standard(reduced: true) == Motion.crossfade)
        #expect(Motion.panel(reduced: true) == Motion.crossfade)
        #expect(Motion.tick(reduced: true) == nil)
    }
}
