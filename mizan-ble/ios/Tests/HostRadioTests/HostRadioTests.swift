import Foundation
@testable import HostRadio
import Testing

@MainActor struct HostRadioTests {
    @Test func bluetoothStatesAreOrdered() async {
        let (radio, binding) = makeRadio()
        for state: HostRadio.BluetoothState in [.poweredOff, .poweredOn, .resetting, .unsupported, .unauthorized] {
            binding.emit(.state(state))
        }
        var iterator = radio.events.makeAsyncIterator()
        for expected: HostRadio.BluetoothState in [.poweredOff, .poweredOn, .resetting, .unsupported, .unauthorized] {
            #expect(await iterator.next() == .bluetoothState(expected))
        }
    }

    @Test func servesBytesAndAdvertisesOnlyAfterServiceAdded() async {
        let (radio, binding) = makeRadio()
        let session = UUID()
        let serving = Task.immediate {
            await radio.serve([1, 2, 3], for: session)
            radio.advertise("MIZAN-7F3A", for: session)
        }
        #expect(binding.calls == [.add(binding.handles[0], [1, 2, 3])])
        binding.emit(.added(binding.handles[0], nil))
        await serving.value
        binding.emit(.advertised(nil))
        #expect(binding.calls == [.add(binding.handles[0], [1, 2, 3]), .advertise("MIZAN-7F3A")])
        #expect(await readEvents(radio, binding) == [.onAir(session: session)])
    }

