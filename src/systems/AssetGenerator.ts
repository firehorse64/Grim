// ============================================================
// AssetGenerator.ts – Procedural texture generation for the
// 3/4-angle survival train game.  Gritty, hand-drawn sketch
// aesthetic.  All textures are generated at runtime using
// Phaser Graphics objects.
// ============================================================

// ---- Seeded PRNG ----
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
  return colorNum(
    Math.floor(r1 + (r2 - r1) * t),
    Math.floor(g1 + (g2 - g1) * t),
    Math.floor(b1 + (b2 - b1) * t),
  );
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
function sketchLine(
  g: Phaser.GameObjects.Graphics,
  x1: number, y1: number, x2: number, y2: number,
  color: number, alpha = 1.0, thickness = 1, jitter = 0.8
): void {
  g.lineStyle(thickness, color, alpha);
  const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  const steps = Math.max(2, Math.floor(dist / 3));
  g.beginPath();
  g.moveTo(x1 + rngRange(-jitter, jitter), y1 + rngRange(-jitter, jitter));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    g.lineTo(
      x1 + (x2 - x1) * t + rngRange(-jitter, jitter),
      y1 + (y2 - y1) * t + rngRange(-jitter, jitter),
    );
  }
  g.strokePath();
}

function addNoise(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number,
  color: number, density = 0.08, alpha = 0.2
): void {
  const dots = Math.floor(w * h * density);
  for (let i = 0; i < dots; i++) {
    g.fillStyle(color, alpha * rngRange(0.3, 1.0));
    g.fillRect(x + rngRange(0, w), y + rngRange(0, h), 1, 1);
  }
}

function drawHatching(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number,
  color: number, alpha = 0.3, spacing = 3, angle = 0.785
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
    g.beginPath();
    g.moveTo(Math.max(x, Math.min(x + w, lx1)), Math.max(y, Math.min(y + h, ly1)));
    g.lineTo(Math.max(x, Math.min(x + w, lx2)), Math.max(y, Math.min(y + h, ly2)));
    g.strokePath();
  }
}

// ---- Texture factory ----
function makeTexture(
  scene: Phaser.Scene, key: string,
  width: number, height: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ add: false } as Phaser.Types.GameObjects.Graphics.Options);
  draw(g);
  g.generateTexture(key, width, height);
  g.destroy();
}

function makeSpritesheet(
  scene: Phaser.Scene, key: string,
  frameWidth: number, frameHeight: number, frameCount: number,
  draw: (g: Phaser.GameObjects.Graphics, frame: number, ox: number) => void,
): void {
  if (scene.textures.exists(key)) return;
  const tw = frameWidth * frameCount;
  const g = scene.make.graphics({ add: false } as Phaser.Types.GameObjects.Graphics.Options);
  for (let i = 0; i < frameCount; i++) draw(g, i, i * frameWidth);
  g.generateTexture(key, tw, frameHeight);
  g.destroy();
  const tex = scene.textures.get(key);
  if (tex) {
    tex.add('__BASE', 0, 0, 0, tw, frameHeight);
    for (let i = 0; i < frameCount; i++) {
      tex.add(i, 0, i * frameWidth, 0, frameWidth, frameHeight);
    }
  }
}

// ============================================================
// PALETTE  – muted, post-apocalyptic warmth inside,
// cold grey/blue outside
// ============================================================
const PAL = {
  // Train interior
  floorWood:     0x8b7355,
  floorWoodDark: 0x6b5540,
  wallMetal:     0x7a8a7a,
  wallMetalDark: 0x5a6a5a,
  wallPaint:     0x8aaa9a,  // faded teal-green paint
  wallPaintDark: 0x6a8a7a,
  window:        0x4a6080,  // dark glass
  windowFrame:   0x555555,
  seat:          0x666a80,
  seatCushion:   0x8888aa,
  shelf:         0x9a8a70,
  // String lights
  lightWarm:     0xffddaa,
  lightBulb:     0xffeecc,
  // Furniture
  bedFrame:      0xcccccc,
  bedBlanket:    0x5577aa,
  bedPillow:     0xddddcc,
  crate:         0x8a7a5a,
  crateLabel:    0xcc4444,
  workbench:     0x7a6a4a,
  stove:         0x555555,
  stoveFlame:    0xff8844,
  firstAid:      0xeeeeee,
  firstAidCross: 0xcc2222,
  plantGreen:    0x55aa55,
  plantPot:      0x996633,
  brakeMetal:    0x888888,
  brakeHandle:   0xcc3333,
  // Characters
  playerHoodie:  0xddaa22,  // yellow hoodie
  playerSkin:    0xeebb99,
  playerHair:    0x664433,
  playerBackpack:0x667744,
  playerBoots:   0x886644,
  npcShirt:      0x6688aa,
  npcSkin:       0xddaa88,
  npcHair:       0x332222,
  // Zombies
  zombieSkin:    0x779977,
  zombieClothes: 0x555544,
  zombieBlood:   0x993333,
  // Exterior
  groundDirt:    0x6a5a4a,
  groundGrass:   0x4a6a3a,
  gravel:        0x777777,
  rail:          0x999999,
  railTie:       0x6a5540,
  // Resources
  canRed:        0xcc4444,
  canGreen:      0x44aa44,
  canBlue:       0x4466cc,
  scrap:         0x888888,
  // UI
  barBg:         0x333333,
  barHunger:     0xddaa33,
  barEnergy:     0x4488cc,
  barHealth:     0xcc3333,
};

// ============================================================
// TRAIN INTERIOR TEXTURES
// ============================================================

