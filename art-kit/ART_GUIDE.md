# VEILBORN — ART PIPELINE GUIDE

Ei document ta holo **art handover spec**. Tumi ei spec onujayi chobi banao, amar
kache dao, ami game e wire kore live deploy kore debo.

> **Ami chobi dekhte pari na.** Tai ami filename, size, ar path diye auto-wire
> korbo. **Filename exact thakte hobe** — ekta typo hole ami wire korte parbo na.

---

## 0. Ekhon game kivabe render hoy (important)

Bujhe nao, tahole bujhbe keno ei spec emon:

| Jinish | Ekhon ki hoy |
|---|---|
| Realm background (5 + hub) | **Real image** load hoy (`public/assets/backgrounds/*.svg`) |
| Player, enemies, bosses, projectiles | **Procedural circle** — Phaser `add.circle()` diye code e aka |
| VFX, damage number, telegraph | **Procedural graphics** — code e aka |
| `public/assets/vfx/texture_000..079.svg` | ⚠️ **Unused** — kono code e reference nei, dead file |
| Audio | **WebAudio synth** — kono audio file nei |

**Mane:** background chara baki sob art replace korte **code change lagbe**. Ami
seta korbo — tumi sudhu file dao. Kintu tai **filename convention** strict.

---

## 1. GOLDEN RULES (ei 6 ta must)

1. **Filename exact** — `docs` er table e ja lekha, hubohu seta. Sob **lowercase
   `snake_case`**, kono space nei, kono capital nei.
   ✅ `ash_hound.png` ❌ `Ash Hound.png` ❌ `ash-hound.png` ❌ `ashHound.PNG`
2. **Transparency** — sprite e PNG/WebP, background transparent (alpha). Kalo
   box diye na.
3. **Size exact** — table er size e banao. Boro hole ami scale kore debo kintu
   quality nosto hobe. Choto hole blurry hobe.
4. **Safe margin** — sprite er charpashe 8% faka rakhо (kono body edge e lage na).
   Origin **center** dhora hoy.
5. **Dark-legible** — game ta dark. Background 50% alpha te dekhay + realm tint
   chape. Tai art **low-contrast** hobe arena area te, nahole gameplay porte
   parbe na.
6. **Original IP only** — nijer aka. Kono game/movie er asset copy na.

---

## 2. Chobi kothay save hobe

Sob kichu **`public/assets/`** er bhitore. Vite build korle ei folder hubohu
`dist/assets/` e copy hoy, ar GitHub Pages e chole jay.

```
public/assets/
├── backgrounds/     ← realm view (6 ta)
├── sprites/
│   ├── player/      ← Cael Varen
│   ├── weapons/     ← weapon select icon (6 ta)
│   ├── enemies/     ← realm enemies (10 ta)
│   ├── elites/      ← elite aura (4 ta)
│   ├── bosses/      ← bosses + gods (5 ta)
│   └── npcs/        ← shop keeper / hub
├── ui/              ← HUD, panel, button, icon
└── vfx/             ← impact, slash, explosion
```

**Tomar deliverable:** ekta folder, hubohu ei structure e. Zip kore dileo hobe.

---

## 3. Canvas ar scale (bujhe rakho)

- Game **1280 × 720** logical (16:9), `Scale.FIT`.
- Arena playfield: `x=60, y=150, w=1160, h=500` — gameplay sudhu ei band e.
- iPhone e **landscape** e khela hoy (~852px wide → 0.67× scale). Tai detail
  choto koreo chine dhorte hobe.
- Background **1600×900** (existing er moto) — 16:9 rakho, tahole thik bosbe.

---

## 4. DELIVERABLE CHECKLIST

### 4.1 Realm view / background (6 ta) — **highest priority**

Path: `public/assets/backgrounds/`

| Filename | Size | Realm | Design brief |
|---|---|---|---|
| `ash.png` | 1600×900 | Realm of Ash | Pora rajprashad, chhai er moto ash porche, bhanga archive shelf. Accent: `#ff714a` |
| `tides.png` | 1600×900 | Realm of Tides | Dube jawa mandir, niche theke alo, paani er neeche chhaya. Accent: `#63d9e8` |
| `frost.png` | 1600×900 | Realm of Frost | Jamа hоye jawa watchtower, ek jodi chokh er moto janala, borof. Accent: `#9ec6ff` |
| `shadows.png` | 1600×900 | Realm of Shadows | Adha alo, bishesh kichu nei kintu kichu chhaya ache jeta "lukano" bujhay. Accent: `#9c6cff` |
| `throne.png` | 1600×900 | The Forgotten Throne | Faka singhasan, soru soru alo, sonar dhoa. Accent: `#f1c75b` |
| `hub.png` | 1600×900 | The Shattered Gate | Bhanga pother dwar, dui duniya er majhe, misty. Neutral |

