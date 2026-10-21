# Trusted science sources

Dinosaur facts in `src/data/dinosaurs.json` (names, mass, diet, the
sorting game's traits and, when they exist, descriptions) are checked
against these sources only. Height is worked out from the leg bones
measured in the peer-reviewed papers under Hip heights, below, which are
trusted for that alone.

1. Natural History Museum, London: Dino Directory,
   https://www.nhm.ac.uk/discover/dino-directory.html
2. American Museum of Natural History, https://www.amnh.org
3. Smithsonian National Museum of Natural History,
   https://naturalhistory.si.edu
4. University of California Museum of Paleontology,
   https://ucmp.berkeley.edu
5. Encyclopaedia Britannica, https://www.britannica.com

The flying and sea reptiles (LAB-379) are checked against the same
sources. Where none of them gives a mass, a peer-reviewed estimate is
trusted for the mass alone: Witton 2008 for pterosaurs (Zitteliana B28),
Zhao 2026 for plesiosaurs, and Motani's ichthyosaur weights.

## Rules

- Height is hip height: from the ground to the top of the hip, the
  dinosaur standing, in metres (owner, 2026-10-18, LAB-263). Not head
  height: how sauropods held their necks is still argued (Stevens and
  Parrish 1999 against Taylor, Wedel and Naish 2009), so a head height
  rests on one side of that debate, while the hip is fixed by the leg
  bones, and hip height is the size measure palaeontologists use, in
  Alexander's 1976 speed estimates among others. Never the top of a neck,
  head, crest, sail, plates or frill, and never a shoulder height, which
  for long-armed sauropods such as Brachiosaurus stands above the hip.
- Hip height is measured as the leg bones laid end to end: the femur, the
  tibia and the third metatarsal, the hind limb length of Persons and
  Currie 2016 and of Ibrahim and others 2014. It leaves out the
  cartilage and the bend of the joints, so it is a little under the live
  hip height, the same way for every dinosaur. The museums' heights are
  not used: most give none at the hip, and those given are taken at
  different points.
- A hip height is worked out the first way the papers allow, and the
  Hip heights table says which:
  1. The three bones of one specimen.
  2. The bones a paper gives, the missing ones in proportion to the femur
     of the closest relative with all three.
  3. With no bones measured, the length a trusted source gives, in the
     hip-height-to-length proportion of the closest relative, its length
     from the same source; the mean of the proportions where several are
     as close.
- Where several papers give a dinosaur's bones, the first under Hip
  heights is used, and within it the adult with the longest femur whose
  bones are measured, not estimated, where there is one; a juvenile, or
  a femur too small for the trusted sources' length, is not used.
- Hip heights are kept to two figures.
- A flying reptile is measured by its wingspan and a sea reptile by its
  length, nose to tail, in metres, as the sources give them; neither
  has a hip height, nor a height to compare. A mass worked out from a
  relative's is scaled by the cube of the size, or by the paper's own
  equation where it gives one, and the References table shows the
  working.
- Mass is the live body mass, in kilograms. It is an estimate: a value
  is right when it lies within the range the sources give.
- Where the sources disagree, use a value inside the range most of them
  support, and note the disagreement in the change.
- Russian names follow the spelling used in Russian scientific and
  popular-science writing.
- Diet is the one the Dino Directory's fact box lists, as the catalogue
  shows it; every diet is inferred from teeth and jaws, so a hedge in
  the text does not make it unclear. A dinosaur listed as an omnivore is
  `both` (Gallimimus, Oviraptor and Troodon). The sorting game leaves it
  out of a diet board with two baskets and sorts it into BOTH on
  Explorer's, which has a third (LAB-295).
- Traits sort dinosaurs in the sorting game: `legs` (2, 4 or `either`),
  `horns` (true or false), `feathers` (true, false or `unknown`) and
  `size` (`big` or `small`). `legs` is `either` for the dinosaurs the
  sources say walked on two legs or four (Iguanodon, Plateosaurus and
  the duck-billed dinosaurs). A trait is `null`, and the dinosaur is left
  out of that sort, when the sources leave it unclear in another way
  (Spinosaurus's posture is argued over; Psittacosaurus walked on four
  legs as a hatchling and on two as an adult) or when the dinosaur's
  picture could mislead a child (Allosaurus's small brow horns are hard
  to see in its picture; Pachycephalosaurus's knobs, Kentrosaurus's
  shoulder spikes, the tail spikes of both stegosaurs and Amargasaurus's
  neck spines are not horns, nor are the crests of Parasaurolophus,
  Corythosaurus and Dilophosaurus). Feathered means feathered in the
  picture too, as `art/style.md` lists. Feathers are `false` for the
  plant-eaters drawn without them, Psittacosaurus, with its tail
  bristles, and Heterodontosaurus, whose close relatives had bristles,
  aside (both `null`), and for the meat-eaters whose skin impressions
  show scales and nothing else (Allosaurus and Carnotaurus). For the
  other meat-eaters and the omnivores drawn without feathers feathers
  are `unknown`: no fossil settles it, Tyrannosaurus included, whose
  scaly skin NHM reports while leaving feathers on its back open.
- The sorting game (LAB-295) deals `either` and `unknown` only on the
  Paleontologist level's legs and feathers boards, into TWO OR FOUR and
  NOT KNOWN YET; every other board leaves them out, as it does `null`.
  Paleontologist's feathers board deals only the dinosaurs drawn with
  feathers and the meat-eaters and omnivores, the ones a fossil can
  answer for, so its NO FEATHERS means skin that shows scales, not a
  plant-eater merely drawn without feathers.
- A flying or sea reptile's `legs` are `null`: none walked as a
  dinosaur did on two legs or four. Its `horns` are `false`; a
  pterosaur's crest is not a horn. A flier's `feathers` are `unknown`,
  as its fuzz may or may not have been a kind of feather, and a
  swimmer's are `null`, no question for that board.
- Size is `big` only for a dinosaur of 3000 kg or more and `small` only
  for one of 500 kg or less, and only when no source's estimate crosses
  that line; it is `null` in between and when the estimates cross a line
  or are guesswork (Stegosaurus, at 2720 kg by AMNH; Maiasaura, at 2500
  kg by NHM and 3–4 short tons by UCMP; Therizinosaurus, known only from
  a few bones).

## References

What each value rests on, for the dinosaurs added from LAB-282 on and for
the masses the science check of LAB-288 weighed; heights are under Hip
heights. NHM is the Dino Directory page of the dinosaur; Britannica
includes Britannica Kids. Britannica's tons are short tons of 907 kg.

| Dinosaur | Mass | References |
| --- | --- | --- |
| `ceratosaurus` | 1 t | Britannica: about 2 m tall, 1–2 t; NHM: 7 m, 980 kg |
| `utahraptor` | 350 kg | NHM: 5.5 m, 350 kg; Britannica: much larger than Deinonychus (3 m, 1.8 m) |
| `yutyrannus` | 1.4 t | NHM: 7.5 m, 1,100 kg; Britannica: 1,400 kg; AMNH: about 1.5 t; feathers in all three |
| `archaeopteryx` | 1 kg | NHM: 0.5 m, magpie-sized; AMNH: adults raven-sized; Smithsonian: ravens weigh 0.45–1.6 kg |
| `troodon` | 50 kg | Britannica: up to 2.4 m long, about 50 kg; NHM: omnivorous, feathered |
| `heterodontosaurus` | 2 kg | Britannica: about 1 m, up to 2.5 kg, ate low plants; NHM: 1.2 m, herbivorous |
| `mamenchisaurus` | 12 t | AMNH (M. hochuanensis): 18 m, 4 m at the shoulder, 13 short tons; NHM: 22 m |
| `amargasaurus` | 9 t | NHM: 12 m, 9,000 kg; no other trusted source gives a mass |
| `plateosaurus` | 4 t | NHM: 7 m, 4,000 kg; Britannica: 7–8 m |
| `maiasaura` | 3 t | NHM: 9 m, 2,500 kg; UCMP: 3–4 short tons; Britannica: 9 m |
| `corythosaurus` | 4 t | Britannica: 9 m, 3–5 t; NHM: 10 m |
| `chasmosaurus` | 2.5 t | NHM: 5 m, 2,500 kg; AMNH: about 5.2 m |
| `protoceratops` | 180 kg | NHM: 1.8 m, 400 kg; Britannica: 1.8 m, about 180 kg (400 lb), so NHM's figure is likely the pounds |
| `stegosaurus` | 2.7 t | AMNH: 8.5 m, 2,720 kg; Britannica: about 2 tons; NHM gives no mass |
| `parasaurolophus` | 3.5 t | NHM: 9 m, 5,000 kg; Britannica: 10 m, 3–4 tons |
| `brachiosaurus` | 50 t | NHM: 22 m, 46,900 kg; Britannica: 55–66 tons, and close to 80 t |
| `psittacosaurus` | 50 kg | AMNH: 60 cm tall, 130 cm long, 23–80 kg; NHM: 2 m, 50 kg |
| `coelophysis` | 20 kg | Britannica: about 2 m, 18–23 kg, and 23–45 kg; NHM: 2 m, 27 kg |
| `iguanodon` | 4 t | NHM: 10 m, 4,000 kg; Britannica: 9 m, four to five tons |
| `oviraptor` | 30 kg | NHM: 2 m, 20 kg; Britannica: 1.8 m, about 32 kg (70 lb) |
| `edmontosaurus` | 3.4 t | NHM: 13 m, 3,400 kg; no other trusted source gives a mass |
| `gallimimus` | 490 kg | NHM: 6 m, 490 kg; no other trusted source gives a mass |
| `quetzalcoatlus` | 250 kg | NHM: about 11 m wingspan, up to 250 kg; AMNH: wingspan around 10 m, Texas; Witton 2008: 9.64 m, 259 kg |
| `pteranodon` | 25 kg | AMNH: wingspan up to 6 m, fish, "winged and toothless"; UCMP: about 25 pounds; Witton 2008: 5.96 m, 36.7 kg |
| `rhamphorhynchus` | 2 kg | NHM: largest wingspan 1.8 m; Witton 2008: 0.89 m, 0.26 kg, scaled to 1.8 m by his basal-pterosaur equation; fish: Hone and others 2015 |
| `dimorphodon` | 3 kg | AMNH: wingspan up to 1.4 m, light skull, southern England; NHM: Mary Anning, 1828; Witton 2008: 1.01 m, 1.24 kg, scaled to 1.4 m |
| `pterodactylus` | 500 g | Britannica: wingspan 50 cm to well over 1 m, Late Jurassic, Germany; NHM: the first pterosaur found; Witton 2008's pterodactyloid equation: 0.52 kg at 1 m |
| `mosasaurus` | 10 t | NHM: 11–12 m likely, some say 17–18 m; around 10 t; fish, squid and sharks |
| `elasmosaurus` | 2.3 t | NHM: 72 neck bones, neck over 7 m; Welles 1952: 10.3 m; Zhao 2026: Styxosaurus 11.28 m, 3,080 kg, cubed to 10.3 m |
| `kronosaurus` | 11 t | Zhao 2026: 10.4 m, 11,396 kg, Queensland |
| `plesiosaurus` | 200 kg | NHM: about 3.5 m, fish and crustaceans, Anning's skeleton; Zhao 2026: Seeleyosaurus 3.66 m, 199 kg |
| `ophthalmosaurus` | 940 kg | Motani: 4.0 m, 930–950 kg; NHM: eyes over 22 cm across, live birth |

## Hip heights

The papers trusted for hip height, each for the bone lengths its table
gives, in millimetres:

- PC16: Persons and Currie 2016, An approach to scoring cursorial limb
  proportions in carnivorous dinosaurs, Scientific Reports 6: 19828,
  Table 1.
- KK25: Kubo and Kobayashi 2025, Cursorial ecomorphology and temporal
  patterns in theropod dinosaur evolution during the mid-Cretaceous,
  Royal Society Open Science 12: 241178, Table S1
  (doi:10.6084/m9.figshare.c.7590243).
- MO26: Moore, Evans, Ryan, Patterson and Mallon 2026, The ontogenetically
  youngest known pachycephalosaur postcranium, Journal of Vertebrate
  Paleontology (doi:10.1080/02724634.2026.2616325), Supplementary File 3.
- MA12: Maidment, Linton, Upchurch and Barrett 2012, Limb-bone scaling
  indicates diverse stance and gait in quadrupedal ornithischian
  dinosaurs, PLoS ONE 7: e36904, Table S1, femora.
- MA15: Maidment, Brassey and Barrett 2015, The postcranial skeleton of an
  exceptionally complete individual of Stegosaurus stenops, PLoS ONE 10:
  e0138352, Table 3.
- IB14: Ibrahim and others 2014, Semiaquatic adaptations in a giant
  predatory dinosaur, Science 345: 1613, Table S1 (in centimetres).
- MZ04: Mazzetta, Christiansen and Fariña 2004, Giants and bizarres: body
  size of some southern South American Cretaceous dinosaurs, Historical
  Biology 16: 71, Table I and text.
- MY07: Mayr, Pohl, Hartman and Peters 2007, The tenth skeletal specimen
  of Archaeopteryx, Zoological Journal of the Linnean Society 149: 97,
  Table 1.
- TS15: Tschopp, Wings, Frauenfelder and Brinkmann 2015, Articulated bone
  sets of manus and pedes of Camarasaurus, Palaeontologia Electronica
  18.2.44A, tables.

The proportions the table uses, from the relatives' bones (femur +
tibia + metatarsal III, over the femur unless said):

