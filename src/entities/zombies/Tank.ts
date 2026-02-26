import Phaser from 'phaser';
import { Zombie } from './Zombie';
import { ZombieType, ZombieState } from '../../types/ZombieTypes';
import { ZOMBIE_DATA } from '../../data/ZombieData';
import { EventBus } from '../../utils/EventBus';
import { GameEvents } from '../../types/EventTypes';

/**
 * Tank -- the armored juggernaut zombie.
 *
 * Tanks are enormous, slow, and terrifyingly durable. They soak up
 * huge amounts of punishment, shrug off the first several hits thanks
 * to bone-plated armor, and tear through barricades in just two swings.
 *
 * Behaviour:
 *   - Very slow approach with heavy footstep screen shakes.
 *   - First 3 hits deal reduced damage (armor absorbs 70%).
 *   - Destroys barricades in 2 hits (damage is boosted vs barricades).
 *   - Larger sprite: 1.4x scale.
 *   - Brief rage roar animation when armor breaks.
 */
export class Tank extends Zombie {
  /** Number of hits absorbed by armor plating (counts down). */
  private _armorHitsRemaining: number = 3;

  /** How many barricade hits needed to destroy (visual tracking). */
  private static readonly BARRICADE_DAMAGE_MULTIPLIER = 3.0;

  /** Damage reduction while armor is active (70% absorbed). */
  private static readonly ARMOR_REDUCTION = 0.3;

  /** Number of armored hits before armor breaks. */
  private static readonly ARMOR_HIT_COUNT = 3;

  /** Timer for periodic ground shake while walking. */
  private _footstepTimer: number = 0;

  /** Interval between footstep shakes (ms). */
  private static readonly FOOTSTEP_SHAKE_INTERVAL = 800;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'zombie-tank');
  }

  // ----------------------------------------------------------------
  // Overrides
  // ----------------------------------------------------------------

  public getZombieType(): string {
    return ZombieType.TANK;
  }

  protected override onSpawn(): void {
    this._armorHitsRemaining = Tank.ARMOR_HIT_COUNT;
    this._footstepTimer = 0;

    this.setTexture('zombie-tank');
    this.setTint(ZOMBIE_DATA[ZombieType.TANK].color);

    // Larger sprite for intimidation
    this.setScale(1.4);

    // Wider attack range because of size
    this.attackRange = 44;
  }

  /**
   * Tank's armor absorbs the first N hits, reducing damage by 70%.
   * After armor breaks the zombie takes full damage and flashes red.
   */
  protected override modifyIncomingDamage(amount: number): number {
    if (this._armorHitsRemaining > 0) {
      this._armorHitsRemaining--;

      if (this._armorHitsRemaining === 0) {
        // Armor just broke -- visual feedback
        this.onArmorBreak();
      }

      // Only a fraction of damage gets through
      return Math.round(amount * Tank.ARMOR_REDUCTION);
    }

    return amount;
  }

  /**
   * When armor breaks: brief flash red, slight screen shake,
   * and remove the darkened tint to show exposed flesh.
   */
  private onArmorBreak(): void {
    // Flash red briefly
    this.setTint(0xff4444);
    this.scene.time.delayedCall(300, () => {
      if (this.isAlive()) {
        // Switch to a lighter, angrier tint
        this.setTint(0x5a3a3a);
      }
    });

    // Screen shake for dramatic effect
    EventBus.emit(GameEvents.SCREEN_SHAKE, {
      intensity: 3,
      duration: 200,
    });
  }

  /**
   * Tank does massive damage to barricades -- tears them apart in ~2 hits.
   */
  protected override performAttack(): void {
    if (!this.target || !this.target.active) return;

    if (this.targetIsBarricade) {
      // Boosted barricade damage
      const barricadeDmg = Math.round(
        this.damage * Tank.BARRICADE_DAMAGE_MULTIPLIER,
      );
      EventBus.emit(GameEvents.BARRICADE_DAMAGED, {
        barricade: this.target,
        damage: barricadeDmg,
        source: this,
      });

      // Ground slam visual: small screen shake on every barricade hit
      EventBus.emit(GameEvents.SCREEN_SHAKE, {
        intensity: 2,
        duration: 100,
      });
    } else {
      // Normal heavy damage to player
      EventBus.emit(GameEvents.PLAYER_DAMAGED, {
        damage: this.damage,
        source: this,
      });

      // Slight knockback on player hit
      EventBus.emit(GameEvents.SCREEN_SHAKE, {
        intensity: 4,
        duration: 150,
      });
    }
  }

  protected override onApproach(
    _player: Phaser.GameObjects.Sprite,
    _time: number,
    delta: number,
    _barricades?: Phaser.GameObjects.Group,
  ): void {
    // Periodic ground-shake footsteps while moving
    this._footstepTimer += delta;
    if (this._footstepTimer >= Tank.FOOTSTEP_SHAKE_INTERVAL) {
      this._footstepTimer = 0;
      EventBus.emit(GameEvents.SCREEN_SHAKE, {
        intensity: 1,
        duration: 60,
      });
    }
  }

  // ----------------------------------------------------------------
  // Animations
  // ----------------------------------------------------------------

  protected override playWalkAnim(): void {
    const key = 'zombie-tank-walk';
    if (this.anims.exists(key) && this.anims.currentAnim?.key !== key) {
      this.play(key, true);
    }
  }

  protected override playAttackAnim(): void {
    const key = 'zombie-tank-attack';
    if (this.anims.exists(key) && this.anims.currentAnim?.key !== key) {
      this.play(key, true);
    }
  }

  /**
   * Override knockback: Tank barely flinches. Reduce knockback force
   * significantly and shorten stun.
   */
  protected override applyKnockback(force: number = 50): void {
    // Tank is heavy -- minimal knockback
    super.applyKnockback(force * 0.3);
  }
}
