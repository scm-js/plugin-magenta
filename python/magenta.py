"""
[magenta]
spec : {"version": 3, "everyFrame": false, "chat": {"cell": [p, u], "args": {...} | null} | null, "hooks": [...], "scans": [...], "msqc": {...} | null}

The Magenta plugin: the rows the scmJS Magenta editor adds that only a euddraft build can
do, described as data and turned into eudplib code here. A cell is a death counter,
`[player, unit]`. A hook watches one private cell — a "flag" a map trigger sets to 1 with
an ordinary Set Deaths action — and, after the map's triggers have run in that cycle,
does its work and clears the flag:

  text     {"flag", "parts": [{"text": "Score: "}, {"counter": [p, u]}], "to": "all" | slot}
  math     {"flag", "op": "mul" | "div" | "mod" | "rand", "a": cell, "b": cell | number, "to": cell}
  foreach  {"flag", "unit": id | null, "owner": slot | null, "location": number | null, "do": ...}
           do: {"set": "hp" | "shields" | "energy" | "kills" | "resources" | "buildTime" | "rank" | "topSpeed" | "acceleration" | "movementType", "value": n} | {"kill": true} | {"remove": true}
               | {"invincible": bool} | {"hallucination": bool} | {"speed": bool} | {"give": slot} | {"locate": location}
               | {"order": "move" | "patrol" | "attack", "location": dest, "scratch": location}   — the game's own Order, one unit at a time through a scratch location
               | {"orderRaw": orders.dat id, "location": dest}                                    — the order id and target written into the unit (an experiment)
               | {"timer": "stim" | "ensnare" | "plague" | "lockdown" | "stasis" | "maelstrom" | "irradiate" | "matrix", "value": frames}
               | {"cooldown": frames}                                                              — ground, air and spell cooldowns at once
               | {"status": "cloak" | "noclip" | "cooldownUpgrade", "on": bool}
               | {"nudge": {"dx": px, "dy": px}}                                                   — the position written directly (an experiment)
               | {"adjust": "hp" | "shields" | "energy", "delta": ±n}                              — since version 5: damage or heal, floored at 0 (hit points at 0 kill) and capped at the type's maximum
  pick     {"flag", <filter>, "by": "min" | "max" | "nearest" | "random", "field": ..., "near": location | {"mouse": slot} | null, "radius": px | null, "locate": location | null, "to": cell | null}
           — the one matching unit with the least / greatest field, nearest the centre of `near` (since version 5 also a player's mouse, the
             location MSQC keeps it in, and no farther than `radius`), or since version 5 one at random: centre `locate` on it, its field (or distance) into `to`
  count    {"flag", <filter>, "to": cell}          — how many units match
  read     {"flag", <filter>, "field": ..., "to": cell} — the first match's field, 0 for none
  setloc   {"flag", "location": number, "x": px, "y": px, "width": px | null, "height": px | null}
           since version 5 also {"flag", "location": number, "relative": true, "x": dx, "y": dy} — moved by an offset from where it is
  terrain  {"flag", "location": number, "tile": MTXM id}   — since version 4: every tile under the location becomes that tile, in the array the game draws from (walkability does not follow)

Since version 4 the foreach / pick verbs also take {"tint": "normal" | "cloaked" | "hallucination" | "flash"}:
the draw function of every image of the unit's sprite is rewritten — 0 plain, 6 the see-through
of a visible cloaked unit, 16 the blue of a hallucination, 17 the white warp flash.

Both version-4 additions FAILED in Remastered (probe 10, 2026-09-15) and the editor does not offer
them: `terrain` changed nothing on screen (the EUD layer does not reach the buffer the renderer
draws from), and the first `tint` write ended the game with "EUD not supported", as `nudge` does.

Text parts are {"text": "..."} (with the editor's <HH> escapes for the game's colour and
effect codes), {"counter": cell}, {"player": slot} for the player's name, {"color": slot}
for the switch to that player's colour.

A scan runs every cycle and leaves 1 or 0 in its cell for a condition to read:

  scan     {"cell", <filter>, "field": ..., "cmp": "<" | ">" | "=", "value": n}

Fields, for read / scan / pick: hp, shields, energy, kills, x, y, and since version 3 order
(the orders.dat id of the unit's main order), hasTarget (1 with an order target unit),
underAttack (the attack-notify timer, > 0 for ~ a second after a hit), burrowed, inTransport,
buildTime (remaining, for an incomplete building), resources (a mineral field's or geyser's
amount), cooldown (the ground weapon's, in frames), speed (the current speed, px/frame × 256);
since version 5 hpPct, shieldsPct, energyPct (0 to 100, against the type's maximum from units.dat,
250 for energy), unitType and owner.

`chat.args`, since version 3, is {"ptr": cell, "len": cell, "pattern": cell, "number": cell}: the
chat plugin's __ptrAddr__ / __lenAddr__ / __patternAddr__ cells; before the map's triggers run,
when `pattern` is set, the first number in the message (after its first space) is parsed into
`number`, so "-set 250" leaves 250 there. `pattern` is cleared after the triggers like `cell`.

`msqc.held`, since version 3, is [{"down": unit, "up": unit, "state": unit}]: MSQC lands a
KeyDown in `down` and a KeyUp in `up` (per player), and before the triggers run the hook turns
those into `state` — a countdown refreshed by every down (auto-repeat keeps it alive while the
key is held) and ended by an up — so a condition can say "while W is held" as `state ≥ 1`.

Kept but not offered by the editor after the 2026-09-14 play-through in Remastered: `orderRaw`
(the game's Order works), `nudge` (the game ends with "EUD not supported"), `status cloak` and
`cooldownUpgrade` (no visible effect), `set topSpeed / acceleration / movementType` (a unit's
own copy changes nothing; only the flingy table, for units made afterwards), and `msqc.held`
(Remastered reports one down per press and nothing while a key is held).

`chat` names the cell the chatEvent plugin writes a message's number into; it is cleared
after the map's triggers have seen it, so a chat command fires once. `msqc` follows the
MSQC plugin: `clear` are the event units (one per key or click) whose per-player cells
are cleared each cycle, `mouseIn` compares each player's mouse location (MSQC moves one
location per human, from `mouseBase`) against a location and leaves 1 or 0 in that
player's cell of `unit`, and `select` reads the unit pointer MSQC delivered into
`ptr`'s cells and leaves the unit's type + 1 in `type`'s. Nothing in the spec is code.
"""
import json
import re

