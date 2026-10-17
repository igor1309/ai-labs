# Trusted science sources

Dinosaur facts in `src/data/dinosaurs.json` (names, height, mass, the
sorting game's traits and, when they exist, descriptions) are checked
against these sources only.

1. Natural History Museum, London: Dino Directory,
   https://www.nhm.ac.uk/discover/dino-directory.html
2. American Museum of Natural History, https://www.amnh.org
3. Smithsonian National Museum of Natural History,
   https://naturalhistory.si.edu
4. University of California Museum of Paleontology,
   https://ucmp.berkeley.edu
5. Encyclopaedia Britannica, https://www.britannica.com

## Rules

- Height is how tall the dinosaur stands as drawn, in metres; mass is in
  kilograms. Both are estimates: a value is right when it lies within the
  range the sources give.
- Where the sources disagree, use a value inside the range most of them
  support, and note the disagreement in the change.
- Russian names follow the spelling used in Russian scientific and
  popular-science writing.
- Traits sort dinosaurs in the sorting game: `legs` (2 or 4), `diet`
  (`plants` or `meat`), `horns` and `feathers` (true or false). A trait is
  `null`, and the dinosaur is left out of that sort, when the sources
  leave it unclear (Iguanodon and Parasaurolophus walked on two legs or
  four; Gallimimus and Oviraptor were omnivores; feathers are unknown for
  Tyrannosaurus and most large theropods) or when the dinosaur's picture
  could mislead a child (Allosaurus's brow bumps, Pachycephalosaurus's
  knobs and Kentrosaurus's shoulder spikes are not horns). Feathered
  means feathered in the picture too, as `art/style.md` lists. Feathers
  are `false` for the plant-eaters drawn without them, Psittacosaurus,
  with its tail bristles, aside, and for the meat-eaters whose skin
  impressions show scales (Allosaurus and Carnotaurus); for the other
  meat-eaters and the omnivores drawn without feathers they are `null`.
- Size is not stored: the sorting game reads it from mass. A dinosaur
  of 3000 kg or more is BIG, one of 500 kg or less is SMALL, and one in
  between is never sorted by size. The lines sit far apart, so the whole
  range of estimates the sources give for each shipped dinosaur lies on
  one side of a line; a new dinosaur whose range crosses a line gets the
  middle of its range, inside the band that is never sorted, or no size.