function generateTrainTextures(scene: Phaser.Scene): void {
  // -- Floor tile (32×32) – wood planks from above --
  makeTexture(scene, 'train-floor', 32, 32, (g) => {
    resetSeed(100);
    g.fillStyle(PAL.floorWood, 1);
    g.fillRect(0, 0, 32, 32);
    // Horizontal plank lines
    for (let py = 0; py < 32; py += 8) {
      const c = lerpColor(PAL.floorWood, PAL.floorWoodDark, rngRange(0, 0.4));
      g.fillStyle(c, 1);
      g.fillRect(0, py, 32, 7);
      sketchLine(g, 0, py, 32, py, PAL.floorWoodDark, 0.5, 1, 0.3);
    }
    addNoise(g, 0, 0, 32, 32, 0x000000, 0.06, 0.15);
    // Scuff marks
    for (let i = 0; i < 3; i++) {
      g.fillStyle(darken(PAL.floorWood, 0.2), 0.3);
      g.fillRect(rngInt(2, 26), rngInt(2, 26), rngInt(2, 6), rngInt(1, 2));
    }
  });

  // -- Wall back (far wall, 32×48) – metallic teal-green with rivets --
  makeTexture(scene, 'train-wall-back', 32, 48, (g) => {
    resetSeed(200);
    // Lower part: paint
    g.fillStyle(PAL.wallPaint, 1);
    g.fillRect(0, 0, 32, 48);
    // Upper trim
    g.fillStyle(PAL.wallPaintDark, 1);
    g.fillRect(0, 0, 32, 6);
    // Scratches
    for (let i = 0; i < 4; i++) {
      sketchLine(g, rngInt(2, 30), rngInt(8, 44), rngInt(2, 30), rngInt(8, 44),
        darken(PAL.wallPaint, 0.15), 0.4, 1, 0.5);
    }
    // Rivets
    for (let rx = 4; rx < 32; rx += 12) {
      g.fillStyle(PAL.wallMetalDark, 0.6);
      g.fillCircle(rx, 3, 1.5);
      g.fillCircle(rx, 45, 1.5);
    }
    addNoise(g, 0, 0, 32, 48, 0x000000, 0.04, 0.1);
  });

  // -- Wall side (side wall, 32×32 tile) --
  makeTexture(scene, 'train-wall-side', 32, 32, (g) => {
    resetSeed(210);
    g.fillStyle(PAL.wallMetal, 1);
    g.fillRect(0, 0, 32, 32);
    g.fillStyle(PAL.wallPaint, 0.7);
    g.fillRect(0, 0, 32, 32);
    addNoise(g, 0, 0, 32, 32, 0x000000, 0.05, 0.12);
    // Vertical panel line
    sketchLine(g, 16, 0, 16, 32, PAL.wallMetalDark, 0.3, 1, 0.5);
  });

  // -- Window tile (32×48) – dark glass with frame --
  makeTexture(scene, 'train-window', 32, 48, (g) => {
    resetSeed(220);
    // Wall around window
    g.fillStyle(PAL.wallPaint, 1);
    g.fillRect(0, 0, 32, 48);
    // Window frame
    g.fillStyle(PAL.windowFrame, 1);
    g.fillRect(2, 8, 28, 32);
    // Glass
    g.fillStyle(PAL.window, 1);
    g.fillRect(4, 10, 24, 28);
    // Slight reflection
    g.fillStyle(0xffffff, 0.08);
    g.fillRect(6, 12, 8, 12);
    // Frame details
    sketchLine(g, 16, 10, 16, 38, PAL.windowFrame, 0.6, 1.5, 0.3);
    addNoise(g, 4, 10, 24, 28, 0x000000, 0.03, 0.15);
  });

  // -- Door between cars (32×48) --
  makeTexture(scene, 'train-door', 32, 48, (g) => {
    resetSeed(230);
    g.fillStyle(PAL.wallMetal, 1);
    g.fillRect(0, 0, 32, 48);
    // Door frame
    g.fillStyle(darken(PAL.wallMetal, 0.2), 1);
    g.fillRect(4, 2, 24, 44);
    // Door surface
    g.fillStyle(PAL.wallMetalDark, 1);
    g.fillRect(6, 4, 20, 40);
    // Handle
    g.fillStyle(0xcccccc, 1);
    g.fillRect(22, 22, 3, 6);
    // Small window in door
    g.fillStyle(PAL.window, 0.8);
    g.fillRect(10, 8, 12, 10);
    addNoise(g, 6, 4, 20, 40, 0x000000, 0.05, 0.12);
  });

  // -- Train exterior wall (as seen from outside, 32×48) --
  makeTexture(scene, 'train-exterior', 32, 48, (g) => {
    resetSeed(240);
    g.fillStyle(0x99aabb, 1);
    g.fillRect(0, 0, 32, 48);
    // Metal panels
    g.fillStyle(0x8899aa, 1);
    g.fillRect(0, 0, 32, 8);
    g.fillRect(0, 40, 32, 8);
    // Rust / weathering
    for (let i = 0; i < 5; i++) {
      g.fillStyle(0x887766, rngRange(0.1, 0.3));
      g.fillRect(rngInt(0, 28), rngInt(0, 44), rngInt(3, 8), rngInt(2, 5));
    }
    // Graffiti hint (colored streak)
    g.fillStyle(0x55aacc, 0.15);
    g.fillRect(rngInt(2, 10), rngInt(16, 30), rngInt(12, 20), rngInt(4, 8));
    addNoise(g, 0, 0, 32, 48, 0x000000, 0.04, 0.1);
  });

  // -- Seat (left side, 32×32) --
  makeTexture(scene, 'train-seat-left', 32, 32, (g) => {
    resetSeed(250);
    // Seat base
    g.fillStyle(PAL.seat, 1);
    g.fillRect(0, 4, 28, 24);
    // Cushion
    g.fillStyle(PAL.seatCushion, 1);
    g.fillRect(2, 6, 24, 20);
    // Backrest (at left edge, from 3/4 angle)
    g.fillStyle(darken(PAL.seat, 0.15), 1);
    g.fillRect(0, 2, 6, 28);
    addNoise(g, 2, 6, 24, 20, 0x000000, 0.04, 0.1);
  });

  // -- Seat (right side, mirrored) --
  makeTexture(scene, 'train-seat-right', 32, 32, (g) => {
    resetSeed(260);
    g.fillStyle(PAL.seat, 1);
    g.fillRect(4, 4, 28, 24);
    g.fillStyle(PAL.seatCushion, 1);
    g.fillRect(6, 6, 24, 20);
    g.fillStyle(darken(PAL.seat, 0.15), 1);
    g.fillRect(26, 2, 6, 28);
    addNoise(g, 6, 6, 24, 20, 0x000000, 0.04, 0.1);
  });

  // -- Overhead shelf / luggage rack (32×16) --
  makeTexture(scene, 'train-shelf', 32, 16, (g) => {
    resetSeed(270);
    g.fillStyle(PAL.shelf, 1);
    g.fillRect(0, 4, 32, 8);
    sketchLine(g, 0, 4, 32, 4, darken(PAL.shelf, 0.2), 0.5, 1, 0.3);
    sketchLine(g, 0, 12, 32, 12, darken(PAL.shelf, 0.2), 0.5, 1, 0.3);
    // Support brackets
    g.fillStyle(PAL.wallMetalDark, 0.6);
    g.fillRect(4, 0, 2, 4);
    g.fillRect(26, 0, 2, 4);
  });

  // -- Connector corridor floor (32×40) --
  makeTexture(scene, 'train-connector', 32, 40, (g) => {
    resetSeed(280);
    g.fillStyle(darken(PAL.floorWood, 0.3), 1);
    g.fillRect(0, 0, 32, 40);
    // Metal plates
    g.fillStyle(PAL.wallMetal, 0.4);
    g.fillRect(2, 2, 28, 36);
    // Gap lines
    for (let y = 0; y < 40; y += 10) {
      sketchLine(g, 0, y, 32, y, 0x000000, 0.3, 1, 0.5);
    }
    addNoise(g, 0, 0, 32, 40, 0x000000, 0.08, 0.2);
  });

  // -- String lights (decorative, 64×8) --
  makeTexture(scene, 'string-lights', 64, 8, (g) => {
    resetSeed(290);
    // Wire
    sketchLine(g, 0, 2, 64, 2, 0x444444, 0.6, 1, 0.5);
    // Bulbs
    for (let bx = 6; bx < 64; bx += 14) {
      const droopY = 2 + rngInt(1, 3);
      g.fillStyle(PAL.lightWarm, 0.9);
      g.fillCircle(bx, droopY, 2.5);
      // Glow
      g.fillStyle(PAL.lightBulb, 0.3);
      g.fillCircle(bx, droopY, 4);
    }
  });
}

