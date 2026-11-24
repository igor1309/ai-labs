# SSE client QA

Driven for real against the SSE server on loopback with a fake source.

## S-1 Each event is read as it comes
Drive: the fake gives one event and holds the next; the client reads it while the stream is open. Evidence: Missing.

## S-2 A server that is not running is said
Drive: connect to a free port; read that the source is not running. Evidence: Missing.

## S-3 A refused request is said
Drive: ask an overlap equal to the size; read the server's reason word for word. Evidence: Missing.

## S-4 A lost connection is said
Drive: read one event, then stop the server; read that the source was lost. Evidence: Missing.

## S-5 The stream closing after the end is not a loss
Drive: the fake gives the end; read that events are over, no loss. Evidence: Missing.
