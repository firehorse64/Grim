// ============================================================
// AssetGenerator.ts - Procedural texture generation system
// Generates all game textures with a dark, gritty hand-drawn
// sketch aesthetic using Phaser Graphics objects.
// ============================================================

// ---- Seeded PRNG for deterministic "randomness" ----
let _seed = 42;
function resetSeed(s = 42): void { _seed = s; }
function rng(): number {
  _seed = (_seed * 16807 + 0) % 2147483647;
  return (_seed - 1) / 2147483646;
}
function rngRange(min: number, max: number): number {
  return min + rng() * (max - min);
}
function rngInt(min: number, max: number): number {
  return Math.floor(rngRange(min, max + 1));
}

// ---- Color helpers ----
function colorNum(r: number, g: number, b: number): number {
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

function lerpColor(c1: number, c2: number, t: number): number {
  const r1 = (c1 >> 16) & 0xff, g1 = (c1 >> 8) & 0xff, b1 = c1 & 0xff;
  const r2 = (c2 >> 16) & 0xff, g2 = (c2 >> 8) & 0xff, b2 = c2 & 0xff;
  const r = Math.floor(r1 + (r2 - r1) * t);
  const g = Math.floor(g1 + (g2 - g1) * t);
  const b = Math.floor(b1 + (b2 - b1) * t);
  return colorNum(r, g, b);
}

function darken(c: number, amount: number): number {
  const r = Math.max(0, Math.floor(((c >> 16) & 0xff) * (1 - amount)));
  const g = Math.max(0, Math.floor(((c >> 8) & 0xff) * (1 - amount)));
  const b = Math.max(0, Math.floor((c & 0xff) * (1 - amount)));
  return colorNum(r, g, b);
}

function brighten(c: number, amount: number): number {
  const r = Math.min(255, Math.floor(((c >> 16) & 0xff) * (1 + amount)));
  const g = Math.min(255, Math.floor(((c >> 8) & 0xff) * (1 + amount)));
  const b = Math.min(255, Math.floor((c & 0xff) * (1 + amount)));
  return colorNum(r, g, b);
}

// ---- Sketch drawing primitives ----

/** Draw a rough/sketchy line with jitter */
function sketchLine(
  g: Phaser.GameObjects.Graphics,
  x1: number, y1: number,
  x2: number, y2: number,
  color: number,
  alpha = 1.0,
  thickness = 1,
  jitter = 0.8
): void {
  g.lineStyle(thickness, color, alpha);
  const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  const steps = Math.max(2, Math.floor(dist / 3));
  g.beginPath();
  g.moveTo(x1 + rngRange(-jitter, jitter), y1 + rngRange(-jitter, jitter));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t + rngRange(-jitter, jitter);
    const y = y1 + (y2 - y1) * t + rngRange(-jitter, jitter);
    g.lineTo(x, y);
  }
  g.strokePath();
}

/** Draw a rough rectangle outline */
function sketchRect(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number,
  color: number,
  alpha = 1.0,
  thickness = 1.5,
  jitter = 1.0
): void {
  sketchLine(g, x, y, x + w, y, color, alpha, thickness, jitter);
  sketchLine(g, x + w, y, x + w, y + h, color, alpha, thickness, jitter);
  sketchLine(g, x + w, y + h, x, y + h, color, alpha, thickness, jitter);
  sketchLine(g, x, y + h, x, y, color, alpha, thickness, jitter);
}

/** Fill a rough rectangle with color and optional noise */
function sketchFillRect(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number,
  fillColor: number,
  fillAlpha = 1.0
): void {
  g.fillStyle(fillColor, fillAlpha);
  g.fillRect(x, y, w, h);
}

/** Draw hatching lines for shading */
function drawHatching(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number,
  color: number,
  alpha = 0.3,
  spacing = 3,
  angle = 0.785 // 45 degrees
): void {
  g.lineStyle(0.5, color, alpha);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const diag = Math.sqrt(w * w + h * h);
  for (let d = -diag; d < diag; d += spacing) {
    const lx1 = x + w / 2 + cos * d - sin * diag;
    const ly1 = y + h / 2 + sin * d + cos * diag;
    const lx2 = x + w / 2 + cos * d + sin * diag;
    const ly2 = y + h / 2 + sin * d - cos * diag;
    // Clip to bounds (approximate)
    g.beginPath();
    g.moveTo(
      Math.max(x, Math.min(x + w, lx1)),
      Math.max(y, Math.min(y + h, ly1))
    );
    g.lineTo(
      Math.max(x, Math.min(x + w, lx2)),
      Math.max(y, Math.min(y + h, ly2))
    );
    g.strokePath();
  }
}

/** Draw cross-hatching (two directions) */
function drawCrossHatching(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number,
  color: number,
  alpha = 0.25,
  spacing = 4
): void {
  drawHatching(g, x, y, w, h, color, alpha, spacing, 0.785);
  drawHatching(g, x, y, w, h, color, alpha, spacing, -0.785);
}

/** Add noise/dithering dots */
function addNoise(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number,
  color: number,
  density = 0.08,
  alpha = 0.2
): void {
  const totalPixels = w * h;
  const dots = Math.floor(totalPixels * density);
  for (let i = 0; i < dots; i++) {
    const px = x + rngRange(0, w);
    const py = y + rngRange(0, h);
    g.fillStyle(color, alpha * rngRange(0.3, 1.0));
    g.fillRect(px, py, 1, 1);
  }
}

/** Draw a rough ellipse outline */
function sketchEllipse(
  g: Phaser.GameObjects.Graphics,
  cx: number, cy: number,
  rx: number, ry: number,
  color: number,
  alpha = 1.0,
  thickness = 1.5,
  jitter = 0.7
): void {
  g.lineStyle(thickness, color, alpha);
  const steps = Math.max(12, Math.floor((rx + ry) * 1.5));
  g.beginPath();
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const x = cx + Math.cos(angle) * rx + rngRange(-jitter, jitter);
    const y = cy + Math.sin(angle) * ry + rngRange(-jitter, jitter);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.strokePath();
}

/** Fill a rough ellipse */
function sketchFillEllipse(
  g: Phaser.GameObjects.Graphics,
  cx: number, cy: number,
  rx: number, ry: number,
  color: number,
  alpha = 1.0
): void {
  g.fillStyle(color, alpha);
  g.fillEllipse(cx, cy, rx * 2, ry * 2);
}

/** Draw a rough polygon outline */
function sketchPolygon(
  g: Phaser.GameObjects.Graphics,
  points: { x: number; y: number }[],
  color: number,
  alpha = 1.0,
  thickness = 1.5,
  jitter = 0.8
): void {
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    sketchLine(g, p1.x, p1.y, p2.x, p2.y, color, alpha, thickness, jitter);
  }
}

// ---- Palette ----
const PAL = {
  // Ink / outline
  ink: 0x1a1a1a,
  inkLight: 0x333333,
  inkFaint: 0x555555,
  // Player
  skinTone: 0xc8a882,
  vest: 0x4a5a3a,
  vestDark: 0x3a4a2a,
  pants: 0x3a3a44,
  boots: 0x2a2a22,
  hair: 0x3a2a1a,
  // Zombie
  zombieSkin: 0x6a8a5a,
  zombieSkinDark: 0x4a6a3a,
  zombieCloth: 0x5a5a4a,
  zombieClothTorn: 0x4a4a3a,
  zombieBlood: 0x8a2222,
  // Train
  metalDark: 0x3a3a44,
  metalMid: 0x5a5a66,
  metalLight: 0x7a7a88,
  metalRivet: 0x888899,
  floorWood: 0x5a4a3a,
  floorWoodDark: 0x3a2a1a,
  roofDark: 0x4a4a55,
  // Barricade
  woodLight: 0x8a7a5a,
  woodDark: 0x5a4a2a,
  woodGrain: 0x6a5a3a,
  metalBarricade: 0x6a6a77,
  electricBlue: 0x44aaff,
  // Environment
  skyDark: 0x0a0a1a,
  skyHorizon: 0x1a1a2a,
  mountainDark: 0x111122,
  hillDark: 0x1a1a2a,
  treeDark: 0x0a0a11,
  // Effects
  bloodRed: 0xaa2222,
  bloodDark: 0x661111,
  muzzleYellow: 0xffcc44,
  muzzleWhite: 0xffeeaa,
  explosionOrange: 0xff6622,
  smokeGray: 0x888888,
  sparkYellow: 0xffdd66,
  acidGreen: 0x66ff22,
  acidGreenDark: 0x44aa11,
  // UI
  uiBg: 0x222233,
  healthRed: 0xcc2222,
  healthRedDark: 0x881111,
  ammoGold: 0xccaa44,
  coinGold: 0xffcc22,
  // Survivor
  civilianShirt: 0x7a6a88,
  civilianPants: 0x5a5a6a,
};

