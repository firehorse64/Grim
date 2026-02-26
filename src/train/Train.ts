import Phaser from 'phaser';
import {
  NUM_TRAIN_CARS,
  CAR_WIDTH,
  CAR_GAP,
  CAR_FLOOR_Y,
  CAR_ROOF_Y,
  CAR_INTERIOR_HEIGHT,
  TRAIN_SCROLL_SPEED,
} from '../data/BalanceConstants';
import { TrainCar } from './TrainCar';
import { TrainConnector } from './TrainConnector';

// Layout constants for locomotive / caboose (visual-only)
const LOCO_WIDTH = 200;
const CABOOSE_WIDTH = 140;
const WHEEL_RADIUS = 14;
const WHEEL_SPACING = 60;
/** Vertical thickness of the rail strips. */
const TRACK_RAIL_THICKNESS = 4;

/**
 * Train – the master manager that owns every TrainCar, TrainConnector,
 * the locomotive, caboose, wheels and the track strip underneath.
 *
 * Call `create(scene)` once, then `update(time, delta)` every frame.
 */
export class Train {
  // Public collections
  public cars: TrainCar[] = [];
  public connectors: TrainConnector[] = [];

  // Top-level container that holds everything
  public container!: Phaser.GameObjects.Container;

  // Sub-containers
  private locomotiveContainer!: Phaser.GameObjects.Container;
  private cabooseContainer!: Phaser.GameObjects.Container;
  private wheelContainer!: Phaser.GameObjects.Container;
  private trackContainer!: Phaser.GameObjects.Container;

  // Wheel sprites for spin animation
  private wheels: Phaser.GameObjects.Arc[] = [];
  private wheelSpokes: Phaser.GameObjects.Rectangle[] = [];
  private wheelRotation: number = 0;

  /** World-x where the first car begins (after locomotive). */
  private carsStartX: number = 0;

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /** Total world-width from locomotive front to caboose rear. */
  public getTotalWidth(): number {
    return (
      LOCO_WIDTH +
      CAR_GAP +
      NUM_TRAIN_CARS * CAR_WIDTH +
      (NUM_TRAIN_CARS - 1) * CAR_GAP +
      CAR_GAP +
      CABOOSE_WIDTH
    );
  }

  /** Return the TrainCar whose horizontal span contains world-x, or null. */
  public getCarAtX(x: number): TrainCar | null {
    for (const car of this.cars) {
      if (car.containsX(x)) return car;
    }
    return null;
  }

  /** Return a car by its 0-based index. */
  public getCarByIndex(i: number): TrainCar | undefined {
    return this.cars[i];
  }

  /** World-x of the leftmost enterable position (first car left edge). */
  public getFirstCarX(): number {
    return this.carsStartX;
  }

  /** World-x of the rightmost enterable position (last car right edge). */
  public getLastCarRightX(): number {
    const last = this.cars[this.cars.length - 1];
    return last.worldX + last.width;
  }

  // ------------------------------------------------------------------
  // Factory
  // ------------------------------------------------------------------

  public create(scene: Phaser.Scene): void {
    this.container = scene.add.container(0, 0);

    // 1. Track (rendered behind everything)
    this.buildTrack(scene);

    // 2. Locomotive (visual only)
    this.buildLocomotive(scene);

    // 3. Cars + connectors
    this.carsStartX = LOCO_WIDTH + CAR_GAP;
    let cursorX = this.carsStartX;

    for (let i = 0; i < NUM_TRAIN_CARS; i++) {
      const car = new TrainCar(i, cursorX);
      car.create(scene);
      this.cars.push(car);
      this.container.add(car.container);
      cursorX += CAR_WIDTH;

      // Connector between this car and the next (not after the last)
      if (i < NUM_TRAIN_CARS - 1) {
        const conn = new TrainConnector(cursorX, CAR_GAP);
        conn.create(scene);
        this.connectors.push(conn);
        this.container.add(conn.container);
        cursorX += CAR_GAP;
      }
    }

    // 4. Caboose (visual only)
    this.buildCaboose(scene, cursorX + CAR_GAP);

    // 5. Wheels along the entire train length
    this.buildWheels(scene);
  }

  // ------------------------------------------------------------------
  // Per-frame update
  // ------------------------------------------------------------------

