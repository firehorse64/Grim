import Phaser from 'phaser';
import { Direction, WeaponType } from '../types/GameTypes';
import { InventoryManager } from './InventoryManager';
import { EventBus } from '../utils/EventBus';
import {
  RIFLE_DAMAGE,
  RIFLE_FIRE_RATE_MS,
  RIFLE_RANGE,
  MELEE_DAMAGE,
  MELEE_RANGE,
  MELEE_COOLDOWN_MS,
  BULLET_SPEED,
} from '../data/BalanceConstants';

interface Bullet {
  sprite: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  life: number; // ms remaining
}

/**
 * Manages weapons, attacks, and projectiles.
 */
export class CombatManager {
  private scene!: Phaser.Scene;
  private inventory!: InventoryManager;

  public currentWeapon: WeaponType = WeaponType.RIFLE;
  private attackCooldown: number = 0;
  private bullets: Bullet[] = [];

  public create(scene: Phaser.Scene, inventory: InventoryManager): void {
    this.scene = scene;
    this.inventory = inventory;
    this.bullets = [];
    this.attackCooldown = 0;
  }

  /** Switch between rifle and melee. */
  public switchWeapon(): void {
    this.currentWeapon = this.currentWeapon === WeaponType.RIFLE
      ? WeaponType.MELEE
      : WeaponType.RIFLE;
    EventBus.emit('combat:weapon-switched', this.currentWeapon);
  }

  /** Attack in a direction. Returns true if attack was performed. */
  public attack(x: number, y: number, facing: Direction): boolean {
    if (this.attackCooldown > 0) return false;

    if (this.currentWeapon === WeaponType.RIFLE) {
      return this.fireRifle(x, y, facing);
    } else {
      return this.meleeAttack(x, y, facing);
    }
  }

  private fireRifle(x: number, y: number, facing: Direction): boolean {
    if (!this.inventory.useAmmo()) {
      EventBus.emit('combat:no-ammo');
      return false;
    }

    this.attackCooldown = RIFLE_FIRE_RATE_MS;

    const dir = this.dirToVec(facing);
    const bullet = this.scene.add.image(
      x + dir.x * 12,
      y + dir.y * 12,
      'bullet',
    );
    bullet.setDepth(20);
    bullet.setDisplaySize(4, 4);

    this.bullets.push({
      sprite: bullet,
      vx: dir.x * BULLET_SPEED,
      vy: dir.y * BULLET_SPEED,
      life: (RIFLE_RANGE / BULLET_SPEED) * 1000,
    });

    // Muzzle flash
    const flash = this.scene.add.image(x + dir.x * 14, y + dir.y * 14, 'muzzle-flash');
    flash.setDepth(21);
    flash.setDisplaySize(8, 8);
    flash.setAlpha(0.8);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 0.5,
      duration: 100,
      onComplete: () => flash.destroy(),
    });

    EventBus.emit('combat:fired');
    return true;
  }

  private meleeAttack(x: number, y: number, facing: Direction): boolean {
    this.attackCooldown = MELEE_COOLDOWN_MS;

    const dir = this.dirToVec(facing);

    // Visual swing effect
    const swing = this.scene.add.image(x + dir.x * 20, y + dir.y * 20, 'pixel');
    swing.setDisplaySize(16, 4);
    swing.setTint(0xcccccc);
    swing.setDepth(20);
    swing.setRotation(Math.atan2(dir.y, dir.x));
    this.scene.tweens.add({
      targets: swing,
      alpha: 0,
      duration: 200,
      onComplete: () => swing.destroy(),
    });

    EventBus.emit('combat:melee', { x: x + dir.x * MELEE_RANGE / 2, y: y + dir.y * MELEE_RANGE / 2 });
    return true;
  }

  /** Update cooldowns and move bullets. Call each frame. */
  public update(delta: number): void {
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);

    // Move bullets
    const dt = delta / 1000;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= delta;
      if (b.life <= 0) {
        b.sprite.destroy();
        this.bullets.splice(i, 1);
        continue;
      }
      b.sprite.x += b.vx * dt;
      b.sprite.y += b.vy * dt;
    }
  }

  /** Check bullet collisions with zombies. Returns zombies hit with damage. */
  public checkBulletHits(zombies: { x: number; y: number; isAlive: () => boolean }[]): { zombie: typeof zombies[0]; damage: number }[] {
    const hits: { zombie: typeof zombies[0]; damage: number }[] = [];

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      for (const z of zombies) {
        if (!z.isAlive()) continue;
        const dx = b.sprite.x - z.x;
        const dy = b.sprite.y - z.y;
        if (dx * dx + dy * dy < 256) { // 16px radius
          hits.push({ zombie: z, damage: RIFLE_DAMAGE });
          b.sprite.destroy();
          this.bullets.splice(i, 1);
          break;
        }
      }
    }

    return hits;
  }

  /** Check melee range hits. Call after a melee attack. */
  public checkMeleeHits(
    px: number, py: number, facing: Direction,
    zombies: { x: number; y: number; isAlive: () => boolean }[],
  ): { zombie: typeof zombies[0]; damage: number }[] {
    const dir = this.dirToVec(facing);
    const hits: { zombie: typeof zombies[0]; damage: number }[] = [];

    for (const z of zombies) {
      if (!z.isAlive()) continue;
      const dx = z.x - px;
      const dy = z.y - py;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > MELEE_RANGE) continue;

      // Check if zombie is roughly in facing direction
      const dot = (dx * dir.x + dy * dir.y) / (dist || 1);
      if (dot > 0.3) {
        hits.push({ zombie: z, damage: MELEE_DAMAGE });
      }
    }

    return hits;
  }

  /** Cleanup all bullets. */
  public cleanup(): void {
    for (const b of this.bullets) {
      b.sprite.destroy();
    }
    this.bullets = [];
  }

  private dirToVec(dir: Direction): { x: number; y: number } {
    switch (dir) {
      case Direction.UP: return { x: 0, y: -1 };
      case Direction.DOWN: return { x: 0, y: 1 };
      case Direction.LEFT: return { x: -1, y: 0 };
      case Direction.RIGHT: return { x: 1, y: 0 };
    }
  }
}