// ============================================================
// Helper: create a Graphics, draw, generateTexture, destroy
// ============================================================
function makeTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (g: Phaser.GameObjects.Graphics) => void
): void {
  const g = scene.make.graphics({ add: false } as Phaser.Types.GameObjects.Graphics.Options);
  draw(g);
  g.generateTexture(key, width, height);
  g.destroy();
}

function makeSpritesheet(
  scene: Phaser.Scene,
  key: string,
  frameWidth: number,
  frameHeight: number,
  frameCount: number,
  draw: (g: Phaser.GameObjects.Graphics, frameIndex: number, offsetX: number) => void
): void {
  const totalWidth = frameWidth * frameCount;
  const g = scene.make.graphics({ add: false } as Phaser.Types.GameObjects.Graphics.Options);
  for (let i = 0; i < frameCount; i++) {
    draw(g, i, i * frameWidth);
  }
  g.generateTexture(key, totalWidth, frameHeight);
  g.destroy();
  // Add spritesheet frames to texture manager
  const texture = scene.textures.get(key);
  if (texture) {
    texture.add(0, 0, 0, 0, frameWidth, frameHeight);
    for (let i = 1; i < frameCount; i++) {
      texture.add(i, 0, i * frameWidth, 0, frameWidth, frameHeight);
    }
  }
}

// ============================================================
// PLAYER TEXTURES
// ============================================================

function drawPlayerBase(
  g: Phaser.GameObjects.Graphics,
  ox: number, oy: number,
  armAngle: number,
  legSpread: number,
  isHurt: boolean
): void {
  const w = 28, h = 48;
  const cx = ox + w / 2;
  const headY = oy + 8;
  const bodyTop = oy + 14;
  const bodyBot = oy + 30;
  const legBot = oy + 44;

  const skinColor = isHurt ? 0xee8888 : PAL.skinTone;

  // Legs
  const legW = 4;
  sketchFillRect(g, cx - 6 - legSpread, bodyBot, legW, legBot - bodyBot, PAL.pants);
  sketchFillRect(g, cx + 2 + legSpread, bodyBot, legW, legBot - bodyBot, PAL.pants);
  // Boots
  sketchFillRect(g, cx - 7 - legSpread, legBot, legW + 2, 4, PAL.boots);
  sketchFillRect(g, cx + 1 + legSpread, legBot, legW + 2, 4, PAL.boots);
  // Leg outlines
  sketchRect(g, cx - 6 - legSpread, bodyBot, legW, legBot - bodyBot + 4, PAL.ink, 0.8, 1.2);
  sketchRect(g, cx + 2 + legSpread, bodyBot, legW, legBot - bodyBot + 4, PAL.ink, 0.8, 1.2);

  // Torso - military vest
  sketchFillRect(g, cx - 7, bodyTop, 14, bodyBot - bodyTop, PAL.vest);
  // Vest detail - pockets
  sketchFillRect(g, cx - 6, bodyTop + 2, 5, 4, PAL.vestDark);
  sketchFillRect(g, cx + 1, bodyTop + 2, 5, 4, PAL.vestDark);
  // Vest belt
  sketchLine(g, cx - 7, bodyBot - 2, cx + 7, bodyBot - 2, PAL.ink, 0.5, 1);
  // Cross-hatching on vest
  drawHatching(g, cx - 7, bodyTop, 14, bodyBot - bodyTop, PAL.ink, 0.15, 3, 0.6);
  // Vest outline
  sketchRect(g, cx - 7, bodyTop, 14, bodyBot - bodyTop, PAL.ink, 0.9, 1.3);

  // Arms
  const armLen = 10;
  const armY = bodyTop + 4;
  // Left arm
  const laX = cx - 8 + Math.cos(armAngle) * armLen;
  const laY = armY + Math.sin(armAngle) * armLen;
  g.lineStyle(3, skinColor, 0.9);
  g.beginPath(); g.moveTo(cx - 8, armY); g.lineTo(laX, laY); g.strokePath();
  sketchLine(g, cx - 8, armY, laX, laY, PAL.ink, 0.5, 1, 0.5);
  // Right arm (weapon arm)
  const raX = cx + 8 + Math.cos(-armAngle * 0.5) * armLen;
  const raY = armY + Math.sin(-armAngle * 0.5) * armLen;
  g.lineStyle(3, skinColor, 0.9);
  g.beginPath(); g.moveTo(cx + 8, armY); g.lineTo(raX, raY); g.strokePath();
  sketchLine(g, cx + 8, armY, raX, raY, PAL.ink, 0.5, 1, 0.5);

  // Head
  sketchFillEllipse(g, cx, headY, 5, 6, skinColor);
  // Hair
  sketchFillRect(g, cx - 5, oy + 1, 10, 5, PAL.hair);
  drawHatching(g, cx - 5, oy + 1, 10, 5, PAL.ink, 0.3, 2, 1.2);
  // Face details
  g.fillStyle(PAL.ink, 0.8);
  g.fillRect(cx - 3, headY - 1, 2, 1);
  g.fillRect(cx + 1, headY - 1, 2, 1);
  g.fillStyle(PAL.ink, 0.4);
  g.fillRect(cx - 1, headY + 2, 2, 1);
  // Head outline
  sketchEllipse(g, cx, headY, 5, 6, PAL.ink, 0.9, 1.2, 0.5);

  if (isHurt) {
    g.fillStyle(0xff0000, 0.15);
    g.fillRect(ox, oy, w, h);
  }
}

function generatePlayerTextures(scene: Phaser.Scene): void {
  // Idle
  makeTexture(scene, 'player-idle', 28, 48, (g) => {
    resetSeed(100);
    drawPlayerBase(g, 0, 0, 0.3, 0, false);
  });

  // Run frames
  const legSpreads = [2, 0, -2, 0];
  const armAngles = [0.6, 0.3, -0.2, 0.3];
  for (let i = 0; i < 4; i++) {
    const frameKey = `player-run-${i + 1}`;
    makeTexture(scene, frameKey, 28, 48, (g) => {
      resetSeed(200 + i * 10);
      drawPlayerBase(g, 0, 0, armAngles[i], legSpreads[i], false);
    });
  }

  // Hurt
  makeTexture(scene, 'player-hurt', 28, 48, (g) => {
    resetSeed(300);
    drawPlayerBase(g, 0, 0, 0.1, 1, true);
  });
}


// ============================================================
// ZOMBIE TEXTURES
// ============================================================

