import Phaser from 'phaser';
import {
  NUM_TRAIN_CARS,
  CAR_PIXEL_WIDTH,
  CAR_PIXEL_HEIGHT,
  CAR_GAP,
  TILE_SIZE,
  TRAIN_SCROLL_SPEED,
  GAME_WIDTH,
} from '../data/BalanceConstants';
import { TrainCar } from './TrainCar';
import { CarPurpose } from '../types/TrainTypes';

/**
 * Train – manages all TrainCars stacked vertically.
 * Car 0 is at the top (engine, direction of travel).
 * Cars below extend downward.
 */
export class Train {
  public cars: TrainCar[] = [];
  public isMoving: boolean = true;
  public speed: number = TRAIN_SCROLL_SPEED;

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

  public stop(): void {
    this.isMoving = false;
  }

  public start(): void {
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