from eudplib import *

DEATHS = 0x58A364
MRGN = 0x58DC60
HUMANS = 8
# The map's size in tiles (a word each), and the pointer to the MTXM tile array the game draws from (eud-book).
MAP_SIZE = 0x57F1D4
MTXM_PTR = 0x5993C4

# The newest spec this plugin reads; the server reports it on /health so the editor can tell before it uploads a map.
SPEC_VERSION = 5

spec = json.loads(settings["spec"])
if not isinstance(spec.get("version"), int) or spec["version"] < 1 or spec["version"] > SPEC_VERSION:
    raise RuntimeError("magenta: spec version %r is not 1 to %d; this server's Magenta plugin is older than the map's rows need" % (spec.get("version"), SPEC_VERSION))

# units.dat: max hit points (dword × 256) and max shields (word, in points) by unit type; a unit's energy tops out at 250 with its upgrade.
UNITS_MAX_HP = 0x662350
UNITS_MAX_SHIELDS = 0x660E00
MAX_ENERGY = 250


def cell_addr(cell):
    p, u = int(cell[0]), int(cell[1])
    if not (0 <= p < 12 and 0 <= u < 228):
        raise RuntimeError("magenta: bad cell %r" % (cell,))
    return DEATHS + p * 4 + u * 48


def cell_epd(cell):
    return EPD(cell_addr(cell))


