import Phaser from 'phaser';
import { CAR_FLOOR_Y, CAR_GAP, CAR_ROOF_WALK_Y } from '../data/BalanceConstants';

/**
 * TrainConnector – the narrow walkable gap between two adjacent cars.
 *
 * Visually rendered as a metal coupling platform with chains on either side
 * and occasional sparks flying underneath. The player can cross the
 * connector but is exposed to side-attacks while doing so.
 */
export class TrainConnector {
  /** Left edge of the connector in world x. */
  public readonly worldX: number;
  /** Width of the connector (same as CAR_GAP). */
  public readonly width: number;

  public container!: Phaser.GameObjects.Container;

  /** Physics collision rectangles exposed for the game scene. */
  public floorBody!: Phaser.GameObjects.Rectangle;
  public roofBridge!: Phaser.GameObjects.Rectangle;

  // Spark emitter for the underside
  private sparkTimer: number = 0;
  private sparks: Phaser.GameObjects.Arc[] = [];
  private scene!: Phaser.Scene;

  constructor(worldX: number, width: number = CAR_GAP) {
    this.worldX = worldX;
    this.width = width;
  }

  // ------------------------------------------------------------------
  // Factory
  // ------------------------------------------------------------------

  public create(scene: Phaser.Scene): void {
    this.scene = scene;
    this.container = scene.add.container(this.worldX, 0);

    this.buildPlatform(scene);
    this.buildChains(scene);
    this.buildCoupling(scene);
    this.buildRoofBridge(scene);
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private buildPlatform(scene: Phaser.Scene): void {
    const cx = this.width * 0.5;
    const platformWidth = this.width - 8;
    const platformThickness = 6;

    // Metal grate platform at floor level
    const plate = scene.add.rectangle(
      cx,
      CAR_FLOOR_Y,
      platformWidth,
      platformThickness,
      0x555048,
      0.9,
    );
    plate.setStrokeStyle(1, 0x3a3530, 1);
    this.container.add(plate);

    // Cross-hatch grate lines
    for (let i = -2; i <= 2; i++) {
      const line = scene.add.rectangle(
        cx + i * 5,
        CAR_FLOOR_Y,
        1,
        platformThickness - 2,
        0x3a3530,
        0.6,
      );
      this.container.add(line);
    }

    // Invisible collision rect
    this.floorBody = scene.add.rectangle(
      cx,
      CAR_FLOOR_Y,
      platformWidth,
      platformThickness,
      0x000000,
      0,
    );
    this.container.add(this.floorBody);
  }

  private buildChains(scene: Phaser.Scene): void {
    const chainY = CAR_FLOOR_Y - 20;
    const linkSize = 4;
    const linkGap = 6;
    const linksPerChain = Math.floor(this.width / linkGap);

    for (let side = 0; side < 2; side++) {
      const yOff = side === 0 ? chainY : chainY + 10;
      for (let i = 0; i < linksPerChain; i++) {
        const lx = 4 + i * linkGap;
        const sag = Math.sin((i / (linksPerChain - 1)) * Math.PI) * 4;
        const link = scene.add.rectangle(
          lx,
          yOff + sag,
          linkSize,
          linkSize * 0.6,
          0x888070,
          0.8,
        );
        link.setStrokeStyle(1, 0x666058, 0.6);
        link.setAngle(i % 2 === 0 ? 15 : -15);
        this.container.add(link);
      }
    }
  }

  private buildCoupling(scene: Phaser.Scene): void {
    const cx = this.width * 0.5;
    // Central coupling block
    const block = scene.add.rectangle(cx, CAR_FLOOR_Y + 10, 14, 10, 0x444038, 1);
    block.setStrokeStyle(1, 0x666058, 0.8);
    this.container.add(block);

    // Coupling pin
    const pin = scene.add.circle(cx, CAR_FLOOR_Y + 10, 3, 0x888070, 1);
    this.container.add(pin);
  }

  private buildRoofBridge(scene: Phaser.Scene): void {
    const cx = this.width * 0.5;
    // Narrow metal plank bridging the rooftop gap
    const plank = scene.add.rectangle(cx, CAR_ROOF_WALK_Y, this.width - 12, 5, 0x4a4440, 0.85);
    plank.setStrokeStyle(1, 0x3a3530, 0.7);
    this.container.add(plank);

    this.roofBridge = scene.add.rectangle(
      cx,
      CAR_ROOF_WALK_Y,
      this.width - 12,
      5,
      0x000000,
      0,
    );
    this.container.add(this.roofBridge);
  }

  // ------------------------------------------------------------------
  // Runtime
  // ------------------------------------------------------------------

  public update(time: number, delta: number): void {
    // Occasional sparks underneath the connector
    this.sparkTimer -= delta;
    if (this.sparkTimer <= 0) {
      this.sparkTimer = Phaser.Math.Between(800, 3000);
      this.emitSpark();
    }

    // Update existing sparks
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.y += 1.5;
      s.setAlpha(s.alpha - 0.04);
      if (s.alpha <= 0) {
        s.destroy();
        this.sparks.splice(i, 1);
      }
    }
  }

  private emitSpark(): void {
    const sx = Phaser.Math.Between(6, this.width - 6);
    const sy = CAR_FLOOR_Y + 8;
    const spark = this.scene.add.circle(sx, sy, Phaser.Math.Between(1, 2), 0xffcc44, 0.9);
    this.container.add(spark);
    this.sparks.push(spark);
  }

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------

  public destroy(): void {
    for (const s of this.sparks) s.destroy();
    this.sparks.length = 0;
    this.container.destroy(true);
  }
}
