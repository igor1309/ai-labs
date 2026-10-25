import CoreAudio
import Foundation
import Synchronization
import Testing
@testable import SystemAudioCapture

struct NativeCaptureBindingTests {

    @Test(arguments: [0, 1, 3])
    func contractStartWaitsForATappableChild(refusals: Int) async throws {

        let calls = RecordingCaptureCalls(format: .float32MonoLittleEndian)
        var native = calls.native
        let createTap = native.createTap
        let attempts = Mutex(0)
        native.createTap = { description, tap in
            let attempt = attempts.withLock { $0 += 1; return $0 }
            if attempt <= refusals { return kAudioHardwareBadObjectError }
            return createTap(description, &tap)
        }
        let pauses = Mutex(0)
        let capture = try await CoreAudioBindingTests().start(10, binding: CoreAudioBinding(native: native)) {
            pauses.withLock { $0 += 1 }
        }
        defer { capture.stop() }
        try calls.deliver(samples: [0.25])
        capture.stop()
        #expect(try await drain(capture).map(\.samples) == [[0.25]])
        #expect(attempts.withLock { $0 } == refusals + 1)
        #expect(pauses.withLock { $0 } == refusals)
    }

    @Test(arguments: [OSStatus(-50), kAudioHardwareIllegalOperationError])
    func contractStartPropagatesOtherErrorsWithoutWaiting(status: OSStatus) async throws {

        let calls = RecordingCaptureCalls(format: .float32MonoLittleEndian)
        var native = calls.native
        let attempts = Mutex(0)
        native.createTap = { _, _ in
            attempts.withLock { $0 += 1 }
            return status
        }
        do {
            let capture = try await CoreAudioBindingTests().start(10, binding: CoreAudioBinding(native: native)) {
                Issue.record("Only a bad-object refusal may wait")
            }
            capture.stop()
            Issue.record("The refused native start must throw")
        } catch {
            #expect((error as NSError).domain == NSOSStatusErrorDomain)
            #expect((error as NSError).code == Int(status))
        }
        #expect(attempts.withLock { $0 } == 1)
    }

    @Test func nativeFormatChangeDuringInstallUsesSubscribedRate() async throws {

        let calls = RecordingCaptureCalls(format: .float32MonoLittleEndian)
        calls.state.withLock {
            var format = $0.format
            format.mSampleRate = 24_000
            $0.formatOnRegistration = format
        }
        let capture = try SystemAudioCapture(binding: CoreAudioBinding(native: calls.native), processes: .only([10]))
        defer { capture.stop() }
        try calls.deliver(samples: [0.25])
        try calls.deliver(samples: [0.5, 0.75])
        capture.stop()
        let pieces = try await drain(capture)
        #expect(pieces.map(\.samples) == [[0.25], [0.5, 0.75]])
        #expect(pieces.map(\.sampleRate) == [24_000, 24_000])
        #expect(calls.state.withLock { $0.subscribedFormatReads } == 1)
    }

    @Test func nativeFailedFormatReadDuringInstallRemovesListenerWithoutIO() throws {

        try expectInstallFormatFailure(format: .float32MonoLittleEndian, readRefused: true)
    }

    @Test(arguments: NativeTapFormat.allCases.filter { $0 != .float32MonoLittleEndian })
    func nativeRefusedFormatDuringInstallRemovesListenerWithoutIO(format: NativeTapFormat) throws {

        try expectInstallFormatFailure(format: format, readRefused: false)
    }