⚠️ **Arena band (y=150..650)** e beshi detail diona — gameplay er sathe meshe jabe.
Dhorar moto jinish upore (0-150) ar niche (650-900) rakho.

### 4.2 Player — Cael Varen (5 ta)

Path: `public/assets/sprites/player/`

| Filename | Size | Brief |
|---|---|---|
| `cael_idle.png` | 128×128 | Dnadhe kharа, chhoto cloak, 5 ta khot er chinh, mukh adha dekha. Base color `#f4d8c2` |
| `cael_run.png` | sheet 768×128 (6 frame) | Same, dokhiner dike doura |
| `cael_dash.png` | 128×128 | Blur/streak, dash moment |
| `cael_hurt.png` | 128×128 | Pithe jhuke, laal flash |
| `cael_death.png` | 128×128 | Hatu ganu, chhaya te meshe jacche |

Lore: *Cael Varen wakes with five wounds and no memory of the sixth.*
"Sixth wound" ta art e ekta faka/dhoya chinh hisebe dekhate paro — eita story clue.

### 4.3 Weapons (6 ta) — weapon select icon

Path: `public/assets/sprites/weapons/` · Size **256×256**, transparent

| Filename | Weapon | Accent | Lore hint |
|---|---|---|---|
| `ashen_edge.png` | Ashen Edge | `#f0d7bd` | Chhoto blade, pora kalo dag |
| `pyre_lance.png` | Pyre Lance | `#ff714a` | Lomba borsha, agun er chhoa |
| `tempest_gauntlets.png` | Tempest Gauntlets | `#7be7ff` | Dui mutthi, bijli |
| `moonthread_bow.png` | Moonthread Bow | `#d4b5ff` | Dhanuk, tar er moto string |
| `gravewind_scythe.png` | Gravewind Scythe | `#9aa2b4` | Choto kachi, chhaya |
| `tidebreaker_chakrams.png` | Tidebreaker Chakrams | `#63d9e8` | Dui ring, dubа loha |

### 4.4 Realm enemies (10 ta) — **top-down, size 128×128**

Path: `public/assets/sprites/enemies/` · Transparent · Origin center

| Filename | Enemy | Behavior | Color | Brief |
|---|---|---|---|---|
| `shade_wraith.png` | Shade Wraith | chaser | `#8f70d0` | Ghomta, faka chokh, bhase |
| `bone_soldier.png` | Bone Soldier | chaser | `#bcb7aa` | Har, bhanga taloyar |
| `ash_hound.png` | Ash Hound | charger | `#d45e58` | Char pа, chhoto, agun er mukh |
| `void_archer.png` | Void Archer | shooter | `#6e72a8` | Dhanuk tana, faka chokh |
| `soul_leech.png` | Soul Leech | drainer | `#6fd8a6` | Kirmi/leech, sobuj alo |
| `flame_spirit.png` | Flame Spirit | exploder | `#ff7a45` | Bhalo, phate jay |
| `frost_revenant.png` | Frost Revenant | shooter | `#75b8dc` | Boro, jamа, borof churi |
| `cursed_knight.png` | Cursed Knight | **guardian** | `#766b7d` | Boro dhal, dhime chole, stomp |
| `memory_eater.png` | Memory Eater | teleporter | `#a05ad8` | Boro mukh, khay, disappear |
| `veil_stalker.png` | Veil Stalker | assassin | `#4b3d67` | Lomba, patla, lukie thake |

**Guardian** = slow tanky stomp archetype. `cursed_knight` er movement ta etar
sathe match kore — art e heavy/bulky feel dao.

### 4.5 Elite aura (4 ta)

Path: `public/assets/sprites/elites/` · Size **192×192** transparent overlay

| Filename | Elite | Color | Effect |
|---|---|---|---|
| `shielded.png` | Shielded | `#8fb4ff` | Nil ring/armor plate |
| `frenzied.png` | Frenzied | `#ff8a5c` | Laal vapor, kaanp |
| `volatile.png` | Volatile | `#f1c75b` | Fetfa, bright |
| `warded.png` | Warded | `#9c6cff` | Rune circle |

Eta enemy er upore overlay hoy, tai **adha transparent** rakho.

