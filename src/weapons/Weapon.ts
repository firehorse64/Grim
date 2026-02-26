import Phaser from 'phaser';
import { WeaponType, WeaponStats, WeaponState } from '../types/WeaponTypes';
import {
  WEAPON_DATA,
  WEAPON_UPGRADE_DAMAGE_MULT,
  WEAPON_UPGRADE_CLIP_MULT,
  WEAPON_UPGRADE_RELOAD_MULT,
} from '../data/WeaponData';
import { EventBus } from '../utils/EventBus';
import { GameEvents } from '../types/EventTypes';

/**
 * Abstract base class for all weapons. Not a sprite - owned by the Player.
 * Reads stats from WeaponData, manages ammo/reload/cooldown state,
 * and delegates projectile creation to subclasses.
 */
export abstract class Weapon {
  protected scene: Phaser.Scene | null = null;

  public readonly weaponType: WeaponType;
  public readonly baseStats: WeaponStats;

  // Ammo state
  public currentAmmo: number;
  public reserveAmmo: number;

  // Reload state
  public isReloading: boolean = false;
  public reloadTimer: number = 0;

  // Fire cooldown
  public fireCooldown: number = 0;

  // Upgrade level (0 = base, up to WEAPON_UPGRADE_DAMAGE_MULT.length - 1)
  public level: number = 0;

  constructor(weaponType: WeaponType) {
    this.weaponType = weaponType;
    this.baseStats = { ...WEAPON_DATA[weaponType] };

    // Initialize ammo to full clip
    this.currentAmmo = this.getStats().clipSize;
    this.reserveAmmo = this.baseStats.unlimitedReserve
      ? Infinity
      : this.baseStats.maxReserve;
  }

  /**
   * Get weapon stats adjusted for current upgrade level.
   * Applies damage, clip size, and reload time multipliers.
   */
  getStats(): WeaponStats {
    const lvl = Math.min(
      this.level,
      WEAPON_UPGRADE_DAMAGE_MULT.length - 1
    );

    const damageMult = WEAPON_UPGRADE_DAMAGE_MULT[lvl];
    const clipMult = WEAPON_UPGRADE_CLIP_MULT[lvl];
    const reloadMult = WEAPON_UPGRADE_RELOAD_MULT[lvl];

    return {
      ...this.baseStats,
      damage: Math.round(this.baseStats.damage * damageMult),
      clipSize: Math.round(this.baseStats.clipSize * clipMult),
      reloadTime: Math.round(this.baseStats.reloadTime * reloadMult),
    };
  }

  /**
   * Get the full weapon state for UI/serialization.
   */
  getState(): WeaponState {
    return {
      type: this.weaponType,
      currentAmmo: this.currentAmmo,
      reserveAmmo: this.reserveAmmo,
      isReloading: this.isReloading,
      reloadTimer: this.reloadTimer,
      fireCooldown: this.fireCooldown,
      level: this.level,
    };
  }

  /**
   * Check if the weapon can currently fire.
   */
  canFire(): boolean {
    return (
      !this.isReloading &&
      this.fireCooldown <= 0 &&
      this.currentAmmo > 0
    );
  }

  /**
   * Attempt to fire the weapon. Creates projectile(s) via subclass.
   * Returns true if the weapon actually fired.
   */
  fire(
    scene: Phaser.Scene,
    x: number,
    y: number,
    angle: number,
    owner?: Phaser.GameObjects.Sprite
  ): boolean {
    if (!this.canFire()) {
      // If out of ammo in clip, auto-reload
      if (this.currentAmmo <= 0 && !this.isReloading) {
        this.reload();
        EventBus.emit(GameEvents.AMMO_EMPTY, {
          weaponType: this.weaponType,
        });
      }
      return false;
    }

    this.scene = scene;
    const stats = this.getStats();

    // Create projectile(s) via subclass
    this.createProjectiles(scene, x, y, angle, stats, owner);

    // Consume ammo
    this.currentAmmo--;

    // Set fire cooldown
    this.fireCooldown = stats.fireRate;

    // Create muzzle flash effect
    this.createMuzzleFlash(scene, x, y, angle);

    // Emit events
    EventBus.emit(GameEvents.BULLET_FIRED, {
      weaponType: this.weaponType,
      x,
      y,
      angle,
    });

    EventBus.emit(GameEvents.AMMO_CHANGED, {
      weaponType: this.weaponType,
      currentAmmo: this.currentAmmo,
      reserveAmmo: this.reserveAmmo,
      clipSize: stats.clipSize,
    });

    return true;
  }

