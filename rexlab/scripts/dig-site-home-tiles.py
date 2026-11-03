"""Bake the Dig site Home tile pictures: each game's own creature in a small
scene that shows how the game is played.

Run from rexlab/: python3 scripts/dig-site-home-tiles.py
Needs Pillow and rsvg-convert. Writes design/images/home-tile-<game>.webp.
"""

import io
import math
import random
import subprocess
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
IMAGES = ROOT / "design" / "images"
W, H = 800, 600
INK = "#3A2A1C"


def load(name):
    return Image.open(IMAGES / name).convert("RGBA")


def trim(im):
    return im.crop(im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox())


def fit(im, w=None, h=None):
    im = trim(im)
    s = min(w / im.width if w else 9e9, h / im.height if h else 9e9)
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)


def svg(markup, w=W, h=H):
    doc = f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{markup}</svg>'
    png = subprocess.run(["rsvg-convert"], input=doc.encode(), capture_output=True, check=True).stdout
    return Image.open(io.BytesIO(png)).convert("RGBA")


def shadow(im, blur=10, alpha=70, dx=0, dy=8):
    a = im.getchannel("A").point(lambda v: v * alpha // 255)
    sh = Image.new("RGBA", (im.width + 4 * blur, im.height + 4 * blur), (40, 25, 10, 0))
    sh.putalpha(Image.new("L", sh.size, 0))
    mask = Image.new("L", sh.size, 0)
    mask.paste(a, (2 * blur, 2 * blur))
    sh.putalpha(mask.filter(ImageFilter.GaussianBlur(blur)))
    return sh, (dx - 2 * blur, dy - 2 * blur)


def put(canvas, im, x, y, drop=None):
    if drop:
        sh, (dx, dy) = shadow(im, **drop)
        canvas.alpha_composite(sh, (x + dx, y + dy))
    canvas.alpha_composite(im, (x, y))


def sand_texture(w, h, seed, base=(217, 183, 126)):
    rnd = random.Random(seed)
    im = Image.new("RGBA", (w, h), base + (255,))
    d = ImageDraw.Draw(im)
    for _ in range(w * h // 160):
        x, y, r = rnd.random() * w, rnd.random() * h, 0.6 + rnd.random() * 1.6
        c = (185, 143, 85) if rnd.random() < 0.5 else (236, 208, 156)
        d.ellipse((x - r, y - r, x + r, y + r), fill=c + (255,))
    return im


def masked(im, mask):
    out = im.copy()
    out.putalpha(ImageChops.multiply(im.getchannel("A"), mask))
    return out


BRUSH = (
    '<g transform="translate({x} {y}) rotate({r})">'
    '<rect x="-14" y="-150" width="28" height="120" rx="12" fill="#B5763F" stroke="' + INK + '" stroke-width="6"/>'
    '<rect x="-20" y="-40" width="40" height="34" rx="6" fill="#9AA3B0" stroke="' + INK + '" stroke-width="6"/>'
    '<path d="M-24 -8 H24 L30 56 Q0 70 -30 56 Z" fill="{tip}" stroke="' + INK + '" stroke-width="6" stroke-linejoin="round"/>'
    '</g>'
)


def dig():
    """Therizinosaurus half out of a dig pit, a brush flicking sand off it."""
    c = Image.new("RGBA", (W, H))
    dino = fit(load("therizinosaurus.webp"), w=560, h=500)
    put(c, dino, 110, 70)
    mound = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mound).polygon(
        [(x, 600 - (600 - 330) * math.sin(math.pi * (x - 30) / 740) ** 0.22
          + 12 * math.sin(x / 31) * math.sin(math.pi * (x - 30) / 740)) for x in range(30, 771, 6)],
        fill=255,
    )
    mound = mound.filter(ImageFilter.GaussianBlur(3))
    rim = mound.filter(ImageFilter.MaxFilter(9))
    c.alpha_composite(masked(Image.new("RGBA", (W, H), (150, 108, 60, 255)), rim))
    c.alpha_composite(masked(sand_texture(W, H, 7), mound))
    specks = "".join(
        f'<circle cx="{560 + 22 * math.cos(a)}" cy="{300 - 14 * i}" r="{7 - i}" fill="#E8CC98" stroke="{INK}" stroke-width="2"/>'
        for i, a in enumerate((0.2, 1.4, 2.4, 3.3, 4.4))
    )
    c.alpha_composite(svg(specks + BRUSH.format(x=650, y=330, r=38, tip="#F1E2BE")))
    return c


BASKET = (
    '<g transform="translate({x} 0)">'
    '<path d="M-150 390 H150 L124 580 Q0 600 -124 580 Z" fill="#C08A4E" stroke="' + INK + '" stroke-width="8" stroke-linejoin="round"/>'
    '<path d="M-140 450 Q0 470 140 450 M-132 510 Q0 530 132 510" fill="none" stroke="#8E5E30" stroke-width="8"/>'
    '<path d="M-90 395 L-74 585 M-30 395 L-25 595 M30 395 L25 595 M90 395 L74 585" stroke="#8E5E30" stroke-width="6"/>'
    '<rect x="-162" y="372" width="324" height="34" rx="17" fill="#D9A566" stroke="' + INK + '" stroke-width="8"/>'
    '</g>'
)


def sort():
    """A Pachycephalosaurus card dropping into the plant basket, beside the meat one."""
    c = Image.new("RGBA", (W, H))
    for x, item, h in ((215, "care-plants.webp", 150), (585, "care-meat.webp", 140)):
        food = fit(load(item), w=230, h=h)
        put(c, food, x - food.width // 2, 400 - food.height + 12)
    c.alpha_composite(svg(BASKET.format(x=215) + BASKET.format(x=585)))
    card = Image.new("RGBA", (300, 230))
    card.alpha_composite(svg(
        f'<rect x="6" y="6" width="288" height="218" rx="26" fill="#FFFDF8" stroke="{INK}" stroke-width="6"/>', 300, 230))
    pachy = fit(load("pachycephalosaurus.webp"), w=250, h=180)
    card.alpha_composite(pachy, ((300 - pachy.width) // 2, (230 - pachy.height) // 2))
    card = card.rotate(10, Image.BICUBIC, expand=True)
    put(c, card, 60, 10, drop=dict(blur=12, alpha=90, dy=14))
    c.alpha_composite(svg(
        f'<path d="M420 60 Q470 140 420 220" fill="none" stroke="#FFFDF8" stroke-width="12" stroke-linecap="round" stroke-dasharray="2 26"/>'))
    return c


HEART = (
    '<g transform="translate({x} {y})">'
    '<path d="M0 -70 C60 -70 92 -40 92 0 C92 40 60 64 18 66 L0 96 L-14 64 C-60 60 -92 38 -92 0 C-92 -40 -60 -70 0 -70 Z" '
    'fill="#FFFDF8" stroke="' + INK + '" stroke-width="6" stroke-linejoin="round"/>'
    '<path d="M0 34 C-50 4 -50 -40 -20 -40 C-8 -40 0 -30 0 -22 C0 -30 8 -40 20 -40 C50 -40 50 4 0 34 Z" fill="#D9544A"/>'
    '</g>'
)


def care():
    """Oviraptor at its water bowl, a heart bubble over its head."""
    c = Image.new("RGBA", (W, H))
    bowl = fit(load("care-water.webp"), w=290)
    put(c, bowl, 470, 590 - bowl.height, drop=dict(blur=8, alpha=60, dy=6))
    ovi = fit(load("oviraptor.webp"), w=470, h=470)
    put(c, ovi, 40, 590 - ovi.height)
    c.alpha_composite(svg(HEART.format(x=640, y=130)))
    return c


def draw():
    """A Parasaurolophus drawn as a groove in a sand tray, the finger still drawing its tail."""
    c = Image.new("RGBA", (W, H))
    tray = svg(f'<rect x="14" y="44" width="772" height="540" rx="56" fill="#9C6B3E" stroke="{INK}" stroke-width="8"/>')
    c.alpha_composite(tray)
    inner = svg('<rect x="50" y="80" width="700" height="468" rx="34" fill="#fff"/>').getchannel("A")
    c.alpha_composite(masked(sand_texture(W, H, 11, base=(226, 196, 142)), inner))
    shape = fit(load("parasaurolophus.webp"), w=560, h=380).getchannel("A").point(lambda a: 255 if a > 100 else 0)
    sil = Image.new("L", (W, H), 0)
    sil.paste(shape, ((W - shape.width) // 2 - 10, 120))
    edge = ImageChops.subtract(sil.filter(ImageFilter.MaxFilter(11)), sil.filter(ImageFilter.MinFilter(3)))
    cut = Image.new("L", (W, H), 0)
    ImageDraw.Draw(cut).rectangle((0, 0, 560, H), fill=255)
    edge = ImageChops.multiply(edge, cut)
    edge = edge.filter(ImageFilter.GaussianBlur(1.5))
    lip = ImageChops.offset(edge, -3, -4)
    c.alpha_composite(masked(Image.new("RGBA", (W, H), (248, 228, 186, 255)), lip))
    c.alpha_composite(masked(Image.new("RGBA", (W, H), (150, 106, 58, 255)), edge))
    c.alpha_composite(svg(
        f'<g transform="translate(568 330) rotate(-35)">'
        f'<path d="M-34 -300 V-36 Q-34 0 0 0 Q34 0 34 -36 V-300 Z" fill="#F2C9A4" stroke="{INK}" stroke-width="7"/>'
        f'<path d="M-20 -50 Q-20 -16 0 -14 Q20 -16 20 -50 Q0 -58 -20 -50 Z" fill="#FBE6D6" stroke="{INK}" stroke-width="4"/>'
        f'</g>'))
    return c


def maze():
    """A baby Ankylosaurus at the maze entrance, footprints leading to its parent."""
    c = Image.new("RGBA", (W, H))
    walls = ["M24 272 H560", "M240 428 H776", "M560 272 V230", "M240 428 V390", "M420 120 V150", "M520 584 V550"]
    path = "M620 508 H130 V350 H680 V196 H360"
    feet = "".join(f'<ellipse cx="{x:.0f}" cy="{y:.0f}" rx="11" ry="14" fill="#8E5E30"/>' for x, y in _along(path, 44))
    c.alpha_composite(svg(
        f'<rect x="20" y="120" width="760" height="464" rx="40" fill="#E9D3A6" stroke="#6F8742" stroke-width="30"/>'
        f'<rect x="4" y="104" width="792" height="496" rx="52" fill="none" stroke="{INK}" stroke-width="6"/>'
        + "".join(f'<path d="{p}" stroke="#6F8742" stroke-width="34" stroke-linecap="round" fill="none"/>' for p in walls)
        + "".join(f'<path d="{p}" stroke="#9BB262" stroke-width="14" stroke-linecap="round" fill="none"/>' for p in walls)
        + feet))
    parent = fit(load("ankylosaurus.webp"), w=290, h=150).transpose(Image.FLIP_LEFT_RIGHT)
    put(c, parent, 40, 258 - parent.height, drop=dict(blur=8, alpha=60, dy=6))
    baby = fit(load("ankylosaurus.webp"), w=150)
    put(c, baby, 760 - baby.width, 568 - baby.height, drop=dict(blur=6, alpha=60, dy=5))
    return c


def _along(d, step):
    """Points every `step` along an M/H/V path."""
    pts, cmd, x, y = [], None, 0, 0
    tokens = iter(d.replace("M", " M ").replace("H", " H ").replace("V", " V ").split())
    for tok in tokens:
        if tok in "MHV":
            cmd = tok
            continue
        if cmd == "M":
            x, y = int(tok), int(next(tokens))
        elif cmd == "H":
            x = int(tok)
        else:
            y = int(tok)
        pts.append((x, y))
    out, acc = [], step / 2
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        seg = math.hypot(x1 - x0, y1 - y0)
        while acc < seg:
            t = acc / seg
            out.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
            acc += step
        acc -= seg
    return out


def jigsaw(cols, rows, w, h):
    """SVG paths for a cols×rows jigsaw over a w×h picture, one per piece."""
    rnd = random.Random(3)
    cw, ch = w / cols, h / rows
    hv = [[rnd.choice((-1, 1)) for _ in range(cols)] for _ in range(rows + 1)]
    vv = [[rnd.choice((-1, 1)) for _ in range(cols + 1)] for _ in range(rows)]

    def edge(x0, y0, x1, y1, s):
        if s == 0:
            return f"L{x1} {y1}"
        dx, dy = (x1 - x0), (y1 - y0)
        nx, ny = -dy * s, dx * s
        p = lambda t, k: f"{x0 + dx * t + nx * k:.1f} {y0 + dy * t + ny * k:.1f}"
        return (f"L{p(0.40, 0)} C{p(0.43, 0.03)} {p(0.34, 0.08)} {p(0.36, 0.14)} "
                f"C{p(0.38, 0.21)} {p(0.62, 0.21)} {p(0.64, 0.14)} "
                f"C{p(0.66, 0.08)} {p(0.57, 0.03)} {p(0.60, 0)} L{x1} {y1}")

    pieces = {}
    for r in range(rows):
        for q in range(cols):
            x0, y0, x1, y1 = q * cw, r * ch, (q + 1) * cw, (r + 1) * ch
            top = 0 if r == 0 else hv[r][q]
            bot = 0 if r == rows - 1 else hv[r + 1][q]
            lef = 0 if q == 0 else vv[r][q]
            rig = 0 if q == cols - 1 else vv[r][q + 1]
            pieces[(q, r)] = (f"M{x0} {y0} " + edge(x0, y0, x1, y0, -top) + edge(x1, y0, x1, y1, -rig)
                              + edge(x1, y1, x0, y1, -bot) + edge(x0, y1, x0, y0, -lef) + "Z")
    return pieces


def puzzle():
    """A Spinosaurus picture in jigsaw pieces, one piece lifted out and tilted."""
    pw, ph, ox, oy = 600, 420, 40, 150
    pic = Image.new("RGBA", (pw, ph), (205, 226, 214, 255))
    bg = load("puzzle-backdrop.jpg").resize((pw, ph), Image.LANCZOS)
    pic.alpha_composite(bg)
    spino = fit(load("spinosaurus.webp"), w=560, h=380)
    pic.alpha_composite(spino, ((pw - spino.width) // 2, ph - spino.height - 20))
    pieces = jigsaw(3, 2, pw, ph)
    out_key = (2, 0)
    c = Image.new("RGBA", (W, H))
    c.alpha_composite(svg(f'<rect x="{ox - 14}" y="{oy - 14}" width="{pw + 28}" height="{ph + 28}" rx="28" fill="#B98B57" stroke="{INK}" stroke-width="8"/>'))
    hole = svg(f'<path d="{pieces[out_key]}" fill="#fff"/>', pw, ph).getchannel("A")
    board = masked(pic, ImageChops.invert(hole))
    c.alpha_composite(board, (ox, oy))
    c.alpha_composite(svg(f'<path d="{pieces[out_key]}" fill="#8C6238" stroke="{INK}" stroke-width="4"/>', pw, ph), (ox, oy))
    lines = "".join(f'<path d="{p}" fill="none" stroke="#FFFDF8" stroke-opacity="0.85" stroke-width="5" stroke-linejoin="round"/>'
                    for k, p in pieces.items() if k != out_key)
    c.alpha_composite(svg(lines, pw, ph), (ox, oy))
    piece = masked(pic, hole)
    piece.alpha_composite(svg(f'<path d="{pieces[out_key]}" fill="none" stroke="{INK}" stroke-width="7"/>', pw, ph))
    piece = trim(piece).rotate(-16, Image.BICUBIC, expand=True)
    piece = piece.resize((round(piece.width * 1.12), round(piece.height * 1.12)), Image.LANCZOS)
    put(c, piece, W - piece.width - 6, 6, drop=dict(blur=14, alpha=110, dy=18))
    return c


def color():
    """A half-painted Mosasaurus colouring page, the brush still painting."""
    c = Image.new("RGBA", (W, H))
    page = load("color-mosasaurus-explorer-draft.webp")
    page = page.resize((640, round(page.height * 640 / page.width)), Image.LANCZOS)
    sheet = Image.new("RGBA", (page.width + 36, page.height + 36))
    sheet.alpha_composite(svg(f'<rect x="4" y="4" width="{page.width + 28}" height="{page.height + 28}" rx="22" fill="#FFFDF8" stroke="{INK}" stroke-width="6"/>',
                              sheet.width, sheet.height))
    sheet.alpha_composite(page, (18, 18))
    sheet = sheet.rotate(-4, Image.BICUBIC, expand=True)
    put(c, sheet, 10, 600 - sheet.height - 10, drop=dict(blur=12, alpha=80, dy=12))
    c.alpha_composite(svg(BRUSH.format(x=250, y=330, r=-32, tip="#8A4FD0")))
    return c


GAMES = {"dig": dig, "sort": sort, "care": care, "draw": draw, "maze": maze, "puzzle": puzzle, "color": color}

if __name__ == "__main__":
    for name, make in GAMES.items():
        make().save(IMAGES / f"home-tile-{name}.webp", quality=90, method=6)
        print(f"design/images/home-tile-{name}.webp")
