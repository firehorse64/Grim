import Phaser from 'phaser';
import {
  TILE_SIZE,
  CAR_TILE_WIDTH,
  CAR_TILE_HEIGHT,
  CAR_PIXEL_WIDTH,
  CAR_PIXEL_HEIGHT,
  WALL_VISUAL_HEIGHT,
} from '../data/BalanceConstants';
import { TileType, CarPurpose, CarLayout, PlacedFurniture, FurnitureType } from '../types/TrainTypes';

/**
 * A single train car rendered from 3/4 angle.
 * The car is oriented vertically: y=0 is the far (back) wall,
 * y=max is the near (front) wall closest to camera.
 * Doors at top-center (to previous car) and bottom-center (to next car).
 */
export class TrainCar {
  public readonly index: number;
  public readonly purpose: CarPurpose;
  public readonly layout: CarLayout;

  // World position of this car's top-left corner
  public worldX: number = 0;
  public worldY: number = 0;

  // Phaser containers
  public floorContainer!: Phaser.GameObjects.Container;
  public wallContainer!: Phaser.GameObjects.Container;
  public furnitureContainer!: Phaser.GameObjects.Container;
  public frontWallContainer!: Phaser.GameObjects.Container;

  // Physics bodies for walls (static group)
  public wallBodies: Phaser.Physics.Arcade.StaticGroup | null = null;
  public furnitureBodies: Phaser.Physics.Arcade.StaticGroup | null = null;

  constructor(index: number, purpose: CarPurpose) {
    this.index = index;
    this.purpose = purpose;
    this.layout = TrainCar.generateLayout(purpose);
  }

  /** Generate the tile layout for a given car purpose. */
  private static generateLayout(purpose: CarPurpose): CarLayout {
    const tiles: TileType[][] = [];

    for (let row = 0; row < CAR_TILE_HEIGHT; row++) {
      const r: TileType[] = [];
      for (let col = 0; col < CAR_TILE_WIDTH; col++) {
        // Walls on edges
        if (col === 0 || col === CAR_TILE_WIDTH - 1) {
          // Windows at regular intervals on side walls
          if (row > 1 && row < CAR_TILE_HEIGHT - 2 && row % 3 === 0) {
            r.push(TileType.WINDOW);
          } else {
            r.push(TileType.WALL);
          }
        } else if (row === 0) {
          // Back wall (far wall) — door in center
          if (col === Math.floor(CAR_TILE_WIDTH / 2)) {
            r.push(TileType.DOOR);
          } else {
            r.push(TileType.WALL);
          }
        } else if (row === CAR_TILE_HEIGHT - 1) {
          // Front wall (near wall) — door in center
          if (col === Math.floor(CAR_TILE_WIDTH / 2)) {
            r.push(TileType.DOOR);
          } else {
            r.push(TileType.WALL);
          }
        } else {
          // Interior: seats on sides, aisle in middle
          if ((col === 1) && row > 1 && row < CAR_TILE_HEIGHT - 2 && row % 2 === 0) {
            r.push(TileType.SEAT_LEFT);
          } else if ((col === CAR_TILE_WIDTH - 2) && row > 1 && row < CAR_TILE_HEIGHT - 2 && row % 2 === 0) {
            r.push(TileType.SEAT_RIGHT);
          } else {
            r.push(TileType.FLOOR);
          }
        }
      }
      tiles.push(r);
    }

    // Generate default furniture based on purpose
    const furniture: PlacedFurniture[] = [];
    switch (purpose) {
      case CarPurpose.ENGINE:
        furniture.push({
          type: FurnitureType.BRAKE_PANEL,
          tileX: 3, tileY: 2,
          widthTiles: 1, heightTiles: 1,
          interactPrompt: 'Stop Train',
        });
        furniture.push({
          type: FurnitureType.WORKBENCH,
          tileX: 1, tileY: 4,
          widthTiles: 2, heightTiles: 1,
          interactPrompt: 'Repair',
        });
        break;

      case CarPurpose.LIVING:
        furniture.push({
          type: FurnitureType.BED,
          tileX: 1, tileY: 2,
          widthTiles: 2, heightTiles: 2,
          interactPrompt: 'Sleep',
        });
        furniture.push({
          type: FurnitureType.COOKING_STOVE,
          tileX: 4, tileY: 3,
          widthTiles: 1, heightTiles: 1,
          interactPrompt: 'Cook',
        });
        furniture.push({
          type: FurnitureType.FIRST_AID,
          tileX: 5, tileY: 6,
          widthTiles: 1, heightTiles: 1,
          interactPrompt: 'Use First Aid',
        });
        furniture.push({
          type: FurnitureType.PLANT_BOX,
          tileX: 1, tileY: 8,
          widthTiles: 1, heightTiles: 1,
          interactPrompt: 'Tend Plants',
        });
        break;

      case CarPurpose.STORAGE:
        furniture.push({
          type: FurnitureType.STORAGE_CRATE,
          tileX: 1, tileY: 2,
          widthTiles: 1, heightTiles: 1,
          uses: 10,
          interactPrompt: 'Eat',
        });
        furniture.push({
          type: FurnitureType.STORAGE_CRATE,
          tileX: 5, tileY: 2,
          widthTiles: 1, heightTiles: 1,
          uses: 10,
          interactPrompt: 'Eat',
        });
        furniture.push({
          type: FurnitureType.STORAGE_CRATE,
          tileX: 1, tileY: 6,
          widthTiles: 1, heightTiles: 1,
          uses: 8,
          interactPrompt: 'Eat',
        });
        break;
    }

    return { purpose, tiles, furniture };
  }