function drawZombieBody(
  g: Phaser.GameObjects.Graphics,
  ox: number, oy: number,
  w: number, h: number,
  skinColor: number,
  clothColor: number,
  options: {
    isTank?: boolean;
    isCrawler?: boolean;
    isRunner?: boolean;
    isSpitter?: boolean;
    isBoss?: boolean;
    isHive?: boolean;
  } = {}
): void {
  const cx = ox + w / 2;

  if (options.isCrawler) {
    // Crawler is horizontal, low profile
    const bodyLen = w - 8;
    const bodyH = h - 6;
    // Body
    sketchFillRect(g, ox + 4, oy + 3, bodyLen, bodyH, skinColor);
    // Torn clothing patches
    sketchFillRect(g, ox + 8, oy + 4, 8, bodyH - 2, clothColor);
    sketchFillRect(g, ox + 20, oy + 5, 6, bodyH - 4, darken(clothColor, 0.2));
    // Arms reaching forward
    g.lineStyle(2, skinColor, 0.9);
    g.beginPath(); g.moveTo(ox + bodyLen + 2, oy + 6); g.lineTo(ox + w - 1, oy + 4); g.strokePath();
    g.beginPath(); g.moveTo(ox + bodyLen + 2, oy + 10); g.lineTo(ox + w - 2, oy + 12); g.strokePath();
    // Head
    sketchFillEllipse(g, ox + w - 4, oy + h / 2, 4, 4, skinColor);
    // Decay marks
    g.fillStyle(PAL.zombieBlood, 0.5);
    g.fillRect(ox + 12, oy + 5, 2, 2);
    g.fillRect(ox + 24, oy + 7, 3, 2);
    // Eyes
    g.fillStyle(0xffcc00, 0.8);
    g.fillRect(ox + w - 6, oy + h / 2 - 2, 1, 1);
    g.fillRect(ox + w - 3, oy + h / 2 - 2, 1, 1);
    // Outline
    sketchRect(g, ox + 4, oy + 3, bodyLen, bodyH, PAL.ink, 0.7, 1.2);
    addNoise(g, ox, oy, w, h, PAL.ink, 0.05, 0.2);
    drawHatching(g, ox + 4, oy + 3, bodyLen, bodyH, PAL.ink, 0.15, 3);
    return;
  }

  if (options.isHive) {
    // Pulsing organic mass - irregular blob shape
    const blobCx = ox + w / 2;
    const blobCy = oy + h / 2;
    // Base organic mass
    for (let layer = 3; layer >= 0; layer--) {
      const radius = (w / 2 - 4) - layer * 2;
      const rY = (h / 2 - 4) - layer * 2;
      const col = lerpColor(PAL.zombieSkinDark, PAL.acidGreenDark, layer / 4);
      sketchFillEllipse(g, blobCx, blobCy, radius, rY, col, 0.8);
    }
    // Organic tendrils
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + rngRange(-0.2, 0.2);
      const len = rngRange(8, 16);
      const tx = blobCx + Math.cos(angle) * (w / 2 - 6);
      const ty = blobCy + Math.sin(angle) * (h / 2 - 6);
      const ex = tx + Math.cos(angle) * len;
      const ey = ty + Math.sin(angle) * len;
      g.lineStyle(rngRange(2, 4), PAL.zombieSkinDark, 0.7);
      g.beginPath(); g.moveTo(tx, ty); g.lineTo(ex, ey); g.strokePath();
    }
    // Pulsing nodes/glands
    for (let i = 0; i < 5; i++) {
      const nx = blobCx + rngRange(-w / 4, w / 4);
      const ny = blobCy + rngRange(-h / 4, h / 4);
      sketchFillEllipse(g, nx, ny, rngRange(3, 6), rngRange(3, 6), PAL.acidGreen, 0.6);
      sketchEllipse(g, nx, ny, rngRange(3, 6), rngRange(3, 6), PAL.ink, 0.4, 1);
    }
    // Central eye/mouth
    sketchFillEllipse(g, blobCx, blobCy - 4, 6, 4, 0x332211, 0.9);
    g.fillStyle(0xffcc00, 0.9);
    g.fillRect(blobCx - 2, blobCy - 5, 4, 2);
    // Outline
    sketchEllipse(g, blobCx, blobCy, w / 2 - 3, h / 2 - 3, PAL.ink, 0.8, 2, 1.2);
    addNoise(g, ox, oy, w, h, PAL.ink, 0.06, 0.15);
    drawCrossHatching(g, ox + 8, oy + 8, w - 16, h - 16, PAL.ink, 0.12, 4);
    return;
  }

  // Standard humanoid zombie (walker, runner, tank, spitter, boss-brute)
  const headR = options.isTank ? 7 : (options.isBoss ? 8 : 5);
  const headY = oy + headR + 2;
  const bodyTop = headY + headR + 1;
  const bodyW = options.isTank ? w - 8 : (options.isBoss ? w - 10 : 14);
  const bodyH = options.isTank ? 22 : (options.isBoss ? 28 : 16);
  const bodyBot = bodyTop + bodyH;
  const legBot = oy + h - 4;

  // Legs
  const legW = options.isTank ? 6 : (options.isBoss ? 7 : 4);
  const legSpread = options.isRunner ? 3 : 1;
  sketchFillRect(g, cx - legW - legSpread, bodyBot, legW, legBot - bodyBot, clothColor);
  sketchFillRect(g, cx + legSpread, bodyBot, legW, legBot - bodyBot, darken(clothColor, 0.15));
  // Torn cloth on legs
  if (!options.isBoss) {
    for (let i = 0; i < 2; i++) {
      const tearX = cx + rngRange(-legW - 2, legW + 2);
      const tearY = bodyBot + rngRange(2, legBot - bodyBot - 2);
      sketchLine(g, tearX, tearY, tearX + rngRange(-3, 3), tearY + rngRange(2, 5), skinColor, 0.5, 1);
    }
  }
  // Leg outlines
  sketchRect(g, cx - legW - legSpread, bodyBot, legW, legBot - bodyBot, PAL.ink, 0.6, 1);
  sketchRect(g, cx + legSpread, bodyBot, legW, legBot - bodyBot, PAL.ink, 0.6, 1);

  // Torso
  sketchFillRect(g, cx - bodyW / 2, bodyTop, bodyW, bodyH, clothColor);
  // Torn clothing details
  for (let i = 0; i < 3; i++) {
    const tx = cx - bodyW / 2 + rngRange(1, bodyW - 3);
    const ty = bodyTop + rngRange(1, bodyH - 3);
    const tw = rngRange(2, 5);
    const th = rngRange(2, 4);
    sketchFillRect(g, tx, ty, tw, th, skinColor);
  }
  // Decay/blood splatters on torso
  for (let i = 0; i < 2; i++) {
    g.fillStyle(PAL.zombieBlood, 0.4);
    const bx = cx + rngRange(-bodyW / 2 + 1, bodyW / 2 - 3);
    const by = bodyTop + rngRange(2, bodyH - 3);
    g.fillRect(bx, by, rngRange(2, 4), rngRange(2, 3));
  }
  drawHatching(g, cx - bodyW / 2, bodyTop, bodyW, bodyH, PAL.ink, 0.15, 3);
  sketchRect(g, cx - bodyW / 2, bodyTop, bodyW, bodyH, PAL.ink, 0.7, 1.2);

  // Arms
  const armLen = options.isTank ? 14 : (options.isBoss ? 16 : 10);
  const armY = bodyTop + 3;
  // Arms reaching forward in menacing pose
  const leftArmAngle = options.isRunner ? -0.4 : 0.2;
  const rightArmAngle = options.isRunner ? -0.6 : 0.4;
  // Left arm
  const laEndX = cx - bodyW / 2 - 2 + Math.cos(leftArmAngle + Math.PI) * armLen;
  const laEndY = armY + Math.sin(leftArmAngle) * armLen;
  g.lineStyle(options.isTank ? 4 : 3, skinColor, 0.8);
  g.beginPath();
  g.moveTo(cx - bodyW / 2, armY);
  g.lineTo(laEndX, laEndY);
  g.strokePath();
  sketchLine(g, cx - bodyW / 2, armY, laEndX, laEndY, PAL.ink, 0.4, 1, 0.5);
  // Right arm
  const raEndX = cx + bodyW / 2 + 2 + Math.cos(rightArmAngle) * armLen;
  const raEndY = armY + Math.sin(rightArmAngle) * armLen;
  g.lineStyle(options.isTank ? 4 : 3, skinColor, 0.8);
  g.beginPath();
  g.moveTo(cx + bodyW / 2, armY);
  g.lineTo(raEndX, raEndY);
  g.strokePath();
  sketchLine(g, cx + bodyW / 2, armY, raEndX, raEndY, PAL.ink, 0.4, 1, 0.5);

  if (options.isBoss) {
    // Armor plates on boss
    sketchFillRect(g, cx - bodyW / 2 - 1, bodyTop + 2, bodyW + 2, 6, PAL.metalDark);
    sketchRect(g, cx - bodyW / 2 - 1, bodyTop + 2, bodyW + 2, 6, PAL.ink, 0.5, 1);
    // Shoulder pads
    sketchFillEllipse(g, cx - bodyW / 2 - 2, armY, 5, 4, PAL.metalMid);
    sketchFillEllipse(g, cx + bodyW / 2 + 2, armY, 5, 4, PAL.metalMid);
    sketchEllipse(g, cx - bodyW / 2 - 2, armY, 5, 4, PAL.ink, 0.6, 1);
    sketchEllipse(g, cx + bodyW / 2 + 2, armY, 5, 4, PAL.ink, 0.6, 1);
  }

  if (options.isSpitter) {
    // Acid glands on neck/chest
    sketchFillEllipse(g, cx - 3, bodyTop - 1, 3, 2, PAL.acidGreen, 0.7);
    sketchFillEllipse(g, cx + 3, bodyTop - 1, 3, 2, PAL.acidGreen, 0.7);
    sketchEllipse(g, cx - 3, bodyTop - 1, 3, 2, PAL.acidGreenDark, 0.5, 1);
    sketchEllipse(g, cx + 3, bodyTop - 1, 3, 2, PAL.acidGreenDark, 0.5, 1);
    // Dripping acid
    g.lineStyle(1, PAL.acidGreen, 0.6);
    g.beginPath(); g.moveTo(cx - 2, bodyTop + 1); g.lineTo(cx - 3, bodyTop + 5); g.strokePath();
    g.beginPath(); g.moveTo(cx + 2, bodyTop + 1); g.lineTo(cx + 4, bodyTop + 6); g.strokePath();
  }

  // Head
  sketchFillEllipse(g, cx, headY, headR, headR + 1, skinColor);
  // Zombie eyes - glowing
  g.fillStyle(0xffcc00, 0.9);
  g.fillRect(cx - headR + 2, headY - 2, 2, 2);
  g.fillRect(cx + headR - 4, headY - 2, 2, 2);
  // Open mouth
  g.fillStyle(0x331111, 0.8);
  g.fillRect(cx - 2, headY + 2, 4, 2);
  // Decay on face
  g.fillStyle(PAL.zombieBlood, 0.3);
  g.fillRect(cx + rngRange(-3, 0), headY + rngRange(-2, 2), 2, 2);
  // Head outline
  sketchEllipse(g, cx, headY, headR, headR + 1, PAL.ink, 0.8, 1.3, 0.6);

  // Overall noise and grit
  addNoise(g, ox, oy, w, h, PAL.ink, 0.04, 0.15);
}

