import Phaser from 'phaser';
import { WeaponType, WeaponStats } from '../types/WeaponTypes';
import { Weapon } from './Weapon';
import { Pellet } from '../entities/projectiles/Pellet';

/**
 * Shotgun. Creates 7 Pellet projectiles in a spread cone.
 * High knockback, short range pellets with slight gravity.
 */
export class Shotgun extends Weapon {
  private pelletPool: Phaser.GameObjects.Group | null = null;

  constructor() {
    super(WeaponType.SHOTGUN);
  }

  /**
   * Get or create the pellet object pool for this scene.
   */
  private getPelletPool(scene: Phaser.Scene): Phaser.GameObjects.Group {
    if (!this.pelletPool || this.pelletPool.scene !== scene) {
      const sceneAny = scene as unknown as Record<string, unknown>;
      const existingPool = sceneAny['pelletPool'] as
        | Phaser.GameObjects.Group
        | undefined;
      if (existingPool) {
        this.pelletPool = existingPool;
      } else {
        this.pelletPool = scene.add.group({
          classType: Pellet,
          maxSize: 56, // 7 pellets * 8 shots buffered
          runChildUpdate: true,
        });
        sceneAny['pelletPool'] = this.pelletPool;
      }
    }
    return this.pelletPool;
  }

  protected createProjectiles(
    scene: Phaser.Scene,
    x: number,
    y: number,
    angle: number,
    stats: WeaponStats,
    owner?: Phaser.GameObjects.Sprite
  ): void {
    const pool = this.getPelletPool(scene);
    const pelletCount = stats.projectilesPerShot; // 7

    // Distribute pellets evenly across the spread cone, plus random jitter
    for (let i = 0; i < pelletCount; i++) {
      // Even distribution across the cone
      const coneOffset =
        ((i / (pelletCount - 1)) - 0.5) * stats.spread * 2;
      // Plus small random jitter
      const jitter = (Math.random() - 0.5) * stats.spread * 0.5;
      const pelletAngle = angle + coneOffset + jitter;

      // Slight speed variation per pellet for a natural feel
      const speedVariation = 0.85 + Math.random() * 0.3;
      const pelletSpeed = stats.bulletSpeed * speedVariation;

      let pellet = pool.getFirstDead(false) as Pellet | null;
      if (!pellet) {
        if (pool.getLength() < pool.maxSize) {
          pellet = new Pellet(scene, 0, 0);
          pool.add(pellet);
        } else {
          pellet = pool.getFirstAlive(false) as Pellet | null;
          if (!pellet) continue;
        }
      }

      pellet.fire(
        x,
        y,
        pelletAngle,
        pelletSpeed,
        stats.damage,
        stats.knockback,
        owner
      );
    }
  }
}