// ============================================================
// FURNITURE TEXTURES
// ============================================================

function generateFurnitureTextures(scene: Phaser.Scene): void {
  // -- Bed (64×48, 3/4 angle shows mattress top + frame front) --
  makeTexture(scene, 'furniture-bed', 64, 48, (g) => {
    resetSeed(300);
    // Frame
    g.fillStyle(PAL.bedFrame, 1);
    g.fillRect(0, 8, 64, 4);   // headboard top edge
    g.fillRect(0, 40, 64, 4);  // foot top edge
    g.fillRect(0, 8, 4, 36);   // left bar
    g.fillRect(60, 8, 4, 36);  // right bar
    // Mattress
    g.fillStyle(0xccccbb, 1);
    g.fillRect(4, 12, 56, 28);
    // Blanket (blue)
    g.fillStyle(PAL.bedBlanket, 1);
    g.fillRect(4, 24, 56, 16);
    // Blanket fold
    g.fillStyle(brighten(PAL.bedBlanket, 0.15), 1);
    g.fillRect(4, 24, 56, 4);
    // Pillow
    g.fillStyle(PAL.bedPillow, 1);
    g.fillRect(10, 13, 20, 10);
    g.fillRect(34, 13, 20, 10);
    addNoise(g, 4, 12, 56, 28, 0x000000, 0.03, 0.08);
    // Patchwork quilt detail
    g.fillStyle(0x886655, 0.3);
    g.fillRect(20, 28, 12, 8);
    g.fillStyle(0x557766, 0.3);
    g.fillRect(36, 28, 12, 8);
  });

  // -- Storage crate (32×36, front face + top visible) --
  makeTexture(scene, 'furniture-crate', 32, 36, (g) => {
    resetSeed(310);
    // Top face (lighter)
    g.fillStyle(brighten(PAL.crate, 0.15), 1);
    g.fillRect(2, 2, 28, 12);
    // Front face
    g.fillStyle(PAL.crate, 1);
    g.fillRect(2, 14, 28, 20);
    // Wood grain
    for (let wy = 16; wy < 34; wy += 5) {
      sketchLine(g, 4, wy, 28, wy, darken(PAL.crate, 0.15), 0.4, 1, 0.4);
    }
    // Label
    g.fillStyle(PAL.crateLabel, 0.7);
    g.fillRect(8, 18, 16, 10);
    // Can icons on label
    g.fillStyle(0xffffff, 0.5);
    g.fillRect(12, 21, 4, 5);
    g.fillRect(18, 21, 4, 5);
    addNoise(g, 2, 2, 28, 32, 0x000000, 0.04, 0.1);
  });

  // -- Workbench (64×40, table with tools) --
  makeTexture(scene, 'furniture-workbench', 64, 40, (g) => {
    resetSeed(320);
    // Table top
    g.fillStyle(PAL.workbench, 1);
    g.fillRect(0, 8, 64, 14);
    g.fillStyle(brighten(PAL.workbench, 0.1), 1);
    g.fillRect(0, 8, 64, 4);
    // Legs
    g.fillStyle(darken(PAL.workbench, 0.2), 1);
    g.fillRect(2, 22, 4, 18);
    g.fillRect(58, 22, 4, 18);
    // Tools on surface
    // Hammer
    g.fillStyle(0x996633, 1);
    g.fillRect(12, 10, 2, 8);
    g.fillStyle(0x888888, 1);
    g.fillRect(8, 9, 8, 3);
    // Wrench
    g.fillStyle(0x777777, 1);
    g.fillRect(30, 10, 12, 2);
    g.fillCircle(30, 11, 3);
    // Nails
    for (let i = 0; i < 4; i++) {
      g.fillStyle(0xaaaaaa, 0.7);
      g.fillRect(48 + i * 3, 11, 1, 4);
    }
    addNoise(g, 0, 8, 64, 14, 0x000000, 0.04, 0.1);
  });

  // -- Cooking stove (32×32, portable gas burner) --
  makeTexture(scene, 'furniture-stove', 32, 32, (g) => {
    resetSeed(330);
    // Base
    g.fillStyle(PAL.stove, 1);
    g.fillRect(2, 12, 28, 18);
    // Top surface
    g.fillStyle(brighten(PAL.stove, 0.2), 1);
    g.fillRect(2, 8, 28, 6);
    // Burner ring
    g.lineStyle(2, 0x444444, 1);
    g.strokeCircle(16, 11, 6);
    // Flame
    g.fillStyle(PAL.stoveFlame, 0.8);
    g.fillCircle(16, 11, 4);
    g.fillStyle(0xffcc44, 0.6);
    g.fillCircle(16, 11, 2);
    // Knob
    g.fillStyle(0xcccccc, 1);
    g.fillRect(24, 20, 4, 4);
    addNoise(g, 2, 8, 28, 22, 0x000000, 0.04, 0.1);
  });

  // -- First aid box (24×24) --
  makeTexture(scene, 'furniture-firstaid', 24, 24, (g) => {
    resetSeed(340);
    g.fillStyle(PAL.firstAid, 1);
    g.fillRect(2, 4, 20, 18);
    g.fillStyle(brighten(PAL.firstAid, 0.05), 1);
    g.fillRect(2, 2, 20, 6);
    // Red cross
    g.fillStyle(PAL.firstAidCross, 1);
    g.fillRect(9, 8, 6, 12);
    g.fillRect(5, 11, 14, 6);
    // Latch
    g.fillStyle(0xcccccc, 1);
    g.fillRect(10, 20, 4, 2);
  });

  // -- Plant box (32×32, small greenhouse box) --
  makeTexture(scene, 'furniture-plantbox', 32, 32, (g) => {
    resetSeed(350);
    // Pot/box
    g.fillStyle(PAL.plantPot, 1);
    g.fillRect(2, 16, 28, 14);
    g.fillStyle(brighten(PAL.plantPot, 0.15), 1);
    g.fillRect(2, 14, 28, 4);
    // Soil
    g.fillStyle(0x443322, 1);
    g.fillRect(4, 16, 24, 4);
    // Plants
    for (let px = 6; px < 28; px += 6) {
      const h = rngInt(8, 14);
      g.fillStyle(PAL.plantGreen, 0.9);
      g.fillRect(px, 16 - h, 2, h);
      // Leaves
      g.fillStyle(brighten(PAL.plantGreen, 0.2), 0.8);
      g.fillRect(px - 2, 16 - h, 6, 3);
      g.fillRect(px - 1, 16 - h + 4, 4, 2);
    }
  });

  // -- Brake panel (24×40) --
  makeTexture(scene, 'furniture-brake', 24, 40, (g) => {
    resetSeed(360);
    // Panel body
    g.fillStyle(PAL.brakeMetal, 1);
    g.fillRect(4, 4, 16, 32);
    g.fillStyle(darken(PAL.brakeMetal, 0.1), 1);
    g.fillRect(4, 4, 16, 4);
    // Lever slot
    g.fillStyle(0x333333, 1);
    g.fillRect(9, 10, 6, 20);
    // Lever handle
    g.fillStyle(PAL.brakeHandle, 1);
    g.fillRect(8, 12, 8, 6);
    // Bolts
    g.fillStyle(0xaaaaaa, 0.7);
    g.fillCircle(8, 8, 1.5);
    g.fillCircle(16, 8, 1.5);
    g.fillCircle(8, 34, 1.5);
    g.fillCircle(16, 34, 1.5);
  });

  // -- Barricade boards (32×32) --
  makeTexture(scene, 'furniture-barricade', 32, 32, (g) => {
    resetSeed(370);
    // Wooden boards nailed across
    for (let by = 2; by < 28; by += 10) {
      const c = lerpColor(0x8a7a5a, 0x6a5a3a, rng());
      g.fillStyle(c, 1);
      g.fillRect(0, by, 32, 8);
      sketchLine(g, 0, by, 32, by, darken(c, 0.2), 0.5, 1, 0.3);
      // Nails
      g.fillStyle(0xaaaaaa, 1);
      g.fillRect(4, by + 3, 2, 2);
      g.fillRect(26, by + 3, 2, 2);
    }
    addNoise(g, 0, 0, 32, 32, 0x000000, 0.05, 0.12);
  });
}