def loc_epd(number):
    """EPD of a 1-based location's record: left, top, right, bottom, then the flags."""
    return EPD(MRGN + (int(number) - 1) * 20)


def loc_bounds(number):
    base = loc_epd(number)
    return [f_dwread_epd(base + i) for i in range(4)]


def box_on(cu, number, half=2):
    """Centre a 1-based location on the unit as a small box, not a point: the game's Order and
    counted Kill did nothing with a zero-size location in the probes, while a heal at it worked."""
    base = loc_epd(number)
    x, y = cu.posX, cu.posY
    f_dwwrite_epd(base, x - half)
    f_dwwrite_epd(base + 1, y - half)
    f_dwwrite_epd(base + 2, x + half)
    f_dwwrite_epd(base + 3, y + half)


# ── units ──

def unit_matches(cu, h, bounds):
    conds = []
    if h.get("unit") is not None:
        conds.append(cu.eqattr("unitType", int(h["unit"])))
    if h.get("owner") is not None:
        conds.append(cu.eqattr("owner", int(h["owner"])))
    if bounds:
        left, top, right, bottom = bounds
        x, y = cu.posX, cu.posY
        conds.extend([x >= left, x <= right, y >= top, y <= bottom])
    return conds if conds else [Always()]


def unit_field(cu, field):
    if field == "hp":
        return f_div(cu.hp, 256)[0]
    if field == "shields":
        return f_div(cu.shield, 256)[0]
    if field == "energy":
        return f_div(cu.energy, 256)[0]
    if field == "kills":
        return cu.killCount
    if field == "x":
        return cu.posX
    if field == "y":
        return cu.posY
    if field == "order":
        return cu.orderID
    if field == "hasTarget":
        v = EUDVariable()
        v << 0
        if EUDIf()(cu.orderTargetUnit >= 1):
            v << 1
        EUDEndIf()
        return v
    if field == "underAttack":
        return cu.attackNotifyTimer
    if field == "burrowed":
        return flag_value(cu, 0x10)
    if field == "inTransport":
        return flag_value(cu, 0x40)
    if field == "buildTime":
        return cu.remainingBuildTime
    if field == "resources":
        return cu.resourceAmount
    if field == "cooldown":
        return cu.groundWeaponCooldown
    if field == "speed":
        return cu.currentSpeed1
    if field == "hpPct":
        return f_div(f_mul(cu.hp, 100), unit_max_hp(cu))[0]
    if field == "shieldsPct":
        return f_div(f_mul(cu.shield, 100), unit_max_shields(cu))[0]
    if field == "energyPct":
        return f_div(f_mul(cu.energy, 100), MAX_ENERGY * 256)[0]
    if field == "unitType":
        return cu.unitType
    if field == "owner":
        return cu.owner
    if field in TIMERS:
        return getattr(cu, TIMERS[field])
    raise RuntimeError("magenta: unknown field %r" % field)


def unit_max_hp(cu):
    """The type's max hit points × 256, never 0 (a division needs it)."""
    v = f_dwread(f_mul(cu.unitType, 4) + UNITS_MAX_HP)
    if EUDIf()(v == 0):
        v << 256
    EUDEndIf()
    return v


def unit_max_shields(cu):
    """The type's max shields × 256, never 0."""
    v = f_mul(f_wread(f_mul(cu.unitType, 2) + UNITS_MAX_SHIELDS), 256)
    if EUDIf()(v == 0):
        v << 256
    EUDEndIf()
    return v


def flag_value(cu, mask):
    """1 when the status flag is set, else 0."""
    v = EUDVariable()
    v << 0
    if EUDIf()(cu.check_status_flag(mask)):
        v << 1
    EUDEndIf()
    return v


