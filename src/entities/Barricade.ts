import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { GameEvents } from '../types/EventTypes';
import {
  BARRICADE_WOOD_HP,
  BARRICADE_METAL_HP,
  BARRICADE_ELECTRIC_HP,
  BARRICADE_ELECTRIC_DAMAGE,
} from '../data/BalanceConstants';

/** Supported barricade material types. */
export type BarricadeType = 'wood' | 'metal' | 'electric';

/** Lookup from material type to base HP. */
const BARRICADE_HP_MAP: Record<BarricadeType, number> = {
  wood: BARRICADE_WOOD_HP,
  metal: BARRICADE_METAL_HP,
  electric: BARRICADE_ELECTRIC_HP,
};

/** Lookup from material type to texture key. */
const BARRICADE_TEXTURE_MAP: Record<BarricadeType, string> = {
  wood: 'barricade-wood',
  metal: 'barricade-metal',
  electric: 'barricade-electric',
};

/**
 * A Barricade is a player-placed defensive obstacle that blocks zombie
 * movement. Zombies attack it to reduce its HP; when HP reaches zero the
 * barricade is destroyed and removed from play.
 *
 * The electric variant additionally deals `BARRICADE_ELECTRIC_DAMAGE` to
 * any zombie that makes contact (handled via CollisionManager).
 *
 * Barricades are pooled objects -- they are recycled via `setActive(false)`
 * rather than destroyed, so the same instances can be re-placed later.
 */
export class Barricade extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;

  // ── Properties ───────────────────────────────────────────────────────
  public barricadeHp: number = 0;
  public maxBarricadeHp: number = 0;
  public barricadeType: BarricadeType = 'wood';

  /** Index of the barricade slot this barricade occupies (per-car). */
  public slotIndex: number = -1;

  /** Flash timer reference so we can cancel if needed. */
  private flashEvent: Phaser.Time.TimerEvent | null = null;

  // ── Constructor ──────────────────────────────────────────────────────

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'barricade-wood');

    scene.add.existing(this);
    scene.physics.add.existing(this);

    // Start inactive -- will be activated when placed.
    this.setActive(false);
    this.setVisible(false);

    // Make the body immovable so zombies collide with it but cannot
    // push it around.
    this.body.setImmovable(true);
    this.body.setAllowGravity(false);
    this.body.moves = false;
    this.body.enable = false;
  }

  // ── Public API ───────────────────────────────────────────────────────

  /**
   * Set up (or re-use) this barricade at the given world position and
   * material type. Resets HP, texture, and physics body.
   */
  public place(x: number, y: number, type: BarricadeType, slotIndex: number = -1): void {
    this.barricadeType = type;
    this.slotIndex = slotIndex;

    // HP
    this.maxBarricadeHp = BARRICADE_HP_MAP[type];
    this.barricadeHp = this.maxBarricadeHp;

    // Texture
    this.draw();

    // Position & activate
    this.setPosition(x, y);
    this.setActive(true);
    this.setVisible(true);
    this.setAlpha(1);
    this.clearTint();

    // Physics body
    this.body.enable = true;
    this.body.setImmovable(true);
    this.body.setAllowGravity(false);
    this.body.moves = false;

    EventBus.emit(GameEvents.BARRICADE_PLACED, {
      type,
      x,
      y,
      slotIndex,
    });
  }

  /**
   * Inflict damage on the barricade. Triggers a brief red flash for
   * visual feedback. If HP drops to zero the barricade is destroyed.
   */
  public takeDamage(amount: number): void {
    if (!this.active || this.barricadeHp <= 0) return;

    this.barricadeHp = Math.max(0, this.barricadeHp - amount);

    // Visual flash (brief red tint).
    this.setTintFill(0xff4444);
    if (this.flashEvent) {
      this.flashEvent.destroy();
    }
    this.flashEvent = this.scene.time.delayedCall(100, () => {
      if (this.active) {
        this.clearTint();
        // Tint slightly based on remaining HP to show wear.
        this.updateWearTint();
      }
      this.flashEvent = null;
    });

    EventBus.emit(GameEvents.BARRICADE_DAMAGED, {
      barricade: this,
      hp: this.barricadeHp,
      maxHp: this.maxBarricadeHp,
      amount,
      slotIndex: this.slotIndex,
    });

    if (this.barricadeHp <= 0) {
      this.destroyBarricade();
    }
  }

  /**
   * Returns the electric contact damage value (0 for non-electric types).
   * Convenience accessor so external systems don't need to import the
   * constant and check the type themselves.
   */
  public getElectricDamage(): number {
    return this.barricadeType === 'electric' ? BARRICADE_ELECTRIC_DAMAGE : 0;
  }

  /**
   * Returns true when the barricade is placed and has remaining HP.
   */
  public isIntact(): boolean {
    return this.active && this.barricadeHp > 0;
  }

  // ── Drawing ──────────────────────────────────────────────────────────

  /**
   * Set the texture based on the current barricade type. If the keyed
   * texture is not yet loaded we fall back to a tinted placeholder
   * rectangle approach (the sprite keeps its current texture but gets a
   * representative tint).
   */
  public draw(): void {
    const textureKey = BARRICADE_TEXTURE_MAP[this.barricadeType];

    if (this.scene.textures.exists(textureKey)) {
      this.setTexture(textureKey);
    } else {
      // Fallback: keep whatever texture is set, but apply a tint so the
      // player can still differentiate types visually.
      switch (this.barricadeType) {
        case 'wood':
          this.setTint(0x8B5A2B);
          break;
        case 'metal':
          this.setTint(0x888888);
          break;
        case 'electric':
          this.setTint(0x44AAFF);
          break;
      }
    }
  }

  // ── Internal ─────────────────────────────────────────────────────────

  /**
   * Destroy the barricade: emit event, play a brief fade, then
   * deactivate so the pool can recycle it.
   */
  private destroyBarricade(): void {
    this.barricadeHp = 0;

    EventBus.emit(GameEvents.BARRICADE_DESTROYED, {
      type: this.barricadeType,
      x: this.x,
      y: this.y,
      slotIndex: this.slotIndex,
    });

    // Quick destruction tween then deactivate.
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      scaleY: 0.3,
      duration: 250,
      ease: 'Power2',
      onComplete: () => {
        this.setActive(false);
        this.setVisible(false);
        this.body.enable = false;
        this.setScale(1);
        this.setAlpha(1);
        this.clearTint();
      },
    });
  }

  /**
   * Apply a subtle tint to indicate accumulated damage. The lower the HP
   * ratio the darker/redder the barricade appears.
   */
  private updateWearTint(): void {
    if (this.barricadeHp <= 0) return;

    const ratio = this.barricadeHp / this.maxBarricadeHp;

    if (ratio < 0.25) {
      // Critical: deep red tint.
      this.setTint(0xff6666);
    } else if (ratio < 0.5) {
      // Damaged: orange tint.
      this.setTint(0xffaa66);
    } else if (ratio < 0.75) {
      // Worn: slight yellow.
      this.setTint(0xffdd88);
    } else {
      // Healthy: clear any wear tint, re-apply type tint via draw().
      this.draw();
    }
  }
}