  public update(time: number, delta: number): void {
    // Cars
    for (const car of this.cars) {
      car.update(time, delta);
    }

    // Connectors
    for (const conn of this.connectors) {
      conn.update(time, delta);
    }

    // Spin wheels
    const deltaSeconds = delta / 1000;
    this.wheelRotation += (TRAIN_SCROLL_SPEED / WHEEL_RADIUS) * deltaSeconds;

    for (let i = 0; i < this.wheelSpokes.length; i++) {
      const spoke = this.wheelSpokes[i];
      const angleDeg = Phaser.Math.RadToDeg(this.wheelRotation) + (i % 3) * 60;
      spoke.setAngle(angleDeg);
    }
  }

  // ------------------------------------------------------------------
  // Build helpers
  // ------------------------------------------------------------------

  private buildTrack(scene: Phaser.Scene): void {
    this.trackContainer = scene.add.container(0, 0);

    const totalWidth = this.getTotalWidth();

    // Two rails
    const railY = CAR_FLOOR_Y + 28;
    const railGap = 40;
    for (let side = -1; side <= 1; side += 2) {
      const rail = scene.add.rectangle(
        totalWidth * 0.5,
        railY + side * railGap * 0.5,
        totalWidth + 100,
        TRACK_RAIL_THICKNESS,
        0x666058,
        0.8,
      );
      this.trackContainer.add(rail);
    }

    // Sleepers / ties
    const sleeperSpacing = 40;
    const sleeperCount = Math.ceil(totalWidth / sleeperSpacing) + 3;
    for (let i = 0; i < sleeperCount; i++) {
      const sx = i * sleeperSpacing;
      const sleeper = scene.add.rectangle(sx, railY, 8, railGap + 16, 0x4a3d2e, 0.7);
      this.trackContainer.add(sleeper);
    }

    // Gravel bed
    const gravel = scene.add.rectangle(
      totalWidth * 0.5,
      railY + 6,
      totalWidth + 100,
      18,
      0x3a342a,
      0.5,
    );
    this.trackContainer.add(gravel);

    // Sort: gravel behind rails behind sleepers
    this.trackContainer.sendToBack(gravel);

    this.container.add(this.trackContainer);
    this.container.sendToBack(this.trackContainer);
  }

  private buildLocomotive(scene: Phaser.Scene): void {
    this.locomotiveContainer = scene.add.container(0, 0);

    const cx = LOCO_WIDTH * 0.5;
    const bodyTop = CAR_ROOF_Y - 30;
    const bodyHeight = CAR_FLOOR_Y - bodyTop;

    // Main body
    const body = scene.add.rectangle(cx, bodyTop + bodyHeight * 0.5, LOCO_WIDTH, bodyHeight, 0x2a2622, 1);
    body.setStrokeStyle(2, 0x444038, 1);
    this.locomotiveContainer.add(body);

    // Boiler / front section
    const boilerWidth = LOCO_WIDTH * 0.4;
    const boiler = scene.add.rectangle(
      boilerWidth * 0.5,
      bodyTop + bodyHeight * 0.4,
      boilerWidth,
      bodyHeight * 0.6,
      0x333028,
      1,
    );
    boiler.setStrokeStyle(1, 0x555048, 0.8);
    this.locomotiveContainer.add(boiler);

    // Smokestack
    const stackWidth = 18;
    const stackHeight = 36;
    const stack = scene.add.rectangle(
      boilerWidth * 0.4,
      bodyTop - stackHeight * 0.5 + 4,
      stackWidth,
      stackHeight,
      0x3a3530,
      1,
    );
    stack.setStrokeStyle(1, 0x555048, 0.7);
    this.locomotiveContainer.add(stack);

    // Stack cap
    const cap = scene.add.rectangle(
      boilerWidth * 0.4,
      bodyTop - stackHeight + 6,
      stackWidth + 8,
      5,
      0x444038,
      1,
    );
    this.locomotiveContainer.add(cap);

    // Cabin windows
    const winX = LOCO_WIDTH - 36;
    const winY = bodyTop + 20;
    for (let i = 0; i < 2; i++) {
      const w = scene.add.rectangle(winX, winY + i * 30, 20, 18, 0x1a1820, 0.9);
      w.setStrokeStyle(1, 0x555048, 0.6);
      this.locomotiveContainer.add(w);
      // Warm glow
      const g = scene.add.rectangle(winX, winY + i * 30, 16, 14, 0xffaa44, 0.06);
      this.locomotiveContainer.add(g);
    }

    // Cow catcher at front (angled bars)
    for (let i = 0; i < 3; i++) {
      const bar = scene.add.rectangle(
        -10 + i * 12,
        CAR_FLOOR_Y + 8,
        4,
        18,
        0x555048,
        0.8,
      );
      bar.setAngle(i === 0 ? -15 : i === 2 ? 15 : 0);
      this.locomotiveContainer.add(bar);
    }
    // Base bar
    const catcherBase = scene.add.rectangle(0, CAR_FLOOR_Y + 16, 56, 4, 0x555048, 0.9);
    this.locomotiveContainer.add(catcherBase);

    // Headlight
    const headlight = scene.add.circle(10, bodyTop + bodyHeight * 0.3, 8, 0xffe888, 0.3);
    this.locomotiveContainer.add(headlight);
    const headlightCore = scene.add.circle(10, bodyTop + bodyHeight * 0.3, 4, 0xffdd66, 0.6);
    this.locomotiveContainer.add(headlightCore);

    this.container.add(this.locomotiveContainer);
  }

