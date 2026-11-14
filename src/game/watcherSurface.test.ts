import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import * as THREE from 'three';
import { WATCHER_ATLAS_SIZE, WATCHER_ATLAS_TILES, type WatcherSurface } from './watcherAtlas';
import { createWatcherSurface, mapWatcherGeometry } from './watcherSurface';

test('atlas mapping only changes UVs, preserving every original vertex, normal and triangle', () => {
  const original = new THREE.SphereGeometry(1, 10, 7);
  for (const region of Object.keys(WATCHER_ATLAS_TILES) as WatcherSurface[]) {
    const geometry = mapWatcherGeometry(original, region);
    assert.deepEqual(geometry.getAttribute('position').array, original.getAttribute('position').array);
    assert.deepEqual(geometry.getAttribute('normal').array, original.getAttribute('normal').array);
    assert.deepEqual(geometry.index!.array, original.index!.array);
    const [x, y, width, height] = WATCHER_ATLAS_TILES[region];
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
      const px = uv.getX(i) * WATCHER_ATLAS_SIZE;
      const py = (1 - uv.getY(i)) * WATCHER_ATLAS_SIZE;
      assert.ok(px >= x && px <= x + width && py >= y && py <= y + height, region);
    }
    geometry.dispose();
  }
  // The shared source must remain untouched by per-part UV adaptation.
  assert.equal(original.getAttribute('uv').getY(0), 1);
  original.dispose();
});

test('skin uses correctly colored PBR maps, one shared ORM and only three loads across models', () => {
  const textures: THREE.Texture[] = [];
  const urls: string[] = [];
  const loader = { load(url: string) { urls.push(url); const texture = new THREE.Texture<HTMLImageElement>(); textures.push(texture); return texture; } };
  const first = createWatcherSurface(loader);
  const second = createWatcherSurface(loader);
  assert.equal(urls.length, 3);
  assert.equal(first.material.map, second.material.map);
  assert.equal(first.material.map!.colorSpace, THREE.SRGBColorSpace);
  assert.equal(first.material.normalMap!.colorSpace, THREE.NoColorSpace);
  assert.equal(first.material.roughnessMap!.colorSpace, THREE.NoColorSpace);
  assert.equal(first.material.roughnessMap, first.material.aoMap);
  assert.equal(first.material.roughnessMap, first.material.metalnessMap);
  assert.equal(first.material.aoMap!.channel, 0);
  assert.equal(first.material.metalness, 0);
  assert.equal(first.material.emissive.getHex(), 0);
  assert.equal(first.material.transparent, false);
  for (const url of urls) assert.ok(existsSync(`public${url}`), `Missing production asset: ${url}`);
  let disposed = 0;
  textures.forEach(texture => texture.addEventListener('dispose', () => disposed++));
  first.dispose();
  assert.equal(disposed, 0, 'another live model still uses the textures');
  second.dispose();
  assert.equal(disposed, 3);
  second.dispose();
  assert.equal(disposed, 3, 'disposal is idempotent');
  const third = createWatcherSurface(loader);
  assert.equal(urls.length, 6, 'recreation loads fresh, non-disposed GPU resources');
  third.dispose();
});