    private func expectInstallFormatFailure(format: NativeTapFormat, readRefused: Bool) throws {

        let calls = RecordingCaptureCalls(format: .float32MonoLittleEndian)
        let (binding, tap, device) = try calls.makeDevice()
        defer { binding.destroyDevice(device); binding.destroyTap(tap) }
        calls.state.withLock {
            $0.formatOnRegistration = format.value
            $0.refuseFormatOnRegistration = readRefused
        }
        let deliveries = Mutex(0)
        let install = {
            let io = try binding.installIO(device) { _ in deliveries.withLock { $0 += 1 } }
            defer { binding.removeIO(device, io) }
        }
        if readRefused {
            #expect(throws: NSError(domain: NSOSStatusErrorDomain, code: -50), performing: install)
        } else {
            #expect(throws: CaptureError.unsupportedFormat, performing: install)
        }
        let registration = try #require(calls.state.withLock { $0.lastFormatListener })
        // Listener removal can leave an already queued notification.
        calls.fire([registration.address], on: tap, through: registration)
        #expect(deliveries.withLock { $0 } == 0)
        let resources = calls.state.withLock { ($0.made, $0.released) }
        #expect(resources.0 == [
            .tap(tap), .device(device),
            .listener(tap, ListenerIdentity(registration.address, registration.queue, registration.block)),
        ])
        #expect(resources.1 == Array(resources.0.suffix(1)))
        #expect(calls.state.withLock { $0.io == nil && $0.formatListener == nil })
        #expect(calls.state.withLock { !$0.events.contains("io") })
        #expect(calls.state.withLock { $0.subscribedFormatReads } == 1)
    }

    @Test func nativeBuffersKeepInputSamplesAndRatesInDeliveryOrder() async throws {

        let calls = RecordingCaptureCalls(format: .float32MonoLittleEndian)
        let capture = try SystemAudioCapture(binding: CoreAudioBinding(native: calls.native), processes: .only([10]))
        let samples: [[Float]] = [
            [-0.875, -0.75, -0.625], [-0.5],
            [-0.375, -0.25, -0.125, 0], [0.125, 0.25],
        ]
        try calls.deliver(samples: samples[0])
        try calls.deliver(samples: samples[1])
        calls.state.withLock { $0.format.mSampleRate = 24_000 }
        try calls.notifyFormat()
        try calls.deliver(samples: samples[2])
        try calls.deliver(samples: samples[3])
        capture.stop()
        let pieces = try await drain(capture)
        #expect(pieces.map(\.samples) == samples)
        #expect(pieces.map(\.sampleRate) == [48_000, 48_000, 24_000, 24_000])
    }

    @Test func nativeIOCallbackMakesNoNativeCalls() throws {

        let calls = RecordingCaptureCalls(format: .float32MonoLittleEndian)
        let (binding, tap, device) = try calls.makeDevice()
        defer { binding.destroyDevice(device); binding.destroyTap(tap) }
        let pieces = Mutex<[AudioPiece]>([])
        let io = try binding.installIO(device) { result in
            if case .success(let piece) = result { pieces.withLock { $0.append(piece) } }
        }
        defer { binding.removeIO(device, io) }
        calls.state.withLock { $0.format.mSampleRate = 24_000 }
        try calls.deliver(samples: [0.25])
        #expect(pieces.withLock { $0.map(\.sampleRate) } == [48_000])
        #expect(calls.state.withLock { $0.nativeCalls.filter { $0.role == .io } }.isEmpty)
        #expect(calls.state.withLock { $0.events } == ["tap", "device", "format", "format watch", "io"])
        try calls.notifyFormat()
        try calls.deliver(samples: [0.5])
        #expect(pieces.withLock { $0.map(\.sampleRate) } == [48_000, 24_000])
        #expect(calls.state.withLock { $0.nativeCalls.filter { $0.role == .io } }.isEmpty)
        #expect(calls.state.withLock { $0.nativeCalls.filter { $0.role == .event }.map(\.name) } == ["read"])
    }

    @Test(arguments: NativeTapFormat.allCases.filter { $0 != .float32MonoLittleEndian })
    func nativeRefusedFormatNotificationsFailOnceAndSuppressLaterBuffers(format: NativeTapFormat) throws {

        try expectFormatFailure(format: format, readRefused: false)
    }

    @Test func nativeFailedFormatReadNotificationFailsOnceAndSuppressesLaterBuffers() throws {

        try expectFormatFailure(format: .float32MonoLittleEndian, readRefused: true)
    }

    @Test(arguments: [false, true])
    func nativeHeldBufferSurvivesFormatFailure(readRefused: Bool) async throws {

        let calls = RecordingCaptureCalls(format: .float32MonoLittleEndian)
        let copied = AsyncStream<Void>.makeStream()
        let release = DispatchSemaphore(value: 0)
        defer { release.signal() }
        let firstCopy = Mutex(true)
        let binding = CoreAudioBinding(native: calls.native, afterIOBufferCopy: {
            let hold = firstCopy.withLock {
                guard $0 else { return false }
                $0 = false
                return true
            }
            guard hold else { return }
            copied.continuation.yield(())
            release.wait()
        })
        let tap = try binding.createTap(TapRequest(selection: .only([10]), mono: true, unmuted: true, isPrivate: true))
        let device = try binding.createDevice(DeviceRequest(tap: tap, isPrivate: true, autoStart: false))
        defer { binding.destroyDevice(device); binding.destroyTap(tap) }
        let results = Mutex<[(Result<AudioPiece, any Error>, NativeThreadRole)]>([])
        let io = try binding.installIO(device) { result in
            results.withLock { $0.append((result, NativeThreadRole.current)) }
        }
        defer { binding.removeIO(device, io) }
        let held = Task {
            try calls.deliver(samples: [0.25])
        }
        var copiedIterator = copied.stream.makeAsyncIterator()
        _ = await copiedIterator.next()
        calls.state.withLock {
            if readRefused {
                $0.refuse = "format"
            } else {
                $0.format.mSampleRate = 0
            }
        }
        try calls.notifyFormat()
        try calls.notifyFormat()
        try calls.deliver(samples: [0.5])
        #expect(results.withLock { $0.count } == 1)
        let failure = try #require(results.withLock { $0.first })
        if case .failure(let error) = failure.0 {
            #expect(error as? CaptureError == .unsupportedFormat)
            #expect(failure.1 == .event)
        } else {
            Issue.record("The format notification must fail capture")
        }
        release.signal()
        try await held.value
        let delivered = results.withLock { $0 }
        #expect(delivered.count == 2)
        #expect(try delivered.last?.0.get().samples == [0.25])
        #expect(try delivered.last?.0.get().sampleRate == 48_000)
    }

    @Test func nativeFormatListenerIsRemovedBeforeIOAndIgnoresLateNotifications() throws {

        let calls = RecordingCaptureCalls(format: .float32MonoLittleEndian)
        let (binding, tap, device) = try calls.makeDevice()
        defer { binding.destroyDevice(device); binding.destroyTap(tap) }
        let deliveries = Mutex(0)
        let io = try binding.installIO(device) { _ in deliveries.withLock { $0 += 1 } }
        defer { binding.removeIO(device, io) }
        let registration = try #require(calls.state.withLock { $0.formatListener })
        #expect(registration.device == tap)
        #expect(registration.address.mSelector == kAudioTapPropertyFormat)
        #expect(registration.address.mScope == kAudioObjectPropertyScopeGlobal)
        #expect(registration.address.mElement == kAudioObjectPropertyElementMain)
        binding.removeIO(device, io)
        let before = calls.state.withLock { $0.nativeCalls }
        calls.state.withLock { $0.refuse = "format" }
        calls.fire([registration.address], on: tap, through: registration)
        #expect(deliveries.withLock { $0 } == 0)
        #expect(calls.state.withLock { $0.nativeCalls } == before)
        let resources = calls.state.withLock { ($0.made, $0.released) }
        #expect(resources.1 == Array(resources.0.suffix(2)))
        #expect(calls.state.withLock { Array($0.events.suffix(2)) } == ["format unwatch", "remove io"])
    }

    @Test func nativeRefusedFormatListenerRegistrationLeavesNoIO() throws {

        let calls = RecordingCaptureCalls(format: .float32MonoLittleEndian)
        let (binding, tap, device) = try calls.makeDevice()
        defer { binding.destroyDevice(device); binding.destroyTap(tap) }
        calls.state.withLock { $0.refuse = "format watch" }
        let deliveries = Mutex(0)
        #expect(throws: NSError(domain: NSOSStatusErrorDomain, code: -50)) {
            let io = try binding.installIO(device) { _ in deliveries.withLock { $0 += 1 } }
            binding.removeIO(device, io)
        }
        #expect(calls.state.withLock { $0.made } == [.tap(tap), .device(device)])
        #expect(calls.state.withLock { $0.released.isEmpty && $0.io == nil && $0.formatListener == nil })
        #expect(deliveries.withLock { $0 } == 0)
    }

    @Test(arguments: NativeTapFormat.allCases.filter { $0 != .float32MonoLittleEndian })
    func nativeInstallIOChecksFormatBeforeMakingResources(format: NativeTapFormat) throws {

        let calls = RecordingCaptureCalls(format: format)
        let (binding, tap, device) = try calls.makeDevice()
        defer { binding.destroyDevice(device); binding.destroyTap(tap) }
        #expect(throws: CaptureError.unsupportedFormat) {
            let io = try binding.installIO(device) { _ in Issue.record("Unexpected delivery") }
            binding.removeIO(device, io)
        }
        #expect(calls.state.withLock { $0.made } == [.tap(tap), .device(device)])
    }

    @Test(arguments: [false, true])
    func nativeFormatFailuresKeepEarlierAudio(readRefused: Bool) async throws {

        let calls = RecordingCaptureCalls(format: .float32MonoLittleEndian)
        let capture = try SystemAudioCapture(binding: CoreAudioBinding(native: calls.native), processes: .only([10]))
        let samples = (0..<480).map { tone(10, frame: $0, rate: 48_000) }
        try calls.deliver(samples: samples)
        calls.state.withLock {
            if readRefused { $0.refuse = "format" } else { $0.format.mSampleRate = 0 }
        }
        try calls.notifyFormat()
        capture.stop()
        var pieces: [AudioPiece] = []
        var failure: (any Error)?
        do {
            for try await piece in capture.audio { pieces.append(piece) }
        } catch { failure = error }
        #expect(failure as? CaptureError == .unsupportedFormat)
        #expect(pieces.count == 1)
        try expectTone(pieces, pid: 10)
        #expect(calls.state.withLock { $0.released } == calls.expectedReleases)
    }

    private func expectFormatFailure(format: NativeTapFormat, readRefused: Bool) throws {

        let calls = RecordingCaptureCalls(format: .float32MonoLittleEndian)
        let (binding, tap, device) = try calls.makeDevice()
        defer { binding.destroyDevice(device); binding.destroyTap(tap) }
        let results = Mutex<[(Result<AudioPiece, any Error>, NativeThreadRole)]>([])
        let io = try binding.installIO(device) { result in
            results.withLock { $0.append((result, NativeThreadRole.current)) }
        }
        defer { binding.removeIO(device, io) }
        try calls.deliver(samples: [0.25])
        calls.state.withLock {
            $0.format = format.value
            if readRefused { $0.refuse = "format" }
        }
        try calls.notifyFormat()
        try calls.notifyFormat()
        try calls.deliver(samples: [0.5])
        calls.state.withLock { $0.refuse = nil; $0.format = NativeTapFormat.float32MonoLittleEndian.value }
        try calls.notifyFormat()
        try calls.deliver(samples: [0.75])
        let delivered = results.withLock { $0 }
        #expect(delivered.count == 2)
        #expect(try delivered.first?.0.get().samples == [0.25])
        let last = try #require(delivered.last)
        if case .failure(let error) = last.0 {
            #expect(error as? CaptureError == .unsupportedFormat)
            #expect(last.1 == .event)
        } else { Issue.record("The format notification must fail capture") }
        #expect(calls.state.withLock { $0.nativeCalls.filter { $0.role == .io } }.isEmpty)
    }

    @Test(arguments: NativeTapFormat.allCases)
    func nativeTapFormatsAcceptOnlyFloat32MonoLittleEndian(format: NativeTapFormat) throws {

        let calls = RecordingCaptureCalls(format: format)
        let binding = CoreAudioBinding(native: calls.native)
        if format == .float32MonoLittleEndian {
            #expect(try binding.sampleRate(11) == 48_000)
        } else {
            #expect(throws: CaptureError.unsupportedFormat) { try binding.sampleRate(11) }
        }
        #expect(calls.state.withLock { $0.propertyReads } == [NativeAddress(kAudioTapPropertyFormat)])
    }

    @Test func nativeAggregateContainsOnlyItsPrivateManualTap() async throws {

        let calls = RecordingCaptureCalls(format: .float32MonoLittleEndian)
        let capture = try SystemAudioCapture(binding: CoreAudioBinding(native: calls.native), processes: .only([10]))
        capture.stop()
        #expect(try await drain(capture).isEmpty)
        let aggregate = try #require(calls.state.withLock { $0.aggregates.first?.value })
        let tap = try #require(calls.state.withLock { $0.created.first })
        #expect(aggregate[kAudioAggregateDeviceIsPrivateKey] as? Bool == true)
        #expect(aggregate[kAudioAggregateDeviceTapAutoStartKey] as? Bool == false)
        let taps = try #require(aggregate[kAudioAggregateDeviceTapListKey] as? [[String: String]])
        #expect(taps == [[kAudioSubTapUIDKey: tap.uuid.uuidString]])
        #expect(aggregate[kAudioAggregateDeviceSubDeviceListKey] == nil)
        #expect(aggregate[kAudioAggregateDeviceMainSubDeviceKey] == nil)
    }

    @Test(arguments: StopNotification.allCases, NativeDeviceState.allCases)
    func nativeStopNotificationsReadTheirOwnDeviceState(notification: StopNotification, deviceState: NativeDeviceState) throws {

        let calls = RecordingCaptureCalls(format: .float32MonoLittleEndian)
        let binding = CoreAudioBinding(native: calls.native)
        let stops = Mutex(0)
        let watch = try binding.watchDevice(22) { stops.withLock { $0 += 1 } }
        defer { binding.unwatchDevice(22, watch) }
        let registration = try #require(calls.state.withLock { $0.listener })
        #expect(registration.address.mSelector == kAudioObjectPropertySelectorWildcard)
        #expect(registration.address.mScope == kAudioObjectPropertyScopeWildcard)
        #expect(registration.address.mElement == kAudioObjectPropertyElementWildcard)
        calls.state.withLock {
            $0.alive = deviceState == .runningOnly ? 0 : 1
            $0.running = deviceState == .aliveOnly ? 0 : 1
            $0.aliveStatus = deviceState == .aliveReadFails ? -50 : noErr
            $0.runningStatus = deviceState == .runningReadFails ? -50 : noErr
        }
        if notification == .afterUnwatch { binding.unwatchDevice(22, watch) }
        let address = AudioObjectPropertyAddress(
            mSelector: notification.selector, mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        calls.fire([address], on: 22, through: registration)
        #expect(calls.state.withLock { $0.propertyReads } == notification.expectedReads)
        #expect(stops.withLock { $0 } == (notification.reportsStop(in: deviceState) ? 1 : 0))
    }

    @Test(arguments: [noErr, OSStatus(-50)])
    func nativeRunningZeroNoticeKeepsDeliveringAudio(readStatus: OSStatus) async throws {

        let calls = RecordingCaptureCalls(format: .float32MonoLittleEndian)
        let capture = try SystemAudioCapture(binding: CoreAudioBinding(native: calls.native), processes: .only([10]))
        defer { capture.stop() }
        calls.state.withLock {
            $0.running = 0
            $0.runningStatus = readStatus
        }
        let registration = try #require(calls.state.withLock { $0.listener })
        let address = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyDeviceIsRunning,
            mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain
        )
        calls.fire([address], on: 22, through: registration)
        try calls.deliver(samples: [0.25, -0.5])
        capture.stop()
        let pieces = try await drain(capture)
        #expect(pieces.map(\.samples) == [[0.25, -0.5]])
        #expect(pieces.map(\.sampleRate) == [48_000])
    }

    @Test func nativeStopNotificationsRequireMatchingSubscriptions() throws {

        let notification = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyIOStoppedAbnormally,
            mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain
        )
        let subscriptions: [(device: UInt32, selector: UInt32, scope: UInt32, element: UInt32, reportsStop: Bool)] = [
            (22, kAudioObjectPropertySelectorWildcard, kAudioObjectPropertyScopeWildcard, kAudioObjectPropertyElementWildcard, true),
            (22, notification.mSelector, notification.mScope, notification.mElement, true),
            (23, notification.mSelector, notification.mScope, notification.mElement, false),
            (22, kAudioDevicePropertyNominalSampleRate, notification.mScope, notification.mElement, false),
            (22, notification.mSelector, kAudioObjectPropertyScopeInput, notification.mElement, false),
            (22, notification.mSelector, notification.mScope, 1, false),
        ]
        for subscription in subscriptions {
            let calls = RecordingCaptureCalls(format: .float32MonoLittleEndian)
            let native = calls.native
            let stops = Mutex(0)
            let queue = DispatchQueue(label: "audelin.test-stop-subscription")
            let block = ListenerBlock(value: { _, _ in stops.withLock { $0 += 1 } })
            var address = AudioObjectPropertyAddress(
                mSelector: subscription.selector, mScope: subscription.scope, mElement: subscription.element
            )
            #expect(native.addListener(subscription.device, &address, queue, block) == noErr)
            defer { _ = native.removeListener(subscription.device, &address, queue, block) }
            let registration = try #require(calls.state.withLock { $0.listener })
            calls.fire([notification], on: 22, through: registration)
            #expect(stops.withLock { $0 } == (subscription.reportsStop ? 1 : 0))
        }
    }

    @Test func nativeStopReleasesEveryHandleInTeardownOrder() async throws {

        let calls = RecordingCaptureCalls(format: .float32MonoLittleEndian)
        let capture = try SystemAudioCapture(binding: CoreAudioBinding(native: calls.native), processes: .only([10]))
        capture.stop()
        capture.stop()
        #expect(try await drain(capture).isEmpty)
        let resources = calls.state.withLock { ($0.made, $0.released) }
        #expect(resources.0.count == 6)
        #expect(resources.1 == calls.expectedReleases)
        #expect(calls.state.withLock { $0.events.suffix(6) } == ["stop", "unwatch", "format unwatch", "remove io", "destroy device", "destroy tap"])
    }

    @Test(arguments: ["tap", "device", "format", "format watch", "io", "watch", "start"])
    func eachRefusedNativeStartingStepReleasesOnlyItsHandles(step: String) {

        let calls = RecordingCaptureCalls(format: .float32MonoLittleEndian)
        calls.state.withLock { $0.refuse = step }
        #expect(throws: NSError(domain: NSOSStatusErrorDomain, code: -50)) {
            _ = try SystemAudioCapture(binding: CoreAudioBinding(native: calls.native), processes: .only([10]))
        }
        let steps = ["tap", "device", "format", "format", "format watch", "io", "watch", "start"]
        let index = steps.firstIndex(of: step)!
        let resources = calls.state.withLock { ($0.made, $0.released) }
        #expect(resources.0.count == [0, 1, 2, 2, 2, 3, 4, 5][index])
        #expect(resources.1 == calls.expectedReleases)
        let releases = calls.expectedReleases.map { resource in
            switch resource {
            case .tap: "destroy tap"
            case .device: "destroy device"
            case .io: "remove io"
            case .listener(let device, _): device == 11 ? "format unwatch" : "unwatch"
            case .running: "stop"
            }
        }
        #expect(calls.state.withLock { $0.events } == Array(steps.prefix(index + 1)) + releases)
    }

    @Test(arguments: [ProcessSelection.only([10, 20]), .allExcept([30, 40])])
    func nativeTapDescriptionTranslatesEveryProcess(selection: ProcessSelection) throws {

        let calls = RecordingCaptureCalls(format: .float32MonoLittleEndian)
        let binding = CoreAudioBinding(native: calls.native)
        let tap = try binding.createTap(TapRequest(selection: selection, mono: true, unmuted: true, isPrivate: true))
        defer { binding.destroyTap(tap) }
        let description = try #require(calls.state.withLock { $0.created.first })
        let pids: [Int32]
        let exclusive: Bool
        switch selection {
        case .only(let named): pids = named; exclusive = false
        case .allExcept(let excluded): pids = excluded; exclusive = true
        }
        #expect(calls.state.withLock { $0.translated } == pids)
        #expect(calls.state.withLock { $0.propertyReads } == pids.map { _ in NativeAddress(kAudioHardwarePropertyTranslatePIDToProcessObject) })
        #expect(description.processes == pids.map { UInt32($0 + 100) })
        #expect(description.exclusive == exclusive)
        #expect(description.mixdown && description.mono && description.unmuted && description.isPrivate)
    }

    @Test func runningRenameWritesTheNativeTapDescription() async throws {

        let calls = RecordingCaptureCalls(format: .float32MonoLittleEndian)
        let capture = try SystemAudioCapture(binding: CoreAudioBinding(native: calls.native), processes: .only([10, 20]))
        try capture.name(.allExcept([30, 40]))
        capture.stop()
        #expect(try await drain(capture).isEmpty)
        let created = try #require(calls.state.withLock { $0.created.first })
        let written = try #require(calls.state.withLock { $0.written.first })
        #expect(written.uuid == created.uuid)
        #expect(written.processes == [130, 140])
        #expect(written.exclusive && written.mixdown && written.mono && written.unmuted && written.isPrivate)
        #expect(calls.state.withLock { $0.writeAddresses } == [NativeAddress(kAudioTapPropertyDescription)])
        #expect(calls.state.withLock { $0.events } == ["tap", "device", "format", "format", "format watch", "io", "watch", "start", "write", "stop", "unwatch", "format unwatch", "remove io", "destroy device", "destroy tap"])
    }

    @Test func aPIDWithoutANativeProcessObjectIsRefused() throws {

        let calls = RecordingCaptureCalls(format: .float32MonoLittleEndian)
        calls.state.withLock { $0.missing = 20 }
        let binding = CoreAudioBinding(native: calls.native)
        #expect(throws: CaptureError.processUnavailable(20)) {
            _ = try binding.createTap(TapRequest(selection: .only([10, 20]), mono: true, unmuted: true, isPrivate: true))
        }
        #expect(calls.state.withLock { $0.created.isEmpty })
    }

    @Test func aRefusedNativeDescriptionWriteIsThrown() async throws {

        let calls = RecordingCaptureCalls(format: .float32MonoLittleEndian)
        let capture = try SystemAudioCapture(binding: CoreAudioBinding(native: calls.native), processes: .only([10]))
        calls.state.withLock { $0.writeStatus = -50 }
        do {
            try capture.name(.only([20, 30]))
            Issue.record("The native write must be refused")
        } catch {
            #expect((error as NSError).domain == NSOSStatusErrorDomain)
            #expect((error as NSError).code == -50)
        }
        capture.stop()
        #expect(try await drain(capture).isEmpty)
    }
}