// ============================================================
// CHARACTER TEXTURES (3/4 angle)
// ============================================================

function generateCharacterTextures(scene: Phaser.Scene): void {
  const PW = 24;
  const PH = 32;

  // -- Player facing down (toward camera, most common view) --
  makeTexture(scene, 'player-down', PW, PH, (g) => {
    resetSeed(400);
    // Shadow
    g.fillStyle(0x000000, 0.15);
    g.fillEllipse(12, 30, 16, 6);
    // Boots
    g.fillStyle(PAL.playerBoots, 1);
    g.fillRect(4, 26, 6, 5);
    g.fillRect(14, 26, 6, 5);
    // Legs (shorts)
    g.fillStyle(0x445566, 1);
    g.fillRect(6, 22, 5, 5);
    g.fillRect(13, 22, 5, 5);
    // Body (yellow hoodie)
    g.fillStyle(PAL.playerHoodie, 1);
    g.fillRect(4, 10, 16, 13);
    // Hood
    g.fillStyle(darken(PAL.playerHoodie, 0.1), 1);
    g.fillRect(5, 3, 14, 8);
    // Face (peeking from hood)
    g.fillStyle(PAL.playerSkin, 1);
    g.fillRect(7, 5, 10, 6);
    // Hair
    g.fillStyle(PAL.playerHair, 1);
    g.fillRect(7, 3, 10, 3);
    // Eyes
    g.fillStyle(0x332222, 1);
    g.fillRect(9, 7, 2, 2);
    g.fillRect(13, 7, 2, 2);
    // Backpack (visible from front as side bulges)
    g.fillStyle(PAL.playerBackpack, 1);
    g.fillRect(1, 12, 4, 10);
    g.fillRect(19, 12, 4, 10);
    // Backpack straps
    g.fillStyle(darken(PAL.playerBackpack, 0.15), 1);
    g.fillRect(5, 12, 2, 8);
    g.fillRect(17, 12, 2, 8);
  });

  // -- Player facing up (away from camera — see backpack) --
  makeTexture(scene, 'player-up', PW, PH, (g) => {
    resetSeed(410);
    g.fillStyle(0x000000, 0.15);
    g.fillEllipse(12, 30, 16, 6);
    // Boots
    g.fillStyle(PAL.playerBoots, 1);
    g.fillRect(4, 26, 6, 5);
    g.fillRect(14, 26, 6, 5);
    // Legs
    g.fillStyle(0x445566, 1);
    g.fillRect(6, 22, 5, 5);
    g.fillRect(13, 22, 5, 5);
    // Body
    g.fillStyle(PAL.playerHoodie, 1);
    g.fillRect(4, 10, 16, 13);
    // Backpack (large, centered, visible from behind)
    g.fillStyle(PAL.playerBackpack, 1);
    g.fillRect(5, 10, 14, 12);
    // Backpack details
    g.fillStyle(darken(PAL.playerBackpack, 0.15), 1);
    g.fillRect(7, 12, 10, 2);  // flap
    g.fillRect(9, 16, 6, 4);   // pocket
    // Flashlight hanging off pack
    g.fillStyle(0x333333, 1);
    g.fillRect(17, 14, 2, 6);
    g.fillStyle(0x6688cc, 0.6);
    g.fillRect(17, 14, 2, 2); // lens
    // Hood / head
    g.fillStyle(darken(PAL.playerHoodie, 0.1), 1);
    g.fillRect(6, 3, 12, 8);
    // Hair peeking out
    g.fillStyle(PAL.playerHair, 1);
    g.fillRect(7, 3, 10, 4);
  });

  // -- Player facing left --
  makeTexture(scene, 'player-left', PW, PH, (g) => {
    resetSeed(420);
    g.fillStyle(0x000000, 0.15);
    g.fillEllipse(12, 30, 16, 6);
    // Boots
    g.fillStyle(PAL.playerBoots, 1);
    g.fillRect(4, 26, 8, 5);
    // Leg
    g.fillStyle(0x445566, 1);
    g.fillRect(6, 22, 6, 5);
    // Body
    g.fillStyle(PAL.playerHoodie, 1);
    g.fillRect(6, 10, 12, 13);
    // Arm forward
    g.fillStyle(darken(PAL.playerHoodie, 0.05), 1);
    g.fillRect(3, 14, 4, 8);
    // Backpack (side view)
    g.fillStyle(PAL.playerBackpack, 1);
    g.fillRect(16, 10, 6, 12);
    // Head
    g.fillStyle(darken(PAL.playerHoodie, 0.1), 1);
    g.fillRect(6, 3, 10, 8);
    g.fillStyle(PAL.playerSkin, 1);
    g.fillRect(5, 5, 6, 5);
    g.fillStyle(PAL.playerHair, 1);
    g.fillRect(8, 3, 8, 4);
    // Eye
    g.fillStyle(0x332222, 1);
    g.fillRect(6, 7, 2, 2);
  });

  // -- Player facing right (mirror of left) --
  makeTexture(scene, 'player-right', PW, PH, (g) => {
    resetSeed(430);
    g.fillStyle(0x000000, 0.15);
    g.fillEllipse(12, 30, 16, 6);
    g.fillStyle(PAL.playerBoots, 1);
    g.fillRect(12, 26, 8, 5);
    g.fillStyle(0x445566, 1);
    g.fillRect(12, 22, 6, 5);
    g.fillStyle(PAL.playerHoodie, 1);
    g.fillRect(6, 10, 12, 13);
    g.fillStyle(darken(PAL.playerHoodie, 0.05), 1);
    g.fillRect(17, 14, 4, 8);
    g.fillStyle(PAL.playerBackpack, 1);
    g.fillRect(2, 10, 6, 12);
    g.fillStyle(darken(PAL.playerHoodie, 0.1), 1);
    g.fillRect(8, 3, 10, 8);
    g.fillStyle(PAL.playerSkin, 1);
    g.fillRect(13, 5, 6, 5);
    g.fillStyle(PAL.playerHair, 1);
    g.fillRect(8, 3, 8, 4);
    g.fillStyle(0x332222, 1);
    g.fillRect(16, 7, 2, 2);
  });

  // -- NPC (Sarah) facing down --
  makeTexture(scene, 'npc-down', PW, PH, (g) => {
    resetSeed(500);
    g.fillStyle(0x000000, 0.15);
    g.fillEllipse(12, 30, 16, 6);
    g.fillStyle(0x665544, 1);
    g.fillRect(4, 26, 6, 5);
    g.fillRect(14, 26, 6, 5);
    g.fillStyle(0x556666, 1);
    g.fillRect(6, 22, 5, 5);
    g.fillRect(13, 22, 5, 5);
    g.fillStyle(PAL.npcShirt, 1);
    g.fillRect(4, 10, 16, 13);
    g.fillStyle(PAL.npcSkin, 1);
    g.fillRect(6, 3, 12, 8);
    g.fillStyle(PAL.npcHair, 1);
    g.fillRect(5, 1, 14, 4);
    g.fillRect(5, 1, 3, 8);
    g.fillRect(16, 1, 3, 8);
    g.fillStyle(0x332222, 1);
    g.fillRect(9, 5, 2, 2);
    g.fillRect(13, 5, 2, 2);
  });

  // -- NPC facing up --
  makeTexture(scene, 'npc-up', PW, PH, (g) => {
    resetSeed(510);
    g.fillStyle(0x000000, 0.15);
    g.fillEllipse(12, 30, 16, 6);
    g.fillStyle(0x665544, 1);
    g.fillRect(4, 26, 6, 5);
    g.fillRect(14, 26, 6, 5);
    g.fillStyle(0x556666, 1);
    g.fillRect(6, 22, 5, 5);
    g.fillRect(13, 22, 5, 5);
    g.fillStyle(PAL.npcShirt, 1);
    g.fillRect(4, 10, 16, 13);
    g.fillStyle(PAL.npcHair, 1);
    g.fillRect(5, 1, 14, 10);
  });

  // -- NPC facing left --
  makeTexture(scene, 'npc-left', PW, PH, (g) => {
    resetSeed(520);
    g.fillStyle(0x000000, 0.15);
    g.fillEllipse(12, 30, 16, 6);
    g.fillStyle(0x665544, 1);
    g.fillRect(4, 26, 8, 5);
    g.fillStyle(0x556666, 1);
    g.fillRect(6, 22, 6, 5);
    g.fillStyle(PAL.npcShirt, 1);
    g.fillRect(6, 10, 12, 13);
    g.fillStyle(PAL.npcSkin, 1);
    g.fillRect(5, 3, 8, 7);
    g.fillStyle(PAL.npcHair, 1);
    g.fillRect(5, 1, 10, 5);
    g.fillRect(5, 1, 3, 8);
    g.fillStyle(0x332222, 1);
    g.fillRect(6, 5, 2, 2);
  });

  // -- NPC facing right --
  makeTexture(scene, 'npc-right', PW, PH, (g) => {
    resetSeed(530);
    g.fillStyle(0x000000, 0.15);
    g.fillEllipse(12, 30, 16, 6);
    g.fillStyle(0x665544, 1);
    g.fillRect(12, 26, 8, 5);
    g.fillStyle(0x556666, 1);
    g.fillRect(12, 22, 6, 5);
    g.fillStyle(PAL.npcShirt, 1);
    g.fillRect(6, 10, 12, 13);
    g.fillStyle(PAL.npcSkin, 1);
    g.fillRect(11, 3, 8, 7);
    g.fillStyle(PAL.npcHair, 1);
    g.fillRect(9, 1, 10, 5);
    g.fillRect(16, 1, 3, 8);
    g.fillStyle(0x332222, 1);
    g.fillRect(16, 5, 2, 2);
  });

  // -- Zombie facing down --
  makeTexture(scene, 'zombie-down', PW, PH, (g) => {
    resetSeed(600);
    g.fillStyle(0x000000, 0.1);
    g.fillEllipse(12, 30, 16, 6);
    // Shambling feet
    g.fillStyle(0x444433, 1);
    g.fillRect(3, 26, 7, 5);
    g.fillRect(14, 27, 7, 4);
    // Torn pants
    g.fillStyle(0x555544, 1);
    g.fillRect(5, 21, 6, 6);
    g.fillRect(13, 22, 6, 5);
    // Torso
    g.fillStyle(PAL.zombieClothes, 1);
    g.fillRect(4, 10, 16, 12);
    // Torn sleeve
    g.fillStyle(darken(PAL.zombieClothes, 0.15), 1);
    g.fillRect(2, 12, 4, 6);
    g.fillRect(18, 13, 4, 5);
    // Head
    g.fillStyle(PAL.zombieSkin, 1);
    g.fillRect(6, 2, 12, 9);
    // Blood splatters
    g.fillStyle(PAL.zombieBlood, 0.7);
    g.fillRect(8, 14, 4, 3);
    g.fillRect(14, 6, 3, 2);
    g.fillRect(3, 18, 2, 3);
    // Eyes (hollow)
    g.fillStyle(0x221111, 1);
    g.fillRect(8, 5, 3, 2);
    g.fillRect(13, 5, 3, 2);
    // Mouth
    g.fillStyle(PAL.zombieBlood, 0.6);
    g.fillRect(9, 8, 6, 2);
  });

  // -- Zombie facing up --
  makeTexture(scene, 'zombie-up', PW, PH, (g) => {
    resetSeed(610);
    g.fillStyle(0x000000, 0.1);
    g.fillEllipse(12, 30, 16, 6);
    g.fillStyle(0x444433, 1);
    g.fillRect(3, 26, 7, 5);
    g.fillRect(14, 27, 7, 4);
    g.fillStyle(0x555544, 1);
    g.fillRect(5, 21, 6, 6);
    g.fillRect(13, 22, 6, 5);
    g.fillStyle(PAL.zombieClothes, 1);
    g.fillRect(4, 10, 16, 12);
    g.fillStyle(PAL.zombieSkin, 1);
    g.fillRect(6, 2, 12, 9);
    // Back of head, matted hair
    g.fillStyle(darken(PAL.zombieSkin, 0.2), 1);
    g.fillRect(7, 2, 10, 6);
    g.fillStyle(PAL.zombieBlood, 0.4);
    g.fillRect(10, 4, 4, 3);
  });

  // -- Zombie facing left --
  makeTexture(scene, 'zombie-left', PW, PH, (g) => {
    resetSeed(620);
    g.fillStyle(0x000000, 0.1);
    g.fillEllipse(12, 30, 16, 6);
    g.fillStyle(0x444433, 1);
    g.fillRect(3, 26, 8, 5);
    g.fillStyle(0x555544, 1);
    g.fillRect(5, 21, 7, 6);
    g.fillStyle(PAL.zombieClothes, 1);
    g.fillRect(5, 10, 14, 12);
    // Arms reaching forward
    g.fillStyle(PAL.zombieSkin, 1);
    g.fillRect(1, 13, 5, 4);
    g.fillRect(6, 2, 10, 9);
    g.fillStyle(0x221111, 1);
    g.fillRect(7, 5, 2, 2);
    g.fillStyle(PAL.zombieBlood, 0.5);
    g.fillRect(8, 8, 4, 2);
    g.fillRect(10, 15, 3, 3);
  });

  // -- Zombie facing right --
  makeTexture(scene, 'zombie-right', PW, PH, (g) => {
    resetSeed(630);
    g.fillStyle(0x000000, 0.1);
    g.fillEllipse(12, 30, 16, 6);
    g.fillStyle(0x444433, 1);
    g.fillRect(13, 26, 8, 5);
    g.fillStyle(0x555544, 1);
    g.fillRect(12, 21, 7, 6);
    g.fillStyle(PAL.zombieClothes, 1);
    g.fillRect(5, 10, 14, 12);
    g.fillStyle(PAL.zombieSkin, 1);
    g.fillRect(18, 13, 5, 4);
    g.fillRect(8, 2, 10, 9);
    g.fillStyle(0x221111, 1);
    g.fillRect(15, 5, 2, 2);
    g.fillStyle(PAL.zombieBlood, 0.5);
    g.fillRect(12, 8, 4, 2);
    g.fillRect(11, 15, 3, 3);
  });
}

