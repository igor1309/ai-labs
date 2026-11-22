@next
Feature: Coloring workshop Pteranodon, Parasaurolophus and Spinosaurus scenes
  Free creativity with Stegosaurus, Triceratops, Ankylosaurus, T-Rex, Mosasaurus, Brachiosaurus, Pteranodon, Parasaurolophus and Spinosaurus artwork. There is no model to
  copy, time limit, coverage target or judgement of artistic quality.
  An action means one accepted brush contact from press to release, or
  one fill. A work is nonempty when its current editable paint differs
  visibly from the initial unpainted dinosaur; tool choices are not paint. Paint matching the initial base color
  alone is empty; a contact that changes no visible paint adds no undo entry.

  Scenario: Simple Pteranodon for Hatchling
    Given I start a new Pteranodon work at Hatchling
    Then the workshop renders the original pteranodon-hatchling-1 vector scene
    And a friendly Pteranodon soars with two wide wings, a long beak and a swept-back crest
    And the wings, body, head, beak, crest and two legs offer broad independent coloring regions
    And its eye, smile and toes remain protected decorative details
    And a simple sea with one cloud leaves the Pteranodon clear and prominent
    And the entire scene fits supported iPad and iPhone viewports without clipping
    And the canvas has the localized uppercase accessible name PTERANODON or ПТЕРАНОДОН

  Scenario: Rich Pteranodon sea cliff scene
    Given I start a new Pteranodon work at Explorer or Paleontologist
    Then the workshop renders the original pteranodon-explorer-1 vector scene
    And the same recognizable Pteranodon soars through a sky with a sun and two clouds above the sea between two cliffs
    And its wing arms, belly, crest tip and lower jaw add independent coloring regions beyond the Hatchling drawing
    And wing fingers, skin spots, waves, rock cracks, sun rays and a far-off flier remain protected linework
    And the entire scene fits supported iPad and iPhone viewports without clipping

  Scenario Outline: Independent Pteranodon fills preserve the drawing
    Given I open a Pteranodon work using <artwork>
    When I fill any region
    Then only that region changes color
    And outlines and protected details stay visible

    Examples:
      | artwork                |
      | pteranodon-hatchling-1 |
      | pteranodon-explorer-1  |

  Scenario: Simple Parasaurolophus for Hatchling
    Given I start a new Parasaurolophus work at Hatchling
    Then the workshop renders the original parasaurolophus-hatchling-1 vector scene
    And a friendly Parasaurolophus stands with a long tube crest, a duck bill, a flowing tail and a pale belly
    And the body, belly, head, bill, crest, two legs and two arms offer broad independent coloring regions
    And its eye, smile and toes remain protected decorative details
    And simple ground with one reed clump leaves the Parasaurolophus clear and prominent
    And the entire scene fits supported iPad and iPhone viewports without clipping

  Scenario: Rich Parasaurolophus riverbank for older levels
    Given I start a new Parasaurolophus work at Explorer or Paleontologist
    Then the workshop renders the original parasaurolophus-explorer-1 vector scene
    And the Parasaurolophus stands on a riverbank with sky, sun, cloud, far bank, cypress, river, lily pad, reeds, cattail and swamp fern
    And its body adds a tail tip, belly, three back stripes and a crest tip as independent regions
    And lily flower, skin spots, ripples, stems and leaf veins remain protected linework, never tiny targets
    And the entire scene fits supported iPad and iPhone viewports without clipping

  Scenario: Simple Spinosaurus for Hatchling
    Given I start a new Spinosaurus work at Hatchling
    Then the workshop renders the original spinosaurus-hatchling-1 vector scene
    And a friendly Spinosaurus walks low on four legs with a tall back sail, a long crocodile snout, a long tail and a pale belly
    And the sail is one big region, and the body, belly, head, snout and four legs offer broad independent coloring regions
    And its eye, smile, teeth and toes remain protected decorative details
    And simple ground with one rock leaves the Spinosaurus clear and prominent
    And the entire scene fits supported iPad and iPhone viewports without clipping

  Scenario: Spinosaurus wading a river for older levels
    Given I start a new Spinosaurus work at Explorer or Paleontologist
    Then the workshop renders the spinosaurus-explorer-3 vector scene of 39 regions
    And a Spinosaurus in its own shape wades a river, legs in the water, snapping at a leaping fish: a long low body, a tall arched sail, a finned paddle tail and a long crested crocodile skull with a small eye
    And its sail rim and two sail bands, three flank stripes, belly, three tail stripes, tail fin, thigh, clawed arms and lower jaw are independent regions
    And sky, sun, two clouds, hills, a tree fern, river, two lily pads, ground, rock, fern and two reeds surround it
    And teeth, claws, scales, sail spines, ripples and leaf veins remain protected linework, never tiny targets
    And the entire scene fits supported iPad and iPhone viewports without clipping

  Scenario: Earlier Spinosaurus pictures keep saved works
    Given a saved Spinosaurus work made on spinosaurus-explorer-2
    Then the workshop renders the spinosaurus-explorer-2 vector scene it was made on

  Scenario: The first Spinosaurus riverbank keeps saved works
    Given a saved Spinosaurus work made on spinosaurus-explorer-1
    Then the workshop renders the original spinosaurus-explorer-1 vector scene
    And the Spinosaurus walks along a riverbank with sky, sun, cloud, far bank, cypress, river, lily pad, reeds, cattail and swamp fern
    And its sail is split into three stripes, and its body adds a tail tip and belly as independent regions
    And sail spines, lily flower, skin spots, ripples, stems and leaf veins remain protected linework, never tiny targets
    And the entire scene fits supported iPad and iPhone viewports without clipping
