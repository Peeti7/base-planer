#!/usr/bin/env python3
"""
Erzeugt src/data/innenhof.json (Zone "Innenhof").

Aufruf (im Projektordner):  python tools/generate_innenhof.py

Koordinaten: Ursprung (0, 0) = Mitte der Torlinie im Süden, auf Bodenhöhe.
x: Westen = negativ, Osten = positiv.  z: Norden = negativ, Süden = positiv.
y: 0 = Bodenoberfläche (Gras/Pflaster), y = 1 ist die erste Lage darüber.
Alles ist symmetrisch um die Mittelachse x = 0.
"""
import json
import math
from pathlib import Path

AUSGABE = Path(__file__).resolve().parent.parent / "src" / "data" / "innenhof.json"

# Zonengrenzen: x -30..30 (61 breit), z -80..0 (81 lang)
GX, GZ, GB, GL = -30, -80, 61, 81


# ---------------------------------------------------------------- Palette
PALETTE = {
    "g": ("grass_block", "Rasen (Gelände)", "#4f7a3a", True),
    "A": ("andesite", "Andesit (Pflaster)", "#8a8a8a", False),
    "P": ("polished_andesite", "Polierter Andesit", "#b9b9b9", False),
    "R": ("red_concrete", "Roter Beton", "#a02020", False),
    "S": ("stone_bricks", "Steinziegel", "#5f636b", False),
    "T": ("stone_brick_stairs", "Steinziegeltreppe", "#7a808c", False),
    "W": ("stone_brick_wall", "Steinziegelmauer", "#8d939e", False),
    "K": ("bricks", "Ziegel (rot)", "#9a4b3b", False),
    "N": ("brick_stairs", "Ziegeltreppe (rot)", "#b8654f", False),
    "L": ("lantern", "Laterne", "#f2b03c", False),
    "H": ("oak_leaves", "Hecke (Eichenblätter)", "#2f6b2f", False),
    "E": ("oak_sapling", "Baum (Eichensetzling)", "#3fbf55", False),
    "F": ("red_banner", "Rotes Banner", "#ff5a4f", False),
}


def palette():
    return {
        z: {"block": b, "name": n, "farbe": f, **({"ohneMaterial": True} if o else {})}
        for z, (b, n, f, o) in PALETTE.items()
    }


def raster(x0, z0, breite, laenge, fn, y):
    """Zeilen von Norden nach Süden, Zeichen von Westen nach Osten."""
    return [
        "".join(fn(x, z, y) for x in range(x0, x0 + breite))
        for z in range(z0, z0 + laenge)
    ]


def ebenen(x0, z0, breite, laenge, fn, ys):
    return [{"y": y, "raster": raster(x0, z0, breite, laenge, fn, y)} for y in ys]


MAST = {1: "S", 2: "W", 3: "W", 4: "W", 5: "L"}


# ---------------------------------------------------------------- Teile
def gelaende(x, z, y):
    return "g"


def pflaster(x, z, y):
    ax = abs(x)
    # Sternplatz 41 x 41
    if -20 <= x <= 20 and -65 <= z <= -25:
        if ax == 20 or z in (-65, -25):
            return "P"
        return "A"
    # Hauptallee
    if -24 <= z <= -5 and ax <= 6:
        return "P" if ax == 6 else "A"
    if -4 <= z <= 0 and ax <= 5:
        return "P" if ax == 5 else "A"
    # Querweg
    if -15 <= z <= -13 and 7 <= ax <= 29:
        return "A"
    return "."


STERN_ROH = None  # wird unten gefüllt


