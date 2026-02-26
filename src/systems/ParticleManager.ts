import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../data/BalanceConstants';

// ─────────────────────────────────────────────────────────────────────────────
// ParticleManager
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Factory for common particle effects. Each method creates a pre-configured
 * Phaser particle emitter for a specific visual effect (blood, explosions,
 * muzzle flashes, smoke, sparks, weather). Effects are one-shot or
 * continuous depending on the type.
 *
 * Textures referenced:
 *   blood-1, blood-2, blood-3, explosion, muzzle-flash, smoke, spark,
 *   rain-drop, snow-flake
 *
 * All textures should be loaded during the PreloaderScene.
 */
export class ParticleManager {
  private scene!: Phaser.Scene;

  // Persistent weather emitter references (only one active at a time)
  private activeRainEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private activeSnowEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

  // ─── Public API ────────────────────────────────────────────────────────

  /**
   * Initialise the particle manager. Call once during scene create().
   */
  public create(scene: Phaser.Scene): void {
    this.scene = scene;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Blood splatter
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Spray red blood particles in a direction when a zombie is hit.
   *
   * @param x         World X of the hit position.
   * @param y         World Y of the hit position.
   * @param direction Direction of spray in radians (usually bullet travel angle).
   */
  public bloodSplatter(x: number, y: number, direction: number): void {
    // Pick a random blood texture variant
    const textureKeys = ['blood-1', 'blood-2', 'blood-3'];
    const textureKey = this.pickAvailableTexture(textureKeys);
    if (!textureKey) return;

    const degDir = Phaser.Math.RadToDeg(direction);

    const emitter = this.scene.add.particles(x, y, textureKey, {
      lifespan: { min: 200, max: 500 },
      speed: { min: 80, max: 220 },
      angle: { min: degDir - 30, max: degDir + 30 },
      scale: { start: 0.5, end: 0.1 },
      alpha: { start: 0.9, end: 0 },
      gravityY: 300,
      tint: [0xcc0000, 0xaa0000, 0x880000],
      quantity: 6,
      emitting: false,
    });
    emitter.setDepth(20);

    emitter.explode(Phaser.Math.Between(4, 8));

    // Auto-destroy after particles fade
    this.scene.time.delayedCall(600, () => {
      emitter.destroy();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Explosion
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Large burst of particles for grenade explosions or boss deaths.
   *
   * @param x      World X centre of explosion.
   * @param y      World Y centre of explosion.
   * @param radius Explosion radius (affects particle spread).
   */
  public explosion(x: number, y: number, radius: number = 120): void {
    const textureKey = this.pickAvailableTexture(['explosion']);
    if (!textureKey) return;

    const speedMax = radius * 2.5;

    const emitter = this.scene.add.particles(x, y, textureKey, {
      lifespan: { min: 300, max: 800 },
      speed: { min: 50, max: speedMax },
      angle: { min: 0, max: 360 },
      scale: { start: 0.8, end: 0.1 },
      alpha: { start: 1, end: 0 },
      gravityY: 100,
      tint: [0xff8800, 0xffaa00, 0xff4400, 0xffcc00],
      quantity: 15,
      emitting: false,
    });
    emitter.setDepth(25);

    emitter.explode(Phaser.Math.Between(12, 20));

    // Smoke ring after the main burst
    const smokeKey = this.pickAvailableTexture(['smoke']);
    if (smokeKey) {
      const smokeEmitter = this.scene.add.particles(x, y, smokeKey, {
        lifespan: { min: 400, max: 1000 },
        speed: { min: 20, max: radius * 0.8 },
        angle: { min: 0, max: 360 },
        scale: { start: 0.6, end: 1.5 },
        alpha: { start: 0.5, end: 0 },
        gravityY: -30,
        tint: 0x444444,
        quantity: 8,
        emitting: false,
      });
      smokeEmitter.setDepth(24);
      smokeEmitter.explode(Phaser.Math.Between(6, 10));

      this.scene.time.delayedCall(1200, () => {
        smokeEmitter.destroy();
      });
    }

    this.scene.time.delayedCall(1000, () => {
      emitter.destroy();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Muzzle flash
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Brief bright flash at the gun barrel when firing.
   *
   * @param x     World X of the barrel.
   * @param y     World Y of the barrel.
   * @param angle Angle the weapon is facing (radians).
   */
  public muzzleFlash(x: number, y: number, angle: number): void {
    const textureKey = this.pickAvailableTexture(['muzzle-flash']);
    if (!textureKey) return;

    const degAngle = Phaser.Math.RadToDeg(angle);

    const emitter = this.scene.add.particles(x, y, textureKey, {
      lifespan: 60,
      speed: { min: 40, max: 100 },
      angle: { min: degAngle - 15, max: degAngle + 15 },
      scale: { start: 0.6, end: 0.1 },
      alpha: { start: 1, end: 0 },
      tint: [0xffffcc, 0xffff88, 0xffeeaa],
      quantity: 3,
      emitting: false,
    });
    emitter.setDepth(22);

    emitter.explode(Phaser.Math.Between(2, 4));

    this.scene.time.delayedCall(100, () => {
      emitter.destroy();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Smoke
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Rising smoke puff for barricade destruction or environmental effects.
   *
   * @param x World X.
   * @param y World Y.
   */
  public smoke(x: number, y: number): void {
    const textureKey = this.pickAvailableTexture(['smoke']);
    if (!textureKey) return;

    const emitter = this.scene.add.particles(x, y, textureKey, {
      lifespan: { min: 600, max: 1200 },
      speed: { min: 15, max: 50 },
      angle: { min: 250, max: 290 }, // Mostly upward
      scale: { start: 0.3, end: 1.0 },
      alpha: { start: 0.6, end: 0 },
      gravityY: -40,
      tint: [0x555555, 0x666666, 0x444444],
      quantity: 5,
      emitting: false,
    });
    emitter.setDepth(18);

    emitter.explode(Phaser.Math.Between(5, 8));

    this.scene.time.delayedCall(1400, () => {
      emitter.destroy();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Sparks
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Bright spark particles for electric barricade zaps.
   *
   * @param x World X.
   * @param y World Y.
   */
  public sparks(x: number, y: number): void {
    const textureKey = this.pickAvailableTexture(['spark']);
    if (!textureKey) return;

    const emitter = this.scene.add.particles(x, y, textureKey, {
      lifespan: { min: 100, max: 300 },
      speed: { min: 100, max: 300 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.4, end: 0.05 },
      alpha: { start: 1, end: 0 },
      gravityY: 150,
      tint: [0x88ccff, 0xaaeeff, 0xffffff, 0x66aaff],
      quantity: 6,
      emitting: false,
    });
    emitter.setDepth(21);

    emitter.explode(Phaser.Math.Between(5, 10));

    this.scene.time.delayedCall(400, () => {
      emitter.destroy();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Rain (continuous)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Start a continuous rain particle system across the screen.
   * Returns the emitter so the caller can stop it later.
   */
  public rain(): Phaser.GameObjects.Particles.ParticleEmitter | null {
    // Stop any existing rain
    this.stopRain();

    const textureKey = this.pickAvailableTexture(['rain-drop']);
    if (!textureKey) return null;

    const emitter = this.scene.add.particles(0, 0, textureKey, {
      x: { min: 0, max: GAME_WIDTH },
      y: -10,
      lifespan: 700,
      speedY: { min: 400, max: 600 },
      speedX: { min: -50, max: -100 },
      scaleX: { min: 0.3, max: 0.5 },
      scaleY: { min: 0.8, max: 1.2 },
      alpha: { start: 0.5, end: 0.1 },
      quantity: 6,
      frequency: 40,
      tint: 0x8899bb,
    });
    emitter.setDepth(80);
    emitter.setScrollFactor(0);

    this.activeRainEmitter = emitter;
    return emitter;
  }

  /** Stop rain particles. */
  public stopRain(): void {
    if (this.activeRainEmitter) {
      this.activeRainEmitter.stop();
      this.scene.time.delayedCall(1000, () => {
        this.activeRainEmitter?.destroy();
        this.activeRainEmitter = null;
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Snow (continuous)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Start falling snow particles across the screen.
   * Returns the emitter so the caller can stop it later.
   */
  public snow(): Phaser.GameObjects.Particles.ParticleEmitter | null {
    // Stop any existing snow
    this.stopSnow();

    const textureKey = this.pickAvailableTexture(['snow-flake']);
    if (!textureKey) return null;

    const emitter = this.scene.add.particles(0, 0, textureKey, {
      x: { min: -20, max: GAME_WIDTH + 20 },
      y: -10,
      lifespan: { min: 3000, max: 5000 },
      speedY: { min: 30, max: 80 },
      speedX: { min: -20, max: 20 },
      scale: { min: 0.2, max: 0.6 },
      alpha: { start: 0.8, end: 0 },
      rotate: { min: 0, max: 360 },
      quantity: 2,
      frequency: 100,
      tint: [0xffffff, 0xeeeeff, 0xddddff],
    });
    emitter.setDepth(80);
    emitter.setScrollFactor(0);

    this.activeSnowEmitter = emitter;
    return emitter;
  }

  /** Stop snow particles. */
  public stopSnow(): void {
    if (this.activeSnowEmitter) {
      this.activeSnowEmitter.stop();
      this.scene.time.delayedCall(5000, () => {
        this.activeSnowEmitter?.destroy();
        this.activeSnowEmitter = null;
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────────────────────

  /** Destroy all persistent emitters. */
  public destroy(): void {
    this.activeRainEmitter?.destroy();
    this.activeRainEmitter = null;
    this.activeSnowEmitter?.destroy();
    this.activeSnowEmitter = null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Return the first texture key that is loaded in the texture manager.
   * Returns null if none of the provided keys are available.
   */
  private pickAvailableTexture(keys: string[]): string | null {
    for (const key of keys) {
      if (this.scene.textures.exists(key)) {
        return key;
      }
    }

    // Fallback: generate a tiny placeholder texture on the fly so
    // particles still work during development when asset pipeline
    // hasn't loaded the real textures yet.
    const fallbackKey = `__pm_fallback_${keys[0]}`;
    if (!this.scene.textures.exists(fallbackKey)) {
      const g = this.scene.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.fillCircle(4, 4, 4);
      g.generateTexture(fallbackKey, 8, 8);
      g.destroy();
    }
    return fallbackKey;
  }
}