function generateZombieTextures(scene: Phaser.Scene): void {
  // Walker
  makeTexture(scene, 'zombie-walker', 28, 48, (g) => {
    resetSeed(400);
    drawZombieBody(g, 0, 0, 28, 48, PAL.zombieSkin, PAL.zombieCloth);
  });

  // Runner
  makeTexture(scene, 'zombie-runner', 24, 44, (g) => {
    resetSeed(500);
    drawZombieBody(g, 0, 0, 24, 44, brighten(PAL.zombieSkin, 0.1), PAL.zombieClothTorn,
      { isRunner: true });
  });

  // Tank
  makeTexture(scene, 'zombie-tank', 40, 56, (g) => {
    resetSeed(600);
    drawZombieBody(g, 0, 0, 40, 56, darken(PAL.zombieSkin, 0.15), PAL.zombieCloth,
      { isTank: true });
  });

  // Crawler
  makeTexture(scene, 'zombie-crawler', 36, 20, (g) => {
    resetSeed(700);
    drawZombieBody(g, 0, 0, 36, 20, PAL.zombieSkin, PAL.zombieClothTorn,
      { isCrawler: true });
  });

  // Spitter
  makeTexture(scene, 'zombie-spitter', 28, 48, (g) => {
    resetSeed(800);
    drawZombieBody(g, 0, 0, 28, 48, brighten(PAL.zombieSkin, 0.05), PAL.zombieCloth,
      { isSpitter: true });
  });

  // Boss: Brute
  makeTexture(scene, 'boss-brute', 56, 72, (g) => {
    resetSeed(900);
    drawZombieBody(g, 0, 0, 56, 72, darken(PAL.zombieSkin, 0.2), PAL.zombieCloth,
      { isTank: true, isBoss: true });
  });

  // Boss: Hive
  makeTexture(scene, 'boss-hive', 48, 64, (g) => {
    resetSeed(1000);
    drawZombieBody(g, 0, 0, 48, 64, PAL.zombieSkinDark, PAL.zombieCloth,
      { isHive: true });
  });
}


// ============================================================
// WEAPONS & PROJECTILES
// ============================================================

function generateWeaponTextures(scene: Phaser.Scene): void {
  // Bullet
  makeTexture(scene, 'bullet', 6, 3, (g) => {
    resetSeed(1100);
    g.fillStyle(0xffdd88, 1.0);
    g.fillRect(0, 0, 6, 3);
    g.fillStyle(0xffffff, 0.7);
    g.fillRect(4, 1, 2, 1);
    sketchRect(g, 0, 0, 6, 3, PAL.ink, 0.4, 0.5, 0.3);
  });

  // Pellet (shotgun scatter)
  makeTexture(scene, 'pellet', 4, 4, (g) => {
    resetSeed(1150);
    g.fillStyle(0xffcc66, 0.9);
    g.fillCircle(2, 2, 1.5);
    g.fillStyle(0xffffff, 0.5);
    g.fillRect(2, 1, 1, 1);
  });

  // Grenade
  makeTexture(scene, 'grenade', 10, 10, (g) => {
    resetSeed(1200);
    // Body
    sketchFillEllipse(g, 5, 6, 4, 4, 0x444433);
    // Top pin/lever
    g.lineStyle(1, 0x888866, 0.8);
    g.beginPath(); g.moveTo(5, 2); g.lineTo(5, 0); g.lineTo(7, 0); g.strokePath();
    // Grid lines
    sketchLine(g, 2, 4, 8, 4, PAL.ink, 0.3, 0.5);
    sketchLine(g, 2, 6, 8, 6, PAL.ink, 0.3, 0.5);
    sketchLine(g, 2, 8, 8, 8, PAL.ink, 0.3, 0.5);
    // Outline
    sketchEllipse(g, 5, 6, 4, 4, PAL.ink, 0.7, 1.2);
  });

  // Acid blob
  makeTexture(scene, 'acid-blob', 8, 8, (g) => {
    resetSeed(1250);
    // Blobby acid
    sketchFillEllipse(g, 4, 4, 3.5, 3, PAL.acidGreen, 0.8);
    sketchFillEllipse(g, 3, 3, 2, 2, brighten(PAL.acidGreen, 0.3), 0.5);
    // Drip
    g.fillStyle(PAL.acidGreen, 0.6);
    g.fillRect(3, 7, 2, 1);
    sketchEllipse(g, 4, 4, 3.5, 3, PAL.acidGreenDark, 0.5, 1);
  });

  // Muzzle flash
  makeTexture(scene, 'muzzle-flash', 16, 16, (g) => {
    resetSeed(1300);
    const cx = 8, cy = 8;
    // Bright core
    sketchFillEllipse(g, cx, cy, 3, 3, 0xffffff, 0.9);
    // Inner glow
    sketchFillEllipse(g, cx, cy, 5, 5, PAL.muzzleYellow, 0.6);
    // Outer glow
    sketchFillEllipse(g, cx, cy, 7, 7, PAL.muzzleYellow, 0.3);
    // Rays
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + rngRange(-0.3, 0.3);
      const len = rngRange(4, 7);
      g.lineStyle(rngRange(1, 2), PAL.muzzleWhite, 0.5);
      g.beginPath();
      g.moveTo(cx + Math.cos(angle) * 2, cy + Math.sin(angle) * 2);
      g.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
      g.strokePath();
    }
  });

  // Explosion spritesheet (5 frames)
  makeSpritesheet(scene, 'explosion', 64, 64, 5, (g, frame, offsetX) => {
    resetSeed(1400 + frame * 50);
    const cx = offsetX + 32, cy = 32;
    const progress = frame / 4; // 0.0 to 1.0
    const maxRadius = 28;
    const radius = 6 + maxRadius * progress;
    const alpha = 1.0 - progress * 0.6;

    // Outer smoke ring
    if (frame > 0) {
      sketchFillEllipse(g, cx, cy, radius + 4, radius + 2, PAL.smokeGray, alpha * 0.3);
    }
    // Fire ring
    sketchFillEllipse(g, cx, cy, radius, radius - 2, PAL.explosionOrange, alpha * 0.7);
    // Hot core (shrinks over time)
    const coreR = Math.max(2, (1 - progress) * 14);
    sketchFillEllipse(g, cx, cy, coreR, coreR, PAL.muzzleYellow, alpha * 0.9);
    sketchFillEllipse(g, cx, cy, coreR * 0.5, coreR * 0.5, 0xffffff, alpha * 0.7);

    // Debris particles
    for (let i = 0; i < 6 + frame * 2; i++) {
      const angle = rngRange(0, Math.PI * 2);
      const dist = rngRange(radius * 0.3, radius + 4);
      const px = cx + Math.cos(angle) * dist;
      const py = cy + Math.sin(angle) * dist;
      const pSize = rngRange(1, 3);
      g.fillStyle(
        rng() > 0.5 ? PAL.explosionOrange : PAL.muzzleYellow,
        alpha * rngRange(0.4, 0.9)
      );
      g.fillRect(px - pSize / 2, py - pSize / 2, pSize, pSize);
    }

    // Sketch outline
    if (frame < 4) {
      sketchEllipse(g, cx, cy, radius, radius - 2, PAL.ink, alpha * 0.3, 1, 1.5);
    }
  });
}


// ============================================================
// TRAIN PARTS
// ============================================================