def each_matching(h):
    """Yield the CUnit of every matching unit, inside an EUDIf the caller must not close."""
    bounds = loc_bounds(h["location"]) if h.get("location") else None
    for ptr, epd in EUDLoopUnit2():
        cu = CUnit(epd, ptr=ptr)
        if EUDIf()(unit_matches(cu, h, bounds)):
            yield cu
        EUDEndIf()


# ── hooks ──

ESCAPE = re.compile(r"<([0-9A-Fa-f]{2})>")


def unescape(text):
    """The editor writes a control byte as <HH>; the game wants the byte."""
    return ESCAPE.sub(lambda m: chr(int(m.group(1), 16)), text)


def hook_text(h):
    to = h.get("to", "all")
    parts = []
    for part in h["parts"]:
        if "text" in part:
            parts.append(unescape(str(part["text"])))
        elif "player" in part:
            parts.append(PName(int(part["player"])))
        elif "color" in part:
            parts.append(PColor(int(part["color"])))
        else:
            parts.append(f_dwread_epd(cell_epd(part["counter"])))
    if to == "all":
        for p in range(HUMANS):
            f_setcurpl(p)
            f_simpleprint(*parts, spaced=False)
    else:
        f_setcurpl(int(to))
        f_simpleprint(*parts, spaced=False)


def hook_math(h):
    a = f_dwread_epd(cell_epd(h["a"]))
    b = h["b"]
    bv = int(b) if isinstance(b, (int, float)) else f_dwread_epd(cell_epd(b))
    op = h["op"]
    if op == "mul":
        r = f_mul(a, bv)
    elif op == "div":
        r, _ = f_div(a, bv)
    elif op == "mod":
        _, r = f_div(a, bv)
    elif op == "rand":
        _, r = f_div(f_rand(), bv)
    else:
        raise RuntimeError("magenta: unknown op %r" % op)
    f_dwwrite_epd(cell_epd(h["to"]), r)


ORDERS = {"move": Move, "patrol": Patrol, "attack": Attack}
TIMERS = {"stim": "stimTimer", "ensnare": "ensnareTimer", "plague": "plagueTimer", "lockdown": "lockdownTimer", "stasis": "stasisTimer", "maelstrom": "maelstromTimer", "irradiate": "irradiateTimer"}
# Status flags (eud-book's CUnit table): cloak is "requires detection" + "cloaked" together.
STATUS = {"cloak": 0x300, "cooldownUpgrade": 0x20000000}


def hook_foreach(h):
    for cu in each_matching(h):
        foreach_do(cu, h["do"], h)


