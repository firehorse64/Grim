import Phaser from 'phaser';
import { Zombie } from './Zombie';
import { ZombieType, ZombieState } from '../../types/ZombieTypes';
import { ZOMBIE_DATA } from '../../data/ZombieData';

/**
 * Crawler -- the low-profile ambush zombie.
 *
 * Crawlers drag themselves along the floor with a much shorter hitbox
 * than upright zombies. They can slide *under* barricades, ignoring
 * obstacles entirely, making them the perfect complement to a wave
 * that also contains walkers or tanks. They are harder to hit because
 * the player must aim lower.
 *
 * Behaviour:
 *   - Short hitbox (height ~20 px vs 48 px for a walker).
 *   - Passes under all barricades -- never targets them.
 *   - Moderate speed, slightly faster than a walker.
 *   - Erratic side-to-side wobble while crawling.
 *   - Attack from the floor -- bites ankles.
 */
export class Crawler extends Zombie {
  /** Wobble timer for lateral sway while crawling. */
  private _wobbleTimer: number = 0;
  private _wobblePhase: number = 0;

  /** Occasional random speed burst to feel unpredictable. */
  private _burstTimer: number = 0;
  private _isBursting: boolean = false;

  /** Duration of a speed burst (ms). */
  private static readonly BURST_DURATION_MS = 400;

  /** Interval between potential bursts (ms). */
  private static readonly BURST_INTERVAL_MS = 3000;

  /** Speed multiplier during a burst. */
  private static readonly BURST_SPEED_MULT = 1.6;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'zombie-crawler');
  }

  // ----------------------------------------------------------------
  // Overrides
  // ----------------------------------------------------------------

  public getZombieType(): string {
    return ZombieType.CRAWLER;
  }

  protected override onSpawn(): void {
    this._wobbleTimer = 0;
    this._wobblePhase = Math.random() * Math.PI * 2;
    this._burstTimer = 0;
    this._isBursting = false;

    this.setTexture('zombie-crawler');
    this.setTint(ZOMBIE_DATA[ZombieType.CRAWLER].color);

    // Crawlers hug the ground -- shorter hitbox, positioned at feet
    // The body size is already set from stats in spawn(), but we
    // visually squash the sprite to look like it's on the ground.
    this.setScale(1, 0.5);

    // Lower attack range -- has to be right on top of the player
    this.attackRange = 24;
  }

  /**
   * Crawlers slide under barricades -- never target them.
   */
  protected override shouldTargetBarricade(
    _barricade: Phaser.GameObjects.Sprite,
  ): boolean {
    return false;
  }

  protected override onApproach(
    _player: Phaser.GameObjects.Sprite,
    _time: number,
    delta: number,
    _barricades?: Phaser.GameObjects.Group,
  ): void {
    const deltaS = delta * 0.001;

    // --- Lateral wobble for creepy crawling ---
    this._wobbleTimer += deltaS;
    const wobble =
      Math.sin(this._wobbleTimer * 5 + this._wobblePhase) * 8;
    // Apply a small vertical velocity nudge for visual wobble
    // (won't actually move much due to gravity, but adds life)
    if (this.body.blocked.down) {
      this.body.setVelocityY(wobble);
    }

    // --- Random speed bursts ---
    this._burstTimer += delta;
    if (!this._isBursting && this._burstTimer >= Crawler.BURST_INTERVAL_MS) {
      // Random chance to burst
      if (Math.random() < 0.4) {
        this._isBursting = true;
        this._burstTimer = 0;
      } else {
        this._burstTimer = 0;
      }
    }

    if (this._isBursting) {
      this.speed =
        ZOMBIE_DATA[ZombieType.CRAWLER].speed * Crawler.BURST_SPEED_MULT;
      if (this._burstTimer >= Crawler.BURST_DURATION_MS) {
        this._isBursting = false;
        this._burstTimer = 0;
        this.speed = ZOMBIE_DATA[ZombieType.CRAWLER].speed;
      }
    }
  }

  // ----------------------------------------------------------------
  // Animations
  // ----------------------------------------------------------------

  protected override playWalkAnim(): void {
    const key = 'zombie-crawler-walk';
    if (this.anims.exists(key) && this.anims.currentAnim?.key !== key) {
      this.play(key, true);
    }
  }

  protected override playAttackAnim(): void {
    const key = 'zombie-crawler-attack';
    if (this.anims.exists(key) && this.anims.currentAnim?.key !== key) {
      this.play(key, true);
    }
  }

  /**
   * Crawlers are harder to knock back -- they're low to the ground.
   * Reduced vertical knockback.
   */
  protected override applyKnockback(force: number = 100): void {
    this.body.setVelocityX(-this.facing * force * 0.6);
    // Minimal vertical knockback -- they're already on the floor
    this.body.setVelocityY(-force * 0.1);

    const stunEnd = this.scene.time.now + 180;
    (this as any)._stunEndTime = stunEnd;
    this.transitionTo(ZombieState.STUNNED);
  }
}
