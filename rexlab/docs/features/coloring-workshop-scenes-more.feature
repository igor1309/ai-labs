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
    Then the workshop renders pteranodon-hatchling-2, the original pteranodon-hatchling-1 vector scene enlarged to fill the paper
    And a friendly Pteranodon soars with two wide wings, a long beak and a swept-back crest
    And the wings, body, head, beak, crest and two legs offer broad independent coloring regions
    And its eye, smile and toes remain protected decorative details
    And a simple sea with one cloud leaves the Pteranodon clear and prominent
    And the entire scene fits supported iPad and iPhone viewports without clipping
    And the canvas has the localized uppercase accessible name PTERANODON or ПТЕРАНОДОН

  Scenario: Pteranodon gliding over the sea for older levels
    Given I start a new Pteranodon work at Explorer or Paleontologist
    Then the workshop renders the pteranodon-explorer-2 traced line-art scene of 36 regions
    And a Pteranodon in its own proportions glides close up with a long pointed beak, a long backswept crest, a small body and long membrane wings running past the frame
    And its beak, head, neck, body, three crest bands, three panels on each wing and the near wing's arm are regions of their own
    And a sky with sun and three clouds, hills, two sea bands, a cliff of four faces and two stones offer broad scenery regions
    And its outline, eye, smile, nostril and toes are one protected ink drawing above every fill
    And the entire scene fits supported iPad landscape viewports without clipping

  Scenario Outline: Independent Pteranodon fills preserve the drawing
    Given I open a Pteranodon work using <artwork>
    When I fill any region
    Then only that region changes color
    And outlines and protected details stay visible

    Examples:
      | artwork                |
      | pteranodon-hatchling-1 |
      | pteranodon-explorer-1  |
      | pteranodon-explorer-2  |

  Scenario: Simple Parasaurolophus for Hatchling
    Given I start a new Parasaurolophus work at Hatchling
    Then the workshop renders parasaurolophus-hatchling-2, the original parasaurolophus-hatchling-1 vector scene enlarged to fill the paper
    And a friendly Parasaurolophus stands with a long tube crest, a duck bill, a flowing tail and a pale belly
    And the body, belly, head, bill, crest, two legs and two arms offer broad independent coloring regions
    And its eye, smile and toes remain protected decorative details
    And simple ground with one reed clump leaves the Parasaurolophus clear and prominent
    And the entire scene fits supported iPad and iPhone viewports without clipping

  Scenario: Parasaurolophus by a swamp river for older levels
    Given I start a new Parasaurolophus work at Explorer or Paleontologist
    Then the workshop renders the parasaurolophus-explorer-3 traced line-art scene of 44 regions
    And a Parasaurolophus in its own proportions walks on four legs with a long curved crest sweeping back over its neck, a duck-billed head, a deep body and a long level tail
    And its crest, head, neck, throat, body, three back stripes, four tail bands and each of its four legs are regions of their own
    And sky, sun, cloud, five hills, a meadow, a river in two parts with two lily pads, banks, ground, a conifer's trunk and three crown tiers, two bushes and three stones offer broad scenery regions
    And its outline, small eye, nostril, mouth and toes are one protected ink drawing above every fill
    And the entire scene fits supported iPad landscape viewports without clipping

  Scenario: Simple Spinosaurus for Hatchling
    Given I start a new Spinosaurus work at Hatchling
    Then the workshop renders spinosaurus-hatchling-2, the original spinosaurus-hatchling-1 vector scene enlarged to fill the paper
    And a friendly Spinosaurus walks low on four legs with a tall back sail, a long crocodile snout, a long tail and a pale belly
    And the sail is one big region, and the body, belly, head, snout and four legs offer broad independent coloring regions
    And its eye, smile, teeth and toes remain protected decorative details
    And simple ground with one rock leaves the Spinosaurus clear and prominent
    And the entire scene fits supported iPad and iPhone viewports without clipping

  Scenario: Spinosaurus on a riverbank for older levels
    Given I start a new Spinosaurus work at Explorer or Paleontologist
    Then the workshop renders the spinosaurus-explorer-5 traced line-art scene of 38 regions
    And a Spinosaurus in its own proportions walks a riverbank: a long crocodile snout, a deep head, a tall rounded sail, a long banded tail and strong hind legs
    And its head, body, belly, both hind legs, a back stripe, four tail bands and seven sail bands are regions of their own
    And sky, sun, two clouds, hills, a riverbank, a river with a fish, a palm with two leaf clusters and three stones offer broad scenery regions
    And its outline, eye, nostril, claws and its small arms are one protected ink drawing above every fill
    And the entire scene fits supported iPad and iPhone viewports without clipping

  Scenario: Earlier Spinosaurus pictures keep saved works
    Given a saved Spinosaurus work made on spinosaurus-explorer-2 or spinosaurus-explorer-3
    Then the workshop renders the vector scene it was made on

  Scenario: The first Spinosaurus riverbank keeps saved works
    Given a saved Spinosaurus work made on spinosaurus-explorer-1
    Then the workshop renders the original spinosaurus-explorer-1 vector scene
    And the Spinosaurus walks along a riverbank with sky, sun, cloud, far bank, cypress, river, lily pad, reeds, cattail and swamp fern
    And its sail is split into three stripes, and its body adds a tail tip and belly as independent regions
    And sail spines, lily flower, skin spots, ripples, stems and leaf veins remain protected linework, never tiny targets
    And the entire scene fits supported iPad and iPhone viewports without clipping

  Scenario: Every picture fills its paper
    Given I start a new work of any creature at any level
    Then the picture reaches the paper's edges in its tighter direction and sits centred in the other
    And no frame line or second border is drawn round the picture
    And the whole creature stays in view, nothing of it cut off at the paper's edge
    And the open scenery of a traced scene, its sky, land and water, shows the paper colour until I fill it
    And a picture enlarged to fill the paper keeps the regions, ink and tap targets of the picture it enlarges
    And a work saved on an earlier picture reopens on that picture