def foreach_do(cu, do, h):
    """One verb on one unit."""
    if "set" in do:
        field, value = do["set"], int(do["value"])
        if field == "hp":
            cu.hp = value * 256
        elif field == "shields":
            cu.shield = value * 256
        elif field == "energy":
            cu.energy = value * 256
        elif field == "kills":
            cu.killCount = value
        elif field == "resources":
            cu.resourceAmount = value
        elif field == "buildTime":
            cu.remainingBuildTime = value
        elif field == "rank":
            cu.rankIncrease = value
        elif field == "topSpeed":
            # The unit's own copy of flingy.dat: a table write reaches only units made afterwards.
            cu.topSpeed = value
        elif field == "acceleration":
            cu.acceleration = value
        elif field == "movementType":
            # 0 = flingy.dat control (speed from topSpeed / acceleration), 2 = iscript control (most ground units; speed comes from the animation).
            cu.flingyMovementType = value
    elif "order" in do:
        # The game's own Order action, aimed at this one unit: a scratch location is
        # centred on it first, so the order reaches nothing else (a unit standing on the
        # same pixel would come along).
        order = ORDERS[do["order"]]
        scratch = int(do["scratch"])
        box_on(cu, scratch)
        unit = int(h["unit"]) if h.get("unit") is not None else cu.unitType
        owner = int(h["owner"]) if h.get("owner") is not None else cu.owner
        DoActions(Order(unit, owner, scratch, order, int(do["location"])))
    elif "orderRaw" in do:
        dest = loc_epd(do["location"])
        left, top, right, bottom = [f_dwread_epd(dest + i) for i in range(4)]
        cu.orderTargetX = f_div(left + right, 2)[0]
        cu.orderTargetY = f_div(top + bottom, 2)[0]
        cu.orderTargetUnit = 0
        cu.orderID = int(do["orderRaw"])
        cu.orderState = 0
    elif "timer" in do:
        name, value = do["timer"], int(do["value"])
        if name == "matrix":
            cu.defensiveMatrixHp = 250 * 256
            cu.defensiveMatrixTimer = value
        else:
            setattr(cu, TIMERS[name], value)
    elif "cooldown" in do:
        value = int(do["cooldown"])
        cu.groundWeaponCooldown = value
        cu.airWeaponCooldown = value
        cu.spellCooldown = value
    elif "status" in do:
        name, on = do["status"], bool(do["on"])
        if name == "noclip":
            cu.set_noclip() if on else cu.clear_noclip()
        else:
            mask = STATUS[name]
            cu.set_status_flag(mask) if on else cu.clear_status_flag(mask)
    elif "nudge" in do:
        dx, dy = int(do["nudge"]["dx"]), int(do["nudge"]["dy"])
        x = cu.posX + dx
        y = cu.posY + dy
        cu.posX = x
        cu.posY = y
        sprite = cu.sprite
        if EUDIf()(sprite >= 1):
            sp = CSprite.from_ptr(sprite)
            sp.posX = x
            sp.posY = y
        EUDEndIf()
    elif do.get("kill"):
        cu.die()
    elif do.get("remove"):
        cu.remove()
    elif "invincible" in do:
        cu.set_invincible() if do["invincible"] else cu.clear_invincible()
    elif "hallucination" in do:
        cu.set_hallucination() if do["hallucination"] else cu.clear_hallucination()
    elif "speed" in do:
        cu.set_speed_upgrade() if do["speed"] else cu.clear_speed_upgrade()
    elif "give" in do:
        cu.cgive(int(do["give"]))
    elif "locate" in do:
        box_on(cu, int(do["locate"]))
    elif "tint" in do:
        tint(cu, do["tint"])
    elif "adjust" in do:
        adjust(cu, do["adjust"], int(do["delta"]))


def adjust(cu, field, delta):
    """Damage or heal: the field moved by `delta` points, floored at 0 and capped at the type's maximum; hit points at 0 kill the unit."""
    if field == "hp":
        cur, top = cu.hp, unit_max_hp(cu)
    elif field == "shields":
        cur, top = cu.shield, unit_max_shields(cu)
    else:
        cur, top = cu.energy, MAX_ENERGY * 256
    step = abs(delta) * 256
    new = EUDVariable()
    if delta < 0:
        if EUDIf()(cur <= step):
            new << 0
        if EUDElse()():
            new << cur - step
        EUDEndIf()
    else:
        new << cur + step
        if EUDIf()(new > top):
            new << top
        EUDEndIf()
    if field == "hp":
        if EUDIf()(new == 0):
            cu.die()
        if EUDElse()():
            cu.hp = new
        EUDEndIf()
    elif field == "shields":
        cu.shield = new
    else:
        cu.energy = new


# Draw functions of an image (images.dat's column, CImage + 0x0A): what the renderer does with it.
DRAWFUNCS = {"normal": 0, "cloaked": 6, "hallucination": 16, "flash": 17}
# CImage: + 0x04 next image in the sprite's list, + 0x0A the draw function; CSprite + 0x1C the list's head.
IMAGE_NEXT = 0x04
IMAGE_DRAWFUNC = 0x0A
SPRITE_IMAGE_HEAD = 0x1C
MAX_IMAGES = 16


