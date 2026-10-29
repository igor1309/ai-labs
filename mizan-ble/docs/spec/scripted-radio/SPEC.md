# Scripted radio

Observer: the rehearsal app's root, through the real radios' interfaces.
## Decided

- **`ScriptedRadio` is a library in the root package,** since the side it
  plays seals and opens real messages with session crypto and the codec.
  Only the rehearsal app target links it.
- **It plays from scripted settings,** taken once per serve or scan, and
  tells Bluetooth's state from each read of them; scripted settings own
  the file.
- **Steps use an injected clock.** Retire and drop cancel pending transaction
  steps; stop-scan cancels only readings.
- **The settings set** the scripted client's coming, decision and drop
  point; each scripted host's name, timed readings, amount, cancel,
  outcome and drop point. A host on air is heard again at its last
  strength every 0.2 s until stop-scan unless quiet. Both decisions are
  acknowledged; decline has no outcome. Keys are fresh per session.
- **The scripted side opens what it gets;** a message it cannot open drops
  the link at once, so a link that holds means it opened.
- **A client leaving before its key is unseen,** as on air.
- **Air capture is opt-in per transaction.** Append session reads, key writes
  and sealed frames in both directions as direction and hex JSON lines in
  Documents/air-recording.jsonl, never in the diagnostic log.
```gherkin
Feature: Playing the other side from settings

  Scenario Outline: S-1 A scripted client decides
    Given settings with a client that comes and <decides>
    When I serve, advertise, send the sealed amount, my acknowledgement and any outcome, then finish
    Then I can read its key and open its <decision>, and its link holds until I finish
    Examples:
      | decides  | decision |
      | confirms | confirm  |
      | declines | decline  |

  Scenario Outline: S-2 A scripted host's outcome
    Given settings with one host, its amount and a <outcome> outcome
    When I scan, connect, write my key, open the amount and write a sealed confirm
    Then I can open the acknowledgement, then the <outcome>
    Examples:
      | outcome |
      | success |
      | failure |

  Scenario: S-3 A scripted host takes a decline
    Given settings with one host
    When I decline
    Then I can open the acknowledgement, and no outcome follows

  Scenario: S-4 A scripted host cancels
    Given settings with a host that cancels after the amount
    When I have opened the amount
    Then I can open the host's end

  Scenario: S-5 Readings as the settings give them
    Given settings with two hosts and their timed readings
    When I scan
    Then I can read each host's signal at the settings' times, then the last again every 0.2 s unless it goes quiet

  Scenario Outline: S-6 A drop at a named point
    Given settings that drop the <side> link <point>
    When the transaction reaches it
    Then I can read <what>, and nothing of that transaction after it
    Examples:
      | side   | point                                        | what                        |
      | host   | before the key                               | no key and no lost client   |
      | host   | after the key, before the amount             | the client lost             |
      | host   | after the amount                             | the client lost             |
      | host   | after the decision                           | the client lost             |
      | client | before the key                               | the link lost               |
      | client | after sending the amount, before it arrives  | the link lost and no amount |
      | client | after the amount                             | the link lost               |
      | client | after the acknowledgement, before the outcome | the link lost               |

  Scenario Outline: S-7 Bluetooth's state from the settings
    Given settings that say Bluetooth is <state>
    When the <side> radio reads them
    Then I can read that Bluetooth is <state>
    Examples:
      | side   | state       |
      | host   | off         |
      | client | off         |
      | host   | not allowed |
      | client | not allowed |

  Scenario Outline: S-8 A message the scripted side cannot open
    Given a <side> transaction under way
    When I send a message sealed with the wrong key
    Then I can read <what> at once
    Examples:
      | side   | what            |
      | host   | the client lost |
      | client | the link lost   |
  Scenario: S-9 Reading the scripted air
    Given settings requesting an air recording
    When I complete a payment
    Then I can read every carried frame in order with its direction, also after a relaunch
```
