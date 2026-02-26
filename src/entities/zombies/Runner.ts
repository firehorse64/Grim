import Phaser from 'phaser';
import { Zombie } from './Zombie';
import { ZombieType, ZombieState } from '../../types/ZombieTypes';
import { ZOMBIE_DATA } from '../../data/ZombieData';

/**
 * Runner -- the fast, terrifying zombie.
 *
 * Runners sprint at roughly 2x walker speed, close gaps quickly, and
 * can *leap* over barricades. They have substantially less HP so a
 * well-aimed shot drops them, but a missed runner will be on the
 * player before they can reload.
 *
 * Behaviour:
 *   - APPROACHING at high speed with slight erratic jitter.
 *   - When a barricade is within 80 px, trigger a leap arc that
 *     carries the runner over the obstacle.
 *   - Never targets barricades -- always goes for the player.
 *   - Brief pause on landing after a leap.
 */
export class Runner extends Zombie {
  /** Is the runner currently mid-leap over a barricade? */
  private _isLeaping: boolean = false;

  /** Y position before the leap started (to detect landing). */
  private _leapOriginY: number = 0;

  /** Cooldown so the runner doesn't leap repeatedly. */
  private _leapCooldownUntil: number = 0;

  /** Erratic jitter timer for zig-zag feel. */
  private _jitterTimer: number = 0;
  private _jitterOffset: number = 0;

  /** Distance at which runner triggers a leap. */
  private static readonly LEAP_TRIGGER_DIST = 80;

  /** Vertical impulse for the leap. */
  private static readonly LEAP_VELOCITY_Y = -350;

  /** Horizontal boost during the leap. */
  private static readonly LEAP_VELOCITY_X_BOOST = 1.6;

  /** Cooldown between leaps (ms). */
  private static readonly LEAP_COOLDOWN_MS = 2000;

  /** Landing pause duration (ms). */
  private static readonly LAND_PAUSE_MS = 200;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'zombie-runner');
  }

  // ----------------------------------------------------------------
  // Overrides
  // ----------------------------------------------------------------

  public getZombieType(): string {
    return ZombieType.RUNNER;
  }

  protected override onSpawn(): void {
    this._isLeaping = false;
    this._leapCooldownUntil = 0;
    this._jitterTimer = 0;
    this._jitterOffset = Math.random() * Math.PI * 2;

    this.setTexture('zombie-runner');
    this.setTint(ZOMBIE_DATA[ZombieType.RUNNER].color);

    // Runners have a slightly smaller attack range -- they claw quickly
    this.attackRange = 28;
  }

  /**
   * Runners skip barricades -- they leap over them.
   */
  protected override shouldTargetBarricade(
    _barricade: Phaser.GameObjects.Sprite,
  ): boolean {
    return false;
  }

  protected override onApproach(
    player: Phaser.GameObjects.Sprite,
    time: number,
    delta: number,
    barricades?: Phaser.GameObjects.Group,
  ): void {
    // --- Erratic movement jitter ---
    this._jitterTimer += delta * 0.001;
    const jitter =
      Math.sin(this._jitterTimer * 6 + this._jitterOffset) * 0.2;
    // Temporarily modify speed for this frame
    this.speed =
      ZOMBIE_DATA[ZombieType.RUNNER].speed * (1 + jitter);

    // --- Leap detection ---
    if (this._isLeaping) {
      this.handleLeapInProgress(time);
      return;
    }

    if (barricades && time > this._leapCooldownUntil) {
      const children =
        barricades.getChildren() as Phaser.GameObjects.Sprite[];
      for (const b of children) {
        if (!b.active) continue;
        const dist = Math.abs(b.x - this.x);
        // Barricade is ahead and within leap trigger distance
        const isAhead =
          (this.facing < 0 && b.x < this.x) ||
          (this.facing > 0 && b.x > this.x);
        if (isAhead && dist < Runner.LEAP_TRIGGER_DIST) {
          this.startLeap(time);
          return;
        }
      }
    }
  }

  // ----------------------------------------------------------------
  // Leap mechanic
  // ----------------------------------------------------------------

  private startLeap(time: number): void {
    this._isLeaping = true;
    this._leapOriginY = this.y;
    this._leapCooldownUntil = time + Runner.LEAP_COOLDOWN_MS;

    // Jump arc: strong upward + boosted horizontal
    this.body.setVelocityY(Runner.LEAP_VELOCITY_Y);
    this.body.setVelocityX(
      this.facing * this.getEffectiveSpeed() * Runner.LEAP_VELOCITY_X_BOOST,
    );
  }

  private handleLeapInProgress(time: number): void {
    // Override body velocity to maintain horizontal momentum
    this.body.setVelocityX(
      this.facing * this.getEffectiveSpeed() * Runner.LEAP_VELOCITY_X_BOOST,
    );

    // Detect landing: when body is on the ground again
    if (this.body.blocked.down || this.body.touching.down) {
      this._isLeaping = false;

      // Brief landing stagger
      this.body.setVelocityX(0);
      this.scene.time.delayedCall(Runner.LAND_PAUSE_MS, () => {
        // Resume approaching after the short pause
        if (this.isAlive() && this.state === ZombieState.APPROACHING) {
          // Speed is re-applied next frame automatically
        }
      });
    }
  }

  // ----------------------------------------------------------------
  // Animations
  // ----------------------------------------------------------------

  protected override playWalkAnim(): void {
    const key = 'zombie-runner-walk';
    if (this.anims.exists(key) && this.anims.currentAnim?.key !== key) {
      this.play(key, true);
    }
  }

  protected override playAttackAnim(): void {
    const key = 'zombie-runner-attack';
    if (this.anims.exists(key) && this.anims.currentAnim?.key !== key) {
      this.play(key, true);
    }
  }
}
