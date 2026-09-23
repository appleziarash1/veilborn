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
export const PROP_IDS = ['treasure', 'respite', 'spirit'];

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
  for (const id of PROP_IDS) add(propPath(id));
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
