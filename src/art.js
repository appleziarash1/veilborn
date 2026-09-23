// Art layer: optional hand-drawn sprite overrides for the procedural shapes.
//
// The game renders entities as Phaser primitives so it is always playable with
// no art installed. Dropping a correctly named file into public/assets/ makes
// that entity use the sprite instead — no code change required. Every lookup
// falls back to the primitive, so a missing file can never break a run.
//
// Only files listed in the generated manifest are requested, so a partly
// finished art pass produces no 404s. Filenames and sizes: docs/ART_GUIDE.md.
//
// A sprite replaces the visual only. Hitboxes, radii and behaviour stay driven
// by config, so art can never change how the game plays.
import { ART_FILES } from './art-manifest.js';

// Backgrounds ship as SVG today; hand-drawn replacements are WebP or PNG.
const BG_FORMATS = ['webp', 'png', 'svg'];
const SPRITE_FORMATS = ['webp', 'png'];

export function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// First candidate path that the manifest says exists, else null.
function pick(candidates) {
  for (const path of candidates) if (ART_FILES.has(path)) return path;
  return null;
}

const spriteCandidates = (folder, name) =>
  SPRITE_FORMATS.map((ext) => `assets/sprites/${folder}/${name}.${ext}`);

export const backgroundPath = (realmId) =>
  pick(BG_FORMATS.map((ext) => `assets/backgrounds/${realmId}.${ext}`));

export const playerPath = (pose) => pick(spriteCandidates('player', `cael_${pose}`));
export const enemyPath = (name) => pick(spriteCandidates('enemies', slugify(name)));
export const bossPath = (id) => pick(spriteCandidates('bosses', slugify(id)));
export const elitePath = (id) => pick(spriteCandidates('elites', slugify(id)));
export const weaponPath = (id) => pick(spriteCandidates('weapons', slugify(id)));
export const npcPath = (id) => pick(spriteCandidates('npcs', slugify(id)));
export const propPath = (id) => pick(spriteCandidates('props', slugify(id)));
// VFX and UI live directly under assets/, not under assets/sprites/.
const topCandidates = (folder, name) =>
  SPRITE_FORMATS.map((ext) => `assets/${folder}/${name}.${ext}`);
export const vfxPath = (id) => pick(topCandidates('vfx', slugify(id)));
export const uiPath = (id) => pick(topCandidates('ui', slugify(id)));

// Multi-frame strips ship as one horizontal sheet. The frame counts are fixed by
// the art pass (docs/ART_GUIDE.md), so they live here rather than being sniffed
// at runtime — a sheet is only treated as animated when its width matches.
export const VFX_FRAMES = { slash: 6, impact: 6, explosion: 8, death_puff: 6 };

// Registers a strip's spritesheet and animation under derived keys. Phaser
// refuses to register a second texture under a key that already exists (it logs
// an error and returns null), so the sheet cannot be sliced in place under the
// loaded image's key — hence the separate `__sheet` / `__anim` keys.
function ensureVfxAnimation(scene, path, id) {
  const frames = VFX_FRAMES[id];
  const src = scene.textures.get(path).getSourceImage();
  if (!frames || !src || src.width !== src.height * frames) return null;
  const sheetKey = `${path}__sheet`;
  const animKey = `${path}__anim`;
  if (!scene.textures.exists(sheetKey)) {
    scene.textures.addSpriteSheet(sheetKey, src, { frameWidth: src.height, frameHeight: src.height });
  }
  if (!scene.anims.exists(animKey)) {
    scene.anims.create({
      key: animKey,
      frames: scene.anims.generateFrameNumbers(sheetKey, { start: 0, end: frames - 1 }),
      frameRate: 22,
      hideOnComplete: false,
    });
  }
  return { sheetKey, animKey };
}

// Slice every effect sheet once, after the loader batch has finished.
export function prepareArt(scene) {
  for (const id of VFX_IDS) {
    const path = vfxPath(id);
    if (path && scene.textures.exists(path)) ensureVfxAnimation(scene, path, id);
  }
}

// VFX sheet loader. Returns a bare Image when the single-frame art is all that
// exists, so an effect is always visible even with a partial art pass.
export function vfxImage(scene, id, size) {
  const path = vfxPath(id);
  if (!path || !scene.textures.exists(path)) return null;
  const anim = ensureVfxAnimation(scene, path, id);
  if (anim) return scene.add.sprite(0, 0, anim.sheetKey).setDisplaySize(size, size).play(anim.animKey);
  return scene.add.image(0, 0, path).setDisplaySize(size, size);
}