// ============================================================
// ENVIRONMENT TEXTURES
// ============================================================

function generateEnvironmentTextures(scene: Phaser.Scene): void {
  // -- Ground dirt (32×32) --
  makeTexture(scene, 'ground-dirt', 32, 32, (g) => {
    resetSeed(700);
    g.fillStyle(PAL.groundDirt, 1);
    g.fillRect(0, 0, 32, 32);
    // Variation
    for (let i = 0; i < 6; i++) {
      g.fillStyle(lerpColor(PAL.groundDirt, darken(PAL.groundDirt, 0.15), rng()), 0.6);
      g.fillRect(rngInt(0, 28), rngInt(0, 28), rngInt(3, 8), rngInt(3, 8));
    }
    addNoise(g, 0, 0, 32, 32, 0x000000, 0.06, 0.15);
    // Small pebbles
    for (let i = 0; i < 3; i++) {
      g.fillStyle(PAL.gravel, 0.4);
      g.fillCircle(rngInt(4, 28), rngInt(4, 28), rngRange(1, 2.5));
    }
  });

  // -- Ground grass (32×32) --
  makeTexture(scene, 'ground-grass', 32, 32, (g) => {
    resetSeed(710);
    g.fillStyle(PAL.groundGrass, 1);
    g.fillRect(0, 0, 32, 32);
    for (let i = 0; i < 8; i++) {
      g.fillStyle(lerpColor(PAL.groundGrass, brighten(PAL.groundGrass, 0.2), rng()), 0.5);
      g.fillRect(rngInt(0, 28), rngInt(0, 28), rngInt(2, 6), rngInt(2, 6));
    }
    // Grass blades
    for (let i = 0; i < 6; i++) {
      g.fillStyle(brighten(PAL.groundGrass, 0.3), 0.5);
      const gx = rngInt(2, 28);
      g.fillRect(gx, rngInt(2, 26), 1, rngInt(3, 6));
    }
    addNoise(g, 0, 0, 32, 32, 0x000000, 0.04, 0.1);
  });

  // -- Gravel (32×32, under/beside train tracks) --
  makeTexture(scene, 'ground-gravel', 32, 32, (g) => {
    resetSeed(720);
    g.fillStyle(darken(PAL.gravel, 0.2), 1);
    g.fillRect(0, 0, 32, 32);
    for (let i = 0; i < 20; i++) {
      const c = lerpColor(PAL.gravel, darken(PAL.gravel, 0.3), rng());
      g.fillStyle(c, 0.8);
      const px = rngInt(0, 30);
      const py = rngInt(0, 30);
      g.fillRect(px, py, rngInt(2, 4), rngInt(2, 4));
    }
    addNoise(g, 0, 0, 32, 32, 0x000000, 0.05, 0.12);
  });

  // -- Rail section (32×32) --
  makeTexture(scene, 'train-rail', 32, 32, (g) => {
    resetSeed(730);
    // Gravel base
    g.fillStyle(darken(PAL.gravel, 0.2), 1);
    g.fillRect(0, 0, 32, 32);
    // Ties
    g.fillStyle(PAL.railTie, 1);
    g.fillRect(2, 2, 28, 4);
    g.fillRect(2, 14, 28, 4);
    g.fillRect(2, 26, 28, 4);
    // Rails
    g.fillStyle(PAL.rail, 1);
    g.fillRect(8, 0, 3, 32);
    g.fillRect(21, 0, 3, 32);
    addNoise(g, 0, 0, 32, 32, 0x000000, 0.04, 0.1);
  });

  // -- Dead tree (16×32) --
  makeTexture(scene, 'dead-tree', 16, 32, (g) => {
    resetSeed(740);
    g.fillStyle(0x554433, 1);
    g.fillRect(6, 10, 4, 22);
    // Branches
    sketchLine(g, 8, 12, 2, 4, 0x554433, 0.8, 2, 0.5);
    sketchLine(g, 8, 16, 14, 8, 0x554433, 0.8, 2, 0.5);
    sketchLine(g, 8, 8, 4, 2, 0x443322, 0.6, 1.5, 0.5);
  });

  // -- Rusted car wreck (48×32) --
  makeTexture(scene, 'car-wreck', 48, 32, (g) => {
    resetSeed(750);
    g.fillStyle(0x776655, 1);
    g.fillRect(4, 8, 40, 20);
    g.fillStyle(0x887766, 1);
    g.fillRect(8, 4, 28, 6);
    // Rust
    g.fillStyle(0x995533, 0.4);
    g.fillRect(12, 12, 14, 8);
    // Broken window
    g.fillStyle(0x445566, 0.5);
    g.fillRect(14, 6, 8, 4);
    g.fillRect(28, 6, 6, 4);
    // Wheels
    g.fillStyle(0x333333, 1);
    g.fillCircle(10, 28, 4);
    g.fillCircle(38, 28, 4);
    addNoise(g, 4, 4, 40, 24, 0x000000, 0.06, 0.15);
  });

  // -- Fog overlay (64×64, semi-transparent) --
  makeTexture(scene, 'fog-patch', 64, 64, (g) => {
    resetSeed(760);
    for (let i = 0; i < 12; i++) {
      g.fillStyle(0xaabbcc, rngRange(0.02, 0.06));
      g.fillEllipse(
        32 + rngRange(-20, 20), 32 + rngRange(-20, 20),
        rngRange(20, 50), rngRange(15, 35),
      );
    }
  });
}