def tint(cu, mode):
    """Rewrite the draw function of every image of the unit's sprite: a look without the state behind it."""
    drawfunc = DRAWFUNCS[mode]
    sprite = cu.sprite
    if EUDIf()(sprite >= 1):
        img = EUDVariable()
        n = EUDVariable()
        img << f_dwread(sprite + SPRITE_IMAGE_HEAD)
        n << 0
        if EUDWhile()([img >= 1, n < MAX_IMAGES]):
            f_bwrite(img + IMAGE_DRAWFUNC, drawfunc)
            img << f_dwread(img + IMAGE_NEXT)
            n += 1
        EUDEndWhile()
    EUDEndIf()


def hook_terrain(h):
    """Every tile under the location becomes `tile`, in the MTXM array the game draws from. The
    walkability and height of the ground come from the tileset's own tables and do not follow."""
    tile = int(h["tile"])
    left, top, right, bottom = loc_bounds(h["location"])
    width = f_wread(MAP_SIZE)
    base = f_dwread(MTXM_PTR)
    x0 = f_div(left, 32)[0]
    y0 = f_div(top, 32)[0]
    x1 = f_div(right + 31, 32)[0]
    y1 = f_div(bottom + 31, 32)[0]
    y = EUDVariable()
    y << y0
    if EUDWhile()(y < y1):
        row = base + f_mul(y, width) * 2
        x = EUDVariable()
        x << x0
        if EUDWhile()(x < x1):
            f_wwrite(row + x * 2, tile)
            x += 1
        EUDEndWhile()
        y += 1
    EUDEndWhile()


def hook_count(h):
    n = EUDVariable()
    n << 0
    for _cu in each_matching(h):
        n += 1
    f_dwwrite_epd(cell_epd(h["to"]), n)


def hook_read(h):
    v = EUDVariable()
    done = EUDVariable()
    v << 0
    done << 0
    for cu in each_matching(h):
        if EUDIf()(done == 0):
            v << unit_field(cu, h["field"])
            done << 1
        EUDEndIf()
    f_dwwrite_epd(cell_epd(h["to"]), v)


def hook_pick(h):
    """The one matching unit with the least / greatest field, or the nearest to a location's centre; `locate`, `to` and `do` act on it."""
    by = h["by"]
    best = EUDVariable()
    best_ptr = EUDVariable()
    best_ptr << 0
    if by == "random":
        # Count the matches, draw one, take the drawn one on a second pass.
        n = EUDVariable()
        n << 0
        for _cu in each_matching(h):
            n += 1
        drawn = EUDVariable()
        i = EUDVariable()
        drawn << 0
        i << 0
        if EUDIf()(n >= 1):
            _, r = f_div(f_rand(), n)
            drawn << r
        EUDEndIf()
        for cu in each_matching(h):
            if EUDIf()([n >= 1, i == drawn]):
                best_ptr << cu.ptr
            EUDEndIf()
            i += 1
        best << 0
    elif by == "nearest":
        near_spec = h["near"]
        if isinstance(near_spec, dict):
            # A player's mouse: MSQC keeps it in location mouseBase + slot (the setting is 1-based).
            near = loc_epd(int(spec["msqc"]["mouseBase"]) + int(near_spec["mouse"]))
        else:
            near = loc_epd(near_spec)
        left, top, right, bottom = [f_dwread_epd(near + i) for i in range(4)]
        cx = f_div(left + right, 2)[0]
        cy = f_div(top + bottom, 2)[0]
        best << 0xFFFFFFFF
    elif by == "min":
        best << 0xFFFFFFFF
    else:
        best << 0
    for cu in ([] if by == "random" else each_matching(h)):
        if by == "nearest":
            # Manhattan distance is enough to pick the nearest, and it never overflows.
            dx = EUDVariable()
            dy = EUDVariable()
            if EUDIf()(cu.posX >= cx):
                dx << cu.posX - cx
            if EUDElse()():
                dx << cx - cu.posX
            EUDEndIf()
            if EUDIf()(cu.posY >= cy):
                dy << cu.posY - cy
            if EUDElse()():
                dy << cy - cu.posY
            EUDEndIf()
            v = dx + dy
            better = v < best
        else:
            v = unit_field(cu, h["field"])
            better = v < best if by == "min" else v > best
        if EUDIf()(better):
            best << v
            best_ptr << cu.ptr
        EUDEndIf()
    if by == "nearest" and h.get("radius") is not None:
        # Nothing counts past the radius: the pick answers "no unit" instead of the far one.
        if EUDIf()(best > int(h["radius"])):
            best_ptr << 0
        EUDEndIf()
    if EUDIf()(best_ptr >= 1):
        found = CUnit.from_ptr(best_ptr)
        if h.get("locate"):
            box_on(found, int(h["locate"]))
        if h.get("to"):
            f_dwwrite_epd(cell_epd(h["to"]), best)
        if h.get("do"):
            foreach_do(found, h["do"], h)
    if EUDElse()():
        if h.get("to"):
            f_dwwrite_epd(cell_epd(h["to"]), 0)
    EUDEndIf()