enum StopNotification: CaseIterable, Sendable {

    case abnormal, alive, running, unrelated, afterUnwatch

    var selector: AudioObjectPropertySelector {

        switch self {
        case .abnormal, .afterUnwatch: kAudioDevicePropertyIOStoppedAbnormally
        case .alive: kAudioDevicePropertyDeviceIsAlive
        case .running: kAudioDevicePropertyDeviceIsRunning
        case .unrelated: kAudioDevicePropertyNominalSampleRate
        }
    }

    var expectedReads: [NativeAddress] {

        switch self {
        case .alive: [NativeAddress(selector)]
        case .abnormal, .running, .unrelated, .afterUnwatch: []
        }
    }

    func reportsStop(in state: NativeDeviceState) -> Bool {

        switch self {
        case .abnormal: true
        case .alive: [.runningOnly, .aliveReadFails].contains(state)
        case .running, .unrelated, .afterUnwatch: false
        }
    }
}

enum NativeDeviceState: CaseIterable, Sendable {

    case aliveOnly, runningOnly, aliveAndRunning, aliveReadFails, runningReadFails
}

enum NativeTapFormat: CaseIterable, Sendable {

    case float32MonoLittleEndian, anotherFormatID, integer, bigEndian, anotherBitDepth, stereo, zeroRate