    @Test(arguments: [false, true])
    func goOnAirFailuresKeepTheirSessionAndError(whileAdvertising: Bool) async {
        let (radio, binding) = makeRadio()
        let session = UUID()
        let error = HostRadio.Failure.system(domain: "radio.test", code: 42, message: "Unavailable")
        let serving = Task.immediate { await radio.serve([9], for: session) }
        binding.emit(.added(binding.handles[0], whileAdvertising ? nil : error))
        await serving.value
        radio.advertise("MIZAN-7F3A", for: session)
        if whileAdvertising { binding.emit(.advertised(error)) }
        #expect(await readEvents(radio, binding) == [.couldNotGoOnAir(session: session, error)])
        if !whileAdvertising { #expect(binding.calls == [.add(binding.handles[0], [9])]) }
    }

    @Test func subscribedClientKeyIsDeliveredAndAnswered() async {
        let (radio, binding, session) = await servedRadio()
        let peer = UUID(), request = UUID()
        let bytes = Array(repeating: UInt8(7), count: 33)
        binding.emit(.subscribed(binding.handles[0], peer: peer, maximum: 64))
        binding.emit(.write(binding.handles[0], request: request, peer: peer, characteristic: .clientKey, bytes: bytes, offset: 0))
        #expect(await readEvents(radio, binding) == [.clientKey(session: session, peer: peer, bytes: bytes)])
        #expect(binding.calls.last == .respond(request, .success))
    }

    @Test(arguments: [PeripheralCharacteristic.clientKey, .toHost])
    func secondCentralCannotWriteOrTakeOwnership(characteristic: PeripheralCharacteristic) async {
        let (radio, binding, _, _) = await ownedRadio()
        let other = UUID(), request = UUID()
        binding.emit(.subscribed(binding.handles[0], peer: other, maximum: 64))
        binding.emit(.write(binding.handles[0], request: request, peer: other, characteristic: characteristic, bytes: [8], offset: 0))
        #expect(await readEvents(radio, binding) == [])
        #expect(binding.calls == [.respond(request, .notPermitted)])
    }

    @Test func ownerDecisionIsDeliveredAndAnswered() async {
        let (radio, binding, session, peer) = await ownedRadio()
        let bytes = Array(repeating: UInt8(3), count: 41)
        let request = UUID()
        binding.emit(.write(binding.handles[0], request: request, peer: peer, characteristic: .toHost, bytes: bytes, offset: 0))
        #expect(await readEvents(radio, binding) == [.decision(session: session, bytes: bytes)])
        #expect(binding.calls == [.respond(request, .success)])
    }

    @Test(arguments: [PeripheralCharacteristic.clientKey, .toHost, .unsupported])
    func writesWithoutASubscribedOwnerAreRefused(characteristic: PeripheralCharacteristic) async {
        let (radio, binding, _) = await servedRadio()
        let peer = UUID(), request = UUID()
        binding.emit(.write(binding.handles[0], request: request, peer: peer, characteristic: characteristic, bytes: [9], offset: 0))
        #expect(await readEvents(radio, binding) == [])
        #expect(binding.calls == [.respond(request, .notPermitted)])
    }

    @Test(arguments: [PeripheralCharacteristic.clientKey, .toHost], [-1, 1])
    func partialWritesAreRefused(characteristic: PeripheralCharacteristic, offset: Int) async {
        let (radio, binding, _, peer) = await ownedRadio()
        let request = UUID()
        binding.emit(.write(binding.handles[0], request: request, peer: peer, characteristic: characteristic, bytes: [9], offset: offset))
        #expect(await readEvents(radio, binding) == [])
        #expect(binding.calls == [.respond(request, .invalidOffset)])
    }

    @Test func sendsOnlyToTheOwner() async throws {
        let (radio, binding, session, peer) = await ownedRadio()
        binding.emit(.subscribed(binding.handles[0], peer: UUID(), maximum: 1))
        try radio.send([1, 2, 3], for: session)
        #expect(binding.calls == [.update(binding.handles[0], peer, [1, 2, 3])])
        #expect(await readEvents(radio, binding) == [])
    }

    @Test func fullQueueDrainsMessagesInOrder() async throws {
        let (radio, binding, session, peer) = await ownedRadio()
        binding.full = true
        try radio.send([1], for: session)
        try radio.send([2, 3], for: session)
        #expect(binding.calls == [])
        binding.drain()
        #expect(binding.calls == [.update(binding.handles[0], peer, [1]), .update(binding.handles[0], peer, [2, 3])])
        #expect(await readEvents(radio, binding) == [])
    }

    @Test(arguments: [0, 20, 21, 41])
    func sendFailsOnlyAboveTheOwnersMaximum(count: Int) async {
        let (radio, binding, session, peer) = await ownedRadio(maximum: 20)
        let bytes = Array(repeating: UInt8(4), count: count)
        var failure: HostRadio.Failure?
        do { try radio.send(bytes, for: session) } catch { failure = error }
        #expect(failure == (count > 20 ? .messageTooLarge(maximum: 20, actual: count) : nil))
        #expect(binding.calls == (count > 20 ? [] : [.update(binding.handles[0], peer, bytes)]))
        #expect(await readEvents(radio, binding) == [])
    }

    @Test func onlyTheOwnerUnsubscribeReportsClientLost() async throws {
        let (radio, binding, session, peer) = await ownedRadio()
        let other = UUID()
        binding.emit(.subscribed(binding.handles[0], peer: other, maximum: 64))
        binding.emit(.unsubscribed(binding.handles[0], peer: other))
        #expect(await readEvents(radio, binding) == [])
        binding.full = true
        try radio.send([1], for: session)
        binding.emit(.unsubscribed(binding.handles[0], peer: peer))
        binding.emit(.unsubscribed(binding.handles[0], peer: peer))
        binding.drain()
        #expect(await readEvents(radio, binding) == [.clientLost(session: session)])
        #expect(binding.calls == [])
    }

    @Test func retiringDropsTheQueueAndAllowsANewOwner() async throws {
        let (radio, binding, session, _) = await ownedRadio()
        radio.advertise("OLD", for: session)
        binding.calls = []
        binding.full = true
        try radio.send([4], for: session)
        radio.retire(session)
        let next = UUID(), peer = UUID(), request = UUID()
        let serving = Task.immediate { await radio.serve([2], for: next) }
        binding.emit(.added(binding.handles.last!, nil))
        await serving.value
        binding.emit(.subscribed(binding.handles.last!, peer: peer, maximum: 64))
        binding.emit(.write(binding.handles.last!, request: request, peer: peer, characteristic: .clientKey, bytes: [8], offset: 0))
        binding.drain()
        #expect(binding.calls == [.stop, .remove(binding.handles[0]), .add(binding.handles.last!, [2]), .respond(request, .success)])
        #expect(await readEvents(radio, binding) == [.clientKey(session: next, peer: peer, bytes: [8])])
    }

    @Test(arguments: [false, true])
    func finishingSendsBeforeRemovingService(queued: Bool) async throws {
        let (radio, binding, session, peer) = await ownedRadio()
        binding.full = queued
        try radio.send([5], for: session)
        radio.finish(session)
        if queued { #expect(binding.calls == []) }
        binding.drain()
        #expect(binding.calls == [.update(binding.handles[0], peer, [5]), .remove(binding.handles[0])])
        #expect(await readEvents(radio, binding) == [])
    }

    @Test func serveWaitsForTheFinishingQueue() async throws {
        let (radio, binding, session, peer) = await ownedRadio()
        binding.full = true
        try radio.send([5], for: session)
        radio.finish(session)
        let next = UUID()
        let serving = Task.immediate {
            await radio.serve([9], for: next)
            radio.advertise("NEXT", for: next)
        }
        #expect(binding.calls == [])
        binding.drain()
        #expect(binding.calls == [.update(binding.handles[0], peer, [5]), .remove(binding.handles[0]), .add(binding.handles.last!, [9])])
        binding.emit(.added(binding.handles.last!, nil))
        await serving.value
        binding.emit(.advertised(nil))
        #expect(binding.calls.last == .advertise("NEXT"))
        #expect(await readEvents(radio, binding) == [.onAir(session: next)])
    }

    @Test(arguments: [false, true])
    func cancelledWaitingServeIsSkippedDuringHandoff(retireFirst: Bool) async throws {
        let (radio, binding, session, peer) = await ownedRadio()
        binding.full = true
        try radio.send([5], for: session)
        radio.finish(session)
        let cancelled = UUID(), next = UUID()
        let waiting = Task.immediate { await radio.serve([9], for: cancelled) }
        let serving = Task.immediate { await radio.serve([8], for: next) }
        if retireFirst { radio.retire(cancelled) }
        waiting.cancel()
        binding.drain()
        #expect(binding.calls == [
            .update(binding.handles[0], peer, [5]), .remove(binding.handles[0]),
            .add(binding.handles.last!, [8]),
        ])
        // End both requests even if the cancelled request was incorrectly started.
        radio.retire(cancelled)
        binding.emit(.added(binding.handles.last!, nil))
        await waiting.value
        await serving.value
        radio.retire(next)
    }

