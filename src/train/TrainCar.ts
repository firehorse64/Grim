import Phaser from 'phaser';
import {
  CAR_WIDTH,
  CAR_FLOOR_Y,
  CAR_ROOF_Y,
  CAR_ROOF_WALK_Y,
  CAR_INTERIOR_HEIGHT,
  LADDER_WIDTH,
  BARRICADE_SLOTS_PER_CAR,
  GAME_HEIGHT,
} from '../data/BalanceConstants';

// ---------------------------------------------------------------
// BarricadeSlot – a position where the player may place a barricade
// ---------------------------------------------------------------
export interface BarricadeSlot {
  /** Index within this car (0-based). */
  index: number;
  /** World-x centre of the slot. */
  worldX: number;
  /** World-y (sits on the floor). */
  worldY: number;
  /** Whether a barricade is currently placed here. */
  occupied: boolean;
  /** Visual indicator sprite (the "slot" marker). */
  marker: Phaser.GameObjects.Rectangle;
}

// ---------------------------------------------------------------
// TrainCar – one self-contained carriage
// ---------------------------------------------------------------
export class TrainCar {
  public readonly carIndex: number;
  /** Left edge x-position in world coords. */
  public worldX: number;
  public readonly width: number = CAR_WIDTH;
  public barricadeSlots: BarricadeSlot[] = [];
  public isAccessible: boolean = true;

  // Visual containers
  public container!: Phaser.GameObjects.Container;
  private interiorContainer!: Phaser.GameObjects.Container;
  private rooftopContainer!: Phaser.GameObjects.Container;

  // Individual visual pieces we keep references to for tint / animation
  private windows: Phaser.GameObjects.Image[] = [];
  private windowGlows: Phaser.GameObjects.Rectangle[] = [];
  private ladderLeft!: Phaser.GameObjects.Image;
  private ladderRight!: Phaser.GameObjects.Image;

  // Collision bodies exposed for the physics layer
  public floorBody!: Phaser.GameObjects.Rectangle;
  public roofBody!: Phaser.GameObjects.Rectangle;
  public leftWall!: Phaser.GameObjects.Rectangle;
  public rightWall!: Phaser.GameObjects.Rectangle;

  constructor(carIndex: number, worldX: number) {
    this.carIndex = carIndex;
    this.worldX = worldX;
  }

  // ------------------------------------------------------------------
  // Factory
  // ------------------------------------------------------------------

