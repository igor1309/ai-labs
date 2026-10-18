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
- Diet is the one the Dino Directory's fact box lists, as the catalogue
  shows it; every diet is inferred from teeth and jaws, so a hedge in
  the text does not make it unclear. A dinosaur listed as an omnivore is
  `both` (Gallimimus and Oviraptor), and the sorting game leaves it out
  of diet boards.
- Traits sort dinosaurs in the sorting game: `legs` (2 or 4), `horns`
  and `feathers` (true or false) and `size` (`big` or `small`). A trait
  is `null`, and the dinosaur is left out of that sort, when the sources
  leave it unclear (Iguanodon, Plateosaurus and the duck-billed
  dinosaurs walked on two legs or four; feathers are unknown for
  Tyrannosaurus and most large theropods) or when the dinosaur's picture
  could mislead a child (Allosaurus's small brow horns are hard to see
  in its picture; Pachycephalosaurus's knobs, Kentrosaurus's shoulder
  spikes, the tail spikes of both stegosaurs and Amargasaurus's neck
  spines are not horns, nor are the crests of Parasaurolophus,
  Corythosaurus and Dilophosaurus). Feathered means feathered in the
  picture too, as `art/style.md` lists. Feathers are `false` for the
  plant-eaters drawn without them, Psittacosaurus, with its tail
  bristles, and Heterodontosaurus, whose close relatives had bristles,
  aside, and for the meat-eaters whose skin impressions show scales
  (Allosaurus and Carnotaurus); for the other meat-eaters and the
  omnivores drawn without feathers they are `null`.
- Size is `big` only for a dinosaur of 3000 kg or more and `small` only
  for one of 500 kg or less, and only when no source's estimate crosses
  that line; it is `null` in between and when the estimates cross a line
  or are guesswork (Stegosaurus, at 2720 kg by AMNH; Maiasaura, at 2500
  kg by NHM and 3–4 short tons by UCMP; Therizinosaurus, known only from
  a few bones).
- Where no source gives a height, it is worked out from the length a
  source gives, in the proportions of a relative already in the list, and
  the reference says so.

## References

What each value rests on, for the dinosaurs added from LAB-282 on and for
the masses and heights the science check of LAB-288 weighed. NHM is the
Dino Directory page of the dinosaur; Britannica includes Britannica Kids.
Britannica's tons are short tons of 907 kg.

| Dinosaur | Height | Mass | References |
| --- | --- | --- | --- |
| `ceratosaurus` | 2 m at the hip | 1 t | Britannica: about 2 m tall, 1–2 t; NHM: 7 m, 980 kg |
| `utahraptor` | 1.5 m, from its length | 350 kg | NHM: 5.5 m, 350 kg; Britannica: much larger than Deinonychus (3 m, 1.8 m) |
| `yutyrannus` | 2.3 m, from its length | 1.4 t | NHM: 7.5 m, 1,100 kg; Britannica: 1,400 kg; AMNH: about 1.5 t; feathers in all three |
| `archaeopteryx` | 0.3 m, from its length | 1 kg | NHM: 0.5 m, magpie-sized; AMNH: adults raven-sized; Smithsonian: ravens weigh 0.45–1.6 kg |
| `troodon` | 0.9 m at the hip, from its length | 50 kg | Britannica: up to 2.4 m long, about 50 kg; NHM: omnivorous, feathered |
| `heterodontosaurus` | 0.3 m, from its length | 2 kg | Britannica: about 1 m, up to 2.5 kg, ate low plants; NHM: 1.2 m, herbivorous |
| `mamenchisaurus` | 4 m at the shoulder | 12 t | AMNH (M. hochuanensis): 18 m, 4 m at the shoulder, 13 short tons; NHM: 22 m |
| `amargasaurus` | 2.5 m, from its length | 9 t | NHM: 12 m, 9,000 kg; no other trusted source gives a mass |
| `plateosaurus` | 2 m at the hip, from its length | 4 t | NHM: 7 m, 4,000 kg; Britannica: 7–8 m |
| `maiasaura` | 2.5 m, from its length | 3 t | NHM: 9 m, 2,500 kg; UCMP: 3–4 short tons; Britannica: 9 m |
| `corythosaurus` | 2.8 m with the crest, from its length | 4 t | Britannica: 9 m, 3–5 t; NHM: 10 m |
| `chasmosaurus` | 1.8 m, from its length | 2.5 t | NHM: 5 m, 2,500 kg; AMNH: about 5.2 m |
| `protoceratops` | 0.7 m | 180 kg | NHM: 1.8 m, 400 kg; Britannica: 1.8 m, about 180 kg (400 lb), so NHM's figure is likely the pounds |
| `stegosaurus` | 4 m | 2.7 t | AMNH: 8.5 m, 2,720 kg; Britannica: about 2 tons; NHM gives no mass |
| `parasaurolophus` | 2.8 m | 3.5 t | NHM: 9 m, 5,000 kg; Britannica: 10 m, 3–4 tons |
| `brachiosaurus` | 12.5 m | 50 t | NHM: 22 m, 46,900 kg; Britannica: 55–66 tons, and close to 80 t |
| `psittacosaurus` | 0.6 m | 50 kg | AMNH: 60 cm tall, 130 cm long, 23–80 kg; NHM: 2 m, 50 kg |
| `coelophysis` | 0.6 m | 20 kg | Britannica: about 2 m, 18–23 kg, and 23–45 kg; NHM: 2 m, 27 kg |
| `iguanodon` | 2.7 m | 4 t | NHM: 10 m, 4,000 kg; Britannica: 9 m, four to five tons |
| `oviraptor` | 0.8 m | 30 kg | NHM: 2 m, 20 kg; Britannica: 1.8 m, about 32 kg (70 lb) |
| `edmontosaurus` | 3 m | 3.4 t | NHM: 13 m, 3,400 kg; no other trusted source gives a mass |
| `gallimimus` | 1.9 m | 490 kg | NHM: 6 m, 490 kg; no other trusted source gives a mass |
