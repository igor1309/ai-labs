# Trusted science sources

Dinosaur facts in `src/data/dinosaurs.json` (names, height, mass, diet,
the sorting game's traits and, when they exist, descriptions) are checked
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
- Diet is the one the catalogue shows, as the Dino Directory gives it;
  the sorting game sorts by it too and leaves out the dinosaurs that
  ate `both` (Gallimimus and Oviraptor). A dinosaur whose diet the
  sources leave unsure also has `"diet": null` in its traits, and the
  sorting game leaves it out: Pachycephalosaurus is `plants` in the
  catalogue, but "nobody knows for sure", and its teeth leave meat
  possible.
- Traits sort dinosaurs in the sorting game: `legs` (2 or 4), `horns`
  and `feathers` (true or false) and `size` (`big` or `small`). A trait is `null`, and the dinosaur is
  left out of that sort, when the sources leave it unclear (Iguanodon
  and Parasaurolophus walked on two legs or four; feathers are unknown for
  Tyrannosaurus and most large theropods) or when the dinosaur's picture
  could mislead a child (Allosaurus's small brow horns are hard to see in
  its picture, and Pachycephalosaurus's knobs and Kentrosaurus's shoulder
  spikes are not horns). Feathered
  means feathered in the picture too, as `art/style.md` lists. Feathers
  are `false` for the plant-eaters drawn without them, Psittacosaurus,
  with its tail bristles, aside, and for the meat-eaters whose skin
  impressions show scales (Allosaurus and Carnotaurus); for the other
  meat-eaters and the omnivores drawn without feathers they are `null`.
- Size is `big` only for a dinosaur of 3000 kg or more and `small` only
  for one of 500 kg or less, and only when no source's estimate crosses
  that line; it is `null` in between and when the estimates cross a line
  or are guesswork (Stegosaurus, at 2720 kg by AMNH; Therizinosaurus,
  known only from a few bones).