    var value: AudioStreamBasicDescription {

        var format = AudioStreamBasicDescription()
        format.mSampleRate = 48_000
        format.mFormatID = kAudioFormatLinearPCM
        format.mFormatFlags = kAudioFormatFlagIsFloat
        format.mBitsPerChannel = 32
        format.mChannelsPerFrame = 1
        switch self {
        case .float32MonoLittleEndian: break
        case .anotherFormatID: format.mFormatID = kAudioFormatMPEG4AAC
        case .integer: format.mFormatFlags = kAudioFormatFlagIsSignedInteger
        case .bigEndian: format.mFormatFlags |= kAudioFormatFlagIsBigEndian
        case .anotherBitDepth: format.mBitsPerChannel = 64
        case .stereo: format.mChannelsPerFrame = 2
        case .zeroRate: format.mSampleRate = 0
        }
        return format
    }
}

struct TapSnapshot: Sendable {

    let uuid: UUID
    let processes: [UInt32]
    let exclusive: Bool
    let mixdown: Bool
    let mono: Bool
    let unmuted: Bool
    let isPrivate: Bool

    init(_ description: CATapDescription) {

        uuid = description.uuid
        processes = description.processes
        exclusive = description.isExclusive
        mixdown = description.isMixdown
        mono = description.isMono
        unmuted = description.muteBehavior == .unmuted
        isPrivate = description.isPrivate
    }
}

