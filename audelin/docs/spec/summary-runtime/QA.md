# Run a bounded generation request — QA

Executable boundary checks below use synthetic transcripts and controlled providers.
The fixture/oracle prose describes the broader scenario; a boundary pass does not
claim OCR of every production status or semantic accuracy of model output.
Ordering probes use handshakes, never sleeps. Full validation: `audelin/scripts/gate-step.sh`.

## S-1 Use CLI input safely

Automated boundary: `cd audelin/macos && swift test --filter ProcessRunnerTests/literalInputAndIsolatedDirectory`. Setup fixture: a transcript contains shell syntax and exceeds argument limits; drive: I request CLI generation; read-back oracle: I receive output from literal stdin without executing transcript content. Use a temporary real CLI fixture or local HTTP binding serving that exact envelope; injected deadline/byte-limit gates prove cleanup without sleeps.

## S-2 Use API output

Automated boundary: `cd audelin/macos && swift test --filter SummaryRuntimeTests/APIUsesExplicitCapAndOptionalLoopbackCredential`. Setup fixture: a valid hosted response is available; drive: I request generation; read-back oracle: I receive its complete text. Use a temporary real CLI fixture or local HTTP binding serving that exact envelope; injected deadline/byte-limit gates prove cleanup without sleeps.

## S-3 Use local output

Automated boundary: `cd audelin/macos && swift test --filter SummaryRuntimeTests/APIUsesExplicitCapAndOptionalLoopbackCredential`. Setup fixture: a loopback compatible endpoint is configured; drive: I request generation; read-back oracle: my request goes directly to the configured local destination. Use a temporary real CLI fixture or local HTTP binding serving that exact envelope; injected deadline/byte-limit gates prove cleanup without sleeps.

## S-4 Missing executable

Automated boundary: `cd audelin/macos && swift test --filter SummaryRuntimeTests/unsupportedControlNeverReceivesTranscript`. Setup fixture: the executable does not exist; drive: I request generation; read-back oracle: I receive an unavailable failure. Use a temporary real CLI fixture or local HTTP binding serving that exact envelope; injected deadline/byte-limit gates prove cleanup without sleeps.

## S-5 Quota or session failure

Automated boundary: `cd audelin/macos && swift test --filter SummaryRuntimeTests/CLIErrorEnvelopesNeverSucceed`. Setup fixture: the CLI reports a limit failure; drive: I request generation; read-back oracle: I receive a sanitized quota failure even when its process exits successfully. Use a temporary real CLI fixture or local HTTP binding serving that exact envelope; injected deadline/byte-limit gates prove cleanup without sleeps.

## S-6 Nonzero exit

Automated boundary: `cd audelin/macos && swift test --filter SummaryRuntimeTests/nonzeroExitNeverReturnsResult`. Setup fixture: the CLI exits unsuccessfully; drive: I request generation; read-back oracle: I receive a runtime failure without its secret-bearing diagnostics. Use a temporary real CLI fixture or local HTTP binding serving that exact envelope; injected deadline/byte-limit gates prove cleanup without sleeps.

## S-7 HTTP rejection

Automated boundary: `cd audelin/macos && swift test --filter SummaryRuntimeTests/hostedFailuresAreClassifiedWithoutDiagnostics`. Setup fixture: the endpoint rejects the request; drive: I request generation; read-back oracle: I receive its classified failure without credentials. Use a temporary real CLI fixture or local HTTP binding serving that exact envelope; injected deadline/byte-limit gates prove cleanup without sleeps.

## S-8 Malformed response

Automated boundary: `cd audelin/macos && swift test --filter SummaryRuntimeTests/malformedEmptyTruncatedAndRefusedAPIResponsesFail`. Setup fixture: the endpoint returns no content; drive: I request generation; read-back oracle: I receive an invalid-response failure. Use a temporary real CLI fixture or local HTTP binding serving that exact envelope; injected deadline/byte-limit gates prove cleanup without sleeps.

## S-9 Bound duration

Automated boundary: `cd audelin/macos && swift test --filter ProcessRunnerTests/deadlineIncludesBlockedInputAndEscalates`. Setup fixture: a request never completes; drive: the injected deadline fires; read-back oracle: I receive timeout after its resources are cleaned up. Use a temporary real CLI fixture or local HTTP binding serving that exact envelope; injected deadline/byte-limit gates prove cleanup without sleeps.

## S-10 Bound output

Automated boundary: `cd audelin/macos && swift test --filter ProcessRunnerTests/oversizedOutputKillsAndReapsProcess`. Setup fixture: a process exceeds an output ceiling; drive: I await its result; read-back oracle: I receive an output-limit failure after the process is reaped. Use a temporary real CLI fixture or local HTTP binding serving that exact envelope; injected deadline/byte-limit gates prove cleanup without sleeps.

## S-11 Cancel request

Automated boundary: `cd audelin/macos && swift test --filter ProcessRunnerTests/cancellationJoinsCleanup`. Setup fixture: a request is active; drive: I cancel and await it; read-back oracle: I can observe released process or network resources. Use a temporary real CLI fixture or local HTTP binding serving that exact envelope; injected deadline/byte-limit gates prove cleanup without sleeps.

## S-12 Reject redirect

Automated boundary: `cd audelin/macos && swift test --filter HTTPClientTests/loopbackCollectionAndRedirectPolicy`. Setup fixture: the endpoint redirects generation; drive: I await output; read-back oracle: I receive failure without resending transcript or credentials. Use a temporary real CLI fixture or local HTTP binding serving that exact envelope; injected deadline/byte-limit gates prove cleanup without sleeps.

## S-13 Reject oversized HTTP output

Automated boundary: `cd audelin/macos && swift test --filter HTTPClientTests/loopbackCollectionAndRedirectPolicy`. Setup fixture: an endpoint sends excessive response bytes; drive: I await output; read-back oracle: I receive a bounded-output failure with the request closed. Use a temporary real CLI fixture or local HTTP binding serving that exact envelope; injected deadline/byte-limit gates prove cleanup without sleeps.

## S-14 Require isolation controls

Automated boundary: `cd audelin/macos && swift test --filter SummaryRuntimeTests/unsupportedControlNeverReceivesTranscript`. Setup fixture: the installed CLI lacks required isolation controls; drive: I request generation; read-back oracle: I receive an unavailable failure before any transcript input. Use a temporary real CLI fixture or local HTTP binding serving that exact envelope; injected deadline/byte-limit gates prove cleanup without sleeps.

## S-15 Authentication failure

Automated boundary: `cd audelin/macos && swift test --filter SummaryRuntimeTests/hostedFailuresAreClassifiedWithoutDiagnostics`. Setup fixture: the runtime is not authenticated; drive: I request generation; read-back oracle: I receive an authentication failure without exposed credentials. Use a temporary real CLI fixture or local HTTP binding serving that exact envelope; injected deadline/byte-limit gates prove cleanup without sleeps.

## S-16 Reject truncated response

Automated boundary: `cd audelin/macos && swift test --filter SummaryRuntimeTests/malformedEmptyTruncatedAndRefusedAPIResponsesFail`. Setup fixture: a well-formed response was terminated for length; drive: I await its result; read-back oracle: I receive an invalid-response failure without partial notes. Use a temporary real CLI fixture or local HTTP binding serving that exact envelope; injected deadline/byte-limit gates prove cleanup without sleeps.
