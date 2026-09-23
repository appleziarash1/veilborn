// Publishes the art kit into public/art-kit/ and builds veilborn-art-kit.zip,
// so the kit is downloadable from the live site instead of only from git.
//
// The zip is written by hand (store method, no compression) to avoid adding a
// dependency. The kit is a few KB of text and PNG/WebP art is already
// compressed, so deflate would buy nothing.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'art-kit');
const OUT = join(ROOT, 'public', 'art-kit');
const ZIP_NAME = 'veilborn-art-kit.zip';

// Files pulled in from elsewhere in the repo so the kit is self-contained.
// ART_GUIDE.md already lives in art-kit/, so nothing is needed here today.
const EXTRA = [];

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

// Minimal store-only zip. `entries` is [{ name, data, dir }] in write order.
function buildZip(entries) {
  const parts = [];
  const central = [];
  let offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const data = e.dir ? Buffer.alloc(0) : e.data;
    const crc = e.dir ? 0 : crc32(data);
    const size = data.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);      // version needed
    local.writeUInt16LE(0, 6);       // flags
    local.writeUInt16LE(0, 8);       // method: store
    local.writeUInt16LE(0, 10);      // mod time
    local.writeUInt16LE(0x21, 12);   // mod date -> 1980-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);   // compressed size
    local.writeUInt32LE(size, 22);   // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);      // extra length

    parts.push(local, nameBuf, data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);         // version made by
    cd.writeUInt16LE(20, 6);         // version needed
    cd.writeUInt16LE(0, 8);          // flags
    cd.writeUInt16LE(0, 10);         // method
    cd.writeUInt16LE(0, 12);         // mod time
    cd.writeUInt16LE(0x21, 14);      // mod date
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(size, 20);
    cd.writeUInt32LE(size, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);         // extra
    cd.writeUInt16LE(0, 32);         // comment
    cd.writeUInt16LE(0, 34);         // disk
    cd.writeUInt16LE(0, 36);         // internal attrs
    cd.writeUInt32LE(e.dir ? 0x10 : 0, 38); // external attrs: MS-DOS directory
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);

    offset += local.length + nameBuf.length + size;
  }

  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, cdBuf, end]);
}

function walk(dir, base = dir, acc = []) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      acc.push({ name: relative(base, full).split(sep).join('/') + '/', dir: true });
      walk(full, base, acc);
    } else {
      acc.push({ name: relative(base, full).split(sep).join('/'), data: readFileSync(full) });
    }
  }
  return acc;
}

function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const entries = [];
  const copy = (relPath, data) => {
    const dest = join(OUT, relPath);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, data);
  };

  // Directory entries go in first so extracting the zip recreates the folder
  // layout even where a folder is still empty.
  const all = walk(SRC);
  entries.push(...all.filter((e) => e.dir));
  for (const e of all) {
    if (e.dir) continue;
    copy(e.name, e.data);
    entries.push(e);
  }
  for (const [from, to] of EXTRA) {
    const data = readFileSync(join(ROOT, from));
    copy(to, data);
    entries.push({ name: to, data });
  }

  const zip = buildZip(entries);
  writeFileSync(join(OUT, ZIP_NAME), zip);
  writeFileSync(join(ROOT, ZIP_NAME), zip);
  console.log(`[art-kit] published ${entries.filter((e) => !e.dir).length} file(s), zip ${(zip.length / 1024).toFixed(1)} KB -> public/art-kit/`);
}

main();