struct ListenerIdentity: Equatable, Sendable {

    let selector: UInt32
    let scope: UInt32
    let element: UInt32
    let queue: ObjectIdentifier
    let block: UInt

    init(
        _ address: AudioObjectPropertyAddress, _ queue: DispatchQueue,
        _ block: @escaping @convention(block) (UInt32, UnsafePointer<AudioObjectPropertyAddress>) -> Void
    ) {

        selector = address.mSelector
        scope = address.mScope
        element = address.mElement
        self.queue = ObjectIdentifier(queue)
        self.block = unsafeBitCast(block, to: UInt.self)
    }
}

struct NativeAddress: Equatable, Sendable {

    let selector: UInt32
    let scope: UInt32
    let element: UInt32

    init(_ address: AudioObjectPropertyAddress) {

        selector = address.mSelector
        scope = address.mScope
        element = address.mElement
    }

    init(_ selector: AudioObjectPropertySelector) {

        self.init(AudioObjectPropertyAddress(
            mSelector: selector, mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        ))
    }
}

enum NativeResource: Equatable, Sendable {

    case tap(UInt32)
    case device(UInt32)
    case io(UInt32, UInt)
    case listener(UInt32, ListenerIdentity)
    case running(UInt32, UInt)
}

// The dictionary is an immutable snapshot of the native request.
struct AggregateSnapshot: @unchecked Sendable {

