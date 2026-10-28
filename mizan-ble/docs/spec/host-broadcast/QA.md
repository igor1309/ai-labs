# Host broadcast — QA

Driven through its reducer as tables of event in, state and effect out,
and its effect handler with fakes of the session, advertiser, sender,
countdown and setting. The fakes record what was served, advertised, sent,
retired and closed; rows read that record and the state.

## S-1 Locking starts the broadcast

124.50 locked with the setting at 30: the advertiser fake serves a session and advertises; the state reads going on the air, no countdown started, cancel offered. Evidence: HostBroadcastTests.lockingStartsBroadcastWithoutCountdown.

## S-2 The host cannot go on air

Locked, serving or advertising fails: the state reads the error and 124.50 not locked; the session fake closed. Evidence: HostBroadcastTests.cannotGoOnAirUnlocksAmountAndClosesSession.

## S-3 The countdown ends with no secure link

Advertised, a countdown event reaches zero: advertising stopped, the service retired, the session closed; the state reads timed out with an empty amount. Evidence: HostBroadcastTests.countdownExpiryClearsAmountAndRetiresSession. The same deadline applies throughout the handshake. Evidence: HostBroadcastTests.countdownRemainsHandshakeDeadline. Through a real machine, expiry before a queued seal result prevents a send; a seal result first sends before expiry, whose timed-out state survives the late send result. Evidence: HostBroadcastTests.queuedSendAfterExpiryDoesNotReachClient.

## S-4 Cancel while advertising

Advertised, cancel: advertising stopped, the service retired; the state reads 124.50 not locked. Evidence: HostBroadcastTests.cancelUnlocksAmountAndIgnoresLateOnAir.

## S-5 A client starts the handshake

Advertised, a client key event with 22 s left: advertising stopped, the service kept; the state reads handshake with 22 left. Evidence: HostBroadcastTests.firstClientKeyKeepsServiceAndRemainingSeconds. No handshake step offers or accepts operator actions. Evidence: HostBroadcastTests.handshakeDoesNotOfferCancelOrAnotherAttempt.

## S-6 The link is secure

A key, the session fake derives and protects the amount, the sender fake records only the protected message: the state reads handed over, the countdown fake stopped. Evidence: HostBroadcastTests.keyDerivationQueuesFirstSeal; HostBroadcastTests.amountSentHandsOverSecureLinkAndStopsCountdown. Queued seal results cannot repeat a handover or target an old attempt while its replacement is sending. Evidence: HostBroadcastTests.queuedSealResultAfterHandoverOrReplacementIsRejected.

## S-7 The client's key does not agree

A key the session fake refuses: the state reads failed with both choices; the session closed, the service retired. Evidence: HostBroadcastTests.invalidClientKeyOffersRetryAndNewAmount.

## S-8 The link drops during the handshake

A key, then link lost at each handshake step: the state reads failed with both choices; the session closed. Evidence: HostBroadcastTests.lostLinkDuringHandshakeOffersBothChoices. Losing another link leaves the selected handshake and resources intact. Evidence: HostBroadcastTests.unrelatedLinkLossLeavesHandshakeIntact. Bluetooth loss has the same failure path. Evidence: HostBroadcastTests.bluetoothLossDuringHandshakeFails.

## S-9 The amount cannot be protected or sent

A key, derived, the sender fake fails: the state reads failed with both choices; the session closed. Evidence: HostBroadcastTests.amountSendFailureOffersRetryAndNewAmount.

Derived, the session fake cannot protect the amount: the state reads failed with both choices, the sender receives nothing, and the session and service are retired. Evidence: HostBroadcastTests.amountSealFailureOffersRetryAndNewAmount.

## S-10 Broadcast again

Failed, broadcast again: a second, different session served and advertised with 124.50 and the full countdown read from the current setting. Evidence: HostBroadcastTests.retryUsesFreshSessionSameAmountAndCurrentFullCountdown.

## S-11 A new amount after a failed handshake

Failed, new amount: the state reads an empty amount. Evidence: HostBroadcastTests.newAmountAfterFailureClearsAmountAndReason.

## S-12 Back after a payment

Handed over, other events leave the handover intact; that transaction's payment ends and the state reads an empty amount. Evidence: HostBroadcastTests.handedOverWaitsForItsTransactionEndThenAcceptsNewAmount.

## S-13 Bluetooth is lost while on air

Advertised, a Bluetooth unavailable event reports its reason: the state reads the reason and 124.50 not locked; the session closed. Evidence: HostBroadcastTests.bluetoothLossOnAirUnlocksAmountWithReason.

## S-14 On the air

Going on the air, an advertising started event arrives: the countdown fake starts at the configured duration; the state reads advertised with the full countdown. Evidence: HostBroadcastTests.onAirStartsFullCountdown.

## S-15 Cancel while going on the air

Locked, cancel before on air, then advertising started arrives: the fake retired that session; the state reads 124.50 not locked and stays so. Evidence: HostBroadcastTests.cancelUnlocksAmountAndIgnoresLateOnAir. Late session creation and countdown startup release their own resources. Evidence: HostBroadcastTests.sessionOpenedAfterCancelIsClosedWithoutTouchingNewAttempt; HostBroadcastTests.lateCountdownStartIsStoppedAfterCancelOrHandover. An old startup failure cannot end a new attempt. Evidence: HostBroadcastTests.staleStartupFailureCannotEndAnotherAttempt. Every accepting phase rejects old-attempt events, releasing only late old acquisitions. Evidence: HostBroadcastTests.staleEventsCannotChangeReplacementAttempt; HostBroadcastTests.lateAcquisitionsReleaseOnlyOldResources.