function generateTrainTextures(scene: Phaser.Scene): void {
  // Train wall - dark metal panel, tileable
  makeTexture(scene, 'train-wall', 32, 32, (g) => {
    resetSeed(2000);
    // Base metal
    sketchFillRect(g, 0, 0, 32, 32, PAL.metalDark);
    // Panel lines (horizontal seams)
    sketchLine(g, 0, 10, 32, 10, PAL.ink, 0.3, 1, 0.4);
    sketchLine(g, 0, 21, 32, 21, PAL.ink, 0.3, 1, 0.4);
    // Vertical seam
    sketchLine(g, 16, 0, 16, 32, PAL.ink, 0.2, 0.5, 0.3);
    // Rivets
    const rivetPositions = [[4, 4], [28, 4], [4, 16], [28, 16], [4, 28], [28, 28]];
    for (const [rx, ry] of rivetPositions) {
      g.fillStyle(PAL.metalRivet, 0.6);
      g.fillCircle(rx, ry, 1.5);
      g.fillStyle(PAL.metalLight, 0.3);
      g.fillRect(rx - 0.5, ry - 0.5, 1, 1);
    }
    // Wear and scratches
    for (let i = 0; i < 4; i++) {
      const sx = rngRange(2, 28);
      const sy = rngRange(2, 28);
      sketchLine(g, sx, sy, sx + rngRange(-5, 5), sy + rngRange(-2, 2),
        PAL.metalLight, 0.15, 0.5, 0.3);
    }
    drawHatching(g, 0, 0, 32, 32, PAL.ink, 0.08, 4, 0.5);
    addNoise(g, 0, 0, 32, 32, PAL.ink, 0.05, 0.1);
  });

  // Train floor - worn wood planks
  makeTexture(scene, 'train-floor', 32, 32, (g) => {
    resetSeed(2100);
    // Base wood
    sketchFillRect(g, 0, 0, 32, 32, PAL.floorWood);
    // Wood planks (horizontal)
    for (let py = 0; py < 32; py += 8) {
      sketchFillRect(g, 0, py, 32, 7, lerpColor(PAL.floorWood, PAL.floorWoodDark, rngRange(0, 0.3)));
      // Plank edge line
      sketchLine(g, 0, py, 32, py, PAL.ink, 0.3, 0.8, 0.4);
      // Wood grain
      for (let gx = 0; gx < 32; gx += rngRange(3, 7)) {
        sketchLine(g, gx, py + 1, gx + rngRange(-1, 1), py + 6,
          PAL.floorWoodDark, 0.2, 0.5, 0.3);
      }
    }
    // Wear marks
    g.fillStyle(PAL.floorWoodDark, 0.15);
    g.fillRect(rngRange(4, 20), rngRange(4, 20), rngRange(4, 10), rngRange(4, 10));
    addNoise(g, 0, 0, 32, 32, PAL.ink, 0.04, 0.1);
  });

  // Train roof
  makeTexture(scene, 'train-roof', 32, 32, (g) => {
    resetSeed(2200);
    sketchFillRect(g, 0, 0, 32, 32, PAL.roofDark);
    // Metal ridges
    for (let ry = 0; ry < 32; ry += 8) {
      sketchLine(g, 0, ry, 32, ry, PAL.metalLight, 0.2, 1, 0.3);
    }
    // Weathering
    drawHatching(g, 0, 0, 32, 32, PAL.ink, 0.06, 5, 0.3);
    addNoise(g, 0, 0, 32, 32, PAL.metalLight, 0.03, 0.1);
    addNoise(g, 0, 0, 32, 32, PAL.ink, 0.04, 0.15);
  });

  // Train window
  makeTexture(scene, 'train-window', 40, 30, (g) => {
    resetSeed(2300);
    // Frame
    sketchFillRect(g, 0, 0, 40, 30, PAL.metalDark);
    // Glass (dark, dim light from inside)
    sketchFillRect(g, 3, 3, 34, 24, 0x1a2233);
    // Dim interior light reflection
    g.fillStyle(0x334455, 0.3);
    g.fillRect(5, 5, 15, 10);
    g.fillStyle(0x445566, 0.15);
    g.fillRect(6, 6, 8, 6);
    // Grime on window
    addNoise(g, 3, 3, 34, 24, PAL.ink, 0.06, 0.2);
    // Cracks
    sketchLine(g, 8, 5, 20, 18, PAL.metalLight, 0.15, 0.5, 0.5);
    sketchLine(g, 20, 18, 28, 12, PAL.metalLight, 0.12, 0.5, 0.4);
    // Frame outline
    sketchRect(g, 0, 0, 40, 30, PAL.ink, 0.8, 1.5);
    sketchRect(g, 3, 3, 34, 24, PAL.ink, 0.5, 1);
  });

  // Train door
  makeTexture(scene, 'train-door', 32, 48, (g) => {
    resetSeed(2400);
    // Door frame
    sketchFillRect(g, 0, 0, 32, 48, PAL.metalDark);
    // Door panels
    sketchFillRect(g, 3, 3, 26, 20, darken(PAL.metalMid, 0.1));
    sketchFillRect(g, 3, 26, 26, 19, darken(PAL.metalMid, 0.15));
    // Panel outlines
    sketchRect(g, 3, 3, 26, 20, PAL.ink, 0.5, 1);
    sketchRect(g, 3, 26, 26, 19, PAL.ink, 0.5, 1);
    // Handle
    g.fillStyle(PAL.metalRivet, 0.8);
    g.fillRect(24, 24, 3, 6);
    sketchRect(g, 24, 24, 3, 6, PAL.ink, 0.5, 0.8);
    // Hinges
    g.fillStyle(PAL.metalMid, 0.6);
    g.fillRect(1, 8, 2, 6);
    g.fillRect(1, 34, 2, 6);
    // Door outline
    sketchRect(g, 0, 0, 32, 48, PAL.ink, 0.9, 1.5);
    drawHatching(g, 3, 3, 26, 42, PAL.ink, 0.06, 4);
    addNoise(g, 0, 0, 32, 48, PAL.ink, 0.03, 0.1);
  });

  // Train ladder
  makeTexture(scene, 'train-ladder', 24, 48, (g) => {
    resetSeed(2500);
    // Side rails
    const railW = 3;
    sketchFillRect(g, 2, 0, railW, 48, PAL.metalMid);
    sketchFillRect(g, 19, 0, railW, 48, PAL.metalMid);
    sketchRect(g, 2, 0, railW, 48, PAL.ink, 0.7, 1.2);
    sketchRect(g, 19, 0, railW, 48, PAL.ink, 0.7, 1.2);
    // Rungs
    for (let ry = 4; ry < 48; ry += 10) {
      sketchFillRect(g, 5, ry, 14, 3, PAL.metalMid);
      sketchRect(g, 5, ry, 14, 3, PAL.ink, 0.6, 1);
      // Wear mark on rung
      g.fillStyle(PAL.metalLight, 0.2);
      g.fillRect(8, ry + 1, 8, 1);
    }
    addNoise(g, 0, 0, 24, 48, PAL.ink, 0.03, 0.1);
  });

  // Train connector (between cars)
  makeTexture(scene, 'train-connector', 48, 48, (g) => {
    resetSeed(2600);
    // Gap/sky visible below
    sketchFillRect(g, 0, 0, 48, 48, 0x0a0a1a);
    // Metal platform plates
    sketchFillRect(g, 0, 16, 14, 16, PAL.metalDark);
    sketchFillRect(g, 34, 16, 14, 16, PAL.metalDark);
    // Coupling mechanism in center
    sketchFillRect(g, 18, 20, 12, 8, PAL.metalMid);
    sketchRect(g, 18, 20, 12, 8, PAL.ink, 0.6, 1);
    // Chain links
    for (let i = 0; i < 3; i++) {
      sketchEllipse(g, 14 + i * 4, 24, 2, 3, PAL.metalLight, 0.5, 1, 0.3);
    }
    for (let i = 0; i < 3; i++) {
      sketchEllipse(g, 34 + i * 4, 24, 2, 3, PAL.metalLight, 0.5, 1, 0.3);
    }
    // Platform outlines
    sketchRect(g, 0, 16, 14, 16, PAL.ink, 0.7, 1.2);
    sketchRect(g, 34, 16, 14, 16, PAL.ink, 0.7, 1.2);
    // Danger stripes (subtle)
    for (let i = 0; i < 6; i++) {
      g.fillStyle(0x886622, 0.15);
      g.fillRect(i * 8, 16, 4, 2);
      g.fillRect(i * 8, 30, 4, 2);
    }
    addNoise(g, 0, 0, 48, 48, PAL.ink, 0.03, 0.1);
  });

  // Train wheel
  makeTexture(scene, 'train-wheel', 24, 24, (g) => {
    resetSeed(2700);
    const cx = 12, cy = 12;
    // Wheel body
    sketchFillEllipse(g, cx, cy, 10, 10, PAL.metalDark);
    sketchFillEllipse(g, cx, cy, 7, 7, PAL.metalMid);
    // Hub
    sketchFillEllipse(g, cx, cy, 3, 3, PAL.metalLight);
    // Spokes
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      sketchLine(g, cx + Math.cos(angle) * 3, cy + Math.sin(angle) * 3,
        cx + Math.cos(angle) * 8, cy + Math.sin(angle) * 8,
        PAL.ink, 0.4, 1, 0.3);
    }
    // Outer rim
    sketchEllipse(g, cx, cy, 10, 10, PAL.ink, 0.8, 1.5, 0.5);
    sketchEllipse(g, cx, cy, 7, 7, PAL.ink, 0.4, 0.8, 0.3);
    // Hub outline
    sketchEllipse(g, cx, cy, 3, 3, PAL.ink, 0.6, 1, 0.3);
  });
}