  public create(scene: Phaser.Scene): void {
    this.container = scene.add.container(this.worldX, 0);
    this.interiorContainer = scene.add.container(0, 0);
    this.rooftopContainer = scene.add.container(0, 0);

    this.buildExteriorShell(scene);
    this.buildInterior(scene);
    this.buildRooftop(scene);
    this.buildLadders(scene);
    this.buildBarricadeSlots(scene);
    this.buildZombieEntryMarkers(scene);

    this.container.add(this.interiorContainer);
    this.container.add(this.rooftopContainer);
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  /** Y of the interior floor in world space. */
  public getFloorY(): number {
    return CAR_FLOOR_Y;
  }

  /** Y of the rooftop walking surface in world space. */
  public getRoofY(): number {
    return CAR_ROOF_WALK_Y;
  }

  /** Whether world-x coordinate falls within this car's horizontal bounds. */
  public containsX(x: number): boolean {
    return x >= this.worldX && x <= this.worldX + this.width;
  }

  /** Centre of this car in world x. */
  public getCenterX(): number {
    return this.worldX + this.width * 0.5;
  }

  // ------------------------------------------------------------------
  // Build methods (private)
  // ------------------------------------------------------------------

  private buildExteriorShell(scene: Phaser.Scene): void {
    const wallThickness = 8;
    const carRight = this.width;

    // --- Floor ---
    const floor = scene.add.image(this.width * 0.5, CAR_FLOOR_Y, 'train-floor');
    floor.setDisplaySize(this.width, 12);
    floor.setTint(0x3a3530);
    this.container.add(floor);

    // Physics-friendly floor rectangle (invisible, used for collisions)
    this.floorBody = scene.add.rectangle(
      this.width * 0.5,
      CAR_FLOOR_Y,
      this.width,
      12,
      0x000000,
      0,
    );
    this.container.add(this.floorBody);

    // --- Ceiling ---
    const ceiling = scene.add.image(this.width * 0.5, CAR_ROOF_Y, 'train-roof');
    ceiling.setDisplaySize(this.width, 10);
    ceiling.setTint(0x2e2a26);
    this.container.add(ceiling);

    // --- Walls ---
    // Left wall
    const leftWall = scene.add.image(
      wallThickness * 0.5,
      CAR_ROOF_Y + CAR_INTERIOR_HEIGHT * 0.5,
      'train-wall',
    );
    leftWall.setDisplaySize(wallThickness, CAR_INTERIOR_HEIGHT);
    leftWall.setTint(0x4a4440);
    this.container.add(leftWall);

    this.leftWall = scene.add.rectangle(
      wallThickness * 0.5,
      CAR_ROOF_Y + CAR_INTERIOR_HEIGHT * 0.5,
      wallThickness,
      CAR_INTERIOR_HEIGHT,
      0x000000,
      0,
    );
    this.container.add(this.leftWall);

    // Right wall
    const rightWall = scene.add.image(
      carRight - wallThickness * 0.5,
      CAR_ROOF_Y + CAR_INTERIOR_HEIGHT * 0.5,
      'train-wall',
    );
    rightWall.setDisplaySize(wallThickness, CAR_INTERIOR_HEIGHT);
    rightWall.setTint(0x4a4440);
    this.container.add(rightWall);

    this.rightWall = scene.add.rectangle(
      carRight - wallThickness * 0.5,
      CAR_ROOF_Y + CAR_INTERIOR_HEIGHT * 0.5,
      wallThickness,
      CAR_INTERIOR_HEIGHT,
      0x000000,
      0,
    );
    this.container.add(this.rightWall);

    // Roof surface (walkable exterior)
    const roofSurface = scene.add.image(this.width * 0.5, CAR_ROOF_WALK_Y, 'train-roof');
    roofSurface.setDisplaySize(this.width, 8);
    roofSurface.setTint(0x555048);
    this.rooftopContainer.add(roofSurface);

    this.roofBody = scene.add.rectangle(
      this.width * 0.5,
      CAR_ROOF_WALK_Y,
      this.width,
      8,
      0x000000,
      0,
    );
    this.rooftopContainer.add(this.roofBody);
  }

  private buildInterior(scene: Phaser.Scene): void {
    const windowCount = 4;
    const windowWidth = 36;
    const windowHeight = 28;
    const wallThickness = 8;
    const usable = this.width - wallThickness * 2;
    const spacing = usable / (windowCount + 1);

    for (let i = 0; i < windowCount; i++) {
      const wx = wallThickness + spacing * (i + 1);
      const wy = CAR_ROOF_Y + CAR_INTERIOR_HEIGHT * 0.35;

      // Window frame
      const win = scene.add.image(wx, wy, 'train-window');
      win.setDisplaySize(windowWidth, windowHeight);
      win.setTint(0x1a1820);
      this.windows.push(win);
      this.interiorContainer.add(win);

      // Dim amber glow behind window
      const glow = scene.add.rectangle(wx, wy, windowWidth - 4, windowHeight - 4, 0xffaa44, 0.08);
      this.windowGlows.push(glow);
      this.interiorContainer.add(glow);
    }

    // Interior details: floor grime strips
    for (let i = 0; i < 3; i++) {
      const gx = Phaser.Math.Between(40, this.width - 40);
      const grime = scene.add.rectangle(
        gx,
        CAR_FLOOR_Y - 2,
        Phaser.Math.Between(30, 80),
        3,
        0x22201c,
        0.6,
      );
      this.interiorContainer.add(grime);
    }

    // Overhead pipe / bar running along ceiling
    const pipe = scene.add.rectangle(
      this.width * 0.5,
      CAR_ROOF_Y + 14,
      this.width - 60,
      3,
      0x666058,
      0.7,
    );
    this.interiorContainer.add(pipe);
  }

  private buildRooftop(scene: Phaser.Scene): void {
    // Rivets along the roof edges
    const rivetSpacing = 40;
    const rivetCount = Math.floor(this.width / rivetSpacing);
    for (let i = 0; i < rivetCount; i++) {
      const rx = rivetSpacing * 0.5 + i * rivetSpacing;
      const rivet = scene.add.circle(rx, CAR_ROOF_WALK_Y - 2, 2, 0x888078, 0.5);
      this.rooftopContainer.add(rivet);
    }

    // Vent / exhaust box in the middle of the roof
    const vent = scene.add.rectangle(
      this.width * 0.5,
      CAR_ROOF_WALK_Y - 12,
      28,
      10,
      0x555048,
      0.9,
    );
    this.rooftopContainer.add(vent);
    const ventSlats = scene.add.rectangle(
      this.width * 0.5,
      CAR_ROOF_WALK_Y - 12,
      24,
      2,
      0x333028,
      0.8,
    );
    this.rooftopContainer.add(ventSlats);
  }

  private buildLadders(scene: Phaser.Scene): void {
    const ladderHeight = CAR_INTERIOR_HEIGHT + 20;
    const ladderCenterY = CAR_ROOF_Y + CAR_INTERIOR_HEIGHT * 0.5 - 10;

    // Left ladder
    this.ladderLeft = scene.add.image(LADDER_WIDTH * 0.5 + 4, ladderCenterY, 'train-ladder');
    this.ladderLeft.setDisplaySize(LADDER_WIDTH, ladderHeight);
    this.ladderLeft.setTint(0x887860);
    this.container.add(this.ladderLeft);

    // Ladder rungs (left)
    const rungCount = 5;
    for (let i = 0; i < rungCount; i++) {
      const ry = CAR_ROOF_Y + 10 + (ladderHeight - 20) * (i / (rungCount - 1));
      const rung = scene.add.rectangle(
        LADDER_WIDTH * 0.5 + 4,
        ry,
        LADDER_WIDTH - 4,
        3,
        0x998870,
        0.9,
      );
      this.container.add(rung);
    }

    // Right ladder
    this.ladderRight = scene.add.image(
      this.width - LADDER_WIDTH * 0.5 - 4,
      ladderCenterY,
      'train-ladder',
    );
    this.ladderRight.setDisplaySize(LADDER_WIDTH, ladderHeight);
    this.ladderRight.setTint(0x887860);
    this.container.add(this.ladderRight);

    // Ladder rungs (right)
    for (let i = 0; i < rungCount; i++) {
      const ry = CAR_ROOF_Y + 10 + (ladderHeight - 20) * (i / (rungCount - 1));
      const rung = scene.add.rectangle(
        this.width - LADDER_WIDTH * 0.5 - 4,
        ry,
        LADDER_WIDTH - 4,
        3,
        0x998870,
        0.9,
      );
      this.container.add(rung);
    }
  }

  private buildBarricadeSlots(scene: Phaser.Scene): void {
    const wallThickness = 8;
    const usable = this.width - wallThickness * 2;
    const spacing = usable / (BARRICADE_SLOTS_PER_CAR + 1);

    for (let i = 0; i < BARRICADE_SLOTS_PER_CAR; i++) {
      const sx = wallThickness + spacing * (i + 1);
      const sy = CAR_FLOOR_Y - 6;

      // Small dashed marker on the floor
      const marker = scene.add.rectangle(sx, sy, 20, 4, 0x556644, 0.4);
      marker.setStrokeStyle(1, 0x88aa66, 0.5);
      this.interiorContainer.add(marker);

      this.barricadeSlots.push({
        index: i,
        worldX: this.worldX + sx,
        worldY: sy,
        occupied: false,
        marker,
      });
    }
  }

  private buildZombieEntryMarkers(_scene: Phaser.Scene): void {
    // Zombie entry points are logical, not visual. They are referenced by
    // the wave spawner:
    //   left edge  = this.worldX
    //   right edge = this.worldX + this.width
    //   rooftop    = { x: this.getCenterX(), y: this.getRoofY() }
    // No visible marker needed – just documenting the contract.
  }

  // ------------------------------------------------------------------
  // Runtime
  // ------------------------------------------------------------------

  /**
   * Per-frame tick – animates ambient window glow flicker.
   */
  public update(time: number, _delta: number): void {
    // Subtle amber glow pulse
    const pulse = 0.06 + 0.03 * Math.sin(time * 0.002 + this.carIndex * 1.2);
    for (const glow of this.windowGlows) {
      glow.setAlpha(pulse);
    }
  }

  /**
   * Tear-down helper.
   */
  public destroy(): void {
    this.container.destroy(true);
  }
}
