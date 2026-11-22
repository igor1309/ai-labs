@next
Feature: Coloring workshop T-Rex, Mosasaurus and Brachiosaurus scenes
  Free creativity with Stegosaurus, Triceratops, Ankylosaurus, T-Rex, Mosasaurus, Brachiosaurus, Pteranodon, Parasaurolophus and Spinosaurus artwork. There is no model to
  copy, time limit, coverage target or judgement of artistic quality.
  An action means one accepted brush contact from press to release, or
  one fill. A work is nonempty when its current editable paint differs
  visibly from the initial unpainted dinosaur; tool choices are not paint. Paint matching the initial base color
  alone is empty; a contact that changes no visible paint adds no undo entry.

  Scenario: Rich T-Rex prehistoric scene
    Given I start a new T-Rex work at Explorer or Paleontologist
    Then the workshop renders the original trex-explorer-1 vector scene
    And the same recognizable creature appears in a richer prehistoric landscape
    And its belly and broad body markings add independent coloring regions beyond the Hatchling version
    And prehistoric plants, rocks, clouds and distant hills offer additional broad independent coloring regions
    And small facial details, fingers, toes and plant veins remain protected rather than tiny fill targets
    And the entire scene fits supported iPad landscape viewports without clipping

  Scenario Outline: Independent T-Rex fills preserve the drawing
    Given I open a T-Rex work using <artwork>
    When I fill any enclosed animal or scenery region
    Then only that visible region changes, including when it lies inside a larger region
    And its outline, eye highlights and decorative ink remain visible above fills and brush paint
    And every coloring region has a broad visible interior rather than a hidden or hair-thin target
    And the shared palette, brush, base color and undo remain available

    Examples:
      | artwork          |
      | trex-hatchling-1 |
      | trex-explorer-1  |

  Scenario: Simple Mosasaurus for Hatchling
    Given I start a new Mosasaurus work at Hatchling
    Then the workshop renders the original mosasaurus-hatchling-1 vector scene
    And a friendly Mosasaurus swims with long jaws, four paddles and a crescent tail fin
    And the head, body, tail, tail fin and paddles offer broad independent coloring regions
    And its eye, smile, teeth and paddle bones remain protected decorative details
    And a simple sandy sea floor with seaweed leaves the reptile clear and prominent
    And the entire scene fits supported iPad and iPhone viewports without clipping
    And the canvas has the localized uppercase accessible name MOSASAURUS or МОЗАЗАВР

  Scenario: Rich Mosasaurus sea scene
    Given I start a new Mosasaurus work at Explorer or Paleontologist
    Then the workshop renders the original mosasaurus-explorer-1 vector scene
    And the same recognizable reptile swims in a richer prehistoric sea
    And its belly, back, head and tail markings add independent coloring regions beyond the Hatchling version
    And water, sky, two fish, an ammonite, a rock and seaweed offer additional broad independent coloring regions
    And bubbles, fish eyes and fins, the ammonite spiral, teeth and paddle bones remain protected rather than tiny fill targets
    And the entire scene fits supported iPad and iPhone viewports without clipping

  Scenario Outline: Independent Mosasaurus fills preserve the drawing
    Given I open a Mosasaurus work using <artwork>
    When I fill any enclosed animal or sea region
    Then only that visible region changes, including when it lies inside a larger region
    And its outline, eye highlights and decorative ink remain visible above fills and brush paint
    And every coloring region has a broad visible interior rather than a hidden or hair-thin target

    Examples:
      | artwork                |
      | mosasaurus-hatchling-1 |
      | mosasaurus-explorer-1  |

  Scenario: Simple Brachiosaurus for Hatchling
    Given I start a new Brachiosaurus work at Hatchling
    Then the workshop renders the original brachiosaurus-hatchling-1 vector scene
    And a friendly Brachiosaurus stands with a long neck, small head, four column legs and a long tail
    And the head, neck, body, tail and four legs offer broad independent coloring regions
    And its eye, smile, toes and knees remain protected decorative details
    And a simple ground with one fern leaves the dinosaur clear and prominent
    And the entire scene fits supported iPad and iPhone viewports without clipping
    And the canvas has the localized uppercase accessible name BRACHIOSAURUS or БРАХИОЗАВР

  Scenario: Rich Brachiosaurus forest scene
    Given I start a new Brachiosaurus work at Explorer or Paleontologist
    Then the workshop renders the original brachiosaurus-explorer-1 vector scene
    And the same recognizable dinosaur stands among two tall trees and ferns
    And its belly, back and tail markings add independent coloring regions beyond the Hatchling version
    And sun, cloud, hills, tree crowns and trunks, a rock and fern leaves offer additional broad independent coloring regions
    And skin spots, the head crest, bark, fern veins, sun rays, toes and the smile remain protected rather than tiny fill targets
    And the entire scene fits supported iPad and iPhone viewports without clipping

  Scenario Outline: Independent Brachiosaurus fills preserve the drawing
    Given I open a Brachiosaurus work using <artwork>
    When I fill any enclosed dinosaur or scenery region
    Then only that visible region changes, including when it lies inside a larger region
    And its outline, eye highlights and decorative ink remain visible above fills and brush paint
    And every coloring region has a broad visible interior rather than a hidden or hair-thin target

    Examples:
      | artwork                   |
      | brachiosaurus-hatchling-1 |
      | brachiosaurus-explorer-1  |
