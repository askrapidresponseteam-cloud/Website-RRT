#!/usr/bin/env node
/**
 * Makes assets/network/india-districts.json, the map on /network: India's
 * districts and states, drawn small enough for a phone.
 *
 * Source: the app's own district boundaries (Census of India 2011,
 * backend/functions/assets/dists11.geojson, the same file as the app's
 * assets/data/dists11.geojson), keyed exactly as the app and backend key a
 * person's district (backend/functions/lib/district_geo.js districtKey), so
 * every count from GET /public/network lands on its district.
 *
 * Shapes are simplified with mapshaper, keeping shared borders shared (no
 * gaps between districts), coordinates to 3 decimals (about 100 m).
 *
 *   npm i --no-save mapshaper@0.6     (once, anywhere; not a site dependency)
 *   node scripts/build-network-map.js [path/to/node_modules/mapshaper]
 *
 * Output: { districts: GeoJSON (k key, n name, s today's state), states: GeoJSON (s) }.
 * scripts/test-network.js checks that every district key is in it.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = path.join(ROOT, 'backend', 'functions', 'assets', 'dists11.geojson');
const OUT = path.join(__dirname, '..', 'assets', 'network', 'india-districts.json');
const { districtKey } = require(path.join(ROOT, 'backend', 'functions', 'lib', 'district_geo.js'));
// Today's states (Telangana, Ladakh; Census spellings fixed), one English name,
// exactly as GET /public/network names them, so a name that is a district in
// two states (West: Delhi and Sikkim) is drawn in the right one.
const { stateFromCensus } = require(path.join(ROOT, 'backend', 'functions', 'public_network.js'));
const STATES = require(path.join(ROOT, 'backend', 'functions', 'india-states.js'));

let mapshaper;
try { mapshaper = require(process.argv[2] || 'mapshaper'); } catch (e) {
  console.error('needs mapshaper: npm i --no-save mapshaper@0.6, then pass its folder');
  process.exit(1);
}

(async () => {
  const gj = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  gj.features = gj.features.filter((f) => f && f.geometry && f.properties && f.properties.DISTRICT).map((f) => ({
    type: 'Feature',
    geometry: f.geometry,
    properties: (() => {
      const k = districtKey(f.properties.DISTRICT);
      return { k, n: String(f.properties.DISTRICT).trim(), s: stateFromCensus(k, f.properties.ST_NM, STATES) };
    })(),
  }));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rrt-map-'));
  const input = path.join(tmp, 'in.json');
  fs.writeFileSync(input, JSON.stringify(gj));
  const run = (cmd) => new Promise((resolve, reject) => mapshaper.runCommands(cmd, (e) => (e ? reject(e) : resolve())));
  const dOut = path.join(tmp, 'd.json');
  const sOut = path.join(tmp, 's.json');
  await run(`-i "${input}" -simplify 16% keep-shapes -clean -o "${dOut}" format=geojson precision=0.001`);
  await run(`-i "${dOut}" -dissolve s -o "${sOut}" format=geojson precision=0.001`);
  const districts = JSON.parse(fs.readFileSync(dOut, 'utf8'));
  const states = JSON.parse(fs.readFileSync(sOut, 'utf8'));
  const out = { source: 'Census of India 2011 district boundaries (app and backend dists11.geojson), simplified', districts, states };
  fs.writeFileSync(OUT, JSON.stringify(out));
  fs.rmSync(tmp, { recursive: true, force: true });
  const keys = new Set(districts.features.map((f) => f.properties.k));
  console.log(`${path.relative(process.cwd(), OUT)}: ${districts.features.length} districts (${keys.size} keys), ${states.features.length} states, ${Math.round(fs.statSync(OUT).size / 1024)} KB`);
})().catch((e) => { console.error(e); process.exit(1); });
