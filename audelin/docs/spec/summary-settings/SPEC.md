# Configure optional summaries

Observer: the person editing Settings.

## Decided

- The Settings machine owns edits, rendered values, validation/save/load progress and outcomes through its own ports; views only render state and send events (root state-machine policy).
- Fallback is optional and defaults to absent; it can be cleared without changing the primary. Settings explicitly shows configured or unconfigured status. An absent fallback needs no credentials or validation and receives no transcript.
- Configured slots expose kind/model plus executable or API URL and optional credential environment-variable name. No credential value is displayed or persisted; users can use an unauthenticated loopback endpoint.
- Editable sonnet and gpt-4.1-mini defaults are documented aliases/models, not promised availability or fixed pricing. Each slot discloses subscription quota, hosted token billing or local compute.
- HTTPS is required remotely; HTTP only for loopback. Reject URL userinfo, query and fragment. Only when both slots are loopback is the configured plan local; a user-managed server may forward data.
- Injected validation is associated with an edit revision; stale results cannot approve changed input. Availability checks use no paid prompts and cannot guarantee quota.
- Saves preserve edits on failure, prevent duplicate submission and merge only summary fields into current preferences on a dedicated executor, retaining concurrent recording changes. Load failure never silently replaces stored settings.

```gherkin
Feature: Configure optional summaries

  Scenario: S-1 Disabled by default
    Given I open existing preferences without summary options
    When I look at Settings
    Then I see summaries unchecked and recording settings preserved

  Scenario: S-2 Edit both runtimes
    Given I enable summaries
    When I edit either runtime slot and its model
    Then I can save those exact choices for upcoming jobs

  Scenario: S-3 Configure local execution
    Given I choose a local API endpoint
    When I enter its model without a credential reference
    Then I can save that slot and see whether fallback may send the transcript remotely

  Scenario: S-4 Choose speaker identification
    Given summaries are enabled
    When I change the speakers checkbox
    Then I can save whether notes try to identify speakers

  Scenario: S-5 Understand data and cost
    Given I choose primary and fallback runtimes
    When I read their disclosures
    Then I can see who receives the transcript and how each service charges or limits use

  Scenario: S-6 See invalid input
    Given a required configuration value is invalid
    When I try to save
    Then I can see the field to correct and cannot replace the last saved settings

  Scenario: S-7 See unavailable runtime
    Given the selected executable is missing
    When I validate settings
    Then I can read which runtime is unavailable

  Scenario: S-8 See validation wait
    Given runtime validation is unfinished
    When I look at Settings
    Then I can see validation is running without mistaking it for readiness

  Scenario: S-9 See saving wait
    Given saving has begun
    When I look at Settings
    Then I can see saving is unfinished and cannot submit a duplicate save

  Scenario: S-10 Recover from saving failure
    Given writing preferences fails
    When I look at Settings
    Then I can see the failure and retry with my edits intact

  Scenario: S-11 Confirm saving
    Given my edits are valid
    When saving completes
    Then I can see the saved choices that upcoming jobs will use

  Scenario: S-12 Load settings
    Given saved settings are being read
    When I open Settings
    Then I can see loading instead of editable placeholder values

  Scenario: S-13 Recover from loading failure
    Given saved settings cannot be read
    When I open Settings
    Then I can read the error and retry without replacing stored settings

  Scenario: S-14 Reject stale validation
    Given I change edits while validation runs
    When the older result arrives
    Then I cannot save new edits on the basis of the older result
```
