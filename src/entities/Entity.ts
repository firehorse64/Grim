import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { GameEvents } from '../types/EventTypes';

/**
 * Abstract base class for all game entities (player, zombies, NPCs).
 * Extends Phaser.Physics.Arcade.Sprite with a health system, damage
 * flash feedback, and EventBus integration for decoupled communication.
 */
export abstract class Entity extends Phaser.Physics.Arcade.Sprite {
  public hp: number;
  public maxHp: number;

  /** Timestamp of last damage flash start so we know when to clear it. */
  private _flashUntil: number = 0;

  /** Duration of the white flash in ms. */
  private static readonly FLASH_DURATION_MS = 120;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    frame?: string | number,
    maxHp: number = 100,
  ) {
    super(scene, x, y, texture, frame);

    this.maxHp = maxHp;
    this.hp = maxHp;

    // Add to scene and enable physics so sub-classes don't have to remember.
    scene.add.existing(this);
    scene.physics.add.existing(this);
  }

  // ------------------------------------------------------------------
  // Health API
  // ------------------------------------------------------------------

  /**
   * Reduce HP by `amount`. Triggers a brief white flash, emits a
   * damage event on the global EventBus, and calls `die()` when HP
   * reaches zero.
   */
  public takeDamage(amount: number): void {
    if (!this.isAlive()) return;

    this.hp = Math.max(0, this.hp - amount);

    // Visual flash feedback - tint white for a short period
    this.setTintFill(0xffffff);
    this._flashUntil = this.scene.time.now + Entity.FLASH_DURATION_MS;

    // Emit a generic damage event; listeners can inspect the entity
    EventBus.emit(GameEvents.HEALTH_CHANGED, {
      entity: this,
      hp: this.hp,
      maxHp: this.maxHp,
      amount: -amount,
    });

    if (this.hp <= 0) {
      this.die();
    }
  }

  /**
   * Restore HP, clamped to maxHp.
   */
  public heal(amount: number): void {
    if (!this.isAlive()) return;

    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    const healed = this.hp - before;

    if (healed > 0) {
      EventBus.emit(GameEvents.HEALTH_CHANGED, {
        entity: this,
        hp: this.hp,
        maxHp: this.maxHp,
        amount: healed,
      });
    }
  }

  /**
   * Kill this entity: play death handling, emit event, then deactivate
   * and hide so the object pool can recycle it.
   */
  public die(): void {
    this.hp = 0;

    // Clear any visual effects
    this.clearTint();
    this.setAlpha(1);

    this.onDeath();

    this.setActive(false);
    this.setVisible(false);
    this.body?.enable && ((this.body as Phaser.Physics.Arcade.Body).enable = false);
  }

  /**
   * Override in sub-classes to perform death-specific logic
   * (play animation, drop loot, emit specific events, etc.).
   */
  protected onDeath(): void {
    // Default: no-op. Subclasses should override.
  }

  /**
   * Returns true when the entity is alive (active, visible, hp > 0).
   */
  public isAlive(): boolean {
    return this.active && this.hp > 0;
  }

  // ------------------------------------------------------------------
  // Per-frame bookkeeping
  // ------------------------------------------------------------------

  /**
   * Call from subclass update() to handle clearing the damage flash.
   */
  protected updateFlash(time: number): void {
    if (this._flashUntil > 0 && time >= this._flashUntil) {
      this.clearTint();
      this._flashUntil = 0;
    }
  }
}
