# Run a bounded generation request — QA

Planned tests; evidence is Missing until execution. Ordering uses handshakes, never sleeps.

## S-1 Use CLI input safely

Missing — planned `cd audelin/macos && swift test --filter SummaryRuntimeTests/useCLIinputsafely`. Setup fixture: a transcript contains shell syntax and exceeds argument limits; drive: I request CLI generation; read-back oracle: I receive output from literal stdin without executing transcript content. Use a temporary real CLI fixture or local HTTP binding serving that exact envelope; injected deadline/byte-limit gates prove cleanup without sleeps.

## S-2 Use API output

Missing — planned `cd audelin/macos && swift test --filter SummaryRuntimeTests/useAPIoutput`. Setup fixture: a valid hosted response is available; drive: I request generation; read-back oracle: I receive its complete text. Use a temporary real CLI fixture or local HTTP binding serving that exact envelope; injected deadline/byte-limit gates prove cleanup without sleeps.

## S-3 Use local output

Missing — planned `cd audelin/macos && swift test --filter SummaryRuntimeTests/uselocaloutput`. Setup fixture: a loopback compatible endpoint is configured; drive: I request generation; read-back oracle: my request goes directly to the configured local destination. Use a temporary real CLI fixture or local HTTP binding serving that exact envelope; injected deadline/byte-limit gates prove cleanup without sleeps.

## S-4 Missing executable

Missing — planned `cd audelin/macos && swift test --filter SummaryRuntimeTests/missingexecutable`. Setup fixture: the executable does not exist; drive: I request generation; read-back oracle: I receive an unavailable failure. Use a temporary real CLI fixture or local HTTP binding serving that exact envelope; injected deadline/byte-limit gates prove cleanup without sleeps.

## S-5 Quota or session failure

Missing — planned `cd audelin/macos && swift test --filter SummaryRuntimeTests/quotaorsessionfailure`. Setup fixture: the CLI reports a limit failure; drive: I request generation; read-back oracle: I receive a sanitized quota failure even when its process exits successfully. Use a temporary real CLI fixture or local HTTP binding serving that exact envelope; injected deadline/byte-limit gates prove cleanup without sleeps.

## S-6 Nonzero exit

Missing — planned `cd audelin/macos && swift test --filter SummaryRuntimeTests/nonzeroexit`. Setup fixture: the CLI exits unsuccessfully; drive: I request generation; read-back oracle: I receive a runtime failure without its secret-bearing diagnostics. Use a temporary real CLI fixture or local HTTP binding serving that exact envelope; injected deadline/byte-limit gates prove cleanup without sleeps.

## S-7 HTTP rejection

Missing — planned `cd audelin/macos && swift test --filter SummaryRuntimeTests/hTTPrejection`. Setup fixture: the endpoint rejects the request; drive: I request generation; read-back oracle: I receive its classified failure without credentials. Use a temporary real CLI fixture or local HTTP binding serving that exact envelope; injected deadline/byte-limit gates prove cleanup without sleeps.

## S-8 Malformed response

Missing — planned `cd audelin/macos && swift test --filter SummaryRuntimeTests/malformedresponse`. Setup fixture: the endpoint returns no content; drive: I request generation; read-back oracle: I receive an invalid-response failure. Use a temporary real CLI fixture or local HTTP binding serving that exact envelope; injected deadline/byte-limit gates prove cleanup without sleeps.

## S-9 Bound duration

Missing — planned `cd audelin/macos && swift test --filter SummaryRuntimeTests/boundduration`. Setup fixture: a request never completes; drive: the injected deadline fires; read-back oracle: I receive timeout after its resources are cleaned up. Use a temporary real CLI fixture or local HTTP binding serving that exact envelope; injected deadline/byte-limit gates prove cleanup without sleeps.

## S-10 Bound output

Missing — planned `cd audelin/macos && swift test --filter SummaryRuntimeTests/boundoutput`. Setup fixture: a process exceeds an output ceiling; drive: I await its result; read-back oracle: I receive an output-limit failure after the process is reaped. Use a temporary real CLI fixture or local HTTP binding serving that exact envelope; injected deadline/byte-limit gates prove cleanup without sleeps.

## S-11 Cancel request

Missing — planned `cd audelin/macos && swift test --filter SummaryRuntimeTests/cancelrequest`. Setup fixture: a request is active; drive: I cancel and await it; read-back oracle: I can observe released process or network resources. Use a temporary real CLI fixture or local HTTP binding serving that exact envelope; injected deadline/byte-limit gates prove cleanup without sleeps.

## S-12 Reject redirect

Missing — planned `cd audelin/macos && swift test --filter SummaryRuntimeTests/rejectredirect`. Setup fixture: the endpoint redirects generation; drive: I await output; read-back oracle: I receive failure without resending transcript or credentials. Use a temporary real CLI fixture or local HTTP binding serving that exact envelope; injected deadline/byte-limit gates prove cleanup without sleeps.

## S-13 Reject oversized HTTP output

Missing — planned `cd audelin/macos && swift test --filter SummaryRuntimeTests/rejectoversizedHTTPoutput`. Setup fixture: an endpoint sends excessive response bytes; drive: I await output; read-back oracle: I receive a bounded-output failure with the request closed. Use a temporary real CLI fixture or local HTTP binding serving that exact envelope; injected deadline/byte-limit gates prove cleanup without sleeps.

## S-14 Require isolation controls

Missing — planned `cd audelin/macos && swift test --filter SummaryRuntimeTests/requireisolationcontrols`. Setup fixture: the installed CLI lacks required isolation controls; drive: I request generation; read-back oracle: I receive an unavailable failure before any transcript input. Use a temporary real CLI fixture or local HTTP binding serving that exact envelope; injected deadline/byte-limit gates prove cleanup without sleeps.

## S-15 Authentication failure

Missing — planned `cd audelin/macos && swift test --filter SummaryRuntimeTests/authenticationfailure`. Setup fixture: the runtime is not authenticated; drive: I request generation; read-back oracle: I receive an authentication failure without exposed credentials. Use a temporary real CLI fixture or local HTTP binding serving that exact envelope; injected deadline/byte-limit gates prove cleanup without sleeps.

## S-16 Reject truncated response

Missing — planned `cd audelin/macos && swift test --filter SummaryRuntimeTests/rejecttruncatedresponse`. Setup fixture: a well-formed response was terminated for length; drive: I await its result; read-back oracle: I receive an invalid-response failure without partial notes. Use a temporary real CLI fixture or local HTTP binding serving that exact envelope; injected deadline/byte-limit gates prove cleanup without sleeps.
