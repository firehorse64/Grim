import Phaser from 'phaser';
import { WeaponType, WeaponStats } from '../types/WeaponTypes';
import { Weapon } from './Weapon';
import { Bullet } from '../entities/projectiles/Bullet';

/**
 * High-powered rifle. Semi-auto, high damage, piercing bullets.
 * Piercing bullets pass through enemies with reduced damage per hit.
 */
export class Rifle extends Weapon {
  private bulletPool: Phaser.GameObjects.Group | null = null;

  constructor() {
    super(WeaponType.RIFLE);
  }

  /**
   * Get or create the bullet object pool for this scene.
   * Shares pool with Pistol/SMG if one already exists.
   */
  private getBulletPool(scene: Phaser.Scene): Phaser.GameObjects.Group {
    if (!this.bulletPool || this.bulletPool.scene !== scene) {
      const sceneAny = scene as unknown as Record<string, unknown>;
      const existingPool = sceneAny['bulletPool'] as
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
        sceneAny['bulletPool'] = this.bulletPool;
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
      true, // always piercing for rifle
      stats.knockback,
      owner
    );

    // Rifle shots have a subtle tracer effect
    const tracer = scene.add.line(
      0, 0,
      x, y,
      x + Math.cos(spreadAngle) * 80,
      y + Math.sin(spreadAngle) * 80,
      0xffff88,
      0.6
    );
    tracer.setLineWidth(1.5);
    tracer.setDepth(14);

    scene.tweens.add({
      targets: tracer,
      alpha: 0,
      duration: 80,
      onComplete: () => {
        tracer.destroy();
      },
    });
  }
}