    let value: NSDictionary
}

// Retain the native block until removal so its recorded address cannot be reused.
struct ListenerRegistration: @unchecked Sendable {

    let device: AudioObjectID
    let address: AudioObjectPropertyAddress
    let queue: DispatchQueue
    let block: @convention(block) (UInt32, UnsafePointer<AudioObjectPropertyAddress>) -> Void
}

enum NativeThreadRole: String, Sendable {

    case io, event, caller

    static var current: Self {

        (Thread.current.threadDictionary["audelin.native-role"] as? String).flatMap(Self.init(rawValue:)) ?? .caller
    }
}

struct NativeCall: Equatable, Sendable {

    let name: String
    let role: NativeThreadRole
}

final class RecordingCaptureCalls: Sendable {

    struct State {

        var translated: [Int32] = []
        var created: [TapSnapshot] = []
        var written: [TapSnapshot] = []
        var aggregates: [AggregateSnapshot] = []
        var events: [String] = []
        var made: [NativeResource] = []
        var released: [NativeResource] = []
        var nativeCalls: [NativeCall] = []
        var formatListener: ListenerRegistration?
        var lastFormatListener: ListenerRegistration?
        var formatOnRegistration: AudioStreamBasicDescription?
        var refuseFormatOnRegistration = false
        var subscribedFormatReads = 0
        var listener: ListenerRegistration?
        var io: IOBlock?
        var missing: Int32?
        var refuse: String?
        var alive: UInt32 = 1
        var running: UInt32 = 1
        var aliveStatus: Int32 = 0
        var runningStatus: Int32 = 0
        var propertyReads: [NativeAddress] = []
        var writeAddresses: [NativeAddress] = []
        var writeStatus: Int32 = 0
        var format: AudioStreamBasicDescription
    }

