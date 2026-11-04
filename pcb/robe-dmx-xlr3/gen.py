#!/usr/bin/env python3
"""Generátor výrobních podkladů: DMX deska se dvěma 3pin XLR (IN/OUT) pro Robe 150 Beam / Spike.

Výstup: gerber/*.gbr, gerber/*.drl, robe-dmx-xlr3.kicad_pcb, preview.png, zip.
Všechny rozměry jsou v mm a jsou na jednom místě níže (CONFIG) - upravte podle
skutečných konektorů (změřit šuplerou na originální desce!) a spusťte znovu.

Pouzdro: 2 vrstvy, 1.6 mm, HASL/ENIG, bílý potisk.
Sítě: 1 = pin 1 (stínění/GND), 2 = pin 2 (DMX-), 3 = pin 3 (DMX+).
"""
import os, zipfile

# ---------------------------------------------------------------- CONFIG ----
BOARD_W, BOARD_H = 36.0, 24.0          # rozměr desky
PAD_D, PAD_DRILL = 2.0, 1.1            # pady pinů XLR  (!!! ověřit podle konektoru)
OUT_PAD_D, OUT_DRILL = 2.0, 1.0        # pady pro kabel k hlavní desce
TRACK_W = 0.6                          # šířka cest
VIA_D, VIA_DRILL = 0.8, 0.4
MASK_EXP = 0.05                        # rozšíření masky na stranu
Y_PINS, Y_OUT = 15.0, 3.0
BUS_Y = {1: 11.0, 2: 9.0, 3: 7.0}      # horizontální sběrnice (spodní vrstva)

# piny konektoru A (vlevo, např. IN) a B (vpravo, např. OUT): (x, y, síť)
# B je zrcadlově obrácený kvůli gender (zásuvka/vidlice) - viz README.
J1 = [(5.0, Y_PINS, 3), (9.0, Y_PINS, 2), (13.0, Y_PINS, 1)]
J2 = [(23.0, Y_PINS, 1), (27.0, Y_PINS, 2), (31.0, Y_PINS, 3)]
J3 = [(15.0, Y_OUT, 1), (18.0, Y_OUT, 2), (21.0, Y_OUT, 3)]   # vývody na kabel
# ---------------------------------------------------------------------------

HERE = os.path.dirname(os.path.abspath(__file__))
GB = os.path.join(HERE, "gerber")
os.makedirs(GB, exist_ok=True)
NETNAME = {1: "PIN1_GND", 2: "PIN2_DMX-", 3: "PIN3_DMX+"}

pads = [(x, y, n, PAD_D, PAD_DRILL, "J1" if (x, y, n) in J1 else "J2") for x, y, n in J1 + J2]
pads += [(x, y, n, OUT_PAD_D, OUT_DRILL, "J3") for x, y, n in J3]

# cesty: (vrstva, x1, y1, x2, y2, síť)
tracks = []
for conn in (J1, J2):
    for x, y, n in conn:
        tracks.append(("B", x, y, x, BUS_Y[n], n))
for n in (1, 2, 3):
    xs = [x for x, _, nn in J1 + J2 if nn == n]
    tracks.append(("B", min(xs), BUS_Y[n], max(xs), BUS_Y[n], n))
vias = []
for x, y, n in J3:                      # vývody jdou po horní vrstvě nahoru ke sběrnici
    tracks.append(("T", x, y, x, BUS_Y[n], n))
    vias.append((x, BUS_Y[n], n))

# silk: rámeček a značka pinu 1 u každého konektoru
silk_lines = [(0.8, 0.8, BOARD_W - 0.8, 0.8), (BOARD_W - 0.8, 0.8, BOARD_W - 0.8, BOARD_H - 0.8),
              (BOARD_W - 0.8, BOARD_H - 0.8, 0.8, BOARD_H - 0.8), (0.8, BOARD_H - 0.8, 0.8, 0.8)]
pin1_marks = [(x, y - 2.0) for conn in (J1, J2, J3) for x, y, n in conn if n == 1]


