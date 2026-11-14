import * as THREE from 'three';
import { WATCHER_ATLAS_SIZE, WATCHER_ATLAS_TILES, type WatcherSurface } from './watcherAtlas';

type TextureLoader = Pick<THREE.TextureLoader, 'load'>;
const browserLoader = typeof document === 'undefined' ? null : new THREE.TextureLoader();
const caches = new Map<TextureLoader, { textures: THREE.Texture[]; references: number }>();

/** Only UVs differ. Vertex positions, normals, indices and subdivision stay intact. */
export function mapWatcherGeometry(source: THREE.SphereGeometry, surface: WatcherSurface) {
  const geometry = source.clone();
  const uv = geometry.getAttribute('uv');
  const [x, y, width, height] = WATCHER_ATLAS_TILES[surface];
  for (let i = 0; i < uv.count; i++) {
    // Sphere pole UV offsets can slightly exceed 0..1; never sample adjacent tiles.
    const u = THREE.MathUtils.clamp(uv.getX(i), 0, 1);
    const v = THREE.MathUtils.clamp(uv.getY(i), 0, 1);
    uv.setXY(i,
      (x + .5 + u * (width - 1)) / WATCHER_ATLAS_SIZE,
      1 - (y + .5 + (1 - v) * (height - 1)) / WATCHER_ATLAS_SIZE,
    );
  }
  uv.needsUpdate = true;
  return geometry;
}

/** Three GPU images shared across every body part and concurrent model instance. */
export function createWatcherSurface(loader: TextureLoader | null = browserLoader) {
  let cached = loader ? caches.get(loader) : undefined;
  if (loader && !cached) {
    const base = `${import.meta.env?.BASE_URL ?? '/'}monster/textures/`;
    const textures = ['watcher-albedo.jpg', 'watcher-normal.png', 'watcher-orm.png'].map((file, index) => {
      const texture = loader.load(`${base}${file}`, undefined, undefined, () => {
        console.error(`[Watcher] No se pudo cargar la textura: ${file}`);
      });
      texture.name = file;
      texture.colorSpace = index === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.flipY = true; // Native SphereGeometry UVs, not GLTFLoader UVs.
      texture.channel = 0;
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = 2;
      return texture;
    });
    cached = { textures, references: 0 };
    caches.set(loader, cached);
  }
  if (cached) cached.references++;
  const [albedo, normal, orm] = cached?.textures ?? [];
  const material = new THREE.MeshStandardMaterial({
    name: 'Watcher · deteriorated skin',
    color: 0xffffff,
    map: albedo ?? null,
    normalMap: normal ?? null,
    normalScale: new THREE.Vector2(.4, .4),
    roughnessMap: orm ?? null,
    roughness: 1,
    aoMap: orm ?? null,
    aoMapIntensity: .65,
    metalnessMap: orm ?? null,
    metalness: 0,
    emissive: 0x000000,
    side: THREE.FrontSide,
  });
  let disposed = false;
  return {
    material,
    dispose() {
      if (disposed) return;
      disposed = true;
      material.dispose();
      if (cached && loader && --cached.references === 0) {
        cached.textures.forEach(texture => texture.dispose());
        caches.delete(loader);
      }
    },
  };
}
