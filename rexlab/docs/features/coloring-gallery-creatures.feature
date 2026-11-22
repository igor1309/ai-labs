@next
Feature: Coloring gallery creature choices
  The gallery belongs inside coloring. Each work has a stable independent
  identity, editable paint, ordered undo history, thumbnail, draft or
  completed status and a
  remembered flag recording whether its one star has been awarded.
  Normal play offers no deletion or duplication of works; a parent can
  explicitly reset globally unreadable coloring history after a loss warning.
  Undo history belongs to each work and survives switching works, reopening
  completed works, app restarts and rotation; DONE does not clear it.

  Scenario: Choose a recognizable Mosasaurus
    When I enter the gallery at any age level
    Then exactly one Mosasaurus choice has a matching vector preview and the uppercase localized name MOSASAURUS or МОЗАЗАВР
    And Mosasaurus uses mosasaurus-hatchling-1 at Hatchling and mosasaurus-explorer-2 at Explorer and Paleontologist
    And Stegosaurus, Triceratops, Ankylosaurus and T-Rex remain available with their age-matched previews
    And its friendly swimming silhouette has long toothy jaws, four paddles and a crescent tail fin
    And choosing it starts an independent unpainted work without changing existing works

  Scenario: Choose a recognizable Brachiosaurus
    When I enter the gallery at any age level
    Then exactly one Brachiosaurus choice has a matching vector preview and the uppercase localized name BRACHIOSAURUS or БРАХИОЗАВР
    And Brachiosaurus uses brachiosaurus-hatchling-1 at Hatchling and brachiosaurus-explorer-2 at Explorer and Paleontologist
    And Stegosaurus, Triceratops, Ankylosaurus, T-Rex and Mosasaurus remain available with their age-matched previews
    And its friendly silhouette has a long neck reaching up, a small head, tall front legs and a sloping back to a long tail
    And choosing it starts an independent unpainted work without changing existing works

  Scenario: Nine creature choices keep one row
    When I enter the gallery at any size
    Then the creature choices sit in one row, each showing its preview, a plus in the top leading corner and only the creature name on one line
    When I enter the gallery on a phone, upright or on its side, or on an upright iPad
    Then the row scrolls sideways, the next choice peeks in, and every choice is at least 60 by 60 points

  Scenario: Choose a recognizable Pteranodon
    When I enter the gallery at any age level
    Then exactly one Pteranodon choice has a matching vector preview and the uppercase localized name PTERANODON or ПТЕРАНОДОН
    And Pteranodon uses pteranodon-hatchling-1 at Hatchling and pteranodon-explorer-1 at Explorer and Paleontologist
    And Stegosaurus, Triceratops, Ankylosaurus, T-Rex, Mosasaurus and Brachiosaurus remain available with their age-matched previews
    And its friendly silhouette has wide spread wings, a long beak and a swept-back crest
    And choosing it starts an independent unpainted work without changing existing works

  Scenario: Choose a recognizable Parasaurolophus
    When I enter the gallery at any age level
    Then exactly one Parasaurolophus choice has a matching vector preview and the uppercase localized name PARASAUROLOPHUS or ПАРАЗАУРОЛОФ
    And Parasaurolophus uses parasaurolophus-hatchling-1 at Hatchling and parasaurolophus-explorer-1 at Explorer and Paleontologist
    And Stegosaurus, Triceratops, Ankylosaurus, T-Rex, Mosasaurus, Brachiosaurus and Pteranodon remain available with their age-matched previews
    And its friendly silhouette has a long tube crest sweeping back, a duck bill and a flowing tail
    And choosing it starts an independent unpainted work without changing existing works

  Scenario: Choose a recognizable Spinosaurus
    When I enter the gallery at any age level
    Then exactly one Spinosaurus choice has a matching vector preview and the uppercase localized name SPINOSAURUS or СПИНОЗАВР
    And Spinosaurus uses spinosaurus-hatchling-1 at Hatchling and spinosaurus-explorer-3 at Explorer and Paleontologist
    And Stegosaurus, Triceratops, Ankylosaurus, T-Rex, Mosasaurus, Brachiosaurus, Pteranodon and Parasaurolophus remain available with their age-matched previews
    And its friendly silhouette walks low on four legs with a tall back sail, a long crocodile snout and a long tail, unlike the upright T-Rex
    And choosing it starts an independent unpainted work without changing existing works