    @Test func cancellingWaitingServeReturnsBeforeTheFinishingQueueDrains() async throws {
        let (radio, binding, session, peer) = await ownedRadio()
        binding.full = true
        try radio.send([5], for: session)
        radio.finish(session)
        let next = UUID()
        let serving = Task.immediate { await radio.serve([9], for: next) }
        serving.cancel()
        await serving.value
        #expect(binding.calls == [])
        binding.drain()
        #expect(binding.calls == [.update(binding.handles[0], peer, [5]), .remove(binding.handles[0])])
    }

    @Test func cancellingServeReturnsWhileServiceAdditionIsOutstanding() async {
        let (radio, binding) = makeRadio()
        let session = UUID()
        let serving = Task.immediate { await radio.serve([9], for: session) }
        serving.cancel()
        await serving.value
        radio.retire(session)
        binding.emit(.added(binding.handles[0], nil))
        #expect(binding.retainedServices.isEmpty)
    }

    @Test func retiringAWaitingSessionPreventsItFromServing() async throws {
        let (radio, binding, session, peer) = await ownedRadio()
        binding.full = true
        try radio.send([5], for: session)
        radio.finish(session)
        let next = UUID()
        let serving = Task.immediate {
            await radio.serve([9], for: next)
            radio.advertise("NEXT", for: next)
        }
        radio.retire(next)
        #expect(binding.calls == [])
        binding.drain()
        binding.emit(.added(next, nil))
        await serving.value
        #expect(binding.calls == [.update(binding.handles[0], peer, [5]), .remove(binding.handles[0])])
        #expect(await readEvents(radio, binding) == [])
    }

    @Test(arguments: [HostRadio.BluetoothState.poweredOff, .resetting, .unsupported, .unauthorized, .unknown])
    func leavingPoweredOnReportsStateThenClientLost(state: HostRadio.BluetoothState) async throws {
        let (radio, binding, session, _) = await ownedRadio()
        binding.full = true
        try radio.send([5], for: session)
        binding.emit(.state(state))
        binding.emit(.state(state))
        binding.drain()
        #expect(await readEvents(radio, binding) == [.bluetoothState(state), .clientLost(session: session), .bluetoothState(state)])
        #expect(binding.calls == [])
    }

