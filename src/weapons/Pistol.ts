import Phaser from 'phaser';
import { WeaponType, WeaponStats } from '../types/WeaponTypes';
import { Weapon } from './Weapon';
import { Bullet } from '../entities/projectiles/Bullet';

/**
 * Semi-automatic pistol. Unlimited reserve ammo.
 * Creates a single Bullet projectile per shot.
 */
export class Pistol extends Weapon {
  /** Object pool group for bullets - managed externally or created here */
  private bulletPool: Phaser.GameObjects.Group | null = null;

  constructor() {
    super(WeaponType.PISTOL);
  }

  /**
   * Get or create the bullet object pool for this scene.
   */
  private getBulletPool(scene: Phaser.Scene): Phaser.GameObjects.Group {
    if (!this.bulletPool || this.bulletPool.scene !== scene) {
      // Check if a shared bullet pool exists on the scene
      const existingPool = (scene as Record<string, unknown>)['bulletPool'] as
        | Phaser.GameObjects.Group
        | undefined;
      if (existingPool) {
        this.bulletPool = existingPool;
      } else {
        this.bulletPool = scene.add.group({
          classType: Bullet,
          maxSize: 30,
          runChildUpdate: true,
        });
        (scene as Record<string, unknown>)['bulletPool'] = this.bulletPool;
      }
    }
    return this.bulletPool;
  }

  protected createProjectiles(
    scene: Phaser.Scene,
    x: number,
    y: number,
    angle: number,
    stats: WeaponStats,
    owner?: Phaser.GameObjects.Sprite
  ): void {
    const pool = this.getBulletPool(scene);
    const spreadAngle = this.applySpread(angle, stats.spread);

    // Try to get an inactive bullet from pool; otherwise create new
    let bullet = pool.getFirstDead(false) as Bullet | null;
    if (!bullet) {
      if (pool.getLength() < pool.maxSize) {
        bullet = new Bullet(scene, 0, 0);
        pool.add(bullet);
      } else {
        // Pool is full - reuse the oldest active bullet
        bullet = pool.getFirstAlive(false) as Bullet | null;
        if (!bullet) return;
      }
    }

    bullet.fire(
      x,
      y,
      spreadAngle,
      stats.bulletSpeed,
      stats.damage,
      stats.piercing,
      stats.knockback,
      owner
    );
  }
}
