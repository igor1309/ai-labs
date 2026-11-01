# Amount entry

Observer: the host UI, which sends each keypad press and draws the amount
and whether it can be locked (screen H1). The root passes the amount to
host broadcast's lock.

Amount entry is a pure reducer: a key in, the amount as typed and whether
it can be locked out. It also says when no lock is possible because
Bluetooth is not available, as the root tells it.

## Decided

- **Keypad rules:** digits and one decimal point, at most two decimals and
  six whole digits (999 999.99 fits the large amount on an iPad); a
  leading zero is replaced by the next digit.
- **Lock needs an amount above zero** and Bluetooth available.
- **Delete removes the last key;** on an empty amount it does nothing.
- **A new amount is empty:** the amount is cleared after a timeout or a
  payment (host broadcast), and kept after a cancel or a failed start.

```gherkin
Feature: Typing an amount on the keypad

  Scenario: S-1 Typing an amount
    Given an empty amount
    When the operator types 1, 2, 4, the decimal point and 5
    Then I can read 124.5, and that it can be locked

  Scenario: S-2 A third decimal
    Given an amount with two decimals
    When the operator types a digit
    Then I can read the amount as it was

  Scenario: S-3 A seventh whole digit
    Given an amount of six whole digits and no decimal point
    When the operator types a digit
    Then I can read the amount as it was

  Scenario: S-4 A second decimal point
    Given an amount with a decimal point
    When the operator types the decimal point
    Then I can read the amount as it was

  Scenario: S-5 A leading zero
    Given an amount of 0
    When the operator types 7
    Then I can read 7

  Scenario: S-6 Zero cannot be locked
    Given an amount of 0.00
    When I ask whether it can be locked
    Then I can read that it cannot

  Scenario: S-7 Delete
    Given an amount of 124.5
    When the operator deletes
    Then I can read 124.

  Scenario: S-8 Bluetooth is not available
    Given an amount of 124.5
    When the root says Bluetooth is not available, with its reason
    Then I can read that reason, and that it cannot be locked
```

Not amount entry's: the broadcast (host broadcast) and the keypad's look
(host UI, design system).