  /**
   * Start reloading if not already reloading, not at full ammo,
   * and has reserve ammo available.
   */
  reload(): void {
    const stats = this.getStats();

    // Already reloading or clip is full
    if (this.isReloading || this.currentAmmo >= stats.clipSize) {
      return;
    }

    // No reserve ammo available (and not unlimited)
    if (!this.baseStats.unlimitedReserve && this.reserveAmmo <= 0) {
      return;
    }

    // No reload for weapons with 0 reload time (e.g., grenades)
    if (stats.reloadTime <= 0) {
      return;
    }

    this.isReloading = true;
    this.reloadTimer = stats.reloadTime;

    EventBus.emit(GameEvents.WEAPON_RELOADING, {
      weaponType: this.weaponType,
      reloadTime: stats.reloadTime,
    });
  }

  /**
   * Complete the reload: transfer ammo from reserve to clip.
   */
  private completeReload(): void {
    const stats = this.getStats();
    const ammoNeeded = stats.clipSize - this.currentAmmo;

    if (this.baseStats.unlimitedReserve) {
      this.currentAmmo = stats.clipSize;
    } else {
      const ammoToLoad = Math.min(ammoNeeded, this.reserveAmmo);
      this.currentAmmo += ammoToLoad;
      this.reserveAmmo -= ammoToLoad;
    }

    this.isReloading = false;
    this.reloadTimer = 0;

    EventBus.emit(GameEvents.WEAPON_RELOADED, {
      weaponType: this.weaponType,
    });

    EventBus.emit(GameEvents.AMMO_CHANGED, {
      weaponType: this.weaponType,
      currentAmmo: this.currentAmmo,
      reserveAmmo: this.reserveAmmo,
      clipSize: stats.clipSize,
    });
  }

  /**
   * Update timers. Call each frame.
   */
  update(_time: number, delta: number): void {
    // Update fire cooldown
    if (this.fireCooldown > 0) {
      this.fireCooldown -= delta;
      if (this.fireCooldown < 0) {
        this.fireCooldown = 0;
      }
    }

    // Update reload timer
    if (this.isReloading) {
      this.reloadTimer -= delta;
      if (this.reloadTimer <= 0) {
        this.completeReload();
      }
    }
  }

  /**
   * Add ammo to reserve. Returns amount actually added.
   */
  addReserveAmmo(amount: number): number {
    if (this.baseStats.unlimitedReserve) return 0;

    const space = this.baseStats.maxReserve - this.reserveAmmo;
    const added = Math.min(amount, space);
    this.reserveAmmo += added;

    EventBus.emit(GameEvents.AMMO_CHANGED, {
      weaponType: this.weaponType,
      currentAmmo: this.currentAmmo,
      reserveAmmo: this.reserveAmmo,
      clipSize: this.getStats().clipSize,
    });

    return added;
  }

  /**
   * Cancel an ongoing reload (e.g., when switching weapons).
   */
  cancelReload(): void {
    this.isReloading = false;
    this.reloadTimer = 0;
  }

  /**
   * Create muzzle flash visual at the firing point.
   */
  protected createMuzzleFlash(
    scene: Phaser.Scene,
    x: number,
    y: number,
    angle: number
  ): void {
    const flash = scene.add.sprite(x, y, 'muzzle-flash');
    flash.setRotation(angle);
    flash.setScale(0.5 + Math.random() * 0.3);
    flash.setAlpha(0.9);
    flash.setDepth(15);

    // Quick flash and destroy
    scene.tweens.add({
      targets: flash,
      alpha: 0,
      scaleX: flash.scaleX * 1.5,
      scaleY: flash.scaleY * 1.5,
      duration: 60,
      onComplete: () => {
        flash.destroy();
      },
    });
  }

  /**
   * Apply spread to a base angle. Returns angle with random offset.
   */
  protected applySpread(baseAngle: number, spread: number): number {
    return baseAngle + (Math.random() - 0.5) * spread;
  }

  /**
   * Abstract: subclasses must implement projectile creation.
   */
  protected abstract createProjectiles(
    scene: Phaser.Scene,
    x: number,
    y: number,
    angle: number,
    stats: WeaponStats,
    owner?: Phaser.GameObjects.Sprite
  ): void;
}
