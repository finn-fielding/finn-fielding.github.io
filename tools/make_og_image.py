#!/usr/bin/env python3
"""Generate og.png — the preview image shown when the site is linked in Slack,
iMessage, WhatsApp, Discord or Twitter.

    python3 tools/make_og_image.py

Why it's built this way: the project has no dependencies, so there's no image
library to draw with. But a PDF can be written by hand, its 14 built-in fonts
need no font files, and macOS's `sips` converts PDF to PNG at exact pixel
dimensions. So the image is composed as a one-page PDF and converted.

Re-run it whenever the number of sets changes — ./refresh.sh does that for you.
"""

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "sets.json"
OUT = ROOT / "og.png"

WIDTH, HEIGHT = 1200, 630          # the size every unfurler expects (1.91:1)

# Same palette as the site's dark theme, so a shared link looks like the page.
SURFACE = (0.102, 0.102, 0.098)    # #1a1a19
INK = (1, 1, 1)                    # #ffffff
INK_2 = (0.765, 0.761, 0.718)      # #c3c2b7
INK_MUTED = (0.537, 0.529, 0.506)  # #898781
ACCENT = (0.224, 0.529, 0.898)     # #3987e5
ACCENT_TRACK = (0.094, 0.310, 0.584)  # #184f95


def esc(text):
    """Escape a string for a PDF text literal."""
    out = str(text).replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
    # The built-in fonts cover Latin-1; anything else becomes a plain substitute
    # rather than breaking the file.
    return "".join(c if ord(c) < 256 else "?" for c in out)


def rgb(colour):
    return "{:.3f} {:.3f} {:.3f} rg".format(*colour)


def build_pdf(width, height, content):
    objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {} {}] "
        "/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>".format(width, height),
        "<< /Length {} >>\nstream\n{}\nendstream".format(len(content.encode("latin-1")), content),
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    ]

    out = b"%PDF-1.4\n"
    offsets = []
    for index, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += "{} 0 obj\n{}\nendobj\n".format(index, body).encode("latin-1")

    xref_at = len(out)
    out += "xref\n0 {}\n0000000000 65535 f \n".format(len(objects) + 1).encode("latin-1")
    for offset in offsets:
        out += "{:010d} 00000 n \n".format(offset).encode("latin-1")
    out += "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{}\n%%EOF\n".format(
        len(objects) + 1, xref_at
    ).encode("latin-1")
    return out


def stats():
    if not DATA.exists():
        return 0, 0, None
    sets = json.loads(DATA.read_text(encoding="utf-8"))
    rated = [s.get("rating") for s in sets if isinstance(s.get("rating"), (int, float))]
    artists = {s.get("artist", "").strip() for s in sets if s.get("artist", "").strip()}
    top = max(rated) if rated else None
    return len(sets), len(artists), top


def main():
    if not shutil.which("sips"):
        print("This needs macOS's `sips` command, which wasn't found.", file=sys.stderr)
        print("The site works fine without og.png — links just won't show an image.", file=sys.stderr)
        return 1

    total, artists, top = stats()

    # Bottom-left origin, so y counts up from the bottom of the image.
    lines = [
        rgb(SURFACE), "0 0 {} {} re f".format(WIDTH, HEIGHT),
        rgb(ACCENT), "0 {} {} 8 re f".format(HEIGHT - 8, WIDTH),

        rgb(INK), "BT /F1 92 Tf 80 408 Td ({}) Tj ET".format(esc("Set Ranker")),
        rgb(INK_2), "BT /F2 34 Tf 80 344 Td ({}) Tj ET".format(esc("DJ sets, ranked and filed.")),
    ]

    # A 10-segment energy meter, the site's one recurring motif. Six filled is
    # decorative rather than a claim about the data.
    seg_w, gap, filled = 84, 10, 6
    for i in range(10):
        x = 80 + i * (seg_w + gap)
        lines += [rgb(ACCENT if i < filled else ACCENT_TRACK), "{} 190 {} 14 re f".format(x, seg_w)]

    caption = "{} sets - {} artists".format(total, artists)
    if top is not None:
        caption += " - top rated {:g}/10".format(top)
    lines += [rgb(INK_MUTED), "BT /F2 26 Tf 80 120 Td ({}) Tj ET".format(esc(caption))]

    with tempfile.TemporaryDirectory() as tmp:
        pdf_path = Path(tmp) / "og.pdf"
        pdf_path.write_bytes(build_pdf(WIDTH, HEIGHT, "\n".join(lines)))
        result = subprocess.run(
            ["sips", "-s", "format", "png", str(pdf_path), "--out", str(OUT)],
            capture_output=True,
        )
    if result.returncode != 0:
        print("sips failed:", result.stderr.decode(errors="replace"), file=sys.stderr)
        return 1

    print("Wrote {} ({}x{}) - {}".format(OUT.name, WIDTH, HEIGHT, caption))
    return 0


if __name__ == "__main__":
    sys.exit(main())