// Static UI art (buttons, HUD frame, shard, boon sigils). Optional like the
// rest: callers keep their drawn panel when this returns null.
export function uiImage(scene, id, w, h) {
  const path = uiPath(id);
  if (!path || !scene.textures.exists(path)) return null;
  const img = scene.add.image(0, 0, path);
  if (w != null) img.setDisplaySize(w, h == null ? w : h);
  return img;
}

// Room prop sprite for the chest / respite / spirit containers. Returns null
// when the art pass has not produced one, so callers keep their primitives.
export function propImage(scene, id, size) {
  const path = propPath(id);
  if (!path || !scene.textures.exists(path)) return null;
  return scene.add.image(0, 0, path).setDisplaySize(size, size);
}

// Weapon icon for the selection cards. Art is optional like everything else,
// so callers keep their colour swatch when this returns null.
export function weaponIcon(scene, id, size) {
  const path = weaponPath(id);
  if (!path || !scene.textures.exists(path)) return null;
  return scene.add.image(0, 0, path).setDisplaySize(size, size);
}

// Content ids the loader needs, kept as plain lists so art.js has no import
// cycle with content.js or config.js.
export const ENEMY_NAMES = [
  'Shade Wraith', 'Bone Soldier', 'Ash Hound', 'Void Archer', 'Soul Leech',
  'Flame Spirit', 'Frost Revenant', 'Cursed Knight', 'Memory Eater', 'Veil Stalker',
];
export const BOSS_IDS = ['zyther', 'seraphine', 'auren', 'draemor', 'hollow'];
export const ELITE_IDS = ['shielded', 'frenzied', 'volatile', 'warded'];
export const WEAPON_IDS = [
  'ashen_edge', 'pyre_lance', 'tempest_gauntlets', 'moonthread_bow',
  'gravewind_scythe', 'tidebreaker_chakrams',
];
export const REALM_IDS = ['ash', 'tides', 'frost', 'shadows', 'throne'];
export const PLAYER_POSES = ['idle', 'run', 'dash', 'hurt', 'death'];
// Spoken NPCs from the dialogue pool. Cael and the Hollow have no portrait in
// the art pass, so the event room falls back to its text-only line for those.
export const NPC_IDS = ['mira', 'korrin', 'chronicler'];
// The Keeper is not a dialogue speaker — it only appears in the Hub — so it is
// loaded separately and never asked for a portrait.
export const HUB_NPC_IDS = ['keeper'];
export const PROP_IDS = ['treasure', 'respite', 'spirit'];
export const VFX_IDS = ['slash', 'impact', 'explosion', 'death_puff'];
// Only the UI art that is a complete tile. panel/panel_light/boon_common/
// boon_legendary in the pack are atlas slivers, not usable panels, so they are
// deliberately absent — the drawn panels stay in use for those.
export const UI_IDS = ['btn', 'btn_hover', 'hud_frame', 'shard', 'boon_rare', 'boon_epic'];

// Loader queue keyed by the path itself, which keeps each file loaded once even
// when two slots share it.
export function queueArt(scene) {
  const add = (path) => {
    if (path && !scene.textures.exists(path)) scene.load.image(path, path);
  };
  for (const id of [...REALM_IDS, 'hub']) add(backgroundPath(id));
  for (const pose of PLAYER_POSES) add(playerPath(pose));
  for (const name of ENEMY_NAMES) add(enemyPath(name));
  for (const id of BOSS_IDS) add(bossPath(id));
  for (const id of ELITE_IDS) add(elitePath(id));
  for (const id of WEAPON_IDS) add(weaponPath(id));
  for (const id of NPC_IDS) add(npcPath(id));
  for (const id of HUB_NPC_IDS) add(npcPath(id));
  for (const id of PROP_IDS) add(propPath(id));
  for (const id of VFX_IDS) add(vfxPath(id));
  for (const id of UI_IDS) add(uiPath(id));
}

// Textures are keyed by path, so these are plain existence checks.
export const artKey = (path) => (path && ART_FILES.has(path) ? path : null);
export const hasArt = (path) => !!(path && ART_FILES.has(path));

// Hit-flash and charge tells. Primitives expose setFillStyle; Images expose
// setTintFill/clearTint. Callers pass the entity's base colour so the same call
// restores it whichever object type is in use.
export function tintBody(obj, color, baseColor) {
  if (!obj) return;
  if (typeof obj.setFillStyle === 'function') {
    obj.setFillStyle(color == null ? baseColor : color);
    return;
  }
  if (typeof obj.setTintFill === 'function') {
    if (color == null) obj.clearTint();
    else obj.setTintFill(color);
  }
}