  /** Create all visual and physics objects in the scene. */
  public create(scene: Phaser.Scene, x: number, y: number): void {
    this.worldX = x;
    this.worldY = y;

    this.floorContainer = scene.add.container(x, y);
    this.wallContainer = scene.add.container(x, y);
    this.furnitureContainer = scene.add.container(x, y);
    this.frontWallContainer = scene.add.container(x, y);

    this.wallBodies = scene.physics.add.staticGroup();
    this.furnitureBodies = scene.physics.add.staticGroup();

    const tiles = this.layout.tiles;

    for (let row = 0; row < CAR_TILE_HEIGHT; row++) {
      for (let col = 0; col < CAR_TILE_WIDTH; col++) {
        const tx = col * TILE_SIZE;
        const ty = row * TILE_SIZE;
        const tile = tiles[row][col];

        switch (tile) {
          case TileType.FLOOR:
          case TileType.SEAT_LEFT:
          case TileType.SEAT_RIGHT:
          case TileType.DOOR: {
            // Floor everywhere inside
            const floor = scene.add.image(tx + TILE_SIZE / 2, ty + TILE_SIZE / 2, 'train-floor');
            floor.setDisplaySize(TILE_SIZE, TILE_SIZE);
            this.floorContainer.add(floor);

            // Seats on top of floor
            if (tile === TileType.SEAT_LEFT) {
              const seat = scene.add.image(tx + TILE_SIZE / 2, ty + TILE_SIZE / 2, 'train-seat-left');
              seat.setDisplaySize(TILE_SIZE, TILE_SIZE);
              this.furnitureContainer.add(seat);
            } else if (tile === TileType.SEAT_RIGHT) {
              const seat = scene.add.image(tx + TILE_SIZE / 2, ty + TILE_SIZE / 2, 'train-seat-right');
              seat.setDisplaySize(TILE_SIZE, TILE_SIZE);
              this.furnitureContainer.add(seat);
            }
            break;
          }

          case TileType.WALL: {
            if (row === 0) {
              // Back wall
              const wall = scene.add.image(tx + TILE_SIZE / 2, ty + WALL_VISUAL_HEIGHT / 2, 'train-wall-back');
              wall.setDisplaySize(TILE_SIZE, WALL_VISUAL_HEIGHT);
              this.wallContainer.add(wall);
            } else if (row === CAR_TILE_HEIGHT - 1) {
              // Front wall
              const wall = scene.add.image(tx + TILE_SIZE / 2, ty + TILE_SIZE / 2, 'train-wall-back');
              wall.setDisplaySize(TILE_SIZE, WALL_VISUAL_HEIGHT);
              this.frontWallContainer.add(wall);
            } else {
              // Side wall
              const wall = scene.add.image(tx + TILE_SIZE / 2, ty + TILE_SIZE / 2, 'train-wall-side');
              wall.setDisplaySize(TILE_SIZE, TILE_SIZE);
              this.wallContainer.add(wall);
            }

            // Physics body for wall
            const body = this.wallBodies.create(
              x + tx + TILE_SIZE / 2,
              y + ty + TILE_SIZE / 2,
              'pixel',
            ) as Phaser.Physics.Arcade.Sprite;
            body.setDisplaySize(TILE_SIZE, TILE_SIZE);
            body.setVisible(false);
            body.refreshBody();
            break;
          }

          case TileType.WINDOW: {
            const win = scene.add.image(tx + TILE_SIZE / 2, ty + TILE_SIZE / 2, 'train-window');
            win.setDisplaySize(TILE_SIZE, WALL_VISUAL_HEIGHT);
            this.wallContainer.add(win);

            // Windows are still walls for collision
            const body = this.wallBodies.create(
              x + tx + TILE_SIZE / 2,
              y + ty + TILE_SIZE / 2,
              'pixel',
            ) as Phaser.Physics.Arcade.Sprite;
            body.setDisplaySize(TILE_SIZE, TILE_SIZE);
            body.setVisible(false);
            body.refreshBody();
            break;
          }
        }
      }
    }

    // Create furniture sprites and physics
    this.createFurniture(scene);

    // String lights decoration across the car
    this.addStringLights(scene);
  }

