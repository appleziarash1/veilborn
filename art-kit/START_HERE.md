# VEILBORN ART KIT — START HERE

Ei folder ta tomar artwork bananer jonno ready kit. Kichu install korte hobe na.

---

## 1. Prothome ei file ta browser e kholo

**`reference.html`** — double click koro. Eta ekta visual spec sheet:
- Realm er color palette
- Canvas layout (kothay kothay chobi bosbe)
- Sprite er **actual size** box (tumi oi box er modhye aka)
- Sob filename er tick-off list

Eta khola rekhe aka — size ar color match korte shohoj hobe.

---

## 2. Tarpor ja ja ache

| File | Ki kaj |
|---|---|
| `START_HERE.md` | Ei file — quick start |
| `reference.html` | Visual spec sheet (browser e kholo) |
| `ART_GUIDE.md` | Pura detailed spec — kono prashna thakle ekhane dekho |
| `CHECKLIST.md` | Kaj sesh korar tick-off list |
| `MANIFEST.txt` | Protita chobi er detail likho (provenance) |
| `assets/` | **Ei folder e tomar chobi rakho** |

---

## 3. Chobi kothay rakho

`assets/` er bhitore realm onujayi folder ache. Sob **lowercase `snake_case`**,
kono space na.

```
assets/
├── backgrounds/   → ash.png  tides.png  frost.png  shadows.png  throne.png  hub.png
├── sprites/
│   ├── player/    → cael_idle.png  cael_run.png  cael_dash.png  ...
│   ├── weapons/   → ashen_edge.png  pyre_lance.png  ...
│   ├── enemies/   → shade_wraith.png  ash_hound.png  ...
│   ├── elites/    → shielded.png  frenzied.png  ...
│   ├── bosses/    → zyther.png  seraphine.png  auren.png  draemor.png  hollow.png
│   └── npcs/      → keeper.png  mira.png
├── ui/            → panel.png  btn.png  shard.png  ...
└── vfx/           → impact.png  slash.png  explosion.png  ...
```

⚠️ **Filename exact** — ekta typo hole game oita chinbe na, chupchap purono
procedural style e chole jabe.

---

## 4. Size (must)

| Kiser | Size |
|---|---|
| Background (realm view) | **1600 × 900** |
| Player | 128 × 128 |
| Weapon icon | 256 × 256 |
| Enemy | 128 × 128 |
| Elite aura | 192 × 192 |
| **Boss / God** | **384 × 384** |
| NPC | 320 × 320 |

**Format:** background → `.webp` (chhoto) othoba `.png`
sprite → `.png` (transparent background, must)

---

## 5. Golden rules (5 ta)

1. **Filename exact** — guide er moto hubohu
2. **Transparent background** — sprite e kalo box diye na
3. **Size exact** — boro/chhoto hole quality nosto hobe
4. **Dark-legible** — game dark; background 50% alpha te dekhay, tai gameplay
   area te beshi detail dio na
5. **Original IP only** — nijer aka. Kono game/movie er asset copy na

---

## 6. Ki bhabe aka shuru korbe

**Age background banao (§4.1)** — 6 ta. Kano:
- Sobcheye boro visual impact
- Code change kom
- Realm er mood set kore dey

Tarpor enemies (10 ta), tarpor bosses (5 ta).

Ekbare sob na koro. Ekta step sesh kore amake dao — ami wire kore live kore
debo, tumi dekhe bolo thik ache kina. Tarpor porer step.

---

## 7. Amake ki bhabe debe

1. Ei `assets/` folder e chobi gulo rakho
2. `MANIFEST.txt` puro koro (ki diye banale lekho)
3. Pura folder ta zip koro
4. Amake bolo — ami extract kore game e boshiye live deploy korbo

Amake chobi dekhte na dileo cholbe — ami filename diye auto-wire kori.

---

## 8. Kono prashna?

`ART_GUIDE.md` e sob detail ache — realm er lore, protita boss er design brief,
palette, size budget, sob.

Confused hole bolo. Ar jodi chobi na banate paro, problem nei — ami purono
procedural style ta aro sundor kore dite parbo.