def scan(h):
    hit = EUDVariable()
    hit << 0
    value = int(h["value"])
    for cu in each_matching(h):
        f = unit_field(cu, h["field"])
        cmp = h["cmp"]
        if cmp == "<":
            cond = f < value
        elif cmp == ">":
            cond = f > value
        else:
            cond = f == value
        if EUDIf()(cond):
            hit << 1
        EUDEndIf()
    f_dwwrite_epd(cell_epd(h["cell"]), hit)


def hook_setloc(h):
    base = loc_epd(h["location"])
    if h.get("relative"):
        dx, dy = int(h["x"]), int(h["y"])
        for i in (0, 2):
            f_dwwrite_epd(base + i, f_dwread_epd(base + i) + dx)
        for i in (1, 3):
            f_dwwrite_epd(base + i, f_dwread_epd(base + i) + dy)
        return
    x, y = int(h["x"]), int(h["y"])
    if h.get("width") is None or h.get("height") is None:
        width = f_dwread_epd(base + 2) - f_dwread_epd(base)
        height = f_dwread_epd(base + 3) - f_dwread_epd(base + 1)
    else:
        width, height = int(h["width"]), int(h["height"])
    f_dwwrite_epd(base, x)
    f_dwwrite_epd(base + 1, y)
    f_dwwrite_epd(base + 2, x + width)
    f_dwwrite_epd(base + 3, y + height)


HOOKS = {"text": hook_text, "math": hook_math, "foreach": hook_foreach, "count": hook_count, "read": hook_read, "setloc": hook_setloc, "pick": hook_pick, "terrain": hook_terrain}


def inside(px, py, number):
    left, top, right, bottom = loc_bounds(number)
    return [px >= left, px <= right, py >= top, py <= bottom]


def msqc_follow(m):
    base = m.get("mouseBase")
    for entry in m.get("mouseIn", []):
        if base is None:
            break
        for p in range(HUMANS):
            # MSQC keeps player p's mouse as a point in location number base + p — the `Mouse : base`
            # setting counts from 1, like a trigger's location (probe 7 found the +1 that was here).
            mloc = loc_epd(base + p)
            mx = f_dwread_epd(mloc)
            my = f_dwread_epd(mloc + 1)
            cell = [p, entry["unit"]]
            if EUDIf()(inside(mx, my, entry["location"])):
                f_dwwrite_epd(cell_epd(cell), 1)
            if EUDElse()():
                f_dwwrite_epd(cell_epd(cell), 0)
            EUDEndIf()
    sel = m.get("select")
    if sel:
        for p in range(HUMANS):
            ptr = f_dwread_epd(cell_epd([p, sel["ptr"]]))
            if EUDIf()(ptr >= 1):
                cu = CUnit.from_ptr(ptr)
                f_dwwrite_epd(cell_epd([p, sel["type"]]), cu.unitType + 1)
            if EUDElse()():
                f_dwwrite_epd(cell_epd([p, sel["type"]]), 0)
            EUDEndIf()