  private buildCaboose(scene: Phaser.Scene, startX: number): void {
    this.cabooseContainer = scene.add.container(startX, 0);

    const cx = CABOOSE_WIDTH * 0.5;
    const bodyHeight = CAR_INTERIOR_HEIGHT + 10;

    // Main body
    const body = scene.add.rectangle(
      cx,
      CAR_ROOF_Y + bodyHeight * 0.5 - 5,
      CABOOSE_WIDTH,
      bodyHeight,
      0x3a2222,
      1,
    );
    body.setStrokeStyle(2, 0x552828, 0.9);
    this.cabooseContainer.add(body);

    // Cupola (raised lookout on top)
    const cupolaW = 50;
    const cupolaH = 24;
    const cupola = scene.add.rectangle(
      cx,
      CAR_ROOF_Y - cupolaH * 0.5 - 5,
      cupolaW,
      cupolaH,
      0x442222,
      1,
    );
    cupola.setStrokeStyle(1, 0x552828, 0.8);
    this.cabooseContainer.add(cupola);

    // Cupola windows
    for (let i = -1; i <= 1; i += 2) {
      const cw = scene.add.rectangle(
        cx + i * 14,
        CAR_ROOF_Y - cupolaH * 0.5 - 5,
        10,
        10,
        0x1a1820,
        0.8,
      );
      this.cabooseContainer.add(cw);
    }

    // Rear platform / railing
    const railX = CABOOSE_WIDTH - 4;
    const railTop = CAR_ROOF_Y + 20;
    const railBot = CAR_FLOOR_Y - 4;
    const post = scene.add.rectangle(railX + 8, (railTop + railBot) * 0.5, 3, railBot - railTop, 0x555048, 0.8);
    this.cabooseContainer.add(post);
    const topRail = scene.add.rectangle(railX + 8, railTop, 20, 3, 0x555048, 0.8);
    this.cabooseContainer.add(topRail);

    // Rear lantern
    const lantern = scene.add.circle(CABOOSE_WIDTH + 6, CAR_ROOF_Y + 30, 5, 0xff4422, 0.4);
    this.cabooseContainer.add(lantern);
    const lanternCore = scene.add.circle(CABOOSE_WIDTH + 6, CAR_ROOF_Y + 30, 2, 0xff6644, 0.8);
    this.cabooseContainer.add(lanternCore);

    this.container.add(this.cabooseContainer);
  }

  private buildWheels(scene: Phaser.Scene): void {
    this.wheelContainer = scene.add.container(0, 0);
    const wheelY = CAR_FLOOR_Y + 20;
    const totalWidth = this.getTotalWidth();

    // Place wheel trucks every WHEEL_SPACING along the train
    const wheelCount = Math.ceil(totalWidth / WHEEL_SPACING);

    for (let i = 0; i < wheelCount; i++) {
      const wx = 30 + i * WHEEL_SPACING;

      // Wheel rim
      const rim = scene.add.circle(wx, wheelY, WHEEL_RADIUS, 0x333028, 1);
      rim.setStrokeStyle(2, 0x555048, 0.9);
      this.wheelContainer.add(rim);
      this.wheels.push(rim);

      // Hub
      const hub = scene.add.circle(wx, wheelY, 4, 0x666058, 1);
      this.wheelContainer.add(hub);

      // Spokes (3 per wheel)
      for (let s = 0; s < 3; s++) {
        const spoke = scene.add.rectangle(
          wx,
          wheelY,
          WHEEL_RADIUS * 1.6,
          2,
          0x555048,
          0.7,
        );
        spoke.setAngle(s * 60);
        this.wheelContainer.add(spoke);
        this.wheelSpokes.push(spoke);
      }
    }

    this.container.add(this.wheelContainer);
  }

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------

  public destroy(): void {
    for (const car of this.cars) car.destroy();
    for (const conn of this.connectors) conn.destroy();
    this.container.destroy(true);
  }
}
