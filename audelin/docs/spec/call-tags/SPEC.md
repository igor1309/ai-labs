# Call tags — sorting calls by hand

Observer: the user, telling calls apart and finding them by tags they
give. What the list shows is `../calls-list/SPEC.md`; search is the
design brief's Search. Oracle: the design brief `../../design/call-tags.md`.

## Decided

- **Tags live in the call's folder, as plain text,** so they move and
  survive renames with the call and can be edited outside the app. No
  parser is added for a list of words.
- **Only the user tags a call.** Suggesting tags from the notes is left
  for later (owner, 2026-11-15).
- **Filtering is the search field's and one chip strip's, not a new
  window,** keeping one field and no scope switch.

```gherkin
Feature: Sorting calls by hand with tags

  Scenario: S-1 Tagging a call
    Given a call is selected
    When I give it a tag
    Then I can see that tag on the call

  Scenario: S-2 Removing a tag
    Given a call has a tag
    When I remove it
    Then I can no longer see that tag on the call

  Scenario: S-3 Tags kept across restarts
    Given a call has a tag
    When I open the app again
    Then I can still see that tag on the call

  Scenario: S-4 Filtering by a tag
    Given some calls have a tag
    When I choose that tag in the filter
    Then I can see only the calls with that tag

  Scenario: S-5 Filtering by two tags
    Given I chose one tag in the filter
    When I choose a second
    Then I can see only the calls with both tags

  Scenario: S-6 A tag typed in the search
    Given some calls have a tag
    When I type that tag after # in the search
    Then I can see only the calls with that tag

  Scenario: S-7 Searching finds a tag
    Given a call has a tag
    When I search for that tag's word
    Then I can find that call

  Scenario: S-8 Tags differing in case are one
    Given a call has a tag
    When I tag another call with it in other case
    Then I can choose one tag to see both calls

  Scenario: S-9 A merged call keeps its parts' tags
    Given two calls have different tags
    When I merge them
    Then I can see both tags on the merged call

  Scenario: S-10 No filter without tags
    Given no call has a tag
    When I look at the calls list
    Then I cannot see a tag filter
```
