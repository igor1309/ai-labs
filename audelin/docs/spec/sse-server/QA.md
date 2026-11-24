# SSE server QA

Driven for real on a loopback port, with a fake event source behind it.

## S-1 Each event is sent as it comes
Drive: the fake gives one event and holds the next; the client reads the first while the stream is open; then the fake gives the second. Evidence: `TestS1_EachEventIsSentAsItComes` in `audelin/feed/sseserver`, run by `audelin-feed-core`.

## S-2 A request that cannot be served is refused
Drive: requests with no size, no overlap, size zero, a negative overlap, a fractional size, an overlap equal to the size and a word for size; read each refusal's reason. Evidence: `TestS2_ARequestThatCannotBeServedIsRefused` in `audelin/feed/sseserver`, run by `audelin-feed-core`.

## S-3 Two clients get their own windows
Drive: connect with size 3 and size 5; each fake source gives windows tagged with its size; while both are open, each client reads only its own tag. Evidence: `TestS3_TwoClientsGetTheirOwnWindows` in `audelin/feed/sseserver`, run by `audelin-feed-core`.

## S-4 The stream ends after the call's end
Drive: the fake gives the end; read it and see the connection close. Evidence: `TestS4_TheStreamEndsAfterTheCallsEnd` in `audelin/feed/sseserver`, run by `audelin-feed-core`.

## S-5 A client leaving lets its source go
Drive: with a second client connected, disconnect the first while its fake holds a pending read; the read is released; a new client is served. Evidence: `TestS5_AClientLeavingLetsItsSourceGo` in `audelin/feed/sseserver`, run by `audelin-feed-core`.

## S-6 Only this Mac can connect
Drive: connect to loopback first as a control (served), then to the Mac's network address (refused). Evidence: `TestS6_OnlyThisMacCanConnect` in `audelin/feed/sseserver`, run by `audelin-feed-core`.

## S-7 The last client leaving ends the program
Drive: two clients; the first disconnects, the second reads its next window; the second disconnects; the program exits. Evidence: `TestS7_TheLastClientLeavingEndsTheProgram` in `audelin/feed/sseserver`, run by `audelin-feed-core`.

## S-8 A web page cannot read the stream
Drive: request on loopback with a Host of example.com, and with an Origin header from a page; both are refused, no event read. Evidence: `TestS8_AWebPageCannotReadTheStream` in `audelin/feed/sseserver`, run by `audelin-feed-core`.