// ============================================================
// BARRICADES
// ============================================================

function generateBarricadeTextures(scene: Phaser.Scene): void {
  // Wooden barricade
  makeTexture(scene, 'barricade-wood', 32, 48, (g) => {
    resetSeed(3000);
    // Vertical planks
    for (let px = 0; px < 32; px += 8) {
      const plankColor = lerpColor(PAL.woodLight, PAL.woodDark, rngRange(0, 0.4));
      sketchFillRect(g, px, 0, 7, 48, plankColor);
      // Wood grain lines
      for (let gy = 0; gy < 48; gy += rngRange(3, 8)) {
        sketchLine(g, px + 1, gy, px + 6, gy + rngRange(-1, 1),
          PAL.woodGrain, 0.2, 0.5, 0.3);
      }
      // Knots
      if (rng() > 0.6) {
        const kx = px + rngRange(2, 5);
        const ky = rngRange(8, 40);
        sketchEllipse(g, kx, ky, 2, 1.5, PAL.woodDark, 0.4, 0.8);
      }
      // Plank edges
      sketchLine(g, px, 0, px, 48, PAL.ink, 0.3, 0.8, 0.3);
    }
    // Horizontal cross planks
    sketchFillRect(g, 0, 10, 32, 4, PAL.woodDark);
    sketchFillRect(g, 0, 34, 32, 4, PAL.woodDark);
    sketchRect(g, 0, 10, 32, 4, PAL.ink, 0.5, 1);
    sketchRect(g, 0, 34, 32, 4, PAL.ink, 0.5, 1);
    // Nails
    const nailPositions = [[4, 11], [20, 11], [12, 35], [28, 35]];
    for (const [nx, ny] of nailPositions) {
      g.fillStyle(PAL.metalRivet, 0.6);
      g.fillCircle(nx, ny, 1);
    }
    // Damage/cracks
    sketchLine(g, 5, 20, 8, 28, PAL.ink, 0.2, 0.8, 0.5);
    // Overall outline
    sketchRect(g, 0, 0, 32, 48, PAL.ink, 0.7, 1.3);
    addNoise(g, 0, 0, 32, 48, PAL.ink, 0.03, 0.1);
  });

  // Metal barricade
  makeTexture(scene, 'barricade-metal', 32, 48, (g) => {
    resetSeed(3100);
    // Base metal sheet
    sketchFillRect(g, 0, 0, 32, 48, PAL.metalBarricade);
    // Panel sections
    sketchFillRect(g, 2, 2, 28, 22, darken(PAL.metalBarricade, 0.1));
    sketchFillRect(g, 2, 26, 28, 20, darken(PAL.metalBarricade, 0.15));
    // Rivets along edges
    for (let ry = 4; ry < 48; ry += 8) {
      g.fillStyle(PAL.metalRivet, 0.6);
      g.fillCircle(4, ry, 1.2);
      g.fillCircle(28, ry, 1.2);
    }
    // Welds
    sketchLine(g, 2, 24, 30, 24, PAL.metalLight, 0.3, 1.5, 0.5);
    // Dents
    sketchEllipse(g, 14, 12, 4, 3, PAL.metalLight, 0.15, 0.8);
    sketchEllipse(g, 22, 36, 3, 4, PAL.metalLight, 0.12, 0.7);
    // Scratches
    for (let i = 0; i < 3; i++) {
      sketchLine(g, rngRange(4, 28), rngRange(4, 44),
        rngRange(4, 28), rngRange(4, 44),
        PAL.metalLight, 0.12, 0.5, 0.5);
    }
    // Panel outlines
    sketchRect(g, 2, 2, 28, 22, PAL.ink, 0.5, 1);
    sketchRect(g, 2, 26, 28, 20, PAL.ink, 0.5, 1);
    // Overall outline
    sketchRect(g, 0, 0, 32, 48, PAL.ink, 0.8, 1.5);
    drawHatching(g, 2, 2, 28, 44, PAL.ink, 0.06, 4);
    addNoise(g, 0, 0, 32, 48, PAL.ink, 0.03, 0.08);
  });

  // Electric barricade
  makeTexture(scene, 'barricade-electric', 32, 48, (g) => {
    resetSeed(3200);
    // Posts
    sketchFillRect(g, 2, 0, 4, 48, PAL.metalMid);
    sketchFillRect(g, 26, 0, 4, 48, PAL.metalMid);
    sketchRect(g, 2, 0, 4, 48, PAL.ink, 0.7, 1.2);
    sketchRect(g, 26, 0, 4, 48, PAL.ink, 0.7, 1.2);
    // Wire mesh between posts
    for (let wy = 4; wy < 48; wy += 6) {
      sketchLine(g, 6, wy, 26, wy, PAL.metalLight, 0.4, 0.8, 0.5);
    }
    for (let wx = 10; wx < 26; wx += 5) {
      sketchLine(g, wx, 2, wx, 46, PAL.metalLight, 0.3, 0.5, 0.4);
    }
    // Electric sparks/glow
    for (let i = 0; i < 5; i++) {
      const sx = rngRange(8, 24);
      const sy = rngRange(4, 44);
      // Spark lines
      sketchLine(g, sx, sy, sx + rngRange(-4, 4), sy + rngRange(-4, 4),
        PAL.electricBlue, 0.7, 1, 0.8);
      // Glow dot
      g.fillStyle(PAL.electricBlue, 0.5);
      g.fillCircle(sx, sy, 2);
      g.fillStyle(0xffffff, 0.3);
      g.fillCircle(sx, sy, 1);
    }
    // Insulator caps on posts
    sketchFillRect(g, 1, 0, 6, 3, PAL.metalLight);
    sketchFillRect(g, 25, 0, 6, 3, PAL.metalLight);
    sketchRect(g, 1, 0, 6, 3, PAL.ink, 0.5, 0.8);
    sketchRect(g, 25, 0, 6, 3, PAL.ink, 0.5, 0.8);
    // Warning sign (tiny)
    g.fillStyle(0xccaa00, 0.5);
    g.fillRect(13, 20, 6, 6);
    sketchLine(g, 16, 21, 16, 24, PAL.ink, 0.6, 1, 0.2);
    g.fillStyle(PAL.ink, 0.5);
    g.fillRect(15, 24, 2, 1);
  });
}


// ============================================================
// ENVIRONMENT / PARALLAX BACKGROUNDS
// ============================================================

