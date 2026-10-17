# Trusted science sources

Dinosaur facts in `src/data/dinosaurs.json` (names, height, mass and, when
they exist, descriptions) are checked against these sources only.

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