def c(v):
    return int(round(v * 1e6))


class Gerber:
    def __init__(self, name):
        self.name, self.aps, self.body = name, {}, []

    def ap(self, d):
        if d not in self.aps:
            self.aps[d] = 10 + len(self.aps)
        return self.aps[d]

    def flash(self, x, y, d):
        self.body += [f"D{self.ap(d)}*", f"X{c(x)}Y{c(y)}D03*"]

    def line(self, x1, y1, x2, y2, w):
        self.body += [f"D{self.ap(w)}*", f"X{c(x1)}Y{c(y1)}D02*", f"X{c(x2)}Y{c(y2)}D01*"]

    def save(self, fname):
        out = [f"G04 {self.name} - robe-dmx-xlr3*", "%FSLAX46Y46*%", "%MOMM*%", "%LPD*%"]
        out += [f"%ADD{i}C,{d:.6f}*%" for d, i in self.aps.items()]
        out += self.body + ["M02*"]
        with open(os.path.join(GB, fname), "w") as f:
            f.write("\n".join(out) + "\n")


def copper(layer):
    g = Gerber(layer)
    for l, x1, y1, x2, y2, n in tracks:
        if l == layer:
            g.line(x1, y1, x2, y2, TRACK_W)
    for x, y, n, d, dr, r in pads:
        g.flash(x, y, d)
    for x, y, n in vias:
        g.flash(x, y, VIA_D)
    return g


def mask(layer):
    g = Gerber(layer + " mask")
    for x, y, n, d, dr, r in pads:
        g.flash(x, y, d + 2 * MASK_EXP)
    for x, y, n in vias:                # přes zatavené (tented) - bez otvoru v masce
        pass
    return g


copper("T").save("robe-dmx-xlr3-F_Cu.gtl")
copper("B").save("robe-dmx-xlr3-B_Cu.gbl")
mask("T").save("robe-dmx-xlr3-F_Mask.gts")
mask("B").save("robe-dmx-xlr3-B_Mask.gbs")

s = Gerber("F silk")
for l in silk_lines:
    s.line(*l, 0.15)
for x, y in pin1_marks:
    s.flash(x, y, 0.8)
s.save("robe-dmx-xlr3-F_Silk.gto")

o = Gerber("outline")
corners = [(0, 0), (BOARD_W, 0), (BOARD_W, BOARD_H), (0, BOARD_H), (0, 0)]
for a, b in zip(corners, corners[1:]):
    o.line(*a, *b, 0.1)
o.save("robe-dmx-xlr3-Edge_Cuts.gm1")

# Excellon (jen pokovené otvory)
tools = {}
for x, y, n, d, dr, r in pads:
    tools.setdefault(dr, []).append((x, y))
for x, y, n in vias:
    tools.setdefault(VIA_DRILL, []).append((x, y))
ex = ["M48", "METRIC,TZ", "FMAT,2"]
for i, dr in enumerate(sorted(tools), 1):
    ex.append(f"T{i}C{dr:.3f}")
ex += ["%", "G90", "G05"]
for i, dr in enumerate(sorted(tools), 1):
    ex.append(f"T{i}")
    ex += [f"X{x:.3f}Y{y:.3f}" for x, y in tools[dr]]
ex.append("M30")
open(os.path.join(GB, "robe-dmx-xlr3-PTH.drl"), "w").write("\n".join(ex) + "\n")