// ============================================================
// RESOURCE / PICKUP TEXTURES
// ============================================================

function generateResourceTextures(scene: Phaser.Scene): void {
  // -- Canned food pickup (16×16) --
  makeTexture(scene, 'pickup-food', 16, 16, (g) => {
    resetSeed(800);
    const c = [PAL.canRed, PAL.canGreen, PAL.canBlue][rngInt(0, 2)];
    g.fillStyle(c, 1);
    g.fillRect(4, 3, 8, 11);
    g.fillStyle(brighten(c, 0.3), 1);
    g.fillRect(4, 3, 8, 3);
    // Label
    g.fillStyle(0xffffff, 0.3);
    g.fillRect(5, 7, 6, 4);
  });

  // -- Scrap material pickup (16×16) --
  makeTexture(scene, 'pickup-material', 16, 16, (g) => {
    resetSeed(810);
    // Metal scraps
    g.fillStyle(PAL.scrap, 1);
    g.fillRect(2, 6, 5, 8);
    g.fillRect(8, 4, 6, 4);
    g.fillRect(6, 9, 4, 5);
    g.fillStyle(darken(PAL.scrap, 0.2), 1);
    g.fillRect(3, 8, 3, 2);
    g.fillRect(9, 5, 4, 2);
  });

  // -- Medicine pickup (16×16) --
  makeTexture(scene, 'pickup-medicine', 16, 16, (g) => {
    resetSeed(820);
    g.fillStyle(0xeeeedd, 1);
    g.fillRect(3, 4, 10, 8);
    // Red cross
    g.fillStyle(0xcc2222, 1);
    g.fillRect(6, 5, 4, 6);
    g.fillRect(4, 7, 8, 2);
  });

  // -- Water bottle (16×16) --
  makeTexture(scene, 'pickup-water', 16, 16, (g) => {
    resetSeed(830);
    g.fillStyle(0x88bbee, 0.7);
    g.fillRect(5, 4, 6, 10);
    g.fillStyle(0xaaddff, 0.5);
    g.fillRect(5, 2, 6, 3);
    g.fillStyle(0x4488bb, 0.4);
    g.fillRect(6, 6, 4, 6);
    // Cap
    g.fillStyle(0xffffff, 1);
    g.fillRect(6, 1, 4, 2);
  });
}

