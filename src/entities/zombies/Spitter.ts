import Phaser from 'phaser';
import { Zombie } from './Zombie';
import { ZombieType, ZombieState } from '../../types/ZombieTypes';
import { ZOMBIE_DATA } from '../../data/ZombieData';
import { EventBus } from '../../utils/EventBus';
import { GameEvents } from '../../types/EventTypes';

/**
 * Spitter -- the ranged zombie.
 *
 * Spitters keep their distance and lob AcidBlob projectiles at the
 * player. They are fragile in close combat and will attempt to flee
 * if the player closes within 100 px. This forces the player to
 * choose between pushing forward to eliminate the spitter or staying
 * behind cover and dealing with the acid rain.
 *
 * Behaviour:
 *   - Approaches to preferred range (~200 px) then stops.
 *   - Fires AcidBlob projectiles on attack cooldown.
 *   - Flees (backs away) if player comes within 100 px.
 *   - Very low HP -- drops fast if you can reach it.
 *   - Never targets barricades.
 */
export class Spitter extends Zombie {
  /** Ideal attack distance from target. */
  private static readonly PREFERRED_RANGE = 200;

  /** Distance at which the spitter panics and retreats. */
  private static readonly FLEE_RANGE = 100;

  /** Speed multiplier when fleeing. */
  private static readonly FLEE_SPEED_MULT = 1.4;

  /** Is the spitter currently retreating? */
  private _isFleeing: boolean = false;

  /** Tracks aiming wobble for projectile inaccuracy. */
  private _aimWobble: number = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'zombie-spitter');
  }

  // ----------------------------------------------------------------
  // Overrides
  // ----------------------------------------------------------------

  public getZombieType(): string {
    return ZombieType.SPITTER;
  }

  protected override onSpawn(): void {
    this._isFleeing = false;
    this._aimWobble = 0;

    this.setTexture('zombie-spitter');
    this.setTint(ZOMBIE_DATA[ZombieType.SPITTER].color);

    // Ranged attack range == preferred engagement distance
    this.attackRange = Spitter.PREFERRED_RANGE;
  }

  /**
   * Spitters ignore barricades -- they shoot over/around them.
   */
  protected override shouldTargetBarricade(
    _barricade: Phaser.GameObjects.Sprite,
  ): boolean {
    return false;
  }

  protected override onApproach(
    player: Phaser.GameObjects.Sprite,
    _time: number,
    delta: number,
    _barricades?: Phaser.GameObjects.Group,
  ): void {
    const distToPlayer = this.distanceTo(player);

    // --- Flee logic ---
    if (distToPlayer < Spitter.FLEE_RANGE) {
      this._isFleeing = true;
      // Run away from the player
      const fleeDir = this.x < player.x ? -1 : 1;
      this.facing = fleeDir;
      this.setFlipX(this.facing > 0);
      this.body.setVelocityX(
        fleeDir * this.getEffectiveSpeed() * Spitter.FLEE_SPEED_MULT,
      );
      return;
    }

    this._isFleeing = false;

    // --- Approach to preferred range, then stop and attack ---
    if (distToPlayer <= Spitter.PREFERRED_RANGE) {
      // In range: stop walking and transition to attacking
      this.body.setVelocityX(0);
      this.transitionTo(ZombieState.ATTACKING);
      return;
    }

    // Aim wobble for visual telegraphing
    this._aimWobble += delta * 0.003;
  }

  /**
   * Override attack: instead of melee, fire an AcidBlob projectile
   * toward the player.
   */
  protected override performAttack(): void {
    if (!this.target || !this.target.active) return;

    // Calculate angle toward target with slight inaccuracy
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const baseAngle = Math.atan2(dy, dx);
    const wobble = (Math.random() - 0.5) * 0.25; // +/- ~7 degrees
    const fireAngle = baseAngle + wobble;

    // Emit event for the projectile system to spawn an AcidBlob
    EventBus.emit(GameEvents.BULLET_FIRED, {
      x: this.x + this.facing * 10,
      y: this.y - 8,
      angle: fireAngle,
      speed: 180,
      damage: this.damage,
      type: 'acid',
      owner: this,
      piercing: false,
      knockback: 0,
    });

    // Visual: brief green flash on the spitter's "mouth"
    this.setTint(0x88ff44);
    this.scene.time.delayedCall(150, () => {
      if (this.isAlive()) {
        this.setTint(this.baseColor);
      }
    });
  }

  /**
   * Override attacking state: re-check distance each frame.
   * If the player closes in, flee. If they move out of range,
   * re-approach.
   */
  protected override onStateChanged(
    from: ZombieState,
    to: ZombieState,
  ): void {
    if (to === ZombieState.ATTACKING) {
      // Face the target while attacking
      if (this.target) {
        this.facing = this.target.x < this.x ? -1 : 1;
        this.setFlipX(this.facing > 0);
      }
    }
  }

  // ----------------------------------------------------------------
  // Animations
  // ----------------------------------------------------------------

  protected override playWalkAnim(): void {
    const key = 'zombie-spitter-walk';
    if (this.anims.exists(key) && this.anims.currentAnim?.key !== key) {
      this.play(key, true);
    }
  }

  protected override playAttackAnim(): void {
    const key = 'zombie-spitter-attack';
    if (this.anims.exists(key) && this.anims.currentAnim?.key !== key) {
      this.play(key, true);
    }
  }
}
