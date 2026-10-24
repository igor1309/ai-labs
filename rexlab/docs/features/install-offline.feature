Feature: RexLab as an app on the home screen
  A parent adds RexLab to the home screen once. From then on it opens
  full screen under its own T-Rex icon and name, with no browser bars,
  and plays without Wi-Fi: each release keeps every file it is built of
  on the device.

  Scenario: RexLab is added to the home screen
    Given RexLab is open in the browser
    When it is added to the home screen
    Then the home screen shows the T-Rex icon named RexLab
    And RexLab opens from it full screen, with no browser bars

  Scenario: RexLab opens and plays with no network
    Given RexLab has been opened once online
    When it is opened with no network
    Then it opens home and plays every game as online

  Scenario: A new release shows on the next launch
    Given a new release is out
    When RexLab is opened online
    Then it shows the new release
    And opened later with no network, it shows the new release

  Scenario: A slow network does not keep the child waiting
    Given RexLab has been opened once online
    When it is opened on a network that does not answer in 3 seconds
    Then it opens from what the device has kept