    enum FinishEnd: CaseIterable { case unsubscribe, poweredOff, noOwner }

    @Test(arguments: FinishEnd.allCases)
    func finishEndsWhenNothingMoreCanLeave(ending: FinishEnd) async throws {
        let (radio, binding, session) = await servedRadio()
        let peer = UUID()
        if ending != .noOwner {
            binding.emit(.subscribed(binding.handles[0], peer: peer, maximum: 64))
            binding.emit(.write(binding.handles[0], request: UUID(), peer: peer, characteristic: .clientKey, bytes: [7], offset: 0))
            _ = await readEvents(radio, binding)
            binding.calls = []
            binding.full = true
            try radio.send([5], for: session)
        }
        radio.finish(session)
        let next = UUID()
        let serving = Task.immediate { await radio.serve([9], for: next) }
        if ending == .unsubscribe { binding.emit(.unsubscribed(binding.handles[0], peer: peer)) }
        if ending == .poweredOff { binding.emit(.state(.poweredOff)) }
        #expect(binding.calls == [.remove(binding.handles[0]), .add(binding.handles.last!, [9])])
        // End any still-live old service so an assertion failure leaves no suspended serve.
        radio.retire(session)
        binding.emit(.added(binding.handles.last!, nil))
        await serving.value
        binding.drain()
        let expected: [HostRadio.Event] = switch ending {
        case .noOwner: []
        case .unsubscribe: [.clientLost(session: session)]
        case .poweredOff: [.bluetoothState(.poweredOff), .clientLost(session: session)]
        }
        #expect(await readEvents(radio, binding) == expected)
        radio.retire(next)
    }

    @Test func stopAdvertisingNamesItsSessionAndKeepsTheLink() async throws {
        let (radio, binding, session, peer) = await ownedRadio()
        radio.advertise("TILL", for: session)
        binding.calls = []
        radio.stopAdvertising(for: UUID())
        #expect(binding.calls == [])
        radio.stopAdvertising(for: session)
        radio.stopAdvertising(for: session)
        binding.emit(.advertised(nil))
        try radio.send([6], for: session)
        #expect(binding.calls == [.stop, .update(binding.handles[0], peer, [6])])
        #expect(await readEvents(radio, binding) == [])
    }

    @Test func retiredSessionsAndLateCallbacksCannotDisturbTheCurrentOne() async throws {
        let (radio, binding, session, peer) = await ownedRadio()
        let old = UUID(), request = UUID()
        radio.retire(old)
        await radio.serve([9], for: old)
        radio.advertise("OLD", for: old)
        radio.stopAdvertising(for: old)
        radio.finish(old)
        binding.emit(.added(old, .system(domain: "old", code: 1, message: "late")))
        binding.emit(.advertised(nil))
        binding.emit(.subscribed(old, peer: UUID(), maximum: 64))
        binding.emit(.unsubscribed(old, peer: peer))
        binding.emit(.write(old, request: request, peer: peer, characteristic: .clientKey, bytes: [8], offset: 0))
        try radio.send([6], for: session)
        #expect(binding.calls == [.respond(request, .notPermitted), .update(binding.handles[0], peer, [6])])
        #expect(await readEvents(radio, binding) == [])
    }

    @Test func backpressureWaitsForEachReadyCallback() async throws {
        let (radio, binding, session, peer) = await ownedRadio()
        binding.full = true
        binding.capacity = 1
        try radio.send([1], for: session)
        try radio.send([2], for: session)
        #expect(binding.updateAttempts == 1)
        binding.drain()
        #expect(binding.calls == [.update(binding.handles[0], peer, [1])])
        let attempts = binding.updateAttempts
        try radio.send([3], for: session)
        #expect(binding.updateAttempts == attempts)
        binding.capacity = 2
        binding.drain()
        #expect(binding.calls == [.update(binding.handles[0], peer, [1]), .update(binding.handles[0], peer, [2]), .update(binding.handles[0], peer, [3])])
    }

