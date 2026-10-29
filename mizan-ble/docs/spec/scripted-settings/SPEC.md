# Scripted settings

Observer: the scripted radio, which asks for the settings at each
transaction's start. Scripted settings read the rehearsal app's settings
file and say what the other side will do, or that there is nothing valid
to play.

## Decided

- **The file is JSON,** its path given at launch (`-scriptedRadio
  <path>`). It is read at launch and again on each change on disk; each
  read tells Bluetooth's state, as the file gives it or unavailable.
- **A transaction keeps what it started with:** the radio takes the
  settings once per serve or scan; a later change reaches the next one.
- **Missing or invalid reads as unavailable,** with its kind (missing,
  invalid) and never the file's contents; a valid file read later
  restores what it says. How a kind is logged is the app spec's.
- **The file holds every secret the scripted side uses** (amounts, its
  key), so a lane can search the app's log for them.

```gherkin
Feature: Reading the rehearsal's settings

  Scenario: S-1 A valid file
    Given a valid file at the launch path
    When the radio asks for the settings
    Then it can read what the other side will do and Bluetooth's state

  Scenario Outline: S-2 No valid file
    Given <file> at the launch path
    When the radio asks for the settings
    Then it can read that Bluetooth is unavailable, and that the file is <kind>, without its contents
    Examples:
      | file           | kind    |
      | no file        | missing |
      | a file not JSON | invalid |

  Scenario: S-3 A file changed
    Given a valid file was read
    When the file changes on disk
    Then the radio can read the changed settings and their Bluetooth state, with no relaunch

  Scenario: S-4 A broken file mended
    Given no valid file was read
    When a valid file is written to the path
    Then the radio can read its settings and its Bluetooth state