def chat_args(args):
    """The first number in a matched chat pattern — the digits after the message's first space — into the number cell."""
    pattern = cell_epd(args["pattern"])
    if EUDIf()(MemoryEPD(pattern, AtLeast, 1)):
        ptr = f_dwread_epd(cell_epd(args["ptr"]))
        length = f_dwread_epd(cell_epd(args["len"]))
        n = EUDVariable()
        i = EUDVariable()
        seen = EUDVariable()
        n << 0
        i << 0
        seen << 0
        if EUDWhile()(i < length):
            ch = f_bread(ptr + i)
            i += 1
            if EUDIf()(seen == 0):
                if EUDIf()(ch == 32):
                    seen << 1
                EUDEndIf()
                EUDContinue()
            EUDEndIf()
            EUDBreakIf(ch < 48)
            EUDBreakIf(ch > 57)
            n << n * 10 + (ch - 48)
        EUDEndWhile()
        f_dwwrite_epd(cell_epd(args["number"]), n)
    EUDEndIf()


HOLD_CYCLES = 24


def held_keys(held):
    """A KeyDown / KeyUp pair into a held state per player. Remastered's key byte pulses to 1 for
    one frame on a press and reads 0 otherwise, so MSQC's KeyUp has nothing to fall out of and never
    arrives; what a held key does produce is Windows' auto-repeat, a press every few frames. So the
    state is a countdown: a down sets it to HOLD_CYCLES (a second at fastest, longer than the repeat
    delay), each cycle counts it down, and an up — should one come — ends it. A condition reads ≥ 1."""
    for entry in held:
        for p in range(HUMANS):
            down = cell_epd([p, entry["down"]])
            up = cell_epd([p, entry["up"]])
            state = cell_epd([p, entry["state"]])
            if EUDIf()(MemoryEPD(down, AtLeast, 1)):
                DoActions(SetMemoryEPD(state, SetTo, HOLD_CYCLES))
            if EUDElseIf()(MemoryEPD(up, AtLeast, 1)):
                DoActions(SetMemoryEPD(state, SetTo, 0))
            if EUDElseIf()(MemoryEPD(state, AtLeast, 1)):
                DoActions(SetMemoryEPD(state, Subtract, 1))
            EUDEndIf()


def beforeTriggerExec():
    chat = spec.get("chat")
    if chat and chat.get("args"):
        chat_args(chat["args"])
    m = spec.get("msqc")
    if m and m.get("held"):
        held_keys(m["held"])
    for h in spec.get("scans", []):
        scan(h)
    if m:
        msqc_follow(m)


def afterTriggerExec():
    hooks = spec.get("hooks", [])
    # Several hooks may watch one flag; it is cleared after the last of them has run.
    last = {}
    for i, h in enumerate(hooks):
        last[tuple(h["flag"])] = i
    for i, h in enumerate(hooks):
        flag = cell_epd(h["flag"])
        if EUDIf()(MemoryEPD(flag, Exactly, 1)):
            HOOKS[h["kind"]](h)
            if last[tuple(h["flag"])] == i:
                DoActions(SetMemoryEPD(flag, SetTo, 0))
        EUDEndIf()
    chat = spec.get("chat")
    if chat:
        DoActions(SetMemoryEPD(cell_epd(chat["cell"]), SetTo, 0))
        if chat.get("args"):
            DoActions(SetMemoryEPD(cell_epd(chat["args"]["pattern"]), SetTo, 0))
    m = spec.get("msqc")
    if m:
        for unit in m.get("clear", []):
            for p in range(HUMANS):
                DoActions(SetMemoryEPD(cell_epd([p, unit]), SetTo, 0))