    @Test func retiringDuringServiceAdditionRemovesALateService() async {
        let (radio, binding) = makeRadio()
        let session = UUID()
        let serving = Task.immediate { await radio.serve([1], for: session) }
        radio.retire(session)
        await serving.value
        binding.emit(.added(binding.handles[0], nil))
        radio.advertise("LATE", for: session)
        #expect(binding.calls == [.add(binding.handles[0], [1]), .remove(binding.handles[0]), .remove(binding.handles[0])])
        #expect(await readEvents(radio, binding) == [])
    }

    @Test(arguments: [false, true], [false, true])
    func endedServiceReleasesItsMappingAfterTheLateAdd(finish: Bool, fails: Bool) async {
        let (radio, binding) = makeRadio()
        let session = UUID()
        let serving = Task.immediate { await radio.serve([1], for: session) }
        if finish { radio.finish(session) } else { radio.retire(session) }
        await serving.value
        #expect(binding.retainedServices == [binding.handles[0]])
        binding.calls = []
        let error = HostRadio.Failure.system(domain: "late", code: 1, message: "Add failed")
        binding.emit(.added(binding.handles[0], fails ? error : nil))
        #expect(binding.retainedServices.isEmpty)
        #expect(binding.calls == (fails ? [] : [.remove(binding.handles[0])]))
        #expect(await readEvents(radio, binding) == [])
    }