function generateEnvironmentTextures(scene: Phaser.Scene): void {
  // Sky gradient - dark apocalyptic sky
  makeTexture(scene, 'bg-sky', 1280, 360, (g) => {
    resetSeed(4000);
    // Gradient from dark top to slightly lighter horizon
    const steps = 36;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const color = lerpColor(0x050510, 0x1a1a2e, t);
      const y = (i / steps) * 360;
      const h = 360 / steps + 1;
      g.fillStyle(color, 1.0);
      g.fillRect(0, y, 1280, h);
    }
    // Stars
    for (let i = 0; i < 60; i++) {
      const sx = rngRange(0, 1280);
      const sy = rngRange(0, 240);
      const brightness = rngRange(0.2, 0.7);
      g.fillStyle(0xffffff, brightness);
      g.fillRect(sx, sy, 1, 1);
    }
    // Faint clouds / haze
    for (let i = 0; i < 8; i++) {
      const cx = rngRange(0, 1280);
      const cy = rngRange(100, 300);
      const cw = rngRange(60, 200);
      const ch = rngRange(10, 30);
      g.fillStyle(0x222233, rngRange(0.05, 0.15));
      g.fillEllipse(cx, cy, cw, ch);
    }
    // Reddish haze near horizon
    g.fillStyle(0x331111, 0.1);
    g.fillRect(0, 280, 1280, 80);
  });

  // Mountain silhouettes
  makeTexture(scene, 'bg-mountains', 1280, 200, (g) => {
    resetSeed(4100);
    // Transparent base
    g.fillStyle(0x000000, 0);
    g.fillRect(0, 0, 1280, 200);
    // Draw mountain range as a jagged polygon
    g.fillStyle(PAL.mountainDark, 0.9);
    g.beginPath();
    g.moveTo(0, 200);
    // Generate mountain peaks
    let x = 0;
    while (x < 1300) {
      const peakH = rngRange(40, 160);
      const peakW = rngRange(80, 200);
      const peakX = x + peakW / 2;
      // Rising slope
      for (let sx = x; sx < peakX; sx += 8) {
        const t = (sx - x) / (peakX - x);
        const y = 200 - peakH * t + rngRange(-3, 3);
        g.lineTo(sx, y);
      }
      // Falling slope
      const endX = x + peakW;
      for (let sx = peakX; sx < endX; sx += 8) {
        const t = (sx - peakX) / (endX - peakX);
        const y = 200 - peakH * (1 - t) + rngRange(-3, 3);
        g.lineTo(sx, y);
      }
      x = endX - rngRange(10, 40); // Overlap for continuity
    }
    g.lineTo(1280, 200);
    g.closePath();
    g.fillPath();
    // Snow caps on tallest peaks (faint)
    // Add subtle hatching for texture
    drawHatching(g, 0, 40, 1280, 160, 0x0a0a18, 0.08, 6, 0.3);
  });

  // Hills layer
  makeTexture(scene, 'bg-hills', 1280, 150, (g) => {
    resetSeed(4200);
    g.fillStyle(PAL.hillDark, 0.9);
    g.beginPath();
    g.moveTo(0, 150);
    for (let x = 0; x <= 1280; x += 4) {
      const y = 150 - 40 - Math.sin(x * 0.008) * 30
        - Math.sin(x * 0.015 + 1) * 20
        - Math.sin(x * 0.003) * 25
        + rngRange(-2, 2);
      g.lineTo(x, Math.max(10, y));
    }
    g.lineTo(1280, 150);
    g.closePath();
    g.fillPath();
    drawHatching(g, 0, 20, 1280, 130, 0x0a0a16, 0.06, 5, 0.4);
  });

  // Dead tree silhouettes
  makeTexture(scene, 'bg-trees', 1280, 120, (g) => {
    resetSeed(4300);
    // Ground line
    g.fillStyle(PAL.treeDark, 0.9);
    g.fillRect(0, 90, 1280, 30);

    // Draw dead trees
    for (let i = 0; i < 25; i++) {
      const tx = rngRange(0, 1280);
      const treeH = rngRange(30, 80);
      const trunkW = rngRange(2, 5);
      const baseY = 90;

      // Trunk
      g.lineStyle(trunkW, PAL.treeDark, 0.9);
      g.beginPath();
      g.moveTo(tx, baseY);
      g.lineTo(tx + rngRange(-3, 3), baseY - treeH);
      g.strokePath();

      // Dead branches
      const numBranches = rngInt(2, 5);
      for (let b = 0; b < numBranches; b++) {
        const branchY = baseY - treeH * rngRange(0.3, 0.9);
        const branchLen = rngRange(8, 25);
        const dir = rng() > 0.5 ? 1 : -1;
        const branchAngle = rngRange(-0.8, -0.2) * dir;
        g.lineStyle(rngRange(1, 3), PAL.treeDark, 0.8);
        g.beginPath();
        g.moveTo(tx, branchY);
        g.lineTo(
          tx + Math.cos(branchAngle) * branchLen * dir,
          branchY + Math.sin(branchAngle) * branchLen
        );
        g.strokePath();
      }
    }
  });

  // Railroad tracks
  makeTexture(scene, 'bg-tracks', 1280, 80, (g) => {
    resetSeed(4400);
    // Ground/ballast
    sketchFillRect(g, 0, 0, 1280, 80, 0x1a1a22);
    // Gravel texture
    addNoise(g, 0, 0, 1280, 80, 0x333344, 0.08, 0.15);
    addNoise(g, 0, 0, 1280, 80, 0x111118, 0.05, 0.2);
    // Rails
    const railY1 = 30;
    const railY2 = 50;
    g.fillStyle(PAL.metalMid, 0.8);
    g.fillRect(0, railY1, 1280, 3);
    g.fillRect(0, railY2, 1280, 3);
    // Rail top highlight
    g.fillStyle(PAL.metalLight, 0.3);
    g.fillRect(0, railY1, 1280, 1);
    g.fillRect(0, railY2, 1280, 1);
    // Ties (sleepers)
    for (let tx = 0; tx < 1280; tx += 20) {
      sketchFillRect(g, tx, railY1 - 4, 12, railY2 - railY1 + 10, PAL.floorWoodDark);
      sketchLine(g, tx + 1, railY1 - 3, tx + 1, railY2 + 5, PAL.ink, 0.15, 0.5, 0.3);
      sketchLine(g, tx + 10, railY1 - 3, tx + 10, railY2 + 5, PAL.ink, 0.15, 0.5, 0.3);
    }
  });
}


// ============================================================
// UI ELEMENTS
// ============================================================

function generateUITextures(scene: Phaser.Scene): void {
  // Health bar background
  makeTexture(scene, 'health-bar-bg', 200, 20, (g) => {
    resetSeed(5000);
    sketchFillRect(g, 0, 0, 200, 20, PAL.uiBg);
    // Border bevel
    g.fillStyle(0x333344, 0.5);
    g.fillRect(0, 0, 200, 1);
    g.fillRect(0, 0, 1, 20);
    g.fillStyle(0x111122, 0.5);
    g.fillRect(0, 19, 200, 1);
    g.fillRect(199, 0, 1, 20);
    // Inner frame
    sketchRect(g, 1, 1, 198, 18, PAL.ink, 0.4, 0.8);
    // Subtle hash marks for scale
    for (let i = 1; i <= 9; i++) {
      const mx = i * 20;
      g.fillStyle(PAL.inkFaint, 0.2);
      g.fillRect(mx, 2, 1, 16);
    }
  });

  // Health bar fill
  makeTexture(scene, 'health-bar-fill', 200, 20, (g) => {
    resetSeed(5050);
    // Red gradient
    for (let x = 0; x < 200; x++) {
      const t = x / 200;
      const color = lerpColor(PAL.healthRedDark, PAL.healthRed, t * 0.7);
      g.fillStyle(color, 0.9);
      g.fillRect(x, 2, 1, 16);
    }
    // Highlight strip
    g.fillStyle(0xff4444, 0.3);
    g.fillRect(0, 4, 200, 3);
    // Gloss
    g.fillStyle(0xffffff, 0.08);
    g.fillRect(0, 2, 200, 8);
    addNoise(g, 0, 2, 200, 16, PAL.ink, 0.02, 0.1);
  });

  // Ammo icon
  makeTexture(scene, 'ammo-icon', 16, 16, (g) => {
    resetSeed(5100);
    const cx = 8, cy = 8;
    // Bullet casing
    sketchFillRect(g, 5, 4, 6, 10, PAL.ammoGold);
    // Bullet tip
    g.fillStyle(0x886633, 0.9);
    g.beginPath();
    g.moveTo(5, 4);
    g.lineTo(8, 1);
    g.lineTo(11, 4);
    g.closePath();
    g.fillPath();
    // Casing line
    sketchLine(g, 5, 8, 11, 8, PAL.ink, 0.3, 0.5);
    // Highlight
    g.fillStyle(0xffdd88, 0.3);
    g.fillRect(6, 5, 2, 8);
    // Outline
    sketchRect(g, 5, 4, 6, 10, PAL.ink, 0.6, 1);
  });

  // Coin icon
  makeTexture(scene, 'coin-icon', 16, 16, (g) => {
    resetSeed(5200);
    const cx = 8, cy = 8;
    // Coin body
    sketchFillEllipse(g, cx, cy, 6, 6, PAL.coinGold);
    // Inner ring
    sketchEllipse(g, cx, cy, 4, 4, darken(PAL.coinGold, 0.2), 0.5, 1);
    // Dollar sign or symbol
    g.fillStyle(darken(PAL.coinGold, 0.3), 0.8);
    g.fillRect(7, 4, 2, 8);
    g.fillRect(6, 5, 4, 1);
    g.fillRect(6, 10, 4, 1);
    // Highlight
    g.fillStyle(0xffffff, 0.15);
    g.fillRect(5, 4, 4, 4);
    // Outline
    sketchEllipse(g, cx, cy, 6, 6, PAL.ink, 0.7, 1.2);
  });

  // Crosshair
  makeTexture(scene, 'crosshair', 24, 24, (g) => {
    resetSeed(5300);
    const cx = 12, cy = 12;
    const lineColor = 0xcc3333;
    // Cross lines with gap in center
    sketchLine(g, cx - 10, cy, cx - 3, cy, lineColor, 0.8, 1.5, 0.3);
    sketchLine(g, cx + 3, cy, cx + 10, cy, lineColor, 0.8, 1.5, 0.3);
    sketchLine(g, cx, cy - 10, cx, cy - 3, lineColor, 0.8, 1.5, 0.3);
    sketchLine(g, cx, cy + 3, cx, cy + 10, lineColor, 0.8, 1.5, 0.3);
    // Center dot
    g.fillStyle(lineColor, 0.9);
    g.fillCircle(cx, cy, 1);
    // Outer ring (faint)
    sketchEllipse(g, cx, cy, 9, 9, lineColor, 0.3, 0.8, 0.4);
  });
}


