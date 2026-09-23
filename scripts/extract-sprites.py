#!/usr/bin/env python3
"""Extract game sprites from the concept-sheet crops in the uploaded package.

The source PNGs are rectangular crops of a single concept sheet, so each one can
contain bleed from its neighbour: a chunk of another item touching an edge. Those
edge-touching blobs are never the subject, so they are dropped, then the largest
interior blob is cut out, trimmed, padded and resized to the sprite contract.
"""
from PIL import Image, ImageFilter
from collections import Counter, deque
import os
import statistics

SRC = os.environ.get('VEILBORN_ART_SRC',
                     '/workspace/project/art-source/veilborn-package')
OUT = '/workspace/project/public/assets/sprites'

# slot filename -> (source crop, output size)
MAP = {
    'player': {
        'cael_idle':  ('characters/hero_idle.png', (128, 128)),
        'cael_run':   ('characters/hero_run.png', (128, 128)),
        'cael_dash':  ('characters/hero_dash.png', (128, 128)),
        'cael_hurt':  ('characters/hero_hurt.png', (128, 128)),
        'cael_death': ('characters/hero_death.png', (128, 128)),
    },
    'enemies': {
        'shade_wraith':  ('enemies/enemy_shade_wraith.png', (128, 128)),
        'bone_soldier':  ('enemies/enemy_bone_soldier.png', (128, 128)),
        'ash_hound':     ('enemies/enemy_ash_hound.png', (128, 128)),
        'void_archer':   ('enemies/enemy_void_archer.png', (128, 128)),
        'soul_leech':    ('enemies/enemy_soul_leech.png', (128, 128)),
        'cursed_knight': ('enemies/enemy_cursed_knight.png', (128, 128)),
    },
    'bosses': {
        'zyther':    ('enemies/boss_zyther.png', (384, 384)),
        'seraphine': ('enemies/boss_seraphine.png', (384, 384)),
        'draemor':   ('characters/god_draemor.png', (384, 384)),
    },
    'weapons': {
        'ashen_edge':           ('items/weapon_abyss_blade.png', (128, 128)),
        'pyre_lance':           ('items/weapon_inferno_spear.png', (128, 128)),
        'tempest_gauntlets':    ('items/weapon_storm_gauntlets.png', (128, 128)),
        'moonthread_bow':       ('items/weapon_lunar_bow.png', (128, 128)),
        'gravewind_scythe':     ('items/weapon_soul_scythe.png', (128, 128)),
        'tidebreaker_chakrams': ('items/weapon_tide_chakrams.png', (128, 128)),
    },
    # Room props: the chest, the heal pool and the freed spirit are containers
    # built from primitives today; a single prop sprite replaces the lot.
    'props': {
        'treasure': ('items/item_chest.png', (128, 128)),
        'respite':  ('items/item_health.png', (128, 128)),
        'spirit':   ('items/item_boon.png', (128, 128)),
    },
    # Dialogue portraits. Only the three speaking NPCs exist in the package;
    # Cael reuses his own pose and the Hollow has no portrait, so the event room
    # keeps the text-only line for those two.
    'npcs': {
        'mira':       ('characters/npc_mira.png', (128, 128)),
        'korrin':     ('characters/npc_korrin.png', (128, 128)),
        'chronicler': ('characters/npc_chronicler.png', (128, 128)),
    },
}


def components(path, tol=30):
    """Split the crop into foreground blobs over its dominant border colour."""
    im = Image.open(path).convert('RGB')
    w, h = im.size
    px = im.load()
    border = []
    for x in range(w):
        border += [px[x, 0], px[x, h - 1]]
    for y in range(h):
        border += [px[0, y], px[w - 1, y]]
    bg = Counter(border).most_common(1)[0][0]
    near = lambda c: sum((a - b) ** 2 for a, b in zip(c, bg)) ** 0.5 <= tol

    bgmask = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            i = y * w + x
            if not bgmask[i] and near(px[x, y]):
                bgmask[i] = 1; q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            i = y * w + x
            if not bgmask[i] and near(px[x, y]):
                bgmask[i] = 1; q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h:
                i = ny * w + nx
                if not bgmask[i] and near(px[nx, ny]):
                    bgmask[i] = 1; q.append((nx, ny))

    seen = bytearray(w * h)
    blobs = []
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if bgmask[i] or seen[i]:
                continue
            cq = deque([(x, y)]); seen[i] = 1
            cells = []
            touches = False
            while cq:
                cx, cy = cq.popleft(); cells.append((cx, cy))
                if cx in (0, w - 1) or cy in (0, h - 1):
                    touches = True
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < w and 0 <= ny < h:
                        j = ny * w + nx
                        if not bgmask[j] and not seen[j]:
                            seen[j] = 1; cq.append((nx, ny))
            blobs.append({'cells': cells, 'n': len(cells), 'edge': touches})
    return im, bgmask, blobs, (w, h)


