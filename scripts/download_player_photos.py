#!/usr/bin/env python3
"""
Scarica le foto dei calciatori di Serie A da media.api-sports.io (id dal file
Quotazioni_Fantacalcio) e le salva in public/seria_A/{squadra}/{slug}.webp
con lo stesso naming di link-images.ts (nome-cognome senza data/id),
così il match nome->file funziona al primo colpo.

Uso:
    python3 scripts/download_player_photos.py [--teams Atalanta,Monza] [--dry-run]
"""
import argparse
import os
import re
import sys
import time
import urllib.request
from xml.etree import ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
XLSX = os.path.join(ROOT, "public", "seria_A", "Quotazioni_Fantacalcio_Stagione_2026_27.xlsx")
OUT = os.path.join(ROOT, "public", "seria_A")

NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"


def slugify(text):
    """'Martinez Jo.' -> 'martinez-jo'; 'De Roon' -> 'de-roon'. Uguale a link-images.ts."""
    t = text.lower().strip()
    t = re.sub(r"[^a-z0-9\s-]", "", t)  # toglie apostrofi, punti, accenti non ascii
    t = re.sub(r"\s+", "-", t)
    return t.strip("-")


def read_players():
    import zipfile
    z = zipfile.ZipFile(XLSX)
    shared = []
    root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    for si in root.findall(f"{{{NS}}}si"):
        shared.append("".join(t.text or "" for t in si.iter(f"{{{NS}}}t")))
    players = []
    for sheet in [f"sheet{i}" for i in range(1, 7)]:
        r = ET.fromstring(z.read(f"xl/worksheets/{sheet}.xml"))
        for row in r.iter(f"{{{NS}}}row"):
            cells = []
            for c in row:
                v = c.find(f"{{{NS}}}v")
                val = v.text if v is not None else ""
                if c.get("t") == "s" and val != "":
                    val = shared[int(val)]
                cells.append(val)
            if len(cells) >= 5 and cells[0].isdigit() and cells[3].strip() and cells[4].strip():
                players.append({"id": cells[0], "name": cells[3].strip(), "team": cells[4].strip()})
    return players


def download(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read()
    if len(data) < 1000 or b"<Error>" in data[:200]:
        return False
    with open(dest, "wb") as f:
        f.write(data)
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--teams", help="es. Atalanta,Monza (default: tutte)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    wanted = set(t.strip() for t in args.teams.split(",")) if args.teams else None
    players = read_players()
    print(f"Giocatori nel foglio: {len(players)}")

    ok = skip = fail = 0
    for p in players:
        if wanted and p["team"] not in wanted:
            continue
        team_slug = slugify(p["team"])  # 'Hellas Verona' -> 'hellas-verona', 'Inter' -> 'inter'
        player_slug = slugify(p["name"])
        out_dir = os.path.join(OUT, team_slug)
        dest = os.path.join(out_dir, f"{player_slug}.webp")
        os.makedirs(out_dir, exist_ok=True)
        url = f"https://media.api-sports.io/football/players/{p['id']}.png"
        if args.dry_run:
            print(f"[DRY] {p['team']} -> {player_slug}.webp  ({url})")
            continue
        if os.path.exists(dest):
            skip += 1
            continue
        if download(url, dest):
            ok += 1
            print(f"[OK] {p['team']:12s} {player_slug:35s} {p['id']}")
        else:
            fail += 1
            print(f"[FAIL] {p['team']:12s} {player_slug:35s} {p['id']}")
            try:
                os.remove(dest)
            except OSError:
                pass
        time.sleep(0.15)

    print(f"\nFatto: {ok} scaricate, {skip} gia' presenti, {fail} fallite")


if __name__ == "__main__":
    main()