// ============================================================
// EFFECTS
// ============================================================

function generateEffectTextures(scene: Phaser.Scene): void {
  // Blood splatters (3 variants)
  for (let variant = 1; variant <= 3; variant++) {
    makeTexture(scene, `blood-${variant}`, 16, 16, (g) => {
      resetSeed(6000 + variant * 100);
      const cx = 8, cy = 8;
      // Main splat
      const mainR = rngRange(3, 5);
      sketchFillEllipse(g, cx, cy, mainR, mainR * rngRange(0.7, 1.3), PAL.bloodRed, 0.8);
      // Smaller splatter drops
      const numDrops = rngInt(3, 6);
      for (let i = 0; i < numDrops; i++) {
        const angle = rngRange(0, Math.PI * 2);
        const dist = rngRange(3, 7);
        const dx = cx + Math.cos(angle) * dist;
        const dy = cy + Math.sin(angle) * dist;
        const dr = rngRange(0.5, 2);
        g.fillStyle(lerpColor(PAL.bloodRed, PAL.bloodDark, rngRange(0, 0.5)), 0.7);
        g.fillCircle(dx, dy, dr);
      }
      // Streaks
      for (let i = 0; i < 2; i++) {
        const angle = rngRange(0, Math.PI * 2);
        const len = rngRange(3, 6);
        sketchLine(g, cx, cy,
          cx + Math.cos(angle) * len, cy + Math.sin(angle) * len,
          PAL.bloodDark, 0.4, rngRange(1, 2), 0.5);
      }
      // Dark center
      g.fillStyle(PAL.bloodDark, 0.4);
      g.fillCircle(cx, cy, mainR * 0.4);
    });
  }

  // Smoke puff
  makeTexture(scene, 'smoke', 16, 16, (g) => {
    resetSeed(6400);
    const cx = 8, cy = 8;
    // Layered circles for soft smoke
    sketchFillEllipse(g, cx, cy, 6, 5, PAL.smokeGray, 0.2);
    sketchFillEllipse(g, cx - 1, cy - 1, 4, 4, PAL.smokeGray, 0.3);
    sketchFillEllipse(g, cx + 2, cy + 1, 3, 3, PAL.smokeGray, 0.25);
    sketchFillEllipse(g, cx, cy, 2, 2, brighten(PAL.smokeGray, 0.2), 0.2);
    // Wispy edges
    addNoise(g, 2, 2, 12, 12, PAL.smokeGray, 0.05, 0.15);
  });

  // Spark
  makeTexture(scene, 'spark', 8, 8, (g) => {
    resetSeed(6500);
    const cx = 4, cy = 4;
    // Bright core
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(cx, cy, 1);
    // Yellow glow
    sketchFillEllipse(g, cx, cy, 3, 3, PAL.sparkYellow, 0.6);
    // Rays
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + rngRange(-0.3, 0.3);
      const len = rngRange(2, 3.5);
      g.lineStyle(0.5, PAL.sparkYellow, 0.5);
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
      g.strokePath();
    }
  });
}


// ============================================================
// NPC - SURVIVOR
// ============================================================

function generateNPCTextures(scene: Phaser.Scene): void {
  makeTexture(scene, 'survivor', 24, 44, (g) => {
    resetSeed(7000);
    const w = 24, h = 44;
    const cx = w / 2;
    const headY = 8;
    const bodyTop = 14;
    const bodyBot = 28;
    const legBot = 40;

    // Legs
    sketchFillRect(g, cx - 5, bodyBot, 3, legBot - bodyBot, PAL.civilianPants);
    sketchFillRect(g, cx + 2, bodyBot, 3, legBot - bodyBot, PAL.civilianPants);
    // Shoes
    sketchFillRect(g, cx - 6, legBot, 5, 4, PAL.boots);
    sketchFillRect(g, cx + 1, legBot, 5, 4, PAL.boots);
    sketchRect(g, cx - 5, bodyBot, 3, legBot - bodyBot + 4, PAL.ink, 0.6, 1);
    sketchRect(g, cx + 2, bodyBot, 3, legBot - bodyBot + 4, PAL.ink, 0.6, 1);

    // Torso - civilian shirt
    sketchFillRect(g, cx - 6, bodyTop, 12, bodyBot - bodyTop, PAL.civilianShirt);
    // Collar detail
    sketchLine(g, cx - 2, bodyTop, cx, bodyTop + 3, PAL.ink, 0.3, 0.5);
    sketchLine(g, cx + 2, bodyTop, cx, bodyTop + 3, PAL.ink, 0.3, 0.5);
    // Wrinkles
    drawHatching(g, cx - 6, bodyTop, 12, bodyBot - bodyTop, PAL.ink, 0.1, 4, 0.5);
    sketchRect(g, cx - 6, bodyTop, 12, bodyBot - bodyTop, PAL.ink, 0.7, 1.2);

    // Arms (at sides, not threatening)
    g.lineStyle(2.5, PAL.skinTone, 0.8);
    g.beginPath(); g.moveTo(cx - 7, bodyTop + 3); g.lineTo(cx - 9, bodyBot - 2); g.strokePath();
    g.beginPath(); g.moveTo(cx + 7, bodyTop + 3); g.lineTo(cx + 9, bodyBot - 2); g.strokePath();
    sketchLine(g, cx - 7, bodyTop + 3, cx - 9, bodyBot - 2, PAL.ink, 0.3, 0.5, 0.4);
    sketchLine(g, cx + 7, bodyTop + 3, cx + 9, bodyBot - 2, PAL.ink, 0.3, 0.5, 0.4);

    // Head
    sketchFillEllipse(g, cx, headY, 5, 6, PAL.skinTone);
    // Hair (different from player)
    g.fillStyle(0x5a4a3a, 0.9);
    g.fillRect(cx - 5, 1, 10, 5);
    // Frightened expression
    g.fillStyle(PAL.ink, 0.8);
    g.fillRect(cx - 3, headY - 1, 2, 2); // wide eyes
    g.fillRect(cx + 1, headY - 1, 2, 2);
    g.fillStyle(PAL.ink, 0.5);
    g.fillRect(cx - 2, headY + 3, 4, 1); // open mouth
    sketchEllipse(g, cx, headY, 5, 6, PAL.ink, 0.8, 1.2, 0.5);

    // Dirt/distress marks
    g.fillStyle(PAL.ink, 0.1);
    g.fillRect(cx + 2, bodyTop + 5, 3, 3);
    g.fillRect(cx - 5, bodyBot - 4, 2, 3);

    addNoise(g, 0, 0, w, h, PAL.ink, 0.03, 0.1);
  });
}

// ============================================================
// PARTICLES
// ============================================================

function generateParticleTextures(scene: Phaser.Scene): void {
  // Rain drop
  makeTexture(scene, 'rain-drop', 2, 8, (g) => {
    resetSeed(8000);
    // Thin blue-white line
    g.fillStyle(0x8899bb, 0.5);
    g.fillRect(0, 0, 1, 8);
    g.fillStyle(0xaabbdd, 0.3);
    g.fillRect(1, 1, 1, 6);
    // Brighter tip
    g.fillStyle(0xccddff, 0.4);
    g.fillRect(0, 0, 1, 2);
  });

  // Snowflake
  makeTexture(scene, 'snow-flake', 4, 4, (g) => {
    resetSeed(8100);
    g.fillStyle(0xddddee, 0.6);
    g.fillCircle(2, 2, 1.5);
    g.fillStyle(0xffffff, 0.3);
    g.fillRect(1, 1, 1, 1);
  });
}

// ============================================================
// MAIN EXPORT - Generate ALL assets
// ============================================================

export function generateAllAssets(scene: Phaser.Scene): void {
  generatePlayerTextures(scene);
  generateZombieTextures(scene);
  generateWeaponTextures(scene);
  generateTrainTextures(scene);
  generateBarricadeTextures(scene);
  generateEnvironmentTextures(scene);
  generateUITextures(scene);
  generateEffectTextures(scene);
  generateNPCTextures(scene);
  generateParticleTextures(scene);
}
