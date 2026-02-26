import Phaser from 'phaser';
import { WeaponType, WeaponStats } from '../types/WeaponTypes';
import { Weapon } from './Weapon';
import { Bullet } from '../entities/projectiles/Bullet';

/**
 * Submachine gun. Full-auto (can hold fire), fast fire rate, low damage.
 * Creates a single Bullet per shot.
 */
export class SMG extends Weapon {
  private bulletPool: Phaser.GameObjects.Group | null = null;

  constructor() {
    super(WeaponType.SMG);
  }

  /**
   * Get or create the bullet object pool for this scene.
   * Shares pool with Pistol if one already exists.
   */
  private getBulletPool(scene: Phaser.Scene): Phaser.GameObjects.Group {
    if (!this.bulletPool || this.bulletPool.scene !== scene) {
      const existingPool = (scene as Record<string, unknown>)['bulletPool'] as
        | Phaser.GameObjects.Group
        | undefined;
      if (existingPool) {
        this.bulletPool = existingPool;
        // SMG sprays a lot - ensure pool can handle it
        if (this.bulletPool.maxSize < 60) {
          this.bulletPool.maxSize = 60;
        }
      } else {
        this.bulletPool = scene.add.group({
          classType: Bullet,
          maxSize: 60,
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

    let bullet = pool.getFirstDead(false) as Bullet | null;
    if (!bullet) {
      if (pool.getLength() < pool.maxSize) {
        bullet = new Bullet(scene, 0, 0);
        pool.add(bullet);
      } else {
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