def stern_raster():
    N = 41
    R = 19.5
    r = R * 0.40
    cx = (N - 1) / 2
    cy = (N - 1) / 2 - (-R + R * math.cos(math.radians(36))) / 2
    pts = []
    for i in range(10):
        a = math.radians(-90 + i * 36)
        rad = R if i % 2 == 0 else r
        pts.append((cx + rad * math.cos(a), cy + rad * math.sin(a)))

    def innen(x, y):
        c = False
        j = len(pts) - 1
        for i in range(len(pts)):
            xi, yi = pts[i]
            xj, yj = pts[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                c = not c
            j = i
        return c

    rows = ["".join("R" if innen(x, y) else "." for x in range(N)) for y in range(N)]
    assert all(z == z[::-1] for z in rows), "Stern nicht symmetrisch"
    return rows


def treppe(x, z, y):
    r = z + 80  # 0 = Nordkante, 14 = Südkante
    s = (14 - r) // 3  # Stufe 0..4 (0 = ganz im Süden)
    if y > s + 1:
        return "."
    mitte = abs(x) <= 2
    if y < s + 1:
        return "S"
    if (14 - r) % 3 == 0:  # vorderste Reihe der Stufe
        return "N" if mitte else "T"
    return "K" if mitte else "S"


def torhaus(x, z, y):
    ax = abs(x)
    if 6 <= ax <= 12 and -4 <= z <= -1:  # Türme
        if y <= 8:
            return "R" if y == 5 else "S"
        if y == 9:
            return "S" if (x + z) % 2 == 0 else "."
        return "."
    if ax <= 5 and -4 <= z <= -1 and y in (6, 7):  # Torbogen
        return "R" if y == 7 else "S"
    if ax == 9 and z == 0 and 3 <= y <= 6:  # Banner an der Turmwand
        return "F"
    if ax >= 13 and z in (-1, 0):
        if ax in (19, 20, 29, 30):  # Pfeiler 2x2
            if y <= 6:
                return "S"
            if y == 7 and ax in (20, 30) and z == 0:
                return "L"
            return "."
        if z == 0 and y <= 4:  # Mauer 1 dick, 4 hoch
            return "S"
    return "."


def mauer_fn(seite):
    def fn(x, z, y):
        aussen = (x == -30) if seite < 0 else (x == 30)
        pfeiler = any(p <= z <= p + 1 for p in range(-80, -9, 10))
        if pfeiler:
            if y <= 6:
                return "S"
            if y == 7 and not aussen and z % 10 == 0:
                return "L"
            return "."
        return "S" if aussen and y <= 4 else "."

    return fn


def allee(x, z, y):
    ax = abs(x)
    if not 7 <= ax <= 14:
        return "."
    if ax == 7 and z in (-23, -18, -10, -5):
        return MAST.get(y, ".")
    if -15 <= z <= -13:
        return "."
    if ax in (9, 13) and y in (1, 2):
        return "H"
    if ax == 11 and z in (-22, -18, -10, -6) and y == 1:
        return "E"
    return "."


def platzrand(x, z, y):
    if abs(x) == 21 and z in (-65, -55, -45, -35, -25):
        return MAST.get(y, ".")
    return "."


# ---------------------------------------------------------------- Zusammenbau
def teil(id_, name, phase, beschreibung, x0, z0, breite, laenge, fn, ys, schritte, y0=0):
    return {
        "id": id_,
        "name": name,
        "phase": phase,
        "beschreibung": beschreibung,
        "position": {"x": x0, "y": y0, "z": z0},
        "ebenen": ebenen(x0, z0, breite, laenge, fn, ys),
        "schritte": schritte,
    }


def mauer_teil(seite):
    name = "West" if seite < 0 else "Ost"
    x0 = -30 if seite < 0 else 29
    aussen = -30 if seite < 0 else 30
    innen = -29 if seite < 0 else 29
    return teil(
        f"mauer_{name.lower()}",
        f"Mauer {name}",
        5,
        f"Seitenmauer auf der {name}seite, 1 Block dick und 4 hoch, mit Pfeilern alle 10 Blöcke. "
        "Im Norden bleibt sie offen, dort schließt später der Palast an.",
        x0, -80, 2, 79, mauer_fn(seite), range(1, 8),
        [
            f"Mauerlinie abstecken: x = {aussen}, von z −80 bis z −2.",
            f"Pfeiler zuerst: alle 10 Blöcke, 2 × 2 groß (x {min(aussen, innen)} und {max(aussen, innen)}), "
            "bei z = −80, −70, −60, −50, −40, −30, −20 und −10 (je 2 Blöcke tief). Jeder Pfeiler ist 6 Blöcke hoch.",
            f"Auf jeden Pfeiler eine Laterne setzen, auf der Innenseite (x = {innen}), Ebene 7.",
            f"Zwischen den Pfeilern die Mauer bei x = {aussen} hochziehen: 1 Block dick, 4 Blöcke hoch, Steinziegel.",
            "Im Süden endet die Mauer am Eckpfeiler des Torhauses. Im Norden bleibt sie offen.",
        ],
        y0=0,
    )


def zone():
    teile = [
        teil(
            "gelaende", "Gelände & Rasen", 1,
            "Die Fläche des Innenhofs, 61 × 81 Blöcke, eben und mit Gras. "
            "Alles Weitere wird auf dieser Ebene (y = 0) gebaut. Der Ursprung (0, 0) liegt in der Mitte der Torlinie.",
            GX, GZ, GB, GL, gelaende, [0],
            [
                "Ursprung festlegen: Mittelpunkt der Torlinie im Süden. Mit einem Goldblock markieren und die Koordinaten notieren (F3).",
                "Von dort 30 Blöcke nach Westen und 30 nach Osten gehen und beide Ecken markieren. Das sind die Südecken der Mauer, 61 Blöcke breit.",
                "Von beiden Südecken je 80 Blöcke nach Norden gehen und die Nordecken markieren. Die Fläche ist 61 × 81 Blöcke groß.",
                "Kontrolle: Die Nordseite muss ebenfalls genau 61 Blöcke breit sein und der Südseite direkt gegenüberliegen.",
                "Die Fläche auf die Höhe der Torlinie planieren: Hügel abtragen, Löcher mit Erde füllen, mit Gras bedecken.",
            ],
        ),
        teil(
            "pflaster", "Wege & Pflaster", 2,
            "Andesit-Pflaster für den Sternplatz, die Hauptallee und den Querweg. "
            "Ränder aus poliertem Andesit. Andesit gibt es beim Abbauen massenhaft, polierter Andesit wird gecraftet (2 × 2 Andesit).",
            GX, GZ, GB, GL, pflaster, [0],
            [
                "Mittelachse (x = 0) vom Tor nach Norden bis zur Treppe mit Fackeln markieren.",
                "Sternplatz abstecken: 41 × 41 Blöcke, x −20 bis 20, z −65 bis −25. Mit Andesit füllen.",
                "Den äußersten 1-Block-Ring des Platzes aus poliertem Andesit legen.",
                "Hauptallee: 13 Blöcke breit (x −6 bis 6) vom Platz (z −24) bis zum Tor (z −5). Im Torbereich (z −4 bis 0) nur 11 breit (x −5 bis 5). Andesit.",
                "Die Randlinien der Allee (x = ±6, im Tor x = ±5) aus poliertem Andesit legen.",
                "Querweg: 3 Blöcke breit bei z −15 bis −13, von x ±7 bis x ±29. Er führt später zu Wohnblöcken und Farmen.",
            ],
        ),
        teil(
            "stern", "Roter Stern", 2,
            "Pixel-Stern auf dem Sternplatz. Die obere Spitze zeigt nach Norden zum Palast. "
            "Die Mittelachse x = 0 ist die Symmetrieachse.",
            -20, -65, 41, 41, None, [],
            [
                "Der Platz muss gepflastert sein (Teil Wege & Pflaster). Mittelachse x = 0 ist markiert.",
                "Obere linke Ecke des Sternfelds finden: 20 Blöcke westlich der Achse, 65 Blöcke nördlich der Torlinie (x −20, z −65).",
                "Die Mittelachse (Spalte 21 im Raster, von Westen gezählt) vom Nord- bis Südrand des Sterns mit rotem Beton als Linie legen.",
                "Den Stern Reihe für Reihe von Norden nach Süden legen. Die oberste Zeile mit rotem Beton ist die Spitze.",
                "Pro Reihe erst die äußeren Blöcke setzen, dann zur Mitte hin füllen. Von der Achse nach links und rechts immer gleich viele Blöcke zählen.",
            ],
        ),
        teil(
            "platzrand", "Platzlaternen", 2,
            "Zehn Laternenmasten außen am Sternplatz, je fünf links (x = −21) und rechts (x = 21).",
            -21, -65, 43, 41, platzrand, range(1, 6),
            [
                "Mastpositionen markieren: x = ±21, z = −65, −55, −45, −35, −25 (10 Masten).",
                "Mast bauen: 1 Steinziegel, darauf 3 Steinziegelmauern, oben eine Laterne (Ebenen 1 bis 5).",
            ],
        ),
        teil(
            "treppe", "Palasttreppe", 3,
            "Breite Treppe mit rotem Mittelstreifen vom Sternplatz hinauf zum späteren Palast. "
            "5 Stufen, je 3 Blöcke tief. Die oberste Stufe liegt 5 Blöcke über dem Platz.",
            -10, -80, 21, 15, treppe, range(1, 6),
            [
                "Fläche abstecken: 21 Blöcke breit (x −10 bis 10) und 15 Blöcke tief (z −80 bis −66). Die Südkante grenzt an den Sternplatz.",
                "Die Treppe hat 5 Stufen, je 3 Blöcke tief. Stufe 1 liegt im Süden (z −68 bis −66), Stufe 5 im Norden (z −80 bis −78).",
                "Stufe n wird auf Ebene n gebaut. Alles darunter ist nicht sichtbar und darf mit Bruchstein oder Erde gefüllt werden. Nur die Außenflächen und die Oberseite bestehen aus Steinziegeln. Das spart viele Stacks.",
                "Pro Stufe: vorderste Reihe Treppenblöcke, die zwei Reihen dahinter volle Blöcke. Treppenblöcke setzt du mit Blick nach Norden, damit sie nach Norden aufsteigen.",
                "Mittelstreifen: 5 Blöcke breit (x −2 bis 2) aus roten Ziegeln und roten Ziegeltreppen statt Steinziegeln. So entsteht der rote Teppich.",
                "Oben (Ebene 5) schließt später der Palast an. Die Oberkante liegt 5 Blöcke über dem Platz.",
            ],
        ),
        teil(
            "allee", "Allee", 4,
            "Hecken, Bäume und Laternenmasten links und rechts der Hauptallee. "
            "Selbst gesetzte Blätter verfallen nicht. Bei z −15 bis −13 bleibt der Querweg frei.",
            -14, -24, 29, 21, allee, range(1, 6),
            [
                "Mastpositionen markieren: x = ±7, z = −23, −18, −10 und −5 (8 Masten).",
                "Mast bauen: 1 Steinziegel, darauf 3 Steinziegelmauern, oben eine Laterne (Ebenen 1 bis 5).",
                "Hecken: Eichenblätter in zwei Reihen je Seite, bei x = ±9 und x = ±13, 2 Blöcke hoch, von z −24 bis −4. Beim Querweg (z −15 bis −13) eine Lücke lassen.",
                "Bäume: Eichensetzlinge bei x = ±11 und z = −22, −18, −10, −6 pflanzen und mit Knochenmehl wachsen lassen.",
            ],
        ),
        mauer_teil(-1),
        mauer_teil(1),
        teil(
            "torhaus", "Torhaus", 5,
            "Zwei Türme mit rotem Band und Zinnen, ein Torbogen aus Steinziegel und rotem Beton, "
            "rote Banner und die Südmauer mit Pfeilern. Die Durchfahrt ist 11 breit und 5 hoch.",
            GX, -4, GB, 5, torhaus, range(1, 10),
            [
                "Turmfundamente abstecken: zwei Türme, je 7 breit (x ±6 bis ±12) und 4 tief (z −4 bis −1).",
                "Türme 8 Blöcke hoch aus Steinziegeln hochziehen. Das Innere ist nicht sichtbar und darf aus Bruchstein bestehen. Auf Ebene 5 eine Lage rundum aus rotem Beton (rotes Band).",
                "Auf Ebene 9 Zinnen: nur jeden zweiten Block setzen, im Schachbrettmuster.",
                "Torbogen: zwischen den Türmen (x −5 bis 5) auf Ebene 6 Steinziegel, auf Ebene 7 roter Beton, 4 Blöcke tief. Darunter bleibt die Durchfahrt 5 Blöcke hoch.",
                "Südmauer bei z = 0 von x ±13 bis ±30, 1 Block dick und 4 hoch. Pfeiler (2 × 2, 6 hoch, mit Laterne) bei x ±19/±20 und an den Ecken bei x ±29/±30.",
                "Rote Banner: je 4 Stück übereinander an der Südseite der Türme bei x = ±9 (Ebenen 3 bis 6), an die Turmwand setzen.",
            ],
        ),
    ]
    # Stern: Raster direkt aus der Berechnung
    for t in teile:
        if t["id"] == "stern":
            t["ebenen"] = [{"y": 0, "raster": stern_raster()}]

    phasen = [
        {"nr": 1, "name": "Vermessen & Planieren",
         "beschreibung": "Fläche abstecken, Ursprung setzen, Gelände eben machen. Ohne saubere Achse passt später nichts zusammen."},
        {"nr": 2, "name": "Wege & Sternplatz",
         "beschreibung": "Pflaster, roter Stern und Platzlaternen. Das erste Ergebnis, das sofort nach etwas aussieht."},
        {"nr": 3, "name": "Palasttreppe",
         "beschreibung": "Breite Treppe mit rotem Mittelstreifen zum späteren Palast."},
        {"nr": 4, "name": "Allee",
         "beschreibung": "Hecken, Bäume und Laternenmasten entlang der Hauptallee."},
        {"nr": 5, "name": "Mauer & Torhaus",
         "beschreibung": "Umfassungsmauer mit Pfeilern und das Torhaus mit roten Bannern. Größter Materialblock, deshalb zuletzt."},
    ]

    return {
        "id": "innenhof",
        "name": "Innenhof",
        "beschreibung": (
            "Platz zwischen Tor und Palasttreppe, 61 × 81 Blöcke. Ursprung (0, 0) ist die Mitte der Torlinie im Süden. "
            "Norden ist −z, Westen ist −x. Alles ist symmetrisch um die Mittelachse x = 0."
        ),
        "grenzen": {"x": GX, "z": GZ, "breite": GB, "laenge": GL},
        "phasen": phasen,
        "teile": teile,
    }


def pruefen(z):
    """Formate, Grenzen und Palette prüfen."""
    for t in z["teile"]:
        for e in t["ebenen"]:
            breiten = {len(r) for r in e["raster"]}
            assert len(breiten) == 1, f"{t['id']} y={e['y']}: ungleiche Zeilenlängen"
            for r in e["raster"]:
                for c in r:
                    assert c == "." or c in PALETTE, f"{t['id']}: unbekanntes Zeichen {c!r}"
        b = breiten.pop()
        l = len(t["ebenen"][0]["raster"])
        p = t["position"]
        assert GX <= p["x"] and p["x"] + b - 1 <= GX + GB - 1, f"{t['id']}: x außerhalb"
        assert GZ <= p["z"] and p["z"] + l - 1 <= GZ + GL - 1, f"{t['id']}: z außerhalb"


if __name__ == "__main__":
    projekt = {"name": "Kommunisten-Base", "palette": palette(), "zonen": [zone()]}
    pruefen(projekt["zonen"][0])
    AUSGABE.parent.mkdir(parents=True, exist_ok=True)
    AUSGABE.write_text(json.dumps(projekt, indent=1, ensure_ascii=False), encoding="utf-8")
    print("geschrieben:", AUSGABE)
