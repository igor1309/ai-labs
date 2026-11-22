#!/usr/bin/env python3
"""Count how each note refers to the owner, from run.py's output in $TMPDIR/owner-naming.

Columns: `Me` used as a person (Latin or Cyrillic «Ме»), the owner's first name or
surname in any Russian case, actions left with an unclear owner, and words.
These are the mechanical checklist items; who-did-what is checked by hand.
"""
import os, pathlib, re, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from run import owner_name

OUT = pathlib.Path(os.environ.get("TMPDIR", "/tmp")) / "owner-naming"
VARIANTS = ["me", "name", "told", "builtin"]


LATIN = [("ya", "я"), ("yu", "ю"), ("zh", "ж"), ("kh", "х"), ("ch", "ч"), ("sh", "ш"), ("ts", "ц")] + \
    list(zip("abvgdezijklmnoprstufy", "абвгдезийклмнопрстуфы"))


def cyrillic(word):
    word = word.lower()
    for a, b in LATIN:
        word = word.replace(a, b)
    return word


def stems(name):
    # First name and surname stems, Latin and Cyrillic; Russian case endings vary.
    words = name.split() + [cyrillic(w) for w in name.split()]
    return [w[:-1] if len(w) > 4 else w for w in words]


def main():
    name_re = re.compile(r"(?<!\w)(" + "|".join(map(re.escape, stems(owner_name()))) + r")\w*", re.I)
    me_re = re.compile(r"(?<!\w)(Me|Ме)(?!\w)")
    unclear_re = re.compile(r"owner unclear|владел\w* не\s*(ясен|понят|указан|определ)|ответственн\w* не\s*(ясен|указан|определ)", re.I)
    print("call\tvariant\tme\towner\tunclear\twords")
    for call in sorted(p for p in OUT.iterdir() if p.is_dir()):
        for v in VARIANTS:
            f = call / f"{v}.md"
            if not f.exists():
                continue
            t = f.read_text()
            print(f"{call.name}\t{v}\t{len(me_re.findall(t))}\t{len(name_re.findall(t))}\t{len(unclear_re.findall(t))}\t{len(t.split())}")


if __name__ == "__main__":
    main()