// ============================================================
// UI TEXTURES
// ============================================================

function generateUITextures(scene: Phaser.Scene): void {
  // -- Stat bar background (100×10) --
  makeTexture(scene, 'stat-bar-bg', 100, 10, (g) => {
    g.fillStyle(PAL.barBg, 0.8);
    g.fillRect(0, 0, 100, 10);
    g.lineStyle(1, 0x555555, 0.6);
    g.strokeRect(0, 0, 100, 10);
  });

  // -- Stat bar fills (100×10 each) --
  makeTexture(scene, 'bar-hunger', 100, 10, (g) => {
    g.fillStyle(PAL.barHunger, 1);
    g.fillRect(0, 0, 100, 10);
  });
  makeTexture(scene, 'bar-energy', 100, 10, (g) => {
    g.fillStyle(PAL.barEnergy, 1);
    g.fillRect(0, 0, 100, 10);
  });
  makeTexture(scene, 'bar-health', 100, 10, (g) => {
    g.fillStyle(PAL.barHealth, 1);
    g.fillRect(0, 0, 100, 10);
  });

  // -- Interact prompt icon (16×16, "E" key) --
  makeTexture(scene, 'icon-interact', 16, 16, (g) => {
    g.fillStyle(0x222222, 0.8);
    g.fillRoundedRect(1, 1, 14, 14, 2);
    g.fillStyle(0xffffff, 1);
    // "E" shape
    g.fillRect(5, 4, 6, 1);
    g.fillRect(5, 4, 2, 8);
    g.fillRect(5, 7, 5, 1);
    g.fillRect(5, 11, 6, 1);
  });

  // -- Speech bubble (48×24) --
  makeTexture(scene, 'speech-bubble', 48, 24, (g) => {
    g.fillStyle(0xffffff, 0.9);
    g.fillRoundedRect(0, 0, 48, 20, 4);
    // Tail
    g.fillTriangle(10, 20, 18, 20, 14, 24);
    g.lineStyle(1, 0x000000, 0.3);
    g.strokeRoundedRect(0, 0, 48, 20, 4);
  });

  // -- Simple white pixel for tinting --
  makeTexture(scene, 'pixel', 1, 1, (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 1, 1);
  });

  // -- Minimap car outline (20×40) --
  makeTexture(scene, 'minimap-car', 20, 40, (g) => {
    g.lineStyle(1, 0x88aa88, 0.8);
    g.strokeRect(1, 1, 18, 38);
    g.fillStyle(0x334433, 0.4);
    g.fillRect(2, 2, 16, 36);
  });

  // -- Minimap player dot (6×6) --
  makeTexture(scene, 'minimap-player', 6, 6, (g) => {
    g.fillStyle(PAL.playerHoodie, 1);
    g.fillCircle(3, 3, 3);
  });

  // -- Minimap NPC dot (6×6) --
  makeTexture(scene, 'minimap-npc', 6, 6, (g) => {
    g.fillStyle(PAL.npcShirt, 1);
    g.fillCircle(3, 3, 3);
  });
}