    @Test(arguments: [false, true])
    func writeBatchesAreAnsweredOnceAndAppliedTogether(valid: Bool) async {
        let (radio, binding, session) = await servedRadio()
        let first = UUID(), other = UUID(), request = UUID()
        binding.emit(.subscribed(binding.handles[0], peer: first, maximum: 64))
        binding.emit(.subscribed(binding.handles[0], peer: other, maximum: 64))
        binding.emit(.writes(request, [
            .init(service: binding.handles[0], peer: first, characteristic: .clientKey, bytes: [7], offset: 0),
            .init(service: binding.handles[0], peer: valid ? first : other, characteristic: .toHost, bytes: [8], offset: 0),
        ]))
        #expect(binding.calls == [.respond(request, valid ? .success : .notPermitted)])
        #expect(await readEvents(radio, binding) == (valid ? [
            .clientKey(session: session, peer: first, bytes: [7]), .decision(session: session, bytes: [8]),
        ] : []))
        if !valid {
            let retry = UUID()
            binding.emit(.write(binding.handles[0], request: retry, peer: other, characteristic: .clientKey, bytes: [9], offset: 0))
            #expect(await readEvents(radio, binding) == [.clientKey(session: session, peer: other, bytes: [9])])
        }
    }

    @Test(arguments: [false, true])
    func advertisingCallbacksArePairedWithRequests(fails: Bool) async {
        let (radio, binding, session) = await servedRadio()
        radio.advertise("OLD", for: session)
        radio.retire(session)
        let next = UUID()
        let serving = Task.immediate { await radio.serve([2], for: next) }
        binding.emit(.added(binding.handles[1], nil))
        await serving.value
        radio.advertise("NEXT", for: next)
        let error = HostRadio.Failure.system(domain: "late", code: 1, message: "Advertising failed")
        binding.emit(.advertised(fails ? error : nil))
        #expect(await readEvents(radio, binding) == [])
        binding.emit(.advertised(nil))
        #expect(await readEvents(radio, binding) == [.onAir(session: next)])
        binding.emit(.advertised(error))
        #expect(await readEvents(radio, binding) == [])
    }

    @Test func advertisingRestartDiscardsTheStoppedRequestsCallback() async {
        let (radio, binding, session) = await servedRadio()
        radio.advertise("FIRST", for: session)
        radio.stopAdvertising(for: session)
        radio.advertise("SECOND", for: session)
        binding.emit(.advertised(nil))
        #expect(await readEvents(radio, binding) == [])
        let error = HostRadio.Failure.system(domain: "current", code: 2, message: "Advertising failed")
        binding.emit(.advertised(error))
        #expect(await readEvents(radio, binding) == [.couldNotGoOnAir(session: session, error)])
    }

    @Test(arguments: [false, true])
    func lateServiceAddCannotCompleteTheCurrentServe(fails: Bool) async {
        let (radio, binding) = makeRadio()
        let old = UUID(), next = UUID()
        let oldServe = Task.immediate { await radio.serve([1], for: old) }
        let nextServe = Task.immediate { await radio.serve([2], for: next) }
        await oldServe.value
        let error = HostRadio.Failure.system(domain: "old", code: 3, message: "Add failed")
        binding.emit(.added(binding.handles[0], fails ? error : nil))
        radio.advertise("NEXT", for: next)
        #expect(binding.retainedServices == [binding.handles[1]])
        #expect(!binding.calls.contains(.advertise("NEXT")))
        binding.emit(.added(binding.handles[1], nil))
        await nextServe.value
        radio.advertise("NEXT", for: next)
        binding.emit(.advertised(nil))
        #expect(await readEvents(radio, binding) == [.onAir(session: next)])
        radio.retire(next)
        #expect(binding.retainedServices.isEmpty)
    }

    @Test func failedServiceAddReleasesItsMapping() async {
        let (radio, binding) = makeRadio()
        let session = UUID()
        let serving = Task.immediate { await radio.serve([1], for: session) }
        let error = HostRadio.Failure.system(domain: "add", code: 4, message: "Add failed")
        binding.emit(.added(binding.handles[0], error))
        await serving.value
        #expect(binding.retainedServices.isEmpty)
        #expect(await readEvents(radio, binding) == [.couldNotGoOnAir(session: session, error)])
    }

    enum CentralEnd: CaseIterable { case unsubscribe, retire, finish, poweredOff }

    @Test(arguments: CentralEnd.allCases, [false, true])
    func centralMappingsEndWithTheirSubscriptions(ending: CentralEnd, owns: Bool) async {
        let (radio, binding, session) = await servedRadio()
        let peer = UUID(), other = UUID()
        binding.emit(.subscribed(binding.handles[0], peer: peer, maximum: 64))
        binding.emit(.subscribed(binding.handles[0], peer: other, maximum: 64))
        if owns {
            binding.emit(.write(binding.handles[0], request: UUID(), peer: peer, characteristic: .clientKey, bytes: [7], offset: 0))
            _ = await readEvents(radio, binding)
        }
        #expect(binding.retainedCentrals == [peer, other])
        switch ending {
        case .unsubscribe:
            binding.emit(.unsubscribed(binding.handles[0], peer: peer))
            #expect(binding.retainedCentrals == [other])
            binding.emit(.unsubscribed(binding.handles[0], peer: other))
        case .retire: radio.retire(session)
        case .finish: radio.finish(session)
        case .poweredOff: binding.emit(.state(.poweredOff))
        }
        #expect(binding.retainedCentrals.isEmpty)
    }

    @Test(arguments: [PeripheralCharacteristic.clientKey, .toHost, .unsupported])
    func otherCharacteristicsCannotSubscribeAClient(characteristic: PeripheralCharacteristic) async {
        let (radio, binding, _) = await servedRadio()
        let peer = UUID(), request = UUID()
        binding.emit(.subscribed(binding.handles[0], peer: peer, maximum: 64, characteristic: characteristic))
        binding.emit(.write(binding.handles[0], request: request, peer: peer, characteristic: .clientKey, bytes: [7], offset: 0))
        #expect(binding.calls == [.respond(request, .notPermitted)])
        #expect(binding.retainedCentrals.isEmpty)
        #expect(await readEvents(radio, binding) == [])
    }

    @Test(arguments: [PeripheralCharacteristic.clientKey, .toHost, .unsupported])
    func otherCharacteristicsCannotUnsubscribeTheOwner(characteristic: PeripheralCharacteristic) async throws {
        let (radio, binding, session, peer) = await ownedRadio()
        binding.emit(.unsubscribed(binding.handles[0], peer: peer, characteristic: characteristic))
        try radio.send([5], for: session)
        #expect(binding.retainedCentrals == [peer])
        #expect(binding.calls == [.update(binding.handles[0], peer, [5])])
        #expect(await readEvents(radio, binding) == [])
    }

    @Test func staleCallbacksKeepOnlyCentralsSubscribedToTheCurrentService() async throws {
        let (radio, binding, old, peer) = await ownedRadio()
        radio.retire(old)
        let next = UUID()
        let serving = Task.immediate { await radio.serve([2], for: next) }
        binding.emit(.added(binding.handles[1], nil))
        await serving.value
        binding.emit(.subscribed(binding.handles[1], peer: peer, maximum: 64))
        binding.emit(.write(binding.handles[1], request: UUID(), peer: peer, characteristic: .clientKey, bytes: [8], offset: 0))
        _ = await readEvents(radio, binding)
        binding.calls = []
        let stranger = UUID(), request = UUID()
        binding.emit(.subscribed(binding.handles[0], peer: stranger, maximum: 64))
        binding.emit(.unsubscribed(nil, peer: peer))
        binding.emit(.unsubscribed(binding.handles[0], peer: stranger))
        binding.emit(.write(binding.handles[0], request: request, peer: stranger, characteristic: .clientKey, bytes: [9], offset: 0))
        #expect(binding.retainedCentrals == [peer])
        try radio.send([5], for: next)
        #expect(binding.calls == [.respond(request, .notPermitted), .update(binding.handles[1], peer, [5])])
        #expect(await readEvents(radio, binding) == [])
    }

    private func ownedRadio(maximum: Int = 64) async -> (HostRadio, FakePeripheral, UUID, UUID) {
        let (radio, binding, session) = await servedRadio()
        let peer = UUID()
        binding.emit(.subscribed(binding.handles[0], peer: peer, maximum: maximum))
        binding.emit(.write(binding.handles[0], request: UUID(), peer: peer, characteristic: .clientKey, bytes: [7], offset: 0))
        _ = await readEvents(radio, binding)
        binding.calls = []
        return (radio, binding, session, peer)
    }

    private func servedRadio() async -> (HostRadio, FakePeripheral, UUID) {
        let (radio, binding) = makeRadio()
        let session = UUID()
        let serving = Task.immediate { await radio.serve([1], for: session) }
        binding.emit(.added(binding.handles[0], nil))
        await serving.value
        binding.calls = []
        return (radio, binding, session)
    }

    private func makeRadio() -> (HostRadio, FakePeripheral) {
        let binding = FakePeripheral()
        return (HostRadio(binding: binding), binding)
    }

    private func readEvents(_ radio: HostRadio, _ binding: FakePeripheral) async -> [HostRadio.Event] {
        binding.emit(.state(.poweredOn))
        var events: [HostRadio.Event] = []
        for await event in radio.events {
            if event == .bluetoothState(.poweredOn) { break }
            events.append(event)
        }
        return events
    }
}

