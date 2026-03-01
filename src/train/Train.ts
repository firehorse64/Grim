import Phaser from 'phaser';
import {
  NUM_TRAIN_CARS,
  CAR_PIXEL_WIDTH,
  CAR_PIXEL_HEIGHT,
  CAR_GAP,
  TILE_SIZE,
  TRAIN_SCROLL_SPEED,
  GAME_WIDTH,
  FUEL_MAX,
  FUEL_CONSUMPTION_PER_SEC,
  TRAIN_SPEED_MIN,
  TRAIN_SPEED_MAX,
  TRAIN_SPEED_DEFAULT,
  TRAIN_SPEED_STEP,
} from '../data/BalanceConstants';
import { TrainCar } from './TrainCar';
import { CarPurpose } from '../types/TrainTypes';
import { EventBus } from '../utils/EventBus';

/**
 * Train – manages all TrainCars stacked vertically.
 * Car 0 is at the top (engine, direction of travel).
 * Cars below extend downward.
 * Tracks fuel, speed, and headlights.
 */
export class Train {
  public cars: TrainCar[] = [];
  public isMoving: boolean = true;
  public speed: number = TRAIN_SPEED_DEFAULT;
  public fuel: number = FUEL_MAX;

  // Lights
  public headlightsOn: boolean = true;
  public interiorLightsOn: boolean = true;

  private trainX: number = 0;
  private trainY: number = 0;

  public getTotalHeight(): number {
    return NUM_TRAIN_CARS * CAR_PIXEL_HEIGHT + (NUM_TRAIN_CARS - 1) * CAR_GAP;
  }

  public create(scene: Phaser.Scene): void {
    this.trainX = Math.floor((GAME_WIDTH - CAR_PIXEL_WIDTH) / 2);
    this.trainY = 50;

    const carPurposes: CarPurpose[] = [
      CarPurpose.ENGINE,
      CarPurpose.LIVING,
      CarPurpose.STORAGE,
    ];

    for (let i = 0; i < NUM_TRAIN_CARS; i++) {
      const purpose = carPurposes[i] || CarPurpose.STORAGE;
      const car = new TrainCar(i, purpose);

      const cx = this.trainX;
      const cy = this.trainY + i * (CAR_PIXEL_HEIGHT + CAR_GAP);

      car.create(scene, cx, cy);
      this.cars.push(car);

      // Connector corridor between cars
      if (i < NUM_TRAIN_CARS - 1) {
        const connY = cy + CAR_PIXEL_HEIGHT;
        const connX = cx + Math.floor(CAR_PIXEL_WIDTH / 2) - TILE_SIZE / 2;
        for (let ty = 0; ty < CAR_GAP; ty += TILE_SIZE) {
          const img = scene.add.image(
            connX + TILE_SIZE / 2,
            connY + ty + TILE_SIZE / 2,
            'train-connector',
          );
          img.setDisplaySize(TILE_SIZE * 2, TILE_SIZE);
          img.setDepth(1);
        }
      }
    }
  }

  /** Update fuel consumption. Returns true if still has fuel. */
  public updateFuel(delta: number): boolean {
    if (!this.isMoving) return true;
    const dt = delta / 1000;
    // Fuel consumption scales with speed
    const speedFactor = this.speed / TRAIN_SPEED_DEFAULT;
    this.fuel = Math.max(0, this.fuel - FUEL_CONSUMPTION_PER_SEC * speedFactor * dt);
    if (this.fuel <= 0) {
      this.stop();
      EventBus.emit('train:out-of-fuel');
      return false;
    }
    return true;
  }

  /** Add fuel from scrap metal. */
  public addFuel(amount: number): void {
    this.fuel = Math.min(FUEL_MAX, this.fuel + amount);
  }

  /** Increase speed by one step. */
  public speedUp(): void {
    this.speed = Math.min(TRAIN_SPEED_MAX, this.speed + TRAIN_SPEED_STEP);
  }

  /** Decrease speed by one step. */
  public speedDown(): void {
    this.speed = Math.max(TRAIN_SPEED_MIN, this.speed - TRAIN_SPEED_STEP);
  }

  public getAllWallBodies(): Phaser.Physics.Arcade.StaticGroup[] {
    return this.cars
      .map(c => c.wallBodies)
      .filter((b): b is Phaser.Physics.Arcade.StaticGroup => b !== null);
  }

  public getAllFurnitureBodies(): Phaser.Physics.Arcade.StaticGroup[] {
    return this.cars
      .map(c => c.furnitureBodies)
      .filter((b): b is Phaser.Physics.Arcade.StaticGroup => b !== null);
  }

  public getCarAtPoint(wx: number, wy: number): TrainCar | null {
    for (const car of this.cars) {
      if (car.containsPoint(wx, wy)) return car;
    }
    return null;
  }

  public getCar(i: number): TrainCar | undefined {
    return this.cars[i];
  }

  public getPlayerSpawnPoint(): { x: number; y: number } {
    const livingCar = this.cars.find(c => c.purpose === CarPurpose.LIVING) || this.cars[1] || this.cars[0];
    const bounds = livingCar.getInteriorBounds();
    return {
      x: bounds.x + bounds.w / 2,
      y: bounds.y + bounds.h / 2,
    };
  }

  public getNPCSpawnPoint(): { x: number; y: number } {
    const livingCar = this.cars.find(c => c.purpose === CarPurpose.LIVING) || this.cars[1] || this.cars[0];
    const bounds = livingCar.getInteriorBounds();
    return {
      x: bounds.x + bounds.w / 2 + TILE_SIZE,
      y: bounds.y + bounds.h * 0.3,
    };
  }

  public getWorldBounds(): { x: number; y: number; w: number; h: number } {
    return {
      x: this.trainX,
      y: this.trainY,
      w: CAR_PIXEL_WIDTH,
      h: this.getTotalHeight(),
    };
  }

  /** Check if a point is inside a connector corridor (not inside a car). */
  public isInConnector(wx: number, wy: number): boolean {
    for (let i = 0; i < this.cars.length - 1; i++) {
      const car = this.cars[i];
      const connTop = car.worldY + CAR_PIXEL_HEIGHT;
      const connBot = connTop + CAR_GAP;
      const connLeft = this.trainX + Math.floor(CAR_PIXEL_WIDTH / 2) - TILE_SIZE;
      const connRight = connLeft + TILE_SIZE * 2;
      if (wx >= connLeft && wx <= connRight && wy >= connTop && wy <= connBot) {
        return true;
      }
    }
    return false;
  }

  public stop(): void {
    this.isMoving = false;
  }

  public start(): void {
    if (this.fuel <= 0) return;
    this.isMoving = true;
  }

  public setDepths(
    floorDepth: number,
    wallDepth: number,
    furnitureDepth: number,
    frontWallDepth: number,
  ): void {
    for (const car of this.cars) {
      car.floorContainer.setDepth(floorDepth);
      car.wallContainer.setDepth(wallDepth);
      car.furnitureContainer.setDepth(furnitureDepth);
      car.frontWallContainer.setDepth(frontWallDepth);
    }
  }
}