    let state: Mutex<State>

    init(format: NativeTapFormat) {

        state = Mutex(State(format: format.value))
    }

    var expectedReleases: [NativeResource] {

        func order(_ resource: NativeResource) -> Int {

            switch resource {
            case .running: 0
            case .listener(let device, _): device == 11 ? 2 : 1
            case .io: 3
            case .device: 4
            case .tap: 5
            }
        }
        return state.withLock { $0.made.sorted { order($0) < order($1) } }
    }

    func makeDevice() throws -> (CoreAudioBinding, UInt32, UInt32) {

        let binding = CoreAudioBinding(native: native)
        let tap = try binding.createTap(TapRequest(selection: .only([10]), mono: true, unmuted: true, isPrivate: true))
        do {
            let device = try binding.createDevice(DeviceRequest(tap: tap, isPrivate: true, autoStart: false))
            return (binding, tap, device)
        } catch {
            binding.destroyTap(tap)
            throw error
        }
    }

    func notifyFormat() throws {

        let registration = try #require(state.withLock { $0.formatListener })
        fire([registration.address], on: 11, through: registration)
    }

    private func record(_ name: String) {

        let call = NativeCall(name: name, role: .current)
        state.withLock { $0.nativeCalls.append(call) }
    }

    func deliver(samples: [Float]) throws {

        let block = try #require(state.withLock { $0.io })
        var samples = samples
        var outputSamples = samples.map { $0 + 1 }
        samples.withUnsafeMutableBytes { bytes in
            var input = AudioBufferList(
                mNumberBuffers: 1,
                mBuffers: AudioBuffer(mNumberChannels: 1, mDataByteSize: UInt32(bytes.count), mData: bytes.baseAddress)
            )
            outputSamples.withUnsafeMutableBytes { outputBytes in
                var output = AudioBufferList(
                    mNumberBuffers: 1,
                    mBuffers: AudioBuffer(mNumberChannels: 1, mDataByteSize: UInt32(outputBytes.count), mData: outputBytes.baseAddress)
                )
                var timestamp = AudioTimeStamp()
                withUnsafePointer(to: &timestamp) { time in
                    let previous = Thread.current.threadDictionary["audelin.native-role"]
                    Thread.current.threadDictionary["audelin.native-role"] = NativeThreadRole.io.rawValue
                    defer { Thread.current.threadDictionary["audelin.native-role"] = previous }
                    block.value(time, &input, time, &output, time)
                }
            }
        }
    }

    /// Delivers matching notifications and drains the queue, including stale blocks.
    func fire(_ addresses: [AudioObjectPropertyAddress], on device: AudioObjectID, through registration: ListenerRegistration) {

        registration.queue.sync {
            let previous = Thread.current.threadDictionary["audelin.native-role"]
            Thread.current.threadDictionary["audelin.native-role"] = NativeThreadRole.event.rawValue
            defer { Thread.current.threadDictionary["audelin.native-role"] = previous }
            guard registration.device == device else { return }
            let subscription = registration.address
            let addresses = addresses.filter {
                (subscription.mSelector == kAudioObjectPropertySelectorWildcard || subscription.mSelector == $0.mSelector)
                    && (subscription.mScope == kAudioObjectPropertyScopeWildcard || subscription.mScope == $0.mScope)
                    && (subscription.mElement == kAudioObjectPropertyElementWildcard || subscription.mElement == $0.mElement)
            }
            guard !addresses.isEmpty else { return }
            addresses.withUnsafeBufferPointer {
                registration.block(UInt32($0.count), $0.baseAddress!)
            }
        }
    }

    private func attempt(_ step: String) -> OSStatus {

        if step != "format" { record(step) }
        return state.withLock {
            $0.events.append(step)
            return $0.refuse == step ? -50 : noErr
        }
    }

    private func release(_ resource: NativeResource, _ event: String) -> OSStatus {

        record(event)
        state.withLock {
            $0.events.append(event)
            $0.released.append(resource)
        }
        return noErr
    }