@MainActor private final class FakePeripheral: PeripheralBinding {
    enum Call: Equatable {
        case add(UUID, [UInt8]), remove(UUID), advertise(String), stop
        case update(UUID, UUID, [UInt8])
        case respond(UUID, WriteResponse)
    }
    var receive: (@MainActor (PeripheralEvent) -> Void)?
    var calls: [Call] = []
    var retainedServices: Set<UUID> = []
    var handles: [UUID] = []
    var retainedCentrals: Set<UUID> = []
    var full = false
    var capacity: Int?
    var updateAttempts = 0
    func emit(_ event: PeripheralEvent) {
        switch event {
        case .subscribed(_, let peer, _, _), .unsubscribed(_, let peer, _):
            retainedCentrals.insert(peer)
        case .writes(_, let writes):
            retainedCentrals.formUnion(writes.map(\.peer))
        default: break
        }
        receive?(event)
    }
    func addService(_ service: UUID, bytes: [UInt8]) {
        handles.append(service)
        retainedServices.insert(service)
        calls.append(.add(service, bytes))
    }
    func removeService(_ service: UUID) {
        guard retainedServices.contains(service) else { return }
        calls.append(.remove(service))
    }
    func advertise(_ name: String) { calls.append(.advertise(name)) }
    func releaseService(_ service: UUID) { retainedServices.remove(service) }
    func releaseCentral(_ peer: UUID) { retainedCentrals.remove(peer) }
    func stopAdvertising() { calls.append(.stop) }
    func update(_ bytes: [UInt8], service: UUID, peer: UUID) -> Bool {
        updateAttempts += 1
        guard !full, retainedServices.contains(service), retainedCentrals.contains(peer) else { return false }
        if let remaining = capacity {
            capacity = remaining - 1
            full = capacity == 0
        }
        calls.append(.update(service, peer, bytes))
        return true
    }
    func respond(_ request: UUID, with response: WriteResponse) { calls.append(.respond(request, response)) }
    func drain() { full = false; emit(.ready) }
}
