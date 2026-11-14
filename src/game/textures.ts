import * as THREE from 'three';

export interface BuildingTextures {
  floorMap: THREE.CanvasTexture;
  floorBump: THREE.CanvasTexture;
  wallMap: THREE.CanvasTexture;
  wallBump: THREE.CanvasTexture;
  tileWallMap: THREE.CanvasTexture;
  tileFloorMap: THREE.CanvasTexture;
  ceilingMap: THREE.CanvasTexture;
  woodMap: THREE.CanvasTexture;
  woodDoorMap: THREE.CanvasTexture;
  metalMap: THREE.CanvasTexture;
  metalDoorMap: THREE.CanvasTexture;
  crateMap: THREE.CanvasTexture;
  exitSignMap: THREE.CanvasTexture;
  notePaperMap: THREE.CanvasTexture;
  clockFaceMap: THREE.CanvasTexture;
  photoMap: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  createSignTexture: (title: string, subtitle?: string) => THREE.CanvasTexture;
  dispose: () => void;
}

function seededRand(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  return [canvas, ctx];
}

function configureTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  repeatX: number,
  repeatY: number,
  anisotropy: number,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createBuildingTextures(maxAnisotropy: number): BuildingTextures {
  const anisotropy = Math.max(1, Math.min(maxAnisotropy, 8));
  const rand = seededRand(1987);
  const dynamicTextures: THREE.CanvasTexture[] = [];

  // 1. Weathered Concrete Tile Floor (Albedo + Bump)
  const [floorCanvas, fCtx] = makeCanvas(512, 512);
  const [floorBumpCanvas, fbCtx] = makeCanvas(512, 512);

  fCtx.fillStyle = '#33363b';
  fCtx.fillRect(0, 0, 512, 512);
  fbCtx.fillStyle = '#808080';
  fbCtx.fillRect(0, 0, 512, 512);

  const tile = 128;
  for (let gx = 0; gx < 4; gx++) {
    for (let gy = 0; gy < 4; gy++) {
      const shade = 44 + Math.floor(rand() * 14);
      const warmShift = Math.floor(rand() * 5);
      fCtx.fillStyle = `rgb(${shade + warmShift}, ${shade + 1}, ${shade})`;
      fCtx.fillRect(gx * tile + 2, gy * tile + 2, tile - 4, tile - 4);

      const bShade = 125 + Math.floor(rand() * 30);
      fbCtx.fillStyle = `rgb(${bShade}, ${bShade}, ${bShade})`;
      fbCtx.fillRect(gx * tile + 2, gy * tile + 2, tile - 4, tile - 4);
    }
  }

  for (let i = 0; i < 1600; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const r = 1 + rand() * 3;
    const dark = rand() > 0.5;
    fCtx.fillStyle = dark ? 'rgba(14,16,19,0.22)' : 'rgba(92,94,90,0.14)';
    fCtx.fillRect(x, y, r, r);
    fbCtx.fillStyle = dark ? 'rgba(40,40,40,0.35)' : 'rgba(190,190,190,0.2)';
    fbCtx.fillRect(x, y, r, r);
  }

  fCtx.strokeStyle = '#1b1d20';
  fCtx.lineWidth = 3;
  fbCtx.strokeStyle = '#262626';
  fbCtx.lineWidth = 4;
  for (let i = 0; i <= 4; i++) {
    const p = i * tile;
    fCtx.beginPath();
    fCtx.moveTo(p, 0);
    fCtx.lineTo(p, 512);
    fCtx.moveTo(0, p);
    fCtx.lineTo(512, p);
    fCtx.stroke();

    fbCtx.beginPath();
    fbCtx.moveTo(p, 0);
    fbCtx.lineTo(p, 512);
    fbCtx.moveTo(0, p);
    fbCtx.lineTo(512, p);
    fbCtx.stroke();
  }

  // 2. Peeling Institutional Plaster Wall
  const [wallCanvas, wCtx] = makeCanvas(512, 512);
  const [wallBumpCanvas, wbCtx] = makeCanvas(512, 512);

  wCtx.fillStyle = '#535852';
  wCtx.fillRect(0, 0, 512, 340);
  wCtx.fillStyle = '#2d3133';
  wCtx.fillRect(0, 340, 512, 172);
  wCtx.fillStyle = '#222426';
  wCtx.fillRect(0, 332, 512, 12);

  wbCtx.fillStyle = '#888888';
  wbCtx.fillRect(0, 0, 512, 512);
  wbCtx.fillStyle = '#b4b4b4';
  wbCtx.fillRect(0, 332, 512, 12);

  for (let i = 0; i < 48; i++) {
    const x = rand() * 512;
    const w = 4 + rand() * 24;
    const h = 40 + rand() * 220;
    const grad = wCtx.createLinearGradient(x, 0, x, h);
    grad.addColorStop(0, 'rgba(22, 24, 21, 0.34)');
    grad.addColorStop(1, 'rgba(22, 24, 21, 0)');
    wCtx.fillStyle = grad;
    wCtx.fillRect(x, 0, w, h);
  }
  for (let i = 0; i < 1200; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const s = 1 + rand() * 4;
    wCtx.fillStyle = rand() > 0.5 ? 'rgba(24,26,24,0.18)' : 'rgba(130,134,126,0.12)';
    wCtx.fillRect(x, y, s, s);
    wbCtx.fillStyle = rand() > 0.5 ? 'rgba(60,60,60,0.28)' : 'rgba(170,170,170,0.2)';
    wbCtx.fillRect(x, y, s, s);
  }

  // 3. Restroom Grimy Ceramic Tiles (Walls & Floor)
  const [tileWallCanvas, twCtx] = makeCanvas(256, 256);
  twCtx.fillStyle = '#475754';
  twCtx.fillRect(0, 0, 256, 256);
  for (let gx = 0; gx < 8; gx++) {
    for (let gy = 0; gy < 8; gy++) {
      const v = 64 + Math.floor(rand() * 18);
      twCtx.fillStyle = `rgb(${v}, ${v + 12}, ${v + 10})`;
      twCtx.fillRect(gx * 32 + 1, gy * 32 + 1, 30, 30);
    }
  }
  for (let i = 0; i < 320; i++) {
    twCtx.fillStyle = 'rgba(16, 24, 20, 0.28)';
    twCtx.fillRect(rand() * 256, rand() * 256, 2 + rand() * 4, 2 + rand() * 4);
  }

  const [tileFloorCanvas, tfCtx] = makeCanvas(256, 256);
  tfCtx.fillStyle = '#252c2b';
  tfCtx.fillRect(0, 0, 256, 256);
  for (let gx = 0; gx < 6; gx++) {
    for (let gy = 0; gy < 6; gy++) {
      const checker = (gx + gy) % 2 === 0;
      const base = checker ? 54 : 36;
      const jitter = Math.floor(rand() * 8);
      tfCtx.fillStyle = `rgb(${base + jitter}, ${base + 5 + jitter}, ${base + 4 + jitter})`;
      tfCtx.fillRect(gx * 42 + 2, gy * 42 + 2, 39, 39);
    }
  }

  // 4. Stained Acoustic Ceiling Tiles
  const [ceilCanvas, cCtx] = makeCanvas(256, 256);
  cCtx.fillStyle = '#2a2c30';
  cCtx.fillRect(0, 0, 256, 256);
  for (let gx = 0; gx < 2; gx++) {
    for (let gy = 0; gy < 2; gy++) {
      const shade = 38 + Math.floor(rand() * 10);
      cCtx.fillStyle = `rgb(${shade}, ${shade + 2}, ${shade + 4})`;
      cCtx.fillRect(gx * 128 + 3, gy * 128 + 3, 122, 122);
    }
  }
  for (let i = 0; i < 500; i++) {
    cCtx.fillStyle = 'rgba(12, 14, 16, 0.25)';
    cCtx.fillRect(rand() * 256, rand() * 256, 2, 2);
  }

  // 5. Aged Dark Wood & Paneled Wood Door
  const [woodCanvas, wdCtx] = makeCanvas(256, 256);
  wdCtx.fillStyle = '#3b2b20';
  wdCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 3) {
    const v = Math.floor((rand() - 0.5) * 18);
    wdCtx.fillStyle = `rgb(${59 + v}, ${43 + v}, ${32 + v})`;
    wdCtx.fillRect(0, y, 256, 3);
  }

  const [woodDoorCanvas, wddCtx] = makeCanvas(256, 512);
  wddCtx.fillStyle = '#432e21';
  wddCtx.fillRect(0, 0, 256, 512);
  for (let x = 0; x < 256; x += 3) {
    const v = Math.floor((rand() - 0.5) * 16);
    wddCtx.fillStyle = `rgb(${67 + v}, ${46 + v}, ${33 + v})`;
    wddCtx.fillRect(x, 0, 3, 512);
  }
  // Recessed door panels
  wddCtx.strokeStyle = '#241710';
  wddCtx.lineWidth = 8;
  wddCtx.strokeRect(28, 36, 200, 190);
  wddCtx.strokeRect(28, 260, 200, 210);
  wddCtx.fillStyle = 'rgba(16, 12, 9, 0.3)';
  wddCtx.fillRect(0, 420, 256, 92);

  // 6. Rusted Dark Steel & Industrial Metal Door
  const [metalCanvas, mCtx] = makeCanvas(256, 256);
  mCtx.fillStyle = '#363b40';
  mCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 2) {
    const v = Math.floor((rand() - 0.5) * 14);
    mCtx.fillStyle = `rgb(${54 + v}, ${59 + v}, ${64 + v})`;
    mCtx.fillRect(0, y, 256, 2);
  }
  for (let i = 0; i < 18; i++) {
    const rx = rand() * 256;
    const ry = rand() * 256;
    const rr = 6 + rand() * 22;
    const grad = mCtx.createRadialGradient(rx, ry, 1, rx, ry, rr);
    grad.addColorStop(0, 'rgba(92, 46, 26, 0.45)');
    grad.addColorStop(1, 'rgba(92, 46, 26, 0)');
    mCtx.fillStyle = grad;
    mCtx.beginPath();
    mCtx.arc(rx, ry, rr, 0, Math.PI * 2);
    mCtx.fill();
  }

  const [metalDoorCanvas, mdCtx] = makeCanvas(256, 512);
  mdCtx.fillStyle = '#31373d';
  mdCtx.fillRect(0, 0, 256, 512);
  mdCtx.strokeStyle = '#1d2125';
  mdCtx.lineWidth = 10;
  mdCtx.strokeRect(10, 10, 236, 492);
  // Vent louvers near bottom
  for (let y = 360; y < 440; y += 14) {
    mdCtx.fillStyle = '#15181b';
    mdCtx.fillRect(46, y, 164, 7);
  }
  // Small reinforced upper window frame
  mdCtx.fillStyle = '#171c20';
  mdCtx.fillRect(68, 56, 120, 110);
  mdCtx.strokeStyle = '#4e555c';
  mdCtx.lineWidth = 4;
  mdCtx.strokeRect(68, 56, 120, 110);

  // 7. Wooden Crate Texture
  const [crateCanvas, crCtx] = makeCanvas(256, 256);
  crCtx.fillStyle = '#5a432d';
  crCtx.fillRect(0, 0, 256, 256);
  crCtx.strokeStyle = '#362719';
  crCtx.lineWidth = 14;
  crCtx.strokeRect(7, 7, 242, 242);
  crCtx.beginPath();
  crCtx.moveTo(14, 14);
  crCtx.lineTo(242, 242);
  crCtx.moveTo(242, 14);
  crCtx.lineTo(14, 242);
  crCtx.stroke();
  for (let y = 20; y < 240; y += 36) {
    crCtx.fillStyle = 'rgba(20, 14, 8, 0.2)';
    crCtx.fillRect(14, y, 228, 3);
  }

  // 8. Emergency Exit Sign Texture ("SALIDA")
  const [exitCanvas, exCtx] = makeCanvas(256, 96);
  exCtx.fillStyle = '#200607';
  exCtx.fillRect(0, 0, 256, 96);
  exCtx.strokeStyle = '#8b1e22';
  exCtx.lineWidth = 6;
  exCtx.strokeRect(5, 5, 246, 86);
  exCtx.fillStyle = '#ff4444';
  exCtx.font = 'bold 44px sans-serif';
  exCtx.textAlign = 'center';
  exCtx.textBaseline = 'middle';
  exCtx.fillText('SALIDA', 128, 50);

  // 9. Aged Note Paper Texture
  const [noteCanvas, nCtx] = makeCanvas(128, 160);
  nCtx.fillStyle = '#cfc5b0';
  nCtx.fillRect(0, 0, 128, 160);
  nCtx.fillStyle = 'rgba(72, 54, 34, 0.16)';
  nCtx.fillRect(0, 0, 128, 22);
  nCtx.fillRect(88, 118, 40, 42);
  nCtx.strokeStyle = 'rgba(42, 38, 32, 0.55)';
  nCtx.lineWidth = 2;
  for (let y = 28; y < 138; y += 12) {
    const lineW = 70 + Math.floor(rand() * 34);
    nCtx.beginPath();
    nCtx.moveTo(14, y);
    nCtx.lineTo(14 + lineW, y);
    nCtx.stroke();
  }
  nCtx.fillStyle = '#8b1e22';
  nCtx.fillRect(14, 14, 36, 4);

  // 10. Stopped Clock Face Texture (03:17)
  const [clockCanvas, clCtx] = makeCanvas(128, 128);
  clCtx.fillStyle = '#d4cec0';
  clCtx.beginPath();
  clCtx.arc(64, 64, 60, 0, Math.PI * 2);
  clCtx.fill();
  clCtx.strokeStyle = '#222428';
  clCtx.lineWidth = 5;
  clCtx.stroke();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    clCtx.beginPath();
    clCtx.moveTo(64 + Math.cos(a) * 44, 64 + Math.sin(a) * 44);
    clCtx.lineTo(64 + Math.cos(a) * 53, 64 + Math.sin(a) * 53);
    clCtx.lineWidth = i % 3 === 0 ? 4 : 2;
    clCtx.stroke();
  }
  // Hour hand at ~3:17, Minute hand at 17 min
  const hAngle = ((3 + 17 / 60) / 12) * Math.PI * 2 - Math.PI / 2;
  const mAngle = (17 / 60) * Math.PI * 2 - Math.PI / 2;
  clCtx.strokeStyle = '#141619';
  clCtx.lineWidth = 5;
  clCtx.beginPath();
  clCtx.moveTo(64, 64);
  clCtx.lineTo(64 + Math.cos(hAngle) * 28, 64 + Math.sin(hAngle) * 28);
  clCtx.stroke();
  clCtx.lineWidth = 3;
  clCtx.beginPath();
  clCtx.moveTo(64, 64);
  clCtx.lineTo(64 + Math.cos(mAngle) * 42, 64 + Math.sin(mAngle) * 42);
  clCtx.stroke();
  // Cracked glass line
  clCtx.strokeStyle = 'rgba(30, 34, 38, 0.55)';
  clCtx.lineWidth = 1.5;
  clCtx.beginPath();
  clCtx.moveTo(22, 30);
  clCtx.lineTo(58, 62);
  clCtx.lineTo(106, 86);
  clCtx.stroke();

  // 11. Deteriorated Staff Photograph Texture
  const [photoCanvas, phCtx] = makeCanvas(160, 128);
  phCtx.fillStyle = '#3d3932';
  phCtx.fillRect(0, 0, 160, 128);
  phCtx.fillStyle = '#5c5548';
  phCtx.fillRect(14, 18, 132, 92);
  // Silhoutted building & 3 figures with scratched-out faces
  phCtx.fillStyle = '#2b2823';
  phCtx.fillRect(24, 34, 112, 46);
  for (let i = 0; i < 3; i++) {
    const fx = 48 + i * 32;
    phCtx.fillStyle = '#1d1b18';
    phCtx.fillRect(fx - 7, 68, 14, 36);
    phCtx.beginPath();
    phCtx.arc(fx, 60, 7, 0, Math.PI * 2);
    phCtx.fill();
    // Black ink scratch over face
    phCtx.strokeStyle = '#09090a';
    phCtx.lineWidth = 3;
    phCtx.beginPath();
    phCtx.moveTo(fx - 9, 53);
    phCtx.lineTo(fx + 9, 67);
    phCtx.moveTo(fx + 9, 53);
    phCtx.lineTo(fx - 9, 67);
    phCtx.stroke();
  }

  // 12. Radial Soft Contact Shadow
  const [shadowCanvas, shCtx] = makeCanvas(128, 128);
  const shGrad = shCtx.createRadialGradient(64, 64, 6, 64, 64, 60);
  shGrad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  shGrad.addColorStop(0.6, 'rgba(0, 0, 0, 0.3)');
  shGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  shCtx.fillStyle = shGrad;
  shCtx.fillRect(0, 0, 128, 128);

  const floorMap = configureTexture(floorCanvas, true, 16, 20, anisotropy);
  const floorBump = configureTexture(floorBumpCanvas, false, 16, 20, anisotropy);
  const wallMap = configureTexture(wallCanvas, true, 1, 1, anisotropy);
  const wallBump = configureTexture(wallBumpCanvas, false, 1, 1, anisotropy);
  const tileWallMap = configureTexture(tileWallCanvas, true, 1, 1, anisotropy);
  const tileFloorMap = configureTexture(tileFloorCanvas, true, 6, 5, anisotropy);
  const ceilingMap = configureTexture(ceilCanvas, true, 18, 22, anisotropy);
  const woodMap = configureTexture(woodCanvas, true, 1, 1, anisotropy);
  const woodDoorMap = configureTexture(woodDoorCanvas, true, 1, 1, anisotropy);
  const metalMap = configureTexture(metalCanvas, true, 1, 1, anisotropy);
  const metalDoorMap = configureTexture(metalDoorCanvas, true, 1, 1, anisotropy);
  const crateMap = configureTexture(crateCanvas, true, 1, 1, anisotropy);

  const exitSignMap = new THREE.CanvasTexture(exitCanvas);
  exitSignMap.colorSpace = THREE.SRGBColorSpace;
  exitSignMap.anisotropy = anisotropy;

  const notePaperMap = new THREE.CanvasTexture(noteCanvas);
  notePaperMap.colorSpace = THREE.SRGBColorSpace;
  notePaperMap.anisotropy = anisotropy;

  const clockFaceMap = new THREE.CanvasTexture(clockCanvas);
  clockFaceMap.colorSpace = THREE.SRGBColorSpace;
  clockFaceMap.anisotropy = anisotropy;

  const photoMap = new THREE.CanvasTexture(photoCanvas);
  photoMap.colorSpace = THREE.SRGBColorSpace;
  photoMap.anisotropy = anisotropy;

  const contactShadowMap = new THREE.CanvasTexture(shadowCanvas);
  contactShadowMap.colorSpace = THREE.SRGBColorSpace;

  const createSignTexture = (title: string, subtitle?: string) => {
    const [sc, sCtx] = makeCanvas(256, 96);
    sCtx.fillStyle = '#1b1f23';
    sCtx.fillRect(0, 0, 256, 96);
    sCtx.strokeStyle = '#53585c';
    sCtx.lineWidth = 4;
    sCtx.strokeRect(4, 4, 248, 88);
    // Grime streaks
    sCtx.fillStyle = 'rgba(10, 12, 14, 0.35)';
    sCtx.fillRect(18, 0, 16, 96);
    sCtx.fillRect(195, 0, 22, 96);
    sCtx.fillStyle = '#d4cfc4';
    sCtx.font = 'bold 26px sans-serif';
    sCtx.textAlign = 'center';
    sCtx.textBaseline = 'middle';
    sCtx.fillText(title, 128, subtitle ? 36 : 48, 224);
    if (subtitle) {
      sCtx.fillStyle = '#928c80';
      sCtx.font = '13px sans-serif';
      sCtx.fillText(subtitle, 128, 66, 224);
    }
    const tex = new THREE.CanvasTexture(sc);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = anisotropy;
    dynamicTextures.push(tex);
    return tex;
  };

  return {
    floorMap,
    floorBump,
    wallMap,
    wallBump,
    tileWallMap,
    tileFloorMap,
    ceilingMap,
    woodMap,
    woodDoorMap,
    metalMap,
    metalDoorMap,
    crateMap,
    exitSignMap,
    notePaperMap,
    clockFaceMap,
    photoMap,
    contactShadowMap,
    createSignTexture,
    dispose: () => {
      floorMap.dispose();
      floorBump.dispose();
      wallMap.dispose();
      wallBump.dispose();
      tileWallMap.dispose();
      tileFloorMap.dispose();
      ceilingMap.dispose();
      woodMap.dispose();
      woodDoorMap.dispose();
      metalMap.dispose();
      metalDoorMap.dispose();
      crateMap.dispose();
      exitSignMap.dispose();
      notePaperMap.dispose();
      clockFaceMap.dispose();
      photoMap.dispose();
      contactShadowMap.dispose();
      for (const dt of dynamicTextures) dt.dispose();
    },
  };
}
