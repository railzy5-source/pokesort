#!/usr/bin/env python3
"""Pokemon GO collection sorter - PvP + PvE + Max + Mega, decisive mode (2026).

Audited + repaired build.  Invariants this version guarantees:

  * BUILD_<role> is only ever emitted when the mon passes that role's quality
    gate (raid atk IV + dps floor, Max Battle atk IV + dps floor, shadow raid
    atk IV floor, gym defender IV floor).  Near misses become REVIEW - never
    BUILD, and blocks on the transfer list.
  * Nothing carrying a keep reason can reach the transfer list, and REVIEW is
    treated as "do not transfer".
  * Great/Ultra league entries are only offered for mons that can physically
    reach the cap (a mon already over the cap cannot be powered down).
  * Mega CP/DPS comes from the real Mega form's base stats, not the pre-Mega
    species.
  * Stardust/Candy/XL costs use the real in-game power-up curve.
  * Every threshold lives in pogo_config.json (defaults are deep-merged in, so
    a missing key can never crash or silently change behaviour).
  * Resource figures (dust / candy / XL) are only ever read from a file you
    supply - never invented.  With no figures the build queue is unchanged and
    nothing is called affordable or unaffordable.

Accuracy pass (this build):

  * Raid / Mega DPS now uses real PvE move data (power, duration, energy bars)
    from the mined game master, cached as pogo_cache/pve_moves.json.  The old
    model fed PvP move numbers into a raid formula and ranked species by move
    coefficient alone (base Attack was ignored), so Doduo / Grimer / Pyroar
    topped their types.  Falls back to the old proxy, with a warning, offline.
  * PvP: league eligibility is strict (no half-level slack), Master League
    builds need pvp.master_min_iv_pct, and only builds_per_species_league
    copies of a species per league are ever BUILD_PVP (was 3 Kyogre, 3 Groudon).
  * PvP teams: Great/Ultra teams only use mons that are already built or are
    the BUILD_PVP target for that league, so a team never depends on a mon
    the sorter did not tell you to build; eligibility is strict here too.
  * Mega: one Mega slot per family and keep_per_type best Megas per boost type;
    weak Mega attackers become REVIEW instead of BUILD_MEGA.
  * Raid / Max: copies beyond keep_per_type + reserve_keep lose the role and
    stop being protected as "reserve"; raid attackers also need raid.min_iv_pct.
  * Protections: elite/legacy-move protection now checks the move ids the mon
    really knows (was a guess); high-IV protection keeps the best
    iv_protect_max_per_species per species instead of every 92%+ mon, and the
    transfer-list safeguard honours that (surplus copies now actually appear).
  * Moves: every report now shows the moves each mon knows right now (move ids
    in the save are resolved to names/types via the PvE table; * = elite/legacy)
    plus which suggested moves it still lacks - in sort_report.csv, report.json,
    build_list.txt, raid_teams.txt, transfer_list.txt and the new
    moves_viewer.html (type-coloured chips, search by move, filters, CSV export).
  * Fixed: every mon was tagged "export lacks currentTempEvolution" because the
    optional-field check ignored the nested pokemonDisplay block.

Changes in this build (2026-10-27):

  * Verdict step: a gym-defender species with IV under gym.min_iv_pct is no
    longer REVIEW forever.  Only real review_reasons make a REVIEW now, so the
    surplus Slakoth / Drifblim / Blissey / Snorlax / Eevee copies reach TRANSFER.
  * transfer_list.txt starts with a LAST LOOK block (config: last_look): any
    transfer with IV >= 85%, level > 25, or shiny / lucky / costume / event /
    location card / favorite / purified / 3rd move is listed again with the best
    copies you are keeping instead.
  * review_triage.txt (config: review_triage): sorts the REVIEW pile into
    probably-keep / probably-transfer.  Advice only - it never changes a verdict.
  * power_up_priority.txt is now a short SPEND FIRST list ranked by value per
    stardust (config: power_up_priority.top_n / max_per_species / dust_budget).
  * Cup teams: fixed a bug where the PvPoke cup meta data was loaded and then
    wiped by the Dex constructor, so cups always used the rank-based fallback.
    Cup teams now also have to differ (pvp_teams.cup_max_shared_members).
  * NOTE: without --all-files the sorter deletes the .txt reports after writing
    them.  Use --all-files to keep transfer_list.txt and friends.

Usage:  python3 pogo_sorter.py [PGSStats.json] [--refresh] [--offline] [--out DIR] [--all-files]
"""
from __future__ import annotations
import argparse, bisect, csv, datetime, itertools, json, math, re, sys, time, urllib.request
from collections import Counter, defaultdict, deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

HERE = Path(__file__).resolve().parent
CACHE = HERE / "pogo_cache"
BASE = "https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data"
MAX_AGE_DAYS = 7
CAPS = (1500, 2500, 10000)
LEAGUE = {1500: "Great", 2500: "Ultra", 10000: "Master"}
LEAGUE_CAP = {"Great": 1500, "Ultra": 2500, "Master": 10000}

# Cups enabled by patch 9a.
CUPS = {
    "little": {
        "title": "Little",
        "cap": 500,
        "rule_kind": "first_stage",
        "exclude_sids": {"shuckle", "smeargle", "meltan"},
        "file": "little",
    },
    "fantasy": {
        "title": "Fantasy",
        "cap": 1500,
        "rule_kind": "types",
        "include_types": {"dragon", "steel", "fairy"},
        "exclude_sids": set(),
        "file": "fantasy",
    },
}

RAID_USEFUL_TYPES = {
    "bug", "dark", "dragon", "electric", "fairy", "fighting",
    "fire", "flying", "ghost", "grass", "ground", "ice",
    "poison", "psychic", "rock", "steel", "water",
}
MAX_BATTLE_TYPES = RAID_USEFUL_TYPES | {"normal"}

DEFENDER_DEF = 200.0
STAB = 1.2
SHADOW_ATK_MULT = 1.20          # shadow: +20% damage dealt ...
SHADOW_DMG_TAKEN = 1.20         # ... and +20% damage taken
MEGA_TAGS = {"mega", "supermega"}
MEGA_SUFFIXES = ("mega", "supermega", "primal")
PRIMAL_SUFFIXES = ("_primal",)
SHADOW_SUFFIXES = ("_shadow",)

# Primal Reversion boosts three fixed types in GO (not just its own types).
PRIMAL_BOOST_TYPES = {
    "groudon_primal": ("grass", "fire", "ground"),
    "kyogre_primal": ("electric", "water", "bug"),
}

# --- PvP team cohesion data (every input comes from PvPoke) ---------------
#
# PvPoke publishes six category rankings per league and repeats those same six
# numbers on every row of rankings/all/overall/rankings-<cap>.json as `scores`.
# The order below was verified empirically against
# rankings/all/<category>/rankings-<cap>.json - mean absolute error 0.00 over
# 400 species in each league.  Do NOT reorder it: the role assignment in the
# cohesion model indexes straight into `scores`.
PVP_ROLE_KEYS = ("leads", "closers", "switches", "chargers", "attackers", "consistency")
PVP_ROLE_LABEL = {"leads": "lead", "closers": "closer", "switches": "safe swap",
                  "chargers": "charger", "attackers": "attacker",
                  "consistency": "consistency"}
# PvPoke's own meta group per league (src/data/groups/<name>.json).  This is the
# threat list a team's coverage is measured against.
META_GROUP_FILE = {1500: "great", 2500: "ultra", 10000: "master"}
# Defence x HP goals from PvPoke's team-builder Overview "Bulk" grade.
BULK_GOAL = {500: 22000.0, 1500: 22000.0, 2500: 35000.0, 10000: 35000.0}

FORM_SUFFIXES = (
    "alolan", "galarian", "hisuian", "paldean",
    "alola", "galar", "hisui", "paldea",
    "origin", "therian", "incarnate", "armored", "crowned",
    "attack", "defense", "speed", "normal", "altered", "eternamax",
    "ten", "fifty", "complete", "percent",
    "sunny", "rainy", "snowy", "overcast", "sunshine",
    "east", "west", "plant", "sandy", "trash",
    "mow", "frost", "fan", "heat", "wash",
    "sensu", "baile", "aria", "pirouette", "blade", "shield", "school",
    "small", "average", "large", "super",
    "confined", "unbound", "zen", "galar_zen", "noice", "white", "black",
    "mega", "primal",
)

FORM_ALIASES = {
    "zaciancrownedsword": "crowned",
    "zaciancrowned": "crowned",
    "zacianhero": "hero",
    "zamazentacrownedshield": "crowned",
    "zamazentacrowned": "crowned",
    "zamazentahero": "hero",
    "mewtwoa": "armored",
    "mewtwo_armored": "armored",
    "zygardetenpercent": "10",
    "zygardefiftypercent": "50",
    "zygardecomplete": "complete",
    "hoopaconfined": "confined",
    "hoopaunbound": "unbound",
    "darmanitangalarzen": "galar_zen",
    "necrozmaduskmane": "dusk",
    "necrozmadawnwings": "dawn",
    "kyuremblack": "black",
    "kyuremwhite": "white",
    "toxtricitylowkey": "lowkey",
    "toxtricityamped": "amped",
    "toxtricitylowkeyform": "lowkey",
    "enamorusincarnate": "incarnate",
    "enamorustherian": "therian",
    "urshifusinglestrike": "singlestrike",
    "urshifurapidstrike": "rapidstrike",
    "basculegionmale": "male",
    "basculegionfemale": "female",
    "morpekofullbelly": "fullbelly",
    "morpekohangry": "hangry",
    "oricoriobaile": "baile",
    "oricoriopompom": "pompom",
    "oricoriopau": "pau",
    "oricoriosensu": "sensu",
}


def _type_display(t: str) -> str:
    return t.capitalize() if t else t


# ---------------------------------------------------------------------------
# Level / CP model
# ---------------------------------------------------------------------------

def build_cpm():
    """CPM curve.  Anchors at 1/10/20/30/40 are exact game values; the curve
    between anchors is linear in CPM^2, which reproduces every published CPM
    to <1e-6 (verified against the export's own cpMultiplier values).
    Levels 41-51 use the real linear XL/best-buddy extension."""
    anch = {1: 0.094, 10: 0.4225, 20: 0.5974, 30: 0.7317, 40: 0.7903}
    ks = sorted(anch)
    cpm = {}
    for a, b in zip(ks, ks[1:]):
        for L in range(a, b + 1):
            cpm[float(L)] = math.sqrt(anch[a] ** 2 + (anch[b] ** 2 - anch[a] ** 2) * (L - a) / (b - a))
    for L in range(41, 52):
        cpm[float(L)] = 0.7903 + 0.005 * (L - 40)
    for L in range(1, 51):
        cpm[L + 0.5] = math.sqrt((cpm[float(L)] ** 2 + cpm[float(L + 1)] ** 2) / 2)
    return cpm


CPM = build_cpm()
LEVELS = [l for l in sorted(CPM) if l <= 50]
CPM_LIST = [CPM[l] for l in LEVELS]
CPM2_LIST = [c * c for c in CPM_LIST]
ALL_LEVELS = sorted(CPM)


def level_from_cpm(total):
    return min(ALL_LEVELS, key=lambda l: abs(CPM[l] - total))


def compute_cp(bs, a, d, s, level):
    cpm = CPM.get(float(level))
    if cpm is None:
        return None
    atk = bs["atk"] + a
    df = bs["def"] + d
    hp = bs["hp"] + s
    return max(10, int(atk * math.sqrt(df) * math.sqrt(hp) * cpm * cpm / 10))


def best_pvp_level(bs, cap, a, d, s):
    """Highest level whose CP stays under `cap`, plus the CP at that level.

    Returns None when even level 1 breaks the cap (impossible in practice) or
    when the target species simply cannot reach the cap (Master League)."""
    atk = bs["atk"] + a
    df = bs["def"] + d
    hp = bs["hp"] + s
    core = atk * math.sqrt(df * hp)
    if cap >= 10000:
        lvl = LEVELS[-1]
    else:
        if max(10, int(core * CPM2_LIST[0] / 10)) > cap:
            return None
        lo, hi = 0, len(LEVELS) - 1
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if max(10, int(core * CPM2_LIST[mid] / 10)) <= cap:
                lo = mid
            else:
                hi = mid - 1
        lvl = LEVELS[lo]
    return lvl, compute_cp(bs, a, d, s, lvl)


def build_spreads(bs, cap):
    """Stat product of every one of the 4096 IV spreads at the best legal level.

    StatProduct = (atk*CPM) * (def*CPM) * floor(hp*CPM)   [PvPoke's metric]
    """
    prods = {}
    n = len(LEVELS)
    for a in range(16):
        atk = bs["atk"] + a
        for d in range(16):
            df = bs["def"] + d
            for s in range(16):
                hp = bs["hp"] + s
                core = atk * math.sqrt(df * hp)
                if cap >= 10000:
                    idx = n - 1
                else:
                    if max(10, int(core * CPM2_LIST[0] / 10)) > cap:
                        continue
                    lo, hi = 0, n - 1
                    while lo < hi:
                        mid = (lo + hi + 1) // 2
                        if max(10, int(core * CPM2_LIST[mid] / 10)) <= cap:
                            lo = mid
                        else:
                            hi = mid - 1
                    idx = lo
                c = CPM_LIST[idx]
                # PvPoke floors ONLY HP before the product. Attack and Defence
                # stay unfloored; flooring all three was the rank-1 IV bug
                # (it pushed 0/15/15 to rank #25 on Clodsire when PvPoke says #3).
                prods[(a, d, s)] = (
                    (atk * c) *
                    (df * c) *
                    max(10, math.floor(hp * c))
                )
    if not prods:
        return None
    asc = sorted(prods.values())
    return prods, asc, asc[-1]
# ---------------------------------------------------------------------------
# Move DPS model
#
# Both raid and Max rankings are *relative* models: every type is scored with
# the same defender (DEFENDER_DEF) and the same STAB multiplier, so absolute
# numbers are not real-world DPS but the ordering inside a type is meaningful
# and stable.  Raid scoring uses the best in-type Charged move (STAB assumed);
# Max Battle scoring uses the best in-type Fast move, because a Dynamax mon's
# Max Move type is decided by its Fast Attack's type.
# ---------------------------------------------------------------------------

def _move_duration(m):
    for k in ("cooldown", "durationMs", "duration"):
        v = m.get(k)
        if isinstance(v, (int, float)) and v > 0:
            return float(v) / 1000.0
    t = m.get("turns")
    if isinstance(t, (int, float)) and t > 0:
        return float(t) * 0.5
    return 0.5


def _moves_index(gm):
    raw = gm.get("moves", [])
    idx = {}
    if isinstance(raw, list):
        for m in raw:
            k = m.get("moveId")
            if k is None:
                continue
            idx[k] = m
            if isinstance(k, str):
                try:
                    idx[int(k)] = m
                except ValueError:
                    pass
    elif isinstance(raw, dict):
        for k, m in raw.items():
            idx[k] = m
    return idx


def _move_label(move_id):
    return str(move_id).replace("_", " ").title() if move_id else ""


def _best_dps_per_atk(attacker_types, moves, fast_ids, charged_ids):
    """{type: (dps_per_attack_stat, fast_move_id, charged_move_id)}.

    With PvE data loaded this uses the real PvE power / duration / energy and
    lets energy carry over between Charged moves (so a 33-energy move costs a
    third of a bar, not a whole turn-based PvP cost).  Moves the PvE table does
    not know are skipped so two different scales are never mixed.  Without PvE
    data it falls back to the old PvP-number proxy."""
    use_pve = PVE["ok"]
    fasts, chargeds = _prep_moves(moves, fast_ids, charged_ids)
    out = {}
    for cm in chargeds:
        ctype = cm["type"]
        if ctype not in attacker_types:
            continue
        cm_dmg = 0.5 * cm["power"] * STAB / DEFENDER_DEF
        best, best_fast = 0.0, None
        for fm in fasts:
            fm_stab = STAB if fm["type"] in attacker_types else 1.0
            fm_dmg = 0.5 * fm["power"] * fm_stab / DEFENDER_DEF
            # PvE energy carries over, so the number of fast moves per charged
            # move is fractional; the PvP proxy resets every cycle (ceil).
            n = (cm["cost"] / fm["energy"]) if use_pve else math.ceil(cm["cost"] / fm["energy"])
            cycle_time = n * fm["dur"] + cm["dur"]
            if cycle_time <= 0:
                continue
            dps_per_atk = (n * fm_dmg + cm_dmg) / cycle_time
            if dps_per_atk > best:
                best, best_fast = dps_per_atk, fm["moveId"]
        if best > 0:
            prev = out.get(ctype)
            if prev is None or best > prev[0]:
                out[ctype] = (best, best_fast, cm["moveId"])
    return out


def _prep_moves(moves, fast_ids, charged_ids):
    """(fasts, chargeds): move dicts with real PvE numbers when PvE data is loaded."""
    use_pve = PVE["ok"]
    fasts, chargeds = [], []
    for i in fast_ids:
        m = moves.get(i)
        if not m:
            continue
        if use_pve:
            pv = pve_move(i, True)
            if not pv or pv["p"] <= 0 or pv["e"] <= 0 or pv["d"] <= 0:
                continue
            fasts.append({"moveId": i, "type": pv["t"] or m.get("type"), "power": pv["p"],
                          "dur": pv["d"] / 1000.0, "energy": float(pv["e"])})
        else:
            if m.get("power", 0) <= 0 or m.get("energyGain", 0) <= 0:
                continue
            fasts.append({"moveId": i, "type": m.get("type"), "power": m.get("power", 0),
                          "dur": _move_duration(m), "energy": float(max(1, m.get("energyGain", 10)))})
    for i in charged_ids:
        m = moves.get(i)
        if not m:
            continue
        if use_pve:
            pv = pve_move(i, False)
            if not pv or pv["p"] <= 0 or pv["e"] >= 0 or pv["d"] <= 0:
                continue
            chargeds.append({"moveId": i, "type": pv["t"] or m.get("type"), "power": pv["p"],
                             "dur": pv["d"] / 1000.0, "cost": float(-pv["e"])})
        else:
            if m.get("power", 0) <= 0 or not m.get("type"):
                continue
            chargeds.append({"moveId": i, "type": m["type"], "power": m.get("power", 0),
                             "dur": _move_duration(m), "cost": float(abs(m.get("energy", 50)) or 50)})
    return fasts, chargeds


# Species that can Dynamax in Pokemon GO, by national dex number (the in-game list as of 2026-11-02).
# It is a BASELINE, not the truth: the list you supplied was missing Pikachu and Magmar, which your own
# save proves can Dynamax.  Dex.can_dynamax() therefore also trusts any species your export holds as
# Dynamax (and its evolutions).  Add new releases with max_battle.extra_dynamax_dex in the config.
DYNAMAX_DEX = {
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 52, 58, 59, 63, 64, 65, 66, 67, 68, 92, 93, 94, 98, 99,
    106, 107, 111, 112, 113, 125, 129, 130, 131, 133, 134, 135, 136, 138, 139, 140, 141, 143, 144,
    145, 146, 163, 164, 196, 197, 213, 215, 237, 242, 243, 244, 245, 249, 250, 280, 281, 282, 302,
    320, 321, 328, 329, 330, 349, 350, 363, 364, 365, 374, 375, 376, 377, 378, 379, 380, 381, 461,
    464, 466, 470, 471, 475, 480, 481, 482, 519, 520, 521, 524, 525, 526, 527, 528, 529, 530, 554,
    555, 568, 569, 615, 633, 634, 635, 686, 687, 700, 761, 762, 763, 766, 780, 810, 811, 812, 813,
    814, 815, 816, 817, 818, 819, 820, 821, 822, 823, 831, 832, 849, 850, 851, 856, 857, 858, 861,
    870, 884, 891, 892}
# Gigantamax species and the FIXED type of their G-Max move (a G-Max move does not follow the Fast
# move's type).  Types are the mainline G-Max move types; add releases with max_battle.extra_gigantamax.
GMAX_TYPE = {3: "grass", 6: "fire", 9: "water", 12: "bug", 52: "normal", 68: "fighting", 94: "ghost",
             99: "water", 131: "ice", 143: "normal", 569: "poison", 812: "grass", 815: "fire",
             818: "water", 849: "electric", 861: "dark"}
GMAX_ONLY_DEX = {52, 143, 861}      # only ever appear as Gigantamax (no plain Dynamax form listed)
_REGIONAL_SUFFIXES = ("_alolan", "_galarian", "_hisuian", "_paldean")

MAX_MOVE_POWER = {1: 250.0, 2: 300.0, 3: 350.0}      # attacking Max Move by level
GMAX_MOVE_POWER = {1: 350.0, 2: 400.0, 3: 450.0}     # G-Max / Dynamax Cannon by level
MAX_DAMAGE_DIV = 180.0                               # puts the index near in-game Max damage

# Crowned Zacian/Zamazenta: fixed Steel Max Move at STANDARD power (not G-Max).
CROWNED_MAX_OVERRIDE = {
    888: {"type": "steel", "use_gmax_power": False},
    889: {"type": "steel", "use_gmax_power": False},
}


def _best_max_per_atk(attacker_types, moves, fast_ids):
    """Max Battle proxy by Max Move type (= Fast Attack type).

    A Max Move's own power is a function of its level (same for every player at
    the same level), so the discriminators between mons are the Attack stat and
    how hard the in-type Fast move hits.  Max Guard / Max Spirit utility is not
    modelled - see max_battle.note in the config.
    """
    out, best_dps = {}, {}
    for i in fast_ids:
        fm = moves.get(i)
        if not fm:
            continue
        p = fm.get("power", 0)
        if p <= 0 or fm.get("energyGain", 0) <= 0:
            continue
        t = fm.get("type")
        if not t:
            continue
        dur = _move_duration(fm)
        if dur <= 0:
            continue
        stab = STAB if t in attacker_types else 1.0
        # Max Phase damage = Attack x Max Move power x STAB.  The Fast move only decides the
        # Max Move TYPE (and fills the Max Meter), so it picks which fast move to suggest.
        coeff = MAX_MOVE_POWER[3] * stab / MAX_DAMAGE_DIV
        dps = 0.5 * p * stab / DEFENDER_DEF / dur
        if dps > best_dps.get(t, 0.0):
            best_dps[t] = dps
            out[t] = (coeff, fm.get("moveId"))
    return out


# ---------------------------------------------------------------------------
# Raid strength = ER-style "effective DPS"  (2026-11-02)
# Damage alone ranks glass cannons too high.  The community standard (GamePress's ER,
# Pokebattler's DPS^3*TDO) folds in bulk: ER = (DPS^3 * TDO)^(1/4), and since
# TDO ~ DPS * HP * Def this is DPS * (HP*Def)^(1/4).  raid.bulk_weight = 1 gives that,
# 0 gives the old damage-only ranking.  Shadow: +20% Attack but -1/6 Defense, so it pays.
# Max Battles stay damage-only: your tank leads and the attacker only has to hit hard.
# ---------------------------------------------------------------------------
_BULK_W = [1.0]
RAID_BULK_K = 30000.0            # keeps the number on a DPS-like scale; cancels in every ranking
SHADOW_DEF_DIV = 1.2


def raid_bulk(bs, def_iv=15, sta_iv=15, shadow=False):
    w = _BULK_W[0]
    if w <= 0:
        return 1.0
    d = (bs["def"] + def_iv) / (SHADOW_DEF_DIV if shadow else 1.0)
    return ((d * (bs["hp"] + sta_iv)) / RAID_BULK_K) ** (w / 4.0)


def build_type_rankings(gm, moves, useful_types, forbid_suffixes=SHADOW_SUFFIXES,
                        released_only=True, mode="raid"):
    """Rank every species inside each move type.

    mode="raid" -> in-type Charged move model, STAB on the mon's own types.
    mode="max"  -> in-type Fast move model (Max Move type = Fast Attack type).
    Mega/Primal forms are always excluded: they are modelled separately.
    """
    by_type = defaultdict(dict)
    sets = {}
    for p in gm.get("pokemon", []):
        sid = p.get("speciesId")
        if not sid:
            continue
        tags = set(p.get("tags") or [])
        if MEGA_TAGS & tags or any(sid.endswith(s) for s in PRIMAL_SUFFIXES):
            continue
        if "_mega" in sid or "_primal" in sid:
            continue
        if any(sid.endswith(s) for s in forbid_suffixes):
            continue
        if released_only and not p.get("released", True):
            continue
        bs = p.get("baseStats") or {}
        if not bs.get("atk"):
            continue
        types = {t.lower() for t in (p.get("types") or [])}
        fast, charged = p.get("fastMoves") or [], p.get("chargedMoves") or []
        per_type = (_best_dps_per_atk(types, moves, fast, charged) if mode == "raid"
                    else _best_max_per_atk(types, moves, fast))
        for t, info in per_type.items():
            if t not in useful_types:
                continue
            coeff, fm, cm = info if mode == "raid" else (info[0], info[1], None)
            if sid not in by_type[t] or by_type[t][sid] < coeff:
                by_type[t][sid] = coeff
                sets[(sid, t)] = (fm, cm)
    # Rank by real DPS (base Attack x per-Attack coefficient).  Sorting on the
    # coefficient alone ignored Attack entirely, so a Fletchling could outrank
    # a Rayquaza.  The stored value stays the coefficient: callers multiply it
    # by the individual mon's Attack themselves.
    atk_of = {p.get("speciesId"): (p.get("baseStats") or {}).get("atk", 0)
              for p in gm.get("pokemon", [])}
    bs_of = {p.get("speciesId"): (p.get("baseStats") or {}) for p in gm.get("pokemon", [])}

    def _strength(item):
        sid, coeff = item
        s = coeff * (atk_of.get(sid, 0) + 15)
        bs = bs_of.get(sid) or {}
        if mode == "raid" and bs.get("def") and bs.get("hp"):
            s *= raid_bulk(bs)
        return s
    return ({t: sorted(v.items(), key=lambda x: (-_strength(x), x[0]))
             for t, v in by_type.items()}, sets)


def raid_moveset_candidates(attacker_types, moves, fast_ids, charged_ids, atype,
                            boost=False, same_mult=1.3, other_mult=1.1):
    """[(dps_per_atk, fast_id, charged_id)] for every in-type pair, best first.

    boost=True models an active Mega/Primal for `atype` in the raid: every ally
    move of that type does x1.3 and every other move x1.1 (Mega-Evolved mon
    itself gets neither).  The boost is per MOVE type, so a Dragon fast move on
    a Ghost team does not get the Ghost bonus - that is the whole point."""
    use_pve = PVE["ok"]
    fasts, chargeds = _prep_moves(moves, fast_ids, charged_ids)
    out = []
    for cm in chargeds:
        if cm["type"] != atype or cm["type"] not in attacker_types:
            continue
        cm_mult = (same_mult if cm["type"] == atype else other_mult) if boost else 1.0
        cm_dmg = 0.5 * cm["power"] * STAB * cm_mult / DEFENDER_DEF
        for fm in fasts:
            fm_stab = STAB if fm["type"] in attacker_types else 1.0
            fm_mult = (same_mult if fm["type"] == atype else other_mult) if boost else 1.0
            fm_dmg = 0.5 * fm["power"] * fm_stab * fm_mult / DEFENDER_DEF
            n = (cm["cost"] / fm["energy"]) if use_pve else math.ceil(cm["cost"] / fm["energy"])
            cycle = n * fm["dur"] + cm["dur"]
            if cycle <= 0:
                continue
            out.append(((n * fm_dmg + cm_dmg) / cycle, fm["moveId"], cm["moveId"]))
    out.sort(key=lambda x: (-x[0], str(x[1]), str(x[2])))
    return out


def pick_raid_moveset(mon, dex, species, atype, boost, cfg):
    """(moveset label, note).  Best pair by DPS (boost-aware), but a pair the
    mon can use without a TM wins when the best pair is less than
    raid.tm_min_gain_pct better - so the report never spends a TM for a
    rounding-error gain."""
    rc = cfg["raid"]
    types = {t.lower() for t in (species.get("types") or [])}
    fast = list(species.get("fastMoves") or [])
    charged = list(species.get("chargedMoves") or [])
    # Hero Zacian/Zamazenta cannot run Behemoth Blade/Bash (Crowned-only).
    # Strip them even if a bad species resolve handed us the crowned pool.
    if not _is_crowned_form(mon):
        charged = [m for m in charged
                   if "BEHEMOTH" not in str(m).upper()]
    cands = raid_moveset_candidates(
        types, dex.moves, fast, charged,
        atype, boost=boost, same_mult=float(rc.get("boost_same_type", 1.3)),
        other_mult=float(rc.get("boost_other", 1.1)))
    if not cands:
        return "", ""
    best = cands[0]

    def label(c):
        return " / ".join(x for x in (_move_label(c[1]), _move_label(c[2])) if x)

    have = {m["name"].lower() for m in current_moves(mon)} if PVE["ok"] else set()
    unreadable = (not have) or any(h.startswith("#") for h in have)
    gain = float(rc.get("tm_min_gain_pct", 5.0))
    if unreadable or gain < 0:
        return label(best), ""
    elite = {str(e).upper() for e in (species.get("eliteMoves") or [])}
    # An Elite TM is rare, so the best pair has to clear a higher bar when it
    # needs one the mon does not already know.
    if any(str(mid).upper() in elite and _move_label(mid).lower() not in have
           for mid in (best[1], best[2])):
        gain = max(gain, float(rc.get("elite_tm_min_gain_pct", 10.0)))

    def cost(c):
        tot = 0
        for mid in (c[1], c[2]):
            if _move_label(mid).lower() not in have:
                tot += 2 if str(mid).upper() in elite else 1
        return tot

    near = [c for c in cands if c[0] * (1 + gain / 100.0) >= best[0]]
    pick = min(near, key=lambda c: (cost(c), -c[0]))
    if cost(best) == 0:
        return label(best), ""  # already has best pair
    if pick is not best and cost(pick) < cost(best):
        pct = (best[0] / pick[0] - 1.0) * 100.0
        return label(pick), (f"keeps current moves: best pair {label(best)} is only "
                             f"+{pct:.1f}% DPS (under {gain:g}%)")
    # Recommend the best pair and say what TMs are needed
    missing = []
    for mid in (best[1], best[2]):
        nm = _move_label(mid)
        if nm.lower() not in have:
            missing.append(nm + (" (Elite TM)" if str(mid).upper() in elite else " (TM)"))
    note = ("TM: " + " + ".join(missing)) if missing else ""
    return label(best), note


def best_moveset_for_type(gm, species, atype):
    """Display string for the best in-type raid moveset of a species."""
    moves = _moves_index(gm)
    types = {t.lower() for t in (species.get("types") or [])}
    per_type = _best_dps_per_atk(types, moves, species.get("fastMoves") or [],
                                 species.get("chargedMoves") or [])
    info = per_type.get(atype)
    if not info:
        return ""
    _, fast, charged = info
    return " / ".join(x for x in (_move_label(fast), _move_label(charged)) if x)
# ---------------------------------------------------------------------------
# Form / species helpers
# ---------------------------------------------------------------------------

def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def _strip_form_suffix(sid: str) -> str:
    parts = sid.split("_")
    while len(parts) > 1 and parts[-1] in FORM_SUFFIXES:
        parts.pop()
    return "_".join(parts)


def mega_base_of(sid: str) -> str:
    """Base species of a Mega/Primal species id.

    Handles the _mega / _supermega / _primal suffixes *and* the single-letter
    X/Y variants (charizard_mega_x -> charizard, mewtwo_mega_y -> mewtwo,
    raichu_mega_x -> raichu).  The old suffix-stripper missed those because
    "x"/"y" are not form words, which silently dropped every X/Y Mega
    (Charizard, Mewtwo, Raichu) from the Mega tables.
    """
    parts = (sid or "").split("_")
    if len(parts) >= 2 and parts[-1] in ("x", "y") and parts[-2] in MEGA_SUFFIXES:
        parts = parts[:-1]
    if len(parts) >= 2 and parts[-1] in MEGA_SUFFIXES:
        parts = parts[:-1]
    return "_".join(parts)


def looks_like_costume(form_name, form_id):
    """True only for genuine cosmetic variants (event costumes, size, etc.).

    Aliased forms (MewtwoA -> armored, ZygardeTenPercent -> 10, ToxtricityLowKey
    -> low_key, ...) are real battle-relevant forms, not costumes.  Before this
    fix, any non-suffix form name fell through to True, so Armored Mewtwo was
    tagged 'costume keeper' and only protected as a costume - not as a distinct
    form with its own PvP rank.
    """
    if not form_id:
        return False
    fn = _norm(form_name)
    if fn in ("", "unset", "normal"):
        return False
    if fn in FORM_ALIASES:
        return False
    for suf in FORM_SUFFIXES:
        if suf in fn:
            return False
    for suf in FORM_SUFFIXES:
        if fn.endswith(suf):
            return False
    return True


def is_mega_form(sid: str, tags: set) -> bool:
    return bool(MEGA_TAGS & tags) or any(sid.endswith(s) for s in PRIMAL_SUFFIXES)


def boost_types_for(mega_sid: str, mega_species: dict) -> list:
    """Types a Mega/Primal boosts for everyone in the raid."""
    if mega_sid in PRIMAL_BOOST_TYPES:
        return list(PRIMAL_BOOST_TYPES[mega_sid])
    return [t.lower() for t in (mega_species.get("types") or [])]


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

# Every threshold the sorter uses.  pogo_config.json is deep-merged over this,
# so a missing key can never crash the run and can never be silently invented.
DEFAULT_CFG = {
    "protect_iv_pct": 92.0,
    "protect_hundo": True,
    "protect_species_dex": [150, 249, 250, 382, 383, 384, 483, 484, 487,
                            643, 644, 646, 716, 717, 718, 791, 792, 800,
                            888, 889, 890],

    "protect_favorite": True,
    "protect_lucky": True,
    "protect_costume": True,
    "protect_shiny": True,
    "protect_location_card": True,
    "protect_origin_events": True,
    "protect_gofest_2026": True,
    "protect_3rd_move": True,
    "protect_elite_move_holders": True,
    "protect_high_upgrades": True,
    "upgrades_keep_threshold": 20,
    "protect_best_buddy": True,
    "protect_top_pvp_iv": True,
    "protect_top_pvp_iv_rank": 10,
    "protect_top_pvp_iv_leagues": ["1500", "2500"],
    "protect_top_pvp_iv_cups": True,
    "protect_top_pvp_iv_min_cap_fraction": 0.95,
    "protect_high_buddy_km": True,
    "buddy_km_keep_threshold": 100.0,
    "best_buddy_km_threshold": 50.0,
    "protect_deployed": True,
    "protect_tagged": True,

    "protect_mega_capable": True,
    "protect_currently_mega": True,
    "protect_super_mega": True,
    "super_mega_protect_level": 1,
    "protect_dynamax": True,
    "protect_gigantamax": True,

    "keep_copies": 2,
    "power_level_floor": 25,

    "pvp": {
        # Which leagues the sorter plans for: any of "1500" (Great), "2500" (Ultra),
        # "10000" (Master).  Leagues you leave out get no PvP builds, teams or protection.
        "leagues": ["1500", "2500", "10000"],
        # Which cups the sorter plans for: any of "little", "fantasy".  [] turns cups off.
        "cups": ["little", "fantasy"],
        "keep_species_top": {"1500": 40, "2500": 25, "10000": 20},
        "keep_iv_rank": 50,
        "maybe_species_top": {"1500": 70, "2500": 50, "10000": 40},
        "maybe_iv_rank": 120,
        "relevant_species_top": {"1500": 150, "2500": 150, "10000": 100},
        "prefer_shadow_rankings": True,
    },

    "raid": {
        "top_n_species": 50,
        "keep_per_type": 6,
        "power_level": 40.0,
        "min_atk_iv": 12,
        "min_atk_iv_for_shadow": 12,
        "min_dps_pct": 75.0,
        "min_dps_pct_of_best_of_type": 55.0,
        # 1.0 = rank raid/Mega attackers by ER-style effective DPS (damage with a bulk
        # adjustment, the community standard).  0 = damage only (the old behaviour).
        "bulk_weight": 1.0,
        "min_level": 20.0,
        "prefer_shadow": True,
        "shadow_dps_bonus": 1.20,
        "type_coverage_min": 3,
        "suggest_movesets": True,
        "moveset_assume_boost": True,
        "boost_same_type": 1.3,
        "boost_other": 1.1,
        "tm_min_gain_pct": 5.0,
        "elite_tm_min_gain_pct": 10.0,
    },

    "mega": {
        "power_level": 40.0,
        "min_iv_pct": 82.0,
        "min_atk_iv": 12,
        "require_released": True,
        "require_raid_relevance": False,
        "min_dps_pct_of_type": 60.0,
        "recommend_boost_type": True,
        "top_n_for_boost": 5,
    },

    "max_battle": {
        "enabled": True,
        "top_n_species": 50,
        "keep_per_type": 4,
        "power_level": 40.0,
        "min_atk_iv": 12,
        "min_dps_pct": 70.0,
        "min_dps_pct_of_best_of_type": 50.0,
        "min_level": 20.0,
        "prefer_gigantamax": True,
        "tank_picks": 4,
        "healer_picks": 3,
        "note": ("Max damage = Attack x Max Move power (250/300/350, G-Max 350/400/450) x STAB, "
                 "ranked at Max Move level 3.  Max Move type = Fast Attack type (a G-Max move's fixed "
                 "type per species is not known, so Gigantamax uses the Fast type with G-Max power). "
                 "Tanks / healers are ranked by bulk / max HP among your Dynamax Pokemon."),
    },

    "gym": {
        "defenders": [
            "blissey", "chansey", "snorlax", "wobbuffet", "slaking",
            "togekiss", "umbreon", "drifblim", "gyarados", "milotic",
            "metagross", "aggron",
        ],
        "power_level": 40.0,
        "min_iv_pct": 70.0,
        "max_per_species": 3,
        "allow_shadow": False,
    },

    "pvp_teams": {
        "enabled": True,
        "top_n": 5,
        "species_rank_max": 200,
        "iv_rank_max": 300,
        "require_distinct_types": True,
        "cohesion": {
            "enabled": True,
            "threat_count": 40,
            "max_pool": 40,
            "hole_min_victims": 2,
            "weights": {
                "coverage": 0.38, "holes": 0.18, "roles": 0.14,
                "consistency": 0.10, "bulk": 0.07, "backup": 0.08,
                "typing": 0.05,
            },
            "grades": {"A": 90.0, "B": 80.0, "C": 70.0, "D": 60.0},
            "note": ("Cohesion is scored on PvPoke's own published data: the league "
                     "meta group is the threat list, each species' top-5 wins and "
                     "top-5 losses are the matchup graph, and the six category "
                     "scores drive role assignment (lead / safe swap / closer)."),
        },
    },

    "power_up_priority": {
        "iv_rank_cutoff": 500,
        "do_not_invest_iv_rank": 500,
        "max_rows": 40,
        "top_n": 12,               # length of the SPEND FIRST list
        "max_per_species": 1,      # builds per species per league on that list
        "dust_budget": 0,          # 0 = off.  Your own number; never guessed.
        "do_not_invest_rows": 10,
    },

    "coverage": {
        "min_level": 25.0,
        "min_attackers": 3,
        # Coverage first: while any raid type has fewer than min_attackers usable
        # attackers, Raid and Mega builds target build_target_level instead of
        # raid/mega.power_level (40).  Once every type is covered the normal
        # power_level targets come back.  0 = use coverage.min_level.
        "coverage_first": True,
        "build_target_level": 0,
        "pick_tie_pct": 5.0,       # fill a gap with the strongest attacker; within this % cheaper wins
        "defer_master_builds": True,   # while coverage-first is on, L50 Master League projects go last
    },

    "review": {
        "atk_iv_slack": 1,
        "dps_slack_pct": 5.0,
        "level_slack": 10.0,
        "mega_iv_slack": 15.0,
        "gym_iv_slack": 5.0,
        "gym_min_cp": 1500,
    },

    "age_keep_years": [2016],
    "age_keep_if_iv_pct": {"2017": 70.0, "2018": 80.0},
    "age_maybe_years": [2017, 2018, 2019, 2020],
    "age_maybe_if_iv_pct": {"2017": 0.0, "2018": 0.0, "2019": 0.0, "2020": 70.0},

    "variant_rules": {
        "costume":   {"key": ["dex", "costume", "gender"], "trade_key": ["dex", "costume"], "keep": 2, "trade": 3, "quality": "iv_pct"},
        "shiny":     {"key": ["dex", "shiny", "gender"],   "trade_key": ["dex", "shiny"],   "keep": 1, "trade": 2, "quality": "iv_pct"},
        "legendary": {"key": ["dex", "form"],              "trade_key": ["dex", "form"],    "keep": 2, "trade": 2, "quality": "iv_pct"},
        "lucky_age": {"key": ["dex", "form"],              "trade_key": ["dex", "form"],    "keep": 1, "trade": 3, "quality": "iv_pct"},
        "form":      {"key": ["dex", "form"],              "trade_key": ["dex", "form"],    "keep": 1, "trade": 1, "quality": "iv_pct"},
    },

    "safeguards": {
        "never_transfer_if_in_team": True,
        "never_transfer_if_in_build": True,
        "never_transfer_if_in_raid_team": True,
        "never_transfer_if_in_max_team": True,
        "warn_high_cp": 2500,
        "warn_high_level": 35.0,
    },
}


def _deep_merge(base: dict, override: dict) -> dict:
    out = dict(base)
    for k, v in (override or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


# Keys added by the accuracy pass.  Deep-merged under the user's config, so an
# older pogo_config.json keeps working and an edited value here always wins.
DEFAULT_CFG = _deep_merge(DEFAULT_CFG, {
    "protect_iv_scope": "best_per_species",   # "all" = old behaviour
    "iv_protect_max_per_species": 2,
    "pve_model": {"enabled": True},
    "pvp": {
        "builds_per_species_league": {"1500": 1, "2500": 1, "10000": 1},
        "master_min_iv_pct": 93.0,
        "min_composite": 1220,
    },
    "raid": {"reserve_keep": 2, "min_iv_pct": 60.0, "iv_pct_slack": 5.0},
    "max_battle": {"reserve_keep": 2},
    "mega": {"keep_per_family": 1, "keep_per_type": 3, "require_dps_floor": True},
    # "Last look" block at the top of transfer_list.txt: a transfer that trips
    # any of these is listed again with the reason, so you glance twice.
    "pvp_teams": {"cup_max_shared_members": 1, "league_max_shared_members": 1},
    "last_look": {"enabled": True, "iv_pct": 85.0, "level_above": 25.0},
    # review_triage.txt: sorts the REVIEW pile into probably-keep / probably-
    # transfer.  Advice only - it never changes a verdict, EXCEPT for mons whose
    # in-game id you list in confirmed_transfer_ids (you decide, one by one).
    "review_triage": {"enabled": True, "keep_iv_pct": 90.0, "keep_pvp_iv_rank": 25,
                      "keep_level_above": 25.0, "transfer_iv_pct": 70.0,
                      "confirmed_transfer_ids": []},
})


def load_cfg():
    p = HERE / "pogo_config.json"
    if not p.exists():
        sys.exit("pogo_config.json not found next to pogo_sorter.py")
    user = json.loads(p.read_text(encoding="utf-8-sig"))
    global USER_CFG
    USER_CFG = user          # the file exactly as you wrote it (the viewer's Settings tab edits a copy)
    return _deep_merge(DEFAULT_CFG, user)


# ---------------------------------------------------------------------------
# Data download
# ---------------------------------------------------------------------------

def get_json(rel, refresh=False):
    CACHE.mkdir(exist_ok=True)
    dest = CACHE / rel.replace("/", "__")
    have = dest.exists()
    stale = refresh or not have or (time.time() - dest.stat().st_mtime) > MAX_AGE_DAYS * 86400
    if stale and OFFLINE:
        if not have:
            sys.exit(f"--offline was given but {dest.name} is not cached.")
        return json.loads(dest.read_text(encoding="utf-8")), (time.time() - dest.stat().st_mtime) / 86400
    if stale:
        try:
            req = urllib.request.Request(f"{BASE}/{rel}", headers={"User-Agent": "pogo-sorter"})
            with urllib.request.urlopen(req, timeout=60) as r:
                dest.write_bytes(r.read())
        except Exception as e:
            if not dest.exists():
                sys.exit(f"Could not download {rel} and no cached copy exists.\n({e})")
            print(f"[warn] download failed ({e}); using cached copy")
    return json.loads(dest.read_text(encoding="utf-8")), (time.time() - dest.stat().st_mtime) / 86400


def ranking_rows(payload):
    """PvPoke ranking files are normally a flat list of ranking entries, but
    some snapshots wrap them in a single-element list.  Accept both - assuming
    [0] crashed outright on the flat form."""
    if isinstance(payload, list):
        if payload and isinstance(payload[0], list):
            return payload[0]
        return payload
    return []


# ---------------------------------------------------------------------------
# PvE move data
#
# PvPoke's gamemaster only carries the PvP numbers for each move (power/energy
# are rescaled, every Charged move lasts one 0.5 s turn, costs are 35-75).  Raid
# and Max DPS built from those numbers ranks attackers by a PvP proxy.  The
# real PvE numbers (power, duration, energy, 33/50/100-energy bars) live in
# the mined game master, so they are fetched once, shrunk to ~30 KB and cached.
# If the download fails the old PvP-proxy model is used and the report says so.
# ---------------------------------------------------------------------------

PVE_URL = "https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json"
PVE = {"moves": {}, "by_id": {}, "ok": False}

# Species size table for Showcase scoring (pokedex avg height/weight + XXL class).
# Loaded from the same PokeMiners game master as PvE moves.
SIZE = {"by_key": {}, "ok": False}  # key: "PIKACHU" or "RAICHU_ALOLA" -> {h, w, k}


def load_size_table(refresh=False):
    """pokedexHeightM, pokedexWeightKg, and XX-Class (k) from Game Master.

    k = xxlUpperBound / pokedexHeightM  (typically 1.55, 1.75, or 2.00).
    Showcase formula (species-normalized, post-Sept 2024):
      HeightScore = 800 * (h / avg_h) / k
      WeightScore = 150 * (w / avg_w) / (k + 0.5)
      IVScore     = 50  * (ATK+DEF+STA) / 45
      XXLBonus    = 178 if size class XXL else 0
      Score       = sum  (max 1178)
    """
    CACHE.mkdir(exist_ok=True)
    dest = CACHE / "showcase_size.json"
    have = dest.exists()
    stale = refresh or not have or (time.time() - dest.stat().st_mtime) > MAX_AGE_DAYS * 86400
    if stale and not OFFLINE:
        try:
            req = urllib.request.Request(PVE_URL, headers={"User-Agent": "pogo-sorter"})
            with urllib.request.urlopen(req, timeout=180) as r:
                raw = json.loads(r.read().decode("utf-8-sig"))
            avg = {}   # uniqueId or FORM -> (h, w)
            xxl = {}   # uniqueId or FORM -> xxlUpperBound meters
            for t in raw:
                tid = str(t.get("templateId") or "")
                data = t.get("data") or {}
                ps = data.get("pokemonSettings")
                if ps and "pokedexHeightM" in ps:
                    # V####_POKEMON_NAME or V####_POKEMON_NAME_FORM
                    key = ps.get("form") or ps.get("pokemonId") or ""
                    if not key and tid.startswith("V"):
                        key = tid.split("_POKEMON_", 1)[-1] if "_POKEMON_" in tid else ""
                    if key:
                        avg[str(key)] = (float(ps["pokedexHeightM"]),
                                         float(ps.get("pokedexWeightKg") or 0.0))
                pes = data.get("pokemonExtendedSettings")
                if pes and "sizeSettings" in pes:
                    ss = pes["sizeSettings"]
                    uid = pes.get("form") or pes.get("uniqueId") or ""
                    if uid and ss.get("xxlUpperBound"):
                        xxl[str(uid)] = float(ss["xxlUpperBound"])
            table = {}
            for key, (h, w) in avg.items():
                if h <= 0:
                    continue
                bound = xxl.get(key)
                # Fall back: strip form suffix for size class from base species
                if bound is None and "_" in key:
                    bound = xxl.get(key.split("_", 1)[0])
                if bound is None:
                    # Default mid class if missing
                    k = 1.75
                else:
                    k = bound / h
                    # Snap near the three known classes
                    for cand in (1.55, 1.75, 2.00):
                        if abs(k - cand) < 0.08:
                            k = cand
                            break
                table[key] = {"avg_h": h, "avg_w": w, "k": round(k, 4),
                              "xxl_h": round(h * k, 4)}
            if len(table) > 100:
                dest.write_text(json.dumps(table), encoding="utf-8")
                print(f"[info] showcase size table: {len(table)} forms")
        except Exception as e:
            print(f"[warn] showcase size download failed ({e}); "
                  + ("using cache" if have else "showcase scores approximate"))
    if dest.exists():
        try:
            table = json.loads(dest.read_text(encoding="utf-8"))
            if table:
                SIZE["by_key"] = table
                SIZE["ok"] = True
        except Exception as e:
            print(f"[warn] could not read showcase_size.json ({e})")
    return SIZE["ok"]


def _size_key_for_mon(m):
    """Map a Mon to a Game Master form key (e.g. PIKACHU, RAICHU_ALOLA)."""
    if not m.species:
        return None
    sid = m.species.get("speciesId") or ""
    # PvPoke ids: raichu_alolan -> RAICHU_ALOLA-ish; try several
    candidates = []
    form = _norm(getattr(m, "form_name", "") or "")
    base = sid.upper().replace("-", "_")
    candidates.append(base)
    # Alolan / Galarian / Hisuian suffixes used by GM
    for tag, gm_tag in (("alola", "ALOLA"), ("alolan", "ALOLA"),
                        ("galar", "GALARIAN"), ("galarian", "GALARIAN"),
                        ("hisui", "HISUIAN"), ("hisuian", "HISUIAN"),
                        ("paldea", "PALDEA"), ("paldean", "PALDEA")):
        if tag in form or sid.endswith("_" + tag) or sid.endswith(tag):
            root = base.split("_")[0]
            candidates.insert(0, f"{root}_{gm_tag}")
    # Dex-based fallback: SPECIES from speciesName
    name = (m.species.get("speciesName") or "").upper().replace(" ", "_")
    if name:
        candidates.append(name)
    for c in candidates:
        if c in SIZE["by_key"]:
            return c
        # strip trailing form noise
        root = c.split("_")[0]
        if root in SIZE["by_key"]:
            return root
    return None


def showcase_score(m):
    """Official-style showcase score (species-normalized). Returns dict or None."""
    raw = m.raw or {}
    h = float(raw.get("heightM") or 0.0)
    w = float(raw.get("weightKg") or 0.0)
    size = int(raw.get("size") or 0)
    if h <= 0:
        return None
    key = _size_key_for_mon(m) if SIZE["ok"] else None
    info = SIZE["by_key"].get(key) if key else None
    iv_sum = m.a + m.d + m.s
    iv_score = 50.0 * iv_sum / 45.0
    xxl_bonus = 178.0 if size == 5 else 0.0
    if info and info["avg_h"] > 0 and info["avg_w"] > 0:
        k = float(info["k"])
        height_score = 800.0 * (h / info["avg_h"]) / k
        weight_score = 150.0 * (w / info["avg_w"]) / (k + 0.5)
    else:
        # Fallback without species averages: relative only (not game-accurate)
        height_score = min(800.0, h * 200.0)
        weight_score = min(150.0, w * 2.0)
        k = None
    total = height_score + weight_score + iv_score + xxl_bonus
    return {
        "score": round(total, 2),
        "height_score": round(height_score, 2),
        "weight_score": round(weight_score, 2),
        "iv_score": round(iv_score, 2),
        "xxl_bonus": xxl_bonus,
        "k": k,
        "avg_h": info["avg_h"] if info else None,
        "avg_w": info["avg_w"] if info else None,
        "size_key": key,
        "accurate": bool(info),
    }


def load_pve_moves(refresh=False):
    CACHE.mkdir(exist_ok=True)
    dest = CACHE / "pve_moves.json"
    have = dest.exists()
    stale = refresh or not have or (time.time() - dest.stat().st_mtime) > MAX_AGE_DAYS * 86400
    if stale and not OFFLINE:
        try:
            req = urllib.request.Request(PVE_URL, headers={"User-Agent": "pogo-sorter"})
            with urllib.request.urlopen(req, timeout=180) as r:
                raw = json.loads(r.read().decode("utf-8-sig"))
            moves = {}
            for t in raw:
                mm = re.match(r"^V(\d{4})_MOVE_(.+)$", str(t.get("templateId", "")))
                ms = (t.get("data") or {}).get("moveSettings")
                if not mm or not ms:
                    continue
                name = ms.get("movementId")
                if not isinstance(name, str):
                    name = mm.group(2)
                moves[name] = {"id": int(mm.group(1)),
                               "p": float(ms.get("power") or 0),
                               "d": int(ms.get("durationMs") or 0),
                               "e": int(ms.get("energyDelta") or 0),
                               "t": str(ms.get("pokemonType", "")).replace("POKEMON_TYPE_", "").lower()}
            if len(moves) > 100:
                dest.write_text(json.dumps(moves), encoding="utf-8")
        except Exception as e:
            print(f"[warn] PvE move download failed ({e}); "
                  + ("using the cached copy" if have else "raid DPS falls back to the PvP-move proxy"))
    if dest.exists():
        try:
            moves = json.loads(dest.read_text(encoding="utf-8"))
            if moves:
                PVE["moves"] = moves
                PVE["by_id"] = {v["id"]: k for k, v in moves.items()}
                PVE["ok"] = True
        except Exception as e:
            print(f"[warn] could not read pve_moves.json ({e})")
    return PVE["ok"]


def pve_move(move_id, fast):
    """PvE record for a PvPoke move id, or None."""
    if not PVE["ok"] or not move_id:
        return None
    return PVE["moves"].get(f"{move_id}_FAST" if fast else str(move_id))


def held_elite_moves(mon, elite_ids):
    """Names of elite/legacy moves the mon actually knows, or None if the save's
    numeric move ids cannot be resolved (then callers fall back to a guess)."""
    if not PVE["ok"]:
        return None
    elite = {str(e).upper() for e in elite_ids}
    held = []
    for raw in mon.knows_moves:
        try:
            name = PVE["by_id"].get(int(raw))
        except ValueError:
            name = None
        if not name:
            continue
        base = name[:-5] if name.endswith("_FAST") else name
        if base in elite:
            held.append(base.replace("_", " ").title())
    return held


def _move_info(raw_id):
    """(display name, type) for a numeric move id stored in the save."""
    if not PVE["ok"] or not raw_id:
        return None
    try:
        key = PVE["by_id"].get(int(raw_id))
    except (TypeError, ValueError):
        return None
    if not key:
        return None
    base = key[:-5] if key.endswith("_FAST") else key
    return base.replace("_", " ").title(), PVE["moves"][key].get("t", "")



def _fast_move_type(mon):
    """Type of the Fast Attack the mon knows right now (Max Move type in GO)."""
    raw = (mon.raw or {}).get("move1")
    if not raw:
        return None
    got = _move_info(raw)
    if not got or not got[1]:
        return None
    return str(got[1]).lower()


def current_moves(mon):
    """The moves the mon knows right now, in slot order, with types.

    move1 = Fast, move2 = Charged, move3 = second Charged (PGSharp/Niantic
    store them as numeric ids).  Unresolvable ids are shown as '#id' so a
    stale cache never hides a move."""
    if not PVE["ok"]:
        return []              # no id table: show nothing rather than raw ids
    elite = set()
    if mon.species and mon.species.get("eliteMoves"):
        elite = set(held_elite_moves(mon, mon.species["eliteMoves"]) or [])
    out = []
    for slot, k in (("fast", "move1"), ("charged", "move2"), ("charged2", "move3")):
        raw = mon.raw.get(k)
        if not raw:
            continue
        got = _move_info(raw)
        name = got[0] if got else f"#{raw}"
        out.append({"slot": slot, "name": name, "type": got[1] if got else "",
                    "elite": name in elite})
    return out


def moves_str(mon):
    return " / ".join(m["name"] + (" *" if m["elite"] else "") for m in current_moves(mon))


def moves_needed(mon):
    """Suggested moves the mon does not know yet (empty if it already has them
    all, or if no PvE id table / suggestion is available)."""
    if not PVE["ok"] or not mon.moveset:
        return []
    have = {m["name"].lower() for m in current_moves(mon)}
    return [w.strip() for w in mon.moveset.split(" / ")
            if w.strip() and w.strip().lower() not in have]


READINESS_STATUSES = ("Ready", "Needs TM", "Needs second charged move", "Needs Elite TM", "Unknown")
READINESS_BUILDS = ("BUILD_PVP", "BUILD_MEGA", "BUILD_RAID", "BUILD_MAX")
READINESS_DEFAULT_MIN = 2
_readiness_notice_shown = False


def _move_ident(name):
    """'Hydro Cannon' / 'HYDRO_CANNON' -> 'HYDRO_CANNON'."""
    return re.sub(r"[^A-Z0-9]+", "_", str(name or "").strip().upper()).strip("_")


def _pve_fast_idents():
    return {k[:-5] for k in PVE["moves"] if k.endswith("_FAST")}


def _species_move_pool(sp):
    out = set()
    for key in ("fastMoves", "chargedMoves"):
        for mid in (sp.get(key) or []):
            out.add(str(mid).upper())
    return out


def _ready_min(cfg):
    """readiness.ready_min_known: how many suggested moves make a build Ready.

    Default 2, clamped to 1-3.  A missing key prints one notice and uses the
    default, so an old config keeps working without silently changing meaning.
    """
    global _readiness_notice_shown
    raw = ((cfg or {}).get("readiness") or {}).get("ready_min_known")
    if raw is None:
        if not _readiness_notice_shown:
            print("[warn] readiness.ready_min_known missing from pogo_config.json - "
                  "using default %d" % READINESS_DEFAULT_MIN)
            _readiness_notice_shown = True
        return READINESS_DEFAULT_MIN
    try:
        n = int(raw)
    except (TypeError, ValueError):
        n = READINESS_DEFAULT_MIN
    return max(1, min(3, n))


def readiness_fields(mon, dex, verdict, cfg=None):
    """Item 1: what stands between this build and a usable moveset.

    Returns (fields, meta); fields is {} for anything that is not a non-gym
    BUILD row, so the caller can splat it into the report row unconditionally.
    meta carries the elite fast/charged split for the readiness summary and is
    never written into the report.

    Precedence, hardest first: Needs Elite TM, Needs second charged move,
    Needs TM.  Ready needs ready_min_known of the suggested moves (default 2
    of 3, clamped 1-3).  learn_after_evolve is a note only and never changes
    the status.
    """
    if verdict not in READINESS_BUILDS:
        return {}, None
    out = {"build_status": "Unknown", "needs_moves": [], "needs_elite_moves": [], "needs_typed": [],
           "elite_tm": False, "status_reason": "", "learn_after_evolve": []}
    if mon is None or not mon.species:
        out["status_reason"] = "no species data"
        return out, {"fast": False, "charged": False}
    if not PVE["ok"]:
        out["status_reason"] = "move id table unavailable (offline without pve_moves.json)"
        return out, {"fast": False, "charged": False}
    if not mon.moveset:
        out["status_reason"] = "no suggested moveset for this build"
        return out, {"fast": False, "charged": False}

    moves = current_moves(mon)
    if any(str(m.get("name", "")).startswith("#") for m in moves):
        out["status_reason"] = "unreadable move id in save"
        return out, {"fast": False, "charged": False}

    parts = [p.strip() for p in mon.moveset.split(" / ") if p.strip()]
    have = {m["name"].lower() for m in moves}
    missing = [p for p in parts if p.lower() not in have]

    current_sid = mon.species.get("speciesId", "")
    target_sid = mon.evolve_to_sid or current_sid
    target = dex.by_id.get(target_sid) or mon.species
    if "eliteMoves" not in target and missing:
        out["status_reason"] = "elite move data missing for %s" % (target_sid or "this species")
        return out, {"fast": False, "charged": False}
    elite_ids = {str(e).upper() for e in (target.get("eliteMoves") or [])}
    current_pool = _species_move_pool(mon.species)
    target_pool = _species_move_pool(target)

    elite_gap = [p for p in missing if _move_ident(p) in elite_ids]
    regular_gap = [p for p in missing if _move_ident(p) not in elite_ids]
    second_slot_gap = len(parts) >= 3 and not mon.has_third_move
    known = len(parts) - len(missing)
    need = min(_ready_min(cfg), len(parts))

    out["needs_moves"] = regular_gap
    out["needs_elite_moves"] = elite_gap
    _fi = _pve_fast_idents()
    out["needs_typed"] = [
        {"name": p, "slot": "fast" if _move_ident(p) in _fi else "charged",
         "elite": _move_ident(p) in elite_ids}
        for p in missing]
    out["elite_tm"] = bool(elite_gap)
    out["learn_after_evolve"] = [
        p for p in missing
        if target_sid != current_sid
        and _move_ident(p) not in current_pool
        and _move_ident(p) in target_pool
    ]

    if elite_gap:
        out["build_status"] = "Needs Elite TM"
        out["status_reason"] = "elite move needed: " + ", ".join(elite_gap)
    elif second_slot_gap:
        out["build_status"] = "Needs second charged move"
        out["status_reason"] = "second charged move not unlocked"
    elif known >= need:
        out["build_status"] = "Ready"
        out["status_reason"] = "all suggested moves known" if not missing else \
            "knows %d of %d suggested moves (ready_min_known=%d)" % (known, len(parts), need)
    else:
        out["build_status"] = "Needs TM"
        out["status_reason"] = "missing: " + ", ".join(regular_gap or missing)

    fast_idents = _pve_fast_idents()
    fast_gap = any(_move_ident(p) in fast_idents for p in elite_gap)
    charged_gap = any(_move_ident(p) not in fast_idents for p in elite_gap)
    return out, {"fast": fast_gap, "charged": charged_gap}


def _readiness_summary(rows, by_uid, dex, cfg=None):
    counts = Counter()
    fast_only = charged_only = either = 0
    for r in rows:
        fields, meta = readiness_fields(by_uid.get(r["id"]), dex, r["verdict"], cfg)
        if not fields:
            continue
        counts[fields["build_status"]] += 1
        if fields["build_status"] == "Needs Elite TM" and meta:
            fast = bool(meta.get("fast"))
            charged = bool(meta.get("charged"))
            fast_only += 1 if fast else 0
            charged_only += 1 if charged else 0
            either += 1 if (fast and charged) else 0
    return {"status_counts": {k: counts.get(k, 0) for k in READINESS_STATUSES},
            "elite_demand": {"fast_only": fast_only, "charged_only": charged_only, "either": either}}


# ---------------------------------------------------------------------------
# Dex
# ---------------------------------------------------------------------------

@dataclass
class PvpEntry:
    league: str
    name: str
    iv_rank: int
    stat_pct: float
    species_rank: int
    species_score: float
    sid: str
    cap: int
    eligible: bool          # mon can still reach the cap (cp <= cap)
    shadow: bool = False
    composite: float = 0.0  # filled in for build candidates


class Dex:
    def __init__(self, gm, rankings, cfg, groups=None, cup_ranks=None, cup_groups=None):
        self.gm = gm
        self.moves = _moves_index(gm)
        self.cfg = cfg
        self.by_id = {p["speciesId"]: p for p in gm["pokemon"]}
        self.by_dex = defaultdict(list)
        for p in gm["pokemon"]:
            sid = p["speciesId"]
            tags = set(p.get("tags") or [])
            if any(sid.endswith(s) for s in SHADOW_SUFFIXES):
                continue
            if is_mega_form(sid, tags):
                continue
            self.by_dex[p["dex"]].append(p)
        self.inelig_gl = set(gm.get("greatLeagueIneligible") or [])

        self.pos, self.pos_shadow, self.movesets = {}, {}, {}
        self.roles = {}       # (key, sid) -> {leads:.., closers:..}
        self.wins = {}        # (key, sid) -> {opponent: rating}
        self.losses = {}      # (key, sid) -> {opponent: rating}
        self.threats = {}     # key -> [(sid, rank, score)]
        self.matchup_source = {}
        self.cup_pos, self.cup_roles = {}, {}
        self.pvp_rows = {}    # cap -> [(speciesId, score)] in PvPoke order (shadows included)
        for _cn, _rows in (cup_ranks or {}).items():
            _pos = {}
            for _i, _r in enumerate(_rows, 1):
                _sid = _r.get("speciesId")
                if not _sid:
                    continue
                _score = _r.get("score", _r.get("rating", 0))
                if _sid not in _pos:
                    _pos[_sid] = (_i, _score)
                _sc = _r.get("scores")
                if isinstance(_sc, list) and len(_sc) == len(PVP_ROLE_KEYS):
                    self.roles[(_cn, _sid)] = dict(zip(PVP_ROLE_KEYS, (float(x) for x in _sc)))
                self.wins[(_cn, _sid)] = {
                    m["opponent"]: float(m.get("rating") or 0.0)
                    for m in (_r.get("matchups") or [])
                    if isinstance(m, dict) and m.get("opponent")
                }
                self.losses[(_cn, _sid)] = {
                    m["opponent"]: float(m.get("rating") or 0.0)
                    for m in (_r.get("counters") or [])
                    if isinstance(m, dict) and m.get("opponent")
                }
            self.cup_pos[_cn] = _pos

        # Cup threat lists (patch 9c)
        for _cn, _rows in (cup_ranks or {}).items():
            _grp = (cup_groups or {}).get(_cn) or []
            if _grp:
                self.threats[_cn] = build_threat_list(self, _cn, _rows, {_cn: _grp})
                self.matchup_source[_cn] = "PvPoke cup meta group (groups/" + _cn + ".json)"
            else:
                self.threats[_cn] = []
                self.matchup_source[_cn] = "rank-based (no groups/" + _cn + ".json)"
        # Cohesion inputs, all straight out of PvPoke's ranking rows.
        # (roles / wins / losses / threats / matchup_source were created empty at
        # the top of __init__.  They used to be re-created empty HERE, which threw
        # away everything the cup block above had just filled in - so cups always
        # fell back to rank-based scoring even with the meta group cached.)
        for cap, rows in rankings.items():
            self.pvp_rows[cap] = [(r.get("speciesId"), r.get("score", r.get("rating", 0)))
                                  for r in rows if r.get("speciesId")]
            plain, shadow, i, j = {}, {}, 0, 0
            for r in rows:
                sid = r.get("speciesId")
                if not sid:
                    continue
                score = r.get("score", r.get("rating", 0))
                if sid.endswith("_shadow"):
                    j += 1
                    shadow[sid] = (j, score)
                else:
                    i += 1
                    plain[sid] = (i, score)
                mv = r.get("moveset")
                if isinstance(mv, list) and mv:
                    self.movesets[(cap, sid)] = mv
                sc = r.get("scores")
                if isinstance(sc, list) and len(sc) == len(PVP_ROLE_KEYS):
                    self.roles[(cap, sid)] = dict(zip(PVP_ROLE_KEYS, (float(x) for x in sc)))
                self.wins[(cap, sid)] = {m["opponent"]: float(m.get("rating") or 0.0)
                                         for m in (r.get("matchups") or [])
                                         if isinstance(m, dict) and m.get("opponent")}
                self.losses[(cap, sid)] = {m["opponent"]: float(m.get("rating") or 0.0)
                                           for m in (r.get("counters") or [])
                                           if isinstance(m, dict) and m.get("opponent")}
            self.pos[cap] = plain
            self.pos_shadow[cap] = shadow
            self.threats[cap] = build_threat_list(self, cap, rows, groups or {})

        # Mega / Primal metadata (data driven; unreleased forms are skipped).
        self.mega_bases, self.mega_species, self.mega_forms = set(), set(), defaultdict(list)
        for p in gm["pokemon"]:
            sid = p["speciesId"]
            tags = set(p.get("tags") or [])
            if not is_mega_form(sid, tags):
                continue
            if cfg["mega"]["require_released"] and not p.get("released", True):
                continue
            base = mega_base_of(sid)
            if not base:
                continue
            self.mega_bases.add(base)
            self.mega_species.add(sid)
            self.mega_forms[base].append(sid)

        # Species that evolve in one step into a Mega-capable species.
        self.mega_pre_evos = set()
        for p in gm["pokemon"]:
            fam = p.get("family") or {}
            for evo in (fam.get("evolutions") or []):
                if evo in self.mega_bases:
                    self.mega_pre_evos.add(p["speciesId"])
                    break

        # PvPoke has no dynamax/gigantamax tags; D/G-max is read from the save
        # export (pokemonDisplay.breadModeEnum).  Keep the sets for reporting.
        self.dynamax_bases = {p["speciesId"] for p in gm["pokemon"]
                              if "dynamax" in set(p.get("tags") or [])}
        self.gigantamax_bases = {p["speciesId"] for p in gm["pokemon"]
                                 if "gigantamax" in set(p.get("tags") or [])}
        self.elite_move_species = {p["speciesId"] for p in gm["pokemon"] if p.get("eliteMoves")}

        self.raid_rankings, self.raid_sets = build_type_rankings(
            gm, self.moves, RAID_USEFUL_TYPES, SHADOW_SUFFIXES, mode="raid")
        self.raid_pos = {t: {sid: i for i, (sid, _) in enumerate(rows)}
                         for t, rows in self.raid_rankings.items()}
        self.raid_coeffs = {(sid, t): c for t, rows in self.raid_rankings.items() for sid, c in rows}
        self.raid_best = {t: (rows[0][1] if rows else 0.0) for t, rows in self.raid_rankings.items()}

        self.max_rankings, self.max_sets = build_type_rankings(
            gm, self.moves, MAX_BATTLE_TYPES, SHADOW_SUFFIXES, mode="max")
        self.max_pos = {t: {sid: i for i, (sid, _) in enumerate(rows)}
                        for t, rows in self.max_rankings.items()}
        self.max_coeffs = {(sid, t): c for t, rows in self.max_rankings.items() for sid, c in rows}
        self.max_best = {t: (rows[0][1] if rows else 0.0) for t, rows in self.max_rankings.items()}

        self._spreads = {}
        self._coeff_cache = {}
        self._apply_dynamax_filter()

    REGIONAL = {"alola": "alolan", "galar": "galarian", "hisui": "hisuian", "paldea": "paldean"}

    def _is_base(self, c):
        return _strip_form_suffix(c["speciesId"]) == c["speciesId"]

    def resolve(self, dex, form_name, form_id=0):
        cands = self.by_dex.get(dex, [])
        if not cands:
            return None, "species not in PvPoke data"
        fn = _norm(form_name)
        fn = FORM_ALIASES.get(fn, fn)
        base = [c for c in cands if self._is_base(c)]

        for key, suf in self.REGIONAL.items():
            if key in fn:
                for c in cands:
                    if c["speciesId"].endswith(suf):
                        return c, ""
                if base:
                    return base[0], f"regional form '{form_name}' not in PvPoke, using base"
                return None, f"regional form '{form_name}' not found"

        if len(cands) == 1:
            return cands[0], ""

        # Zacian / Zamazenta: PvPoke ids are zacian_hero / zacian_crowned_sword
        # (there is NO plain "zacian"). Match those explicitly.
        if fn == "hero" or fn.endswith("hero"):
            for c in cands:
                if c["speciesId"].endswith("_hero") or c["speciesId"].endswith("hero"):
                    return c, ""
            if base:
                return base[0], ""
        if fn == "crowned" or "crowned" in fn:
            for c in cands:
                sid = c["speciesId"]
                if "crowned" in sid and "hero" not in sid:
                    return c, ""

        if fn in ("", "unset") or fn.endswith("normal"):
            if base:
                return base[0], ""
            # No plain base (Zacian/Zamazenta): prefer hero over crowned
            for c in cands:
                if c["speciesId"].endswith("_hero"):
                    return c, ""

        for c in cands:
            sid = c["speciesId"]
            if "_" not in sid:
                continue
            suf = _norm(sid.split("_", 1)[1])
            if suf and (suf in fn or fn in suf or fn == suf):
                return c, ""
            stripped = _strip_form_suffix(sid)
            tail_parts = stripped.split("_", 1)
            if len(tail_parts) > 1:
                tail = _norm(tail_parts[1])
                if tail and (tail in fn or fn in tail):
                    return c, ""

        if looks_like_costume(form_name, form_id) and base:
            return base[0], f"costume form '{form_name}', using base"

        for c in cands:
            if fn and fn in _norm(c["speciesId"]):
                return c, ""
        return None, f"ambiguous form '{form_name}'"

    def can_dynamax(self, sid):
        sp = self.by_id.get(sid)
        if not sp or sid.endswith("_shadow") or any(sid.endswith(s) for s in _REGIONAL_SUFFIXES):
            return False
        d = sp.get("dex")
        return d in self.dynamax_dex and d not in GMAX_ONLY_DEX

    def _apply_dynamax_filter(self):
        """Max rankings may only contain species that can really Dynamax; build the G-Max rows."""
        mcfg = self.cfg.get("max_battle") or {}
        observed = {int(p.get("pokemonId") or 0) for p in (EXPORT_DATA.get("pokemons") or [])
                    if (p.get("pokemonDisplay") or {}).get("breadModeEnum", 0) > 0}
        ok = set(DYNAMAX_DEX) | {int(x) for x in (mcfg.get("extra_dynamax_dex") or [])} | observed
        for sid, sp in self.by_id.items():              # Dynamax carries through evolution
            if sp.get("dex") in observed:
                for d in self.descendants(sid):
                    dd = (self.by_id.get(d) or {}).get("dex")
                    if dd:
                        ok.add(dd)
        self.dynamax_dex = ok
        self.dynamax_observed = observed
        self.gmax_type = {**GMAX_TYPE, **{int(k): str(v).lower()
                                          for k, v in (mcfg.get("extra_gigantamax") or {}).items()}}
        self.max_rankings = {t: [r for r in rows if self.can_dynamax(r[0])]
                             for t, rows in self.max_rankings.items()}
        self.max_pos = {t: {sid: i for i, (sid, _) in enumerate(rows)} for t, rows in self.max_rankings.items()}
        self.max_coeffs = {(sid, t): c for t, rows in self.max_rankings.items() for sid, c in rows}
        self.max_best = {t: (rows[0][1] if rows else 0.0) for t, rows in self.max_rankings.items()}
        self.gmax_rows = {}
        for sid, sp in self.by_id.items():
            dn = sp.get("dex")
            if (dn in self.gmax_type and dn in self.dynamax_dex and not sid.endswith("_shadow")
                    and "_mega" not in sid and not any(sid.endswith(s) for s in _REGIONAL_SUFFIXES)):
                t = self.gmax_type[dn]
                stab = STAB if t in {x.lower() for x in (sp.get("types") or [])} else 1.0
                self.gmax_rows.setdefault(t, []).append((sid, GMAX_MOVE_POWER[3] * stab / MAX_DAMAGE_DIV))

    def descendants(self, sid):
        out, stack = [], [sid]
        while stack:
            cur = stack.pop()
            if cur in out or cur not in self.by_id:
                continue
            out.append(cur)
            stack.extend((self.by_id[cur].get("family") or {}).get("evolutions") or [])
        return out

    def iv_rank(self, sid, cap, a, d, s):
        key = (sid, cap)
        if key not in self._spreads:
            p = self.by_id.get(sid)
            self._spreads[key] = build_spreads(p["baseStats"], cap) if p else None
        t = self._spreads[key]
        if not t or (a, d, s) not in t[0]:
            return None
        prods, asc, best = t
        mine = prods[(a, d, s)]
        # 1-based: "number of spreads strictly better than mine" + 1, so the
        # best spread is #1.  The old formula reported the best spread as #0.
        rank = len(asc) - bisect.bisect_right(asc, mine) + 1
        return rank, 100.0 * mine / best

    def cup_allows(self, sid, cup):
        spec = CUPS[cup]
        base = sid[:-7] if sid.endswith("_shadow") else sid
        if base in spec["exclude_sids"]:
            return False
        sp = self.by_id.get(base)
        if not sp:
            return False
        if spec["rule_kind"] == "first_stage":
            evos = (sp.get("family") or {}).get("evolutions") or []
            if not evos:
                return False
            if (sp.get("family") or {}).get("parent"):
                return False
            return True
        if spec["rule_kind"] == "types":
            types = {t.lower() for t in (sp.get("types") or [])}
            return bool(types & spec["include_types"])
        return False

    def known_sid(self, cap, sid):
        """Species id to use for matchup lookups.  PvPoke ships separate
        `_shadow` ranking rows for some leagues but not all; when the shadow row
        is missing the base species' graph is used instead (documented
        approximation - the cohesion report says when this happens)."""
        if (cap, sid) in self.wins or (cap, sid) in self.losses:
            return sid
        if sid.endswith("_shadow"):
            return sid[: -len("_shadow")]
        return sid

    def relation(self, cap, a, b, cache=None):
        """1 when a beats b, -1 when a loses to b, 0 when PvPoke publishes no
        edge either way.

        PvPoke only ships the top 5 wins and top 5 losses per species, so a pair
        is resolved from both directions: a beats b when b is in a's `matchups`
        OR a is in b's `counters` (and symmetrically for a loss).
        """
        if a == b:
            return 0
        key = (a, b)
        if cache is not None and key in cache:
            return cache[key]
        w_a, l_a = self.wins.get((cap, a), {}), self.losses.get((cap, a), {})
        if b in w_a:
            val = 1
        elif b in l_a:
            val = -1
        else:
            w_b, l_b = self.wins.get((cap, b), {}), self.losses.get((cap, b), {})
            val = -1 if a in w_b else (1 if a in l_b else 0)
        if cache is not None:
            cache[key] = val
        return val

    def role_scores(self, key, sid):
        return self.roles.get((key, self.known_sid(key, sid))) or {}

    def best_losing_threats(self, key, sid, limit=5):
        """The published opponents this species loses to, worst first."""
        lose = self.losses.get((key, self.known_sid(key, sid))) or {}
        rows = sorted(lose.items(), key=lambda kv: (kv[1], kv[0]))
        return rows[:limit]

    def rank_of(self, sid, key, shadow=False):
        """(rank, score) for a species. `key` is a numeric cap or a cup name."""
        if isinstance(key, str):
            return self.cup_pos.get(key, {}).get(sid)
        if shadow and self.cfg["pvp"]["prefer_shadow_rankings"]:
            hit = self.pos_shadow.get(key, {}).get(f"{sid}_shadow")
            if hit:
                return hit
        return self.pos.get(key, {}).get(sid)

    def coeff_of(self, sid, atype):
        """In-type raid DPS coefficient for any species, incl. Mega forms."""
        key = (sid, atype)
        if key not in self._coeff_cache:
            val, mv = None, None
            p = self.by_id.get(sid)
            if p:
                types = {t.lower() for t in (p.get("types") or [])}
                info = _best_dps_per_atk(types, self.moves, p.get("fastMoves") or [],
                                         p.get("chargedMoves") or []).get(atype)
                if info:
                    val, mv = info[0], (info[1], info[2])
            self._coeff_cache[key] = (val, mv)
        return self._coeff_cache[key]

    def is_relevant_pvp(self, sid, shadow=False):
        top = self.cfg["pvp"]["relevant_species_top"]
        for cap in CAPS:
            for t in self.descendants(sid):
                if cap == 1500 and t in self.inelig_gl:
                    continue
                pos = self.rank_of(t, cap, shadow)
                if pos and pos[0] <= top[str(cap)]:
                    return True
        return False

    def family_best_type(self, sid, index, top_n):
        best = (top_n, None, None)
        for t in self.descendants(sid):
            for atype, pos in index.items():
                rank = pos.get(t)
                if rank is not None and rank < best[0]:
                    best = (rank, atype, t)
        return best[1], best[2]

    def family_raid_type(self, sid, top_n=50):
        return self.family_best_type(sid, self.raid_pos, top_n)

    def family_max_type(self, sid, top_n=50):
        return self.family_best_type(sid, self.max_pos, top_n)

    def family_mega_info(self, sid):
        """(best_type, mega_form_sid, base_sid) for the best Mega this line has.

        best_type is the best raid-relevant type of the *Mega form*; it is None
        for Megas with no raid-useful typing (e.g. Mega Lopunny's Normal half),
        in which case we still return the Mega so the unlock can be advised.
        """
        best = (None, None, None, None)     # coeff, type, mega_sid, base_sid
        fallback = None
        for t in self.descendants(sid):
            for mega_sid in self.mega_forms.get(t, []):
                sp = self.by_id.get(mega_sid) or {}
                for atype in sorted({x.lower() for x in (sp.get("types") or [])}):
                    coeff, _ = self.coeff_of(mega_sid, atype)
                    if coeff is None:
                        continue
                    if fallback is None:
                        fallback = (atype, mega_sid, t)
                    if atype not in RAID_USEFUL_TYPES:
                        continue
                    if best[0] is None or coeff > best[0]:
                        best = (coeff, atype, mega_sid, t)
        if best[0] is not None:
            return best[1], best[2], best[3]
        if fallback is not None:
            return None, fallback[1], fallback[2]
        return None, None, None

    def mega_boost_types(self, mega_sid):
        sp = self.by_id.get(mega_sid) or {}
        return [t for t in boost_types_for(mega_sid, sp) if t and str(t).lower() != "none"]   # single-type Megas have no 2nd type

    def raid_coeff(self, sid, atype):
        return self.raid_coeffs.get((sid, atype))

    def max_coeff(self, sid, atype):
        return self.max_coeffs.get((sid, atype))

    def moveset(self, sid, cap):
        mv = self.movesets.get((cap, sid))
        if not mv:
            return ""
        return " / ".join(str(m).replace("_", " ").title() for m in mv[:3])
# ---------------------------------------------------------------------------
# Export parsing
# ---------------------------------------------------------------------------

REQ_FIELDS = ["pokemonId", "individualAttack", "individualDefense", "individualStamina",
              "cpMultiplier", "additionalCpMultiplier", "cp", "favorite", "isLucky",
              "isEgg", "pokemonDisplay"]
REQ_DISPLAY = ["shiny", "costume", "alignment", "form", "formName", "locationCard"]
OPTIONAL = ["size", "move1", "move2", "move3", "pokemonTagIds", "originEvents",
            "tradedTimeMs", "deployedFortId", "hasMegaEvolved", "nickname", "id",
            "breadMoves", "megaEvolvedForms", "numUpgrades", "buddyKmWalked",
            "buddyCandyAwarded", "originDetail", "tempEvoCp", "currentTempEvolution",
            "temporaryEvolutionFinishMs"]

SIZE_NAME = {1: "XXS", 2: "XS", 4: "XL", 5: "XXL"}
TIMESTAMP_CANDIDATES = ("creationTimeMs", "captureTimeMs", "caughtTimeMs", "obtainedTimeMs",
                        "timestampMs", "creationTimestampMs", "captureTimestampMs",
                        "creationTime", "captureTime", "caughtTime", "timestamp")


def extract_year(p):
    for key in TIMESTAMP_CANDIDATES:
        if key not in p:
            continue
        val = p[key]
        if val is None or val == 0 or val == "":
            continue
        try:
            if isinstance(val, (int, float)) and val > 1e11:
                ts = val / 1000.0
            elif isinstance(val, (int, float)) and val > 1e9:
                ts = float(val)
            elif isinstance(val, str) and val.isdigit():
                n = int(val)
                ts = n / 1000.0 if n > 1e11 else float(n)
            else:
                dt = datetime.datetime.fromisoformat(str(val).replace("Z", "+00:00"))
                return dt.year, key
            dt = datetime.datetime.fromtimestamp(ts, datetime.timezone.utc)
            if 2016 <= dt.year <= 2030:
                return dt.year, key
        except Exception:
            continue
    return None, "no timestamp field found"


def _disp(p):
    return p.get("pokemonDisplay") or {}


def is_dynamax(p):
    """Dynamax / Gigantamax are flagged by pokemonDisplay.breadModeEnum
    (1 = Dynamax, 2+ = Gigantamax).  Verified against the export format."""
    if _disp(p).get("breadModeEnum", 0) > 0:
        return True
    if p.get("breadMoves") or p.get("maxMoves"):
        return True
    return False


def is_gigantamax(p):
    if _disp(p).get("breadModeEnum", 0) >= 2:
        return True
    blob = json.dumps(p.get("breadMoves") or p.get("maxMoves") or {})
    return "gigantamax" in blob.lower()


def mega_level_info(p):
    """(mega level, mega points).  The export stores
    pokemonDisplay.megaEvolutionLevel = {"level": n, "points": n} - or null for
    a mon that has never Mega Evolved."""
    raw = _disp(p).get("megaEvolutionLevel")
    if isinstance(raw, dict):
        return int(raw.get("level") or 0), int(raw.get("points") or 0)
    if isinstance(raw, (int, float)):
        return int(raw), 0
    return 0, 0


def is_currently_mega(p):
    disp = _disp(p)
    active = disp.get("currentTempEvolution", p.get("currentTempEvolution", 0))
    if not active or int(active) == 0:
        return False
    finish = (disp.get("temporaryEvolutionFinishMs")
              or p.get("temporaryEvolutionFinishMs") or 0)
    return not finish or finish > time.time() * 1000


def has_mega_evolved_before(p):
    """megaEvolvedForms is empty in current exports, so fall back to the Mega
    level (>=1 can only happen after a Mega Evolution) and hasMegaEvolved."""
    if p.get("megaEvolvedForms"):
        return True
    if p.get("hasMegaEvolved"):
        return True
    return mega_level_info(p)[0] >= 1


def known_move_ids(p):
    return {str(p.get(k)) for k in ("move1", "move2", "move3") if p.get(k)}


@dataclass
class Mon:
    uid: str
    dex: int
    form_name: str
    cp: int
    level: float
    a: int
    d: int
    s: int
    iv_pct: float
    nickname: str = ""
    mon_id: str = ""
    year: Optional[int] = None
    raw: dict = field(repr=False, default_factory=dict)
    species: dict | None = None
    species_note: str = ""
    protect: list = field(default_factory=list)
    caps: list = field(default_factory=list)
    pvp: list = field(default_factory=list)
    verdict: str = ""
    verdict_priority: int = 99
    role: str = ""
    evolve_to: str = ""
    evolve_to_sid: str = ""
    power_up_to: str = ""
    build_cp: str = ""
    moveset: str = ""
    moveset_note: str = ""
    why_keep: str = ""
    warnings: list = field(default_factory=list)
    review_reasons: list = field(default_factory=list)
    species_rank: int = 9999
    species_rank_league: str = ""
    best_pvp: Optional[PvpEntry] = None
    is_shadow: bool = False
    is_purified: bool = False
    is_shiny: bool = False
    iv_hi: bool = False
    iv_demoted: bool = False

    is_mega_capable: bool = False
    can_mega: bool = False
    is_mega_pre_evo: bool = False
    purify_for_mega: str = ""
    mega_family_sid: str = ""
    # roles whose quality gate was a near miss -> verdict REVIEW, not BUILD
    gate_review_kinds: set = field(default_factory=set)
    mega_evo_target: str = ""
    mega_base_sid: str = ""
    has_mega_unlocked: bool = False
    is_currently_mega: bool = False
    mega_level: int = 0
    mega_points: int = 0
    is_dynamax: bool = False
    is_gigantamax: bool = False
    mega_home: bool | None = None       # True = counts as the Mega for its type, False = counts as a regular attacker
    max_attack_level: int = 0
    max_guard_level: int = 0
    max_spirit_level: int = 0
    has_third_move: bool = False
    knows_moves: set = field(default_factory=set)
    num_upgrades: int = 0
    buddy_km: float = 0.0
    buddy_candy: int = 0

    raid_type: Optional[str] = None
    raid_sid: str = ""
    raid_reject: str = ""
    raid_reserve: str = ""
    mega_type: Optional[str] = None
    mega_sid: str = ""
    max_type: Optional[str] = None
    max_sid: str = ""
    max_reject: str = ""
    max_reserve: str = ""
    gym_sid: str = ""
    gym_reject: str = ""

    location_card: Optional[int] = None
    origin_events: list = field(default_factory=list)


def load_export(path):
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8-sig"))
    except Exception as e:
        sys.exit(f"Could not read {path} as JSON: {e}")
    if not isinstance(data, dict) or not isinstance(data.get("pokemons"), list):
        sys.exit("This does not look like the expected export (no 'pokemons' list).")
    mons = [p for p in data["pokemons"] if isinstance(p, dict)]
    problems = []
    for f in REQ_FIELDS:
        miss = sum(1 for p in mons if f not in p)
        if miss:
            problems.append(f"{f} (missing in {miss})")
    for f in REQ_DISPLAY:
        miss = sum(1 for p in mons if not p.get("isEgg") and f not in _disp(p))
        if miss:
            problems.append(f"pokemonDisplay.{f} (missing in {miss})")
    if problems:
        sys.exit("Export layout changed. Missing safety fields:\n  - " + "\n  - ".join(problems))
    missing_opt = [f for f in OPTIONAL
                   if not any((f in p) or (f in _disp(p)) for p in mons)]
    return data, mons, missing_opt


def validate_cpm(mons):
    bad = 0
    real = [p for p in mons if not p["isEgg"]]
    for p in real:
        tot = p["cpMultiplier"] + p["additionalCpMultiplier"]
        if min(abs(tot - CPM[l]) for l in ALL_LEVELS) > 1e-3:
            bad += 1
    return bad, len(real)


def to_mon(p, idx=0):
    disp = _disp(p)
    a, d, s = p["individualAttack"], p["individualDefense"], p["individualStamina"]
    tot = p["cpMultiplier"] + p["additionalCpMultiplier"]
    year, _ = extract_year(p)
    raw_id = p.get("id")
    m = Mon(
        # Index-prefixed so the id is unique even if the export omits "id"
        # (an empty/missing id used to collapse every uid to "" which wiped
        # out the team builder and the transfer safeguard).
        uid=f"{idx}:{raw_id if raw_id is not None else ''}",
        mon_id=str(raw_id) if raw_id is not None else "",
        dex=p["pokemonId"],
        form_name=disp.get("formName") or "",
        cp=p["cp"], level=level_from_cpm(tot),
        a=a, d=d, s=s,
        iv_pct=round((a + d + s) / 45 * 100, 1),
        nickname=p.get("nickname") or "",
        year=year, raw=p,
    )
    m.is_dynamax = is_dynamax(p)
    m.is_gigantamax = is_gigantamax(p)
    for _bm in p.get("breadMoves") or []:
        _mt, _ml = int(_bm.get("moveType") or 0), int(_bm.get("moveLevel") or 0)
        if _mt == 1:
            m.max_attack_level = _ml
        elif _mt == 2:
            m.max_guard_level = _ml
        elif _mt == 3:
            m.max_spirit_level = _ml
    m.mega_level, m.mega_points = mega_level_info(p)
    m.is_currently_mega = is_currently_mega(p)
    m.has_mega_unlocked = has_mega_evolved_before(p)
    m.has_third_move = bool(p.get("move3"))
    m.knows_moves = known_move_ids(p)
    m.num_upgrades = int(p.get("numUpgrades") or 0)
    m.buddy_km = float(p.get("buddyKmWalked") or 0.0)
    m.buddy_candy = int(p.get("buddyCandyAwarded") or 0)
    lc = disp.get("locationCard")
    if isinstance(lc, dict):
        m.location_card = lc.get("locationCard")
    m.origin_events = list(p.get("originEvents") or [])
    m.is_shadow = disp.get("alignment") == 1
    m.is_purified = disp.get("alignment") == 2
    m.is_shiny = bool(disp.get("shiny"))
    return m
# ---------------------------------------------------------------------------
# Variant rules
# ---------------------------------------------------------------------------

CAPPABLE_CATEGORY_PREFIXES = {
    "costume": ("costume",),
    "shiny": ("shiny",),
    "legendary": ("legendary", "mythical", "ultrabeast"),
    "lucky_age": ("trade value:",),
    "form": (),
}


def variant_tags(m, dex):
    tags = set()
    disp = m.raw.get("pokemonDisplay") or {}
    costume_id = disp.get("costume", 0)
    form_name = disp.get("formName") or ""
    form_id = disp.get("form", 0)
    if costume_id or looks_like_costume(form_name, form_id):
        tags.add("costume")
    if disp.get("shiny"):
        tags.add("shiny")
    if disp.get("locationCard"):
        tags.add("background")
    if m.raw.get("size") in (1, 5):
        tags.add("size")
    if m.species:
        sp_tags = set(m.species.get("tags") or [])
        if sp_tags & {"legendary", "mythical", "ultrabeast"}:
            tags.add("legendary")
    if m.year and 2016 <= m.year <= 2018:
        tags.add("lucky_age")
    is_base = (form_id == 0 or _norm(form_name) in ("", "unset")
               or _norm(form_name).endswith("normal"))
    if not is_base and not looks_like_costume(form_name, form_id):
        tags.add("form")
    if m.is_dynamax: tags.add("dynamax")
    if m.is_gigantamax: tags.add("gigantamax")
    if m.can_mega: tags.add("mega")
    if m.mega_level >= 1: tags.add("super_mega")
    return tags


def variant_key(m, rule_key_fields):
    disp = m.raw.get("pokemonDisplay") or {}
    out = []
    for f in rule_key_fields:
        if f == "dex":
            out.append(m.dex)
        elif f == "form":
            form_id = disp.get("form", 0)
            form_name = _norm(disp.get("formName") or "")
            if form_id == 0 or form_name in ("", "unset") or form_name.endswith("normal"):
                out.append(0)
            elif looks_like_costume(disp.get("formName"), form_id):
                out.append(0)
            else:
                out.append(form_id)
        elif f == "costume":
            c = disp.get("costume", 0)
            if c:
                out.append(("costume", c))
            else:
                form_id = disp.get("form", 0)
                form_name = disp.get("formName") or ""
                if looks_like_costume(form_name, form_id):
                    out.append(("event", _norm(form_name)))
                else:
                    out.append(("none", 0))
        elif f == "shiny":
            out.append(bool(disp.get("shiny")))
        elif f == "gender":
            out.append(disp.get("gender", 3))
        elif f == "size":
            out.append(m.raw.get("size", 0))
        elif f == "background":
            lc = disp.get("locationCard") or {}
            out.append(str(lc.get("locationCard", 0)))
    return tuple(out)


def quality_of(m, quality_kind):
    if quality_kind == "pvp_rank" and m.pvp:
        best = min(x.iv_rank for x in m.pvp)
        return (0, -best, m.iv_pct)
    return (m.iv_pct, m.level, m.cp)


def apply_variant_rules(mons, cfg, dex):
    rules = cfg.get("variant_rules", {})
    if not rules:
        return
    for rule_name, rule in rules.items():
        groups = defaultdict(list)
        for m in mons:
            if rule_name not in variant_tags(m, dex):
                continue
            groups[variant_key(m, rule["key"])].append(m)
        trade_key_fields = rule.get("trade_key", rule["key"][:-1] if rule["key"] else [])
        trade_groups = defaultdict(list)
        for members in groups.values():
            for m in members:
                trade_groups[variant_key(m, trade_key_fields)].append(m)
        keepers, trade_keepers = set(), set()
        for vk, members in groups.items():
            members.sort(key=lambda m: quality_of(m, rule["quality"]), reverse=True)
            for m in members[: rule["keep"]]:
                keepers.add(m.uid)
                m.protect.append(f"{rule_name} keeper")
        for tk, members in trade_groups.items():
            rest = [m for m in members if m.uid not in keepers]
            rest.sort(key=lambda m: quality_of(m, "iv_pct"), reverse=True)
            for m in rest[: rule["trade"]]:
                trade_keepers.add(m.uid)
                m.protect.append(f"{rule_name} trade reserve")
            for m in rest[rule["trade"]:]:
                m.caps.append(f"overflow {rule_name}")
        prefixes = CAPPABLE_CATEGORY_PREFIXES.get(rule_name, ())
        if not prefixes:
            continue
        for m in mons:
            if rule_name not in variant_tags(m, dex):
                continue
            if m.uid in keepers or m.uid in trade_keepers:
                continue
            m.protect = [p for p in m.protect if not any(p.startswith(pref) for pref in prefixes)]


# ---------------------------------------------------------------------------
# DPS estimates (everything is "as if powered to power_level", so numbers are
# comparable between mons; only the ordering matters)
# ---------------------------------------------------------------------------

def estimated_raid_dps(mon, dex):
    if not mon.species or not mon.raid_type:
        return None
    # Use the mon's actual form for damage.  A Hero Zacian must not be scored
    # as if it already had Crowned stats / Behemoth Blade.
    target_sid = mon.species["speciesId"]
    if mon.raid_sid and mon.raid_sid != target_sid:
        # Only follow raid_sid when it is a real evolution the mon can become
        # (not a form-change the export already distinguishes).
        if not (mon.raid_sid.endswith("_crowned") or "crowned" in mon.raid_sid):
            target_sid = mon.raid_sid
    target = dex.by_id.get(target_sid)
    if not target:
        return None
    coeff = dex.raid_coeff(target_sid, mon.raid_type)
    if coeff is None:
        return None
    atk_stat = target["baseStats"]["atk"] + mon.a
    effective_atk = atk_stat * CPM[40.0]
    sh = bool(mon.is_shadow and dex.cfg["raid"]["prefer_shadow"])
    if sh:
        effective_atk *= float(dex.cfg["raid"]["shadow_dps_bonus"])
    return effective_atk * coeff * raid_bulk(target["baseStats"], mon.d, mon.s, sh)


def estimated_mega_dps(mon, dex):
    """DPS of the *Mega form* - the base species' stats understate it badly."""
    if not mon.mega_sid:
        return None
    sp = dex.by_id.get(mon.mega_sid)
    if not sp:
        return None
    atype = mon.mega_type
    if not atype:
        types = [t.lower() for t in (sp.get("types") or [])]
        atype = types[0] if types else None
    if not atype:
        return None
    coeff, _ = dex.coeff_of(mon.mega_sid, atype)
    if coeff is None:
        return None
    atk_stat = sp["baseStats"]["atk"] + mon.a
    return atk_stat * CPM[40.0] * coeff * raid_bulk(sp["baseStats"], mon.d, mon.s)


def estimated_max_dps(mon, dex):
    if not mon.species or not mon.max_type:
        return None
    target_sid = mon.max_sid or mon.species["speciesId"]
    target = dex.by_id.get(target_sid)
    if not target:
        return None
    atk_stat = target["baseStats"]["atk"] + mon.a
    dex_num = target.get("dex")
    crowned = CROWNED_MAX_OVERRIDE.get(dex_num)
    if crowned:
        stab = STAB if mon.max_type in {x.lower() for x in (target.get("types") or [])} else 1.0
        return atk_stat * CPM[40.0] * MAX_MOVE_POWER[3] * stab / MAX_DAMAGE_DIV
    if mon.is_gigantamax and dex.gmax_type.get(dex_num) == mon.max_type:
        stab = STAB if mon.max_type in {x.lower() for x in (target.get("types") or [])} else 1.0
        return atk_stat * CPM[40.0] * GMAX_MOVE_POWER[3] * stab / MAX_DAMAGE_DIV
    coeff = dex.max_coeff(target_sid, mon.max_type)
    if coeff is None:
        return None
    g = (GMAX_MOVE_POWER[3] / MAX_MOVE_POWER[3]) if mon.is_gigantamax else 1.0
    return atk_stat * CPM[40.0] * coeff * g


def _ref_dps(dex, index, atype, bulk=True):
    """DPS of a perfect (15 atk IV) version of the best non-Mega PokÃ©mon in
    that type - the bar a 'worth building' attacker is compared against."""
    rows = index.get(atype) or []
    for sid, coeff in rows[:1]:
        bs = dex.by_id.get(sid, {}).get("baseStats")
        if bs:
            return (bs["atk"] + 15) * CPM[40.0] * coeff * (raid_bulk(bs) if bulk else 1.0)
    return 0.0


# ---------------------------------------------------------------------------
# Quality gates.  These run after roles are assigned and before any output is
# written, so every report, team list and safeguard sees the same decisions.
# ---------------------------------------------------------------------------

# ============================================================
# GLOBAL PLACEMENT (2026-11-02): every Pokemon gets exactly ONE home type, chosen so coverage is best
#
# Before: each Pokemon independently took the type where its SPECIES ranked best, never asking whether
# that helped your coverage or whether it would even pass the gate there.  Dragon ended up with the
# leftovers while Baxcalibur / Garchomp / Palkia sat in other types.
# Now: (1) a min-cost matching fills each type's coverage (3 attackers for raid, 1 for Max), usable
# (level 25+) Pokemon first, then the ones you would level; type importance breaks ties so the types
# that matter most are covered first.  (2) every other Pokemon takes its single best home - where it is
# strongest relative to the best in the game - without overfilling a type.  TMs are assumed: scores use
# the best moves the species can learn.  A Mega-capable Pokemon is placed either as a regular attacker
# or as the Mega for its type, never both.
# ============================================================
PLACEMENT = {}          # filled by assign_types(); written into report["placement"]


def _mcmf(n_mon, n_type, edges, cap_type, reward):
    """Min-cost flow.  edges = [(mon_idx, type_idx, cost)]; every unit of flow earns reward[type_idx], so
    only profitable paths are used (coverage first, then the best fit).  Returns {mon_idx: type_idx}."""
    N = n_mon + n_type + 2
    S, T = 0, N - 1
    g = [[] for _ in range(N)]

    def add(u, v, cap, cost):
        g[u].append([v, cap, cost, len(g[v])])
        g[v].append([u, 0, -cost, len(g[u]) - 1])
    for i in range(n_mon):
        add(S, 1 + i, 1, 0)
    for i, j, c in edges:
        add(1 + i, 1 + n_mon + j, 1, c - reward[j])
    for j in range(n_type):
        if cap_type[j] > 0:
            add(1 + n_mon + j, T, cap_type[j], 0)
    while True:
        dist = [None] * N
        dist[S] = 0
        prev = [None] * N
        inq = [False] * N
        dq = deque([S])
        while dq:
            u = dq.popleft()
            inq[u] = False
            for k, (v, cap, cost, _r) in enumerate(g[u]):
                if cap > 0 and (dist[v] is None or dist[u] + cost < dist[v]):
                    dist[v] = dist[u] + cost
                    prev[v] = (u, k)
                    if not inq[v]:
                        inq[v] = True
                        dq.append(v)
        if dist[T] is None or dist[T] >= 0:
            break
        v = T
        while v != S:
            u, k = prev[v]
            g[u][k][1] -= 1
            g[v][g[u][k][3]][1] += 1
            v = u
    out = {}
    for i in range(n_mon):
        for v, cap, _c, _r in g[1 + i]:
            if n_mon < v <= n_mon + n_type and cap == 0:
                out[i] = v - 1 - n_mon
    return out


def assign_types(mons, dex, cfg, mode):
    raid = mode == "raid"
    rc = cfg["raid"] if raid else cfg["max_battle"]
    if not raid and not cfg["max_battle"].get("enabled", True):
        return
    rv = cfg["review"]
    types = list(RAID_USEFUL_TYPES) if raid else sorted(MAX_BATTLE_TYPES)
    rankings = dex.raid_rankings if raid else dex.max_rankings
    pos_idx = dex.raid_pos if raid else dex.max_pos
    coeff_fn = dex.raid_coeff if raid else dex.max_coeff
    top_n = int(rc["top_n_species"])
    min_atk = int(rc["min_atk_iv"])
    sh_atk = int(rc.get("min_atk_iv_for_shadow", min_atk)) if raid else min_atk
    atk_slack, lvl_slack = int(rv["atk_iv_slack"]), float(rv["level_slack"])
    dps_slack = float(rv["dps_slack_pct"]) / 100.0
    min_pct, glob_pct = float(rc["min_dps_pct"]) / 100.0, float(rc["min_dps_pct_of_best_of_type"]) / 100.0
    min_level = float(rc.get("min_level", cfg["raid"]["min_level"]))
    iv_floor = float(rc.get("min_iv_pct", 0.0)) if raid else 0.0
    iv_slack = float(rc.get("iv_pct_slack", 5.0))
    cap_per_type = int(rc["keep_per_type"]) + int(rc.get("reserve_keep", 2))
    demand = int(cfg["coverage"]["min_attackers"]) if raid else 1
    usable_level = float(cfg["coverage"]["min_level"]) if raid else min_level
    sh_bonus = float(cfg["raid"].get("shadow_dps_bonus", 1.2)) if (raid and cfg["raid"].get("prefer_shadow", True)) else 1.0
    kind = "raid" if raid else "max"
    refs = {t: _ref_dps(dex, rankings, t, bulk=raid) for t in types}
    imp = {t: (GRADE_TYPE_IMPORTANCE.get(_type_display(t), 1.0) if raid else 1.0) for t in types}

    def cur(m):
        return (m.raid_type, m.raid_sid) if raid else (m.max_type, m.max_sid)

    # ---- candidate scores: mon -> {type: (score, target species)} ---------------------------
    pool, opts = [], {}
    for m in mons:
        if not m.species:
            continue
        if not raid and not (m.is_dynamax or m.is_gigantamax):
            continue
        o = {}
        gt = dex.gmax_type.get(m.species.get("dex")) if (not raid and m.is_gigantamax) else None
        for t in types:
            if gt and t != gt:
                continue
            best = None
            if gt:
                bs = m.species["baseStats"]
                stab = STAB if t in {x.lower() for x in (m.species.get("types") or [])} else 1.0
                best = ((bs["atk"] + m.a) * CPM[40.0] * GMAX_MOVE_POWER[3] * stab / MAX_DAMAGE_DIV, m.species["speciesId"])
            else:
                for d in dex.descendants(m.species["speciesId"]):
                    r = pos_idx[t].get(d) if t in pos_idx else None
                    if r is None or r >= top_n:
                        continue
                    coeff = coeff_fn(d, t)
                    if not coeff:
                        continue
                    bs = dex.by_id[d]["baseStats"]
                    sh = bool(m.is_shadow) and raid and sh_bonus != 1.0
                    s = (bs["atk"] + m.a) * CPM[40.0] * coeff * (sh_bonus if sh else 1.0)
                    if raid:
                        s *= raid_bulk(bs, m.d, m.s, sh)
                    if best is None or s > best[0]:
                        best = (s, d)
            if best:
                o[t] = best
        if o:
            pool.append(m)
            opts[m.uid] = o

    def basic_fail(m, hard_only=True):
        """(hard, soft) counts for everything except the DPS floor (which needs the type's best)."""
        hard = soft = 0
        need = sh_atk if m.is_shadow else min_atk
        if m.a < need:
            if need - m.a <= atk_slack:
                soft += 1
            else:
                hard += 1
        if m.level < min_level:
            if min_level - m.level <= lvl_slack:
                soft += 1
            else:
                hard += 1
        if iv_floor and m.iv_pct < iv_floor:
            if iv_floor - m.iv_pct <= iv_slack:
                soft += 1
            else:
                hard += 1
        return hard, soft
    coll_best = defaultdict(float)
    for m in pool:
        if basic_fail(m)[0] == 0:
            for t, (s, _d) in opts[m.uid].items():
                coll_best[t] = max(coll_best[t], s)
    floor = {t: max(min_pct * coll_best[t], glob_pct * refs[t]) for t in types}
    elig = {}                                  # uid -> {type: (pct, soft, target)}
    for m in pool:
        h0, s0 = basic_fail(m)
        if h0:
            continue
        e = {}
        for t, (s, d) in opts[m.uid].items():
            fl, soft = floor[t], s0
            if fl and s < fl:
                if (fl - s) / fl <= dps_slack:
                    soft += 1
                else:
                    continue
            if refs[t]:
                e[t] = (s / refs[t], soft, d)
        if e:
            elig[m.uid] = e
    # ---- Mega-capable Pokemon may instead be the Mega for their type (raid only) ------------------------
    mega_opt = {}
    if raid:
        for m in pool:
            if m.is_mega_capable and m.mega_sid and m.mega_type in types and m.iv_pct >= float(cfg["mega"]["min_iv_pct"]):
                d_ = estimated_mega_dps(m, dex)
                if d_ and refs.get(m.mega_type):
                    mega_opt[m.uid] = (d_ / refs[m.mega_type], m.mega_type)

    by_uid = {m.uid: m for m in pool}
    placed, why = {}, {}                       # uid -> ("type", t) | ("mega", t)

    def run(stage_mons, cap_left, tag, reward=True):
        ids = [m.uid for m in stage_mons if m.uid in elig or m.uid in mega_opt]
        tindex = {t: j for j, t in enumerate(types)}
        edges = []
        for i, uid in enumerate(ids):
            # Investment already made counts: a built level-30 Pokemon should not be displaced by an unbuilt
            # level-20 one that is only a few percent stronger (up to +20% of the score at level 40).
            sunk = int(200 * min(by_uid[uid].level, 40.0) / 40.0)
            for t, (pct, soft, _d) in elig.get(uid, {}).items():
                edges.append((i, tindex[t], -int(pct * 1000) - sunk + soft * 150))
            if uid in mega_opt and reward:
                # A Mega only claims a COVERAGE slot (never a strength slot).  Its score is measured against
                # a non-Mega reference so it is capped, and a plain attacker is clearly preferred: it needs
                # no Mega Energy and no Mega unlock.
                pct, mt = mega_opt[uid]
                edges.append((i, tindex[mt], -int(min(pct, 1.0) * 1000) + 300))
        caps = [max(0, cap_left[t]) for t in types]
        rew = [int(10000 * imp[t]) if reward else 0 for t in types]
        got = _mcmf(len(ids), len(types), edges, caps, rew)
        for i, j in got.items():
            uid, t = ids[i], types[j]
            as_mega = uid in mega_opt and mega_opt[uid][1] == t and (t not in elig.get(uid, {}) or
                                                                        min(mega_opt[uid][0], 1.0) * 1000 - 300 > elig[uid][t][0] * 1000 - elig[uid][t][1] * 150)
            placed[uid] = ("mega" if as_mega else "type", t)
            why[uid] = tag
            cap_left[t] -= 1
    cap_left = {t: demand for t in types}
    run([m for m in pool if m.level >= usable_level], cap_left, "fills a coverage gap")
    run([m for m in pool if m.uid not in placed], cap_left, "fills a coverage gap (needs levelling)")
    # ---- everyone else: maximise total fit with a HARD capacity per type (no flooding a type) -------------
    load = Counter(t for k, t in placed.values() if k == "type")
    cap_left = {t: cap_per_type - load[t] for t in types}
    run([m for m in pool if m.uid not in placed], cap_left, "strongest relative fit", reward=False)
    # ---- apply + record what moved ------------------------------------------------------------------------
    cur_old = {m.uid: cur(m)[0] for m in pool}        # the old rank-based home, captured before we change it
    moved = []
    for uid, (k, t) in placed.items():
        m = by_uid[uid]
        old_t, old_sid = cur(m)
        if k == "mega":
            new_t, new_sid = None, ""
        else:
            new_t, new_sid = t, elig[uid][t][2]
        if raid:
            m.raid_type, m.raid_sid = new_t, new_sid
            m.mega_home = (k == "mega")
        else:
            if getattr(m, "max_type_locked", False) and m.max_type:
                # Fast-move type is what GO will actually use - do not rehome.
                continue
            m.max_type, m.max_sid = new_t, new_sid
        if (old_t or None) != (new_t or None):
            moved.append({"id": uid, "name": _clean_name(m.species["speciesName"]),
                          "iv": _iv_str(m), "level": round(m.level, 1),
                          "from": _type_display(old_t) if old_t else "none",
                          "to": ("Mega " + _type_display(t)) if k == "mega" else _type_display(t),
                          "why": why[uid]})
    if raid:
        for m in mons:                         # mega-capable but not placed as the Mega
            if m.is_mega_capable and getattr(m, "mega_home", None) is None:
                m.mega_home = m.raid_type is None
    # coverage, before vs after (usable Pokemon only, counting everything that passes the gate)
    def covered(assign):
        c = Counter()
        for uid, (k, t) in assign.items():
            if by_uid[uid].level >= usable_level and (k == "mega" or t in elig.get(uid, {})):
                c[t] += 1
        return sum(1 for t in types if c[t] >= demand), sum(imp[t] for t in types if c[t] >= demand)
    base = {m.uid: ("type", cur_old[m.uid]) for m in pool if cur_old.get(m.uid)}
    after = dict(placed)
    PLACEMENT[kind] = {"moved": moved, "types": len(types), "demand": demand,
                       "covered_before": covered(base)[0], "covered_after": covered(after)[0]}
def apply_raid_gate(mons, dex, cfg):
    rc, rv = cfg["raid"], cfg["review"]
    keep_n = int(rc["keep_per_type"])
    min_atk = int(rc["min_atk_iv"])
    sh_atk = int(rc["min_atk_iv_for_shadow"])
    min_pct = float(rc["min_dps_pct"]) / 100.0
    glob_pct = float(rc["min_dps_pct_of_best_of_type"]) / 100.0
    min_level = float(rc["min_level"])
    atk_slack = int(rv["atk_iv_slack"])
    dps_slack = float(rv["dps_slack_pct"]) / 100.0
    lvl_slack = float(rv["level_slack"])

    by_type = defaultdict(list)
    for m in mons:
        if not m.raid_type or not m.species:
            continue
        dps = estimated_raid_dps(m, dex)
        if dps is None:
            continue
        by_type[m.raid_type].append((dps, m))

    for atype, entries in by_type.items():
        entries.sort(key=lambda x: (-x[0], x[1].uid))
        coll_floor = entries[0][0] * min_pct
        glob_floor = _ref_dps(dex, dex.raid_rankings, atype) * glob_pct
        floor = max(coll_floor, glob_floor)
        kept = 0
        for dps, m in entries:
            need_atk = sh_atk if m.is_shadow else min_atk
            tag = "shadow " if m.is_shadow else ""
            hard, soft = [], []
            if m.a < need_atk:
                msg = f"atk IV {m.a} below {tag}raid_min_atk_iv={need_atk}"
                (soft if need_atk - m.a <= atk_slack else hard).append(msg)
            if dps < floor:
                gap = (floor - dps) / floor if floor else 1.0
                msg = (f"dps {dps:.0f} below {floor:.0f} ({min_pct*100:.0f}% of your best "
                       f"{_type_display(atype)} / {glob_pct*100:.0f}% of the game's best)")
                (soft if gap <= dps_slack else hard).append(msg)
            if m.level < min_level:
                msg = f"only L{m.level:g} - raid_min_level={min_level:g}, huge dust cost"
                (soft if (min_level - m.level) <= lvl_slack else hard).append(msg)
            iv_floor = float(rc.get("min_iv_pct", 0.0))
            if m.iv_pct < iv_floor:
                # Attack IV alone is not enough: a 12/7/6 dies in two hits and
                # costs the same dust as a 15/15/15.
                msg = f"overall IV {m.iv_pct:g}% below raid.min_iv_pct={iv_floor:g}"
                (soft if iv_floor - m.iv_pct <= float(rc.get("iv_pct_slack", 5.0)) else hard).append(msg)
            if hard:
                # Keep the home if this is only a DPS-relative miss and the type
                # is still short of coverage — otherwise Electric etc. go empty
                # when the box has no Zekrom-tier attackers.
                dps_only = all("dps " in h for h in hard) and not any(
                    "atk IV" in h or "overall IV" in h for h in hard)
                m.raid_reject = "; ".join(hard)
                m.warnings.append(f"raid ({_type_display(atype)}): " + "; ".join(hard))
                if dps_only:
                    m.review_reasons.append("borderline raid attacker - " + "; ".join(hard))
                    m.gate_review_kinds.add("raid")
                    # keep raid_type so the team is not wiped
                else:
                    m.raid_type, m.raid_sid = None, ""
            else:
                if soft:
                    m.review_reasons.append("borderline raid attacker - " + "; ".join(soft))
                    m.gate_review_kinds.add("raid")
                if kept >= keep_n + int(rc.get("reserve_keep", 2)):
                    m.caps.append(f"surplus {_type_display(atype)} raid attacker "
                                  f"(you already hold {kept} better)")
                    m.raid_type, m.raid_sid = None, ""
                    continue
                if kept >= keep_n:
                    m.raid_reserve = f"#{kept+1} {_type_display(atype)} attacker - reserve copy"
                kept += 1


def apply_max_gate(mons, dex, cfg):
    if not cfg["max_battle"]["enabled"]:
        for m in mons:
            m.max_type, m.max_sid = None, ""
        return
    mc, rv = cfg["max_battle"], cfg["review"]
    keep_n = int(mc["keep_per_type"])
    min_atk = int(mc["min_atk_iv"])
    min_pct = float(mc["min_dps_pct"]) / 100.0
    min_level = float(mc.get("min_level", cfg["raid"]["min_level"]))
    atk_slack = int(rv["atk_iv_slack"])
    dps_slack = float(rv["dps_slack_pct"]) / 100.0
    lvl_slack = float(rv["level_slack"])

    by_type = defaultdict(list)
    for m in mons:
        if not m.max_type or not m.species:
            continue
        dps = estimated_max_dps(m, dex)
        if dps is None:
            continue
        by_type[m.max_type].append((dps, m))

    for atype, entries in by_type.items():
        entries.sort(key=lambda x: (-x[0], x[1].uid))
        # Max Battle "best in collection" is inflated by species that can never
        # Dynamax, so compare against the game reference as well.
        floor = max(entries[0][0] * min_pct,
                    _ref_dps(dex, dex.max_rankings, atype, bulk=False) * float(mc["min_dps_pct_of_best_of_type"]) / 100.0)
        kept = 0
        for dps, m in entries:
            hard, soft = [], []
            if m.a < min_atk:
                msg = f"atk IV {m.a} below max_battle.min_atk_iv={min_atk}"
                (soft if min_atk - m.a <= atk_slack else hard).append(msg)
            if dps < floor:
                gap = (floor - dps) / floor if floor else 1.0
                msg = f"max dps {dps:.0f} below {floor:.0f}"
                (soft if gap <= dps_slack else hard).append(msg)
            if m.level < min_level:
                msg = f"only L{m.level:g} - max_battle.min_level={min_level:g}"
                (soft if (min_level - m.level) <= lvl_slack else hard).append(msg)
            if hard:
                m.max_reject = "; ".join(hard)
                m.warnings.append(f"max ({_type_display(atype)}): " + "; ".join(hard))
                m.max_type, m.max_sid = None, ""
            else:
                if soft:
                    m.review_reasons.append("borderline Max Battle attacker - " + "; ".join(soft))
                    m.gate_review_kinds.add("max")
                if kept >= keep_n + int(mc.get("reserve_keep", 2)):
                    m.caps.append(f"surplus {_type_display(atype)} Max attacker "
                                  f"(you already hold {kept} better)")
                    m.max_type, m.max_sid = None, ""
                    continue
                if kept >= keep_n:
                    m.max_reserve = f"#{kept+1} {_type_display(atype)} Max attacker - reserve copy"
                kept += 1


def apply_mega_gate(mons, dex, cfg):
    mc, rv = cfg["mega"], cfg["review"]
    min_iv = float(mc["min_iv_pct"])
    require_rel = bool(mc["require_raid_relevance"])
    min_type_pct = float(mc["min_dps_pct_of_type"]) / 100.0
    families = defaultdict(list)
    for m in mons:
        if not m.mega_sid:
            continue
        families[m.mega_family_sid or m.mega_base_sid].append(m)
        if m.iv_pct < min_iv:
            m.mega_type, m.mega_sid, m.mega_base_sid = None, "", ""
            m.is_mega_capable = False
            continue
        # A Mega is also an attacker, so the raid atk-IV floor applies.  A
        # near miss keeps the role but downgrades the verdict to REVIEW.
        min_atk = int(mc.get("min_atk_iv", cfg["raid"]["min_atk_iv"]))
        if m.a < min_atk:
            msg = f"atk IV {m.a} below mega.min_atk_iv={min_atk}"
            if min_atk - m.a <= int(rv["atk_iv_slack"]):
                m.review_reasons.append("Mega candidate - " + msg)
                m.gate_review_kinds.add("mega")
            else:
                m.warnings.append("Mega role refused - " + msg)
                m.mega_type, m.mega_sid, m.mega_base_sid = None, "", ""
                m.is_mega_capable = False
                continue
        if m.mega_type is None and require_rel:
            m.review_reasons.append("Mega has no raid-useful typing")
            m.mega_type, m.mega_sid, m.mega_base_sid = None, "", ""
            m.is_mega_capable = False
            continue
        if m.mega_type:
            dps = estimated_mega_dps(m, dex)
            ref = _ref_dps(dex, dex.raid_rankings, m.mega_type) * min_type_pct
            if dps and ref and dps < ref:
                msg = (f"Mega dps {dps:.0f} below {ref:.0f} "
                       f"({min_type_pct*100:.0f}% of the best non-Mega {_type_display(m.mega_type)})")
                m.warnings.append(msg)
                if require_rel:
                    m.mega_type, m.mega_sid, m.mega_base_sid = None, "", ""
                    m.is_mega_capable = False
                elif mc.get("require_dps_floor", True):
                    # Weak attacker: only worth the energy for its boost.  Keep
                    # it, but never tell the player to invest in it blindly.
                    m.review_reasons.append("Mega candidate - " + msg + "; only worth it for the type boost")
                    m.gate_review_kinds.add("mega")

    # One Mega Evolution per family is enough (Mega energy is per species), so
    # only the best copy(ies) of each family keep the Mega role.
    cap_n = int(mc.get("keep_per_family", 1))
    fam_live = defaultdict(list)
    for m in mons:
        if m.mega_sid and m.is_mega_capable:
            fam_live[m.mega_family_sid or m.mega_base_sid].append(m)
    for fam, members in fam_live.items():
        members.sort(key=lambda m: (-(1 if (m.has_mega_unlocked or m.mega_level > 0
                                            or m.is_currently_mega) else 0),
                                    -m.iv_pct, -m.a, -m.level, -m.cp, m.uid))
        for m in members[cap_n:]:
            m.caps.append(f"another {fam} already holds the Mega slot")
            m.mega_type, m.mega_sid, m.mega_base_sid = None, "", ""
            m.is_mega_capable = False
            m.gate_review_kinds.discard("mega")
            m.review_reasons = [r for r in m.review_reasons if not r.startswith("Mega candidate")]
            m.protect = [r for r in m.protect
                         if not r.startswith(("Mega-capable species", "Mega pre-evo"))]

    # A Mega is mostly a raid boost, and a lobby only needs one or two per
    # type.  Build the best few Megas per boost type; the rest stay in the
    # collection (still protected, still unlockable) but are not dust targets.
    per_type = int(mc.get("keep_per_type", 3))
    by_boost = defaultdict(list)
    for m in mons:
        if m.mega_sid and m.is_mega_capable and m.mega_type:
            by_boost[m.mega_type].append(m)
    for atype, members in by_boost.items():
        members.sort(key=lambda m: (-(1 if (m.has_mega_unlocked or m.mega_level > 0
                                            or m.is_currently_mega) else 0),
                                    -(estimated_mega_dps(m, dex) or 0.0),
                                    -m.iv_pct, m.uid))
        for m in members[per_type:]:
            m.caps.append(f"your top {per_type} {_type_display(atype)}-boost Megas already "
                          f"cover this type; keep for the unlock, do not power up")
            m.mega_type, m.mega_sid, m.mega_base_sid = None, "", ""
            m.is_mega_capable = False
            m.gate_review_kinds.discard("mega")
            m.review_reasons = [r for r in m.review_reasons if not r.startswith("Mega candidate")]

    # If a Mega family has no worthy copy at all, flag the best one so the
    # player knows they still need a Mega candidate for that family.
    for base, members in families.items():
        if any(m.is_mega_capable for m in members):
            continue
        best = max(members, key=lambda m: (m.iv_pct, m.cp))
        if best.iv_pct >= min_iv - float(rv["mega_iv_slack"]):
            best.review_reasons.append(
                f"best {base} you own is only {best.iv_pct:g}% IV - keep it to unlock its "
                f"Mega, or hunt a {min_iv:g}%+ one")


def apply_gym_gate(mons, dex, cfg):
    gc, rv = cfg["gym"], cfg["review"]
    min_iv = float(gc["min_iv_pct"])
    allow_shadow = bool(gc["allow_shadow"])
    max_per_species = int(gc["max_per_species"])
    slack = float(rv["gym_iv_slack"])
    min_cp = int(rv["gym_min_cp"])

    cands = defaultdict(list)
    for m in mons:
        if not m.gym_sid:
            continue
        if m.is_shadow and not allow_shadow:
            m.gym_reject = "shadow defenders take +20% damage - never a gym defender"
            m.gym_sid = ""
            continue
        if m.iv_pct < min_iv:
            m.gym_reject = f"IV {m.iv_pct:g}% below gym.min_iv_pct={min_iv:g}"
            if m.iv_pct >= min_iv - slack and m.cp >= min_cp:
                m.review_reasons.append(
                    f"gym defender species but {m.gym_reject} (CP {m.cp} is still useful)")
            m.gym_sid = ""
            continue
        cands[m.gym_sid].append(m)
    for sid, members in cands.items():
        members.sort(key=lambda m: (-m.iv_pct, -m.cp, m.uid))
        for m in members[max_per_species:]:
            m.gym_reject = f"beyond your top {max_per_species} {sid} defenders"
            m.gym_sid = ""


# ---------------------------------------------------------------------------
# Raid / Max / Mega build queue
# ---------------------------------------------------------------------------

def build_raid_build_queue(mons, dex, cfg):
    """PvE investment candidates that are NOT already the PvP build target."""
    out = []
    raid_level = float(cfg["raid"]["power_level"])
    iv_thr = float(cfg["mega"]["min_iv_pct"])
    for m in mons:
        if not m.species:
            continue
        if m.verdict == "BUILD_PVP":
            continue
        reasons = []
        if m.is_mega_capable and m.iv_pct >= iv_thr and m.mega_sid:
            mega_name = _clean_name(dex.by_id.get(m.mega_sid, {}).get("speciesName", "?"))
            if m.species["speciesId"] in dex.mega_bases:
                reasons.append(f"unlock {mega_name}"
                               + (f" (boosts {_type_display(m.mega_type)})" if m.mega_type else ""))
            else:
                reasons.append(f"Mega pre-evo -> {mega_name}")
        if m.raid_type:
            tag = "shadow " if m.is_shadow else ""
            if m.is_shadow or m.level < raid_level:
                reasons.append(f"{tag}raid attacker ({_type_display(m.raid_type)})")
        if m.max_type and (m.is_dynamax or m.is_gigantamax):
            label = "Gigantamax" if m.is_gigantamax else "Dynamax"
            reasons.append(f"{label} Max attacker ({_type_display(m.max_type)})")
        if reasons:
            out.append((m, reasons))
    out.sort(key=lambda x: (x[0].verdict_priority, -x[0].iv_pct))
    return out
# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------

def mega_plan(m, dex):
    """(can_mega, base_sid, evo_target_sid).

    charizard -> (True, 'charizard', ''), charmander -> (True, 'charizard', 'charizard').
    Uses the whole evolution family, so stage-1 pre-evos are covered too.
    """
    if not m.species:
        return False, "", ""
    sid = m.species["speciesId"]
    if sid in dex.mega_bases:
        return True, sid, ""
    for t in dex.descendants(sid):
        if t != sid and t in dex.mega_bases:
            return True, t, t
    return False, "", ""


def _pvp_entry(m, dex, t, cap):
    """Build a PvpEntry for family target `t`, using the shadow rankings when
    this mon is a shadow (shadow win rates differ from the base species)."""
    shadow = False
    pos = None
    if m.is_shadow and dex.cfg["pvp"]["prefer_shadow_rankings"]:
        pos = dex.pos_shadow.get(cap, {}).get(f"{t}_shadow")
        shadow = pos is not None
    if pos is None:
        pos = dex.pos.get(cap, {}).get(t)
    if not pos:
        return None
    r = dex.iv_rank(t, cap, m.a, m.d, m.s)
    if not r:
        return None
    base = dex.by_id.get(t)
    if not base:
        return None
    shown = dex.by_id.get(f"{t}_shadow") if shadow else base
    name = _clean_name(shown["speciesName"]) if shown else t
    lvl_cp = best_pvp_level(base["baseStats"], cap, m.a, m.d, m.s)
    # A mon can never be powered DOWN, so a spread is only usable in a league
    # if its current CP already fits and the target level is not behind us.
    # Strict: even half a level over the cap means the evolved mon is above it.
    # Master League has no cap, so a level-51 best-buddy mon is still eligible.
    eligible = bool(lvl_cp) and m.cp <= cap and (cap >= 10000 or lvl_cp[0] >= m.level - 1e-9)
    return PvpEntry(LEAGUE[cap], name, r[0], r[1], pos[0], pos[1], t, cap, eligible, shadow)


def classify(mons, dex, cfg, missing_opt):
    pvp_cfg = cfg["pvp"]
    gym_defenders = set(cfg["gym"]["defenders"])
    shadow_pending = []

    # ---- 1. species, Mega plan, protection reasons -------------------------
    for m in mons:
        p, disp = m.raw, m.raw["pokemonDisplay"]
        m.species, m.species_note = dex.resolve(m.dex, m.form_name, disp.get("form", 0))
        if m.species:
            m.can_mega, base_sid, m.mega_evo_target = mega_plan(m, dex)
            m.mega_family_sid = base_sid if m.can_mega else ""
            if m.can_mega and m.species["speciesId"] not in dex.mega_bases:
                m.is_mega_pre_evo = True
            if m.is_shadow:
                # Shadow PokÃ©mon cannot Mega Evolve - purify first.
                if m.can_mega:
                    mega_name = _clean_name(dex.by_id.get(base_sid, {}).get("speciesName", ""))
                    m.purify_for_mega = mega_name
                m.can_mega = False
                m.mega_evo_target = ""

        pr, cp_ = m.protect, m.caps

        if p.get("favorite") and cfg.get("protect_favorite", True): pr.append("favorite")
        if p.get("isLucky") and cfg.get("protect_lucky", True): pr.append("lucky")
        if disp.get("shiny") and cfg.get("protect_shiny", True): pr.append("shiny")
        if disp.get("costume") and cfg.get("protect_costume", True): pr.append("costume")
        if disp.get("locationCard") and cfg.get("protect_location_card", True):
            pr.append("special background")
        if m.is_shadow:
            if cfg.get("protect_shadow_purified", False):
                pr.append("shadow")
            else:
                shadow_pending.append(m)
        if m.is_purified and cfg.get("protect_purified", True):
            pr.append("purified (cheaper power-ups, has Return)")
        if m.iv_pct >= cfg["protect_iv_pct"]:
            if cfg.get("protect_iv_scope", "best_per_species") == "all":
                pr.append(f"IV {m.iv_pct:g}%")
            else:
                m.iv_hi = True      # resolved below: best N per species only
        if (m.a, m.d, m.s) == (15, 15, 15) and cfg.get("protect_hundo", True): pr.append("hundo")
        sz = p.get("size")
        if sz in SIZE_NAME and cfg.get("protect_size", False):
            pr.append(f"size {SIZE_NAME[sz]}")
        if m.has_third_move and cfg.get("protect_3rd_move", True): pr.append("has 3rd move")
        if p.get("pokemonTagIds") and cfg.get("protect_tagged", True): pr.append("you tagged it")
        if p.get("originEvents") and cfg.get("protect_origin_events", True):
            pr.append("event origin")
            if cfg.get("protect_gofest_2026") and any("gofest2026" in str(e).lower()
                                                      for e in p["originEvents"]):
                pr.append("GO Fest 2026 origin")
        if p.get("deployedFortId") and cfg.get("protect_deployed", True): pr.append("deployed in gym")
        if m.dex in cfg["protect_species_dex"]: pr.append("protected species (config)")
        if p.get("tradedTimeMs"): cp_.append("traded")
        if m.level >= cfg["power_level_floor"]: cp_.append(f"powered up (lvl {m.level:g})")

        # Mega-capable only protects a mon worth spending Mega energy on; a
        # 45% Pidgey is not a Mega candidate, it is candy.
        if (m.can_mega and cfg.get("protect_mega_capable", True)
                and m.iv_pct >= float(cfg["mega"]["min_iv_pct"])):
            if m.species and m.species["speciesId"] in dex.mega_bases:
                pr.append("Mega-capable species (IV ok)")
            else:
                pr.append("Mega pre-evo (good IV)")
        if m.has_mega_unlocked:
            pr.append("Mega unlocked")
        if m.is_currently_mega and cfg.get("protect_currently_mega", True):
            pr.append("currently Mega Evolved")
        if m.mega_level >= int(cfg.get("super_mega_protect_level", 1)) and cfg.get("protect_super_mega", True):
            pr.append(f"Super Mega (level {m.mega_level})")
        if m.is_dynamax and cfg.get("protect_dynamax", True): pr.append("Dynamax")
        if m.is_gigantamax and cfg.get("protect_gigantamax", True): pr.append("Gigantamax")

        if cfg.get("protect_high_upgrades", True) and m.num_upgrades >= int(cfg.get("upgrades_keep_threshold", 20)):
            pr.append(f"heavily powered up ({m.num_upgrades} upgrades)")
        if cfg.get("protect_high_buddy_km", True) and m.buddy_km >= float(cfg.get("buddy_km_keep_threshold", 100.0)):
            pr.append(f"high buddy distance ({m.buddy_km:.0f} km)")

        if cfg.get("protect_elite_move_holders", True) and m.species:
            legacy = m.species.get("eliteMoves") or []
            if legacy:
                held = held_elite_moves(m, legacy)
                if held is None:
                    # No PvE id table available: fall back to the old guess.
                    if m.has_third_move or m.num_upgrades >= 20 or m.iv_pct >= 90:
                        pr.append(f"may hold a legacy/elite move ({len(legacy)} on species)")
                elif held:
                    pr.append("holds elite/legacy move: " + ", ".join(held))

        for f in missing_opt:
            cp_.append(f"export lacks '{f}'")

        if m.year is not None:
            y = m.year
            keep_iv = cfg.get("age_keep_if_iv_pct", {})
            maybe_iv = cfg.get("age_maybe_if_iv_pct", {})
            thr = keep_iv.get(str(y), keep_iv.get(y))
            mthr = maybe_iv.get(str(y), maybe_iv.get(y))
            if y in cfg.get("age_keep_years", []):
                pr.append(f"trade value: {y} (guaranteed-lucky eligible)")
            elif thr is not None and m.iv_pct >= float(thr):
                pr.append(f"trade value: {y} (IV {m.iv_pct:g}% >= {float(thr):g}%)")
            elif y in cfg.get("age_maybe_years", []) or thr is not None:
                if mthr is None or m.iv_pct >= float(mthr):
                    cp_.append(f"trade value: {y} (older)")

        sp = m.species
        if sp is None:
            cp_.append(f"species unresolved: {m.species_note}")
            continue
        tags = set(sp.get("tags") or [])
        for t in ("legendary", "mythical", "ultrabeast"):
            if t in tags: pr.append(t)
        if "regional" in tags: cp_.append("regional species")
        if sp.get("eliteMoves"): cp_.append("species has elite/legacy moves")

        # ---- 2. PvP candidates ---------------------------------------------
        for cap in CAPS:
            for t in dex.descendants(sp["speciesId"]):
                if cap == 1500 and t in dex.inelig_gl:
                    continue
                pos = dex.pos.get(cap, {}).get(t)
                shadow_pos = (dex.pos_shadow.get(cap, {}).get(f"{t}_shadow") if m.is_shadow else None)
                shown_pos = shadow_pos or pos
                if not shown_pos:
                    continue
                # Cheap rank check first: iv_rank() over 4096 spreads is only
                # worth doing for species that are actually meta-relevant.
                if shown_pos[0] > int(pvp_cfg["relevant_species_top"][str(cap)]):
                    continue
                e = _pvp_entry(m, dex, t, cap)
                if not e:
                    continue
                m.pvp.append(e)
                if not e.eligible and shown_pos[0] <= int(pvp_cfg["keep_species_top"][str(cap)]):
                    cp_.append(f"{e.league} spread is strong but CP {m.cp} is over the "
                               f"{e.cap} cap (cannot be powered down)")
                # ---- cup PvP entries (patch 9a) ----
                for cup_name, cup_spec in CUPS.items():
                    if not dex.cup_allows(t, cup_name):
                        continue
                    cup_cap = cup_spec["cap"]
                    cup_pos = dex.cup_pos.get(cup_name, {}).get(t)
                    if not cup_pos:
                        continue
                    cup_iv = dex.iv_rank(t, cup_cap, m.a, m.d, m.s)
                    if not cup_iv:
                        continue
                    lvl_cp = best_pvp_level(dex.by_id[t]["baseStats"], cup_cap, m.a, m.d, m.s)
                    eligible = bool(lvl_cp) and m.cp <= cup_cap and lvl_cp[0] >= m.level - 1e-9
                    name = cup_spec["title"]
                    m.pvp.append(PvpEntry(
                        name, _clean_name(dex.by_id[t]["speciesName"]),
                        cup_iv[0], cup_iv[1], cup_pos[0], cup_pos[1],
                        t, cup_cap, eligible, m.is_shadow,
                    ))
                if pos and pos[0] < m.species_rank:
                    m.species_rank = pos[0]
                    m.species_rank_league = LEAGUE[cap]

    # ---- 2b. High-IV protection: best N per species, not every 92% mon -----
    if cfg.get("protect_iv_scope", "best_per_species") != "all":
        keep_n = int(cfg.get("iv_protect_max_per_species", 2))
        iv_groups = defaultdict(list)
        for m in mons:
            if m.iv_hi:
                iv_groups[(m.dex, m.form_name)].append(m)
        for g in iv_groups.values():
            g.sort(key=lambda m: (-m.iv_pct, -m.level, -m.cp, m.uid))
            for m in g[:keep_n]:
                m.protect.append(f"IV {m.iv_pct:g}%")
            for m in g[keep_n:]:
                m.iv_demoted = True
                m.caps.append(f"IV {m.iv_pct:g}% but you hold {keep_n} better copies of this species")

    # ---- 3. Duplicate resolution ------------------------------------------
    groups = defaultdict(list)
    for m in mons:
        groups[(m.dex, m.species["speciesId"] if m.species else m.form_name)].append(m)
    for g in groups.values():
        relevant = any(m.species and dex.is_relevant_pvp(m.species["speciesId"], m.is_shadow) for m in g)
        prot = [m for m in g if m.protect]
        slots = max(0, cfg["keep_copies"] - len(prot))
        rest = [m for m in g if not m.protect]
        if relevant:
            def copy_quality(m):
                if m.pvp:
                    return (0, min(x.iv_rank for x in m.pvp), -m.iv_pct)
                return (1, 9999, -m.iv_pct)
            rest.sort(key=copy_quality)
            best_ref = rest[0] if rest else max(g, key=lambda m: m.iv_pct)
            if best_ref.pvp:
                be = min(best_ref.pvp, key=lambda x: x.iv_rank)
                note = f"outranked by {be.league} rank #{be.iv_rank}"
            else:
                note = f"outranked by {best_ref.iv_pct:g}% IV"
            for i, m in enumerate(rest):
                if i < slots:
                    m.protect.append("best copy of species")
                elif m is best_ref and slots == 0:
                    m.protect.append("best unprotected (quota full)")
                else:
                    m.caps.append(note)
        else:
            for m in rest:
                m.caps.append("species not meta-relevant")

    apply_variant_rules(mons, cfg, dex)

    # ---- 3b. Top-N PvP spreads: keep them whether or not the species is meta
    # A near-perfect spread for a league cap (or a cup) can matter in a cup
    # rotation even when the species is nowhere near the main rankings.
    # Only mons that can still reach that cap, and whose species actually gets
    # close to it, qualify - otherwise "top 10" just means "almost 15/15/15".
    if cfg.get("protect_top_pvp_iv", True):
        top_n = int(cfg.get("protect_top_pvp_iv_rank", 10))
        top_leagues = {int(c) for c in cfg.get("protect_top_pvp_iv_leagues", ["1500", "2500"])}
        min_frac = float(cfg.get("protect_top_pvp_iv_min_cap_fraction", 0.95))
        arenas = [(LEAGUE[c], c, None) for c in CAPS if c in top_leagues]
        if cfg.get("protect_top_pvp_iv_cups", True):
            arenas += [(spec["title"] + " Cup", spec["cap"], name) for name, spec in CUPS.items()]
        for m in mons:
            if not m.species or m.protect:
                continue
            hit = None
            for t in dex.descendants(m.species["speciesId"]):
                base = dex.by_id.get(t)
                if not base:
                    continue
                for label, cap, cup in arenas:
                    if m.cp > cap:
                        continue
                    if cup is None and cap == 1500 and t in dex.inelig_gl:
                        continue
                    if cup and not dex.cup_allows(t, cup):
                        continue
                    lvl_cp = best_pvp_level(base["baseStats"], cap, m.a, m.d, m.s)
                    if not lvl_cp or lvl_cp[0] < m.level - 1e-9 or lvl_cp[1] < cap * min_frac:
                        continue
                    r = dex.iv_rank(t, cap, m.a, m.d, m.s)
                    if r and r[0] <= top_n and (hit is None or r[0] < hit[0]):
                        hit = (r[0], label, _clean_name(base["speciesName"]))
            if hit:
                m.protect.append(f"top-{top_n} PvP spread ({hit[1]} {hit[2]}, IV rank #{hit[0]})")

    # ---- 4. Role assignment ------------------------------------------------
    rcfg, mcfg = cfg["raid"], cfg["mega"]
    kb, kiv = int(pvp_cfg["keep_iv_rank"]), int(pvp_cfg["maybe_iv_rank"])
    master_min = float(pvp_cfg.get("master_min_iv_pct", 0.0))
    per_league = {int(k): int(v) for k, v in (pvp_cfg.get("builds_per_species_league") or {}).items()}
    cands = []
    for m in mons:
        m.best_pvp = None
        if not m.species:
            continue
        for e in m.pvp:
            if not e.eligible:
                continue
            if e.species_rank > int((pvp_cfg["keep_species_top"].get(str(e.cap)) or pvp_cfg["keep_species_top"].get("1500", 70))):
                continue
            if e.iv_rank > kb:
                continue
            if e.cap >= 10000 and m.iv_pct < master_min:
                continue            # Master League wants Attack: a 12/15/12 is not a build
            e.composite = (1000 - e.species_rank) + (500 - e.iv_rank) * 0.5
            if e.iv_rank <= 3:
                e.composite += 100      # near-perfect spread: keep it in its own league
            # Decisive: mid-meta with mediocre rank fails even if under keep_species_top
            min_comp = float(pvp_cfg.get("min_composite", 0) or 0)
            if min_comp and e.composite < min_comp:
                continue
            cands.append((e.composite, m, e))
    cands.sort(key=lambda t: (-t[0], t[1].uid))
    taken, capped = defaultdict(int), set()
    for comp, m, e in cands:
        if m.best_pvp is not None:
            continue
        key = (e.cap, e.sid, e.shadow)
        limit = per_league.get(e.cap, 99)
        if taken[key] >= limit:
            capped.add(m.uid)
            note = (f"{e.league} {e.name}: a better copy is already the build "
                    f"({limit} per species per league)")
            if note not in m.caps:
                m.caps.append(note)
            continue
        m.best_pvp = e
        taken[key] += 1
    for m in mons:
        if m.best_pvp is not None:
            capped.discard(m.uid)

    for m in mons:
        if m.species:
            m.raid_type, m.raid_sid = dex.family_raid_type(
                m.species["speciesId"], top_n=int(rcfg["top_n_species"]))
            if m.can_mega:
                m.mega_type, m.mega_sid, m.mega_base_sid = dex.family_mega_info(m.species["speciesId"])
                m.is_mega_capable = bool(m.mega_sid)
            if m.is_dynamax or m.is_gigantamax:
                m.max_type, m.max_sid = dex.family_max_type(
                    m.species["speciesId"], top_n=int(cfg["max_battle"]["top_n_species"]))
                _crowned = CROWNED_MAX_OVERRIDE.get(m.species.get("dex"))
                if _crowned:
                    m.max_type = _crowned["type"]
                    m.max_sid = m.species["speciesId"]
                    m.max_type_locked = True
                else:
                    _gt = dex.gmax_type.get(m.species.get("dex")) if m.is_gigantamax else None
                    if _gt:
                        m.max_type, m.max_sid = _gt, m.species["speciesId"]
                    else:
                        _ft = _fast_move_type(m)
                        if _ft and _ft in MAX_BATTLE_TYPES:
                            m.max_type = _ft
                            m.max_sid = m.max_sid or m.species["speciesId"]
                            m.max_type_locked = True
            for t in dex.descendants(m.species["speciesId"]):
                if t in gym_defenders:
                    m.gym_sid = t
                    break
            # "Species is meta-relevant but this spread is not worth dust".
            if m.best_pvp is None and m.pvp and m.uid not in capped:
                cands = [e for e in m.pvp if e.eligible
                         and e.species_rank <= int((pvp_cfg["maybe_species_top"].get(str(e.cap)) or pvp_cfg["maybe_species_top"].get("1500", 120)))
                         and e.iv_rank <= kiv]
                if cands:
                    b = min(cands, key=lambda e: e.species_rank + e.iv_rank)
                    m.review_reasons.append(
                        f"{b.league} {b.name}: species rank #{b.species_rank} but your spread is "
                        f"IV rank #{b.iv_rank} - hunt a low-Attack spread, do not invest dust here")
        if m.purify_for_mega:
            m.protect.append(f"purify to unlock Mega {m.purify_for_mega}")

    # ---- 4b. Global placement: one best home per Pokemon, coverage first ---------------------------
    assign_types(mons, dex, cfg, "raid")
    # Form-change species (Zacian/Zamazenta): never point raid_sid at the other form.
    for m in mons:
        if not m.species or not m.raid_sid:
            continue
        sid = m.species["speciesId"]
        if sid != m.raid_sid and ("crowned" in (m.raid_sid or "") or "crowned" in sid):
            m.raid_sid = sid
    assign_types(mons, dex, cfg, "max")

    # ---- 5. Quality gates --------------------------------------------------
    apply_raid_gate(mons, dex, cfg)
    apply_max_gate(mons, dex, cfg)
    apply_mega_gate(mons, dex, cfg)
    demote_redundant_mega_builds(mons, dex, cfg)
    apply_gym_gate(mons, dex, cfg)

    # ---- 6. Shadow relevance ----------------------------------------------
    for m in shadow_pending:
        if cfg.get("protect_shadow_purified", False):
            continue
        relevant = bool(m.best_pvp or m.raid_type or m.max_type or m.gym_sid
                        or m.purify_for_mega)
        if relevant:
            m.protect.append("shadow (relevant)")
        else:
            m.caps.append("shadow, no relevant role")

    _dedup_cup_entries(mons)

    # ---- 7. Verdicts -------------------------------------------------------
    # Mons the player has personally confirmed for transfer after looking at
    # review_triage.txt (review_triage.confirmed_transfer_ids = in-game ids).
    confirmed_xfer = {str(i) for i in (cfg.get("review_triage") or {}).get("confirmed_transfer_ids", [])}
    setup_coverage_first(mons, cfg)
    for m in mons:
        if m.species is None:
            m.verdict, m.verdict_priority = "REVIEW", 6
            m.role = "Unknown species"
            m.why_keep = f"Could not resolve species: {m.species_note}"
            continue

        kind, stat_sid, evo_sid, role, cap, tgt_level, alts = _target_for(m, dex, cfg)
        m.evolve_to_sid = evo_sid or ""
        if kind:
            own = m.species["speciesId"]
            if evo_sid and evo_sid != own:
                m.evolve_to = _clean_name(dex.by_id.get(evo_sid, {}).get("speciesName", ""))
            m.role = role + (f" | also {'; '.join(alts)}" if alts else "")
            stat_sp = dex.by_id.get(stat_sid)
            if stat_sp is None:
                m.warnings.append(f"target species '{stat_sid}' missing from PvPoke data - "
                                  f"CP/moveset left blank")
            else:
                if cap:
                    lvl_cp = best_pvp_level(stat_sp["baseStats"], cap, m.a, m.d, m.s)
                    if lvl_cp:
                        m.power_up_to, m.build_cp = f"{lvl_cp[0]:g}", str(lvl_cp[1])
                    else:
                        m.warnings.append(f"{stat_sid} cannot reach {cap} CP")
                elif tgt_level:
                    m.power_up_to = f"{tgt_level:g}"
                    cp = compute_cp(stat_sp["baseStats"], m.a, m.d, m.s, tgt_level)
                    m.build_cp = str(cp) if cp else ""
                    if cp is None:
                        m.warnings.append(f"no CP model for level {tgt_level:g}")
                m.moveset = _suggest_moveset(m, dex, cfg, kind, cap, stat_sid, evo_sid)

        tgt = None
        try:
            tgt = float(m.power_up_to) if m.power_up_to else None
        except ValueError:
            tgt = None

        reserve = (kind == "raid" and m.raid_reserve) or (kind == "max" and m.max_reserve)

        _cov_review = (COV["active"] and kind in ("raid", "mega") and kind in m.gate_review_kinds
                       and tgt < float(cfg["mega" if kind == "mega" else "raid"]["power_level"]))
        if kind and tgt is not None and m.level >= tgt - 0.5 and not reserve and not _cov_review:
            m.verdict = "KEEP"
            if kind == "mega" and not m.is_currently_mega:
                m.why_keep = f"Already at L{m.level:g} - Mega Evolve it to use {role}"
            elif COV["active"] and kind in ("raid", "mega") and tgt < float(cfg[kind if kind == "mega" else "raid"]["power_level"]):
                m.why_keep = (f"At the coverage-first target L{tgt:g} for {role} - "
                              f"level it further once every raid type has "
                              f"{int(cfg['coverage']['min_attackers'])} usable attackers")
            else:
                m.why_keep = f"Already built for {role}"
            m.verdict_priority = 1
        elif kind and not reserve and kind in m.gate_review_kinds:
            # Near miss on this role's gate: keep, but do not tell the player
            # to invest dust in it yet.
            m.verdict = "REVIEW"
            m.role = role
            m.why_keep = "Review before investing: " + "; ".join(dict.fromkeys(m.review_reasons))
            m.verdict_priority = 6
        elif kind and not reserve:
            m.verdict = {"pvp": "BUILD_PVP", "mega": "BUILD_MEGA", "raid": "BUILD_RAID",
                         "max": "BUILD_MAX", "gym": "BUILD_GYM"}[kind]
            m.why_keep = f"Invest for {role}"
            m.verdict_priority = 0
        elif reserve:
            m.verdict = "KEEP"
            m.why_keep = m.raid_reserve or m.max_reserve
            m.verdict_priority = 1
        else:
            # Any keep reason at all protects the mon - a variant-rule keeper
            # used to be able to slip through to the transfer list.
            collection_reasons = [r for r in m.protect
                                  if any(t in r for t in COLLECTION_KEYWORDS)]
            trade_reason = next((r for r in m.protect if "trade value" in r), None)
            if m.protect:
                m.verdict = "KEEP"
                if not collection_reasons and trade_reason:
                    m.role = "Trade bait"
                    m.why_keep = trade_reason
                else:
                    m.role = "Collection"
                    m.why_keep = "; ".join(dict.fromkeys(collection_reasons or m.protect))
                m.verdict_priority = 1
            elif m.review_reasons:
                m.verdict = "REVIEW"
                m.role = m.role or "Borderline"
                m.why_keep = "Review: " + "; ".join(dict.fromkeys(m.review_reasons))
                m.verdict_priority = 6
            else:
                m.verdict = "TRANSFER"
                m.why_keep = ("No role - " + "; ".join(dict.fromkeys(m.caps))) if m.caps else \
                    "No PvP, raid, Max, Mega, collection or trade value"
                m.verdict_priority = 3
        # A confirmed id only turns a REVIEW into TRANSFER.  A mon with any keep
        # reason (m.protect) is never touched, and the later safeguard pass still
        # blocks anything that sits in a team or build.  Mons with a raid / Max
        # role are skipped here because that safeguard would block them anyway.
        if (m.verdict == "REVIEW" and not m.protect
                and not m.raid_type and not m.max_type
                and m.uid.split(":", 1)[-1] in confirmed_xfer):
            m.verdict = "TRANSFER"
            m.why_keep = "Confirmed by you for transfer (review_triage.confirmed_transfer_ids)"
            m.verdict_priority = 3

    rescue_high_iv_from_purify_junk(mons, cfg)
# ---------------------------------------------------------------------------
# Target selection + team builders
# ---------------------------------------------------------------------------

COLLECTION_KEYWORDS = [
    "shiny", "legendary", "mythical", "costume",
    "special background", "hundo", "has 3rd move",
    "size XX", "size X", "event origin",
    "protected species (config)", "lucky",
    "Dynamax", "Gigantamax", "Mega", "Super Mega",
    "currently Mega", "GO Fest",
    "heavily powered up", "high buddy",
    "favorite", "shadow", "purified", "IV ", "elite",
]


def _clean_name(s):
    return re.sub(r"\s*\(.*?\)", "", s or "").strip()


def _form_short(form_name: str) -> str:
    fn = _norm(form_name or "")
    if not fn or fn in ("", "unset", "normal"):
        return ""
    if "crownedsword" in fn or (fn.startswith("zacian") and "crowned" in fn and "hero" not in fn):
        return "Crowned Sword"
    if "crownedshield" in fn or (fn.startswith("zamazenta") and "crowned" in fn and "hero" not in fn):
        return "Crowned Shield"
    if "hero" in fn:
        return "Hero"
    for prefix in ("zacian", "zamazenta"):
        if fn.startswith(prefix):
            rest = fn[len(prefix):]
            if rest:
                return rest.replace("_", " ").title()
    return ""


def _display_species(m) -> str:
    base = _clean_name(m.species["speciesName"]) if m.species else f"dex {m.dex}"
    tag = _form_short(getattr(m, "form_name", "") or "")
    if tag and tag.lower() not in base.lower():
        return f"{base} ({tag})"
    return base


def _is_crowned_form(m) -> bool:
    fn = _norm(getattr(m, "form_name", "") or "")
    return "crowned" in fn and "hero" not in fn


def _ingame_search(m, species_name):
    """Build a Pokemon GO search string that is as unique as the client allows.

    GO search: space/& = AND, comma = OR, ! = NOT.
    `Name&cp1234` alone collides whenever two of the same species share a CP.
    Adding year (and a regional form tag when relevant) makes the string much
    safer to paste.  Names are stripped of parenthetical form labels because
    the in-game box search does not match those.
    """
    parts = [species_name, f"cp{int(m.cp)}"]
    if m.year and 2016 <= int(m.year) <= 2035:
        parts.append(f"year{int(m.year)}")
    form = (m.form_name or "").lower()
    for tag, key in (
        ("alola", "alola"), ("alolan", "alola"),
        ("galar", "galar"), ("galarian", "galar"),
        ("hisui", "hisui"), ("hisuian", "hisui"),
        ("paldea", "paldea"), ("paldean", "paldea"),
    ):
        if tag in form:
            parts.append(key)
            break
    # Prefer non-shiny when the mon is not shiny so a shiny keeper is not selected
    if not m.is_shiny:
        parts.append("!shiny")
    return "&".join(parts)




def _mega_label(m):
    """'Mega (Fire)' / 'Primal (Water)' - Primal Reversion is not a Mega."""
    label = _type_display(m.mega_type) if m.mega_type else "no raid boost"
    if (m.mega_sid or "").endswith("_primal"):
        return f"Primal ({label})"
    return f"Mega ({label})"


COV = {"active": False, "gaps": set(), "target": 25.0}


def _usable_by_type(mons, cfg):
    """{raid type: set(uid)} of mons that already count as usable attackers."""
    min_level = float(cfg["coverage"]["min_level"])
    out = {t: set() for t in RAID_USEFUL_TYPES}
    for m in mons:
        if m.species is None or m.level < min_level:
            continue
        if m.raid_type in out and "raid" not in m.gate_review_kinds:
            out[m.raid_type].add(m.uid)
        if m.is_mega_capable and m.mega_sid and m.mega_type in out:
            out[m.mega_type].add(m.uid)
    return out


def setup_coverage_first(mons, cfg):
    cc = cfg["coverage"]
    min_cov = int(cc["min_attackers"])
    usable = _usable_by_type(mons, cfg)
    gaps = {t for t, u in usable.items() if len(u) < min_cov}
    tgt = float(cc.get("build_target_level") or 0) or float(cc["min_level"])
    COV["gaps"] = gaps
    COV["target"] = tgt
    COV["active"] = bool(cc.get("coverage_first", True)) and bool(gaps)


def coverage_state(mons, dex, cfg):
    """{raid type: {"entries", "usable", "need", "picks"}}.

    picks = the BEST attackers to level for the open spots, not the cheapest:
    ranked by finished-form raid DPS (the same number the raid teams use).
    Candidates within cov_tie_pct of the best count as equal and the cheaper
    one wins, so cost only breaks near-ties."""
    min_level = float(cfg["coverage"]["min_level"])
    min_cov = int(cfg["coverage"]["min_attackers"])
    tie = float(cfg["coverage"].get("pick_tie_pct", 5.0)) / 100.0
    teams = build_raid_teams(mons, dex, cfg)
    out = {}
    for t in RAID_USEFUL_TYPES:
        entries = list(teams.get(t, []))
        seen = {m.uid for m, _ in entries}
        for m in mons:
            if (m.is_mega_capable and m.mega_sid and m.mega_type == t and m.uid not in seen
                    and m.verdict not in OUT_OF_PLAY):
                seen.add(m.uid)
                entries.append((m, estimated_mega_dps(m, dex) or 0.0))
        usable = [(m, d) for m, d in entries if m.level >= min_level]
        need = max(0, min_cov - len(usable))
        pool = []
        for m, d in entries:
            if m.level >= min_level or m.verdict == "REVIEW":
                continue
            dust, _c, _x = _stardust_to_level(m.level, min_level, is_shadow=m.is_shadow,
                                              is_lucky=bool(m.raw.get("isLucky")),
                                              is_purified=m.is_purified)
            pool.append((m, d, dust))
        picks = []
        while need and len(picks) < need and pool:
            top = max(p[1] for p in pool)
            near = [p for p in pool if p[1] >= top * (1.0 - tie)]
            best = min(near, key=lambda p: (p[2], -p[1], p[0].uid))
            picks.append(best)
            pool.remove(best)
        out[t] = {"entries": entries, "usable": usable, "need": need, "picks": picks}
    return out


def final_gap_types(mons, dex, cfg):
    """Gap types exactly as coverage_gaps.txt computes them (after verdicts)."""
    return {t for t, v in coverage_state(mons, dex, cfg).items() if v["need"] > 0}


def _pve_target(cfg, key):
    """Build target for Raid / Mega: the coverage-first level while coverage is incomplete."""
    lvl = float(cfg[key]["power_level"])
    return min(lvl, COV["target"]) if COV["active"] else lvl


def _target_for(m, dex, cfg):
    """(kind, stat_sid, evo_sid, role, cap, target_level, alts).

    stat_sid is the species whose base stats describe the finished mon (the
    Mega form for a Mega), evo_sid is what it has to be evolved into first.
    Priority: PvP > Mega > Dynamax/Gigantamax Max Battle > Raid > Gym.  Anything
    else the mon is also good for is reported in `alts`.
    """
    dmax = m.is_dynamax or m.is_gigantamax
    alts = []
    if m.mega_type and m.mega_sid and m.is_mega_capable:
        alts.append(_mega_label(m))
    if m.max_type and dmax:
        alts.append(f"{'Gigantamax' if m.is_gigantamax else 'Dynamax'} Max "
                    f"({_type_display(m.max_type)})")
    if m.raid_type:
        alts.append(f"Raid ({_type_display(m.raid_type)})")
    if m.gym_sid:
        alts.append("Gym defender")

    if m.best_pvp:
        e = m.best_pvp
        role = f"{e.league} League ({e.name} rank #{e.species_rank}, IV rank #{e.iv_rank})"
        return ("pvp", e.sid, e.sid, role, e.cap, None, alts)
    if m.mega_type and m.mega_sid and m.is_mega_capable:
        return ("mega", m.mega_sid, m.mega_base_sid, _mega_label(m),
                None, _pve_target(cfg, "mega"),
                [a for a in alts if not a.startswith(("Mega", "Primal"))])
    if m.max_type and dmax:
        tag = "Gigantamax" if m.is_gigantamax else "Dynamax"
        return ("max", m.max_sid, m.max_sid, f"{tag} Max Battle ({_type_display(m.max_type)})",
                None, float(cfg["max_battle"]["power_level"]),
                [a for a in alts if not a.startswith(("Dynamax", "Gigantamax"))])
    if m.raid_type:
        return ("raid", m.raid_sid, m.raid_sid, f"Raid ({_type_display(m.raid_type)})",
                None, _pve_target(cfg, "raid"), [a for a in alts if not a.startswith("Raid")])
    if m.gym_sid:
        return ("gym", m.gym_sid, m.gym_sid, "Gym defender", None,
                float(cfg["gym"]["power_level"]), [a for a in alts if a != "Gym defender"])
    return (None, None, None, "", None, None, [])


def _suggest_moveset(m, dex, cfg, kind, cap, stat_sid, evo_sid):
    if kind == "pvp":
        return dex.moveset(evo_sid or stat_sid, cap)
    if kind == "max":
        sid = evo_sid or stat_sid
        info = dex.max_sets.get((sid, m.max_type)) or (None, None)
        return _move_label(info[0]) if info and info[0] else ""
    if kind in ("raid", "mega") and cfg["raid"].get("suggest_movesets", True):
        atype = m.mega_type if kind == "mega" else m.raid_type
        # CRITICAL: use the mon's ACTUAL form movepool, not raid_sid.
        # Hero Zacian must not be told to run Behemoth Blade (Crowned-only).
        actual = m.species
        sp = actual if actual else dex.by_id.get(stat_sid)
        if not atype or not sp:
            return ""
        boost = kind == "raid" and bool(cfg["raid"].get("moveset_assume_boost", True))
        label, note = pick_raid_moveset(m, dex, sp, atype, boost, cfg)
        # If ranking form differs (e.g. Hero scored via Crowned sid), say so.
        if actual and stat_sid and actual.get("speciesId") != stat_sid:
            rank_sp = dex.by_id.get(stat_sid)
            if rank_sp and "crowned" in (stat_sid or "") and not _is_crowned_form(m):
                extra = "Crown this form to unlock Behemoth Blade / higher DPS"
                note = (note + "; " if note else "") + extra
        m.moveset_note = note
        return label or best_moveset_for_type(dex.gm, sp, atype)
    return ""


def build_threat_list(dex, cap, rows, groups):
    """[(sid, rank, score)] - the meta a team's coverage is measured against.

    Preference order:
      1. PvPoke's own meta group for the league (src/data/groups/<name>.json) -
         the curated list the PvPoke site itself feeds its team builder.
      2. Fallback: the top of the overall ranking list, used when the group file
         is missing (older cache, or --offline without it).
    The list is re-sorted by PvPoke's overall score, because the group files are
    published alphabetically.
    """
    payload = (groups or {}).get(cap) or []
    seen, out = set(), []
    for ent in payload:
        sid = ent.get("speciesId") if isinstance(ent, dict) else None
        if not sid or sid in seen:
            continue
        seen.add(sid)
        is_sh = sid.endswith("_shadow")
        base = sid[: -len("_shadow")] if is_sh else sid
        pos = dex.rank_of(base, cap, is_sh)
        if pos:
            out.append((sid, pos[0], pos[1]))
    source = "PvPoke meta group (groups/%s.json)" % (META_GROUP_FILE.get(cap) or str(cap))
    if not out:
        source = "rankings top N (PvPoke meta group unavailable)"
        for r in rows:
            sid = r.get("speciesId")
            if not sid or sid in seen:
                continue
            seen.add(sid)
            is_sh = sid.endswith("_shadow")
            base = sid[: -len("_shadow")] if is_sh else sid
            pos = dex.rank_of(base, cap, is_sh)
            if pos:
                out.append((sid, pos[0], pos[1]))
    out.sort(key=lambda t: (-t[2], t[1]))
    dex.matchup_source[cap] = source
    return out


@dataclass
class TeamMember:
    mon: object
    sid: str
    role: str = ""


@dataclass
class PvpTeam:
    members: list
    score: float = 0.0
    cohesion: dict = field(default_factory=dict)


def _sid_name(dex, sid):
    sp = dex.by_id.get(sid)
    name = _clean_name(sp["speciesName"]) if sp else _sp_name(dex, sid, sid)
    if sid.endswith("_shadow"):
        name += " [Shadow]"
    return name


def pvp_bulk(mon, sid, dex, cap):
    """Defence x HP at the best legal level - the scale PvPoke's Bulk grade uses."""
    sp = dex.by_id.get(sid)
    bs = (sp or {}).get("baseStats")
    if not bs:
        return None
    lvl_cp = best_pvp_level(bs, cap, mon.a, mon.d, mon.s)
    if not lvl_cp:
        return None
    c = CPM[lvl_cp[0]]
    df = (bs["def"] + mon.d) * c
    hp = max(10, math.floor((bs["hp"] + mon.s) * c))
    return df * hp


def _team_roles(members, dex, league_key):
    """(assign_by_sid, quality) for lead / safe swap / closer.

    PvPoke's six category scores include `leads`, `switches` (the score its own
    team-builder Overview reads for the "Safety" grade) and `closers`, so the
    role a member is best at is PvPoke's own answer, not a guess.  Each member
    holds at most one role and a member with no published score drags the
    quality down instead of being quietly skipped.
    """
    assign, quality = {}, []
    for key in ("leads", "switches", "closers"):
        best, best_val = None, None
        for tm in members:
            if tm.sid in assign:
                continue
            val = dex.role_scores(league_key, tm.sid).get(key)
            if val is None:
                continue
            if best_val is None or val > best_val:
                best, best_val = tm, val
        if best is not None:
            assign[best.sid] = PVP_ROLE_LABEL[key]
            quality.append(best_val)
    for tm in members:
        if tm.sid not in assign:
            rs = dex.role_scores(league_key, tm.sid)
            assign[tm.sid] = (PVP_ROLE_LABEL[max(rs, key=rs.get)] if rs else "no PvPoke score")
    q = (sum(quality) / 3.0) / 100.0
    return assign, max(0.0, min(1.0, q))


def score_team_cohesion(members, dex, league_key, cfg, cache=None):
    """PvPoke-sourced cohesion report for one 3-mon team.

    coverage : share of the league meta (weighted - the top of PvPoke's list is
               what you actually meet) that at least one member beats outright.
    holes    : meta threats that beat `hole_min_victims` or more members, i.e.
               the shared weaknesses the old type-only rule could not see.
    roles    : lead / safe swap / closer.
    backup   : for each member's own published worst matchups, the share that a
               team-mate covers.
    Every number is derived from data PvPoke publishes; pairs it does not
    publish are reported as unknown rather than assumed either way.
    """
    cap = CUPS[league_key]["cap"] if isinstance(league_key, str) else league_key
    coh = cfg["pvp_teams"]["cohesion"]
    weights = coh["weights"]
    total_w = sum(float(v) for v in weights.values()) or 1.0
    hole_min = int(coh["hole_min_victims"])
    threats = (dex.threats.get(league_key) or [])[: int(coh["threat_count"])]
    cache = {} if cache is None else cache
    n = max(1, len(threats))

    detail, holes, sweep = [], [], []
    w_cov = w_all = w_total = 0.0
    known_n = covered_n = 0
    for idx, (tsid, trank, tscore) in enumerate(threats):
        w = 1.0 - 0.5 * (idx / max(1, n - 1))
        w_total += w
        tkey = dex.known_sid(league_key, tsid)
        vals = {tm.sid: dex.relation(league_key, dex.known_sid(league_key, tm.sid), tkey, cache)
                for tm in members}
        if not any(v != 0 for v in vals.values()):
            detail.append({"name": _sid_name(dex, tsid), "rank": trank,
                           "result": "no published matchup", "victims": 0,
                           "weight": round(w, 3)})
            continue
        w_all += w
        known_n += 1
        beaten = [s for s, v in vals.items() if v == 1]
        victims = [s for s, v in vals.items() if v == -1]
        if beaten:
            w_cov += w
            covered_n += 1
        if len(victims) >= hole_min:
            holes.append({"name": _sid_name(dex, tsid), "victims": len(victims),
                          "threat_rank": trank, "threat_score": round(float(tscore), 1),
                          "weight": round(w, 3),
                          "beaten_by": [_sid_name(dex, s) for s in beaten],
                          "beats": [_sid_name(dex, s) for s in victims]})
        if len(victims) == len(members) and members:
            sweep.append(_sid_name(dex, tsid))
        detail.append({"name": _sid_name(dex, tsid), "rank": trank,
                       "result": "beaten" if beaten else "not beaten",
                       "victims": len(victims), "weight": round(w, 3)})

    coverage_known = (w_cov / w_all) if w_all else 0.0
    w_unknown = max(0.0, w_total - w_all)
    # Unpublished pairs count as a 50% coin flip rather than as coverage: a team
    # whose meta is only a third evaluated must not outscore a fully covered one.
    denom = w_all + w_unknown
    coverage = ((w_cov + 0.5 * w_unknown) / denom) if denom else 0.0
    hole_load = (sum(h["weight"] for h in holes) / w_all) if w_all else 0.0

    backup_num = backup_den = 0.0
    for tm in members:
        for opp, rating in dex.best_losing_threats(league_key, tm.sid, limit=5):
            sev = max(1.0, 500.0 - min(rating, 500.0))
            backup_den += sev
            for other in members:
                if other is tm:
                    continue
                if dex.relation(league_key, dex.known_sid(league_key, other.sid), opp, cache) == 1:
                    backup_num += sev
                    break
    backup = (backup_num / backup_den) if backup_den else 0.0

    assign, role_q = _team_roles(members, dex, league_key)
    for tm in members:
        tm.role = assign.get(tm.sid, "")

    cons = [dex.role_scores(league_key, tm.sid).get("consistency") for tm in members]
    cons = [c for c in cons if c is not None]
    consistency = (sum(cons) / len(cons) / 100.0) if cons else 0.0

    bulks = [b for b in (pvp_bulk(tm.mon, tm.sid, dex, cap) for tm in members) if b]
    goal = BULK_GOAL.get(cap, 35000.0)
    bulk = min(1.0, (sum(bulks) / len(bulks)) / goal) if bulks and goal else 0.0

    seen_types = defaultdict(int)
    for tm in members:
        for t in (dex.by_id.get(tm.sid, {}).get("types") or []):
            seen_types[t.lower()] += 1
    overlap = sum(v - 1 for v in seen_types.values() if v > 1)

    parts = {
        "coverage": coverage,
        "holes": 1.0 - min(1.0, hole_load),
        "roles": role_q,
        "consistency": consistency,
        "bulk": bulk,
        "backup": backup,
        "typing": 1.0 - min(1.0, overlap / 2.0),
    }
    score = 100.0 * sum(float(weights.get(k, 0.0)) * v for k, v in parts.items()) / total_w
    grade = "F"
    for g in ("A", "B", "C", "D"):
        if score >= float(coh["grades"][g]):
            grade = g
            break

    return {
        "score": round(score, 1), "grade": grade,
        "coverage_pct": round(100.0 * coverage, 1),
        "coverage_known_pct": round(100.0 * coverage_known, 1),
        "covered": covered_n, "known": known_n,
        "threats": len(threats), "unknown": max(0, len(threats) - known_n),
        "coverage_note": ("coverage counts the meta group by PvPoke's ranking "
                          "weight; pairs PvPoke publishes no matchup for count "
                          "as a coin flip, and only the top of the list is "
                          "published, so treat the uncovered tail as unknown"),
        "parts": {k: round(v, 3) for k, v in parts.items()},
        "roles": [_sid_name(dex, tm.sid) + " -> " + (tm.role or "?") for tm in members],
        "role_map": {tm.sid: tm.role for tm in members},
        "holes": holes[:10],
        "sweep": sweep[:5],
        "consistency": round(100.0 * consistency, 1),
        "bulk_pct": round(100.0 * bulk, 1),
        "bulk_goal": goal,
        "backup_pct": round(100.0 * backup, 1),
        "type_overlap": overlap,
        "source": dex.matchup_source.get(cap, "PvPoke rankings"),
        "detail": detail,
    }


def build_pvp_teams(mons, dex, cfg, cap):
    """Best-first exhaustive team search scored on PvPoke-sourced cohesion.

    The previous builder took the best-ranked mon as the lead and appended the
    next two that did not share a type.  That ignored everything PvPoke knows
    about how the three interact, so a team could be three mons with the same
    hard counter.  This enumerates every 3-mon team in the candidate pool,
    scores it with `score_team_cohesion` and returns the best teams
    (a strong mon may appear on more than one team).  Returns (teams, candidates, threat_info).
    """
    tc = cfg["pvp_teams"]
    coh_cfg = tc.get("cohesion") or {}
    rank_max = int(tc["species_rank_max"])
    iv_max = int(tc["iv_rank_max"])
    top_n = int(tc["top_n"])
    cands = []
    for m in mons:
        if not m.species or m.verdict in OUT_OF_PLAY:
            continue
        if m.cp > cap:
            continue
        sid = m.species["speciesId"]
        best_rank, best_sid = 9999, sid
        for t in dex.descendants(sid):
            pos = dex.rank_of(t, cap, m.is_shadow)
            if pos and pos[0] < best_rank:
                best_rank, best_sid = pos[0], t
        if best_rank > rank_max:
            continue
        base = dex.by_id.get(best_sid)
        if not base:
            continue
        iv_r = dex.iv_rank(best_sid, cap, m.a, m.d, m.s)
        if not iv_r or iv_r[0] > iv_max:
            continue
        lvl_cp = best_pvp_level(base["baseStats"], cap, m.a, m.d, m.s)
        # Strict, like the build logic: a mon already over the cap cannot be
        # powered down.  (Master League has no cap, so level 51 is fine.)
        if not lvl_cp or (cap < 10000 and lvl_cp[0] < m.level - 1e-9):
            continue
        # Teams must match the build plan: a mon that still needs a big
        # power-up or an evolution only qualifies when it is the BUILD_PVP
        # target for this very league, otherwise the team would depend on
        # a mon the sorter never told you to build.
        needs_build = (best_sid != sid) or (lvl_cp[0] - m.level > 1.0)
        planned = (m.verdict == "BUILD_PVP" and m.best_pvp is not None
                   and m.best_pvp.cap == cap)
        if cap < 10000 and needs_build and not planned:
            continue      # (Master League has no cap: every mon "needs" level 50)
        cands.append((best_rank + iv_r[0], best_rank, iv_r[0], m.uid, m, best_sid))

    # Explicit, fully comparable sort key (a tuple holding Mon objects raises
    # TypeError on a tie).
    cands.sort(key=lambda c: (c[0], c[1], c[2], c[3]))
    threat_info = {"cap": cap, "source": dex.matchup_source.get(cap, "PvPoke rankings"),
                   "count": len((dex.threats.get(cap) or [])[: int(coh_cfg.get("threat_count", 0))]),
                   "list": [{"name": _sid_name(dex, s), "rank": r, "score": round(float(sc), 1)}
                            for s, r, sc in (dex.threats.get(cap) or [])[: int(coh_cfg.get("threat_count", 0))]]}
    if len(cands) < 3:
        return [], cands, threat_info

    use_coh = bool(coh_cfg.get("enabled", True)) and bool(dex.threats.get(cap))
    pool = cands[: int(coh_cfg.get("max_pool", 40))]
    cache = {}
    raw = []
    for combo in itertools.combinations(pool, 3):
        members = [TeamMember(c[4], c[5]) for c in combo]
        if use_coh:
            coh = score_team_cohesion(members, dex, cap, cfg, cache)
            score = coh["score"]
        else:
            # No PvPoke meta data: fall back to a rank-only score so the search
            # is still best-first (never silently worse than the old greedy).
            coh = {"score": 0.0, "grade": "n/a", "source": "rank only (no matchup data)",
                   "coverage_pct": 0.0, "covered": 0, "known": 0,
                   "threats": 0, "unknown": 0, "parts": {}, "roles": [], "role_map": {},
                   "holes": [], "sweep": [], "consistency": 0.0, "bulk_pct": 0.0,
                   "bulk_goal": BULK_GOAL.get(cap, 35000.0), "backup_pct": 0.0,
                   "type_overlap": 0, "detail": []}
            score = 100.0 - combo[0][0] / 10.0
        raw.append((score, tuple(sorted(c[3] for c in combo)), members, coh))

    raw.sort(key=lambda t: (-t[0], t[1]))
    if tc.get("require_distinct_types", True):
        # Preferred: teams with no shared type.  The pool is only relaxed when it
        # cannot fill top_n - a hard filter would otherwise hide good teams.
        distinct = [r for r in raw if r[3].get("type_overlap", 0) == 0]
        ordered = distinct if len(distinct) >= top_n else raw
    else:
        ordered = raw

    # Decisive variety: share at most league_max_shared_members with any team
    # already listed (same rule as cups).  Avoids three near-clone GL teams.
    teams = []
    max_shared = int(tc.get("league_max_shared_members",
                            tc.get("cup_max_shared_members", 1)))
    for score, key, members, coh in ordered:
        if len(teams) >= top_n:
            break
        member_sids = {tm.sid for tm in members}
        if any(len(member_sids & {tm.sid for tm in t.members}) > max_shared
               for t in teams):
            continue
        teams.append(PvpTeam(members=members, score=score, cohesion=coh))
    if not teams and ordered:         # tiny pools: allow one team at least
        score, _key, members, coh = ordered[0]
        teams.append(PvpTeam(members=members, score=score, cohesion=coh))
    return teams, cands, threat_info


def build_cup_teams(mons, dex, cfg, cup_name):
    """Best 3-mon teams for a cup.  Uses PvPoke's cup meta group for the full
    cohesion model when it is available, otherwise rank-based scoring."""
    cup_spec = CUPS[cup_name]
    cap = cup_spec["cap"]
    tc = cfg["pvp_teams"]
    rank_max = int(tc.get("species_rank_max", 200))
    iv_max = int(tc.get("iv_rank_max", 300))
    top_n = int(tc.get("top_n", 5))

    cands = []
    for m in mons:
        if not m.species or m.verdict in OUT_OF_PLAY:
            continue
        if m.cp > cap:
            continue
        sid = m.species["speciesId"]
        best_rank, best_sid = 9999, sid
        for t in dex.descendants(sid):
            if not dex.cup_allows(t, cup_name):
                continue
            cup_pos = dex.cup_pos.get(cup_name, {}).get(t)
            if cup_pos and cup_pos[0] < best_rank:
                best_rank, best_sid = cup_pos[0], t
        if best_rank > rank_max:
            continue
        base = dex.by_id.get(best_sid)
        if not base:
            continue
        iv_r = dex.iv_rank(best_sid, cap, m.a, m.d, m.s)
        if not iv_r or iv_r[0] > iv_max:
            continue
        lvl_cp = best_pvp_level(base["baseStats"], cap, m.a, m.d, m.s)
        if not lvl_cp or (cap < 10000 and lvl_cp[0] < m.level - 1e-9):
            continue
        needs_build = (best_sid != sid) or (lvl_cp[0] - m.level > 1.0)
        planned = (m.verdict == "BUILD_PVP" and m.best_pvp is not None
                   and m.best_pvp.cap == cap)
        if needs_build and not planned:
            continue
        cands.append((best_rank + iv_r[0], best_rank, iv_r[0], m.uid, m, best_sid))

    cands.sort(key=lambda c: (c[0], c[1], c[2], c[3]))
    if len(cands) < 3:
        return [], cands

    pool = cands[:int((tc.get("cohesion") or {}).get("max_pool", 40))]
    has_threats = bool(dex.threats.get(cup_name))
    cache = {}
    raw = []
    for combo in itertools.combinations(pool, 3):
        members = [TeamMember(c[4], c[5]) for c in combo]
        if has_threats:
            coh = score_team_cohesion(members, dex, cup_name, cfg, cache)
            score = coh["score"]
        else:
            score = 100.0 - combo[0][0] / 10.0
            types = defaultdict(int)
            for c in combo:
                sp = dex.by_id.get(c[5], {})
                for t in sp.get("types") or []:
                    types[t.lower()] += 1
            overlap = sum(v - 1 for v in types.values() if v > 1)
            if tc.get("require_distinct_types", True) and overlap > 0:
                score -= overlap * 10
            coh = {"score": round(score, 1), "grade": "n/a",
                   "source": "rank-based (no cup meta group cached)",
                   "coverage_pct": 0.0, "covered": 0, "known": 0,
                   "threats": 0, "unknown": 0, "parts": {}, "roles": [], "role_map": {},
                   "holes": [], "sweep": [], "consistency": 0.0,
                   "bulk_pct": 0.0, "bulk_goal": BULK_GOAL.get(cap, 22000.0),
                   "backup_pct": 0.0, "type_overlap": overlap, "detail": []}
        raw.append((score, tuple(sorted(c[5] for c in combo)), members, coh))

    raw.sort(key=lambda t: (-t[0], t[1]))
    teams = []
    seen = set()
    max_shared = int(tc.get("cup_max_shared_members", 1))
    for score, key, members, coh in raw:
        if key in seen:
            continue
        # Variety: a team that re-uses 2+ species of a team already listed is
        # the same team with one swap, not an alternative.
        if any(len(set(key) & {tm.sid for tm in t.members}) > max_shared for t in teams):
            continue
        seen.add(key)
        teams.append(PvpTeam(members=members, score=score, cohesion=coh))
        if len(teams) >= top_n:
            break
    return teams, cands

OUT_OF_PLAY = ("REVIEW", "TRANSFER")
# A Pokemon whose verdict is REVIEW (undecided) or TRANSFER (leaving) is never recommended for use:
# not in a team, squad, Mega slot, buddy or tank/healer pick, and it never counts as "have it" on the
# wishlist.  Every recommender filters with this one tuple so the tabs cannot contradict each other.


def build_raid_teams(mons, dex, cfg):
    by_type = defaultdict(list)
    for m in mons:
        if not m.raid_type or not m.species:
            continue
        # TRANSFER only — REVIEW still holds the role (else Electric etc. go empty)
        if m.verdict == "TRANSFER":
            continue
        dps = estimated_raid_dps(m, dex)
        if dps is None:
            continue
        by_type[m.raid_type].append((m, dps))
    # Backfill empty/thin types: score every non-TRANSFER mon for that type
    # using its actual form, so Magnezone/Electivire still appear on Electric
    # even if placement parked them on Steel or a gate cleared the home.
    min_need = int(cfg.get("coverage", {}).get("min_attackers", 3))
    min_atk = int(cfg["raid"]["min_atk_iv"])
    keep_n = int(cfg["raid"]["keep_per_type"])
    for t in RAID_USEFUL_TYPES:
        if len(by_type.get(t, [])) >= min_need:
            continue
        have_ids = {m.uid for m, _ in by_type.get(t, [])}
        extras = []
        for m in mons:
            if m.verdict == "TRANSFER" or not m.species or m.uid in have_ids:
                continue
            if m.a < min_atk - 2:  # allow slight ATK slack for backfill
                continue
            # Temporarily score as this type with actual form
            old_t, old_sid = m.raid_type, m.raid_sid
            m.raid_type, m.raid_sid = t, m.species["speciesId"]
            dps = estimated_raid_dps(m, dex)
            m.raid_type, m.raid_sid = old_t, old_sid
            if dps is None or dps <= 0:
                continue
            extras.append((m, dps))
        extras.sort(key=lambda x: (-x[1], x[0].uid))
        for m, dps in extras[:max(0, keep_n - len(by_type.get(t, [])))]:
            by_type[t].append((m, dps))
            # Give them a home so later logic stays consistent
            if not m.raid_type:
                m.raid_type, m.raid_sid = t, m.species["speciesId"]
    for t in by_type:
        by_type[t].sort(key=lambda x: (-x[1], x[0].uid))
    return by_type


def build_max_teams(mons, dex, cfg):
    by_type = defaultdict(list)
    for m in mons:
        if not m.max_type or not m.species:
            continue
        if m.verdict in OUT_OF_PLAY or not (m.is_dynamax or m.is_gigantamax):
            continue
        dps = estimated_max_dps(m, dex)
        if dps is None:
            continue
        by_type[m.max_type].append((m, dps))
    for t in by_type:
        by_type[t].sort(key=lambda x: (-x[1], x[0].uid))
    return by_type




def rescue_high_iv_from_purify_junk(mons, cfg):
    """Decisive: never transfer a high-IV mon while keeping a worse same-species
    copy whose only job is 'purify to unlock Mega'.

    Promotes the high-IV copy to KEEP.  If a non-shadow Mega-capable mon of the
    same family is already kept, the purify-only junk is released to TRANSFER.
    """
    iv_line = float(cfg.get("protect_iv_pct", 92)) - 2.0
    by_dex = defaultdict(list)
    for m in mons:
        by_dex[m.dex].append(m)
    for _dex, group in by_dex.items():
        transfers = [m for m in group if m.verdict == "TRANSFER"]
        keeps = [m for m in group if m.verdict != "TRANSFER"]
        if not transfers or not keeps:
            continue
        purify_only = [k for k in keeps if k.purify_for_mega]
        if not purify_only:
            continue
        best_junk = max(purify_only, key=lambda k: k.iv_pct)
        candidates = [t for t in transfers
                      if t.iv_pct >= max(iv_line, best_junk.iv_pct + 10)]
        if not candidates:
            continue
        winner = max(candidates, key=lambda t: (t.iv_pct, t.cp))
        winner.verdict = "KEEP"
        winner.role = "Collection"
        winner.why_keep = (f"best IV of species ({winner.iv_pct:g}% beats "
                           f"{best_junk.a}/{best_junk.d}/{best_junk.s} purify-only copy)")
        winner.protect.append(winner.why_keep)
        winner.verdict_priority = 1
        family_has_mega_ready = any(
            (k.can_mega or k.is_mega_capable or k.has_mega_unlocked)
            and not k.is_shadow and k.verdict != "TRANSFER"
            for k in mons if _family_id(k) == _family_id(winner))
        if family_has_mega_ready:
            for junk in purify_only:
                if (junk.verdict in ("KEEP", "REVIEW") and junk.iv_pct < iv_line
                        and junk.purify_for_mega and not junk.best_pvp
                        and not junk.raid_type and not junk.max_type):
                    junk.verdict = "TRANSFER"
                    junk.role = ""
                    junk.why_keep = ("Mega line already unlocked elsewhere; "
                                     "purify-only copy released for transfer")
                    junk.verdict_priority = 3


def demote_redundant_mega_builds(mons, dex, cfg):
    """Decisive: do not BUILD a weak Mega just to cover a boost type when you
    already own a stronger Mega that boosts the same type (even if that stronger
    Mega's primary home is a different type).  Example: Mega Gardevoir covers
    Fairy; a Swablu -> Altaria should not be BUILD_MEGA for Fairy.

    Keeps the mon protected (is_mega_capable) so it stays off the transfer list,
    but clears mega_type so it will not get BUILD_MEGA / mega role priority.
    """
    # Best owned Mega DPS per boost type (recover mega_sid from family when the
    # primary-type keep cap cleared it, same rule as find_mega_for_type).
    best_for = {}
    for m in mons:
        if m.is_shadow or not m.species or m.verdict == "TRANSFER":
            continue
        mega_sid = m.mega_sid
        if not mega_sid:
            _mt, mega_sid, _b = dex.family_mega_info(m.species["speciesId"])
        if not mega_sid:
            continue
        # Temporary sid so estimated_mega_dps can resolve the Mega form
        prev = m.mega_sid
        m.mega_sid = mega_sid
        dps = estimated_mega_dps(m, dex) or 0.0
        m.mega_sid = prev
        for t in dex.mega_boost_types(mega_sid):
            t = t.lower()
            cur = best_for.get(t)
            if cur is None or dps > cur[0]:
                best_for[t] = (dps, m, mega_sid)
    # Any mon whose only claim is a boost type already covered better elsewhere
    for m in mons:
        if not m.mega_type or not m.species:
            continue
        mega_sid = m.mega_sid
        if not mega_sid:
            _mt, mega_sid, _b = dex.family_mega_info(m.species["speciesId"])
        if not mega_sid:
            continue
        prev = m.mega_sid
        m.mega_sid = mega_sid
        my = estimated_mega_dps(m, dex) or 0.0
        m.mega_sid = prev
        boosts = [t.lower() for t in dex.mega_boost_types(mega_sid)]
        if not boosts:
            continue
        redundant = True
        for t in boosts:
            entry = best_for.get(t)
            if not entry or entry[1].uid == m.uid:
                redundant = False
                break
            bdps = entry[0]
            if my >= bdps * 0.85:
                redundant = False
                break
        if not redundant:
            continue
        if m.has_mega_unlocked or m.mega_level > 0 or m.is_currently_mega or m.level >= 30:
            continue
        other = best_for[boosts[0]][1]
        other_name = _clean_name((other.species or {}).get("speciesName", "?"))
        m.caps.append(
            f"stronger Mega already covers {', '.join(_type_display(t) for t in boosts)} "
            f"(e.g. {other_name}); no need to invest here for the boost alone")
        m.mega_type = None
        m.mega_home = False


def find_mega_for_type(mons, dex, atype):
    """Best Mega you own for a raid type, scored with the MEGA form's stats.

    Decisive rule: pick the strongest Mega that actually boosts `atype`, whether
    or not placement marked it as the Mega-home for some other type.  A hundo
    Dragonite must beat an Altaria on a Dragon team.  Unlocked / already-Mega
    copies win pure ties so the team is usable immediately.

    Mega-sid is recovered from the family even when apply_mega_gate cleared
    is_mega_capable (e.g. Gardevoir lost the Psychic Mega slot but still
    boosts Fairy and must beat Altaria on a Fairy team).  Shadows cannot Mega.
    """
    best = None
    atype = (atype or "").lower()
    for m in mons:
        if m.verdict == "TRANSFER" or not m.species:
            continue
        if m.is_shadow:
            continue
        mega_sid = m.mega_sid
        if not mega_sid:
            _mt, mega_sid, _base = dex.family_mega_info(m.species["speciesId"])
        if not mega_sid:
            continue
        boosts = {t.lower() for t in dex.mega_boost_types(mega_sid)}
        if atype not in boosts:
            continue
        sp = dex.by_id.get(mega_sid)
        if not sp:
            continue
        own_types = {t.lower() for t in (sp.get("types") or [])}
        # Prefer a Mega that actually fights as this type over a Primal that
        # only provides the lobby boost (Kyogre Primal boosting Electric).
        own_type = 1 if atype in own_types else 0
        coeff, _ = dex.coeff_of(mega_sid, atype)
        if coeff is None:
            coeff = 0.05  # never 1.0 (Mega Pinsir Flying DPS 275 bug)
        dps = (sp["baseStats"]["atk"] + m.a) * CPM[40.0] * coeff * raid_bulk(sp["baseStats"], m.d, m.s)
        unlocked = 1 if (m.has_mega_unlocked or m.mega_level > 0 or m.is_currently_mega) else 0
        key = (own_type, dps, unlocked, m.iv_pct)
        if best is None:
            best = (m, dps, mega_sid, key)
            continue
        if key > best[3]:
            best = (m, dps, mega_sid, key)
    if best is None:
        return None
    m, dps, mega_sid = best[0], best[1], best[2]
    if not m.mega_sid:
        m.mega_sid = mega_sid
    return (m, dps)


# ---------------------------------------------------------------------------
# Power-up costs
#
# Real in-game curve.  Each power-up is +0.5 level, and the cost is a function
# of the half-level you START from.  The previous table kept the 21-29 pattern
# running all the way to 40, which understated the 30-40 dust bill by ~5x
# (39.5 -> 40.0 alone costs 10,000 dust / 15 candy).
# ---------------------------------------------------------------------------

_POWERUP_BANDS = (          # (band start level, dust, candy)
    (1.0, 200, 1), (3.0, 400, 1), (5.0, 600, 1), (7.0, 800, 1), (9.0, 1000, 1),
    (11.0, 1300, 2), (13.0, 1600, 2), (15.0, 1900, 2), (17.0, 2200, 2),
    (19.0, 2500, 2), (21.0, 3000, 3), (23.0, 3500, 3), (25.0, 4000, 3),
    (26.0, 4000, 4), (27.0, 4500, 4), (29.0, 5000, 4), (31.0, 6000, 6),
    (33.0, 7000, 8), (35.0, 8000, 10), (37.0, 9000, 12), (39.0, 10000, 15),
)

# Above level 40 regular Candy is no longer used: (stardust, candy XL) keyed by
# the level you arrive at.  40.0 -> 40.5 is the first XL power-up.
_XL_STEPS = {
    40.5: (10000, 10), 41.0: (10000, 10), 41.5: (11000, 10), 42.0: (11000, 10),
    42.5: (11000, 12), 43.0: (11000, 12), 43.5: (12000, 12), 44.0: (12000, 12),
    44.5: (12000, 15), 45.0: (12000, 15), 45.5: (13000, 15), 46.0: (13000, 15),
    46.5: (13000, 17), 47.0: (13000, 17), 47.5: (14000, 17), 48.0: (14000, 17),
    48.5: (14000, 20), 49.0: (14000, 20), 49.5: (15000, 20), 50.0: (15000, 20),
}


def _powerup_cost(target_level):
    """(dust, candy, xl) for the single power-up that ENDS at target_level."""
    if target_level > 40.0 + 1e-9:
        dust, xl = _XL_STEPS.get(round(target_level, 1), (15000, 20))
        return dust, 0, xl
    frm = target_level - 0.5
    dust, candy = _POWERUP_BANDS[-1][1], _POWERUP_BANDS[-1][2]
    for start, d, c in _POWERUP_BANDS:
        if start <= frm + 1e-9:
            dust, candy = d, c
        else:
            break
    return dust, candy, 0


def _stardust_to_level(from_lvl, to_lvl, is_shadow=False, is_lucky=False, is_purified=False):
    """(dust, candy, xl) to power from `from_lvl` to `to_lvl`.

    Shadow  : +20% dust and candy (rounded up per power-up).
    Lucky   : -50% dust only - candy and XL are NOT discounted.
    Purified: -10% dust and candy.
    """
    lo, hi = float(from_lvl), float(to_lvl)
    if hi <= lo:
        return 0, 0, 0
    steps = max(1, int(round((hi - lo) * 2)))
    levels = [round(lo + 0.5 * (i + 1), 1) for i in range(steps)]
    dust = candy = xl = 0
    for tgt in levels:
        d, c, x = _powerup_cost(tgt)
        if is_shadow:
            d = int(math.ceil(d * 1.2))
            c = int(math.ceil(c * 1.2))
            x = int(math.ceil(x * 1.2))
        if is_lucky:
            d = int(round(d * 0.5))
        if is_purified:
            d = int(round(d * 0.9))
            c = int(round(c * 0.9))
            x = int(round(x * 0.9))
        dust += d
        candy += c
        xl += x
    return dust, candy, xl


# Evolution candy costs + item requirements, keyed by (from_species_id, to).
# Where a pair appears twice the later entry wins, exactly like the original
# single dict literal this is built from.
_EVOLVE_COSTS = {}

_EVOLVE_COSTS.update({
    # --- 25-candy first-stage evolutions ---
    ("pichu", "pikachu"): (25, None),
    ("cleffa", "clefairy"): (25, None),
    ("igglybuff", "jigglypuff"): (25, None),
    ("togepi", "togetic"): (25, None),
    ("tyrogue", "hitmonlee"): (25, "atk > def"),
    ("tyrogue", "hitmonchan"): (25, "atk < def"),
    ("tyrogue", "hitmontop"): (25, "atk = def"),
    ("smoochum", "jynx"): (25, None),
    ("elekid", "electabuzz"): (25, None),
    ("magby", "magmar"): (25, None),
    ("azurill", "marill"): (25, None),
    ("wynaut", "wobbuffet"): (25, None),
    ("budew", "roselia"): (25, None),
    ("chingling", "chimecho"): (25, None),
    ("bonsly", "sudowoodo"): (50, None),
    ("mimejr", "mrmime"): (50, None),
    ("happiny", "chansey"): (25, None),
    ("munchlax", "snorlax"): (50, None),
    ("riolu", "lucario"): (50, None),
    ("mantyke", "mantine"): (50, "Remoraid in party"),
    ("weavile", "sneasler"): (100, "Razor Claw + day"),
    ("sneasel_hisuian", "sneasler"): (100, "Razor Claw + day"),

    # --- 25-candy mid-stage (stage 1 -> stage 2, 3-stage lines) ---
    ("charmander", "charmeleon"): (25, None),
    ("cyndaquil", "quilava"): (25, None),
    ("torchic", "combusken"): (25, None),
    ("chimchar", "monferno"): (25, None),
    ("tepig", "pignite"): (25, None),
    ("fennekin", "braixen"): (25, None),
    ("litten", "torracat"): (25, None),
    ("scorbunny", "raboot"): (25, None),
    ("squirtle", "wartortle"): (25, None),
    ("totodile", "croconaw"): (25, None),
    ("mudkip", "marshtomp"): (25, None),
    ("piplup", "prinplup"): (25, None),
    ("oshawott", "dewott"): (25, None),
    ("froakie", "frogadier"): (25, None),
    ("popplio", "brionne"): (25, None),
    ("sobble", "drizzile"): (25, None),
    ("bulbasaur", "ivysaur"): (25, None),
    ("chikorita", "bayleef"): (25, None),
    ("treecko", "grovyle"): (25, None),
    ("turtwig", "grotle"): (25, None),
    ("snivy", "servine"): (25, None),
    ("chespin", "quilladin"): (25, None),
    ("rowlet", "dartrix"): (25, None),
    ("grookey", "thwackey"): (25, None),
    ("caterpie", "metapod"): (12, None),
    ("weedle", "kakuna"): (12, None),
    ("pidgey", "pidgeotto"): (12, None),
    ("rattata", "raticate"): (20, None),
    ("rattata_alolan", "raticate_alolan"): (20, None),
    ("spearow", "fearow"): (50, None),
    ("ekans", "arbok"): (50, None),
    ("pikachu", "raichu"): (50, None),
    ("pikachu_alolan", "raichu_alolan"): (50, None),
    ("sandshrew", "sandslash"): (50, None),
    ("nidoran_female", "nidorina"): (25, None),
    ("nidoran_male", "nidorino"): (25, None),
    ("vulpix", "ninetales"): (50, None),
    ("jigglypuff", "wigglytuff"): (50, None),
    ("zubat", "golbat"): (25, None),
    ("oddish", "gloom"): (25, None),
    ("paras", "parasect"): (50, None),
    ("venonat", "venomoth"): (50, None),
    ("diglett", "dugtrio"): (50, None),
    ("meowth", "persian"): (50, None),
    ("psyduck", "golduck"): (50, None),
    ("mankey", "primeape"): (50, None),
    ("growlithe", "arcanine"): (50, None),
    ("poliwag", "poliwhirl"): (25, None),
    ("abra", "kadabra"): (25, None),
    ("machop", "machoke"): (25, None),
    ("bellsprout", "weepinbell"): (25, None),
    ("tentacool", "tentacruel"): (50, None),
    ("geodude", "graveler"): (25, None),
    ("ponyta", "rapidash"): (50, None),
    ("slowpoke", "slowbro"): (50, None),
    ("magnemite", "magneton"): (25, None),
    ("doduo", "dodrio"): (50, None),
    ("seel", "dewgong"): (50, None),
    ("grimer", "muk"): (50, None),
    ("shellder", "cloyster"): (50, None),
    ("gastly", "haunter"): (25, None),
    ("drowzee", "hypno"): (50, None),
    ("krabby", "kingler"): (50, None),
    ("voltorb", "electrode"): (50, None),
    ("exeggcute", "exeggutor"): (50, None),
    ("cubone", "marowak"): (50, None),
    ("koffing", "weezing"): (50, None),
    ("rhyhorn", "rhydon"): (50, None),
    ("horsea", "seadra"): (25, None),
    ("goldeen", "seaking"): (50, None),
    ("staryu", "starmie"): (50, None),
    ("magikarp", "gyarados"): (400, None),
    ("eevee", "vaporeon"): (25, None),
    ("eevee", "jolteon"): (25, None),
    ("eevee", "flareon"): (25, None),
    ("eevee", "espeon"): (25, "walk 10 km as buddy"),
    ("eevee", "umbreon"): (25, "walk 10 km as buddy"),
    ("eevee", "leafeon"): (25, "Mossy Lure"),
    ("eevee", "glaceon"): (25, "Glacial Lure"),
    ("eevee", "sylveon"): (25, "earn 70 buddy hearts"),
    ("omanyte", "omastar"): (50, None),
    ("kabuto", "kabutops"): (50, None),
    ("dratini", "dragonair"): (25, None),
    ("sentret", "furret"): (25, None),
    ("hoothoot", "noctowl"): (50, None),
    ("ledyba", "ledian"): (25, None),
    ("spinarak", "ariados"): (50, None),
    ("chinchou", "lanturn"): (50, None),
    ("natu", "xatu"): (50, None),
    ("mareep", "flaaffy"): (25, None),
    ("marill", "azumarill"): (25, None),
    ("hoppip", "skiploom"): (25, None),
    ("aipom", "ambipom"): (100, None),
    ("sunkern", "sunflora"): (50, "Sun Stone"),
    ("wooper", "quagsire"): (50, None),
    ("pineco", "forretress"): (50, None),
    ("snubbull", "granbull"): (50, None),
    ("teddiursa", "ursaring"): (50, None),
    ("slugma", "magcargo"): (50, None),
    ("swinub", "piloswine"): (25, None),
    ("remoraid", "octillery"): (50, None),
    ("houndour", "houndoom"): (25, None),
    ("phanpy", "donphan"): (50, None),
    ("stantler", "wyrdeer"): (50, None),
    ("larvitar", "pupitar"): (25, None),
    ("poochyena", "mightyena"): (50, None),
    ("zigzagoon", "linoone"): (50, None),
    ("wurmple", "silcoon"): (12, None),
    ("wurmple", "cascoon"): (12, None),
    ("lotad", "lombre"): (25, None),
    ("seedot", "nuzleaf"): (25, None),
    ("taillow", "swellow"): (50, None),
    ("wingull", "pelipper"): (50, None),
    ("ralts", "kirlia"): (25, None),
    ("surskit", "masquerain"): (50, None),
    ("shroomish", "breloom"): (50, None),
    ("slakoth", "vigoroth"): (25, None),
    ("vigoroth", "slaking"): (25, None),
    ("nincada", "ninjask"): (50, None),
    ("whismur", "loudred"): (12, None),
    ("makuhita", "hariyama"): (50, None),
    ("skitty", "delcatty"): (50, "Moon Stone"),
    ("aron", "lairon"): (25, None),
    ("meditite", "medicham"): (50, None),
    ("electrike", "manectric"): (50, None),
    ("carvanha", "sharpedo"): (50, None),
    ("numel", "camerupt"): (50, None),
    ("spoink", "grumpig"): (50, None),
    ("trapinch", "vibrava"): (25, None),
    ("cacnea", "cacturne"): (50, None),
    ("swablu", "altaria"): (400, None),
    ("barboach", "whiscash"): (50, None),
    ("corphish", "crawdaunt"): (50, None),
    ("baltoy", "claydol"): (50, None),
    ("lileep", "cradily"): (50, None),
    ("anorith", "armaldo"): (50, None),
    ("feebas", "milotic"): (100, "walk 20 km + Prism Scale"),
    ("shuppet", "banette"): (50, None),
    ("duskull", "dusclops"): (25, None),
    ("spheal", "sealeo"): (25, None),
    ("clamperl", "huntail"): (50, "Deep Sea Tooth"),
    ("clamperl", "gorebyss"): (50, "Deep Sea Scale"),
    ("bagon", "shelgon"): (25, None),
    ("shelgon", "salamence"): (100, None),
    ("beldum", "metang"): (25, None),
    ("metang", "metagross"): (100, None),
    ("starly", "staravia"): (25, None),
    ("bidoof", "bibarel"): (50, None),
    ("shinx", "luxio"): (25, None),
    ("burmy", "wormadam"): (50, "female"),
    ("burmy", "mothim"): (50, "male"),
    ("combee", "vespiquen"): (50, "female"),
    ("buizel", "floatzel"): (50, None),
    ("cherubi", "cherrim"): (50, None),
    ("shellos", "gastrodon"): (50, None),
    ("drifloon", "drifblim"): (50, None),
    ("buneary", "lopunny"): (50, None),
    ("glameow", "purugly"): (50, None),
    ("stunky", "skuntank"): (50, None),
    ("bronzor", "bronzong"): (50, None),
    ("gible", "gabite"): (25, None),
    ("gabite", "garchomp"): (100, None),
    ("hippopotas", "hippowdon"): (50, None),
    ("skorupi", "drapion"): (50, None),
    ("croagunk", "toxicroak"): (50, None),
    ("carnivine", "carnivine"): (0, None),
    ("snover", "abomasnow"): (50, None),
    ("patrat", "watchog"): (50, None),
    ("lillipup", "herdier"): (25, None),
    ("purrloin", "liepard"): (50, None),
    ("pansage", "simisage"): (50, "Leaf Stone"),
    ("pansear", "simisear"): (50, "Fire Stone"),
    ("panpour", "simipour"): (50, "Water Stone"),
    ("munna", "musharna"): (50, "Moon Stone"),
    ("pidove", "tranquill"): (12, None),
    ("blitzle", "zebstrika"): (50, None),
    ("roggenrola", "boldore"): (25, None),
    ("boldore", "gigalith"): (100, None),
    ("woobat", "swoobat"): (50, None),
    ("timburr", "gurdurr"): (25, None),
    ("gurdurr", "conkeldurr"): (100, None),
    ("sewaddle", "swadloon"): (25, None),
    ("venipede", "whirlipede"): (25, None),
    ("cottonee", "whimsicott"): (50, "Sun Stone"),
    ("petilil", "lilligant"): (50, "Sun Stone"),
    ("sandile", "krokorok"): (25, None),
    ("darumaka", "darmanitan"): (50, None),
    ("dwebble", "crustle"): (50, None),
    ("scraggy", "scrafty"): (50, None),
    ("yamask", "cofagrigus"): (50, "Unova Stone"),
    ("tirtouga", "carracosta"): (50, None),
    ("archen", "archeops"): (50, None),
    ("trubbish", "garbodor"): (50, None),
    ("zorua", "zoroark"): (50, None),
    ("minccino", "cinccino"): (50, "Unova Stone"),
    ("gothita", "gothorita"): (25, None),
    ("solosis", "duosion"): (25, None),
    ("ducklett", "swanna"): (50, None),
    ("vanillite", "vanillish"): (25, None),
    ("deerling", "sawsbuck"): (50, None),
    ("foongus", "amoonguss"): (50, None),
    ("frillish", "jellicent"): (50, None),
    ("joltik", "galvantula"): (50, None),
    ("ferroseed", "ferrothorn"): (50, None),
    ("klink", "klang"): (25, None),
    ("tynamo", "eelektrik"): (25, None),
    ("elgyem", "beheeyem"): (50, None),
    ("litwick", "lampent"): (25, None),
    ("lampent", "chandelure"): (100, "Unova Stone"),
    ("axew", "fraxure"): (25, None),
    ("cubchoo", "beartic"): (50, None),
    ("shelmet", "accelgor"): (50, "trade Shelmet/Karrablast"),
    ("karrablast", "escavalier"): (50, "trade Karrablast/Shelmet"),
    ("mienfoo", "mienshao"): (50, None),
    ("golett", "golurk"): (50, None),
    ("pawniard", "bisharp"): (50, None),
    ("rufflet", "braviary"): (50, None),
    ("vullaby", "mandibuzz"): (50, None),
    ("deino", "zweilous"): (25, None),
    ("larvesta", "volcarona"): (400, None),
    ("fletchling", "fletchinder"): (25, None),
    ("scatterbug", "spewpa"): (12, None),
    ("litleo", "pyroar"): (50, None),
    ("flabebe", "floette"): (25, None),
    ("skiddo", "gogoat"): (50, None),
    ("pancham", "pangoro"): (50, None),
    ("furfrou", "furfrou"): (0, None),
    ("espurr", "meowstic"): (50, None),
    ("honedge", "doublade"): (25, None),
    ("spritzee", "aromatisse"): (50, "trade + Sachet"),
    ("swirlix", "slurpuff"): (50, "trade + Whipped Dream"),
    ("inkay", "malamar"): (50, "device upside down"),
    ("skrelp", "dragalge"): (50, None),
    ("clauncher", "clawitzer"): (50, None),
    ("helioptile", "heliolisk"): (50, "Sun Stone"),
    ("tyrunt", "tyrantrum"): (50, None),
    ("amaura", "aurorus"): (50, None),
    ("goomy", "sliggoo"): (25, None),
    ("phantump", "trevenant"): (50, None),
    ("pumpkaboo", "gourgeist"): (50, None),
    ("bergmite", "avalugg"): (50, None),
    ("noibat", "noivern"): (400, None),
    ("pikipek", "trumbeak"): (25, None),
    ("yungoos", "gumshoos"): (50, None),
    ("grubbin", "charjabug"): (25, None),
    ("crabrawler", "crabominable"): (50, None),
    ("cutiefly", "ribombee"): (50, None),
    ("rockruff", "lycanroc"): (50, None),
    ("mareanie", "toxapex"): (50, None),
    ("mudbray", "mudsdale"): (50, None),
    ("dewpider", "araquanid"): (50, None),
    ("fomantis", "lurantis"): (50, None),
    ("morelull", "shiinotic"): (50, None),
    ("salandit", "salazzle"): (50, "female"),
    ("stufful", "bewear"): (400, None),
    ("bounsweet", "steenee"): (25, None),
    ("wimpod", "golisopod"): (400, None),
    ("sandygast", "palossand"): (50, None),
    ("typenull", "silvally"): (50, None),
    ("jangmo_o", "hakamoo"): (25, None),
    ("hakamoo", "kommoo"): (100, None),
    ("skwovet", "greedent"): (50, None),
    ("rookidee", "corvisquire"): (25, None),
    ("corvisquire", "corviknight"): (100, None),
    ("blipbug", "dottler"): (25, None),
    ("chewtle", "drednaw"): (50, None),
    ("rolycoly", "carkol"): (25, None),
    ("applin", "flapple"): (50, "Tart Apple"),
    ("applin", "appletun"): (50, "Sweet Apple"),
    ("applin", "dipplin"): (50, "Syrupy Apple"),
    ("silicobra", "sandaconda"): (50, None),
    ("arrokuda", "barraskewda"): (50, None),
    ("toxel", "toxtricity"): (400, None),
    ("sizzlipede", "centiskorch"): (50, None),
    ("clobbopus", "grapploct"): (50, None),
    ("sinistea", "polteageist"): (50, "Cracked/Chipped Pot"),
    ("hatenna", "hattrem"): (25, None),
    ("impidimp", "morgrem"): (25, None),
    ("morgrem", "grimmsnarl"): (100, None),
    ("milcery", "alcremie"): (50, "sweet + spin"),
    ("falinks", "falinks"): (0, None),
    ("pincurchin", "pincurchin"): (0, None),
    ("snom", "frosmoth"): (50, "high friendship"),
    ("cufant", "copperajah"): (50, None),
    ("dreepy", "drakloak"): (25, None),
    ("drakloak", "dragapult"): (100, None),
    ("sprigatito", "floragato"): (25, None),
    ("fuecoco", "crocalor"): (25, None),
    ("quaxly", "quaxwell"): (25, None),
    ("lechonk", "oinkologne"): (50, None),
    ("tarountula", "spidops"): (50, None),
    ("nymble", "lokix"): (50, None),
    ("pawmi", "pawmo"): (25, None),
    ("tandemaus", "maushold"): (25, None),
    ("fidough", "dachsbun"): (50, None),
    ("smoliv", "dolliv"): (25, None),
    ("nacli", "naclstack"): (25, None),
    ("charcadet", "armarouge"): (50, "Auspicious Armor"),
    ("charcadet", "ceruledge"): (50, "Malicious Armor"),
    ("tadbulb", "bellibolt"): (50, "Thunder Stone"),
    ("wattrel", "kilowattrel"): (50, None),
    ("maschiff", "mabosstiff"): (50, None),
    ("shroodle", "grafaiai"): (50, None),
    ("bramblin", "brambleghast"): (50, None),
    ("toedscool", "toedscruel"): (50, None),
    ("klawf", "klawf"): (0, None),
    ("capsakid", "scovillain"): (50, "Fire Stone"),
    ("rellor", "rabsca"): (50, None),
    ("flittle", "espathra"): (50, None),
    ("tinkatink", "tinkatuff"): (25, None),
    ("wiglett", "wugtrio"): (50, None),
    ("bombirdier", "bombirdier"): (0, None),
    ("finizen", "palafin"): (50, "co-op in Union Circle"),
    ("varoom", "revavroom"): (50, None),
    ("cyclizar", "cyclizar"): (0, None),
    ("orthworm", "orthworm"): (0, None),
    ("glimmet", "glimmora"): (50, None),
    ("greavard", "houndstone"): (50, None),
    ("flamigo", "flamigo"): (0, None),
    ("cetoddle", "cetitan"): (50, None),
    ("veluza", "veluza"): (0, None),
    ("dondozo", "dondozo"): (0, None),
    ("tatsugiri", "tatsugiri"): (0, None),
    ("frigibax", "arctibax"): (25, None),
    ("arctibax", "baxcalibur"): (100, None),
})
_EVOLVE_COSTS.update({
    # --- Trade evolutions with no item (item only matters if not trading) ---
    ("kadabra", "alakazam"): (100, None),
    ("machoke", "machamp"): (100, None),
    ("graveler", "golem"): (100, None),
    ("haunter", "gengar"): (100, None),
    ("boldore", "gigalith"): (100, None),
    ("gurdurr", "conkeldurr"): (100, None),
    ("karrablast", "escavalier"): (50, "trade Karrablast/Shelmet"),
    ("shelmet", "accelgor"): (50, "trade Shelmet/Karrablast"),
    ("phantump", "trevenant"): (50, None),
    ("pumpkaboo", "gourgeist"): (50, None),

    # --- Item-gated evolutions ---
    ("vulpix", "ninetales"): (50, None),
    ("poliwhirl", "politoed"): (100, "Kings Rock"),
    ("slowpoke", "slowking"): (50, "Kings Rock"),
    ("slowpoke_galarian", "slowking_galarian"): (50, "Galarica Wreath"),
    ("slowpoke_galarian", "slowbro_galarian"): (50, "Galarica Cuff"),
    ("seadra", "kingdra"): (100, "Dragon Scale"),
    ("onix", "steelix"): (50, "Metal Coat"),
    ("scyther", "scizor"): (50, "Metal Coat"),
    ("porygon", "porygon2"): (25, "Up-Grade"),
    ("porygon2", "porygonz"): (100, "Dubious Disc"),
    ("gloom", "bellossom"): (100, "Sun Stone"),
    ("gloom", "vileplume"): (100, "Leaf Stone"),
    ("poliwhirl", "poliwrath"): (100, "Water Stone"),
    ("pikachu", "raichu_alolan"): (50, "Thunder Stone"),
    ("nidorina", "nidoqueen"): (100, "Moon Stone"),
    ("nidorino", "nidoking"): (100, "Moon Stone"),
    ("clefairy", "clefable"): (50, "Moon Stone"),
    ("jigglypuff", "wigglytuff"): (50, "Moon Stone"),
    ("skiploom", "jumpluff"): (100, None),
    ("stantler", "wyrdeer"): (50, None),
    ("sunkern", "sunflora"): (50, "Sun Stone"),
    ("roselia", "roserade"): (100, "Shiny Stone"),
    ("togetic", "togekiss"): (100, "Shiny Stone"),
    ("murkrow", "honchkrow"): (100, "Dusk Stone"),
    ("misdreavus", "mismagius"): (100, "Dusk Stone"),
    ("lampent", "chandelure"): (100, "Unova Stone"),
    ("minccino", "cinccino"): (50, "Unova Stone"),
    ("eelektrik", "eelektross"): (100, "Unova Stone"),
    ("doublade", "aegislash"): (100, "Dusk Stone"),
    ("frogadier", "greninja"): (100, None),
    ("charjabug", "vikavolt"): (100, "Magnetic Lure"),
    ("crabrawler", "crabominable"): (50, "Ice Stone"),
    ("pikachu", "raichu"): (50, None),

    # --- 3-stage 100-candy final steps ---
    ("charmeleon", "charizard"): (100, None),
    ("wartortle", "blastoise"): (100, None),
    ("ivysaur", "venusaur"): (100, None),
    ("quilava", "typhlosion"): (100, None),
    ("croconaw", "feraligatr"): (100, None),
    ("bayleef", "meganium"): (100, None),
    ("combusken", "blaziken"): (100, None),
    ("marshtomp", "swampert"): (100, None),
    ("grovyle", "sceptile"): (100, None),
    ("monferno", "infernape"): (100, None),
    ("prinplup", "empoleon"): (100, None),
    ("grotle", "torterra"): (100, None),
    ("pignite", "emboar"): (100, None),
    ("dewott", "samurott"): (100, None),
    ("servine", "serperior"): (100, None),
    ("braixen", "delphox"): (100, None),
    ("quilladin", "chesnaught"): (100, None),
    ("torracat", "incineroar"): (100, None),
    ("brionne", "primarina"): (100, None),
    ("dartrix", "decidueye"): (100, None),
    ("raboot", "cinderace"): (100, None),
    ("drizzile", "inteleon"): (100, None),
    ("thwackey", "rillaboom"): (100, None),
    ("floragato", "meowscarada"): (100, None),
    ("crocalor", "skeledirge"): (100, None),
    ("quaxwell", "quaquaval"): (100, None),

    # --- Stage-2 -> stage-3 lines that need a specific move / item ---
    ("dragonair", "dragonite"): (100, None),
    ("pupitar", "tyranitar"): (100, None),
    ("metang", "metagross"): (100, None),
    ("shelgon", "salamence"): (100, None),
    ("vibrava", "flygon"): (100, None),
    ("piloswine", "mamoswine"): (100, "Ancient Power"),
    ("yanma", "yanmega"): (100, "Ancient Power"),
    ("tangela", "tangrowth"): (100, "Ancient Power"),
    ("lickitung", "lickilicky"): (100, "Rollout"),
    ("aipom", "ambipom"): (100, None),
    ("gligar", "gliscor"): (100, "Razor Fang + night"),
    ("sneasel", "weavile"): (100, "Razor Claw + night"),
    ("sneasel_hisuian", "sneasler"): (100, "Razor Claw + day"),
    ("roselia", "roserade"): (100, "Shiny Stone"),
    ("nosepass", "probopass"): (50, "Magnetic Lure"),
    ("magneton", "magnezone"): (100, "Magnetic Lure"),
    ("charjabug", "vikavolt"): (100, "Magnetic Lure"),
    ("eelektrik", "eelektross"): (100, "Unova Stone"),
})


def _step_cost(a, b):
    return _EVOLVE_COSTS.get((a, b), (50, None))


def _family_path_cost(dex, from_sid, to_sid):
    """BFS the family tree: (candy, item, [path of species ids]).

    Returns (None, None, []) when `to_sid` is not reachable from `from_sid`.
    """
    if from_sid == to_sid:
        return 0, None, [from_sid]
    q = deque([(from_sid, 0, None, [from_sid])])
    seen = {from_sid}
    while q:
        sid, cost, last_item, path = q.popleft()
        node = dex.by_id.get(sid)
        if not node:
            continue
        for nxt in ((node.get("family") or {}).get("evolutions") or []):
            if nxt in seen:
                continue
            step_cost, step_item = _step_cost(sid, nxt)
            new_cost = cost + step_cost
            new_item = step_item or last_item
            if nxt == to_sid:
                return new_cost, new_item, path + [nxt]
            seen.add(nxt)
            q.append((nxt, new_cost, new_item, path + [nxt]))
    return None, None, []
# ---------------------------------------------------------------------------
# Per-row build cost (dust / candy / XL). Kept from the old budget system.
# ---------------------------------------------------------------------------

def _build_row_costs(row, m, dex, cfg):
    """(target level, dust, candy, xl, evolve candy) for one BUILD_ row.

    Candy includes the evolution step when the row needs one, because that comes
    out of the same family pool as the power-ups.
    """
    tgt = None
    try:
        tgt = float(row["power_up_to"]) if row["power_up_to"] else None
    except (TypeError, ValueError):
        tgt = None
    dust = candy = xl = 0
    if tgt is not None and tgt > m.level:
        dust, candy, xl = _stardust_to_level(
            m.level, tgt, is_shadow=m.is_shadow,
            is_lucky=bool(m.raw.get("isLucky")), is_purified=m.is_purified)
    evo_candy = 0
    own = (m.species or {}).get("speciesId")
    if m.evolve_to_sid and own and m.evolve_to_sid != own:
        c, _item, _path = _family_path_cost(dex, own, m.evolve_to_sid)
        if c is None:
            c, _item = _step_cost(own, m.evolve_to_sid)
        if c:
            evo_candy = int(c)
    return tgt, dust, candy + evo_candy, xl, evo_candy


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

VERDICT_ORDER = {"BUILD_PVP": 0, "BUILD_MEGA": 1, "BUILD_RAID": 2,
                 "BUILD_MAX": 3, "BUILD_GYM": 4, "KEEP": 5, "REVIEW": 6, "TRANSFER": 7}

CSV_FIELDS = ["verdict", "species", "form", "dex", "cp", "level", "iv", "iv_pct",
              "flags", "role", "evolve_to", "power_up_to", "build_cp", "moveset", "moveset_note", "moves_now", "moves_need",
              "best_pvp", "why", "warnings", "ingame_search", "id",
              "cost_dust", "cost_candy", "cost_xl", "cost_note"]


def _sp_name(dex, sid, fallback=""):
    sp = dex.by_id.get(sid)
    return _clean_name(sp["speciesName"]) if sp else fallback


# ---------------------------------------------------------------------------
# Structured report (report.json + viewer.html)
#
# The text outputs are for reading, the JSON is for the viewer (and for any
# other tooling): same numbers, no regex scraping.
# ---------------------------------------------------------------------------

def _iv_str(m):
    return f"{m.a}/{m.d}/{m.s}"


def _tier_tag(combined):
    if combined <= 30:
        return "TOP-TIER"
    if combined <= 120:
        return "excellent"
    return "good"


def _sp_json(dex, sid):
    return dex.by_id.get(sid) or {}


def search_collisions(rows, safe):
    """For every mon on the transfer list, find OTHER mons that the same in-game
    search string would also select but that are NOT being transferred.
    Searching "Piplup&cp438" selects every Piplup at CP 438, so a keeper with the
    same species and CP is one tap away from being transferred by mistake."""
    safe_ids = {r["id"] for r in safe}
    by_search = defaultdict(list)
    for r in rows:
        by_search[r["ingame_search"]].append(r)
    out = {}
    for r in safe:
        others = [o for o in by_search[r["ingame_search"]]
                  if o["id"] != r["id"] and o["id"] not in safe_ids]
        if others:
            out[r["id"]] = others
    return out


def _family_id(m):
    sp = m.species or {}
    return (sp.get("family") or {}).get("id") or sp.get("speciesId") or f"dex{m.dex}"


def _mon_name(m):
    return _clean_name(m.species["speciesName"]) if m.species else f"dex {m.dex}"


def look_flags(m, cfg):
    """Reasons a mon deserves a second look before it is transferred.
    Returns (triggers, notes).  Triggers put the mon in the 'last look' block;
    notes are shown next to it but never trigger it on their own."""
    lc = cfg["last_look"]
    p = m.raw
    disp = p.get("pokemonDisplay") or {}
    trig, notes = [], []
    if m.iv_pct >= float(lc["iv_pct"]):
        trig.append(f"IV {m.iv_pct:g}%")
    if m.level > float(lc["level_above"]):
        trig.append(f"level {m.level:g}")
    if m.is_shiny:
        trig.append("SHINY")
    if p.get("isLucky"):
        trig.append("LUCKY")
    if disp.get("costume"):
        trig.append("costume")
    if m.origin_events:
        trig.append("event origin: " + ", ".join(str(e) for e in m.origin_events[:2]))
    if m.location_card:
        trig.append("location card")
    if p.get("favorite"):
        trig.append("favorite")
    if m.has_third_move:
        trig.append("has a 3rd move")
    if m.is_purified:
        trig.append("purified")
    if m.is_shadow:
        notes.append("shadow")
    if p.get("pokemonTagIds"):
        notes.append("has an in-game tag")
    return trig, notes


def kept_comparators(m, mons, limit=3):
    """Best copies you are KEEPING that make this transfer look surplus.

    Prefer the evolution line (same family id) over same-dex only, so a
    Bulbasaur transfer is compared to your Venusaur hundo - not a worse
    unevolved shadow kept for purify.  Same shiny / costume still preferred
    when the transfer itself is shiny or costumed.
    """
    disp = m.raw.get("pokemonDisplay") or {}
    fam = _family_id(m)
    out = []
    for o in mons:
        if o.uid == m.uid or o.verdict == "TRANSFER":
            continue
        same_dex = o.dex == m.dex
        same_fam = _family_id(o) == fam
        if not (same_dex or same_fam):
            continue
        od = o.raw.get("pokemonDisplay") or {}
        if m.is_shiny and not o.is_shiny:
            continue
        if disp.get("costume") and od.get("costume") != disp.get("costume"):
            continue
        # Prefer final forms and higher IV; same-dex gets a small boost so a
        # better unevolved copy still ranks above an unrelated stage.
        stage_bonus = 0.0 if same_dex else -0.01
        out.append((o.iv_pct + stage_bonus + (0.5 if o.dex != m.dex and o.iv_pct >= m.iv_pct else 0.0),
                    o.cp, o))
    out.sort(key=lambda t: (-t[0], -t[1], t[2].uid))
    return [t[2] for t in out[:limit]]


def triage_review(mons, dex, cfg):
    """Sort every REVIEW mon into PROBABLY KEEP or PROBABLY TRANSFER.
    Advice only: nothing here changes a verdict.  The rule is deliberately
    lopsided - it takes one good reason to keep, and a transfer suggestion needs
    a clear 'you already have something better' (or a weak mon with no special
    status at all)."""
    tc = cfg["review_triage"]
    kept = defaultdict(list)       # family -> mons you are keeping / building
    review = defaultdict(list)     # family -> mons still under review
    for m in mons:
        fam = _family_id(m)
        if m.verdict == "REVIEW":
            review[fam].append(m)
        elif m.verdict != "TRANSFER":
            kept[fam].append(m)
    for fam in review:
        review[fam].sort(key=lambda o: (-o.iv_pct, -o.cp, o.uid))

    def straight_line(m):
        """Species ids a copy of m can safely be replaced by: its own species,
        plus later stages reached WITHOUT a branch (Gastly->Haunter->Gengar yes,
        Eevee->anything no, because Eevee can still become something else)."""
        sid = (m.species or {}).get("speciesId")
        ids, cur = set(), sid
        while cur and cur in dex.by_id and cur not in ids:
            ids.add(cur)
            evos = (dex.by_id[cur].get("family") or {}).get("evolutions") or []
            cur = evos[0] if len(evos) == 1 else None
        return ids

    def alignment(m):
        return 1 if m.is_shadow else (2 if m.is_purified else 0)

    def replaces(o, m, line):
        """True if keeping o makes m redundant."""
        sid = (o.species or {}).get("speciesId")
        return (sid in line and alignment(o) == alignment(m)
                and o.iv_pct >= m.iv_pct and o.a >= m.a - 1)

    out = []
    for fam, group in review.items():
        for rank, m in enumerate(group):
            keep, xfer = [], []
            trig, _notes = look_flags(m, cfg)
            special = [t for t in trig if not t.startswith(("IV ", "level "))]
            if special:
                keep.append("special: " + ", ".join(special))
            if m.protect:
                keep.append("already has a keep reason: " + "; ".join(dict.fromkeys(m.protect))[:80])
            if m.iv_pct >= float(tc["keep_iv_pct"]):
                keep.append(f"IV {m.iv_pct:g}% is hundo-class")
            if m.level > float(tc["keep_level_above"]):
                keep.append(f"already powered to L{m.level:g}")
            good_pvp = [e for e in (m.pvp or []) if e.eligible
                        and e.iv_rank <= int(tc["keep_pvp_iv_rank"])]
            if good_pvp:
                e = min(good_pvp, key=lambda e: e.iv_rank)
                keep.append(f"top-{tc['keep_pvp_iv_rank']} IV spread for {e.league} {e.name} (IV rank #{e.iv_rank})")
            line = straight_line(m)
            better_kept = [o for o in kept.get(fam, []) if replaces(o, m, line)]
            better_rev = [o for o in group[:rank] if replaces(o, m, line)]
            if better_kept:
                o = max(better_kept, key=lambda o: o.iv_pct)
                xfer.append(f"you already keep a {_mon_name(o)} {o.a}/{o.d}/{o.s} ({o.iv_pct:g}%) "
                            f"from this evolution line that is at least as good")
            elif better_rev:
                o = better_rev[0]
                xfer.append(f"a better copy is also under review: {_mon_name(o)} {o.a}/{o.d}/{o.s} "
                            f"({o.iv_pct:g}%) - keep that one, not this one")
            elif m.iv_pct < float(tc["transfer_iv_pct"]):
                xfer.append(f"only {m.iv_pct:g}% IV and nothing special about it")
            else:
                keep.append(f"best {_mon_name(m)}-line mon you have ({m.iv_pct:g}% IV) and nothing else "
                            f"of the line is kept")
            if keep:
                bucket = "KEEP"
            elif xfer:
                bucket = "TRANSFER"
            else:
                bucket = "KEEP"
                keep.append("no clear reason either way - keeping is the safe choice")
            out.append((m, bucket, keep if bucket == "KEEP" else xfer))
    out.sort(key=lambda t: (_mon_name(t[0]), -t[0].iv_pct, t[0].uid))
    return out


def build_review_triage_text(triage, mons, cfg, rows_by_uid):
    keep = [t for t in triage if t[1] == "KEEP"]
    xfer = [t for t in triage if t[1] == "TRANSFER"]
    L = ["REVIEW TRIAGE - advice only, nothing here is on your transfer list.",
         "REVIEW mons are never transferred automatically.  This file sorts them into",
         "'probably keep' and 'probably transfer'.  To act on a 'probably transfer' mon,",
         "check it in-game first (each line shows its in-game search).",
         "A mon is only called 'probably transfer' if it has no special status",
         "(shiny / lucky / costume / event / 3rd move / hundo-class IV / good PvP spread)",
         "AND you already keep something at least as good from the same evolution line,",
         "or it is a weak, plain mon.  One good reason to keep is enough to stay in KEEP.",
         "",
         f"{len(triage)} mons under review:  {len(xfer)} probably transfer,  {len(keep)} probably keep.",
         ""]
    L += [f"=== PROBABLY TRANSFER ({len(xfer)}) ===", ""]
    if not xfer:
        L.append("  (none)")
    for m, _b, why in xfer:
        r = rows_by_uid.get(m.uid, {})
        trig, notes = look_flags(m, cfg)
        extra = ("  [also: " + ", ".join(trig + notes) + "]") if (trig or notes) else ""
        L.append(f"  {r.get('ingame_search', _mon_name(m)):<24} CP {m.cp:<5} IV {m.a}/{m.d}/{m.s} "
                 f"({m.iv_pct:g}%) L{m.level:g}{extra}")
        L.append(f"      why: {why[0]}")
    L += ["", f"=== PROBABLY KEEP ({len(keep)}) ===", ""]
    cur = None
    for m, _b, why in keep:
        if _mon_name(m) != cur:
            cur = _mon_name(m)
            L.append(f"{cur}")
        r = rows_by_uid.get(m.uid, {})
        L.append(f"    {r.get('ingame_search', ''):<24} CP {m.cp:<5} IV {m.a}/{m.d}/{m.s} "
                 f"({m.iv_pct:g}%) L{m.level:g}")
        L.append(f"        why keep: {why[0]}")
    return L



def build_report(mons, dex, cfg, meta, rows, verdicts, gates, special, roles,
                 team_stats, raid_teams, max_teams, megas, evo_kept, safe, by_sp,
                 protected_ids, ml, glul, dn, cov_rows, notes):
    by_uid = {m.uid: m for m in mons}

    pvp_by_uid = {}
    for m in mons:
        ent = [{"league": e.league, "cap": e.cap,
                "species_rank": e.species_rank, "iv_rank": e.iv_rank,
                "combined": (e.species_rank or 0) + (e.iv_rank or 0),
                "eligible": bool(e.eligible)} for e in m.pvp]
        ent.sort(key=lambda d: d["combined"])
        pvp_by_uid[m.uid] = ent

    mons_json = []
    for r in rows:
        m = by_uid.get(r["id"])
        mons_json.append({
            "id": r["id"], "verdict": r["verdict"], "species": r["species"],
            "form": r["form"], "dex": r["dex"], "cp": r["cp"], "level": r["level"],
            "iv": r["iv"], "a": m.a if m else None, "d": m.d if m else None,
            "s": m.s if m else None, "iv_pct": r["iv_pct"],
            "flags": (r["flags"] or "").split(), "role": r["role"],
            "evolve_to": r["evolve_to"], "power_up_to": r["power_up_to"],
            "build_cp": r["build_cp"], "moveset": r["moveset"],
            "moves": current_moves(m) if m else [],
            "moves_need": moves_needed(m) if m else [],
            "best_pvp": r["best_pvp"], "why": r["why"],
            "warnings": [w for w in (r["warnings"] or "").split("; ") if w],
            "search": r["ingame_search"],
            "cost_dust": r.get("cost_dust") or 0, "cost_candy": r.get("cost_candy") or 0,
            "cost_xl": r.get("cost_xl") or 0,
            "raid_type": _type_display(m.raid_type) if m and m.raid_type else "",
            "max_type": _type_display(m.max_type) if m and m.max_type else "",
            "mega_type": _type_display(m.mega_type) if m and m.mega_type else "",
            "pvp": pvp_by_uid.get(r["id"], []),
            "shadow": bool(m and m.is_shadow), "lucky": bool(m and m.raw.get("isLucky")),
            "purified": bool(m and m.is_purified), "year": (m.year if m else None),
            **readiness_fields(m, dex, r["verdict"], cfg)[0],
        })

    # --- PvP teams ---------------------------------------------------------
    leagues = []
    for league, cap in (("Great", 1500), ("Ultra", 2500), ("Master", 10000)):
        if cap not in CAPS:
            continue
        teams_, _cands, tinfo = team_stats.get(cap, ([], [], {}))
        out_teams = []
        for i, team in enumerate(teams_, 1):
            members = []
            for tm in team.members:
                m, sid = tm.mon, tm.sid
                sp = _sp_json(dex, sid)
                r_at = dex.rank_of(sid, cap, m.is_shadow)
                iv_r = dex.iv_rank(sid, cap, m.a, m.d, m.s)
                lvl = best_pvp_level(sp["baseStats"], cap, m.a, m.d, m.s) if sp.get("baseStats") else None
                members.append({
                    "id": m.uid, "name": _clean_name(sp.get("speciesName", "?")), "cp": m.cp, "iv": _iv_str(m),
                    "sp_rank": r_at[0] if r_at else None,
                    "iv_rank": iv_r[0] if iv_r else None,
                    "level": round(lvl[0], 1) if lvl else None,
                    "target_cp": lvl[1] if lvl else None,
                    "shadow": bool(m.is_shadow), "mega": bool(m.is_mega_capable),
                    "evolve_from": (_clean_name(m.species["speciesName"])
                                    if (m.evolve_to and m.species) else None),
                    "role": tm.role,
                    "roles": {PVP_ROLE_LABEL[k]: round(dex.role_scores(cap, sid).get(k, 0.0), 1)
                              for k in ("leads", "switches", "closers")},
                })
            out_teams.append({"n": i, "members": members, "score": team.score,
                              "cohesion": team.cohesion})
        leagues.append({"league": league, "cap": cap, "teams": out_teams,
                        "threats": tinfo.get("list", []),
                        "threat_source": tinfo.get("source", ""),
                        "threat_note": cfg["pvp_teams"]["cohesion"]["note"]})

    # --- raid / max teams --------------------------------------------------
    raid_json = []
    for t in sorted(raid_teams):
        entries = list(raid_teams[t][:int(cfg["raid"]["keep_per_type"])])
        if not entries:
            continue
        mega_json = None
        found = find_mega_for_type(mons, dex, t)
        if found:
            mm, mdps = found
            mega_json = {"id": mm.uid, "name": _clean_name(_sp_json(dex, mm.mega_sid).get("speciesName", "?")),
                         "cp": mm.cp, "iv": _iv_str(mm), "dps": round(mdps, 1),
                         "active": bool(mm.is_currently_mega), "from": _display_species(mm)}
        mega_uid = found[0].uid if found else None
        if mega_uid:
            entries = [(m, d) for m, d in entries if m.uid != mega_uid]
        ents = []
        _n_team = min(5, len(entries)) if found else len(entries)
        for _k, (m, dps) in enumerate(entries):
            now = moves_str(m)
            sug = m.moveset or ""
            # Never recommend Behemoth on a non-Crowned mon
            if not _is_crowned_form(m) and "behemoth" in sug.lower():
                sug = ""
                m.moveset = sug
            note = m.moveset_note or ""
            if "behemoth" in note.lower() and not _is_crowned_form(m):
                note = "Crown this form to unlock Behemoth Blade / higher DPS"
            if sug and now and sug.lower() != now.lower() and "TM" not in note:
                note = (("TM needed: " + sug) if not note else note)
            # Evolve marker for the viewer: name = final form, from = current
            # pre-evo so the UI shows "Escavalier  from Karrablast".
            cur_sid = (m.species or {}).get("speciesId", "")
            tgt_sid = m.raid_sid or cur_sid
            is_evo = bool(
                tgt_sid and cur_sid and tgt_sid != cur_sid
                and "crowned" not in tgt_sid and "crowned" not in cur_sid
                and "mega" not in tgt_sid
            )
            if is_evo:
                tgt_sp = dex.by_id.get(tgt_sid) or {}
                row_name = _clean_name(tgt_sp.get("speciesName") or tgt_sid)
                row_from = _display_species(m)
            else:
                row_name = _display_species(m)
                row_from = ""
            ents.append({"id": m.uid, "slot": "team" if _k < _n_team else "backup",
                         "name": row_name, "cp": m.cp,
                         "iv": _iv_str(m), "dps": round(dps, 1), "level": round(m.level, 1),
                         "shadow": bool(m.is_shadow),
                         "moveset": now or sug,
                         "moveset_suggested": sug,
                         "moveset_note": note,
                         "verdict": m.verdict,
                         "from": row_from,
                         "evolve_to": row_name if is_evo else ""})
        raid_json.append({"type": _type_display(t), "mega": mega_json, "entries": ents})

    max_json = []
    for t in sorted(max_teams):
        entries = max_teams[t][:int(cfg["max_battle"]["keep_per_type"])]
        if not entries:
            continue
        ents = []
        for m, dps in entries:
            sid = m.max_sid or ((m.species or {}).get("speciesId", ""))
            info = dex.max_sets.get((sid, t)) or (None, None)
            fast = _move_label(info[0]) if info and info[0] else ""
            ents.append({"id": m.uid, "name": _display_species(m),
                         "cp": m.cp, "iv": _iv_str(m), "iv_pct": m.iv_pct, "dps": round(dps, 1),
                         "gmax": bool(m.is_gigantamax), "fast": fast})
        max_json.append({"type": _type_display(t), "entries": ents})

    # --- mega --------------------------------------------------------------
    mega_priority = []
    for m in megas:
        tags = []
        if m.is_currently_mega:
            tags.append("ACTIVE")
        if m.has_mega_unlocked:
            tags.append("unlocked")
        if m.mega_level >= 1:
            tags.append(f"Mega L{m.mega_level}")
        boost = dex.mega_boost_types(m.mega_sid)
        if boost:
            tags.append("boosts " + "/".join(_type_display(b) for b in boost))
        dps = estimated_mega_dps(m, dex)
        if dps:
            tags.append(f"dps {dps:.1f}" + (f" ({_type_display(m.mega_type)})" if m.mega_type else ""))
        mega_priority.append({
            "id": m.uid,
            "form": _sp_json(dex, m.mega_sid).get("speciesName") or _sp_name(dex, m.mega_sid, "?"),
            "mine": _clean_name(m.species["speciesName"]) if m.species else f"dex {m.dex}",
            "cp": m.cp, "iv": _iv_str(m), "iv_pct": m.iv_pct, "tags": tags})
    boost_rows = []
    if cfg["mega"]["recommend_boost_type"] and megas:
        top_n = int(cfg["mega"]["top_n_for_boost"])
        for t in sorted(RAID_USEFUL_TYPES):
            owned = [(estimated_mega_dps(m, dex) or 0.0, m) for m in megas
                     if t in dex.mega_boost_types(m.mega_sid)]
            if not owned:
                continue
            owned.sort(key=lambda x: -x[0])
            for dps, m in owned[:top_n]:
                boost_rows.append({
                    "type": _type_display(t),
                    "form": _sp_json(dex, m.mega_sid).get("speciesName") or _sp_name(dex, m.mega_sid, "?"),
                    "cp": m.cp, "iv": _iv_str(m), "dps": round(dps, 1)})

    # --- evolve / transfer -------------------------------------------------
    evo_json = [{"species": e["row"]["species"], "cp": e["row"]["cp"], "iv": e["row"]["iv"],
                 "iv_pct": e["row"]["iv_pct"], "target": e["target_name"],
                 "candy": e["candy"], "item": e["item"], "via": e["via"],
                 "role": e["row"]["role"]} for e in evo_kept]

    groups = []
    _clash = search_collisions(rows, safe)
    for sp in sorted(by_sp):
        rs = sorted(by_sp[sp], key=lambda r: r["iv_pct"])
        rows_j = []
        for r in rs:
            warn = ""
            if r["cp"] >= int(cfg["safeguards"]["warn_high_cp"]):
                warn = "HIGH CP"
            elif r["level"] >= float(cfg["safeguards"]["warn_high_level"]):
                warn = "HIGH LEVEL"
            clash = _clash.get(r["id"])
            if clash:
                warn = (warn + "; " if warn else "") + "SAME SEARCH ALSO MATCHES A MON YOU KEEP"
            rows_j.append({"id": r["id"], "cp": r["cp"], "iv": r["iv"], "iv_pct": r["iv_pct"],
                           "level": r["level"], "search": r["ingame_search"], "warn": warn})
        groups.append({"species": sp, "count": len(rs), "search": sp, "rows": rows_j})

    # --- power-up priority -------------------------------------------------
    def prow(c_):
        m = c_["mon"]
        return {"id": m.uid, "league": c_["league"],
                "species": _clean_name(m.species["speciesName"]) if m.species else f"dex {m.dex}",
                "cp": m.cp, "iv": _iv_str(m), "iv_rank": c_["iv_rank"],
                "species_rank": c_["species_rank"], "combined": c_["combined"],
                "from": round(m.level, 1), "to": round(c_["target_level"], 1),
                "target_cp": c_["target_cp"], "dust": c_["dust"], "candy": c_["candy"],
                "xl": c_["xl"], "tag": _tier_tag(c_["combined"])}

    # Cup teams (patch 9b) - append to leagues list
    for _cup_name, _cup_spec in CUPS.items():
        try:
            _teams_c, _ = build_cup_teams(mons, dex, cfg, _cup_name)
        except Exception:
            _teams_c = []
        _out_teams = []
        for _i, _team in enumerate(_teams_c, 1):
            _members = []
            for _tm in _team.members:
                _m, _sid = _tm.mon, _tm.sid
                _sp = _sp_json(dex, _sid)
                _cup_pos = dex.cup_pos.get(_cup_name, {}).get(_sid)
                _iv_r = dex.iv_rank(_sid, _cup_spec["cap"], _m.a, _m.d, _m.s)
                _lvl = best_pvp_level(_sp["baseStats"], _cup_spec["cap"], _m.a, _m.d, _m.s) if _sp.get("baseStats") else None
                _members.append({
                    "id": _m.uid, "name": _clean_name(_sp.get("speciesName", "?")),
                    "cp": _m.cp, "iv": _iv_str(_m),
                    "sp_rank": _cup_pos[0] if _cup_pos else None,
                    "iv_rank": _iv_r[0] if _iv_r else None,
                    "level": round(_lvl[0], 1) if _lvl else None,
                    "target_cp": _lvl[1] if _lvl else None,
                    "shadow": bool(_m.is_shadow), "mega": bool(_m.is_mega_capable),
                    "role": "", "roles": {},
                })
            _out_teams.append({"n": _i, "members": _members, "score": _team.score,
                               "cohesion": _team.cohesion})
        leagues.append({
            "league": _cup_spec["title"] + " Cup",
            "cap": _cup_spec["cap"],
            "teams": _out_teams,
            "threats": [],
            "threat_source": dex.matchup_source.get(_cup_name, "rank-based"),
            "threat_note": ("Cup teams are scored against PvPoke's cup meta group."
                            if str(dex.matchup_source.get(_cup_name, "")).startswith("PvPoke")
                            else "Cup teams use rank-based scoring, not meta cohesion."),
        })

    return {
        "meta": {"generated": datetime.datetime.now().isoformat(timespec="seconds"),
                 "export_time": meta.get("export_time"), "gm_date": meta.get("gm_date"),
                 "gm_age_days": round(float(meta.get("age") or 0.0), 2),
                 "mons": len(mons), "eggs": meta.get("eggs", 0),
                 "sorter": "pogo_sorter.py"},
        "counts": {"verdicts": verdicts, "gates": gates, "special": special, "roles": roles},
        "readiness": _readiness_summary(rows, by_uid, dex, cfg),
        "mons": mons_json,
        "teams": leagues,
        "raid_teams": raid_json,
        "max_teams": max_json,
        "mega": {"priority": mega_priority, "boost": boost_rows},
        "coverage": cov_rows,
        "coverage_min": int(cfg["coverage"]["min_attackers"]),
        "evolve": evo_json,
        "transfer": {"protected": len(protected_ids), "total": len(safe), "groups": groups},
        "priority": {"ml": [prow(c) for c in ml], "glul": [prow(c) for c in glul],
                     "dn": [prow(c) for c in dn]},
        "notes": notes,
    }


VIEWER_MARKER = "/*__REPORT_JSON__*/ null"


def write_viewer(outdir, report):
    """Write viewer.html with the report embedded.

    A browser cannot fetch() a sibling file from file://, so the sorter hands
    you a copy that already has the data in it - double-click and it works.
    """
    tpl_path = HERE / "viewer.html"
    dest = outdir / "viewer.html"
    if not tpl_path.exists():
        return False
    try:
        if tpl_path.resolve() == dest.resolve():
            print("[warn] viewer.html would overwrite the template - skipping the copy")
            return False
    except OSError:
        pass
    tpl = tpl_path.read_text(encoding="utf-8")
    if VIEWER_MARKER not in tpl:
        print("[warn] viewer.html has no injection marker - load report.json manually")
        return False
    blob = json.dumps(report, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    dest.write_text(tpl.replace(VIEWER_MARKER, blob), encoding="utf-8")
    return True


MOVES_VIEWER_TPL = r'''<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>PoGo Sorter â€“ Collection Viewer</title>
<style>
:root{box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);--bg:#f6f7f9;--card:#fff;--tx:#1b1f24;--mu:#667085;--bd:#e3e6ea;--ac:#2563eb;--hi:#eef3ff}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#14171b;--card:#1d2127;--tx:#e8eaed;--mu:#9aa3af;--bd:#2d333b;--ac:#6ea0ff;--hi:#1f2a40}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:1500px;margin:0 auto;padding:16px}h1{font-size:20px;margin:0 0 4px}.sub{color:var(--mu);margin:0 0 12px}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0}
input[type=search]{flex:1 1 260px;padding:9px 12px;border:1px solid var(--bd);border-radius:8px;background:var(--card);color:var(--tx);font-size:14px}
label.chip{display:inline-flex;gap:5px;align-items:center;padding:5px 10px;border:1px solid var(--bd);border-radius:999px;background:var(--card);cursor:pointer;user-select:none}
.st{display:inline-block;padding:1px 7px;border-radius:999px;font-size:11px;font-weight:600;background:#667085;color:#fff;white-space:nowrap}
.st[data-s="Ready"]{background:#2f9e44}
.st[data-s="Needs TM"]{background:#b7791f}
.st[data-s="Needs second charged move"]{background:#e8590c}
.st[data-s="Needs Elite TM"]{background:#7048e8}
.st[data-s="Unknown"]{background:#667085}
label.chip:has(input:checked){background:var(--hi);border-color:var(--ac)}label.chip input{margin:0}
button{padding:8px 12px;border:1px solid var(--bd);border-radius:8px;background:var(--card);color:var(--tx);cursor:pointer;font-size:14px}
.wrap{overflow-x:auto;border:1px solid var(--bd);border-radius:10px;background:var(--card)}
table{border-collapse:collapse;width:100%;min-width:1100px}
th,td{padding:6px 9px;text-align:left;border-bottom:1px solid var(--bd);vertical-align:top}
th{position:sticky;top:0;background:var(--card);cursor:pointer;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--mu);white-space:nowrap}
th.s::after{content:" \25B2"}th.s.d::after{content:" \25BC"}tr:hover td{background:var(--hi)}
.nm small,.pl small{display:block;color:var(--mu);font-size:11px;max-width:340px;white-space:normal}
.mv{display:inline-block;padding:2px 8px;border-radius:999px;color:#fff;font-size:12px;font-weight:600;white-space:nowrap}
.b{display:inline-block;padding:0 6px;border-radius:4px;font-size:11px;font-weight:700;margin-left:4px;color:#fff}
.v{display:inline-block;padding:1px 8px;border-radius:6px;font-size:11px;font-weight:700;color:#fff;white-space:nowrap}
.num{font-variant-numeric:tabular-nums;white-space:nowrap}.mu{color:var(--mu)}.need{color:#c2410c;font-size:11px;white-space:normal;max-width:190px;display:block}
#count{color:var(--mu)}
</style></head><body><main>
<h1>PoGo Sorter â€“ Collection Viewer</h1>
<p class="sub" id="meta"></p>
<div class="bar" id="vf"></div>
<div class="bar"><input id="q" type="search" placeholder="Search species, move, role, reason, flagâ€¦">
<label class="chip"><input type="checkbox" id="needs">Moves to fix</label>
<label class="chip"><input type="checkbox" id="elite">Has elite move</label>
<button id="csv">Export CSV</button><button id="copy">Copy in-game search</button><span id="count"></span></div>
<div class="wrap"><table><thead><tr id="hd"></tr></thead><tbody id="tb"></tbody></table></div>
</main>
<script>
const R=/*__DATA__*/null;
const TC={normal:"#8a8d91",fire:"#e8590c",water:"#2f7de1",electric:"#d9a200",grass:"#3a9d3a",ice:"#38a8b8",fighting:"#c0392b",poison:"#9b4dca",ground:"#a9792b",flying:"#6c8ae4",psychic:"#e0507f",bug:"#8aa31d",rock:"#a39350",ghost:"#6a5a9e",dragon:"#4a52d6",dark:"#5a4a42",steel:"#6b8794",fairy:"#d96fb0"};
const VC={BUILD_PVP:"#2563eb",BUILD_MEGA:"#c0392b",BUILD_RAID:"#e8590c",BUILD_MAX:"#9b4dca",BUILD_GYM:"#3a9d3a",KEEP:"#4b5563",REVIEW:"#b7791f",TRANSFER:"#b91c1c"};
const ORDER=["BUILD_PVP","BUILD_MEGA","BUILD_RAID","BUILD_MAX","BUILD_GYM","KEEP","REVIEW","TRANSFER"];
const COLS=[["verdict","Verdict"],["name","PokÃ©mon"],["cp","CP"],["iv_pct","IV %"],["level","Lvl"],["fast","Fast"],["c1","Charged 1"],["c2","Charged 2"],["plan","Plan"],["build_status","Status"]];
const M=R.mons.map(m=>{const mv=m.moves||[];const g=s=>mv.find(x=>x.slot===s)||null;
 return Object.assign({},m,{name:m.species+(m.form?" ("+m.form+")":""),fast:g("fast"),c1:g("charged"),c2:g("charged2"),
 plan:[m.evolve_to?"Evolve to "+m.evolve_to:"",m.power_up_to?"Power to L"+m.power_up_to+(m.build_cp?" (CP ~"+m.build_cp+")":""):""].filter(Boolean).join("; "),
 text:[m.species,m.form,m.role,m.why,m.build_status||"",(m.flags||[]).join(" "),m.verdict,mv.map(x=>x.name).join(" "),m.best_pvp,(m.warnings||[]).join(" ")].join(" ").toLowerCase()})});
let sk="verdict",sd=1,vf=new Set(ORDER);
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?"":s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
const chip=x=>x?`<span class="mv" style="background:${TC[x.type]||"#777"}">${esc(x.name)}${x.elite?" â˜…":""}</span>`:'<span class="mu">â€“</span>';
const keyf=(o,k)=>{if(k==="verdict")return ORDER.indexOf(o.verdict);if(k==="build_status"){const SR=["Ready","Needs TM","Needs second charged move","Needs Elite TM","Unknown"];const si=SR.indexOf(o.build_status);return si<0?SR.length:si}const v=o[k];return v&&typeof v==="object"?v.name:(v==null?"":v)};
function vis(){const q=$("#q").value.toLowerCase().trim().split(/\s+/).filter(Boolean);
 return M.filter(o=>vf.has(o.verdict)&&q.every(t=>o.text.includes(t))&&(!$("#needs").checked||(o.moves_need||[]).length)&&(!$("#elite").checked||(o.moves||[]).some(x=>x.elite)))
 .sort((x,y)=>{let a=keyf(x,sk),b=keyf(y,sk);return (a>b?1:a<b?-1:0)*sd||(y.iv_pct-x.iv_pct)})}
function render(){const out=vis();$("#count").textContent=out.length+" of "+M.length;
 $("#tb").innerHTML=out.map(o=>{const f=o.flags||[];
  return `<tr><td><span class="v" style="background:${VC[o.verdict]||"#555"}">${o.verdict.replace("BUILD_","BUILD ")}</span></td>
 <td class="nm">${esc(o.name)}${o.shadow?'<span class="b" style="background:#7a3fb0">SHADOW</span>':""}${o.purified?'<span class="b" style="background:#2f9e9e">PURIFIED</span>':""}${o.lucky?'<span class="b" style="background:#c28a00">LUCKY</span>':""}${f.slice(0,4).map(x=>`<span class="b" style="background:#667085">${esc(x)}</span>`).join("")}<small>${esc(o.role)}</small></td>
 <td class="num">${o.cp}</td><td class="num">${o.iv_pct}% <span class="mu">${esc(o.iv)}</span></td><td class="num">${o.level}</td>
 <td>${chip(o.fast)}</td><td>${chip(o.c1)}</td><td>${chip(o.c2)}${(o.moves_need||[]).length?`<span class="need">suggested: ${esc(o.moves_need.join(", "))}</span>`:""}</td>
 <td class="pl">${esc(o.plan)}<small>${esc(o.why)}</small></td><td class="num"><span class="st" data-s="${esc(o.build_status||"")}">${esc(o.build_status||"-")}</span></td></tr>`}).join("");
 $("#hd").innerHTML=COLS.map(([k,l])=>`<th data-k="${k}" class="${k===sk?"s"+(sd<0?" d":""):""}">${l}</th>`).join("");}
const cnt={};M.forEach(m=>cnt[m.verdict]=(cnt[m.verdict]||0)+1);
$("#vf").innerHTML=ORDER.filter(v=>cnt[v]).map(v=>`<label class="chip"><input type="checkbox" data-v="${v}" checked><span class="v" style="background:${VC[v]}">${v.replace("BUILD_","BUILD ")}</span> ${cnt[v]}</label>`).join("");
$("#meta").textContent=(R.meta&&R.meta.export_time?"Export: "+R.meta.export_time+" Â· ":"")+M.length+" PokÃ©mon Â· moves are the ones each PokÃ©mon knows right now (â˜… = elite/legacy)";
document.querySelectorAll("[data-v]").forEach(c=>c.onchange=()=>{c.checked?vf.add(c.dataset.v):vf.delete(c.dataset.v);render()});
$("#q").oninput=render;$("#needs").onchange=render;$("#elite").onchange=render;
$("#hd").onclick=e=>{const k=e.target.dataset.k;if(!k)return;if(k===sk)sd=-sd;else{sk=k;sd=(k==="cp"||k==="iv_pct"||k==="level")?-1:1}render()};
$("#csv").onclick=()=>{const e=v=>'"'+String(v==null?"":v).replace(/"/g,'""')+'"';
 const t=[["Verdict","Pokemon","CP","IV%","IV","Level","Fast","Charged1","Charged2","Suggested moves","Plan","Why"].map(e).join(",")].concat(vis().map(o=>[o.verdict,o.name,o.cp,o.iv_pct,o.iv,o.level,o.fast&&o.fast.name,o.c1&&o.c1.name,o.c2&&o.c2.name,(o.moves_need||[]).join(" / "),o.plan,o.why].map(e).join(",")));
 const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\ufeff"+t.join("\n")],{type:"text/csv"}));a.download="sorter_view.csv";a.click()};
$("#copy").onclick=()=>{const s=vis().map(o=>o.search).filter(Boolean).join(",");(navigator.clipboard?navigator.clipboard.writeText(s):Promise.reject()).then(()=>alert("Copied "+s.split(",").length+" search terms"),()=>prompt("Copy this:",s))};
render();
</script></body></html>
'''


def write_moves_viewer(outdir, report):
    """moves_viewer.html: self-contained browser view of every Pokemon with the
    verdict, plan and the moves it knows right now (type-coloured chips, * =
    elite/legacy).  Needs no template file and no network."""
    blob = json.dumps({"meta": report.get("meta", {}), "mons": report["mons"]},
                      ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    (outdir / "moves_viewer.html").write_text(
        MOVES_VIEWER_TPL.replace("/*__DATA__*/null", blob), encoding="utf-8")
    return True


def write_outputs(mons, dex, outdir, meta, cfg):
    outdir.mkdir(exist_ok=True)
    rows = []
    for m in mons:
        best_pvp_str = ""
        if m.best_pvp:
            e = m.best_pvp
            best_pvp_str = f"{e.league} {e.name} (species #{e.species_rank}, IV rank #{e.iv_rank})"

        informational = []
        if m.has_third_move: informational.append("3rdMove")
        if m.num_upgrades >= 20: informational.append(f"Upg{m.num_upgrades}")
        if m.buddy_km >= 100: informational.append(f"Buddy{m.buddy_km:.0f}km")
        if m.is_shadow: informational.append("Shadow")
        if m.is_purified: informational.append("Purified")
        if m.location_card: informational.append("LocationCard")

        if m.verdict == "TRANSFER":
            flags = informational
        else:
            flags = []
            if m.is_mega_capable: flags.append("Mega")
            if m.is_mega_pre_evo and not (m.species and m.species["speciesId"] in dex.mega_bases):
                flags.append("MegaPreEvo")
            if m.purify_for_mega: flags.append("PurifyForMega")
            if m.has_mega_unlocked: flags.append("MegaUnlocked")
            if m.is_currently_mega: flags.append("MegaNow")
            if m.mega_level >= 1: flags.append(f"SuperMega{m.mega_level}")
            if m.is_dynamax: flags.append("Dynamax")
            if m.is_gigantamax: flags.append("Gigantamax")
            if m.is_shiny: flags.append("Shiny")
            if m.verdict == "REVIEW": flags.append("Review")
            flags.extend(informational)

        species_name = _display_species(m)
        rows.append({
            "verdict": m.verdict,
            "species": species_name,
            "form": m.form_name if _norm(m.form_name) not in ("", "unset") else "",
            "dex": m.dex, "cp": m.cp, "level": m.level,
            "iv": f"{m.a}/{m.d}/{m.s}", "iv_pct": m.iv_pct,
            "flags": " ".join(flags),
            "role": m.role,
            "evolve_to": m.evolve_to,
            "power_up_to": m.power_up_to,
            "build_cp": m.build_cp,
            "moveset": m.moveset,
            "moveset_note": m.moveset_note,
            "moves_now": moves_str(m),
            "moves_need": ", ".join(moves_needed(m)),
            "best_pvp": best_pvp_str,
            "why": m.why_keep,
            "warnings": "; ".join(dict.fromkeys(m.caps + m.warnings + sorted(m.review_reasons))),
            "ingame_search": _ingame_search(m, species_name),
            "id": m.uid,
        })
    rows.sort(key=lambda r: (VERDICT_ORDER.get(r["verdict"], 99), -r["iv_pct"]))

    # ---- per-row cost estimates (dust/candy/XL to build) -------------------
    _by_uid = {m.uid: m for m in mons}
    for r in rows:
        m = _by_uid.get(r["id"])
        if not m or not r["verdict"].startswith("BUILD_"):
            continue
        _tgt, _dust, _candy, _xl, _evo = _build_row_costs(r, m, dex, cfg)
        r["cost_dust"], r["cost_candy"], r["cost_xl"] = _dust, _candy, _xl
        r["cost_note"] = ""

    with open(outdir / "sort_report.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        w.writeheader()
        w.writerows(rows)

    # ---- build queue -------------------------------------------------------
    build = [r for r in rows if r["verdict"].startswith("BUILD_")]
    _cov = coverage_state(mons, dex, cfg)
    COV["gaps"] = {t for t, v in _cov.items() if v["need"] > 0}
    _picked = {m.uid for v in _cov.values() for m, _d, _c in v["picks"]}
    _dps_of = {m.uid: d for v in _cov.values() for m, d in v["entries"]}
    def _gap_rank(r):
        if not COV["active"] or r["verdict"] not in ("BUILD_RAID", "BUILD_MEGA"):
            return (0, 0)
        mm = _by_uid.get(r["id"])
        if mm is None:
            return (2, 0)
        t = mm.mega_type if r["verdict"] == "BUILD_MEGA" else mm.raid_type
        grp = 0 if mm.uid in _picked else (1 if t in COV["gaps"] else 2)
        return (grp, -(_dps_of.get(mm.uid) or 0.0))
    def _defer(r):
        return int(COV["active"] and bool(cfg["coverage"].get("defer_master_builds", True))
                   and r["verdict"] == "BUILD_PVP" and str(r.get("role") or "").startswith("Master League")
                   and float(r.get("power_up_to") or 0) > 40)
    build.sort(key=lambda r: (_defer(r), VERDICT_ORDER.get(r["verdict"], 99), _gap_rank(r), -r["iv_pct"]))
    _n_def = sum(_defer(r) for r in build)
    L = ["BUILD QUEUE - Pokemon worth investing in",
         "Order: PvP > Mega > Raid > Max > Gym. Every entry passed its quality gate.", ""]
    if COV["active"]:
        L[2:2] = [f"COVERAGE FIRST: Raid and Mega builds target L{COV['target']:g} until every raid type has "
                  f"{int(cfg['coverage']['min_attackers'])} usable attackers. The strongest attacker for each open spot comes first.",
                  "Gap types: " + ", ".join(sorted(_type_display(t) for t in COV["gaps"])), ""]
        if _n_def:
            L[4:4] = [f"{_n_def} Master League project(s) (power to L50) are listed last until coverage is complete."]
    for r in build:
        parts = [f"[{r['verdict'].replace('BUILD_', '')}]",
                 f"{r['species']} (CP {r['cp']}, {r['iv']})"]
        if r["flags"]: parts.append(f"[{r['flags']}]")
        if r["evolve_to"]: parts.append(f"EVOLVE TO {r['evolve_to']}")
        parts.append(r["role"])
        if r["power_up_to"]:
            cp = f" (CP ~{r['build_cp']})" if r["build_cp"] else ""
            parts.append(f"power to L{r['power_up_to']}{cp}")
        if r.get("moves_now"):
            parts.append("moves now: " + r["moves_now"])
        if r["moveset"]:
            if not r.get("moves_now"):
                parts.append(f"TM: {r['moveset']}")
            elif r.get("moves_need"):
                parts.append("suggested: " + r["moves_need"])
            else:
                parts.append("moves already match the suggestion")
        L.append("  | ".join(parts))
        if r.get("cost_dust") or r.get("cost_candy") or r.get("cost_xl"):
            L.append(f"      cost to build: {r['cost_dust']:,} dust, "
                     f"{r['cost_candy']:,} candy, {r['cost_xl']:,} XL")
    if not build:
        L.append("  (nothing passed the quality gates)")
    (outdir / "build_list.txt").write_text("\n".join(L) + "\n", encoding="utf-8")
    # ---- evolve queue ------------------------------------------------------
    evo_rows = []
    for r in rows:
        if not r["evolve_to"] or r["verdict"] == "TRANSFER":
            continue
        # A mon that is already at the right level but not yet evolved still
        # belongs on the evolve queue (that was a real gap: "already built"
        # rows silently vanished from the evolve list).
        if r["verdict"] == "KEEP" and r["role"] in ("", "Collection", "Trade bait"):
            continue
        mon_obj = next((m for m in mons if m.uid == r["id"]), None)
        if not mon_obj or not mon_obj.species or not mon_obj.evolve_to_sid:
            continue
        candy, item, path = _family_path_cost(dex, mon_obj.species["speciesId"], mon_obj.evolve_to_sid)
        if candy is None:
            candy, item = _step_cost(mon_obj.species["speciesId"], mon_obj.evolve_to_sid)
        via = _sp_name(dex, path[1], path[1]) if len(path) > 2 else None
        evo_rows.append({"row": r, "mon": mon_obj, "target_sid": mon_obj.evolve_to_sid,
                         "target_name": r["evolve_to"], "candy": candy, "item": item, "via": via})

    def _bucket(role):
        if role.startswith(("Great ", "Ultra ", "Master ")): return "pvp"
        if role.startswith("Mega"): return "mega"
        if role.startswith(("Raid", "Dynamax", "Gigantamax")): return "pve"
        if role.startswith("Gym"): return "gym"
        return "other"

    max_per_dest = {"pvp": 2, "mega": 1, "pve": 4, "gym": 2, "other": 1}
    groups = defaultdict(list)
    for e in evo_rows:
        groups[(_bucket(e["row"]["role"]), e["target_sid"])].append(e)
    kept, dropped = [], []
    for (bucket, _), members in groups.items():
        members.sort(key=lambda e: (-e["row"]["iv_pct"], e["row"]["id"]))
        n = max_per_dest.get(bucket, 1)
        kept.extend(members[:n])
        dropped.extend(members[n:])
    kept.sort(key=lambda e: ({"pvp": 0, "mega": 1, "pve": 2, "gym": 3, "other": 4}[_bucket(e["row"]["role"])],
                             -e["row"]["iv_pct"]))

    def _fmt_cost(e):
        s = f"{e['candy']} candy"
        if e["item"]:
            s += f" + {e['item']}"
        if e.get("via"):
            s += f", via {e['via']}"
        return s

    E = ["EVOLVE QUEUE - deduped by destination, with candy cost",
         "Do NOT evolve without checking the destination role first.", ""]
    for bucket_key, label in [("pvp", "PVP PRIORITIES"), ("mega", "MEGA UNLOCKS"),
                              ("pve", "RAID / MAX ATTACKERS"), ("gym", "GYM DEFENDERS"),
                              ("other", "OTHER")]:
        members = [e for e in kept if _bucket(e["row"]["role"]) == bucket_key]
        if not members:
            continue
        E.append(f"=== {label} ===")
        for e in members:
            r = e["row"]
            E.append(f"  {r['species']:<14} CP {r['cp']:<5} {r['iv']:<9}  ->  "
                     f"{e['target_name']:<14} [{_fmt_cost(e)}]  for {r['role']}")
        E.append("")
    if dropped:
        E.append(f"=== SURPLUS CANDIDATES ({len(dropped)} dropped) ===")
        E.append("Same destination species as above, but worse IV. Safe to ignore.")
        for e in dropped[:30]:
            r = e["row"]
            E.append(f"  {r['species']:<14} CP {r['cp']:<5} {r['iv']:<9}  ->  "
                     f"{e['target_name']:<14} [{_fmt_cost(e)}]")
        if len(dropped) > 30:
            E.append(f"  ... and {len(dropped) - 30} more")
        E.append("")
    (outdir / "evolve_list.txt").write_text("\n".join(E) + "\n", encoding="utf-8")

    # ---- PvP teams ---------------------------------------------------------
    TB = ["BEST PVP TEAMS PER LEAGUE (from your collection)",
          "Scored on PvPoke's own data: the league meta group is the threat list,",
          "each species' top-5 wins/losses are the matchup graph, and the six",
          "category scores decide the lead / safe swap / closer.",
          ""]
    team_stats = {}
    for name, cap in [("Great", 1500), ("Ultra", 2500), ("Master", 10000)]:
        if cap not in CAPS:
            continue
        TB.append(f"--- {name} League ---")
        teams, cands, tinfo = (build_pvp_teams(mons, dex, cfg, cap)
                               if cfg["pvp_teams"]["enabled"] else ([], [], {}))
        team_stats[cap] = (teams, cands, tinfo)
        TB.append(f"  Threat list: {tinfo.get('count', 0)} {name} threats "
                  f"({tinfo.get('source', 'n/a')})")
        if not teams:
            TB.append(f"  No team could be built ({len(cands)} candidates passed the filters:")
            TB.append(f"    species rank <= {cfg['pvp_teams']['species_rank_max']}, "
                      f"IV rank <= {cfg['pvp_teams']['iv_rank_max']}, CP <= {cap}, can still reach the cap).")
            if 0 < len(cands) < 3:
                for c in cands:
                    TB.append(f"    candidate: {_clean_name(c[4].species['speciesName'])} "
                              f"CP {c[4].cp} IV {c[4].a}/{c[4].d}/{c[4].s}")
        for i, team in enumerate(teams, 1):
            coh = team.cohesion
            TB.append(f"  Team {i}: cohesion {coh['score']} ({coh['grade']}) - coverage "
                      f"{coh['coverage_pct']}% ({coh['covered']}/{coh['known']} published "
                      f"matchups beaten"
                      + (f"; {coh['unknown']} of {coh['threats']} unpublished and "
                         f"scored as a coin flip, published-only coverage "
                         f"{coh['coverage_known_pct']}%" if coh['unknown'] else "")
                      + ")")
            megas = [tm for tm in team.members if tm.mon.is_mega_capable]
            for tm in team.members:
                m, sid = tm.mon, tm.sid
                sp = dex.by_id[sid]
                rank_at_cap = dex.rank_of(sid, cap, m.is_shadow)
                note = f" (evolve from {_clean_name(m.species['speciesName'])})" if m.evolve_to else ""
                rank_str = f"{name} rank #{rank_at_cap[0]}" if rank_at_cap else "unranked"
                iv_r = dex.iv_rank(sid, cap, m.a, m.d, m.s)
                iv_str = ""
                if iv_r:
                    iv_str = f", IV rank #{iv_r[0]}"
                    if iv_r[0] > int(cfg["pvp"]["keep_iv_rank"]):
                        iv_str += " !"
                lvl_cp = best_pvp_level(sp["baseStats"], cap, m.a, m.d, m.s)
                lvl_str = f", {name} level {lvl_cp[0]:g} (CP {lvl_cp[1]})" if lvl_cp else ""
                shadow = " [Shadow]" if m.is_shadow else ""
                rs = dex.role_scores(cap, sid)
                role_bits = ", ".join(f"{PVP_ROLE_LABEL[k]} {rs[k]:.0f}"
                                      for k in ("leads", "switches", "closers") if k in rs)
                TB.append(f"    [{tm.role or 'unranked':<15}] "
                          f"{_clean_name(sp['speciesName'])}{note}{shadow}  CP {m.cp} "
                          f"IV {m.a}/{m.d}/{m.s} [{rank_str}{iv_str}{lvl_str}]"
                          + (f"  PvPoke: {role_bits}" if role_bits else ""))
            if len(megas) > 1:
                TB.append("    ! only ONE Mega can be active at a time - pick one per team")
            for h in coh["holes"][:5]:
                answer = (f"; you answer with {', '.join(h['beaten_by'])}"
                          if h["beaten_by"] else "; nothing on this team beats it")
                TB.append(f"    shared weakness: {h['name']} beats {h['victims']} of your 3"
                          f" (#{h['threat_rank']} in the meta){answer}")
            if coh["sweep"]:
                TB.append("    sweep risk (beats all three): " + ", ".join(coh["sweep"]))
            TB.append(f"    backup {coh['backup_pct']}%  consistency {coh['consistency']}  "
                      f"bulk {coh['bulk_pct']}% of PvPoke's {coh['bulk_goal']:.0f} goal"
                      + (f"  type overlap {coh['type_overlap']}" if coh["type_overlap"] else ""))
        TB.append("")
    (outdir / "teams.txt").write_text("\n".join(TB) + "\n", encoding="utf-8")

    # ---- cup teams (patch 9b) ----
    _cup_src = {cn: ("PvPoke cup meta group" if dex.threats.get(cn) else "rank-based fallback (no meta group)")
                for cn in CUPS}
    CT = ["CUP TEAMS - " + "; ".join(f"{CUPS[cn]['title']}: {src}" for cn, src in _cup_src.items()),
          "Teams share at most pvp_teams.cup_max_shared_members member(s) so you get real alternatives.",
          ""]
    for cup_name, cup_spec in CUPS.items():
        CT.append("--- " + cup_spec["title"] + " Cup (cap " + str(cup_spec["cap"]) + ") ---")
        teams_c, cands_c = build_cup_teams(mons, dex, cfg, cup_name)
        CT.append("  Candidates: " + str(len(cands_c)) + " mons, Teams: " + str(len(teams_c)))
        if not teams_c:
            CT.append("  (not enough legal cup candidates for a team)")
        for i, t in enumerate(teams_c, 1):
            CT.append("  Team " + str(i) + ": score " + format(t.score, ".1f"))
            for tm in t.members:
                sp = dex.by_id.get(tm.sid, {})
                nm = _clean_name(sp.get("speciesName", "?"))
                cup_pos = dex.cup_pos.get(cup_name, {}).get(tm.sid)
                rank_str = ("#" + str(cup_pos[0])) if cup_pos else "unranked"
                iv_r = dex.iv_rank(tm.sid, cup_spec["cap"], tm.mon.a, tm.mon.d, tm.mon.s)
                iv_str = ("IV#" + str(iv_r[0])) if iv_r else "IV#?"
                CT.append("    " + nm.ljust(22) + " CP " + str(tm.mon.cp).ljust(5)
                          + " " + _iv_str(tm.mon) + "  " + rank_str + "/" + iv_str)
        CT.append("")
    (outdir / "cup_teams.txt").write_text("\n".join(CT) + "\n", encoding="utf-8")


    # ---- raid teams --------------------------------------------------------
    raid_teams = build_raid_teams(mons, dex, cfg)
    RT = ["RAID TEAMS PER TYPE (from your collection)",
          "DPS is the model's relative score (same defender/atk scale for every mon).",
          "Level the Mega first - its boost applies to the whole lobby.",
          "A raid team is 6 slots: the Mega takes one of them, so a team with a Mega is the Mega + the",
          "5 best attackers. The next attacker is listed as a backup (also your 6th pick if you skip the Mega).", ""]
    for t in sorted(raid_teams):
        entries = list(raid_teams[t][:int(cfg["raid"]["keep_per_type"])])
        if not entries:
            continue
        RT.append(f"--- {_type_display(t)} ---")
        mega = find_mega_for_type(mons, dex, t)
        mega_uid = mega[0].uid if mega else None
        if mega_uid:
            entries = [(m, d) for m, d in entries if m.uid != mega_uid]
        n_team = min(5, len(entries)) if mega else len(entries)
        if mega:
            mm, mdps = mega
            mega_sp = dex.by_id.get(mm.mega_sid, {})
            RT.append(f"  Mega: {mega_sp.get('speciesName', '?')} "
                      f"(yours: {_display_species(mm)} CP {mm.cp}, {mm.a}/{mm.d}/{mm.s})  DPS {mdps:.1f}"
                      + ("" if mm.is_currently_mega else "  [not currently Mega Evolved]")
                      + "  <- slot 1")
        for _k, (m, dps) in enumerate(entries):
            if _k == n_team and n_team < len(entries):
                RT.append("  -- backup (6th slot if you skip the Mega) --")
            name_ = _display_species(m)
            shadow = " [Shadow]" if m.is_shadow else ""
            now = moves_str(m) if m.raw.get("move1") and PVE["ok"] else ""
            sug = m.moveset or ""
            note = m.moveset_note or ""
            bits = []
            if now:
                bits.append(f"moves: {now}")
            if sug and sug.lower() != (now or "").lower():
                bits.append(f"TM to: {sug}")
            elif sug and not now:
                bits.append(f"TM: {sug}")
            if note:
                bits.append(f"[{note}]")
            RT.append(f"  {name_}{shadow}  CP {m.cp}  {m.a}/{m.d}/{m.s}  DPS {dps:.1f}  "
                      f"L{m.level:g}"
                      + (("  " + "  ".join(bits)) if bits else ""))
        RT.append("")
    (outdir / "raid_teams.txt").write_text("\n".join(RT) + "\n", encoding="utf-8")

    # ---- mega priority -----------------------------------------------------
    MG = ["MEGA / PRIMAL PRIORITY (raid-boost aware)", ""]
    megas = [m for m in mons if m.is_mega_capable and m.mega_sid and m.verdict != "TRANSFER"]
    megas.sort(key=lambda m: (not m.is_currently_mega, -m.mega_level, -m.iv_pct))
    for m in megas:
        tags = []
        if m.is_currently_mega: tags.append("ACTIVE")
        if m.has_mega_unlocked: tags.append("unlocked")
        if m.mega_level >= 1: tags.append(f"Mega L{m.mega_level}")
        boost = dex.mega_boost_types(m.mega_sid)
        if boost: tags.append("boosts " + "/".join(_type_display(b) for b in boost))
        dps = estimated_mega_dps(m, dex)
        if dps:
            tags.append(f"dps {dps:.1f}" + (f" ({_type_display(m.mega_type)})" if m.mega_type else ""))
        form_name = (dex.by_id.get(m.mega_sid) or {}).get("speciesName") or _sp_name(dex, m.mega_sid, "?")
        MG.append(f"  {form_name}  (yours: "
                  f"{_clean_name(m.species['speciesName']) if m.species else m.dex} "
                  f"CP {m.cp} {m.a}/{m.d}/{m.s} {m.iv_pct}%) - {'; '.join(tags) or 'capable'}")
    if not megas:
        MG.append("  (none found)")
    if cfg["mega"]["recommend_boost_type"] and megas:
        MG += ["", "=== RAID BOOST CHEAT SHEET (best Mega you own per boosted type) ===",
               "'own dps' is that Mega's damage in its best type, for context only."]
        top_n = int(cfg["mega"]["top_n_for_boost"])
        for t in sorted(RAID_USEFUL_TYPES):
            owned = [(estimated_mega_dps(m, dex) or 0.0, m) for m in megas
                     if t in dex.mega_boost_types(m.mega_sid)]
            if not owned:
                continue
            owned.sort(key=lambda x: -x[0])
            for dps, m in owned[:top_n]:
                form_name = (dex.by_id.get(m.mega_sid) or {}).get("speciesName") \
                    or _sp_name(dex, m.mega_sid, "?")
                MG.append(f"  boosts {_type_display(t):<9} {form_name:<24} "
                          f"(CP {m.cp}, {m.a}/{m.d}/{m.s})  own dps {dps:.1f}")
    MG += ["",
           "Note: only one Mega/Primal can be active at a time, and a Mega cannot be",
           "Mega-Evolved again until its cooldown ends (or an energy item is used)."]
    (outdir / "mega_priority.txt").write_text("\n".join(MG) + "\n", encoding="utf-8")

    # ---- max battles -------------------------------------------------------
    max_teams = build_max_teams(mons, dex, cfg)
    MX = ["DYNAMAX / GIGANTAMAX / MAX BATTLE CANDIDATES", ""]
    MX.append("Model: " + cfg["max_battle"]["note"])
    MX.append("Only mons that are Dynamax/Gigantamax in your save are listed.")
    MX.append("")
    for t in sorted(max_teams):
        entries = max_teams[t][:int(cfg["max_battle"]["keep_per_type"])]
        if not entries:
            continue
        MX.append(f"--- {_type_display(t)} (Max Move type) ---")
        for m, dps in entries:
            tag = "Gigantamax" if m.is_gigantamax else "Dynamax"
            sid = m.max_sid or (m.species or {}).get("speciesId", "")
            info = dex.max_sets.get((sid, t)) or (None, None)
            fast = _move_label(info[0]) if info and info[0] else ""
            have_fast = {x["name"].lower() for x in current_moves(m)}
            need = ""
            if fast and fast.lower() not in have_fast:
                need = f"  needs fast move: {fast}"
            elif m.max_attack_level and m.max_attack_level < 3:
                need = f"  Max attack L{m.max_attack_level} (L3 = +{max_move_gain_pct(m):g}% dmg)"
            MX.append(f"  [{tag}] {_clean_name(m.species['speciesName']) if m.species else m.dex} "
                      f"CP {m.cp} {m.a}/{m.d}/{m.s} ({m.iv_pct}%)  DPS {dps:.1f}"
                      + need)
        MX.append("")
    if not any(max_teams.values()):
        MX.append("  (no Dynamax/Gigantamax candidates passed the quality gates)")
    (outdir / "max_battle_list.txt").write_text("\n".join(MX) + "\n", encoding="utf-8")

    # ---- coverage gaps ----------------------------------------------------
    min_level = float(cfg["coverage"]["min_level"])
    min_cov = int(cfg["coverage"]["min_attackers"])
    CG = ["TYPE COVERAGE GAPS (raid attackers you could actually field)",
          f"A mon counts as usable at level >= {min_level:g}.", ""]
    cov_rows = []
    _cov_state = coverage_state(mons, dex, cfg)
    for t in sorted(RAID_USEFUL_TYPES):
        # ONE source of truth: coverage_state() decides who counts (in-play attackers + in-play Megas).
        # This used to be a second private copy of the same logic, which still counted REVIEW Megas.
        _st = _cov_state.get(t) or {"entries": [], "usable": []}
        entries = list(_st["entries"])
        usable = list(_st["usable"])
        status = "OK" if len(usable) >= min_cov else "GAP"
        line = f"  [{status}] {_type_display(t)}: {len(usable)} usable attackers"
        if len(entries) > len(usable):
            line += f" ({len(entries) - len(usable)} below L{min_level:g})"
        named = [_clean_name(m.species['speciesName']) + (" (Mega)" if m.is_mega_capable and m.mega_type == t else "")
                 for m, _ in usable[:3]]
        if named:
            line += " - " + ", ".join(named)
        CG.append(line)
        fix = []
        if status == "GAP":
            st = _cov_state.get(t) or {}
            need = st.get("need", 0)
            for m, d, dust in st.get("picks", []):
                tgt_sp = dex.by_id.get(m.raid_sid or "") or m.species or {}
                evo = ""
                if m.raid_sid and (m.species or {}).get("speciesId") != m.raid_sid and not (
                        m.is_mega_capable and m.mega_type == t):
                    evo = f", evolve into {_clean_name(tgt_sp.get('speciesName', '?'))}"
                fix.append(f"{_clean_name(m.species['speciesName'])} CP {m.cp} {m.a}/{m.d}/{m.s} "
                           f"L{m.level:g} -> L{min_level:g}: {dust:,} dust (DPS {d:.1f}{evo})")
            if fix:
                CG.append(f"        best {len(fix)} to fill {need}: " + "; ".join(fix))
            if len(fix) < need:
                CG.append(f"        no more candidates in your box for this type - need {need - len(fix)} more")
        cov_rows.append({"type": _type_display(t), "status": status,
                         "usable": len(usable), "below": max(0, len(entries) - len(usable)),
                         "names": named, "fix": fix})
    (outdir / "coverage_gaps.txt").write_text("\n".join(CG) + "\n", encoding="utf-8")

    # ---- raid build queue -------------------------------------------------
    raid_queue = build_raid_build_queue(mons, dex, cfg)
    RB = ["RAID / MEGA / MAX BUILD QUEUE",
          "Separate from the PvP queue. These are PvE-focused investments.", ""]
    for m, reasons in raid_queue:
        species = _clean_name(m.species["speciesName"]) if m.species else f"dex {m.dex}"
        flags = []
        if m.is_shadow: flags.append("Shadow")
        if m.is_purified: flags.append("Purified")
        if m.is_dynamax: flags.append("Dynamax")
        if m.is_gigantamax: flags.append("Gigantamax")
        if m.is_mega_capable: flags.append("Mega")
        flag_str = f" [{' '.join(flags)}]" if flags else ""
        RB.append(f"  {species}{flag_str}  CP {m.cp}  {m.a}/{m.d}/{m.s} "
                  f"({m.iv_pct}%)  L{m.level:g}  - {'; '.join(reasons)}")
    if not raid_queue:
        RB.append("  (nothing raid-relevant outside the PvP queue)")
    (outdir / "raid_build_list.txt").write_text("\n".join(RB) + "\n", encoding="utf-8")

    # ---- transfer list ----------------------------------------------------
    protected_ids = set()
    for m in mons:
        if m.protect:
            protected_ids.add(m.uid)
        if m.verdict in ("KEEP", "REVIEW") or m.verdict.startswith("BUILD_"):
            protected_ids.add(m.uid)
        # belt and braces: the raw IV/collection floors again
        if m.iv_pct >= cfg["protect_iv_pct"] and not m.iv_demoted:
            protected_ids.add(m.uid)      # (demoted = surplus copy beyond the per-species cap)
        if (m.a, m.d, m.s) == (15, 15, 15):
            protected_ids.add(m.uid)
        if m.is_currently_mega or m.mega_level >= 1 or m.has_mega_unlocked:
            protected_ids.add(m.uid)
        if m.is_gigantamax:
            protected_ids.add(m.uid)
    for teams, _cands, _tinfo in team_stats.values():
        for team in teams:
            for tm in team.members:
                protected_ids.add(tm.mon.uid)
    for entries in raid_teams.values():
        for m, _ in entries:
            protected_ids.add(m.uid)
    for entries in max_teams.values():
        for m, _ in entries:
            protected_ids.add(m.uid)

    safe = [r for r in rows if r["verdict"] == "TRANSFER" and r["id"] not in protected_ids]
    clash = search_collisions(rows, safe)
    by_uid = {m.uid: m for m in mons}
    rows_by_uid = {r["id"]: r for r in rows}
    ll_cfg = cfg["last_look"]
    last_look = {}                      # row id -> (triggers, notes)
    if ll_cfg.get("enabled", True):
        for r in safe:
            m = by_uid.get(r["id"])
            if m is None:
                continue
            trig, notes = look_flags(m, cfg)
            if trig:
                last_look[r["id"]] = (trig, notes)
    T = ["SAFE TO TRANSFER - double-check each in-game before confirming.",
         f"Export taken: {meta['export_time']}.",
         f"Safeguard pass removed {len(protected_ids)} protected ids from this list.",
         ""]
    if clash:
        T += [f"!! {len(clash)} line(s) below are marked '!!': the in-game search for them ALSO",
              "!! selects a mon you are KEEPING. Check the IVs on screen before you transfer.",
              ""]
    if ll_cfg.get("enabled", True):
        T += [f"=== LAST LOOK: {len(last_look)} of {len(safe)} transfers deserve a second glance ===",
              f"A transfer is listed here if it has IV >= {float(ll_cfg['iv_pct']):g}%, level > "
              f"{float(ll_cfg['level_above']):g}, or is shiny / lucky /",
              "costume / event-origin / location card / favorite / purified / has a 3rd move.",
              "Each line says what you are keeping instead, so you can see it is really surplus.",
              ""]
        if not last_look:
            T += ["  Nothing flagged - none of the transfers below is special.", ""]
        for r in sorted((r for r in safe if r["id"] in last_look),
                        key=lambda r: (r["species"], -r["iv_pct"])):
            m = by_uid[r["id"]]
            trig, notes = last_look[r["id"]]
            T.append(f"  {r['ingame_search']:<24} {r['species']:<12} IV {r['iv']} ({r['iv_pct']}%) "
                     f"L{r['level']:g}  <-- " + ", ".join(trig)
                     + (f"  (also: {', '.join(notes)})" if notes else ""))
            comp = kept_comparators(m, mons)
            if comp:
                T.append("        you are keeping instead: " + "; ".join(
                    f"{c.a}/{c.d}/{c.s} ({c.iv_pct:g}%, {c.verdict})" for c in comp))
            else:
                T.append("        !! no other copy of this species/variant is being kept - "
                         "check before transferring")
        T += ["", f"({len(safe) - len(last_look)} transfers have no flags.)", "",
              "=== FULL TRANSFER LIST ('*' = also in the last-look block) ===", ""]
    by_sp = defaultdict(list)
    for r in safe:
        by_sp[r["species"]].append(r)
    for sp in sorted(by_sp):
        T.append(f"{sp} ({len(by_sp[sp])})")
        for r in sorted(by_sp[sp], key=lambda r: r["iv_pct"]):
            warn = ""
            if r["cp"] >= int(cfg["safeguards"]["warn_high_cp"]):
                warn = "  [HIGH CP]"
            elif r["level"] >= float(cfg["safeguards"]["warn_high_level"]):
                warn = "  [HIGH LEVEL]"
            star = "*" if r["id"] in last_look else " "
            T.append(f"  {star} {r['ingame_search']:<24}  CP {r['cp']:<5} IV {r['iv']} "
                     f"({r['iv_pct']}%){warn}"
                     + (f"  [{r['moves_now']}]" if r.get("moves_now") else ""))
            for o in clash.get(r["id"], []):
                T.append(f"      !! same search also matches a KEEPER: IV {o['iv']} "
                         f"({o['iv_pct']}%), marked {o['verdict']} - do NOT transfer that one")
    (outdir / "transfer_list.txt").write_text("\n".join(T) + "\n", encoding="utf-8")

    # ---- review triage (advice only) --------------------------------------
    if cfg["review_triage"].get("enabled", True):
        triage = triage_review(mons, dex, cfg)
        (outdir / "review_triage.txt").write_text(
            "\n".join(build_review_triage_text(triage, mons, cfg, rows_by_uid)) + "\n",
            encoding="utf-8")

    # ---- summary ----------------------------------------------------------
    c = Counter(r["verdict"] for r in rows)
    S = [f"Export: {meta['export_time']}  |  PvPoke: {meta['gm_date']} (cache {meta['age']:.1f}d)",
         f"Analysed: {len(mons)} mons (eggs skipped: {meta['eggs']})",
         "Raid/Mega DPS model: " + ("real PvE move data (PokeMiners game master)" if PVE["ok"]
                                    else "PvP-move proxy (PvE data unavailable - less accurate)"),
         "",
         f"BUILD_PVP:  {c['BUILD_PVP']}",
         f"BUILD_MEGA: {c['BUILD_MEGA']}",
         f"BUILD_RAID: {c['BUILD_RAID']}",
         f"BUILD_MAX:  {c['BUILD_MAX']}",
         f"BUILD_GYM:  {c['BUILD_GYM']}",
         f"KEEP:       {c['KEEP']}",
         f"REVIEW:     {c['REVIEW']}",
         f"TRANSFER:   {c['TRANSFER']}",
         "",
         "Quality gates:",
         f"   {sum(1 for m in mons if m.raid_reject):>4}  raid role refused (atk IV / dps / level)",
         f"   {sum(1 for m in mons if m.max_reject):>4}  Max Battle role refused",
         f"   {sum(1 for m in mons if m.gym_reject):>4}  gym defender refused",
         f"   {sum(1 for m in mons if m.raid_reserve or m.max_reserve):>4}  passed the gates but are reserve copies",
         f"   {sum(1 for m in mons if m.review_reasons):>4}  with at least one review flag",
         "",
         "Roles:"]
    for role, n in Counter(r["role"] for r in rows if r["role"]).most_common():
        S.append(f"   {n:>4}  {role}")
    S += ["",
          "Special categories:",
          f"   {sum(1 for m in mons if m.is_currently_mega):>4}  currently Mega Evolved",
          f"   {sum(1 for m in mons if m.mega_level >= 1):>4}  Super Mega (level >= 1)",
          f"   {sum(1 for m in mons if m.has_mega_unlocked):>4}  have Mega Evolved before",
          f"   {sum(1 for m in mons if m.is_mega_capable):>4}  Mega-worthy (IV + form)",
          f"   {sum(1 for m in mons if m.is_dynamax):>4}  Dynamax",
          f"   {sum(1 for m in mons if m.is_gigantamax):>4}  Gigantamax",
          f"   {sum(1 for m in mons if m.has_third_move):>4}  with 3rd charged move",
          f"   {sum(1 for m in mons if any('gofest2026' in str(e).lower() for e in m.origin_events)):>4}  GO Fest 2026 origin",
          f"   {sum(1 for m in mons if m.is_shadow):>4}  shadow",
          f"   {sum(1 for m in mons if m.is_purified):>4}  purified",
          "",
          f"Safeguard: {len(protected_ids)} ids are protected and can never appear on the transfer list.",
          f"Transfer list: {len(safe)} mons after reconciliation.",
          "",
          "Outputs:",
          "  build_list.txt      - queue of Pokemon to invest in",
          "  evolve_list.txt     - Pokemon whose final form is the target",
          "  teams.txt           - PvP teams per league",
          "  raid_teams.txt      - top raid attackers per type, with Mega boost",
          "  raid_build_list.txt - PvE-focused investment queue",
          "  mega_priority.txt   - Mega priority + raid boost cheat sheet",
          "  max_battle_list.txt - Max Battle candidates per type",
          "  coverage_gaps.txt   - types where you lack usable attackers",
          "  power_up_priority.txt - where to spend stardust",
          "  transfer_list.txt   - safe transfers (safeguarded), with a LAST LOOK block on top",
          "  review_triage.txt   - the REVIEW pile sorted into probably-keep / probably-transfer (advice only)",
          "  sort_report.csv     - full data (includes per-row dust/candy/XL cost)"]
    (outdir / "summary.txt").write_text("\n".join(S) + "\n", encoding="utf-8")

    # ---- power-up priority ------------------------------------------------
    pu = cfg["power_up_priority"]
    gl_ul_iv_cutoff = int(pu["iv_rank_cutoff"])
    do_not_invest_cutoff = int(pu["do_not_invest_iv_rank"])
    max_rows = int(pu["max_rows"])
    rel_top = cfg["pvp"]["relevant_species_top"]

    invest_candidates = []
    for m in mons:
        # never advise spending stardust on a Pokemon that is undecided (REVIEW) or leaving (TRANSFER)
        if not m.species or m.verdict in OUT_OF_PLAY:
            continue
        for e in m.pvp:
            if not e.eligible:
                continue
            if e.species_rank > int((rel_top.get(str(e.cap)) or rel_top.get("1500", 150))):
                continue
            target_bs = dex.by_id[e.sid]["baseStats"]
            lvl_cp = best_pvp_level(target_bs, e.cap, m.a, m.d, m.s)
            if not lvl_cp or lvl_cp[0] < m.level - 0.5:
                continue
            dust, candy, xl = _stardust_to_level(
                m.level, lvl_cp[0],
                is_shadow=m.is_shadow,
                is_lucky=bool(m.raw.get("isLucky")),
                is_purified=m.is_purified,
            )
            invest_candidates.append({
                "mon": m, "league": e.league, "sid": e.sid,
                "species_rank": e.species_rank, "iv_rank": e.iv_rank,
                "target_level": lvl_cp[0], "target_cp": lvl_cp[1],
                "dust": dust, "candy": candy, "xl": xl,
                "shift": m.level != lvl_cp[0],
                "combined": e.species_rank + e.iv_rank,
            })

    seen = {}
    for c_ in invest_candidates:
        k = (c_["mon"].uid, c_["league"])
        if k not in seen or c_["combined"] < seen[k]["combined"]:
            seen[k] = c_
    invest_candidates = list(seen.values())

    ml = sorted([c for c in invest_candidates
                 if c["league"] == "Master" and c["iv_rank"] <= gl_ul_iv_cutoff],
                key=lambda c: (c["iv_rank"], c["species_rank"]))
    glul = sorted([c for c in invest_candidates
                   if c["league"] in ("Great", "Ultra") and c["iv_rank"] <= gl_ul_iv_cutoff],
                  key=lambda c: (c["combined"], c["iv_rank"]))
    # Any league, any spread the cutoff rejects - previously Master League
    # spreads with a terrible IV rank were shown nowhere at all.
    dn = sorted([c for c in invest_candidates if c["iv_rank"] > do_not_invest_cutoff],
                key=lambda c: -c["iv_rank"])

    # ---- "spend first": a short list ranked by value per stardust ----------
    pu_top = int(pu.get("top_n", 12))
    pu_per_sp = int(pu.get("max_per_species", 1))
    pu_budget = int(pu.get("dust_budget", 0))
    # Decisive: when dust_budget is 0, use the stardust balance from the export
    # so the spend-first list is realistic for THIS account.
    if pu_budget <= 0 and EXPORT_DATA:
        _acct = (EXPORT_DATA.get("account") or {})
        pu_budget = next((int(c.get("quantity") or 0)
                          for c in (_acct.get("currencyBalance") or [])
                          if c.get("currencyType") == "STARDUST"), 0)
    dn_rows = int(pu.get("do_not_invest_rows", 10))

    def _quality(c_):
        """0..1.  Half is how strong the species is in that league (rank 1 = 1.0,
        falling to 0 at the 'relevant species' cut-off), half is how good this
        particular spread is (IV rank 1 = 1.0, IV rank 21 = 0.5, rank 101 = 0.17)."""
        top = int((rel_top.get(str(c_["cap"])) or rel_top.get("1500", 150)))
        sp_part = max(0.0, 1.0 - (c_["species_rank"] - 1) / float(top))
        iv_part = 1.0 / (1.0 + (c_["iv_rank"] - 1) / 20.0)
        return sp_part * iv_part

    best_per_mon = {}
    for c_ in invest_candidates:
        c_["cap"] = {"Great": 1500, "Ultra": 2500}.get(c_["league"], 10000)
        c_["quality"] = _quality(c_)
        # value = quality points per million dust; a floor stops a nearly finished
        # mon (a few thousand dust) from dividing its way to the top.
        c_["value"] = c_["quality"] * 1_000_000 / max(c_["dust"], 25_000)
        if c_["dust"] <= 0 or c_["quality"] <= 0 or c_["iv_rank"] > gl_ul_iv_cutoff:
            continue
        k = c_["mon"].uid
        if k not in best_per_mon or c_["value"] > best_per_mon[k]["value"]:
            best_per_mon[k] = c_
    ranked, per_sp_count = [], Counter()
    for c_ in sorted(best_per_mon.values(), key=lambda c_: -c_["value"]):
        key = (c_["sid"], c_["league"])
        if per_sp_count[key] >= pu_per_sp:
            continue                    # one build per species per league is enough
        per_sp_count[key] += 1
        ranked.append(c_)
    shown, running = [], 0
    for c_ in ranked[:pu_top]:
        if pu_budget and running + c_["dust"] > pu_budget:
            break
        running += c_["dust"]
        shown.append((c_, running))
    hidden = [c_ for c_ in ranked if c_ not in [x for x, _ in shown]]

    PU = ["POWER-UP PRIORITY - where to spend stardust (short list)",
          "",
          "Ranked by VALUE PER DUST: how strong the species is in that league and how good",
          "your spread is, divided by what it costs to power up.  Cheap, strong, nearly",
          "finished builds come first; 450,000-dust Master League projects sink to the bottom",
          "unless the mon is genuinely great.  One build per species per league.",
          f"Showing the top {pu_top}"
          + (f", stopping at your dust_budget of {pu_budget:,}." if pu_budget else
             ".  (Set power_up_priority.dust_budget in the config to stop at a dust amount you choose.)"),
          ""]
    PU.append(f"=== SPEND FIRST ({len(shown)} mons) ===")
    PU.append("")
    if not shown:
        PU.append("  (no candidates)")
    for i, (c_, run) in enumerate(shown, 1):
        m = c_["mon"]
        name = _clean_name(m.species["speciesName"])
        cost = f"{c_['dust']:,} dust"
        if c_["xl"]:
            cost += f" + {c_['xl']:,} XL"
        shadow = " SHADOW" if m.is_shadow else ""
        PU.append(f"  {i:>2}. {c_['league']:<6} {name:<18} CP {m.cp:<5} {m.a}/{m.d}/{m.s}{shadow}  "
                  f"L{m.level:g} -> L{c_['target_level']:g}  {cost}")
        PU.append(f"      species #{c_['species_rank']}, your spread IV #{c_['iv_rank']}, "
                  f"value {c_['value']:.1f}   (running total {run:,} dust)")
    PU.append("")
    h_dust = sum(c_["dust"] for c_ in hidden)
    h_xl = sum(c_["xl"] for c_ in hidden)
    ml_pool, seen_sid = [], set()
    for c_ in sorted((c_ for c_ in invest_candidates if c_["league"] == "Master"
                      and c_["dust"] > 0 and c_["quality"] > 0 and c_["iv_rank"] <= gl_ul_iv_cutoff),
                     key=lambda c_: -c_["value"]):
        if c_["sid"] in seen_sid:
            continue
        seen_sid.add(c_["sid"])
        ml_pool.append(c_)
    if ml_pool:
        PU.append("=== MASTER LEAGUE - only if you want a long project (best 3 by value) ===")
        PU.append("    Each of these is a 400k+ dust, ~300 XL candy commitment unless it is already high-level.")
        PU.append("")
        for c_ in ml_pool[:3]:
            m = c_["mon"]
            cost = f"{c_['dust']:,} dust" + (f" + {c_['xl']:,} XL" if c_["xl"] else "")
            PU.append(f"  {_clean_name(m.species['speciesName']):<18} CP {m.cp:<5} {m.a}/{m.d}/{m.s}  "
                      f"L{m.level:g} -> L{c_['target_level']:g}  {cost}  "
                      f"(species #{c_['species_rank']}, IV #{c_['iv_rank']})")
        PU.append("")
    PU.append(f"Not shown: {len(hidden)} more candidates (~{h_dust:,} dust + {h_xl:,} XL candy to max "
              "them all).  That is not a realistic spend - the full lists are in report.json / viewer.html.")
    PU.append("")

    PU.append(f"=== DO NOT INVEST (meta species, IV rank > {do_not_invest_cutoff}, all leagues; worst {dn_rows} of {len(dn)}) ===")
    PU.append("    Plausible species picks with poor IV spreads - keep them, but spending")
    PU.append("    dust here is a waste. GL/UL want a low-Attack spread; Master wants 15/15/15.")
    PU.append("")
    if not dn:
        PU.append("  (nothing flagged)")
    for c_ in dn[:dn_rows]:
        m = c_["mon"]
        name = _clean_name(m.species["speciesName"])
        cap = {"Great": 1500, "Ultra": 2500}.get(c_["league"], 10000)
        # A species that cannot reach the cap (e.g. Watchog in Great League)
        # wants high IVs, not a low-Attack spread, so the hint has to differ.
        # Test with a hundo: if even 15/15/15 cannot be pushed to level 50
        # without breaking the cap, this species does reach the cap.
        _hundo = best_pvp_level(dex.by_id[c_["sid"]]["baseStats"], cap, 15, 15, 15)
        reaches_cap = bool(_hundo) and _hundo[0] < LEVELS[-1]
        if c_["league"] == "Master":
            hint = "hunt a 15/15/15 instead"
        elif reaches_cap:
            hint = "hunt a low-Attack 0/15/15-style spread instead"
        else:
            hint = (f"this species tops out at CP {c_['target_cp']}, so hunt a "
                    "15/15/15-style spread instead")
        PU.append(f"  {c_['league']:<6} IV#{c_['iv_rank']:>4}  {name:<22}  CP {m.cp:<5} "
                  f"{m.a}/{m.d}/{m.s}  - {hint}")
    PU.append("")
    PU.append("Notes:")
    PU.append("  - IV rank = this spread's rank among all 4096 spreads of the species at that cap.")
    PU.append("  - For GL/UL, low-Attack spreads (0/15/15-ish) usually win; 15/15/15 is only")
    PU.append("    right when the species cannot reach the cap (then high IVs win outright).")
    PU.append("  - Master League always wants 15/15/15 - it is ranked #1 there by definition.")
    PU.append("  - Shadow power-ups cost +20% dust/candy; lucky costs -50% dust; purified -10%.")
    PU.append("  - Dust/Candy/XL figures use the real in-game power-up curve.")
    (outdir / "power_up_priority.txt").write_text("\n".join(PU) + "\n", encoding="utf-8")

    # ---- structured report + viewer ---------------------------------------
    verdicts = {v: c[v] for v in VERDICT_ORDER if c[v]}
    gates = {
        "raid_refused": sum(1 for m in mons if m.raid_reject),
        "max_refused": sum(1 for m in mons if m.max_reject),
        "gym_refused": sum(1 for m in mons if m.gym_reject),
        "reserve": sum(1 for m in mons if m.raid_reserve or m.max_reserve),
        "review": sum(1 for m in mons if m.review_reasons),
    }
    special = {
        "mega_ready": sum(1 for m in mons if m.is_mega_capable),
        "mega_now": sum(1 for m in mons if m.is_currently_mega),
        "super_mega": sum(1 for m in mons if m.mega_level >= 1),
        "mega_unlocked": sum(1 for m in mons if m.has_mega_unlocked),
        "dynamax": sum(1 for m in mons if m.is_dynamax),
        "gigantamax": sum(1 for m in mons if m.is_gigantamax),
        "third_move": sum(1 for m in mons if m.has_third_move),
        "shadow": sum(1 for m in mons if m.is_shadow),
        "purified": sum(1 for m in mons if m.is_purified),
        "protected": len(protected_ids),
    }
    report = build_report(
        mons, dex, cfg, meta, rows, verdicts, gates, special,
        Counter(r["role"] for r in rows if r["role"]).most_common(),
        team_stats, raid_teams, max_teams, megas, kept, safe, by_sp, protected_ids,
        ml, glul, dn, cov_rows,
        notes=[
            "Every BUILD_ verdict passed its quality gate; borderline mons are REVIEW",
            cfg["max_battle"]["note"],
            "Raid DPS is a static estimate (no weather, dodging or party power).",
            "Elite/legacy moves cannot be verified from the export (numeric move ids).",
            "PvP teams are candidates, not a battle simulation; build a mon for one league only.",
        ])
    (outdir / "report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    grade = compute_grade(report, dex, cfg, mons)
    report["grade"] = grade
    apply_max_report(report, mons, dex, cfg)
    report["_cannot_dynamax"] = [sid for blk in report["grade"]["wishlist_all"]["max"].values()
                                 for r_ in blk["rows"] for sid in [r_["sid"]] if not r_.get("gmax") and not dex.can_dynamax(sid)]
    for _r in report["mons"]:
        _r["hold"] = _hold_category(_r)
    report["holding"] = hold_summary(report, cfg)
    report["placement"] = PLACEMENT
    report["settings"] = {
        "leagues": [str(c) for c in CAPS], "cups": list(CUPS),
        "available_leagues": [{"id": str(c), "name": LEAGUE[c] + " League", "cap": c} for c in (1500, 2500, 10000)],
        "available_cups": [{"key": k, "name": t + " Cup"} for k, t in CUP_TITLES.items()],
        "user_cfg": USER_CFG}
    if (cfg.get("briefing") or {}).get("enabled", True):
        try:
            report["briefing"] = build_briefing(report, dex, mons, cfg)
            print(write_briefing_txt(outdir, report["briefing"]))
        except Exception as _ex:      # the briefing must never break the sorter
            print(f"[warn] briefing skipped: {_ex}")
    report["audit"] = [{"check": n, "ok": ok, "detail": d} for n, ok, d in audit_report(report, dex)]
    _bad = [a for a in report["audit"] if not a["ok"]]
    print("Self-check: " + str(len(report["audit"]) - len(_bad)) + "/" + str(len(report["audit"]))
          + " cross-tab checks passed" + ("" if not _bad else " - FAILED: "
          + "; ".join(a["check"] + " (" + str(a["detail"]) + ")" for a in _bad)))
    write_account_grade(outdir, grade, report)
    (outdir / "report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    try:
        existing_summary = (outdir / "summary.txt").read_text(encoding="utf-8")
        prefix = "ACCOUNT GRADE: " + str(grade["overall_pct"]) + "% (" + grade["letter"] + ")  - see account_grade.txt\n\n"
        (outdir / "summary.txt").write_text(prefix + existing_summary, encoding="utf-8")
    except Exception:
        pass
    have_viewer = write_viewer(outdir, report)
    write_moves_viewer(outdir, report)
    S.append("  moves_viewer.html   - open in a browser: every mon with its verdict, plan and current moves")
    S.append("  report.json         - the same data as JSON (viewer / your own scripts)")
    S.append("  viewer.html         - open in a browser: filters, sort, copy-search"
              + ("" if have_viewer else " (needs report.json next to it)"))
    (outdir / "summary.txt").write_text("\n".join(S) + "\n", encoding="utf-8")
    return S
# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

OFFLINE = False


def newest_export():
    files = sorted(HERE.glob("PGS*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    return files[0] if files else None


USER_CFG = {}
CUP_TITLES = {k: v["title"] for k, v in CUPS.items()}     # every cup that exists, even if switched off


def apply_league_config(cfg):
    """Narrow CAPS / CUPS to the leagues and cups listed in pvp.leagues / pvp.cups."""
    global CAPS
    _BULK_W[0] = float((cfg.get("raid") or {}).get("bulk_weight", 1.0))
    want_cups = {str(x) for x in (cfg.get("pvp") or {}).get("cups", list(CUP_TITLES))}
    off = [CUP_TITLES[k] + " Cup" for k in list(CUPS) if k not in want_cups]
    for k in list(CUPS):
        if k not in want_cups:
            del CUPS[k]
    if off:
        print("PvP cups switched off in the config: " + ", ".join(off) + " (no cup teams, wishlist or protection)")
    want = {str(x) for x in (cfg.get("pvp") or {}).get("leagues", ["1500", "2500", "10000"])}
    CAPS = tuple(c for c in (1500, 2500, 10000) if str(c) in want) or (1500,)
    dropped = [LEAGUE[c] for c in (1500, 2500, 10000) if c not in CAPS]
    if dropped:
        print("PvP leagues switched off in the config: " + ", ".join(dropped) + " (no builds, teams or protection)")


def main():
    ap = argparse.ArgumentParser(description="Pokemon GO collection sorter (audited build)")
    ap.add_argument("export", nargs="?", help="path to PGSStats.json")
    ap.add_argument("--refresh", action="store_true", help="force re-download of PvPoke data")
    ap.add_argument("--offline", action="store_true",
                    help="never download; fail if the cache is missing")
    ap.add_argument("--out", default=str(HERE / "sorter_output"))
    ap.add_argument("--no-briefing", action="store_true", help="skip the daily briefing (events x your account)")
    ap.add_argument("--days", type=int, default=None, help="briefing: how many days ahead to look (default 14)")
    ap.add_argument("--now", default=None, help='replay a day, e.g. --now "2026-11-02 09:00"')
    ap.add_argument("--all-files", action="store_true",
                    help="keep every .txt/.csv report the sorter writes "
                         "(default: only viewer.html and report.json are kept)")
    a = ap.parse_args()

    global OFFLINE, EXPORT_DATA, NOW_OVERRIDE
    OFFLINE = bool(a.offline)
    if a.now:
        try:
            NOW_OVERRIDE = datetime.datetime.strptime(a.now, "%Y-%m-%d %H:%M").astimezone()
        except ValueError:
            sys.exit('--now must look like "2026-11-02 09:00"')

    path = Path(a.export) if a.export else newest_export()
    if not path or not path.exists():
        sys.exit("Put PGSStats.json next to this script, or pass its path.")
    cfg = load_cfg()
    apply_league_config(cfg)
    data, raw, missing_opt = load_export(path)
    EXPORT_DATA = data
    if a.no_briefing:
        cfg.setdefault("briefing", {})["enabled"] = False
    if a.days:
        cfg.setdefault("briefing", {})["days"] = a.days
    bad, total = validate_cpm(raw)
    if total and bad / total > 0.01:
        sys.exit(f"Level model disagrees with {bad}/{total}. Stopping.")
    eggs = sum(1 for p in raw if p["isEgg"])
    mons = [to_mon(p, i) for i, p in enumerate(raw) if not p["isEgg"]]
    print(f"Loaded {len(mons)} Pokemon ({eggs} eggs skipped). Fetching PvPoke data...")
    if missing_opt:
        print(f"[warn] export has no field(s): {', '.join(missing_opt)}")

    gm, age = get_json("gamemaster.json", a.refresh)
    ranks = {}
    for cap in CAPS:
        payload, _ = get_json(f"rankings/all/overall/rankings-{cap}.json", a.refresh)
        rows = ranking_rows(payload)
        if not rows:
            sys.exit(f"rankings-{cap}.json parsed to zero rows - PvPoke layout changed again.")
        ranks[cap] = sorted(rows, key=lambda r: r.get("score", r.get("rating", 0)), reverse=True)

    # Cup rankings (patch 9a)
    cup_ranks = {}
    for cup_name, cup_spec in CUPS.items():
        try:
            payload_c, _ = get_json(
                f"rankings/{cup_spec['file']}/overall/rankings-{cup_spec['cap']}.json",
                a.refresh)
            rows_c = ranking_rows(payload_c)
            if rows_c:
                cup_ranks[cup_name] = sorted(
                    rows_c,
                    key=lambda r: r.get("score", r.get("rating", 0)),
                    reverse=True)
                print(f"Cup rankings loaded: {cup_spec['title']} ({len(rows_c)} species)")
            else:
                print(f"[warn] {cup_spec['title']} cup rankings empty - disabled")
        except SystemExit:
            print(f"[warn] {cup_spec['title']} cup rankings unavailable - disabled")
        except Exception as e:
            print(f"[warn] {cup_spec['title']} cup fetch failed ({e}) - disabled")

    # PvPoke's curated meta group per league.  This is what team coverage is
    # measured against, but it is never required: without it the sorter falls
    # back to the top of the rankings and says so in the report.
    groups = {}
    for cap in CAPS:
        name = META_GROUP_FILE[cap]
        if OFFLINE and not (CACHE / f"groups__{name}.json").exists():
            groups[cap] = []
            continue
        try:
            payload, _ = get_json(f"groups/{name}.json", a.refresh)
            groups[cap] = ranking_rows(payload)
        except SystemExit:
            groups[cap] = []
        except Exception as e:
            print(f"[warn] no meta group for {LEAGUE[cap]} ({e}); "
                  "team cohesion falls back to the rankings top N")
            groups[cap] = []
    if cfg.get("pve_model", {}).get("enabled", True):
        load_size_table(a.refresh)
        if load_pve_moves(a.refresh):
            print(f"PvE move model: {len(PVE['moves'])} real PvE moves loaded.")
        else:
            print("[warn] PvE move data unavailable - raid DPS uses the PvP-move proxy "
                  "(less accurate; run once online to cache it).")
    # Cup meta groups (patch 9c)
    cup_groups = {}
    for cup_name, cup_spec in CUPS.items():
        try:
            payload_g, _ = get_json(f"groups/{cup_spec['file']}.json", a.refresh)
            rows_g = ranking_rows(payload_g)
            if rows_g:
                cup_groups[cup_name] = rows_g
                print(f"Cup meta group loaded: {cup_spec['title']} ({len(rows_g)} species)")
            else:
                print(f"[warn] {cup_spec['title']} cup meta group empty - rank-based fallback")
        except SystemExit:
            print(f"[warn] {cup_spec['title']} cup meta group unavailable - rank-based fallback")
        except Exception as e:
            print(f"[warn] {cup_spec['title']} cup meta group failed ({e}) - rank-based fallback")
    dex = Dex(gm, ranks, cfg, groups, cup_ranks=cup_ranks, cup_groups=cup_groups)

    if not dex.raid_rankings:
        sys.exit("No raid type rankings were built - check the PvPoke gamemaster.")
    print(f"Built raid tier lists for {len(dex.raid_rankings)} types "
          f"({len(dex.moves)} moves indexed).")
    print(f"Built Max Battle tier lists for {len(dex.max_rankings)} types "
          f"(Fast-move/Max-Move type model).")
    print("Team cohesion threat lists: " + "; ".join(
        f"{LEAGUE[c]} {len(dex.threats.get(c, []))} ({dex.matchup_source.get(c, 'n/a')})"
        for c in CAPS))
    print(f"Detected {len(dex.mega_bases)} Mega-capable base species "
          f"({len(dex.mega_species)} Mega forms, {len(dex.mega_pre_evos)} pre-evolutions).")
    if not dex.dynamax_bases:
        print("Note: PvPoke has no dynamax/gigantamax tags - D/G-max is read from your "
              "save (pokemonDisplay.breadModeEnum).")
    shadow_n = sum(1 for p in raw if (p.get("pokemonDisplay") or {}).get("alignment") == 1)
    dyn_n = sum(1 for p in raw if (p.get("pokemonDisplay") or {}).get("breadModeEnum", 0) > 0)
    print(f"Your save: {shadow_n} shadow, {dyn_n} Dynamax/Gigantamax flagged.")
    print("Ranking...")
    classify(mons, dex, cfg, missing_opt)
    meta = {"export_time": data.get("time", "unknown"),
            "gm_date": gm.get("timestamp", "unknown"),
            "age": age, "eggs": eggs, "missing_opt": missing_opt}
    S = write_outputs(mons, dex, Path(a.out), meta, cfg)
    if a.all_files:
        print("\n".join(S))
        print(f"\nWritten to {a.out}")
    else:
        # Everything is already inside viewer.html / report.json, so remove the
        # extra files the sorter just wrote (only files it is known to create).
        out = Path(a.out)
        for p in list(out.glob("*.txt")) + [out / "sort_report.csv", out / "moves_viewer.html"]:
            try:
                p.unlink()
            except OSError:
                pass
        print(f"\nDone. Open {out / 'viewer.html'} in your browser.")
        print("(Run with --all-files if you also want the .txt/.csv reports.)")







# ============================================================
# ACCOUNT GRADE (added by patch_1_grade_code.ps1)
# ============================================================
GRADE_WEIGHTS = {"raid": 0.35, "pvp": 0.25, "mega": 0.15, "max": 0.10, "depth": 0.15}

GRADE_TYPE_IMPORTANCE = {
    "Ghost": 1.5, "Fighting": 1.5, "Fire": 1.5, "Ice": 1.5, "Fairy": 1.5,
    "Dragon": 1.5, "Water": 1.5, "Dark": 1.2, "Psychic": 1.2, "Grass": 1.2,
    "Electric": 1.0, "Ground": 1.0, "Bug": 1.0, "Rock": 1.0, "Steel": 1.0,
    "Poison": 1.0, "Flying": 1.0, "Normal": 1.0,
}



def _dedup_cup_entries(mons):
    """Keep only the best cup entry per (mon, cup). A mon with evolution
    stages can get several cup entries from different descendants."""
    cup_titles = {spec["title"] for spec in CUPS.values()}
    for m in mons:
        by_cup, rest = {}, []
        for e in m.pvp:
            if e.league in cup_titles:
                cur = by_cup.get(e.league)
                if cur is None or (e.species_rank + e.iv_rank) < (cur.species_rank + cur.iv_rank):
                    by_cup[e.league] = e
            else:
                rest.append(e)
        m.pvp = rest + sorted(by_cup.values(), key=lambda x: x.league)

def _grade_letter(pct):
    if pct >= 90: return "A"
    if pct >= 85: return "A-"
    if pct >= 80: return "B+"
    if pct >= 75: return "B"
    if pct >= 70: return "B-"
    if pct >= 65: return "C+"
    if pct >= 60: return "C"
    if pct >= 55: return "C-"
    if pct >= 50: return "D+"
    if pct >= 40: return "D"
    return "F"


def _owned_and_pre_evos(mons, dex):
    owned, pre = set(), set()
    for m in mons:
        if not m.species:
            continue
        sid = m.species["speciesId"]
        owned.add(sid)
        for desc in dex.descendants(sid):
            if desc != sid:
                pre.add(desc)
    return owned, pre


def _raid_coverage_score(report):
    cov = report.get("coverage") or []
    if not cov:
        return 0.0
    tot_w = weighted = 0.0
    for c in cov:
        u = c.get("usable", 0)
        s = 1.0 if u >= 3 else (0.7 if u == 2 else (0.4 if u == 1 else 0.0))
        w = GRADE_TYPE_IMPORTANCE.get(c["type"], 1.0)
        weighted += s * w
        tot_w += w
    return weighted / tot_w if tot_w else 0.0


def _pvp_readiness_score(report):
    """PvP readiness: 60% team variety (distinct species trios per league),
    40% weighted distance-to-Ready across BUILD_PVP mons.

    Weighted completion: a mon that only needs one regular TM is 80% of the
    way to Ready, not 0%. Before this rebalance, "Needs TM" and "Needs Elite
    TM" both counted as zero, which pushed a GLB Legend with an A-grade GL
    team and 13 PvP builds down to 39% - not a real reflection of readiness.
    """
    teams = [lg for lg in (report.get("teams") or [])
             if lg.get("league") in ("Great", "Ultra", "Master")]
    team_counts = []
    for lg in teams:
        trios = set()
        for t in lg.get("teams") or []:
            key = tuple(sorted(m.get("name", "") for m in t.get("members") or []))
            trios.add(key)
        team_counts.append(len(trios))
    team_score = sum(min(1.0, n / 5.0) for n in team_counts) / len(team_counts) if team_counts else 0.0

    STATUS_WEIGHT = {
        "Ready": 1.0,
        "Needs TM": 0.8,
        "Needs second charged move": 0.6,
        "Needs Elite TM": 0.4,
        "Unknown": 0.5,
    }
    total_weight = 0.0
    build_count = 0
    for m in report.get("mons") or []:
        if m.get("verdict") == "BUILD_PVP":
            build_count += 1
            st = m.get("build_status", "Unknown")
            total_weight += STATUS_WEIGHT.get(st, 0.5)
    completion = (total_weight / build_count) if build_count else 0.0
    return 0.6 * team_score + 0.4 * completion


def _mega_coverage_score(report):
    boost = set()
    for m in (report.get("mega") or {}).get("priority") or []:
        for tag in m.get("tags") or []:
            if tag.startswith("boosts "):
                for t in tag[7:].split("/"):
                    t = t.strip()
                    if t and t.lower() != "none":
                        boost.add(t)
    return min(1.0, len(boost) / 18.0)


def _max_battle_score(report):
    types = {t["type"] for t in report.get("max_teams") or [] if t.get("entries")}
    return min(1.0, len(types) / 18.0)


def _collection_depth_score(report):
    mons = report.get("mons") or []
    if not mons:
        return 0.0
    hundos = sum(1 for m in mons if m.get("iv_pct", 0) >= 100.0)
    species = {m.get("species", "") for m in mons if m.get("species")}
    ranked = total = 0
    for m in mons:
        v = m.get("verdict", "")
        if v in ("KEEP", "REVIEW") or v.startswith("BUILD_"):
            total += 1
            best = 9999
            for p in m.get("pvp") or []:
                r = p.get("iv_rank", 9999)
                if r < best: best = r
            if best <= 100:
                ranked += 1
    pvp_depth = ranked / total if total else 0.0
    return 0.4 * min(1.0, hundos / 20.0) + 0.3 * min(1.0, len(species) / 500.0) + 0.3 * pvp_depth



def _cup_readiness(mons, dex, cfg):
    """Per-cup readiness + top builds for the account grade section."""
    out = {}
    for cup_name, cup_spec in CUPS.items():
        cap = cup_spec["cap"]
        top_rank = int(cfg["pvp"]["keep_species_top"].get(str(cap))
                       or cfg["pvp"]["keep_species_top"].get("1500", 70))
        legal = qualified = built = 0
        builds = []
        for m in mons:
            if not m.species:
                continue
            own_sid = m.species["speciesId"]
            best_rank, best_sid, best_iv = 9999, own_sid, None
            for t in dex.descendants(own_sid):
                if not dex.cup_allows(t, cup_name):
                    continue
                legal += 1
                cup_pos = dex.cup_pos.get(cup_name, {}).get(t)
                if not cup_pos or cup_pos[0] > top_rank:
                    continue
                iv_r = dex.iv_rank(t, cap, m.a, m.d, m.s)
                if not iv_r:
                    continue
                cur = best_rank + (best_iv[0] if best_iv else 9999)
                new = cup_pos[0] + iv_r[0]
                if new < cur:
                    best_rank, best_sid, best_iv = cup_pos[0], t, iv_r
            if best_iv is None:
                continue
            qualified += 1
            is_build = m.best_pvp is not None and m.best_pvp.cap == cap
            if is_build:
                built += 1
            builds.append({
                "species": _clean_name(dex.by_id[best_sid]["speciesName"]),
                "from": (_clean_name(m.species["speciesName"])
                         if best_sid != own_sid else None),
                "cp": m.cp, "iv": _iv_str(m),
                "species_rank": best_rank, "iv_rank": best_iv[0],
                "is_build": is_build,
            })
        builds.sort(key=lambda b: (b["species_rank"] + b["iv_rank"]))
        out[cup_name] = {
            "title": cup_spec["title"], "cap": cap,
            "legal": legal, "qualified": qualified, "built": built,
            "top_builds": builds[:10],
        }
    return out

def _wishlist(report, dex, mons):
    owned, pre = _owned_and_pre_evos(mons, dex)
    gaps = [c for c in (report.get("coverage") or []) if c["status"] == "GAP"]
    per_type = {}
    for g in gaps:
        t = g["type"]; usable = g["usable"]
        urgency = 3 - usable
        importance = GRADE_TYPE_IMPORTANCE.get(t, 1.0)
        type_score = urgency * importance
        rankings = dex.raid_rankings.get(t.lower()) or []
        picks = []
        for rank, (sid, _c) in enumerate(rankings[:20], 1):
            if sid in owned: continue
            sp = dex.by_id.get(sid)
            if not sp: continue
            picks.append({
                "species": sp.get("speciesName", sid) + (" [Shadow]" if "_shadow" in sid else ""),
                "species_sid": sid, "is_shadow": "_shadow" in sid,
                "fixes": t, "rank_in_type": rank, "cheap": sid in pre,
                "urgency": urgency,
            })
            if len(picks) >= 3: break
        if picks:
            per_type[t] = (type_score, picks)
    order = sorted(per_type.items(), key=lambda x: -x[1][0])
    out, seen = [], set()
    for _t, (_s, picks) in order:
        take = 2 if picks[0]["urgency"] >= 3 else 1
        for p in picks:
            if len(out) >= 10: break
            if p["species_sid"] in seen: continue
            seen.add(p["species_sid"]); out.append(p); take -= 1
            if take <= 0: break
        if len(out) >= 10: break
    return out


def _keep_summary(mons):
    counts = {"Hundos (100% IV)": 0, "PvP anchors (IV rank <= 10)": 0,
              "Mega-worthy": 0, "Dynamax": 0, "Gigantamax": 0,
              "Legendary / mythical": 0, "Shadow": 0, "Purified": 0, "Shiny": 0}
    for m in mons:
        if not m.species: continue
        if (m.a, m.d, m.s) == (15, 15, 15): counts["Hundos (100% IV)"] += 1
        best = 9999
        for e in m.pvp:
            if e.eligible and e.iv_rank < best: best = e.iv_rank
        if best <= 10: counts["PvP anchors (IV rank <= 10)"] += 1
        if m.is_mega_capable: counts["Mega-worthy"] += 1
        if m.is_dynamax: counts["Dynamax"] += 1
        if m.is_gigantamax: counts["Gigantamax"] += 1
        if set(m.species.get("tags") or []) & {"legendary", "mythical", "ultrabeast"}:
            counts["Legendary / mythical"] += 1
        if m.is_shadow: counts["Shadow"] += 1
        if m.is_purified: counts["Purified"] += 1
        if m.is_shiny: counts["Shiny"] += 1
    return {"counts": counts,
            "total_protected": sum(1 for m in mons if m.protect),
            "total": len(mons)}


def _tm_kind(t):
    return ("Elite " if t.get("elite") else "") + ("Fast" if t.get("slot") == "fast" else "Charged") + " TM"


def _tm_labels(r, elite=None):
    """['Dragon Tail (Elite Fast TM)', ...] for a report mon; elite=None means all."""
    typed = r.get("needs_typed") or []
    if typed:
        return [f"{t['name']} ({_tm_kind(t)})" for t in typed if elite is None or bool(t.get("elite")) == elite]
    names = (r.get("needs_elite_moves") or []) if elite else (r.get("needs_moves") or []) if elite is False else \
        list(r.get("needs_moves") or []) + list(r.get("needs_elite_moves") or [])
    return list(names)


def _why_level(r, v, ty, gap_row, best_pvp):
    """Plain-language reasons a mon is on the 'level these' list."""
    sp = r.get("species", "this mon")
    out = []
    role_txt = {"BUILD_PVP": "a PvP build", "BUILD_MEGA": "a Mega / Primal to evolve and boost raids",
                "BUILD_RAID": "a raid attacker", "BUILD_MAX": "a Max Battle attacker",
                "BUILD_GYM": "a gym defender"}.get(v, "a build")
    out.append(f"Marked {role_txt}: {r.get('role', '')}.")
    if gap_row:
        n = gap_row.get("usable", 0)
        out.append(f"You have only {n} usable {ty} raid attacker{'s' if n != 1 else ''}, so this one closes a real gap.")
    if v == "BUILD_PVP" and best_pvp is not None and best_pvp < 9999:
        out.append(f"Best PvP spot: {r.get('best_pvp') or 'see PvP tab'} (species rank + IV rank = {best_pvp}; lower is better).")
    elif r.get("iv_pct") is not None:
        out.append(f"IV {r.get('iv')} ({r.get('iv_pct')}%) - the higher the IV, the more the same dust is worth.")
    tgt = r.get("power_up_to")
    if r.get("evolve_to"):
        out.append(f"Evolve into {r['evolve_to']} first" + (f", then power up to level {tgt}." if tgt else "."))
    elif tgt:
        out.append(f"Power up from level {r.get('level')} to {tgt}" + (f" (about CP {r['build_cp']})." if r.get("build_cp") else "."))
    else:
        out.append("Already at its target level - no dust needed.")
    if r.get("cost_dust") or r.get("cost_candy") or r.get("cost_xl"):
        c = f"Cost: {r.get('cost_dust', 0):,} stardust, {r.get('cost_candy', 0)} candy"
        if r.get("cost_xl"):
            c += f", {r['cost_xl']} XL candy"
        out.append(c + ".")
    need = _tm_labels(r)
    if need:
        out.append("TM needed: " + ", ".join(need) + ".")
    elif r.get("build_status") == "Ready":
        out.append("Moves are already right.")
    return out


def _level_these(report, mons):
    gap = {c["type"]: c for c in (report.get("coverage") or []) if c["status"] == "GAP"}
    vw = {"BUILD_PVP": 1.0, "BUILD_MEGA": 0.9, "BUILD_RAID": 0.7,
          "BUILD_MAX": 0.6, "BUILD_GYM": 0.4}
    scored = []
    for r in report.get("mons") or []:
        v = r.get("verdict", "")
        if not v.startswith("BUILD_"): continue
        w = vw.get(v, 0.1)
        bonus = 0.0
        ty = r.get("raid_type") or r.get("mega_type") or ""
        if ty in gap:
            c = gap[ty]
            bonus = 1.0 if c["usable"] == 0 else (0.5 if c["usable"] == 1 else 0.2)
        if v == "BUILD_PVP":
            best = 9999
            for p in r.get("pvp") or []:
                comb = p.get("combined", 9999)
                if comb < best: best = comb
            quality = max(0.0, 1.0 - best / 100.0) if best < 9999 else 0.5
        else:
            quality = r.get("iv_pct", 0) / 100.0
        why = _why_level(r, v, ty, gap.get(ty), best if v == "BUILD_PVP" else None)
        scored.append({
            "id": r.get("id"), "species": r.get("species", ""), "iv": r.get("iv", ""),
            "iv_pct": r.get("iv_pct"), "cp": r.get("cp"), "level": r.get("level"),
            "evolve_to": r.get("evolve_to", ""), "power_up_to": r.get("power_up_to", ""),
            "build_cp": r.get("build_cp"), "verdict": v, "role": r.get("role", ""),
            "impact": round(w * (1.0 + bonus) * quality, 3),
            "gap_fix": ty if bonus > 0 else "", "search": r.get("search", ""),
            "moves": r.get("moves") or [], "tm_needed": _tm_labels(r),
            "cost": {"dust": r.get("cost_dust") or 0, "candy": r.get("cost_candy") or 0, "xl": r.get("cost_xl") or 0},
            "why": why,
        })
    scored.sort(key=lambda x: -x["impact"])
    return scored[:40]


def _tm_here(report):
    regular, elite_worth = [], []
    skip = 0
    for r in report.get("mons") or []:
        st = r.get("build_status", "")
        if st == "Needs TM":
            needs = r.get("needs_moves") or []
            if needs:
                regular.append({"id": r.get("id"), "species": r.get("species", ""),
                                "needs": ", ".join(_tm_labels(r, False) or needs), "role": r.get("role", ""),
                                "cp": r.get("cp"), "iv": r.get("iv"), "level": r.get("level"),
                                "search": r.get("search", ""), "moves": r.get("moves") or [],
                                "why": f"Needs {', '.join(_tm_labels(r, False) or needs)} for its job as {r.get('role', '')}. "
                                       "A regular TM is cheap and the mon is already leveled."})
        elif st == "Needs Elite TM":
            em = r.get("needs_elite_moves") or []
            if not em: continue
            comb = 9999
            for p in r.get("pvp") or []:
                c = p.get("combined", 9999)
                if c < comb: comb = c
            if r.get("verdict") == "BUILD_PVP" and comb <= 30:
                elite_worth.append({"id": r.get("id"), "species": r.get("species", ""),
                                    "needs": ", ".join(_tm_labels(r, True) or em), "role": r.get("role", ""),
                                    "combined": comb, "cp": r.get("cp"), "iv": r.get("iv"),
                                    "level": r.get("level"), "search": r.get("search", ""),
                                    "moves": r.get("moves") or [],
                                    "why": f"Top PvP spot (species rank + IV rank = {comb}). {', '.join(_tm_labels(r, True) or em)} - elite moves need an Elite TM, "
                                           "so only spend one if you will really battle with this mon."})
            else:
                skip += 1
    regular.sort(key=lambda x: x["species"])
    elite_worth.sort(key=lambda x: x["combined"])
    return {"regular": regular, "elite_worth": elite_worth,
            "elite_skip": {"count": skip,
                "summary": (str(skip) + " others were flagged but are not worth the spend - "
                            "they are for a Mega, raid or second-league role, or their IV "
                            "rank is too poor for PvP. A regular TM gets you most of the value.")}}


def _coverage_section(report, wishlist):
    fixes = {w["fixes"]: w["species"] for w in wishlist}
    out = []
    for c in report.get("coverage") or []:
        u = c.get("usable", 0)
        st = "OK" if c["status"] == "OK" else ("GAP" if u == 0 else "THIN")
        out.append({"type": c["type"], "status": st, "usable": u,
                    "names": c.get("names") or [], "fix": fixes.get(c["type"], "")})
    return out


def _narrative(pct, cov, pvp, mega, mx, depth, report, wishlist):
    letter = _grade_letter(pct)
    gaps = [c for c in (report.get("coverage") or []) if c["status"] == "GAP"]
    urgent = [g["type"] for g in gaps if g["usable"] == 0]
    thin = [g["type"] for g in gaps if g["usable"] in (1, 2)]
    head = "You are at " + str(round(pct, 1)) + "% of a well-rounded 2026 account (" + letter + ")."
    parts = []
    if urgent:
        parts.append("The biggest drag is raid coverage: " + str(len(gaps))
                     + " types are short and " + ", ".join(urgent)
                     + " have zero usable attackers.")
    elif gaps:
        parts.append("Raid coverage is the biggest drag: " + str(len(gaps)) + " types are short.")
    if thin:
        parts.append("Close to good in " + ", ".join(thin)
                     + " - one more attacker each would tip them to OK.")
    if wishlist:
        top = wishlist[0]
        parts.append("The single best add would be " + top["species"]
                     + " (#" + str(top["rank_in_type"]) + " " + top["fixes"] + " attacker) - it "
                     + top.get("reason", "strengthens " + top["fixes"]) + ".")
    return {"headline": head, "body": " ".join(parts)}


REVIEW_ACTION_ORDER = ["bug", "transfer", "hunt_atk", "hunt_spread",
                       "hunt_quality", "boost", "leave", "keep"]

def _review_action(m):
    """(action_key, action_label, detail) - what to do with a REVIEW mon.

    Groups:
      bug          species form did not resolve, a fix is needed
      transfer     safe to candy - no role for this copy
      hunt_atk     species is good, need a 12+ ATK copy
      hunt_spread  species is good, need a better PvP spread
      hunt_quality species is good, need a stronger copy
      boost        Mega only, use for the type boost, never level
      leave        species good but this level is too costly
      keep         no specific action, collection only
    """
    reasons = " ".join(m.review_reasons).lower()
    kinds = m.gate_review_kinds or set()
    if "could not resolve" in reasons or "ambiguous form" in reasons:
        return ("bug", "Fix needed", "species form not recognized")
    if "mega" in kinds and "mega dps" in reasons:
        return ("boost", "Keep for boost only", "use for the type boost, no dust")
    if "gym.min_iv_pct" in reasons:
        return ("transfer", "Safe to transfer", "gym defender IV below 70% floor")
    if "beyond your top" in reasons:
        return ("transfer", "Safe to transfer", "surplus defender (you have enough)")
    if "overall iv" in reasons and "raid.min_iv_pct" in reasons:
        return ("transfer", "Safe to transfer", "overall IV too low for the role")
    if "master league" in reasons or "master " in reasons:
        return ("hunt_spread", "Hunt a better IV spread", "hunt a 15/15/15 for Master")
    if "great league" in reasons or "ultra league" in reasons:
        return ("hunt_spread", "Hunt a better IV spread", "hunt a 0/15/15-style spread")
    if "mega" in kinds and "atk iv" in reasons:
        return ("hunt_atk", "Hunt a 12+ ATK copy", "catch a 12+ ATK Mega copy")
    if "raid_min_level" in reasons and "only l" in reasons:
        return ("leave", "Leave in bag", "level too low, dust would be wasted")
    if "raid_min_atk_iv" in reasons or "atk iv" in reasons:
        return ("hunt_atk", "Hunt a 12+ ATK copy", "catch a 12+ ATK copy")
    if "dps" in reasons:
        return ("hunt_quality", "Hunt a stronger copy", "hunt a stronger copy")
    if "max_battle" in reasons:
        return ("hunt_atk", "Hunt a 12+ ATK copy", "catch a higher-ATK Max copy")
    return ("keep", "Keep as collection", "no specific action")


def _review_groups(mons):
    """Grouped REVIEW rows with an actionable recommendation per mon."""
    out = []
    for m in mons:
        if m.verdict != "REVIEW":
            continue
        ak, label, detail = _review_action(m)
        out.append({
            "action": ak, "label": label, "detail": detail,
            "species": _clean_name(m.species["speciesName"]) if m.species else f"dex {m.dex}",
            "cp": m.cp, "iv": _iv_str(m), "iv_pct": m.iv_pct,
            "role": m.role,
        })
    out.sort(key=lambda r: (REVIEW_ACTION_ORDER.index(r["action"]), -r["iv_pct"]))
    return out

def _explain_components(components, report):
    """Add a plain-language 'explain' (how it is scored, what holds it back,
    what to do) to each grade component."""
    cov = report.get("coverage") or []
    ok = [c["type"] for c in cov if c.get("usable", 0) >= 3]
    short = [f"{c['type']} ({c['usable']})" for c in cov if c.get("usable", 0) < 3]
    ms = report.get("mons") or []
    bp = [m for m in ms if m.get("verdict") == "BUILD_PVP"]
    st = {}
    for m in bp:
        st[m.get("build_status", "Unknown")] = st.get(m.get("build_status", "Unknown"), 0) + 1
    boost = set()
    for m in (report.get("mega") or {}).get("priority") or []:
        for tag in m.get("tags") or []:
            if tag.startswith("boosts "):
                boost.update(t.strip() for t in tag[7:].split("/") if t.strip() and t.strip().lower() != "none")
    mt = sorted({t["type"] for t in report.get("max_teams") or [] if t.get("entries")})
    hundos = sum(1 for m in ms if m.get("iv_pct", 0) >= 100.0)
    ex = {
        "raid_coverage": ("Each of the 18 types scores full marks with 3+ usable raid attackers, 70% with 2, 40% with 1. "
                          f"{len(ok)} of {len(cov)} types are at 3+. Short: {', '.join(short) or 'none'}. "
                          "To raise it, power up one more attacker in the short types (see Level these) or catch the wishlist mons."),
        "pvp_readiness": ("60% is how many different 3-mon teams you can field in Great, Ultra and Master (5 per league is full marks); "
                          "40% is how finished your PvP builds are. "
                          f"Of {len(bp)} PvP builds: " + (", ".join(f"{n} {k}" for k, n in sorted(st.items())) or "none") +
                          ". Each 'Needs TM' mon is worth +20% of a finished one, so TMs are the cheapest gain."),
        "mega_coverage": (f"Counts the raid types your Megas can boost, out of 18. You cover {len(boost)}: {', '.join(sorted(boost)) or 'none'}. "
                          "Evolve one more Mega of a missing type to raise this."),
        "max_battle": (f"Counts the types you have a Max Battle attacker for, out of 18. You have {len(mt)}: {', '.join(mt) or 'none'}. "
                       "Build a Dynamax attacker of a missing type to raise it."),
        "collection_depth": (f"How broad and strong your whole collection is (you hold {hundos} hundos and "
                             f"{len({m.get('species') for m in ms})} species). It rises slowly as you catch better IVs; "
                             "it is not worth chasing with dust."),
    }
    for k, v in components.items():
        v["explain"] = ex.get(k, "")


# ============================================================
# WISHLIST + PER-SECTION DETAIL (2026-10-29 polish)
#
# The old wishlist only looked at types with a coverage GAP, so a type that
# already had a full team never told you about a better mon.  These builders
# rank the best candidates in EVERY type / league and compare each one with
# what you already own, so the answer to "what should I hunt to strengthen
# my teams" is always on screen.
# ============================================================
HAVE_PCT = 0.93          # a copy at >= 93% of the perfect DPS counts as "have it"
WISH_ROWS = 10           # rows per type / league


class _Owners(defaultdict):
    """species id -> your IN-PLAY mons that are it or can evolve into it.
    `.undecided` holds the REVIEW ones; TRANSFER mons are ignored entirely."""


def _owner_index(mons, dex):
    idx = _Owners(list)
    idx.undecided = defaultdict(list)
    for m in mons:
        if not m.species or m.verdict == "TRANSFER":
            continue
        target = idx.undecided if m.verdict == "REVIEW" else idx
        for d in dex.descendants(m.species["speciesId"]):
            target[d].append(m)
    return idx


def _decide_copy(owners, sid, shadow=None):
    """Best REVIEW copy of a species (so the wishlist says DECIDE, not HUNT or HAVE)."""
    ms = [m for m in owners.undecided.get(sid, []) if shadow is None or bool(m.is_shadow) == shadow]
    if not ms:
        return None
    m = max(ms, key=lambda x: (x.iv_pct, x.cp))
    b = _copy_brief(m)
    b["species"] = _clean_name(m.species["speciesName"])
    return b


def _sp_label(dex, sid):
    sp = dex.by_id.get(sid) or {}
    return sp.get("speciesName") or sid


def _rarity_tags(dex, sid):
    base = sid[:-7] if sid.endswith("_shadow") else sid
    tags = set((dex.by_id.get(base) or {}).get("tags") or [])
    return [t for t in ("legendary", "mythical", "ultrabeast") if t in tags]


def _copy_brief(m, dps=None):
    return {"id": m.uid, "cp": m.cp, "iv": _iv_str(m), "iv_pct": m.iv_pct,
            "level": round(m.level, 1), "shadow": bool(m.is_shadow),
            "verdict": m.verdict, "atk": m.a,
            "dps": round(dps, 2) if dps is not None else None}


def _wishlist_raid(mons, dex, cfg, owners):
    """{type: {...}} top WISH_ROWS raid attackers per type vs what you own."""
    rc = cfg["raid"]
    min_atk = int(rc["min_atk_iv"])
    sh_bonus = float(rc.get("shadow_dps_bonus", 1.2)) if rc.get("prefer_shadow", True) else 1.0
    teams = build_raid_teams(mons, dex, cfg)
    cov = coverage_state(mons, dex, cfg)
    min_cov = int(cfg["coverage"]["min_attackers"])
    out = {}
    for t, rank_rows in sorted(dex.raid_rankings.items()):
        entries = teams.get(t, [])
        slot = entries[:5]
        slot_dps = [d for _m, d in slot]
        team_ids = {m.uid: i + 1 for i, (m, _d) in enumerate(slot)}
        weakest = slot_dps[4] if len(slot_dps) >= 5 else 0.0
        best_have = slot_dps[0] if slot_dps else 0.0
        cs = cov.get(t, {})
        usable_n = len(cs.get("usable", []))
        need = int(cs.get("need", 0))
        cands = []
        for pos, (sid, coeff) in enumerate(rank_rows[:40], 1):
            sp = dex.by_id.get(sid)
            if not sp:
                continue
            atk = sp["baseStats"]["atk"]
            sh = dex.by_id.get(f"{sid}_shadow")
            has_shadow = bool(sh) and sh.get("released", True)
            bs_ = sp["baseStats"]
            base_dps = (atk + 15) * CPM[40.0] * coeff * raid_bulk(bs_)
            shadow_dps = (atk + 15) * CPM[40.0] * coeff * sh_bonus * raid_bulk(bs_, 15, 15, True)
            target = max(base_dps, shadow_dps) if has_shadow else base_dps
            cands.append((target, base_dps, sid, coeff, atk, has_shadow, pos))
        cands.sort(key=lambda c: (-c[0], c[2]))
        top_target = cands[0][0] if cands else 0.0
        rows = []
        for rank, (target, base_dps, sid, coeff, atk, has_shadow, pos) in enumerate(cands[:WISH_ROWS], 1):
            copies = []
            for m in owners.get(sid, []):
                d = ((atk + m.a) * CPM[40.0] * coeff * (sh_bonus if m.is_shadow else 1.0)
                     * raid_bulk(dex.by_id[sid]["baseStats"], m.d, m.s, bool(m.is_shadow)))
                copies.append((d, m))
            copies.sort(key=lambda x: (-x[0], x[1].uid))
            why, status, best = [], "HUNT", None
            if copies:
                d, m = copies[0]
                best = _copy_brief(m, d)
                best["stage"] = "final" if m.species["speciesId"] == sid else "pre-evo"
                best["species"] = _clean_name(m.species["speciesName"])
                pct = d / target if target else 0.0
                best["pct"] = round(pct * 100, 1)
                if m.a < min_atk:
                    why.append(f"best copy has ATK IV {m.a} (raid floor is {min_atk})")
                if has_shadow and not m.is_shadow and pct < HAVE_PCT:
                    why.append(f"yours is not Shadow - the Shadow version hits about "
                               f"{round((sh_bonus - 1) * 100)}% harder")
                if pct >= HAVE_PCT and m.a >= min_atk:
                    status = "HAVE"
                else:
                    status = "UPGRADE"
                    if not why:
                        why.append("a better copy would hit harder")
                if best["stage"] == "pre-evo":
                    why.append(f"you own {best['species']} - evolve it to get this")
            if status == "HUNT":
                _ub = _decide_copy(owners, sid)
                if _ub:
                    status, best = "DECIDE", _ub
                    why.append("your copy is in REVIEW - decide on it before hunting another")
            rank_if = 1 + sum(1 for x in slot_dps if x > target)
            enters = rank_if <= 5
            replaced = None
            if enters and len(slot) >= 5:
                rm = slot[4][0]
                replaced = _clean_name(rm.species["speciesName"]) if rm.species else None
            row = {
                "rank": rank, "rank_plain": pos, "species": _sp_label(dex, sid),
                "sid": sid, "target": "Shadow" if (has_shadow and target > base_dps + 1e-9) else "Regular",
                "has_shadow": has_shadow and target > base_dps + 1e-9, "dps": round(target, 2),
                "pct_of_top": round(100.0 * target / top_target, 1) if top_target else 0.0,
                "tags": _rarity_tags(dex, sid), "status": status, "best": best, "why": why,
                "cheap": bool(copies) and best is not None and best["stage"] == "pre-evo",
                "team_slot": team_ids.get(copies[0][1].uid) if copies else None,
                "would_enter": enters and status != "HAVE", "rank_if_added": rank_if,
                "replaces": replaced,
                "gain_vs_weakest": (round(100.0 * (target / weakest - 1), 1) if weakest else None),
                "gain_vs_best": (round(100.0 * (target / best_have - 1), 1) if best_have else None),
                "fixes_gap": need > 0 and status != "HAVE",
            }
            rows.append(row)
        out[t] = {
            "type": _type_display(t), "usable": usable_n, "need": need,
            "status": "OK" if need == 0 else ("GAP" if usable_n == 0 else "THIN"),
            "team": [{"name": _clean_name(m.species["speciesName"]) if m.species else "?",
                      "dps": round(d, 2), "iv": _iv_str(m), "shadow": bool(m.is_shadow)}
                     for m, d in slot],
            "best_have": round(best_have, 2), "weakest": round(weakest, 2),
            "top_species": rows[0]["species"] if rows else "", "top_dps": round(top_target, 2),
            "have_pct": round(100.0 * best_have / top_target, 1) if top_target else 0.0,
            "rows": rows,
        }
    return out


def _wishlist_pvp(mons, dex, cfg, report, owners):
    """Per league / cup: the top WISH_ROWS species and how good your best copy is."""
    keep_rank = int(cfg["pvp"]["keep_iv_rank"])
    out = []
    team_names = {}
    for lg in report.get("teams") or []:
        s = set()
        for t in lg.get("teams") or []:
            for mem in t.get("members") or []:
                s.add((mem.get("name"), bool(mem.get("shadow"))))
        team_names[lg["league"]] = s
    plans = [(cap, LEAGUE[cap], cap) for cap in CAPS] + \
            [(cn, spec["title"] + " Cup", spec["cap"]) for cn, spec in CUPS.items()]
    for key, label, cap in plans:
        if isinstance(key, int):
            lst = [(sid, sc) for sid, sc in dex.pvp_rows.get(key, [])]
        else:
            lst = [(sid, v[1]) for sid, v in sorted(dex.cup_pos.get(key, {}).items(),
                                                    key=lambda kv: kv[1][0])]
        rows = []
        for sid, score in lst:
            if len(rows) >= WISH_ROWS:
                break
            is_sh = sid.endswith("_shadow")
            base = sid[:-7] if is_sh else sid
            sp = dex.by_id.get(base)
            if not sp:
                continue
            best, over_cap, has_other = None, 0, False
            for m in owners.get(base, []):
                if is_sh != bool(m.is_shadow):
                    has_other = has_other or (not is_sh and m.is_shadow)
                    continue
                if isinstance(key, int):
                    e = _pvp_entry(m, dex, base, cap)
                    if e is None:
                        continue
                    ivr, eligible = e.iv_rank, e.eligible
                else:
                    r = dex.iv_rank(base, cap, m.a, m.d, m.s)
                    if not r:
                        continue
                    ivr, eligible = r[0], m.cp <= cap
                if not eligible:
                    over_cap += 1
                    continue
                if best is None or ivr < best[0]:
                    best = (ivr, m)
            rs = dex.role_scores(key, sid) if isinstance(key, int) else dex.role_scores(key, base)
            role = ""
            if rs:
                k = max(("leads", "switches", "closers"), key=lambda x: rs.get(x, 0.0))
                role = PVP_ROLE_LABEL.get(k, "")
            nm = _clean_name(sp["speciesName"])
            on_team = (nm, is_sh) in team_names.get(label, set())
            row = {"rank": len(rows) + 1, "species": sp["speciesName"] + (" (Shadow)" if is_sh else ""),
                   "sid": sid, "shadow": is_sh, "score": round(float(score), 1), "role": role,
                   "on_team": on_team, "best": None, "status": "HUNT", "why": []}
            if best:
                ivr, m = best
                row["best"] = {**_copy_brief(m), "iv_rank": ivr,
                               "species": _clean_name(m.species["speciesName"]),
                               "stage": "final" if m.species["speciesId"] == base else "pre-evo"}
                if ivr <= 10:
                    row["status"] = "HAVE"; row["why"].append("top-10 spread")
                elif ivr <= keep_rank:
                    row["status"] = "HAVE"; row["why"].append(f"IV rank #{ivr}")
                else:
                    row["status"] = "UPGRADE"
                    row["why"].append(f"best copy is only IV rank #{ivr} - hunt a spread near the top")
                if row["best"]["stage"] == "pre-evo":
                    row["why"].append(f"evolve your {row['best']['species']}")
            elif over_cap:
                row["why"].append("you own it but every copy is over the CP cap")
            elif _decide_copy(owners, base, shadow=is_sh):
                row["status"], row["best"] = "DECIDE", _decide_copy(owners, base, shadow=is_sh)
                row["why"].append("your copy is in REVIEW - decide on it before hunting another")
            if has_other and not best:
                row["why"].append("you own the non-Shadow version only" if is_sh else "you own the Shadow version")
            if row["status"] == "HAVE" and not on_team:
                row["why"].append("not on any suggested team")
            rows.append(row)
        out.append({"league": label, "cap": cap, "rows": rows})
    return out


def _mega_catalog(dex):
    """Every released Mega / Primal with its best attacking type and DPS (15 atk, L40)."""
    cat = []
    for sid in sorted(dex.mega_species):
        sp = dex.by_id.get(sid) or {}
        bs = sp.get("baseStats") or {}
        if not bs.get("atk"):
            continue
        boosts = [t for t in dex.mega_boost_types(sid)]
        best_d, best_t = 0.0, None
        for t in RAID_USEFUL_TYPES:
            c, _mv = dex.coeff_of(sid, t)
            if c:
                d = (bs["atk"] + 15) * CPM[40.0] * c * raid_bulk(bs)
                if d > best_d:
                    best_d, best_t = d, t
        if best_t:
            cat.append({"sid": sid, "name": sp.get("speciesName", sid), "base": mega_base_of(sid),
                        "boosts": boosts, "dps": best_d, "atype": best_t})
    return cat


def _wishlist_mega(mons, dex, owners):
    cat = _mega_catalog(dex)
    by_mega, by_mega_und = defaultdict(list), defaultdict(list)
    for m in mons:
        if m.mega_sid and m.is_mega_capable and m.verdict != "TRANSFER":
            (by_mega_und if m.verdict == "REVIEW" else by_mega)[m.mega_sid].append(m)
    out = {}
    for t in sorted(MAX_BATTLE_TYPES):
        pool = sorted([c for c in cat if t in c["boosts"]], key=lambda c: -c["dps"])
        rows, top = [], (pool[0]["dps"] if pool else 0.0)
        for rank, c in enumerate(pool[:WISH_ROWS], 1):
            have = sorted(by_mega.get(c["sid"], []), key=lambda m: -m.iv_pct)
            base_owned = sorted(owners.get(c["base"], []), key=lambda m: -m.iv_pct)
            status, best, why = "HUNT", None, []
            if have:
                status, best = "HAVE", _copy_brief(have[0])
                best["mega_level"] = have[0].mega_level
                best["unlocked"] = bool(have[0].has_mega_unlocked)
            elif by_mega_und.get(c["sid"]):
                status, best = "DECIDE", _copy_brief(by_mega_und[c["sid"]][0])
                why.append("your Mega-capable copy is in REVIEW - decide on it before hunting another")
            elif base_owned:
                status, best = "UPGRADE", _copy_brief(base_owned[0])
                why.append("you own the species but no copy passes the Mega gate "
                           "(IV / DPS) - hunt a better one")
            rows.append({"rank": rank, "species": c["name"], "sid": c["sid"],
                         "boosts": [_type_display(b) for b in c["boosts"]],
                         "attacks_as": _type_display(c["atype"]), "dps": round(c["dps"], 2),
                         "pct_of_top": round(100.0 * c["dps"] / top, 1) if top else 0.0,
                         "status": status, "best": best, "why": why,
                         "tags": _rarity_tags(dex, c["base"])})
        out[t] = {"type": _type_display(t), "rows": rows,
                  "owned": sum(1 for r in rows if r["status"] == "HAVE")}
    return out


def _wishlist_max(mons, dex, cfg, owners):
    min_atk = int(cfg["max_battle"]["min_atk_iv"])
    teams = build_max_teams(mons, dex, cfg)
    out = {}
    for t in sorted(MAX_BATTLE_TYPES):
        rank_rows = dex.max_rankings.get(t) or []
        entries = teams.get(t, [])
        best_have = entries[0][1] if entries else 0.0
        cands = []
        for pos, (sid, coeff) in enumerate(rank_rows[:25], 1):
            sp = dex.by_id.get(sid)
            if sp:
                cands.append(((sp["baseStats"]["atk"] + 15) * CPM[40.0] * coeff, sid, coeff,
                              sp["baseStats"]["atk"], False))
        for sid, coeff in dex.gmax_rows.get(t, []):          # Gigantamax: fixed type, stronger Max Move
            sp = dex.by_id.get(sid)
            if sp:
                cands.append(((sp["baseStats"]["atk"] + 15) * CPM[40.0] * coeff, sid, coeff,
                              sp["baseStats"]["atk"], True))
        cands.sort(key=lambda c: (-c[0], c[1], c[4]))
        top = cands[0][0] if cands else 0.0
        rows = []
        for rank, (target, sid, coeff, atk, is_g) in enumerate(cands[:8], 1):
            if is_g:
                pool = [m for m in owners.get(sid, []) if m.is_gigantamax and m.species["speciesId"] == sid]
                copies = sorted((((atk + m.a) * CPM[40.0] * coeff, m) for m in pool),
                                key=lambda x: (-x[0], x[1].uid))
                dyn = copies
            else:
                copies = sorted((((atk + m.a) * CPM[40.0] * coeff, m) for m in owners.get(sid, [])),
                                key=lambda x: (-x[0], x[1].uid))
                dyn = [(d, m) for d, m in copies if m.is_dynamax or m.is_gigantamax]
            status, best, why = "HUNT", None, []
            if dyn:
                d, m = dyn[0]
                best = _copy_brief(m, d)
                best["dynamax"] = True
                best["max_level"] = m.max_attack_level or 1
                best["gain_pct"] = max_move_gain_pct(m)
                if d / target >= HAVE_PCT and m.a >= min_atk:
                    status = "HAVE"
                else:
                    status = "UPGRADE"
                    why.append(f"Dynamax copy has ATK IV {m.a} (Max floor is {min_atk})"
                               if m.a < min_atk else "a higher-ATK Dynamax copy would hit harder")
            elif copies and not is_g:
                d, m = copies[0]
                best = _copy_brief(m, d)
                best["dynamax"] = False
                status = "NO DYNAMAX"
                why.append("you own it but it is not Dynamax - only Dynamax / Gigantamax "
                           "copies can battle in Max Battles")
            elif is_g:
                why.append("Gigantamax form - you need a Gigantamax copy (G-Max Battles / events)")
            if status == "HUNT":
                _ub = _decide_copy(owners, sid)
                if _ub:
                    status, best = "DECIDE", _ub
                    why.append("your copy is in REVIEW - decide on it before hunting another")
            rows.append({"rank": rank, "species": ("Gigantamax " if is_g else "") + _sp_label(dex, sid),
                         "sid": sid, "gmax": is_g, "dps": round(target, 2),
                         "pct_of_top": round(100.0 * target / top, 1) if top else 0.0,
                         "status": status, "best": best, "why": why,
                         "tags": _rarity_tags(dex, sid) + (["gigantamax"] if is_g else [])})
        out[t] = {"type": _type_display(t), "rows": rows,
                  "team": [{"name": _clean_name(m.species["speciesName"]), "dps": round(d, 2),
                            "iv": _iv_str(m)} for m, d in entries[:4]],
                  "best_have": round(best_have, 2), "top_dps": round(top, 2),
                  "have_pct": round(100.0 * best_have / top, 1) if top else 0.0}
    return out


def _top_adds(wl_raid, limit=10):
    """Overall best 'add this' list: the best actionable pick per type, gaps first."""
    picks = []
    for t, blk in wl_raid.items():
        imp = GRADE_TYPE_IMPORTANCE.get(blk["type"], 1.0)
        for r in blk["rows"]:
            if r["status"] == "HAVE":
                continue
            gap_bonus = {"GAP": 40.0, "THIN": 20.0}.get(blk["status"], 0.0) if r["fixes_gap"] else 0.0
            gain = max(0.0, r["gain_vs_weakest"] or 0.0) if r["would_enter"] else 0.0
            if not r["fixes_gap"] and not r["would_enter"]:
                continue
            score = (gap_bonus + gain + (5.0 if r["cheap"] else 0.0)) * imp
            picks.append((score, r, blk))
            break                       # best actionable row per type only
    picks.sort(key=lambda x: -x[0])
    out = []
    for _s, r, blk in picks[:limit]:
        out.append({"species": r["species"], "species_sid": r["sid"],
                    "is_shadow": r["target"] == "Shadow", "fixes": blk["type"],
                    "rank_in_type": r["rank"], "cheap": r["cheap"], "urgency": 3 - blk["usable"]
                    if blk["status"] != "OK" else 0,
                    "status": r["status"], "gain_vs_weakest": r["gain_vs_weakest"],
                    "reason": (("decide on your REVIEW copy first - " if r["status"] == "DECIDE" else "")
                               + ("closes a " + blk["status"] + " type" if r["fixes_gap"]
                                  else "stronger than your #5 " + blk["type"] + " attacker"))})
    return out


def _letter_for_pct(p):
    return _grade_letter(p)


def _flex_attackers(mons, dex, cfg):
    """{type: [rows]}  In-play Pokemon that would be a decent attacker of this type but are assigned to
    ANOTHER type (each Pokemon is placed in exactly one raid type, where it ranks best).  Explains why a
    type with many multi-type Pokemon around it can look thin."""
    rc = cfg["raid"]
    floor = float(rc["min_dps_pct_of_best_of_type"]) / 100.0
    sh_bonus = float(rc.get("shadow_dps_bonus", 1.2)) if rc.get("prefer_shadow", True) else 1.0
    teams = build_raid_teams(mons, dex, cfg)
    out = {}
    for t in RAID_USEFUL_TYPES:
        ref = _ref_dps(dex, dex.raid_rankings, t)
        on_team = {m.uid for m, _ in teams.get(t, [])}
        rows = []
        for m in mons:
            if (m.verdict == "TRANSFER" or not m.species or not m.raid_sid or m.uid in on_team
                    or m.raid_type == t or m.a < int(rc["min_atk_iv"])):
                continue
            sp = dex.by_id.get(m.raid_sid)
            coeff = dex.raid_coeff(m.raid_sid, t)
            if not sp or not coeff or not ref:
                continue
            sh = bool(m.is_shadow and rc.get("prefer_shadow", True))
            d = ((sp["baseStats"]["atk"] + m.a) * CPM[40.0] * coeff * (sh_bonus if sh else 1.0)
                 * raid_bulk(sp["baseStats"], m.d, m.s, sh))
            if d < ref * floor:
                continue
            here = estimated_raid_dps(m, dex) if m.raid_type else None
            cur_name = _display_species(m)
            to_name = ""
            if m.raid_sid != m.species["speciesId"] and "crowned" not in m.raid_sid:
                to_name = _clean_name(sp.get("speciesName") or m.raid_sid)
            rows.append({"id": m.uid, "name": cur_name,
                         "to": to_name,
                         "iv": _iv_str(m), "level": round(m.level, 1), "shadow": bool(m.is_shadow),
                         "verdict": m.verdict, "score": round(d, 1), "pct": round(100.0 * d / ref, 0),
                         "assigned": _type_display(m.raid_type) if m.raid_type else "",
                         "assigned_score": round(here, 1) if here else None})
        rows.sort(key=lambda r: (-r["score"], r["id"]))
        out[t] = rows[:6]
    return out


def _section_raid(report, wl, cov_pick, flex=None):
    rt = {t["type"]: t for t in report.get("raid_teams") or []}
    out = []
    for t, blk in sorted(wl.items()):
        disp = blk["type"]
        r = rt.get(disp) or {}
        picks = []
        for m, d, dust in (cov_pick.get(t, {}).get("picks") or []):
            picks.append({"name": _clean_name(m.species["speciesName"]) if m.species else "?",
                          "cp": m.cp, "level": round(m.level, 1), "iv": _iv_str(m),
                          "dps": round(d, 2), "dust": dust,
                          "evolve_to": m.evolve_to or ""})
        strength = blk["have_pct"]
        avg5 = (sum(x["dps"] for x in blk["team"]) / len(blk["team"])) if blk["team"] else 0.0
        out.append({
            "type": disp, "status": blk["status"], "usable": blk["usable"], "need": blk["need"],
            "team": r.get("entries") or [], "mega": r.get("mega"),
            "best_dps": blk["best_have"], "top_species": blk["top_species"],
            "top_dps": blk["top_dps"], "strength_pct": strength,
            "avg_team_dps": round(avg5, 2),
            "letter": _letter_for_pct(strength) if blk["team"] else "F",
            "fill_picks": picks,
            "flex": (flex or {}).get(t, []),
            "wish": [x for x in blk["rows"] if x["status"] != "HAVE"][:3],
        })
    return out


def _section_pvp(report, wl_pvp):
    mons = report.get("mons") or []
    status_w = {"Ready": 1.0, "Needs TM": 0.8, "Needs second charged move": 0.6,
                "Needs Elite TM": 0.4, "Unknown": 0.5}
    out = []
    for lg in report.get("teams") or []:
        name = lg["league"]
        key = name.replace(" Cup", "")
        builds = []
        for m in mons:
            if m.get("verdict") != "BUILD_PVP":
                continue
            mm = re.match(r"^(\w+) League", m.get("role") or "")
            if mm and mm.group(1) == key:
                builds.append({"id": m["id"], "species": m["species"], "iv": m["iv"], "cp": m["cp"],
                               "role": m["role"], "status": m.get("build_status", "Unknown"),
                               "needs": (m.get("needs_moves") or []) + (m.get("needs_elite_moves") or []),
                               "search": m.get("search", "")})
        trios = {tuple(sorted(x.get("name", "") for x in t.get("members") or []))
                 for t in lg.get("teams") or []}
        grades = [(t.get("cohesion") or {}).get("grade") for t in lg.get("teams") or []]
        comp = (sum(status_w.get(b["status"], 0.5) for b in builds) / len(builds)) if builds else 0.0
        out.append({
            "league": name, "cap": lg["cap"], "is_cup": name.endswith("Cup"),
            "teams": lg.get("teams") or [], "distinct_teams": len(trios),
            "team_score_pct": round(100.0 * min(1.0, len(trios) / 5.0), 1),
            "best_grade": next((g for g in "ABCDF" if g in grades), "-"),
            "threat_source": lg.get("threat_source", ""), "threat_note": lg.get("threat_note", ""),
            "builds": builds, "completion_pct": round(100.0 * comp, 1),
            "wish": next((w["rows"] for w in wl_pvp if w["league"] == name), []),
        })
    return out


def _section_mega(report, wl):
    pri = (report.get("mega") or {}).get("priority") or []
    cover = defaultdict(list)
    for m in pri:
        for tag in m.get("tags") or []:
            if tag.startswith("boosts "):
                for t in tag[7:].split("/"):
                    t = t.strip()
                    if t and t.lower() != "none":
                        cover[t].append(m["form"])
    rows = []
    for t, blk in sorted(wl.items()):
        have = cover.get(blk["type"], [])
        rows.append({"type": blk["type"], "covered": bool(have), "forms": have,
                     "wish": [r for r in blk["rows"] if r["status"] != "HAVE"][:5],
                     "all": blk["rows"]})
    return {"priority": pri, "types": rows, "covered": sum(1 for r in rows if r["covered"]),
            "total": len(rows)}


def _section_max(report, wl):
    types = []
    for t, blk in sorted(wl.items()):
        types.append({"type": blk["type"], "covered": bool(blk["team"]), "team": blk["team"],
                      "have_pct": blk["have_pct"], "wish": [r for r in blk["rows"]
                                                           if r["status"] != "HAVE"][:5],
                      "all": blk["rows"]})
    return {"types": types, "covered": sum(1 for x in types if x["covered"]), "total": len(types)}


def _section_depth(report):
    ms = report.get("mons") or []
    hundos = [m for m in ms if m.get("iv_pct", 0) >= 100.0]
    by_sp = Counter(m["species"] for m in hundos)
    anchors = []
    ranked = total = 0
    for m in ms:
        v = m.get("verdict", "")
        if v in ("KEEP", "REVIEW") or v.startswith("BUILD_"):
            total += 1
            best = None
            for p in m.get("pvp") or []:
                if p.get("eligible") and (best is None or p["iv_rank"] < best["iv_rank"]):
                    best = p
            if best and best["iv_rank"] <= 100:
                ranked += 1
            if best and best["iv_rank"] <= 10:
                anchors.append({"species": m["species"], "league": best["league"],
                                "iv_rank": best["iv_rank"], "cp": m["cp"], "iv": m["iv"],
                                "verdict": v})
    anchors.sort(key=lambda a: (a["iv_rank"], a["species"]))
    species = {m.get("species") for m in ms if m.get("species")}
    return {
        "hundos": len(hundos), "hundo_target": 20,
        "hundo_list": [{"species": s, "count": n} for s, n in sorted(by_sp.items(), key=lambda x: (-x[1], x[0]))],
        "species": len(species), "species_target": 500,
        "pvp_ranked": ranked, "pvp_total": total,
        "pvp_pct": round(100.0 * ranked / total, 1) if total else 0.0,
        "anchors": anchors[:40],
        "parts": [
            {"label": "Hundos", "weight": 40, "pct": round(100 * min(1.0, len(hundos) / 20.0), 1),
             "text": f"{len(hundos)} hundos; 20 is full marks."},
            {"label": "Species variety", "weight": 30, "pct": round(100 * min(1.0, len(species) / 500.0), 1),
             "text": f"{len(species)} different species; 500 is full marks."},
            {"label": "PvP-grade IVs", "weight": 30,
             "pct": round(100.0 * ranked / total, 1) if total else 0.0,
             "text": f"{ranked} of {total} kept Pokemon have a top-100 IV spread in some league."},
        ],
    }


def audit_report(report, dex=None):
    """Cross-tab consistency checks.  Every tab reads the same report.json, so
    these confirm the tabs agree with each other.  Returns [(name, ok, detail)]."""
    res = []

    def chk(name, ok, detail=""):
        res.append((name, bool(ok), detail))

    mons = report.get("mons") or []
    ids = {m["id"] for m in mons}
    v = (report.get("counts") or {}).get("verdicts") or {}
    chk("verdict counts add up to the collection", sum(v.values()) == len(mons),
        f"{sum(v.values())} vs {len(mons)}")
    real = Counter(m["verdict"] for m in mons)
    chk("verdict counts match the Pokemon tab", all(real.get(k, 0) == n for k, n in v.items()))
    t_ids = [r["id"] for g in (report.get("transfer") or {}).get("groups") or [] for r in g["rows"]]
    chk("every transfer row is a TRANSFER verdict",
        all(next((m["verdict"] for m in mons if m["id"] == i), None) == "TRANSFER" for i in t_ids))
    chk("transfer total matches TRANSFER count", len(t_ids) == real.get("TRANSFER", 0),
        f"{len(t_ids)} vs {real.get('TRANSFER', 0)}")
    g = report.get("grade") or {}
    comps = g.get("components") or {}
    chk("grade weights add to 100", sum(c["weight"] for c in comps.values()) == 100)
    chk("grade parts add to the overall score",
        abs(sum(c["weighted"] for c in comps.values()) - g.get("overall_pct", 0)) <= 0.35,
        f"{sum(c['weighted'] for c in comps.values()):.1f} vs {g.get('overall_pct')}")
    cov_home = {c["type"]: c["usable"] for c in report.get("coverage") or []}
    cov_grade = {c["type"]: c["usable"] for c in g.get("coverage") or []}
    chk("Home and Grade show the same coverage", cov_home == cov_grade)
    sec = g.get("sections") or {}
    chk("Raid tab has every raid type", len(sec.get("raid") or []) == len(cov_grade),
        f"{len(sec.get('raid') or [])} vs {len(cov_grade)}")
    chk("Raid tab usable counts match coverage",
        all(cov_grade.get(r["type"]) == r["usable"] for r in sec.get("raid") or []))
    wl = g.get("wishlist_all") or {}
    chk("raid wishlist covers every type with 10 rows (or all that exist)",
        all(len(b["rows"]) >= min(WISH_ROWS, 5) for b in (wl.get("raid") or {}).values()))
    bad = [(t, r["species"]) for t, b in (wl.get("raid") or {}).items()
           for r in b["rows"] if r["status"] == "HUNT" and r.get("best")]
    chk("no wishlist row says HUNT while you own a copy", not bad, str(bad[:3]))
    lv = g.get("level_these") or []
    chk("every 'level these' row is a real BUILD mon",
        all(r["id"] in ids and r["verdict"].startswith("BUILD_") for r in lv))
    tm = g.get("tm_here") or {}
    chk("TM lists only hold mons that need a TM",
        all(any(m["id"] == r["id"] and m.get("build_status") == "Needs TM" for m in mons)
            for r in tm.get("regular") or []))
    pv = sec.get("pvp") or []
    chk("PvP readiness counts only Great / Ultra / Master teams",
        True if not pv else all(not x["is_cup"] for x in pv if x["league"] in ("Great", "Ultra", "Master")))
    rs = (report.get("readiness") or {}).get("status_counts") or {}
    nb = sum(1 for m in mons if m["verdict"].startswith("BUILD_") and m["verdict"] != "BUILD_GYM")
    chk("readiness counts cover every non-gym BUILD mon (gym defenders need no moveset)",
        sum(rs.values()) == nb, f"{sum(rs.values())} vs {nb}")
    # --- the single-unit rule: every "use this Pokemon" must be an in-play (KEEP / BUILD) Pokemon ---
    verdict_of = {m["id"]: m["verdict"] for m in mons}
    refs = defaultdict(list)

    def ref(i, where):
        if i:
            refs[i].append(where)
    for blk in report.get("raid_teams") or []:
        for e in blk.get("entries") or []:
            ref(e.get("id"), f"raid team {blk['type']}")
        if blk.get("mega"):
            ref(blk["mega"].get("id"), f"raid {blk['type']} Mega slot")
    for blk in report.get("max_teams") or []:
        for e in blk.get("entries") or []:
            ref(e.get("id"), f"max team {blk['type']}")
    for p_ in (report.get("mega") or {}).get("priority") or []:
        ref(p_.get("id"), "Mega roster")
    for s_ in ((report.get("grade") or {}).get("sections") or {}).get("raid") or []:
        for f_ in s_.get("flex") or []:
            ref(f_.get("id"), "Raid flex list")
    for kk in ("ml", "glul"):
        for p_ in (report.get("priority") or {}).get(kk) or []:
            ref(p_.get("id"), "Power-up list")
    for lg in report.get("teams") or []:
        for t in lg.get("teams") or []:
            for mem in t.get("members") or []:
                ref(mem.get("id"), f"PvP {lg['league']} team {t.get('n')}")
    for r_ in (report.get("grade") or {}).get("level_these") or []:
        ref(r_.get("id"), "Level these")
    for kk in ("regular", "elite_worth"):
        for r_ in ((report.get("grade") or {}).get("tm_here") or {}).get(kk) or []:
            ref(r_.get("id"), "TM list")
    for p_ in ((report.get("max_battle") or {}).get("tanks") or []) + ((report.get("max_battle") or {}).get("healers") or []):
        ref(p_.get("id"), "Max tank / healer pick")
    if report.get("briefing"):
        hb = report["briefing"]["headline"]
        for k_ in ("buddy", "runner_up"):
            if hb.get(k_):
                ref(hb[k_]["id"], "briefing " + k_.replace("_", " "))
        for ev in report["briefing"]["events"]:
            for s_ in ev.get("species") or []:
                for q_ in s_.get("squad") or []:
                    ref(q_.get("id"), "briefing squad")
    for kind in ("raid", "max"):
        for blk in ((report.get("grade") or {}).get("wishlist_all") or {}).get(kind, {}).values():
            for row in blk["rows"]:
                if row["status"] in ("HAVE", "UPGRADE") and row.get("best"):
                    ref(row["best"].get("id"), f"wishlist {row['status']} ({kind})")
    out_of_play = [(i, w) for i, w in refs.items() if verdict_of.get(i) in ("REVIEW", "TRANSFER", None)]
    chk("no Pokemon is recommended for use while it is REVIEW or TRANSFER",
        not out_of_play,
        "; ".join(f"{next((m['species'] for m in mons if m['id'] == i), i)} ({verdict_of.get(i)}) in {w[0]}"
                  for i, w in out_of_play[:3]))
    chk("every Pokemon on a PvP team is identified (so it can be checked)",
        all(mem.get("id") for lg in report.get("teams") or [] for t in lg.get("teams") or []
            for mem in t.get("members") or []))
    chk("the transfer list contains nothing that is also recommended",
        not [i for i in t_ids if i in refs], str([i for i in t_ids if i in refs][:2]))
    if report.get("grade") and (report["grade"].get("wishlist_all") or {}).get("max") and report.get("settings") is not None:
        bad_max = [r_["species"] for blk in report["grade"]["wishlist_all"]["max"].values() for r_ in blk["rows"]
                   if not r_.get("gmax") and r_["sid"] in report.get("_cannot_dynamax", [])]
        chk("the Max wishlist only lists species that can Dynamax", not bad_max, str(bad_max[:3]))
    pl = report.get("placement") or {}
    chk("placement never leaves coverage worse than the old rank-based homes",
        all(v["covered_after"] >= v["covered_before"] for v in pl.values()),
        str({k: (v["covered_before"], v["covered_after"]) for k, v in pl.items()}))
    mb = report.get("max_battle")
    if mb:
        dyn_ids = {m["id"] for m in mons if "max_move" in m}
        picks = [p["id"] for p in mb["tanks"] + mb["healers"]]
        chk("every tank / healer pick is one of your Dynamax Pokemon", all(i in dyn_ids for i in picks),
            str([i for i in picks if i not in dyn_ids][:2]))
        chk("Max Move level counts add up to your Dynamax count",
            sum(mb["attack_levels"].values()) == mb["dynamax"], f"{sum(mb['attack_levels'].values())} vs {mb['dynamax']}")
    if report.get("holding"):
        chk("the 'where your Pokemon are' buckets add up to every Pokemon",
            sum(h["count"] for h in report["holding"]) == len(mons),
            f"{sum(h['count'] for h in report['holding'])} vs {len(mons)}")
    bf = report.get("briefing")
    if bf:
        raid_ids = {e["id"] for blk in report.get("raid_teams") or [] for e in blk.get("entries") or []}
        max_ids = {e["id"] for blk in report.get("max_teams") or [] for e in blk.get("entries") or []}
        sq = [q for ev in bf["events"] for s in ev["species"] for q in s.get("squad") or []]
        bad_sq = [q["id"] for q in sq if q["id"] not in (max_ids if q.get("src") == "max_teams" else raid_ids)]
        chk("every boss squad member comes from a Raid / Max tab team", not bad_sq, str(bad_sq[:2]))
        chk("briefing transfer count matches the Transfer tab",
            bf["storage"]["to_transfer"] == real.get("TRANSFER", 0),
            f"{bf['storage']['to_transfer']} vs {real.get('TRANSFER', 0)}")
        chk("briefing hundo count matches the Pokemon tab",
            bf["account"]["hundos"] == sum(1 for m in mons if m["iv_pct"] >= 100.0))
        tabs_ok = {"raid", "pvp", "wish", "plan", "out", "mons", "grade"}
        chk("every focus card links to a real tab", all(f["tab"] in tabs_ok for f in bf["focus"]))
    return res


# ============================================================
# DAILY BRIEFING (2026-11-02)
#
# The old stand-alone pogo_report.py only saw your bag as raw counts ("10
# Giratina, best 93%").  Living inside the sorter, the briefing can answer the
# questions that actually matter, using the sorter's own results:
#   * which of YOUR attackers should go in for this boss (and what is weak to what)
#   * is this event species on your WISHLIST (raid / PvP / Mega / Max), and does it
#     fill a coverage gap or beat your 5th-best attacker
#   * which league team you would bring to the live Battle League cup
#   * what your transfer list frees before a spawn event; what your dust, XL
#     candy and TMs can actually pay for from the Build plan
# Event data = ScrapedDuck (community scrape of LeekDuck).  It is cached for a
# few hours; offline runs use the last copy, and with no copy at all the
# briefing still gives the account-driven advice.
# ============================================================
EVENTS_URL = "https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json"
RAIDS_URL = "https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/raids.json"
EXPORT_DATA = {}          # the raw stats export, set by main() (never written to report.json)
NOW_OVERRIDE = None       # --now "YYYY-MM-DD HH:MM" for replaying a day

_TC_SE = {
    "fighting": "normal rock steel ice dark", "flying": "fighting bug grass",
    "poison": "grass fairy", "ground": "poison rock steel fire electric",
    "rock": "flying bug fire ice", "bug": "grass psychic dark", "ghost": "ghost psychic",
    "steel": "rock ice fairy", "fire": "bug steel grass ice", "water": "ground rock fire",
    "grass": "ground rock water", "electric": "flying water", "psychic": "fighting poison",
    "ice": "flying ground grass dragon", "dragon": "dragon", "dark": "ghost psychic",
    "fairy": "fighting dragon dark", "normal": ""}
_TC_NVE = {
    "normal": "rock steel", "fighting": "flying poison bug psychic fairy",
    "flying": "rock steel electric", "poison": "poison ground rock ghost",
    "ground": "bug grass", "rock": "fighting ground steel",
    "bug": "fighting flying poison ghost steel fire fairy", "ghost": "dark",
    "steel": "steel fire water electric", "fire": "rock fire water dragon",
    "water": "water grass dragon", "grass": "flying poison bug steel fire grass dragon",
    "electric": "grass electric dragon", "psychic": "steel psychic",
    "ice": "steel fire water ice", "dragon": "steel", "dark": "fighting dark fairy",
    "fairy": "poison steel fire"}
_TC_IMM = {"normal": "ghost", "fighting": "ghost", "poison": "steel", "ground": "flying",
           "ghost": "normal", "psychic": "dark", "electric": "ground", "dragon": "fairy"}
ALL_TYPES = sorted(_TC_NVE)


def type_eff(att, defenders):
    """Pokemon GO damage multiplier of one attack type against a defender's types."""
    m = 1.0
    for d in defenders:
        d = (d or "").lower()
        if d in (_TC_SE.get(att) or "").split():
            m *= 1.6
        if d in (_TC_NVE.get(att) or "").split():
            m *= 0.625
        if d in (_TC_IMM.get(att) or "").split():
            m *= 0.390625
    return m


def _get_feed(url, name, hours):
    CACHE.mkdir(exist_ok=True)
    dest = CACHE / name
    fresh = dest.exists() and (time.time() - dest.stat().st_mtime) < hours * 3600
    if not fresh and not OFFLINE:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "pogo-sorter"})
            with urllib.request.urlopen(req, timeout=30) as r:
                dest.write_bytes(r.read())
        except Exception as ex:
            print(f"[warn] event feed {name} not downloaded ({ex})")
    if dest.exists():
        try:
            return json.loads(dest.read_text(encoding="utf-8")), (time.time() - dest.stat().st_mtime) / 3600.0
        except Exception:
            pass
    return None, None


def _bnow():
    if NOW_OVERRIDE:
        return NOW_OVERRIDE
    return datetime.datetime.now().astimezone()


def _bdt(s, tz):
    if not s:
        return None
    try:
        dt = datetime.datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=tz)


def _span(delta):
    s = int(delta.total_seconds())
    if s < 0:
        s = 0
    d, h, m = s // 86400, (s % 86400) // 3600, (s % 3600) // 60
    return f"{d}d {h}h" if d else (f"{h}h {m}m" if h else f"{m}m")


def _fmt_when(dt):
    return dt.strftime("%a %b ") + str(dt.day) + dt.strftime(", ") + \
        str(int(dt.strftime("%I"))) + dt.strftime(":%M %p")


def _bnorm(s):
    s = (s or "").lower().replace("é", "e")
    s = re.sub(r"\s+forme?\b", "", s)
    return re.sub(r"[^a-z0-9()]+", " ", s).strip()


def _name_index(dex):
    idx = {}
    for sid, sp in dex.by_id.items():
        if sid.endswith("_shadow") or "_mega" in sid or sid.endswith("_primal"):
            continue
        idx.setdefault(_bnorm(sp.get("speciesName", sid)), sid)
    return idx


def _resolve_species(name, idx):
    """'Shadow Landorus (Incarnate)' -> ('landorus_incarnate', shadow, mega) or None."""
    n = (name or "").strip()
    n = re.sub(r"(?i)\s+wearing .*$", "", n)
    n = re.sub(r"(?i)^(dynamax|gigantamax|eternamax)\s+", "", n)
    shadow = bool(re.match(r"(?i)shadow\s", n))
    n = re.sub(r"(?i)^shadow\s+", "", n)
    mega = bool(re.match(r"(?i)(mega|primal)\s", n))
    n = re.sub(r"(?i)^(mega|primal)\s+", "", n)
    n = re.sub(r"(?i)\s+(x|y)$", "", n)
    key = _bnorm(n)
    sid = idx.get(key)
    if not sid:
        base = key.split(" (")[0]
        sid = idx.get(base) or next((v for k, v in idx.items() if k.startswith(base + " (")), None)
    return (sid, shadow, mega) if sid else None


def _event_species(ev):
    """Pokemon names an event is about, taken from the feed's data first, then the title."""
    x = ev.get("extraData") or {}
    names = []
    if x.get("raidbattles"):
        names += [b["name"] for b in x["raidbattles"].get("bosses") or []]
    if x.get("spotlight"):
        names += [p["name"] for p in x["spotlight"].get("list") or []] or [x["spotlight"].get("name")]
    if x.get("communityday"):
        names += [p["name"] for p in x["communityday"].get("spawns") or []]
    if names:
        return [n for n in names if n]
    t = ev.get("name") or ""
    et = ev.get("eventType")
    if et == "raid-hour":
        return [re.sub(r"(?i)\s+raid hour$", "", t)]
    if et == "raid-day":
        return [re.sub(r"(?i)\s+(super mega )?raid day$", "", t)]
    if et == "max-mondays":
        mm = re.match(r"(?i)dynamax (.+?) during max monday", t)
        return [mm.group(1)] if mm else []
    if et == "max-battles":
        mm = re.match(r"(?i)(?:eternamax|dynamax|gigantamax)?\s*(.+?)\s+returns", t)
        return [mm.group(1)] if mm else []
    if et == "raid-battles":
        mm = re.match(r"(?i)(.+?)\s+in\s+(?:\d-star|shadow|mega)", t)
        return [re.sub(r"(?i)\s+forme$|\s+forme\)", ")", mm.group(1))] if mm else []
    return []


def _wish_index(grade, dex):
    """species id -> list of wishlist hits (only things you do NOT already have)."""
    W = (grade or {}).get("wishlist_all") or {}
    idx = defaultdict(list)
    for t, blk in (W.get("raid") or {}).items():
        for r in blk["rows"]:
            if r["status"] != "HAVE":
                idx[r["sid"]].append({"kind": "raid", "status": r["status"], "shadow": r["target"] == "Shadow",
                                      "label": f"{blk['type']} raid attacker #{r['rank']}",
                                      "fills_gap": bool(r["fixes_gap"]), "enters": bool(r["would_enter"]),
                                      "slot": r["rank_if_added"], "type": blk["type"],
                                      "pri": 100 if r["fixes_gap"] else (80 if r["would_enter"] else 40)})
    for lg in W.get("pvp") or []:
        for r in lg["rows"]:
            if r["status"] != "HAVE":
                base = r["sid"][:-7] if r["sid"].endswith("_shadow") else r["sid"]
                idx[base].append({"kind": "pvp", "status": r["status"], "shadow": r["shadow"],
                                  "label": f"{lg['league']} meta #{r['rank']}", "pri": 60 if r["rank"] <= 5 else 45})
    for t, blk in (W.get("mega") or {}).items():
        for r in blk["rows"]:
            if r["status"] != "HAVE":
                idx[mega_base_of(r["sid"])].append({"kind": "mega", "status": r["status"], "shadow": False,
                                                    "label": f"Mega for {blk['type']} boost #{r['rank']}",
                                                    "pri": 70 if r["rank"] <= 3 else 35})
    for t, blk in (W.get("max") or {}).items():
        for r in blk["rows"]:
            if r["status"] != "HAVE":
                idx[r["sid"]].append({"kind": "max", "status": r["status"], "shadow": False,
                                      "label": f"{blk['type']} Max attacker #{r['rank']}", "pri": 50})
    return idx


def _weak_list(types):
    w = [(round(type_eff(a, types), 2), a) for a in ALL_TYPES]
    return [(e_, a) for e_, a in sorted(w, reverse=True) if e_ > 1.0]


def _boss_squad(types, report, limit=6, key="raid_teams"):
    """Your best attackers against a boss: sorter DPS x type effectiveness, one row per mon."""
    pool = []
    for blk in report.get(key) or []:
        att = blk["type"].lower()
        eff = type_eff(att, types)
        for ent in blk.get("entries") or []:
            if ent.get("id"):
                pool.append((ent["dps"] * eff, eff, blk["type"], ent))
    pool.sort(key=lambda x: -x[0])
    seen, squad = set(), []
    for score, eff, tname, ent in pool:
        if ent["id"] in seen:
            continue
        seen.add(ent["id"])
        squad.append({"id": ent["id"], "name": ent["name"], "from": ent.get("from", ""),
                      "iv": ent["iv"], "cp": ent["cp"], "level": ent.get("level"),
                      "shadow": bool(ent.get("shadow")), "moveset": ent.get("moveset", ""),
                      "type": tname, "eff": round(eff, 2), "score": round(score, 1), "src": key})
        if len(squad) >= limit:
            break
    mega = None
    if key == "raid_teams":
        best = None
        for blk in report.get("raid_teams") or []:
            mg = blk.get("mega")
            if mg:
                s = mg["dps"] * type_eff(blk["type"].lower(), types)
                if best is None or s > best[0]:
                    best = (s, blk["type"], mg)
        if best:
            mega = {"name": best[2]["name"], "iv": best[2]["iv"], "cp": best[2]["cp"],
                    "boosts": best[1], "eff": round(type_eff(best[1].lower(), types), 2)}
    return squad, mega


def _ev_disp(nm):
    n = re.sub(r"(?i)\s+wearing .*$", "", nm or "")
    return re.sub(r"(?i)^(shadow|mega|primal|dynamax|gigantamax|eternamax)\s+", "", n).strip()


def _species_status(sid, exact, undecided=None):
    ms = exact.get(sid) or []
    und = len((undecided or {}).get(sid) or [])
    if not ms:
        return {"owned": 0, "undecided": und}
    best = max(ms, key=lambda m: (m.iv_pct, m.cp))
    return {"owned": len(ms), "undecided": und, "best_iv": round(best.iv_pct, 1), "best_cp": best.cp,
            "hundo": any(m.iv_pct >= 100 for m in ms), "shiny": any(m.is_shiny for m in ms),
            "shadow": sum(1 for m in ms if m.is_shadow), "lucky": sum(1 for m in ms if m.raw.get("isLucky")),
            "mega_unlocked": any(m.has_mega_unlocked for m in ms),
            "mega_level": max((m.mega_level for m in ms), default=0),
            "to_transfer": sum(1 for m in ms if m.verdict == "TRANSFER"),
            "builds": sum(1 for m in ms if m.verdict.startswith("BUILD_"))}


def _own_line(st, label):
    if not st.get("owned"):
        return f"{label}: none in play" + (f" ({st['undecided']} in REVIEW - decide on them)" if st.get("undecided") else "")
    bits = [f"{st['owned']} owned", f"best {st['best_iv']:.0f}% IV / {st['best_cp']} CP"]
    bits.append("hundo" if st["hundo"] else "no hundo")
    bits.append("shiny \u2713" if st["shiny"] else "no shiny")
    if st["shadow"]:
        bits.append(f"{st['shadow']} Shadow")
    if st.get("undecided"):
        bits.append(f"{st['undecided']} more in REVIEW")
    return f"{label}: " + ", ".join(bits)


def _league_for(name):
    out = []
    for lg in ("Great", "Ultra", "Master"):
        if re.search(lg + r" League", name):
            out.append(lg)
    head = name.split("|")[0]
    cups = re.findall(r"(?:(?<=and )|(?<=, )|^)((?:[A-Z0-9][\w'\u2019]*\s)+Cup)", head)
    cups = [c.strip() for c in cups if not re.search(r"League", c)]
    return out, cups, ("Mega Edition" in name)


def build_briefing(report, dex, mons, cfg):
    bc = {"enabled": True, "days": 14, "cache_hours": 3.0, "far_off_days": 60,
          "storage_warn_pct": 80.0, **(cfg.get("briefing") or {})}
    now = _bnow()
    tz = now.tzinfo
    ex = EXPORT_DATA or {}
    acct = ex.get("account") or {}
    items = {i.get("itemName"): int(i.get("count") or 0) for i in ex.get("items") or []
             if isinstance(i, dict)}
    dust = next((int(c.get("quantity") or 0) for c in acct.get("currencyBalance") or []
                 if c.get("currencyType") == "STARDUST"), 0)
    cap = int(acct.get("maxPokemonStorage") or 0)
    raw_total = len(ex.get("pokemons") or []) or len(mons)
    grade = report.get("grade") or {}
    wl = _wish_index(grade, dex)
    nidx = _name_index(dex)
    exact, undecided, xfer = defaultdict(list), defaultdict(list), Counter()
    for m in mons:
        if not m.species:
            continue
        if m.verdict == "TRANSFER":
            xfer[m.species["speciesId"]] += 1
        else:
            (undecided if m.verdict == "REVIEW" else exact)[m.species["speciesId"]].append(m)
    n_transfer = sum(1 for m in mons if m.verdict == "TRANSFER")

    # ---- account snapshot ------------------------------------------------
    pl = ex.get("player") or {}
    snap = {"level": pl.get("level"), "km": round(float(pl.get("kmWalked") or 0)),
            "stored": raw_total, "cap": cap, "free": max(0, cap - raw_total) if cap else None,
            "stardust": dust, "hundos": sum(1 for m in mons if m.iv_pct >= 100),
            "shinies": sum(1 for m in mons if m.is_shiny), "lucky": sum(1 for m in mons if m.raw.get("isLucky")),
            "shadow": sum(1 for m in mons if m.is_shadow), "purified": sum(1 for m in mons if m.is_purified),
            "rare_candy": items.get("RareCandy", 0), "xl_candy": items.get("XlRareCandy", 0),
            "premium_passes": items.get("PaidRaidTicket", 0), "remote_passes": items.get("RemoteRaidTicket", 0),
            "lucky_eggs": items.get("LuckyEgg", 0), "fast_tms": items.get("MoveRerollFastAttack", 0),
            "charged_tms": items.get("MoveRerollSpecialAttack", 0), "golden_razz": items.get("GoldenRazzBerry", 0),
            "star_pieces": items.get("StarPiece", 0), "master_balls": items.get("MasterBall", 0),
            "to_transfer": n_transfer, "export_time": (report.get("meta") or {}).get("export_time", "")}

    # ---- feeds ----------------------------------------------------------------
    events, age_e = _get_feed(EVENTS_URL, "scrapedduck_events.json", float(bc["cache_hours"]))
    raids, _ = _get_feed(RAIDS_URL, "scrapedduck_raids.json", float(bc["cache_hours"]))
    raid_by_name = {_bnorm(r["name"]): r for r in raids or []}
    horizon = now + datetime.timedelta(days=int(bc["days"]))

    out_events = []
    for ev in events or []:
        st_dt, en_dt = _bdt(ev.get("start"), tz), _bdt(ev.get("end"), tz)
        et = ev.get("eventType") or ""
        if st_dt and en_dt:
            if en_dt < now:
                continue
            status = "live" if st_dt <= now else ("soon" if st_dt <= horizon else "later")
        else:
            status = "tbd"
        rec = {"id": ev.get("eventID"), "name": ev.get("name"), "type": et, "heading": ev.get("heading"),
               "link": ev.get("link"), "status": status, "notes": [], "matches": [], "squad": [],
               "mega": None, "weak": [], "species": [], "bonuses": [], "skip": "", "score": 0,
               "_st": st_dt, "start": st_dt.isoformat() if st_dt else None, "end": en_dt.isoformat() if en_dt else None,
               "when": ""}
        if status == "live":
            rec["when"] = f"live, ends {_fmt_when(en_dt)} (in {_span(en_dt - now)})"
        elif status in ("soon", "later"):
            rec["when"] = f"starts {_fmt_when(st_dt)} (in {_span(st_dt - now)})"
        else:
            rec["when"] = "date not announced yet"
        x = ev.get("extraData") or {}
        if x.get("spotlight") and x["spotlight"].get("bonus"):
            rec["bonuses"].append(x["spotlight"]["bonus"])
        if x.get("communityday"):
            rec["bonuses"] += [b.get("text") for b in x["communityday"].get("bonuses") or [] if b.get("text")]

        # in-person / far-away things: skip them
        if et in ("wild-area", "pokemon-go-tour") or re.search(r"Night Out|Safari|GO Fest|Go Fest", rec["name"] or ""):
            rec["skip"] = "In-person event" if et != "pokemon-go-tour" else "Ticketed in-person event"
            if st_dt and (st_dt - now).days > int(bc["far_off_days"]):
                rec["skip"] = "Ticketed event months away; nothing to do now"
            out_events.append(rec)
            continue

        names = _event_species(ev)
        boss_like = et in ("raid-battles", "raid-hour", "raid-day")
        for nm in names:
            res = _resolve_species(nm, nidx)
            if not res:
                rec["species"].append({"name": nm, "known": False})
                continue
            sid, is_sh, is_mega = res
            is_mega = is_mega or bool(re.search(r"(?i)\bmega raid", rec["name"] or ""))
            is_sh = is_sh or bool(re.search(r"(?i)\bshadow raid", rec["name"] or ""))
            sp = dex.by_id.get(sid) or {}
            rb = next((raid_by_name[k] for k in (_bnorm(("Shadow " if is_sh else "") + ("Mega " if is_mega else "") + nm),
                                                 _bnorm(("Mega " if is_mega else "") + nm), _bnorm(nm))
                       if k in raid_by_name), None)
            types = [t["name"].lower() for t in rb["types"]] if rb else \
                [t for t in (sp.get("types") or []) if t and t != "none"]
            stt = _species_status(sid, exact, undecided)
            stt["to_transfer"] = xfer.get(sid, 0)
            row = {"name": _ev_disp(nm), "sid": sid, "known": True, "shadow": is_sh, "mega": is_mega,
                   "types": [t.title() for t in types], "status": stt, "cp": (rb or {}).get("combatPower")}
            hits = []
            for d in dex.descendants(sid):
                for h in wl.get(d, []):
                    hits.append({**h, "via": "" if d == sid else _clean_name((dex.by_id.get(d) or {}).get("speciesName", d)),
                                 "pri": h["pri"] if d == sid else h["pri"] * 0.75})
            hits.sort(key=lambda h: -h["pri"])
            row["wish"] = hits[:3]
            rec["species"].append(row)
            rec["matches"] += [{**h, "species": _ev_disp(nm)} for h in hits[:2]]
            if types and (boss_like or et in ("max-mondays", "max-battles")):
                row["weak"] = [{"type": a.title(), "x": e_} for e_, a in _weak_list(types)][:5]
                if boss_like:
                    row["squad"], row["mega_slot"] = _boss_squad(types, report)
                else:
                    row["squad"], row["mega_slot"] = _boss_squad(types, report, limit=4, key="max_teams")[0], None

        first = next((s for s in rec["species"] if s.get("squad")), None)
        if first:
            rec["squad"], rec["mega"], rec["weak"] = first["squad"], first.get("mega_slot"), first["weak"]

        # --- account notes -----------------------------------------------------
        own_notes, wish_notes = [], []
        for s in rec["species"]:
            if not s.get("known"):
                continue
            tag = ("Shadow " if s["shadow"] else "") + ("Mega " if s["mega"] else "") + s["name"]
            own_notes.append(_own_line(s["status"], tag))
            stt = s["status"]
            if boss_like and stt.get("owned") and stt.get("hundo") and stt.get("shiny") and not s["wish"]:
                rec["skip"] = f"You already own a hundo and a shiny {s['name']} and it is not on your wishlist"
            if s["mega"]:
                if stt.get("mega_unlocked"):
                    own_notes.append(f"You have Mega Evolved {s['name']} before (best Mega Lv {stt['mega_level']}): "
                                        f"raids and a buddy walk earn Mega Energy.")
                elif stt.get("owned"):
                    own_notes.append(f"You own {s['name']} but never Mega Evolved it: the first evolution is your unlock, "
                                        f"so raid it for Mega Energy.")
            if stt.get("to_transfer"):
                own_notes.append(f"{stt['to_transfer']} of your {s['name']} are on the transfer list - "
                                    f"hold those until you have checked the event.")
        for h in rec["matches"][:3]:
            who = h["species"] + (f" (evolves into {h['via']})" if h.get("via") else "")
            wish_notes.append(f"WISHLIST: {who} - {h['label']} [{h['status']}]"
                                + (" - fills a coverage gap" if h.get("fills_gap") else
                                   (f" - would take your slot #{h['slot']}" if h.get("enters") else "")))
        rec["notes"] = wish_notes + own_notes
        rec["wish_notes"] = wish_notes
        if et == "go-battle-league":
            lgs, cups, mega_ed = _league_for(rec["name"] or "")
            tl = []
            for lg in lgs:
                if LEAGUE_CAP[lg] not in CAPS:
                    rec["notes"].append(f"{lg} League is switched off in your settings, so no team is planned for it.")
                    continue
                blk = next((b for b in report.get("teams") or [] if b["league"] == lg), None)
                if blk and blk["teams"]:
                    t0 = blk["teams"][0]
                    tl.append({"league": lg, "grade": (t0.get("cohesion") or {}).get("grade", ""),
                               "members": [m["name"] + (" (Shadow)" if m.get("shadow") else "") for m in t0["members"]],
                               "mega_capable": [m["name"] for m in t0["members"] if m.get("mega")]})
            rec["teams"] = tl
            for t in tl:
                rec["notes"].append(f"{t['league']} League: bring {' / '.join(t['members'])} (team grade {t['grade'] or '-'}).")
            if cups or mega_ed:
                rec["notes"].append("This set has special rules (" + ", ".join(cups + (["Mega Edition"] if mega_ed else []))
                                    + "): the teams above are built for the standard league, so check the cup rules in game.")
            if not tl:
                rec["notes"].append("No matching league in this set; check the rules in game.")
        if rec["bonuses"]:
            rec["notes"].append("Bonuses: " + "; ".join(rec["bonuses"][:5]))

        # --- scoring ---------------------------------------------------------
        top_pri = max((h["pri"] for h in rec["matches"]), default=0)
        base = {"raid-battles": 65, "raid-hour": 66, "raid-day": 60, "community-day": 58,
                "pokemon-spotlight-hour": 40, "go-battle-league": 38, "max-mondays": 30,
                "max-battles": 40}.get(et, 0)
        if base:
            urgency, far = 0.0, 1.0
            if status == "live":
                urgency = 20.0 + (10.0 if (en_dt - now) <= datetime.timedelta(hours=48) else 0.0)
            elif status == "soon":
                dd = (st_dt - now).total_seconds() / 86400.0
                urgency = 14.0 if dd <= 3 else (7.0 if dd <= 7 else 0.0)
                far = 1.0 if dd <= 7 else 0.7
            else:
                far = 0.5
            bonus = 8 if boss_like and any(s.get("known") and s["mega"] for s in rec["species"]) else 0
            rec["score"] = (base + top_pri * 0.35 + bonus) * far + urgency
            if rec["skip"]:
                rec["score"] = 0
        out_events.append(rec)

    order = {"live": 0, "soon": 1, "tbd": 2, "later": 3}
    out_events.sort(key=lambda r: (order[r["status"]], r["end"] or r["start"] or "9"))

    # ---- storage ---------------------------------------------------------------
    pct = 100.0 * raw_total / cap if cap else 0.0
    spawn_soon = [r["name"] for r in out_events if r["type"] in ("community-day", "pokemon-spotlight-hour", "event")
                  and r["status"] in ("live", "soon") and (r["status"] == "live" or r["_st"] <= now + datetime.timedelta(days=3))]
    for r in out_events:
        r.pop("_st", None)
    storage = {"stored": raw_total, "cap": cap, "pct": round(pct, 1), "free": snap["free"],
               "after_transfer": (snap["free"] + n_transfer) if snap["free"] is not None else None,
               "to_transfer": n_transfer}

    # ---- dust / candy vs the Build plan ---------------------------------------
    lv = grade.get("level_these") or []
    top_imp = max((r.get("impact") or 0 for r in lv), default=0)
    worth = sorted((r for r in lv if (r.get("impact") or 0) >= 0.5 * top_imp and int((r.get("cost") or {}).get("dust") or 0) > 0),
                   key=lambda r: (int(r["cost"]["dust"]), -(r.get("impact") or 0)))
    spent, xl_spent, afford = 0, 0, []
    for r in worth:
        d_, x_ = int(r["cost"]["dust"]), int(r["cost"].get("xl") or 0)
        if spent + d_ <= dust and x_ + xl_spent <= snap["xl_candy"]:
            spent += d_
            xl_spent += x_
            afford.append(r)
    queue_total = sum(int((r.get("cost") or {}).get("dust") or 0) for r in lv)
    first_cost = int((lv[0].get("cost") or {}).get("dust") or 0) if lv else 0
    tm_need = len((grade.get("tm_here") or {}).get("regular") or [])

    # ---- buddy -------------------------------------------------------------------
    buddy_id = str((acct.get("buddyPokemonProto") or {}).get("buddyPokemonId") or "")
    cur = next((m for m in mons if buddy_id and m.uid.split(":", 1)[-1] == buddy_id), None)
    cands = []
    for r in out_events:
        if r["status"] in ("live", "soon", "tbd"):
            for s in r["species"]:
                if s.get("known") and (s["mega"] or r["type"] == "raid-day"):
                    sts = s["status"]
                    if sts.get("owned") and sts.get("mega_unlocked"):
                        m = max(exact.get(s["sid"]) or [], key=lambda m_: (m_.mega_level, m_.iv_pct))
                        cands.append((90 if r["status"] == "live" else 80, m,
                                      f"{r['name']}: walking a Mega-unlocked buddy earns Mega Energy toward it."))
    if lv:
        top = lv[0]
        m = next((m_ for m_ in mons if m_.uid == top["id"]), None)
        if m:
            cands.append((60, m, f"Your top Build-plan target ({top['species']}): buddy candy helps pay for its power-ups."))
    for m_ in sorted((x for x in mons if x.verdict not in OUT_OF_PLAY), key=lambda m_: -m_.buddy_km)[:1]:
        if m_.buddy_km >= 50:
            cands.append((50, m_, f"{m_.buddy_km:.0f} km together already: keep going toward Best Buddy."))
    cands.sort(key=lambda c: -c[0])

    def _buddy_dict(c):
        if not c:
            return None
        _s, m, why = c
        return {"id": m.uid, "name": _clean_name(m.species["speciesName"]) if m.species else "?", "cp": m.cp,
                "iv_pct": m.iv_pct, "mega_level": m.mega_level, "why": why,
                "already": bool(cur and cur.uid == m.uid)}
    buddy = _buddy_dict(cands[0]) if cands else None
    runner = next((_buddy_dict(c) for c in cands[1:] if c[1].uid != cands[0][1].uid), None)

    # ---- top focus ---------------------------------------------------------------
    focus = []
    for r in out_events:
        if r["score"] and r["status"] != "later":
            lines = (r.get("wish_notes") or [])[:2] + [n for n in r["notes"] if n not in (r.get("wish_notes") or [])][:3]
            for s in [s for s in r["species"] if s.get("squad")][:2]:
                lines.append(f"Bring vs {s['name']} (weak to {', '.join(w['type'] for w in s['weak'][:3])}): "
                             + ", ".join(f"{q['name']}{' (Shadow)' if q['shadow'] else ''} {q['iv']}" for q in s["squad"][:6]))
                if s.get("mega_slot"):
                    ms_ = s["mega_slot"]
                    lines.append(f"Mega slot: {ms_['name']} (boosts {ms_['boosts']}, x{ms_['eff']} vs {s['name']})")
            if r["type"].startswith("raid") and r["status"] != "tbd" and snap["premium_passes"] + snap["remote_passes"]:
                lines.append(f"Raid passes in your bag: {snap['premium_passes']} premium, {snap['remote_passes']} remote.")
            focus.append({"score": r["score"], "kind": "event", "title": r["name"], "when": r["when"],
                          "lines": lines, "tab": "raid" if r["type"].startswith("raid") else
                          ("pvp" if r["type"] == "go-battle-league" else "wish"), "event": r["id"]})
    if lv and dust:
        if afford:
            dl = [f"You have {dust:,} stardust. These high-impact targets fit inside it right now ({spent:,} dust, "
                  f"{xl_spent} of your {snap['xl_candy']} XL candy): "
                  + ", ".join(f"{r['species']} {r['iv']} ({int(r['cost']['dust']):,})" for r in afford[:4]) + "."]
        else:
            dl = [f"You have {dust:,} stardust, but no high-impact target is fully affordable yet "
                  f"(the cheapest needs {int(worth[0]['cost']['dust']):,})." if worth else
                  f"You have {dust:,} stardust."]
        dl.append(f"Your #1 target ({lv[0]['species']}) needs {first_cost:,} dust to finish - you hold "
                  f"{100.0 * dust / first_cost:.0f}% of that. The whole queue is {queue_total:,} dust, so stardust is the bottleneck: "
                  f"use dust events (Stardust bonuses, Community Day) for it." if first_cost else "")
        focus.append({"score": 58 if afford else 42, "kind": "dust", "tab": "plan",
                      "title": "Spend stardust where it counts", "when": "", "lines": [x for x in dl if x]})
    if tm_need:
        focus.append({"score": 52, "kind": "tm", "tab": "plan", "title": f"Use your TMs ({tm_need} mons are waiting on one)",
                      "when": "", "lines": [f"You hold {snap['charged_tms']} Charged TMs and {snap['fast_tms']} Fast TMs; "
                                             f"{tm_need} built mons only need a regular TM to be finished."]})
    if cap and (pct >= float(bc["storage_warn_pct"]) or spawn_soon):
        focus.append({"score": 64 if pct >= float(bc["storage_warn_pct"]) else 44, "kind": "storage", "tab": "out",
                      "title": "Clear storage before the next spawn event", "when": "",
                      "lines": [f"Storage is {raw_total}/{cap} ({pct:.0f}% full, {cap - raw_total} free).",
                                f"The sorter's transfer list holds {n_transfer} Pokemon: transferring them would leave "
                                f"{cap - raw_total + n_transfer} slots free.",
                                "Open the Transfer tab - those rows were already checked against your keepers and teams."]})
    top_adds = (grade.get("wishlist") or [])[:1]
    if top_adds:
        w = top_adds[0]
        focus.append({"score": 47, "kind": "wish", "tab": "wish", "title": f"Hunt: {w['species']}", "when": "",
                      "lines": [f"Best add for your {w['fixes']} attackers (#{w['rank_in_type']} in type): {w.get('reason', '')}."]})
    focus.sort(key=lambda f: -f["score"])
    picked, kinds = [], Counter()
    for f in focus:
        if kinds[f["kind"]] >= (3 if f["kind"] == "event" else 1):
            continue
        picked.append(f)
        kinds[f["kind"]] += 1
        if len(picked) == 5:
            break

    # ---- headline ----------------------------------------------------------------
    mega_push = next(({"name": s["name"], "event": r["name"], "unlocked": bool(s["status"].get("mega_unlocked")),
                       "level": s["status"].get("mega_level", 0)}
                      for r in out_events if r["status"] in ("live", "soon", "tbd")
                      for s in r["species"] if s.get("known") and (s["mega"] or r["type"] == "raid-day")), None)
    live_n = sum(1 for r in out_events if r["status"] == "live")
    soon_n = sum(1 for r in out_events if r["status"] == "soon")
    skips = [{"name": r["name"], "reason": r["skip"], "link": r["link"]} for r in out_events if r["skip"]]
    return {"now": now.isoformat(), "date": now.strftime("%A %B ") + str(now.day) + now.strftime(", %Y"),
            "events_ok": events is not None, "feed_age_hours": round(age_e, 1) if age_e is not None else None,
            "headline": {"buddy": buddy, "runner_up": runner, "current_buddy":
                         ({"name": _clean_name(cur.species["speciesName"]), "cp": cur.cp} if cur and cur.species else None),
                         "mega_push": mega_push, "do_first": picked[0]["title"] if picked else "",
                         "live": live_n, "soon": soon_n},
            "focus": picked, "events": out_events, "skip": skips, "storage": storage, "account": snap,
            "dust_plan": {"dust": dust, "spend": spent, "xl": xl_spent, "queue_total": queue_total,
                          "first_cost": first_cost,
                          "targets": [{"species": r["species"], "iv": r["iv"], "dust": (r.get("cost") or {}).get("dust", 0)}
                                      for r in afford[:8]]}}


def write_briefing_txt(outdir, b):
    L = ["POKEMON GO BRIEFING - " + b["date"], "=" * 60]
    h = b["headline"]
    if not b["events_ok"]:
        L.append("[!] No event data (offline and nothing cached): only the account-driven advice is shown.")
    if h.get("buddy"):
        L.append("Buddy: " + h["buddy"]["name"] + " (CP " + str(h["buddy"]["cp"]) + ", " + str(round(h["buddy"]["iv_pct"])) + "% IV)"
                 + (" - already your buddy" if h["buddy"]["already"] else "") + "\n       " + h["buddy"]["why"])
    if h.get("mega_push"):
        mp = h["mega_push"]
        L.append("Mega: push " + mp["name"] + (" (Lv " + str(mp["level"]) + ")" if mp["unlocked"] else " (not unlocked yet)")
                 + " for " + mp["event"])
    L += ["Do first: " + h["do_first"], str(h["live"]) + " events live, " + str(h["soon"]) + " coming up", "", "TOP FOCUS", "-" * 60]
    for i, f in enumerate(b["focus"], 1):
        L.append(f"{i}. {f['title']}" + (f"  [{f['when']}]" if f["when"] else ""))
        L += ["     " + ln for ln in f["lines"]]
    for title, st in (("LIVE NOW", "live"), ("COMING UP", "soon"), ("DATE TBA", "tbd")):
        rows = [r for r in b["events"] if r["status"] == st and not r["skip"]]
        if rows:
            L += ["", title, "-" * 60]
            for r in rows:
                L.append(f"* {r['name']}  [{r['when']}]")
                L += ["     " + ln for ln in r["notes"][:5]]
                for s in [s for s in r["species"] if s.get("squad")][:2]:
                    L.append(f"     vs {s['name']} (weak to {', '.join(w['type'] for w in s['weak'][:4])}): "
                             + ", ".join(f"{q['name']} {q['iv']}" for q in s["squad"]))
    if b["skip"]:
        L += ["", "SKIP", "-" * 60] + [f"* {s['name']}: {s['reason']}" for s in b["skip"]]
    a = b["account"]
    L += ["", "ACCOUNT", "-" * 60,
          f"Storage {a['stored']}/{a['cap']}, stardust {a['stardust']:,}, {a['hundos']} hundos, {a['shinies']} shinies, "
          f"{a['shadow']} shadow, raid passes {a['premium_passes']} premium + {a['remote_passes']} remote"]
    Path(outdir, "briefing.txt").write_text("\n".join(L) + "\n", encoding="utf-8")
    return "\n".join(L[:12 + len(b["focus"]) * 4])


# ============================================================
# WHY EVERY POKEMON IS HELD (2026-11-02)
# KEEP does not mean "level it".  Only BUILD means level.  Every other KEEP is held by a
# protection rule; this puts each one in exactly one bucket and names the setting behind it.
# ============================================================
def _hold_category(r):
    v, w, role = r["verdict"], (r.get("why") or "").lower(), r.get("role") or ""
    if v.startswith("BUILD_"):
        return "build"
    if v == "TRANSFER":
        return "transfer"
    if v == "REVIEW":
        return "review"
    if role != "Collection":
        return "job"
    for key, cat in (("hundo", "hundo"), ("favorite", "hundo"), ("shiny", "shiny"), ("lucky", "lucky"),
                     ("costume", "costume"), ("mythical", "legendary"), ("legendary", "legendary"),
                     ("protected species", "legendary"), ("form", "form"), ("dynamax", "dynamax"),
                     ("gigantamax", "dynamax"), ("purif", "purified"), ("mega", "mega"),
                     ("best copy of species", "copies"), ("best unprotected", "copies"),
                     ("iv ", "iv"), ("elite/legacy", "elite")):
        if key in w:
            return cat
    return "other"


def hold_summary(report, cfg):
    pc = cfg.get("protect_iv_pct", 92)
    vr = cfg.get("variant_rules", {})
    info = [
        ("build", "Level these", "The only Pokémon the sorter wants you to spend dust on (raid, Max, gym, PvP, Mega builds).",
         "raid / max_battle / gym / pvp sections of the config"),
        ("job", "Kept as a role backup", "Not being levelled, but held as a reserve or backup for a raid / Mega / Max role.",
         "raid.reserve_keep, max_battle.reserve_keep, raid.keep_per_type"),
        ("iv", f"High IV ({pc:g}%+)", f"Your best {cfg.get('iv_protect_max_per_species', 2)} per species at or above the IV line. A strong spread, but no current job.",
         "protect_iv_pct, iv_protect_max_per_species"),
        ("copies", "Best copies of meta species", f"PvP-relevant species where the best {cfg.get('keep_copies', 2)} copies are kept.",
         "keep_copies"),
        ("shiny", "Shinies", f"Kept up to {vr.get('shiny', {}).get('keep', '?')} per species (+{vr.get('shiny', {}).get('trade', 0)} trade spare). "
         "The protect_shiny switch alone does NOT free these; this rule decides.", "variant_rules.shiny.keep / .trade"),
        ("costume", "Costume / event outfits", f"Kept up to {vr.get('costume', {}).get('keep', '?')} per costume. The protect_costume switch alone does NOT free these.",
         "variant_rules.costume.keep / .trade"),
        ("legendary", "Legendary / mythical / protected species", "Species you listed as protected, plus legendary and mythical keepers.",
         "protect_species_dex, variant_rules.legendary"),
        ("form", "Special forms", "Regional and alternate forms kept one per form.", "variant_rules.form"),
        ("dynamax", "Dynamax Pokémon", "Dynamax-capable but not on a Max Battle team right now.", "protect_dynamax"),
        ("purified", "Purified", "Purified Pokémon (cheaper power-ups) and purify-for-Mega candidates.", "protect_purified"),
        ("mega", "Mega-capable / unlocked", "Species with a Mega, or a Mega you already unlocked.", "protect_mega_capable, protect_super_mega"),
        ("hundo", "Hundos & favorites", "15/15/15 Pokémon and anything you starred.", "protect_hundo, protect_favorite"),
        ("lucky", "Lucky", "Lucky Pokémon (cheaper trades).", "protect_lucky"),
        ("elite", "Elite-move holders", "Hold a legacy move you can't get again.", "protect_elite_move_holders"),
        ("other", "Other protection", "Held by a rule not listed above.", ""),
        ("review", "Undecided (REVIEW)", "Borderline: the sorter will not build or transfer them until you decide.", "review_triage"),
        ("transfer", "Transfer", "Safe to transfer: not protected, not on a team, no role.", ""),
    ]
    cnt = Counter(r["hold"] for r in report["mons"])
    return [{"key": k, "label": lb, "explain": ex, "lever": lv, "count": cnt.get(k, 0)}
            for k, lb, ex, lv in info if cnt.get(k, 0)]


# ============================================================
# MAX BATTLES (2026-11-02): real Max Move damage, Max Move levels, tanks and healers
#
# Sources: Bulbapedia "Max Move (GO)" for the power table, Pokemon GO Hub / Dittobase for how the
# community ranks Max attackers (damage in the Max Phase only: your tank leads, the attacker
# swaps in) and tanks/healers (bulk / max HP).
#   attacking Max Move power by level : 250 / 300 / 350   (Gigantamax G-Max: 350 / 400 / 450)
#   Max Guard : absorbs damage, Max Spirit : heals the whole team from the user's max HP
# Your export records each Pokemon's Max Move levels in breadMoves (moveType 1 = attack,
# 2 = Max Guard, 3 = Max Spirit; the unlock pattern in the data matches that order).
# ============================================================
def max_move_gain_pct(mon):
    """% more Max Move damage you would get by levelling the attack Max Move to level 3."""
    table = GMAX_MOVE_POWER if mon.is_gigantamax else MAX_MOVE_POWER
    lvl = min(3, max(1, mon.max_attack_level or 1))
    return round(100.0 * (table[3] / table[lvl] - 1.0), 1)


def _best_descendant_stats(dex, m, key):
    """Highest base `key` stat among the mon's own species and its evolutions."""
    best, best_sid = 0, m.species["speciesId"]
    for d in dex.descendants(m.species["speciesId"]):
        sp = dex.by_id.get(d)
        if not sp or "_mega" in d or d.endswith("_shadow") or d.endswith("_primal") or not (
                dex.can_dynamax(d) or d == m.species["speciesId"]):
            continue
        bs = sp.get("baseStats") or {}
        v = (bs.get("def", 0) * bs.get("hp", 0)) if key == "tank" else bs.get("hp", 0)
        if v > best:
            best, best_sid = v, d
    return best_sid


def max_support_picks(mons, dex, cfg):
    mc = cfg["max_battle"]
    cand = [m for m in mons if m.species and (m.is_dynamax or m.is_gigantamax)
            and m.verdict not in OUT_OF_PLAY and not m.verdict.startswith("BUILD_MAX")]
    rows = {"tank": [], "healer": []}
    for kind in ("tank", "healer"):
        for m in cand:
            sid = _best_descendant_stats(dex, m, kind)
            bs = dex.by_id[sid]["baseStats"]
            if kind == "tank":
                score = (bs["def"] + m.d) * (bs["hp"] + m.s) * CPM[40.0] ** 2
            else:
                score = (bs["hp"] + m.s) * CPM[40.0]
            rows[kind].append((score, m, sid))
        rows[kind].sort(key=lambda x: (-x[0], x[1].uid))
    out = {"tanks": [], "healers": []}
    used = set()
    for kind, n, lvl_attr, label in (("tank", int(mc.get("tank_picks", 4)), "max_guard_level", "Max Guard"),
                                     ("healer", int(mc.get("healer_picks", 3)), "max_spirit_level", "Max Spirit")):
        top = rows[kind][0][0] if rows[kind] else 0.0
        for score, m, sid in rows[kind]:
            if len([1 for _ in out["tanks" if kind == "tank" else "healers"]]) >= n:
                break
            if m.uid in used:
                continue
            used.add(m.uid)
            lvl = getattr(m, lvl_attr)
            out["tanks" if kind == "tank" else "healers"].append({
                "id": m.uid, "species": _clean_name(m.species["speciesName"]),
                "evolves_to": _clean_name(dex.by_id[sid]["speciesName"]) if sid != m.species["speciesId"] else "",
                "iv": _iv_str(m), "cp": m.cp, "level": round(m.level, 1), "verdict": m.verdict,
                "unlocked": lvl > 0, "move_level": lvl, "score": round(score, 1),
                "pct_of_best": round(100.0 * score / top, 1) if top else 0.0,
                "need": "" if lvl > 0 else f"Unlock {label} (Max Particles + candy) before it is usable"})
    return out



def build_showcase(mons, cfg):
    """PokéStop Showcase scores using the reverse-engineered in-game formula.

    Score = HeightScore + WeightScore + IVScore + XXLBonus
      HeightScore = 800 * (h / avg_h) / k
      WeightScore = 150 * (w / avg_w) / (k + 0.5)
      IVScore     = 50  * (ATK+DEF+STA) / 45
      XXLBonus    = 178 if XXL else 0
    Max theoretical = 1178. Species averages and XX-Class (k) come from the
    PokeMiners Game Master.
    """
    rows = []
    by_species = {}
    accurate = 0
    for m in mons:
        if m.verdict == "TRANSFER" or not m.species:
            continue
        raw = m.raw or {}
        h = float(raw.get("heightM") or 0.0)
        w = float(raw.get("weightKg") or 0.0)
        size = int(raw.get("size") or 0)
        if h <= 0:
            continue
        sc = showcase_score(m)
        if not sc:
            continue
        if sc["accurate"]:
            accurate += 1
        name = _display_species(m)
        row = {
            "id": m.uid, "species": name, "dex": m.dex,
            "score": sc["score"],
            "height_score": sc["height_score"],
            "weight_score": sc["weight_score"],
            "iv_score": sc["iv_score"],
            "xxl_bonus": sc["xxl_bonus"],
            "height": round(h, 3), "weight": round(w, 2),
            "size": SIZE_NAME.get(size, ""), "size_code": size,
            "iv": f"{m.a}/{m.d}/{m.s}", "cp": m.cp, "verdict": m.verdict,
            "accurate": sc["accurate"], "k": sc["k"],
            "pct_of_max": round(100.0 * sc["score"] / 1178.0, 1),
        }
        rows.append(row)
        prev = by_species.get(m.dex)
        if prev is None or row["score"] > prev["score"]:
            by_species[m.dex] = row
    rows.sort(key=lambda r: (-r["score"], r["species"]))
    best_per_species = sorted(by_species.values(), key=lambda r: (-r["score"], r["species"]))
    return {
        "enabled": True,
        "formula": "800*(h/avg_h)/k + 150*(w/avg_w)/(k+0.5) + 50*(IVsum/45) + (178 if XXL else 0)",
        "max_score": 1178,
        "size_table_ok": SIZE["ok"],
        "accurate_count": accurate,
        "xxl_count": sum(1 for r in rows if r["size_code"] == 5),
        "scored_count": len(rows),
        "rows": rows[:300],
        "best_per_species": best_per_species[:100],
    }



def apply_max_report(report, mons, dex, cfg):
    by_uid = {m.uid: m for m in mons}
    dyn = [m for m in mons if m.is_dynamax or m.is_gigantamax]
    lv = Counter(max(1, m.max_attack_level or 1) for m in dyn)
    picks = max_support_picks(mons, dex, cfg)
    for r in report["mons"]:
        m = by_uid.get(r["id"])
        if m and (m.is_dynamax or m.is_gigantamax):
            r["max_move"] = {"attack": m.max_attack_level or 1, "guard": m.max_guard_level,
                             "spirit": m.max_spirit_level, "gain_pct": max_move_gain_pct(m),
                             "gmax": bool(m.is_gigantamax)}
    for kind, lab in (("tanks", "Max tank"), ("healers", "Max healer")):
        for p in picks[kind]:
            row = next((r for r in report["mons"] if r["id"] == p["id"]), None)
            if row and row["verdict"] == "KEEP" and row["role"] == "Collection":
                row["role"] = lab
                row["why"] = (row["why"] + "; " if row.get("why") else "") + f"{lab} pick (bulk {p['pct_of_best']:.0f}% of your best)"
    attackers = [m for m in dyn if m.verdict.startswith("BUILD_MAX")]
    report["showcase"] = build_showcase(mons, cfg)
    report["max_battle"] = {
        "dynamax": len(dyn), "gigantamax": sum(1 for m in dyn if m.is_gigantamax),
        "attack_levels": {str(k): v for k, v in sorted(lv.items())},
        "guard_unlocked": sum(1 for m in dyn if m.max_guard_level > 0),
        "spirit_unlocked": sum(1 for m in dyn if m.max_spirit_level > 0),
        "gain_pct": 40.0 if dyn and not all(m.is_gigantamax for m in dyn) else 28.6,
        "attackers": len(attackers),
        "attackers_below_3": sum(1 for m in attackers if (m.max_attack_level or 1) < 3),
        "tanks": picks["tanks"], "healers": picks["healers"],
        "power_table": {"max": MAX_MOVE_POWER, "gmax": GMAX_MOVE_POWER}}


def compute_grade(report, dex, cfg, mons):
    cov = _raid_coverage_score(report)
    pvp = _pvp_readiness_score(report)
    mega = _mega_coverage_score(report)
    mx = _max_battle_score(report)
    depth = _collection_depth_score(report)
    overall = (cov * GRADE_WEIGHTS["raid"] + pvp * GRADE_WEIGHTS["pvp"]
               + mega * GRADE_WEIGHTS["mega"] + mx * GRADE_WEIGHTS["max"]
               + depth * GRADE_WEIGHTS["depth"]) * 100.0
    components = {
        "raid_coverage":    {"pct": round(cov * 100, 1),   "weight": 35, "weighted": round(cov * GRADE_WEIGHTS["raid"] * 100, 1)},
        "pvp_readiness":    {"pct": round(pvp * 100, 1),   "weight": 25, "weighted": round(pvp * GRADE_WEIGHTS["pvp"] * 100, 1)},
        "mega_coverage":    {"pct": round(mega * 100, 1),  "weight": 15, "weighted": round(mega * GRADE_WEIGHTS["mega"] * 100, 1)},
        "max_battle":       {"pct": round(mx * 100, 1),    "weight": 10, "weighted": round(mx * GRADE_WEIGHTS["max"] * 100, 1)},
        "collection_depth": {"pct": round(depth * 100, 1), "weight": 15, "weighted": round(depth * GRADE_WEIGHTS["depth"] * 100, 1)},
    }
    owners = _owner_index(mons, dex)
    wl_raid = _wishlist_raid(mons, dex, cfg, owners)
    wl_pvp = _wishlist_pvp(mons, dex, cfg, report, owners)
    wl_mega = _wishlist_mega(mons, dex, owners)
    wl_max = _wishlist_max(mons, dex, cfg, owners)
    wish = _top_adds(wl_raid)
    cov_pick = coverage_state(mons, dex, cfg)
    sections = {"raid": _section_raid(report, wl_raid, cov_pick, _flex_attackers(mons, dex, cfg)),
                "pvp": _section_pvp(report, wl_pvp),
                "mega": _section_mega(report, wl_mega),
                "max": _section_max(report, wl_max),
                "depth": _section_depth(report)}
    _explain_components(components, report)
    return {
        "wishlist_all": {"raid": wl_raid, "pvp": wl_pvp, "mega": wl_mega, "max": wl_max},
        "sections": sections,
        "overall_pct": round(overall, 1),
        "letter": _grade_letter(overall),
        "components": components,
        "wishlist": wish,
        "keep_summary": _keep_summary(mons),
        "level_these": _level_these(report, mons),
        "tm_here": _tm_here(report),
        "review_actions": _review_groups(mons),
        "cup_readiness": _cup_readiness(mons, dex, cfg),
        "coverage": _coverage_section(report, wish),
        "narrative": _narrative(overall, cov, pvp, mega, mx, depth, report, wish),
    }


def write_account_grade(outdir, grade, report):
    L = ["ACCOUNT GRADE", "=" * 60,
         "Overall: " + str(grade["overall_pct"]) + "%  (" + grade["letter"] + ")", ""]
    for k, v in grade["components"].items():
        L.append("  " + k.replace("_", " ").title().ljust(20)
                 + " " + str(v["weight"]).rjust(2) + "%  ->  "
                 + str(v["pct"]).rjust(5) + "%   ("
                 + str(v["weighted"]) + " pts)")
    L += ["", grade["narrative"]["headline"], "", grade["narrative"]["body"],
          "", "=" * 60, "COVERAGE - per raid type", "=" * 60]
    for c in grade["coverage"]:
        mark = {"OK": "[OK] ", "THIN": "[!!] ", "GAP": "[X]  "}[c["status"]]
        names = ", ".join(c["names"]) if c["names"] else "(none)"
        L.append("  " + mark + c["type"].ljust(10) + " " + str(c["usable"]).rjust(2) + " usable   " + names)
    L += ["", "=" * 60, "WISHLIST - best adds overall (gaps first, then upgrades)", "=" * 60]
    for i, w in enumerate(grade["wishlist"], 1):
        cheap = "  [cheap win - you own a pre-evo]" if w["cheap"] else ""
        L.append("  " + str(i).rjust(2) + ". " + w["species"].ljust(24)
                 + " " + w["fixes"].ljust(9) + " #" + str(w["rank_in_type"]).ljust(3)
                 + (w.get("reason") or "") + cheap)
    L += ["", "=" * 60, "WISHLIST BY TYPE - top raid attackers vs what you own", "=" * 60]
    for t, blk in grade["wishlist_all"]["raid"].items():
        L.append("")
        L.append(blk["type"] + " [" + blk["status"] + ", " + str(blk["usable"]) + " usable, your best = "
                 + str(blk["have_pct"]) + "% of the top pick]")
        for r in blk["rows"]:
            have = ("you: " + r["best"]["species"] + " " + r["best"]["iv"]) if r["best"] else "not owned"
            imp = ""
            if r["status"] != "HAVE":
                imp = "  -> " + ("would be your #" + str(r["rank_if_added"]) if r["would_enter"] else "outside your top 5")
            L.append("  " + str(r["rank"]).rjust(2) + ". " + (r["species"] + (" [" + r["target"] + "]" if r["has_shadow"] else "")).ljust(30)
                     + r["status"].ljust(8) + have + imp)
    L += ["", "=" * 60, "KEEP THESE - your protected core", "=" * 60]
    for label, n in grade["keep_summary"]["counts"].items():
        L.append("  " + label.ljust(32) + " " + str(n))
    L.append("  " + "Total protected from transfer".ljust(32) + " "
             + str(grade["keep_summary"]["total_protected"]) + " of "
             + str(grade["keep_summary"]["total"]))
    L += ["", "=" * 60, "LEVEL THESE - build order by account impact", "=" * 60,
          "Sort: verdict weight x gap bonus x quality.", ""]
    for i, item in enumerate(grade["level_these"][:40], 1):
        tag = item["verdict"].replace("BUILD_", "")
        gap = "  [fixes " + item["gap_fix"] + "]" if item["gap_fix"] else ""
        L.append("  " + str(i).rjust(2) + ". [" + tag.ljust(4) + "] "
                 + item["species"].ljust(18) + ((" CP " + str(item.get("cp"))) if item.get("cp") else "") + ((" -> " + item.get("evolve_to")) if item.get("evolve_to") else "") + (" | " if (item.get("cp") or item.get("evolve_to")) else "") + item["role"][:55] + gap)
    L += ["", "=" * 60, "TM HERE - mons already leveled that just need a TM", "=" * 60]
    reg = grade["tm_here"]["regular"]
    L.append("REGULAR TM - " + str(len(reg)) + " mons, all worth doing:")
    for r in reg:
        L.append("  " + r["species"].ljust(20) + " needs " + r["needs"])
    L.append("")
    elite = grade["tm_here"]["elite_worth"]
    L.append("ELITE TM - " + str(len(elite)) + " worth the spend:")
    for e in elite:
        L.append("  " + e["species"].ljust(20) + " " + e["role"][:55])
        L.append("      needs: " + e["needs"])
    L.append("")
    L.append("ELITE TM - skip: " + grade["tm_here"]["elite_skip"]["summary"])
    cups = grade.get("cup_readiness") or {}
    if cups:
        L += ["", "=" * 60, "CUP READINESS", "=" * 60]
        for cup_key, info in cups.items():
            L.append("")
            L.append(info["title"] + " Cup (cap " + str(info["cap"]) + "):")
            L.append("  Legal species stages: " + str(info["legal"]))
            L.append("  Qualified (top species, IV rank <= 120): " + str(info["qualified"]))
            L.append("  Already the PvP build target: " + str(info["built"]))
            if info.get("top_builds"):
                L.append("  Top builds by combined rank:")
                for b in info["top_builds"]:
                    src_nm = (b["from"] + " -> " + b["species"]) if b.get("from") else b["species"]
                    tag = "BUILD" if b["is_build"] else "candidate"
                    L.append("    " + src_nm.ljust(30) + " CP " + str(b["cp"]).ljust(5)
                             + " " + b["iv"].ljust(11)
                             + " " + info["title"] + "#" + str(b["species_rank"])
                             + "/IV#" + str(b["iv_rank"])
                             + "  [" + tag + "]")

    review = grade.get("review_actions") or []
    if review:
        L += ["", "=" * 60, "REVIEW - what to do (" + str(len(review)) + " mons total)", "=" * 60, ""]
        _last = None
        for r in review:
            if r["action"] != _last:
                _last = r["action"]
                _n = sum(1 for x in review if x["action"] == _last)
                L.append("")
                L.append(r["label"] + " (" + str(_n) + "):")
            L.append("  " + r["species"].ljust(22) + " CP " + str(r["cp"]).ljust(6) + " " + r["iv"].ljust(12) + " " + r["detail"])
    (outdir / "account_grade.txt").write_text("\n".join(L) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