# ---------------------------------------------------------------- KiCad -----
def kicad():
    # KiCad Y osa jde dolů -> převrátit
    Y = lambda y: BOARD_H - y
    L = ['(kicad_pcb (version 20221018) (generator "gen.py")',
         '  (general (thickness 1.6))', '  (paper "A4")',
         '  (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (36 "B.SilkS" user "B.Silkscreen")'
         ' (37 "F.SilkS" user "F.Silkscreen") (38 "B.Mask" user) (39 "F.Mask" user) (44 "Edge.Cuts" user))',
         '  (setup (pad_to_mask_clearance 0.05))', '  (net 0 "")']
    for n in (1, 2, 3):
        L.append(f'  (net {n} "{NETNAME[n]}")')
    for ref, conn, d, dr in (("J1", J1, PAD_D, PAD_DRILL), ("J2", J2, PAD_D, PAD_DRILL), ("J3", J3, OUT_PAD_D, OUT_DRILL)):
        L.append(f'  (footprint "robe-dmx:{ref}" (layer "F.Cu") (at 0 0)')
        L.append(f'    (fp_text reference "{ref}" (at 0 0) (layer "F.SilkS") hide (effects (font (size 1 1) (thickness 0.15))))')
        for x, y, n in conn:
            pin = n
            L.append(f'    (pad "{pin}" thru_hole circle (at {x} {Y(y)}) (size {d} {d}) (drill {dr})'
                     f' (layers "*.Cu" "*.Mask") (net {n} "{NETNAME[n]}"))')
        L.append('  )')
    for l, x1, y1, x2, y2, n in tracks:
        L.append(f'  (segment (start {x1} {Y(y1)}) (end {x2} {Y(y2)}) (width {TRACK_W})'
                 f' (layer "{"F.Cu" if l == "T" else "B.Cu"}") (net {n}))')
    for x, y, n in vias:
        L.append(f'  (via (at {x} {Y(y)}) (size {VIA_D}) (drill {VIA_DRILL}) (layers "F.Cu" "B.Cu") (net {n}))')
    for a, b in zip(corners, corners[1:]):
        L.append(f'  (gr_line (start {a[0]} {Y(a[1])}) (end {b[0]} {Y(b[1])}) (layer "Edge.Cuts") (width 0.1))')
    for x, y, n in J1 + J2 + J3:
        L.append(f'  (gr_text "{n}" (at {x} {Y(y - 2.4)}) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))')
    L.append(')')
    open(os.path.join(HERE, "robe-dmx-xlr3.kicad_pcb"), "w").write("\n".join(L) + "\n")


kicad()

# --------------------------------------------------------------- náhled -----
try:
    from PIL import Image, ImageDraw
    S = 24
    for side, fname in (("T", "preview_top.png"), ("B", "preview_bottom.png")):
        im = Image.new("RGB", (int(BOARD_W * S), int(BOARD_H * S)), (20, 90, 40))
        d = ImageDraw.Draw(im)
        P = lambda x, y: (x * S, (BOARD_H - y) * S)
        for l, x1, y1, x2, y2, n in tracks:
            col = (200, 160, 60) if l == side else (110, 90, 40)
            d.line([P(x1, y1), P(x2, y2)], fill=col, width=int(TRACK_W * S))
        for x, y, n, dd, dr, r in pads:
            px, py = P(x, y)
            d.ellipse([px - dd / 2 * S, py - dd / 2 * S, px + dd / 2 * S, py + dd / 2 * S], fill=(220, 220, 220))
            d.ellipse([px - dr / 2 * S, py - dr / 2 * S, px + dr / 2 * S, py + dr / 2 * S], fill=(0, 0, 0))
            d.text((px - 3, py + dd / 2 * S + 2), str(n), fill=(255, 255, 255))
        for x, y, n in vias:
            px, py = P(x, y)
            d.ellipse([px - VIA_D / 2 * S, py - VIA_D / 2 * S, px + VIA_D / 2 * S, py + VIA_D / 2 * S], fill=(220, 220, 220))
        d.rectangle([0, 0, im.width - 1, im.height - 1], outline=(255, 255, 0))
        im.save(os.path.join(HERE, fname))
except ImportError:
    pass

with zipfile.ZipFile(os.path.join(HERE, "robe-dmx-xlr3-gerber.zip"), "w", zipfile.ZIP_DEFLATED) as z:
    for fn in sorted(os.listdir(GB)):
        z.write(os.path.join(GB, fn), fn)
print("OK")