def extract(path, tol=30):
    """Alpha everything the border flood-fill could not reach.

    These crops are tight, so the subject usually touches all four edges. Trying
    to isolate "the subject blob" therefore throws the subject away and keeps
    fragments. Everything unconnected to the background is the subject.
    """
    im, bgmask, blobs, (w, h) = components(path, tol)
    # The subject is the high-detail blob. Sheet bleed is a flat patch of the
    # neighbouring cell, so its luminance variance is near zero; picking by area
    # alone would select that flat strip instead of the character.
    total = w * h
    cands = [b for b in blobs if b['n'] > total * 0.01]
    if not cands:
        cands = blobs
    if not cands:
        return None, 'empty'
    px = im.load()
    for b in cands:
        lum = [sum(px[x, y]) / 3 for (x, y) in b['cells']]
        b['score'] = statistics.pstdev(lum) * (b['n'] ** 0.5)
    subject = max(cands, key=lambda b: b['score'])

    # Absorb blobs that overlap the subject's box and are detailed too: a
    # detached limb or a floating prop belongs to the same character.
    sx = [c[0] for c in subject['cells']]; sy = [c[1] for c in subject['cells']]
    box = (min(sx), min(sy), max(sx), max(sy))
    keep = {id(subject)}
    for b in cands:
        if id(b) in keep:
            continue
        lum = [sum(px[x, y]) / 3 for (x, y) in b['cells']]
        if statistics.pstdev(lum) < 12:
            continue
        bx = [c[0] for c in b['cells']]; by = [c[1] for c in b['cells']]
        # Overlap test with a small tolerance for a one-pixel gap.
        if (min(bx) <= box[2] + 2 and max(bx) >= box[0] - 2 and
                min(by) <= box[3] + 2 and max(by) >= box[1] - 2):
            keep.add(id(b))

    cells = set()
    for b in cands:
        if id(b) in keep:
            cells.update(b['cells'])

    alpha = Image.new('L', (w, h), 0)
    ap = alpha.load()
    for (x, y) in cells:
        ap[x, y] = 255
    # Close small gaps so a limb or cloak that reads as a separate blob in the
    # source rejoins the body instead of becoming a floating island.
    alpha = alpha.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.4))
    bbox = alpha.getbbox()
    if bbox is None:
        return None, 'empty'
    out = im.convert('RGBA')
    out.putalpha(alpha)
    note = (f"{len(cells) / total * 100:.1f}% kept, "
            f"{len(keep)} blob(s), {len(blobs) - len(cands)} fragments ignored")
    return out.crop(bbox), note


def fit(im, size, margin=0.08):
    """Scale to fill `size` leaving a margin, keeping aspect, centred."""
    box = int(min(size) * (1 - 2 * margin))
    s = box / max(im.width, im.height)
    nw, nh = max(1, round(im.width * s)), max(1, round(im.height * s))
    im = im.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new('RGBA', size, (0, 0, 0, 0))
    canvas.paste(im, ((size[0] - nw) // 2, (size[1] - nh) // 2), im)
    return canvas


def main():
    rows = []
    for folder, items in MAP.items():
        for name, (rel, size) in items.items():
            src = os.path.join(SRC, rel)
            sprite, note = extract(src)
            if sprite is None:
                rows.append((folder, name, 'FAILED', note)); continue
            final = fit(sprite, size)
            dest = os.path.join(OUT, folder, f'{name}.png')
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            final.save(dest)
            cov = sum(1 for p in final.getchannel('A').getdata() if p > 8) / (size[0] * size[1]) * 100
            rows.append((folder, name, f'{sprite.width}x{sprite.height}->{size[0]}px', f'{note}, final {cov:.0f}%'))

    print(f"{'slot':<22} {'name':<16} {'shape':<26} {'quality'}")
    for r in rows:
        print(f"{r[0]:<22} {r[1]:<16} {r[2]:<26} {r[3]}")
    print()
    print('written:', len(rows))


main()
