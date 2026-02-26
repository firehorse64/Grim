import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, TRAIN_SCROLL_SPEED } from '../data/BalanceConstants';

/**
 * Layer descriptor used internally by the manager.
 */
interface ParallaxLayer {
  /** Human-readable name (for debugging). */
  name: string;
  /** Texture key loaded during preload. */
  textureKey: string;
  /** Scroll speed multiplier relative to ground (0 = static, 1 = full speed). */
  speedFactor: number;
  /** The Phaser TileSprite created at runtime. */
  sprite: Phaser.GameObjects.TileSprite | null;
  /** Vertical position of the bottom edge of this layer. */
  yBottom: number;
  /** Height of the strip. */
  height: number;
}

// Default layer definitions (back-to-front order)
const LAYER_DEFS: Omit<ParallaxLayer, 'sprite'>[] = [
  {
    name: 'sky',
    textureKey: 'bg-sky',
    speedFactor: 0.0,
    yBottom: GAME_HEIGHT,
    height: GAME_HEIGHT,
  },
  {
    name: 'mountains',
    textureKey: 'bg-mountains',
    speedFactor: 0.1,
    yBottom: GAME_HEIGHT - 100,
    height: 200,
  },
  {
    name: 'hills',
    textureKey: 'bg-hills',
    speedFactor: 0.3,
    yBottom: GAME_HEIGHT - 40,
    height: 180,
  },
  {
    name: 'trees',
    textureKey: 'bg-trees',
    speedFactor: 0.6,
    yBottom: GAME_HEIGHT - 10,
    height: 160,
  },
  {
    name: 'tracks',
    textureKey: 'bg-tracks',
    speedFactor: 1.0,
    yBottom: GAME_HEIGHT,
    height: 60,
  },
];

/**
 * ParallaxManager – multi-layer scrolling background that sells the
 * illusion of a speeding train hurtling through a desolate landscape.
 *
 * Each layer is a horizontally-tiling TileSprite scrolled at a fraction
 * of the base TRAIN_SCROLL_SPEED. The manager exposes `setSpeed()` to
 * ramp the multiplier for events (station slow-down, tunnel, etc.) and
 * `setTint()` to shift palette for the day/night cycle.
 *
 * Usage:
 *   const parallax = new ParallaxManager();
 *   parallax.create(scene);
 *   // in update():
 *   parallax.update(time, delta);
 */
export class ParallaxManager {
  private layers: ParallaxLayer[] = [];

  /** Overall speed multiplier (1 = normal, 0 = stopped). */
  private speedMultiplier: number = 1;

  /** Target speed multiplier for smooth transitions. */
  private targetSpeedMultiplier: number = 1;

  /** How fast the multiplier lerps per second. */
  private speedLerpRate: number = 1.5;

  /** Tween used for smooth speed transitions (may be null). */
  private scene!: Phaser.Scene;

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /**
   * Build all layers and add them to the scene's display list (behind
   * everything else – caller should set depth or add before other objects).
   */
  public create(scene: Phaser.Scene): void {
    this.scene = scene;

    for (const def of LAYER_DEFS) {
      const yTop = def.yBottom - def.height;

      // TileSprite sized to camera viewport; tilePosition is scrolled.
      const sprite = scene.add.tileSprite(
        GAME_WIDTH * 0.5,
        yTop + def.height * 0.5,
        GAME_WIDTH,
        def.height,
        def.textureKey,
      );
      sprite.setScrollFactor(0); // fixed to camera – we scroll tile offset
      sprite.setDepth(-100 + this.layers.length); // sky deepest

      const layer: ParallaxLayer = { ...def, sprite };
      this.layers.push(layer);
    }
  }

  /**
   * Call every frame. Scrolls each layer's tile position based on its
   * speed factor, the base TRAIN_SCROLL_SPEED, and the current multiplier.
   */
  public update(_time: number, delta: number): void {
    const dt = delta / 1000;

    // Smoothly interpolate speed multiplier towards target
    if (this.speedMultiplier !== this.targetSpeedMultiplier) {
      const diff = this.targetSpeedMultiplier - this.speedMultiplier;
      const step = this.speedLerpRate * dt;
      if (Math.abs(diff) < step) {
        this.speedMultiplier = this.targetSpeedMultiplier;
      } else {
        this.speedMultiplier += Math.sign(diff) * step;
      }
    }

    const baseScroll = TRAIN_SCROLL_SPEED * this.speedMultiplier * dt;

    for (const layer of this.layers) {
      if (!layer.sprite) continue;
      layer.sprite.tilePositionX += baseScroll * layer.speedFactor;
    }
  }

  /**
   * Set the overall speed multiplier. Lerps smoothly over time.
   * - 1.0 = normal full speed
   * - 0.0 = train stopped (station)
   * - 0.3 = slowing down
   */
  public setSpeed(multiplier: number): void {
    this.targetSpeedMultiplier = Phaser.Math.Clamp(multiplier, 0, 3);
  }

  /**
   * Immediately snap to a speed with no interpolation.
   */
  public setSpeedImmediate(multiplier: number): void {
    this.speedMultiplier = Phaser.Math.Clamp(multiplier, 0, 3);
    this.targetSpeedMultiplier = this.speedMultiplier;
  }

  /**
   * Apply a uniform tint colour to every layer. Pass `0xffffff` to reset.
   * Useful for day/night cycle:
   *   DAWN  -> 0xffccaa
   *   DAY   -> 0xffffff
   *   DUSK  -> 0xff9966
   *   NIGHT -> 0x334466
   */
  public setTint(color: number): void {
    for (const layer of this.layers) {
      layer.sprite?.setTint(color);
    }
  }

  /**
   * Tint individual layer by name. Valid names: sky, mountains, hills,
   * trees, tracks.
   */
  public setLayerTint(name: string, color: number): void {
    const layer = this.layers.find((l) => l.name === name);
    layer?.sprite?.setTint(color);
  }

  /** Current effective speed multiplier (0-3). */
  public getSpeed(): number {
    return this.speedMultiplier;
  }

  /**
   * Set visibility of a specific layer by name. Handy for tunnel events
   * where you may want to hide background layers.
   */
  public setLayerVisible(name: string, visible: boolean): void {
    const layer = this.layers.find((l) => l.name === name);
    layer?.sprite?.setVisible(visible);
  }

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------

  public destroy(): void {
    for (const layer of this.layers) {
      layer.sprite?.destroy();
      layer.sprite = null;
    }
    this.layers.length = 0;
  }
}