### 4.6 Bosses + Gods (5 ta) — **size 384×384**

Path: `public/assets/sprites/bosses/` · Transparent

| Filename | Name | Color / Accent | Phases | Patterns | Brief |
|---|---|---|---|---|---|
| `zyther.png` | Zyther, Lord of Ashes | `#d4402f` / `#ff714a` | 2 | fan, charge, burnArena | Pora crown, agun churi, chhai er porda |
| `seraphine.png` | Seraphine, Queen of the Drowned | `#3aa8d8` / `#63d9e8` | 2 | spiral, summonAdds, wave | Lomba chul paani te, mukhe gaan |
| `auren.png` | Auren, the Last Watcher | `#7fa8e0` / `#9ec6ff` | 3 | snipe, frostNova, mirror | Ekta boro chokh, borof, nishchol |
| `draemor.png` | **Draemor, God of the Forgotten** | `#7a3fd0` / `#9c6cff` | 3 | teleport, shadowClone, voidPull | Mukh nei / adha mukh, dhoya, name lekha chilo moche geche |
| `hollow.png` | **The Hollow, The Empty King** | `#c9a24a` / `#f1c75b` | 3 | fan, voidPull, frostNova, mirror, shadowClone | Faka singhasan, sonar armor, bhitor faka |

**Gods** = `draemor` (literally "God of the Forgotten") ar `hollow` (Empty King).
Ei dui ta **sabcheye boro story weight** — art e majestic + broken feel dao.

⚠️ Boss radius 54 (game e). Art e 384×384 dile ami 54*2 = 108px e scale korbo.
Mane detail hariye jabe — tai **bold shapes** use koro, soro detail na.

### 4.7 NPC / Shop (2 ta)

Path: `public/assets/sprites/npcs/` · Size **320×320**

| Filename | Kar jonno | Brief |
|---|---|---|
| `keeper.png` | Memory shop keeper | Purono, mukh dheke, hate shard/ kristal. Veil er rokhok |
| `mira.png` | Mira (story guide) | Chhoto, chokh boro, worried. Story te "He burned the archive to keep you from reading yourself" bole |

⚠️ **Note:** Hub e ekhon kono NPC nei — sudhu Memory upgrade list ache. NPC art
dile **ami code likhe** Hub e boshabo. Seta ami korte parbo, kintu eita ekta
**notun feature**, tai eita **optional** — age 4.1-4.6 koro.

### 4.8 UI (optional, pore)

Path: `public/assets/ui/`

| Filename | Size | Kaj |
|---|---|---|
| `panel.png` | 512×512 | 9-slice panel (Memory list, reward screen) |
| `panel_light.png` | 512×512 | Highlighted panel |
| `btn.png` | 256×96 | Button normal |
| `btn_hover.png` | 256×96 | Button hover |
| `hud_frame.png` | 512×96 | HP/energy bar frame |
| `shard.png` | 64×64 | Shard icon (currency) |
| `boon_common.png` `boon_rare.png` `boon_epic.png` `boon_legendary.png` | 64×64 | Rarity chinh |

### 4.9 VFX (optional, pore)

Path: `public/assets/vfx/` — sheet akare dao, frame 128×128

| Filename | Frames | Kaj |
|---|---|---|
| `impact.png` | 6 | Hit spark |
| `slash.png` | 6 | Melee arc |
| `explosion.png` | 8 | Exploder / nova |
| `death_puff.png` | 6 | Enemy more jaoar somoy |

---

## 5. Realm palette (coherence er jonno)

| Realm | Tint | Accent |
|---|---|---|
| Ash | `#241416` | `#ff714a` |
| Tides | `#101f2b` | `#63d9e8` |
| Frost | `#151c2c` | `#9ec6ff` |
| Shadows | `#171324` | `#9c6cff` |
| Throne | `#100d17` | `#f1c75b` |
| Hub | `#0c0b12` | `#9c6cff` |

UI text color `#f4f1ff`, muted `#aaa4bd`. Font ekhon `Georgia, serif`.

---

## 6. iOS / PWA size budget

| Jinish | Limit |
|---|---|
| Ek chobi | ≤ 2 MB (background), ≤ 500 KB (sprite) |
| Total `public/assets/` | **≤ 25 MB** (PWA install ar offline cache er jonno) |
| Format | Sprite → **PNG** (alpha) · Background → **WebP** (chhoto) othoba PNG |
| Dimension | 2 er power e thakle bhalo (128, 256, 384, 512) |