  private createFurniture(scene: Phaser.Scene): void {
    for (const f of this.layout.furniture) {
      const fx = f.tileX * TILE_SIZE;
      const fy = f.tileY * TILE_SIZE;
      const fw = f.widthTiles * TILE_SIZE;
      const fh = f.heightTiles * TILE_SIZE;

      let textureKey = 'furniture-crate';
      let dw = fw;
      let dh = fh;

      switch (f.type) {
        case FurnitureType.BED:
          textureKey = 'furniture-bed';
          dw = 64; dh = 48;
          break;
        case FurnitureType.STORAGE_CRATE:
          textureKey = 'furniture-crate';
          dw = 32; dh = 36;
          break;
        case FurnitureType.WORKBENCH:
          textureKey = 'furniture-workbench';
          dw = 64; dh = 40;
          break;
        case FurnitureType.COOKING_STOVE:
          textureKey = 'furniture-stove';
          dw = 32; dh = 32;
          break;
        case FurnitureType.FIRST_AID:
          textureKey = 'furniture-firstaid';
          dw = 24; dh = 24;
          break;
        case FurnitureType.PLANT_BOX:
          textureKey = 'furniture-plantbox';
          dw = 32; dh = 32;
          break;
        case FurnitureType.BRAKE_PANEL:
          textureKey = 'furniture-brake';
          dw = 24; dh = 40;
          break;
      }

      const img = scene.add.image(fx + fw / 2, fy + fh / 2, textureKey);
      img.setDisplaySize(dw, dh);
      this.furnitureContainer.add(img);

      // Physics body for furniture
      if (f.type !== FurnitureType.PLANT_BOX) {
        const body = this.furnitureBodies!.create(
          this.worldX + fx + fw / 2,
          this.worldY + fy + fh / 2,
          'pixel',
        ) as Phaser.Physics.Arcade.Sprite;
        body.setDisplaySize(fw - 4, fh - 4);
        body.setVisible(false);
        body.refreshBody();
      }
    }
  }

  private addStringLights(scene: Phaser.Scene): void {
    const lightsY = 1.5 * TILE_SIZE;
    const lights = scene.add.image(CAR_PIXEL_WIDTH / 2, lightsY, 'string-lights');
    lights.setDisplaySize(CAR_PIXEL_WIDTH - TILE_SIZE * 2, 8);
    lights.setAlpha(0.8);
    this.wallContainer.add(lights);
  }

  /** Check if a world-space point is inside this car's bounds. */
  public containsPoint(wx: number, wy: number): boolean {
    return (
      wx >= this.worldX &&
      wx < this.worldX + CAR_PIXEL_WIDTH &&
      wy >= this.worldY &&
      wy < this.worldY + CAR_PIXEL_HEIGHT
    );
  }

  /** Get walkable world bounds (interior only, excluding walls). */
  public getInteriorBounds(): { x: number; y: number; w: number; h: number } {
    return {
      x: this.worldX + TILE_SIZE,
      y: this.worldY + TILE_SIZE,
      w: (CAR_TILE_WIDTH - 2) * TILE_SIZE,
      h: (CAR_TILE_HEIGHT - 2) * TILE_SIZE,
    };
  }

  /** Get the world position of the door at the top (back) of the car. */
  public getBackDoorPos(): { x: number; y: number } {
    const col = Math.floor(CAR_TILE_WIDTH / 2);
    return {
      x: this.worldX + col * TILE_SIZE + TILE_SIZE / 2,
      y: this.worldY + TILE_SIZE / 2,
    };
  }

  /** Get the world position of the door at the bottom (front) of the car. */
  public getFrontDoorPos(): { x: number; y: number } {
    const col = Math.floor(CAR_TILE_WIDTH / 2);
    return {
      x: this.worldX + col * TILE_SIZE + TILE_SIZE / 2,
      y: this.worldY + (CAR_TILE_HEIGHT - 1) * TILE_SIZE + TILE_SIZE / 2,
    };
  }

  /** Find the PlacedFurniture nearest to a world point within range. */
  public findNearestFurniture(
    wx: number, wy: number, range: number,
  ): PlacedFurniture | null {
    let best: PlacedFurniture | null = null;
    let bestDist = range;

    for (const f of this.layout.furniture) {
      const cx = this.worldX + f.tileX * TILE_SIZE + (f.widthTiles * TILE_SIZE) / 2;
      const cy = this.worldY + f.tileY * TILE_SIZE + (f.heightTiles * TILE_SIZE) / 2;
      const d = Math.sqrt((wx - cx) ** 2 + (wy - cy) ** 2);
      if (d < bestDist) {
        bestDist = d;
        best = f;
      }
    }
    return best;
  }
}
