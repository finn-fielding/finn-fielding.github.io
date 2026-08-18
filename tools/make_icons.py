#!/usr/bin/env python3
"""Generate the site's icons: favicon.svg, apple-touch-icon.png, icon-192.png,
icon-512.png.

    python3 tools/make_icons.py

These are what make the site look like a real thing rather than an unfinished
one: a browser tab, a bookmark, a Dock entry and an iOS home screen all reach for
an icon, and with none present they fall back to a blank page glyph.

Same trick as make_og_image.py — there's no image library available, so the PNG
is composed as a one-page PDF and converted with macOS's `sips`, then downsampled.
The SVG is written directly and is what modern browsers actually prefer, since it
stays crisp at every size.

The mark is four bars of different heights in the site's four accent colours: it
reads as audio at a glance and is still legible at 16 pixels, which a wordmark
would not be.
"""

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_og_image import build_pdf, rgb

ROOT = Path(__file__).resolve().parent.parent
SIZE = 512

# Slightly lifted from the page background so the icon doesn't vanish into a
# dark Dock or a dark tab strip.
BG = (0.071, 0.090, 0.165)          # #12172a
BARS = [
    ((0.243, 0.788, 0.878), 200),   # cyan    — energy
    ((0.941, 0.706, 0.161), 320),   # amber   — daytime
    ((0.608, 0.549, 0.980), 150),   # violet  — night
    ((0.765, 0.227, 0.525), 260),   # magenta — action
]

BAR_W, GAP, BASE = 72, 28, 110
LEFT = (SIZE - (len(BARS) * BAR_W + (len(BARS) - 1) * GAP)) // 2


def svg():
    bars = []
    for i, ((r, g, b), height) in enumerate(BARS):
        x = LEFT + i * (BAR_W + GAP)
        # SVG's y axis runs downward, so convert from the PDF-style baseline.
        y = SIZE - BASE - height
        hexed = "#{:02x}{:02x}{:02x}".format(round(r * 255), round(g * 255), round(b * 255))
        bars.append(
            '  <rect x="{}" y="{}" width="{}" height="{}" rx="10" fill="{}"/>'.format(
                x, y, BAR_W, height, hexed)
        )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {0} {0}" width="{0}" height="{0}">\n'
        '  <rect width="{0}" height="{0}" fill="#12172a"/>\n'
        '{1}\n'
        '</svg>\n'
    ).format(SIZE, "\n".join(bars))


def png(path, size):
    content = [rgb(BG), "0 0 {0} {0} re f".format(SIZE)]
    for i, (colour, height) in enumerate(BARS):
        x = LEFT + i * (BAR_W + GAP)
        content += [rgb(colour), "{} {} {} {} re f".format(x, BASE, BAR_W, height)]

    with tempfile.TemporaryDirectory() as tmp:
        pdf = Path(tmp) / "icon.pdf"
        pdf.write_bytes(build_pdf(SIZE, SIZE, "\n".join(content)))
        big = Path(tmp) / "icon.png"
        for args in (
            ["sips", "-s", "format", "png", str(pdf), "--out", str(big)],
            ["sips", "-z", str(size), str(size), str(big), "--out", str(path)],
        ):
            result = subprocess.run(args, capture_output=True)
            if result.returncode != 0:
                print("sips failed:", result.stderr.decode(errors="replace"), file=sys.stderr)
                return False
    return True


def main():
    if not shutil.which("sips"):
        print("Needs macOS's `sips`. The SVG icon will still be written.", file=sys.stderr)

    (ROOT / "favicon.svg").write_text(svg(), encoding="utf-8")
    print("Wrote favicon.svg ({0}x{0}, scalable)".format(SIZE))

    if shutil.which("sips"):
        for name, size in (("apple-touch-icon.png", 180), ("icon-192.png", 192), ("icon-512.png", 512)):
            if png(ROOT / name, size):
                print("Wrote {} ({}x{})".format(name, size, size))
    return 0


if __name__ == "__main__":
    sys.exit(main())