WebP dile PNG er cheye ~40% chhoto hoy, iOS 14+ support kore. Background er
jonno WebP recommend.

---

## 7. Amake kivabe debe

**Option A (best):** `public/assets/` er exact structure e folder banao, zip koro,
ar amake bolo file ta kothay. Ami extract kore wire korbo.

**Option B:** Ekta folder e sob rakho, nam exact rakho, ami nijei sajabo.

**Option C:** Chhoto chhoto batch e dao (age background, porе enemies) — tahole
ami dhire dhire live update korte parbo, ekbare sob na.

**Khub important:** ekta **`MANIFEST.txt`** sathe dao jekhane likhbe:
```
ash.png | 1600x900 | AI generated | own design
ash_hound.png | 128x128 | AI generated | own design
```
Eta diye ami confirm korbo je sob original IP, kono copy na.

---

## 8. Ami ki korbo (tomar por)

1. File gulo `public/assets/` er thik jaigay boshabo
2. Code e load korbo — `Boot.js` e `this.load.image(...)` add
3. Entity render badle sprite use korbo:
   - `src/entities/enemy.js` — `add.circle()` → `add.sprite()`
   - `src/entities/boss.js` — same
   - `src/entities/player.js` — same
   - `src/world/arena.js` — background path update
4. **Fallback rakhbo** — jodi kono chobi na thake, purono procedural version e
   chole jabe. Mane game kokhono bhange na.
5. Service worker cache version bump korbo (nahole purono chobi cache hoye thakbe)
6. `npm test` — full 48-test suite chalabo
7. Build + GitHub Pages e push (auto-deploy hoye jabe)
8. Live URL e verify korbo

---

## 9. Priority order (ekbarе sob na koro)

| Step | Ki | Koto file | Kano age |
|---|---|---|---|
| **1** | Realm backgrounds (§4.1) | 6 | Sobcheye boro visual impact, ar code change kom |
| **2** | Enemies (§4.4) | 10 | Gameplay e protita room e dekhay |
| **3** | Bosses + gods (§4.6) | 5 | Story er core, boss fight memorable hoy |
| **4** | Player (§4.2) | 5 | Nijer character |
| **5** | Weapons (§4.3) | 6 | Weapon select screen |
| **6** | Elites (§4.5) | 4 | Bonus depth |
| **7** | NPC/shop (§4.7) | 2 | Notun feature, ami code likhbo |
| **8** | UI + VFX (§4.8, §4.9) | ~15 | Polish |

**Step 1 koro ar amake dao** — ami wire kore live kore debo, tumi dekhe
decision nebe jemon chao.

---

## 10. Quick reference — sob filename ek jagay

```
backgrounds: ash tides frost shadows throne hub
player:      cael_idle cael_run cael_dash cael_hurt cael_death
weapons:     ashen_edge pyre_lance tempest_gauntlets moonthread_bow
             gravewind_scythe tidebreaker_chakrams
enemies:     shade_wraith bone_soldier ash_hound void_archer soul_leech
             flame_spirit frost_revenant cursed_knight memory_eater veil_stalker
elites:      shielded frenzied volatile warded
bosses:      zyther seraphine auren draemor hollow
npcs:        keeper mira
```

Extension: `.png` (sprite) / `.webp` othoba `.png` (background).

---

## 11. Story reference (art er jonno)

**Hero:** Cael Varen — "The Veilborn". Panch khot niye uthe, chhoto khot er
kono mone nei.

**Hub:** The Shattered Gate — "A broken sanctuary between memory and oblivion."

**Realms ar tad er boss:**
- **Ash** → Zyther archive pora diyechilo jate tumi nijeke porte na paro
- **Tides** → Seraphine jake bhalobashe take dubaay, jate se kokhono na jaay
- **Frost** → Auren kokhono chokh palak korlo na; nijer nam jomiye rekhechilo
- **Shadows** → Draemor er nam muchhe geche; "You do not remember me"
- **Throne** → The Hollow: "You were never meant to forget me."

**Charakter:** Mira (guide), Korrin, The Chronicler, The Hollow.

**Char ending:** Sealed Veil · Open Veil · New Veil · **True: The Veilborn**

Ei lore diye art design koro — protita boss er visual er modhye tar shasti
dekhte hobe. Jemon Zyther = agun + pora archive; Auren = ekta boro nishchol chokh.

---

**Kono prashna thakle bolo.** Chobi na banate parleo problem nei — tumi bolo,
ami purono procedural style ta aro bhalo kore dite parbo.