    var native: CoreAudioCalls {

        CoreAudioCalls(
            createTap: { [self] description, tap in
                let status = attempt("tap")
                guard status == noErr else { return status }
                tap = 11
                state.withLock {
                    $0.created.append(TapSnapshot(description))
                    $0.made.append(.tap(tap))
                }
                return noErr
            },
            destroyTap: { [self] in release(.tap($0), "destroy tap") },
            createDevice: { [self] composition, device in
                let status = attempt("device")
                guard status == noErr else { return status }
                device = 22
                state.withLock {
                    $0.aggregates.append(AggregateSnapshot(value: composition as NSDictionary))
                    $0.made.append(.device(device))
                }
                return noErr
            },
            destroyDevice: { [self] in release(.device($0), "destroy device") },
            read: { [self] object, address, qualifierSize, qualifier, size, data in
                record("read")
                state.withLock { $0.propertyReads.append(NativeAddress(address)) }
                switch address.mSelector {
                case kAudioHardwarePropertyTranslatePIDToProcessObject:
                    #expect(size == MemoryLayout<AudioObjectID>.size)
                    #expect(object == kAudioObjectSystemObject)
                    #expect(qualifierSize == MemoryLayout<Int32>.size)
                    let pid = qualifier!.load(as: Int32.self)
                    let process = state.withLock {
                        $0.translated.append(pid)
                        return $0.missing == pid ? UInt32(0) : UInt32(pid + 100)
                    }
                    data.storeBytes(of: process, as: UInt32.self)
                case kAudioTapPropertyFormat:
                    #expect(size == MemoryLayout<AudioStreamBasicDescription>.size)
                    #expect(object == 11)
                    if let queue = state.withLock({ $0.formatListener?.queue }) {
                        dispatchPrecondition(condition: .onQueue(queue))
                    }
                    // Subscribed reads are separate from the initial startup checks.
                    let status: OSStatus = state.withLock {
                        if $0.formatListener != nil {
                            $0.subscribedFormatReads += 1
                        } else {
                            $0.events.append("format")
                        }
                        return $0.refuse == "format" ? -50 : noErr
                    }
                    guard status == noErr else { return status }
                    let format = state.withLock { $0.format }
                    data.storeBytes(of: format, as: AudioStreamBasicDescription.self)
                case kAudioDevicePropertyDeviceIsAlive, kAudioDevicePropertyDeviceIsRunning:
                    #expect(size == MemoryLayout<UInt32>.size)
                    #expect(object == 22)
                    let result = state.withLock {
                        return address.mSelector == kAudioDevicePropertyDeviceIsAlive
                            ? ($0.alive, $0.aliveStatus) : ($0.running, $0.runningStatus)
                    }
                    data.storeBytes(of: result.0, as: UInt32.self)
                    return result.1
                default:
                    Issue.record("Unexpected native property read")
                }
                return noErr
            },
            write: { [self] tap, address, size, data in
                record("write")
                #expect(tap == 11)
                #expect(NativeAddress(address) == NativeAddress(kAudioTapPropertyDescription))
                #expect(size == MemoryLayout<UnsafeMutableRawPointer>.size)
                let pointer = data.load(as: UnsafeMutableRawPointer.self)
                let description = Unmanaged<CATapDescription>.fromOpaque(pointer).takeUnretainedValue()
                return state.withLock {
                    $0.events.append("write")
                    $0.writeAddresses.append(NativeAddress(address))
                    $0.written.append(TapSnapshot(description))
                    return $0.writeStatus
                }
            },
            createIO: { [self] io, device, block in
                let status = attempt("io")
                guard status == noErr else { return status }
                let handle: AudioDeviceIOProcID = { _, _, _, _, _, _, _ in noErr }
                io = handle
                state.withLock {
                    $0.io = block
                    $0.made.append(.io(device, unsafeBitCast(handle, to: UInt.self)))
                }
                return noErr
            },
            removeIO: { [self] device, io in
                state.withLock { $0.io = nil }
                return release(.io(device, unsafeBitCast(io, to: UInt.self)), "remove io")
            },
            start: { [self] device, io in
                let status = attempt("start")
                guard status == noErr else { return status }
                state.withLock { $0.made.append(.running(device, unsafeBitCast(io, to: UInt.self))) }
                return noErr
            },
            stop: { [self] in release(.running($0, unsafeBitCast($1, to: UInt.self)), "stop") },
            addListener: { [self] device, address, queue, block in
                let status = attempt(device == 11 ? "format watch" : "watch")
                guard status == noErr else { return status }
                let registration = ListenerRegistration(device: device, address: address, queue: queue, block: block.value)
                state.withLock {
                    if device == 11 {
                        $0.formatListener = registration
                        $0.lastFormatListener = registration
                        if let format = $0.formatOnRegistration { $0.format = format }
                        if $0.refuseFormatOnRegistration { $0.refuse = "format" }
                    } else { $0.listener = registration }
                    $0.made.append(.listener(device, ListenerIdentity(address, queue, registration.block)))
                }
                return noErr
            },
            removeListener: { [self] device, address, queue, block in
                let identity = ListenerIdentity(address, queue, block.value)
                state.withLock {
                    if device == 11 { $0.formatListener = nil } else { $0.listener = nil }
                }
                return release(.listener(device, identity), device == 11 ? "format unwatch" : "unwatch")
            }
        )
    }
}
