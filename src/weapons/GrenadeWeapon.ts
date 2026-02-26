import Phaser from 'phaser';
import { WeaponType, WeaponStats } from '../types/WeaponTypes';
import { Weapon } from './Weapon';
import { Grenade } from '../entities/projectiles/Grenade';
import { EventBus } from '../utils/EventBus';
import { GameEvents } from '../types/EventTypes';

/**
 * Grenade launcher / throwable grenades. Lobs a Grenade in an arc.
 * Area damage on impact. No reload mechanic - limited stock.
 * currentAmmo acts as grenade count; there is no clip/reserve split.
 */
export class GrenadeWeapon extends Weapon {
  private grenadePool: Phaser.GameObjects.Group | null = null;

  constructor() {
    super(WeaponType.GRENADE);

    // Grenades don't use the clip/reserve system traditionally.
    // clipSize acts as the carried count, reserveAmmo is additional stock.
    // Start with clipSize grenades ready, reserve for restocks.
  }

  /**
   * Override canFire: grenades have no reload, just need ammo and cooldown.
   */
  canFire(): boolean {
    return this.fireCooldown <= 0 && this.currentAmmo > 0;
  }

  /**
   * Override reload: grenades don't reload in the traditional sense.
   * Instead, reserve ammo is moved into the clip directly (instant).
   */
  reload(): void {
    if (this.reserveAmmo <= 0) return;

    const stats = this.getStats();
    const ammoNeeded = stats.clipSize - this.currentAmmo;
    if (ammoNeeded <= 0) return;

    const ammoToLoad = Math.min(ammoNeeded, this.reserveAmmo);
    this.currentAmmo += ammoToLoad;
    this.reserveAmmo -= ammoToLoad;

    EventBus.emit(GameEvents.AMMO_CHANGED, {
      weaponType: this.weaponType,
      currentAmmo: this.currentAmmo,
      reserveAmmo: this.reserveAmmo,
      clipSize: stats.clipSize,
    });
  }

  /**
   * Get or create the grenade object pool for this scene.
   */
  private getGrenadePool(scene: Phaser.Scene): Phaser.GameObjects.Group {
    if (!this.grenadePool || this.grenadePool.scene !== scene) {
      const sceneAny = scene as unknown as Record<string, unknown>;
      const existingPool = sceneAny['grenadePool'] as
        | Phaser.GameObjects.Group
        | undefined;
      if (existingPool) {
        this.grenadePool = existingPool;
      } else {
        this.grenadePool = scene.add.group({
          classType: Grenade,
          maxSize: 6,
          runChildUpdate: true,
        });
        sceneAny['grenadePool'] = this.grenadePool;
      }
    }
    return this.grenadePool;
  }

  protected createProjectiles(
    scene: Phaser.Scene,
    x: number,
    y: number,
    angle: number,
    stats: WeaponStats,
    owner?: Phaser.GameObjects.Sprite
  ): void {
    const pool = this.getGrenadePool(scene);
    const spreadAngle = this.applySpread(angle, stats.spread);

    let grenade = pool.getFirstDead(false) as Grenade | null;
    if (!grenade) {
      if (pool.getLength() < pool.maxSize) {
        grenade = new Grenade(scene, 0, 0);
        pool.add(grenade);
      } else {
        grenade = pool.getFirstAlive(false) as Grenade | null;
        if (!grenade) return;
      }
    }

    grenade.fire(
      x,
      y,
      spreadAngle,
      stats.bulletSpeed,
      stats.damage,
      stats.explosionRadius,
      stats.knockback,
      owner
    );
  }
}