- Ceratopsians, Protoceratops AMNH 6424 (MO26): 646 / 248 = 2.60.
- Thyreophorans, Stegosaurus NHMUK PV R36730 (MA15): 1466 / 868 = 1.69.
- Hadrosaurs and Iguanodon, Edmontosaurus CMNFV 8399 (MO26): 2393 /
  1118 = 2.14.
- Pachycephalosaurs, Stegoceras UALVP 2 (MO26): 545 / 222 = 2.45.
- Abelisaurs, Aucasaurus MCF-PBPH-236 (PC16): 1686 / 700 = 2.41.
- Sauropods' metatarsal III, Camarasaurus SMA 0002 (TS15): 139 / 935 =
  0.149 of the femur; titanosaurs' tibia, Opisthocoelicaudia (MZ04):
  810 / 1395 = 0.58 of the femur.
- Giganotosaurus's metatarsal, its close relative Meraxes MMCh-PV 65
  (KK25): 486 / 1260 = 0.386 of the femur.

| Dinosaur | Hip height | Way | Working |
| --- | --- | --- | --- |
| `tyrannosaurus` | 3.1 m | 1 | PC16, CM 9380: 1269 + 1166 + 680; KK25, FMNH PR 2081, gives 3116 |
| `triceratops` | 2.7 m | 2 | MA12, AMNH 5033: femur 1040, × 2.60 |
| `velociraptor` | 0.59 m | 1 | PC16, IGM 100/986: 238 + 255 + 99 |
| `brachiosaurus` | 3.4 m | 2 | MZ04, B. brancai: 2028 + 1120, + 0.149 × 2028 |
| `stegosaurus` | 1.5 m | 1 | MA15, NHMUK PV R36730: 868 + 498 + 100 |
| `ankylosaurus` | 1.1 m | 2 | MA12, AMNH 5214: femur 650, × 1.69 |
| `spinosaurus` | 1.6 m | 1 | IB14, FSAC-KK 11888: 61 + 67 + 30 cm, the metatarsal the authors' estimate |
| `diplodocus` | 2.8 m | 2 | MZ04, D. carnegiei: 1540 + 1010, + 0.149 × 1540 |
| `parasaurolophus` | 2.2 m | 2 | MA12, ROM 876: femur 1030, × 2.14 |
| `pachycephalosaurus` | 1.1 m | 2 | MA12, the Fukui cast: femur 468, × 2.45 |
| `iguanodon` | 2.2 m | 2 | MA12, BINS 1713: femur 1048, × 2.14 |
| `compsognathus` | 0.32 m | 1 | PC16, MNHN CNJ 79: 110 + 130 + 81 |
| `gallimimus` | 1.9 m | 1 | KK25, MPC-D100/11: 665 + 710 + 530 |
| `allosaurus` | 2.2 m | 1 | PC16, AMNH 290: 985 + 810 + 423 |
| `argentinosaurus` | 4.3 m | 2 | MZ04: femur 2500 (Bonaparte 1996), + 0.58 × 2500 + 0.149 × 2500 |
| `microraptor` | 0.33 m | 1 | PC16, QM V1002: 108 + 145 + 72 |
| `protoceratops` | 0.65 m | 1 | MO26, AMNH 6424: 248 + 273 + 125 |
| `dilophosaurus` | 1.5 m | 1 | PC16, UCMP 77270: 600 + 560 + 298 |
| `carnotaurus` | 2.5 m | 2 | MZ04, MACN-CH 894: femur 1030 (Bonaparte and others 1990), × 2.41 |
| `giganotosaurus` | 3.1 m | 2 | MZ04, MUCPv-CH-1: 1430 + 1120, + 0.386 × 1430 |
| `therizinosaurus` | 3.0 m | 3 | NHM 10 m × Nothronychus, KK25 UMNH VP16420 1578 over NHM 5.3 m; Segnosaurus, NHM 4 m, is too short for its 840 mm femur |
| `edmontosaurus` | 2.4 m | 1 | MO26, CMNFV 8399, adult: 1118 + 930 + 345 |
| `deinonychus` | 0.87 m | 1 | PC16, MCZ 4371: 336 + 368 + 164 |
| `oviraptor` | 0.65 m | 3 | NHM 2 m × the mean of three oviraptorids, KK25 over NHM: Conchoraptor 640 / 1.5 m, Khaan 361 / 1.8 m, Heyuannia 710 / 2 m |
| `coelophysis` | 0.59 m | 1 | PC16, CMNH 10971a: 229 + 227 + 138 |
| `psittacosaurus` | 0.52 m | 1 | MO26, PM TGU 16/4-20 (P. sibiricus): 223 + 205 + 95 |
| `styracosaurus` | 2.4 m | 3 | NHM 5.5 m × Chasmosaurus, 2188 over NHM 5 m; MA12 lists no Styracosaurus femur |
| `kentrosaurus` | 1.1 m | 2 | MA12, MB R.3594: femur 660, × 1.69 |
| `baryonyx` | 2.2 m | 3 | NHM 10 m × Suchomimus, IB14 MNN GAD500 108 + 95 + 38 cm over NHM 11 m |
| `apatosaurus` | 3.2 m | 2 | MZ04, A. louisae: 1785 + 1115, + 0.149 × 1785 |
| `ceratosaurus` | 1.4 m | 1 | PC16, USNM 4735: 620 + 555 + 254 |
| `utahraptor` | 1.4 m | 3 | NHM 5.5 m × Achillobator, PC16 MNUFR-15 505 + 490 + 234 over NHM 5 m |
| `yutyrannus` | 1.7 m | 1 | PC16, ZCDM V5001: 650 + 655 + 350 |
| `archaeopteryx` | 0.16 m | 1 | MY07, the Thermopolis specimen: 50.3 + 74.6 + 39.6 |
| `troodon` | 0.88 m | 1 | PC16, MOR 748: 320 + 352 + 210 |
| `heterodontosaurus` | 0.33 m | 1 | MO26, SAM K337: 113 + 140 + 73 |
| `mamenchisaurus` | 2.3 m | 2 | MZ04, M. hochuanensis: 1275 + 860, + 0.149 × 1275 |
| `amargasaurus` | 1.8 m | 2 | MZ04: 1050 + 640, + 0.149 × 1050 |
| `plateosaurus` | 1.4 m | 1 | KK25, SMNS 1320: 660 + 490 + 220 |
| `maiasaura` | 2.1 m | 2 | MA12, ROM 44770: femur 990, × 2.14 |
| `corythosaurus` | 2.4 m | 3 | NHM 10 m × Parasaurolophus, 2205 over NHM 9 m; MA12's femora, 500–640 mm, are too small for its length |
| `chasmosaurus` | 2.2 m | 2 | MA12, ROM 843: femur 840, × 2.60 |