// ============================================================
// COMBAT & EXPLORATION TEXTURES
// ============================================================

function generateCombatTextures(scene: Phaser.Scene): void {
  // -- Bullet (4×4) --
  makeTexture(scene, 'bullet', 4, 4, (g) => {
    g.fillStyle(0xffdd44, 1);
    g.fillCircle(2, 2, 2);
    g.fillStyle(0xffffff, 0.5);
    g.fillRect(1, 1, 1, 1);
  });

  // -- Muzzle flash (8×8) --
  makeTexture(scene, 'muzzle-flash', 8, 8, (g) => {
    g.fillStyle(0xffaa22, 0.8);
    g.fillCircle(4, 4, 4);
    g.fillStyle(0xffee88, 0.6);
    g.fillCircle(4, 3, 3);
    g.fillStyle(0xffffff, 0.4);
    g.fillCircle(4, 4, 1);
  });

  // -- Building wall (32×32) --
  makeTexture(scene, 'building-wall', 32, 32, (g) => {
    resetSeed(900);
    g.fillStyle(0x665555, 1);
    g.fillRect(0, 0, 32, 32);
    for (let by = 0; by < 32; by += 8) {
      const offset = (by / 8) % 2 === 0 ? 0 : 8;
      for (let bx = offset; bx < 32; bx += 16) {
        g.fillStyle(lerpColor(0x776655, 0x665544, rng()), 1);
        g.fillRect(bx + 1, by + 1, 14, 6);
      }
    }
    addNoise(g, 0, 0, 32, 32, 0x000000, 0.06, 0.15);
    for (let i = 0; i < 2; i++) {
      sketchLine(g, rngInt(4, 28), rngInt(4, 28), rngInt(4, 28), rngInt(4, 28),
        0x333333, 0.3, 1, 0.5);
    }
  });

  // -- Building floor (32×32) --
  makeTexture(scene, 'building-floor', 32, 32, (g) => {
    resetSeed(910);
    g.fillStyle(0x8a8a7a, 1);
    g.fillRect(0, 0, 32, 32);
    g.fillStyle(darken(0x8a8a7a, 0.1), 1);
    g.fillRect(0, 0, 16, 16);
    g.fillRect(16, 16, 16, 16);
    addNoise(g, 0, 0, 32, 32, 0x000000, 0.05, 0.12);
    g.fillStyle(0x555544, 0.2);
    g.fillRect(rngInt(2, 20), rngInt(2, 20), rngInt(4, 10), rngInt(4, 10));
  });

  // -- Fire particle (8×8) --
  makeTexture(scene, 'fire-particle', 8, 8, (g) => {
    g.fillStyle(0xff4400, 0.8);
    g.fillCircle(4, 4, 4);
    g.fillStyle(0xffaa22, 0.6);
    g.fillCircle(4, 3, 3);
    g.fillStyle(0xffee44, 0.4);
    g.fillCircle(4, 2, 2);
  });

  // -- Weapon rifle icon (24×8) --
  makeTexture(scene, 'weapon-rifle', 24, 8, (g) => {
    g.fillStyle(0x664422, 1);
    g.fillRect(0, 2, 8, 4);
    g.fillStyle(0x555555, 1);
    g.fillRect(6, 1, 14, 5);
    g.fillStyle(0x444444, 1);
    g.fillRect(18, 2, 6, 3);
    g.fillStyle(0x333333, 1);
    g.fillRect(10, 0, 6, 2);
  });

  // -- Weapon melee icon (16×16) --
  makeTexture(scene, 'weapon-melee', 16, 16, (g) => {
    g.fillStyle(0x777777, 1);
    g.fillRect(2, 6, 12, 3);
    g.fillStyle(0x884422, 1);
    g.fillRect(2, 6, 4, 3);
    g.fillStyle(0x666666, 1);
    g.fillRect(12, 4, 3, 7);
  });

  // -- Inventory slot (32×32) --
  makeTexture(scene, 'inv-slot', 32, 32, (g) => {
    g.fillStyle(0x222233, 0.8);
    g.fillRect(0, 0, 32, 32);
    g.lineStyle(1, 0x445566, 0.6);
    g.strokeRect(1, 1, 30, 30);
  });

  // -- Inventory slot selected (32×32) --
  makeTexture(scene, 'inv-slot-selected', 32, 32, (g) => {
    g.fillStyle(0x333355, 0.9);
    g.fillRect(0, 0, 32, 32);
    g.lineStyle(2, 0x88aaff, 0.8);
    g.strokeRect(1, 1, 30, 30);
  });
}

// ============================================================
// MAIN EXPORT
// ============================================================

export function generateAllAssets(scene: Phaser.Scene): void {
  generateTrainTextures(scene);
  generateFurnitureTextures(scene);
  generateCharacterTextures(scene);
  generateEnvironmentTextures(scene);
  generateResourceTextures(scene);
  generateUITextures(scene);
  generateCombatTextures(scene);
}
