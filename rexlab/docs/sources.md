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
- Where no source gives a height, it is worked out from the length a
  source gives, in the proportions of a relative already in the list, and
  the reference says so.

## References

What each value rests on, for the dinosaurs added from LAB-282 on. NHM is the
Dino Directory page of the dinosaur; Britannica includes Britannica Kids.

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
