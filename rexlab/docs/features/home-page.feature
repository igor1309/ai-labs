Feature: Home page: one page from the sky down
  The home page is one page that scrolls up and down: the header and
  today's game in the sky, then the rows of tiles in deeper and deeper
  earth, then the parents' note and the version on the bedrock. It
  never swipes sideways, pages or snaps, and nothing on it sticks. The
  dig-site design draws it for each window shape; this feature says
  what holds in all of them.

  Scenario Outline: Every game can be reached in every window
    Given a window of <width> by <height> CSS pixels, with its safe areas
    And the app is in English or Russian
    When I open the home page
    Then I see no picture asking to turn the device or to widen the window
    And scrolling down reaches every tile, SOON, the parents' note and the version
    And every word in the header, the sky and the tiles shows whole, on one line where it is a name
    And nothing a child taps sits under a notch, a rounded corner or the home indicator

    Examples:
      | width | height |
      | 1180  | 820    |
      | 1133  | 744    |
      | 744   | 1133   |
      | 820   | 1180   |
      | 393   | 852    |
      | 375   | 667    |
      | 320   | 568    |
      | 852   | 393    |
      | 667   | 375    |
      | 1440  | 900    |

  Scenario: On an iPad every game is on the first screen
    Given an iPad 11 or an iPad mini in landscape
    When I open the home page
    Then every tile and SOON are in view before I scroll
    And scrolling only uncovers the bedrock with the parents' note

  Scenario: On a phone the next row shows there is more
    Given an iPhone upright
    When I open the home page
    Then the first screen shows today's game and the first row of tiles
    And part of the next row shows above the home indicator

  Scenario: The header scrolls away with the sky
    Given I am on the home page
    When I scroll down
    Then RexLab, MUSEUM and the parents' menus scroll away with the sky
    And when I scroll back up they are where they were

  Scenario: The edges show more of the dig site
    When I pull the page past its top or past its bottom
    Then more sky or more bedrock shows, never a blank edge

  Scenario: The sky moves slower than the ground
    Given the device does not ask for reduced motion
    When I scroll the home page
    Then the sun or moon and today's dinosaurs move at half the speed of the page

  Scenario: Reduced motion keeps the sky still
    Given the device asks for reduced motion
    When I scroll the home page
    Then the sky moves with the page, at its speed

  Scenario: Returning home starts at the top
    Given I scrolled down the home page
    When I open a game and come back home
    Then the page is at the top

  Scenario: Turning or resizing keeps the page
    Given I am on the home page with a parents' menu open
    When the window turns or changes size
    Then today's game and the open menu stay as they were
    And today's game does not rise in again

  Scenario Outline: Words read in either theme
    Given the app uses the <theme> theme
    When I open the home page
    Then every word in the header, the sky and the tiles keeps at least 4.5:1 contrast with what is behind it
    And SOON, the parents' note and the version keep at least 4.5:1 too
    And each button and tile keeps at least 3:1 contrast with the ground around it

    Examples:
      | theme |
      | light |
      | dark  |
