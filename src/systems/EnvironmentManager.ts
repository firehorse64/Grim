import Phaser from 'phaser';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  TILE_SIZE,
  CAR_PIXEL_WIDTH,
  TRAIN_SCROLL_SPEED,
} from '../data/BalanceConstants';

/**
 * Renders the scrolling exterior terrain on both sides of the train.
 * Ground tiles scroll downward when the train is moving.
 * Also handles environmental props (dead trees, car wrecks, fog).
 */
export class EnvironmentManager {
  private scene!: Phaser.Scene;

  // Tile-based scrolling ground strips
  private leftGround: Phaser.GameObjects.TileSprite[] = [];
  private rightGround: Phaser.GameObjects.TileSprite[] = [];
  private trackStrip!: Phaser.GameObjects.TileSprite;

  // Ambient props that scroll by
  private props: Phaser.GameObjects.Image[] = [];
  private propTimer: number = 0;

  // Fog overlays
  private fogPatches: Phaser.GameObjects.Image[] = [];

  // The X position of the train's left edge
  private trainLeftX: number = 0;
  private trainRightX: number = 0;

  public create(scene: Phaser.Scene, trainX: number): void {
    this.scene = scene;
    this.trainLeftX = trainX;
    this.trainRightX = trainX + CAR_PIXEL_WIDTH;

    // Left ground strip (extends from 0 to trainLeftX)
    const leftWidth = Math.max(TILE_SIZE, this.trainLeftX);
    if (leftWidth > 0) {
      // Grass/dirt ground
      const leftGrass = scene.add.tileSprite(
        leftWidth / 2, GAME_HEIGHT / 2,
        leftWidth, GAME_HEIGHT * 3,
        'ground-grass',
      );
      leftGrass.setDepth(0);
      this.leftGround.push(leftGrass);

      // Gravel near tracks
      const gravelW = Math.min(64, leftWidth);
      const leftGravel = scene.add.tileSprite(
        this.trainLeftX - gravelW / 2, GAME_HEIGHT / 2,
        gravelW, GAME_HEIGHT * 3,
        'ground-gravel',
      );
      leftGravel.setDepth(0.1);
      this.leftGround.push(leftGravel);
    }

    // Right ground strip
    const rightStart = this.trainRightX;
    const rightWidth = Math.max(TILE_SIZE, GAME_WIDTH - rightStart);
    if (rightWidth > 0) {
      const rightGrass = scene.add.tileSprite(
        rightStart + rightWidth / 2, GAME_HEIGHT / 2,
        rightWidth, GAME_HEIGHT * 3,
        'ground-grass',
      );
      rightGrass.setDepth(0);
      this.rightGround.push(rightGrass);

      const gravelW = Math.min(64, rightWidth);
      const rightGravel = scene.add.tileSprite(
        rightStart + gravelW / 2, GAME_HEIGHT / 2,
        gravelW, GAME_HEIGHT * 3,
        'ground-gravel',
      );
      rightGravel.setDepth(0.1);
      this.rightGround.push(rightGravel);
    }

    // Rail tracks under/beside the train
    this.trackStrip = scene.add.tileSprite(
      this.trainLeftX + CAR_PIXEL_WIDTH / 2, GAME_HEIGHT / 2,
      CAR_PIXEL_WIDTH + 32, GAME_HEIGHT * 3,
      'train-rail',
    );
    this.trackStrip.setDepth(0.05);

    // Initial fog patches
    for (let i = 0; i < 4; i++) {
      this.spawnFogPatch();
    }
  }

  /** Update scroll and spawn props. */
  public update(delta: number, isMoving: boolean, cameraY: number): void {
    if (!isMoving) return;

    const scrollAmount = TRAIN_SCROLL_SPEED * (delta / 1000);

    // Scroll all ground tile sprites
    for (const ts of this.leftGround) {
      ts.tilePositionY -= scrollAmount;
      ts.y = cameraY;
    }
    for (const ts of this.rightGround) {
      ts.tilePositionY -= scrollAmount;
      ts.y = cameraY;
    }
    this.trackStrip.tilePositionY -= scrollAmount;
    this.trackStrip.y = cameraY;

    // Move props downward
    for (let i = this.props.length - 1; i >= 0; i--) {
      this.props[i].y += scrollAmount;
      // Remove if off screen below
      if (this.props[i].y > cameraY + GAME_HEIGHT) {
        this.props[i].destroy();
        this.props.splice(i, 1);
      }
    }

    // Move fog
    for (let i = this.fogPatches.length - 1; i >= 0; i--) {
      this.fogPatches[i].y += scrollAmount * 0.3; // fog drifts slower
      if (this.fogPatches[i].y > cameraY + GAME_HEIGHT) {
        this.fogPatches[i].destroy();
        this.fogPatches.splice(i, 1);
        this.spawnFogPatch();
      }
    }

    // Spawn props periodically
    this.propTimer += delta;
    if (this.propTimer > 2500) {
      this.propTimer = 0;
      this.spawnProp(cameraY);
    }
  }

  private spawnProp(cameraY: number): void {
    // Spawn above camera
    const side = Math.random() < 0.5 ? 'left' : 'right';
    const x = side === 'left'
      ? Math.random() * (this.trainLeftX - 48) + 24
      : this.trainRightX + 24 + Math.random() * (GAME_WIDTH - this.trainRightX - 48);
    const y = cameraY - GAME_HEIGHT / 2 - 50;

    const propType = Math.random();
    let key: string;
    if (propType < 0.4) {
      key = 'dead-tree';
    } else if (propType < 0.7) {
      key = 'car-wreck';
    } else {
      // Just a dirt patch
      key = 'ground-dirt';
    }

    const img = this.scene.add.image(x, y, key);
    img.setDepth(0.5);
    img.setAlpha(0.8);
    this.props.push(img);
  }

  private spawnFogPatch(): void {
    const x = Math.random() * GAME_WIDTH;
    const y = Math.random() * GAME_HEIGHT * 2 - GAME_HEIGHT / 2;
    const fog = this.scene.add.image(x, y, 'fog-patch');
    fog.setDepth(20); // above most things
    fog.setAlpha(0.15 + Math.random() * 0.15);
    fog.setScale(1 + Math.random() * 2);
    this.fogPatches.push(fog);
  }
}
