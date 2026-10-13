"""Generate supabase/seed SQL from the Obsidian vault deck notes.

Usage: python3 scripts/seed_from_vault.py "<vault>/04 Cards" > supabase/migrations/..._seed.sql
"""
import re
import sys
from pathlib import Path

DECKS = {"TK": "Tank Deck.md", "AS": "Assassin Deck.md", "MG": "Mage Deck.md", "BR": "Bruiser Deck.md"}


def q(s):
    return "'" + s.replace("'", "''") + "'"


def parse(path, cid):
    rows = []
    for line in Path(path).read_text().splitlines():
        if not line.startswith(f"| {cid}-"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if len(cells) == 6:
            card_id, name, line_, typ, dmg, effect = cells
        else:
            card_id, name, typ, dmg, effect = cells
            line_ = ""
        copies = 1
        m = re.search(r"\s+x(\d)$", name)
        if m:
            copies = int(m.group(1))
            name = name[: m.start()]
        source = ""
        m = re.search(r"\s*\(([^)]*)\)$", name)
        if m:
            source = m.group(1)
            name = name[: m.start()]
        m = re.match(r"(–|\d+)\s*\((\d+)(\??)\)", dmg)
        dmg_tct = None if m.group(1) == "–" else int(m.group(1))
        rows.append(dict(id=card_id, name=name, source=source, line=line_, type=typ,
                         dmg=int(m.group(2)), dmg_tct=dmg_tct, tentative=m.group(3) == "?",
                         effect="" if effect == "ไม่มี" else effect, copies=copies))
    return rows


def main(cards_dir):
    out = ["-- Seed generated from the Obsidian vault (04 Cards) on 2026-10-13", "insert into public.cards",
           "  (id, champion_id, name, source, line, type, dmg, dmg_tct, dmg_tentative, effect, copies, sort_order)", "values"]
    values = []
    total = 0
    for cid, fname in DECKS.items():
        rows = parse(Path(cards_dir) / fname, cid)
        copies = sum(r["copies"] for r in rows)
        assert copies == 15, f"{cid} deck has {copies} cards"
        total += len(rows)
        for i, r in enumerate(rows):
            values.append("  ({}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {})".format(
                q(r["id"]), q(cid), q(r["name"]), q(r["source"]), q(r["line"]), q(r["type"]), r["dmg"],
                "null" if r["dmg_tct"] is None else r["dmg_tct"], "true" if r["tentative"] else "false",
                q(r["effect"]), r["copies"], i + 1))
    out.append(",\n".join(values) + ";")
    sys.stderr.write(f"{total} card ids\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1])
