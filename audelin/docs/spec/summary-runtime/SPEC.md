# Run a bounded generation request

Observer: the caller asking for one generation attempt.

## Decided

- Process/HTTP adapters own their formats, injected system bindings, timers and credential lookup; retries/logging are root decorators (architecture rules 1, 2 and 5).
- Claude 2.1.319 help and official CLI reference support -p --safe-mode --restricted --tools "" --strict-mcp-config --mcp-config {"mcpServers":{}} --no-session-persistence --output-format json; probe supported controls without transcript first, then use argv and stdin in an isolated temporary directory. No shell or user customizations/tools; safe-mode retains subscription OAuth, unlike --bare. Managed organization policies still apply.
- Structured CLI envelopes must show success and nonempty complete result; error/is_error/refusal and exit-zero quota text fail. Authentication inherits without reading or printing tokens.
- Chosen ceilings: 120 seconds end-to-end per attempt, 4 MiB stdout/HTTP response and 64 KiB retained stderr bound hung services and untrusted hosts. Choose output token cap 4096 for concise notes; reject truncation rather than silently saving it.
- Blocking launch/pipe/cleanup work uses dedicated executors, concurrent draining and asynchronous cancellation; terminate owned group, allow one second grace, then kill/reap. A deadline includes blocked stdin and cleanup.
- API uses nonstreaming compatible chat completions with explicit output cap and bounded streamed response collection, no automatic client retry, and rejects every redirect. Loopback transport bypasses remote proxies; remote HTTP is rejected.
- Endpoint and optional credential variable reference are editable, values are resolved at request time. Both configured slots are disclosed; loopback only establishes destination, not downstream server behavior.

```gherkin
Feature: Run a bounded generation request

  Scenario: S-1 Use CLI input safely
    Given a transcript contains shell syntax and exceeds argument limits
    When I request CLI generation
    Then I receive output from literal stdin without executing transcript content

  Scenario: S-2 Use API output
    Given a valid hosted response is available
    When I request generation
    Then I receive its complete text

  Scenario: S-3 Use local output
    Given a loopback compatible endpoint is configured
    When I request generation
    Then my request goes directly to the configured local destination

  Scenario: S-4 Missing executable
    Given the executable does not exist
    When I request generation
    Then I receive an unavailable failure

  Scenario: S-5 Quota or session failure
    Given the CLI reports a limit failure
    When I request generation
    Then I receive a sanitized quota failure even when its process exits successfully

  Scenario: S-6 Nonzero exit
    Given the CLI exits unsuccessfully
    When I request generation
    Then I receive a runtime failure without its secret-bearing diagnostics

  Scenario: S-7 HTTP rejection
    Given the endpoint rejects the request
    When I request generation
    Then I receive its classified failure without credentials

  Scenario: S-8 Malformed response
    Given the endpoint returns no content
    When I request generation
    Then I receive an invalid-response failure

  Scenario: S-9 Bound duration
    Given a request never completes
    When the injected deadline fires
    Then I receive timeout after its resources are cleaned up

  Scenario: S-10 Bound output
    Given a process exceeds an output ceiling
    When I await its result
    Then I receive an output-limit failure after the process is reaped

  Scenario: S-11 Cancel request
    Given a request is active
    When I cancel and await it
    Then I can observe released process or network resources

  Scenario: S-12 Reject redirect
    Given the endpoint redirects generation
    When I await output
    Then I receive failure without resending transcript or credentials

  Scenario: S-13 Reject oversized HTTP output
    Given an endpoint sends excessive response bytes
    When I await output
    Then I receive a bounded-output failure with the request closed

  Scenario: S-14 Require isolation controls
    Given the installed CLI lacks required isolation controls
    When I request generation
    Then I receive an unavailable failure before any transcript input

  Scenario: S-15 Authentication failure
    Given the runtime is not authenticated
    When I request generation
    Then I receive an authentication failure without exposed credentials

  Scenario: S-16 Reject truncated response
    Given a well-formed response was terminated for length
    When I await its result
    Then I receive an invalid-response failure without partial notes
```
