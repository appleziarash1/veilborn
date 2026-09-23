#!/usr/bin/env python3
"""Derive the remaining art slots from the uploaded package.

Two jobs:
  1. Upscale the 188x117 realm concepts to usable backdrops. They arrive from a
     concept sheet, so they are stacked 2x-at-a-time with a LANCZOS pass and a
     light blur/unsharp to read as painted haze rather than pixel steps.
  2. Fill the slots the package has no crop for (4 enemies, 2 bosses) by
     hue-shifting or re-colouring the nearest existing subject, so the whole set
     shares one art style instead of half sprites and half primitives.

Everything here is derived from the user's own package — nothing third-party.
"""
from PIL import Image, ImageFilter, ImageChops, ImageEnhance
import os

PKG = '/workspace/project/art-source/veilborn-package'
SPR = '/workspace/project/public/assets/sprites'
BGD = '/workspace/project/public/assets/backgrounds'

BG_MAP = {
    'ash': 'environments/env_realm_ashes.png',
    'tides': 'environments/env_realm_tides.png',
    'frost': 'environments/env_realm_frost.png',
    'shadows': 'environments/env_realm_shadows.png',
    'throne': 'environments/env_forgotten_throne.png',
    'hub': 'environments/env_shattered_gates.png',
}

# slot -> (source sprite already in SPR, output size, hue degrees, colour wash)
DERIVE = {
    'enemies/flame_spirit':    ('enemies/soul_leech.png',    (128, 128), -92,  None),
    'enemies/memory_eater':    ('enemies/ash_hound.png',     (128, 128),  58,  None),
    'enemies/veil_stalker':    ('enemies/shade_wraith.png',  (128, 128), -40,  (14, 10, 30)),
    'enemies/frost_revenant':  ('enemies/cursed_knight.png', (128, 128),   0,  (120, 180, 235)),
    'bosses/auren':            ('bosses/draemor.png',        (384, 384),  26,  (130, 190, 245)),
    'bosses/hollow':           ('bosses/seraphine.png',      (384, 384), 150,  (235, 200, 110)),
}


def upscale_bg(path, out_size=(1608, 1000)):
    """Stacked 2x LANCZOS passes, then soften the pixel steps and re-sharpen."""
    im = Image.open(path).convert('RGB')
    while im.width * 2 <= out_size[0] and im.height * 2 <= out_size[1]:
        im = im.resize((im.width * 2, im.height * 2), Image.LANCZOS)
    im = im.resize(out_size, Image.LANCZOS)
    im = im.filter(ImageFilter.GaussianBlur(1.1))
    im = im.filter(ImageFilter.UnsharpMask(radius=3, percent=55, threshold=4))
    return im


def shift_hue(rgba, deg):
    if not deg:
        return rgba
    rgb = rgba.convert('RGB')
    hsv = rgb.convert('HSV')
    h, s, v = hsv.split()
    h = h.point(lambda p: (p + int(deg / 360 * 255)) % 256)
    out = Image.merge('HSV', (h, s, v)).convert('RGB')
    out.putalpha(rgba.getchannel('A'))
    return out


def wash(rgba, color, keep=0.45):
    """Re-colour a desaturated subject: multiply a tint through its luminance."""
    if color is None:
        return rgba
    a = rgba.getchannel('A')
    grey = rgba.convert('L').convert('RGB')
    tinted = ImageChops.multiply(grey, Image.new('RGB', rgba.size, color))
    tinted = ImageEnhance.Brightness(tinted).enhance(2.1)
    mixed = Image.blend(rgba.convert('RGB'), tinted, 1 - keep)
    mixed.putalpha(a)
    return mixed


def main():
    os.makedirs(BGD, exist_ok=True)
    print('=== backgrounds ===')
    for realm, rel in BG_MAP.items():
        im = upscale_bg(os.path.join(PKG, rel))
        # WebP: art.js prefers it over PNG/SVG, and it keeps these full-bleed
        # backdrops near 100KB instead of the ~1MB a PNG needs.
        dest = os.path.join(BGD, f'{realm}.webp')
        im.save(dest, 'WEBP', quality=82, method=6)
        png = os.path.join(BGD, f'{realm}.png')
        if os.path.exists(png):
            os.remove(png)
        print(f'  {realm:<8} {rel:<42} -> {im.size}  {os.path.getsize(dest) // 1024}KB')

    print()
    print('=== derived sprites ===')
    for slot, (src, size, hue, color) in DERIVE.items():
        im = Image.open(os.path.join(SPR, src))
        im = shift_hue(im, hue)
        im = wash(im, color)
        dest = os.path.join(SPR, f'{slot}.png')
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        im.convert('RGBA').save(dest)
        cov = sum(1 for p in im.getchannel('A').getdata() if p > 24) / (size[0] * size[1]) * 100
        print(f'  {slot:<24} from {src:<28} {size[0]}px  cov {cov:.0f}%')


main()
