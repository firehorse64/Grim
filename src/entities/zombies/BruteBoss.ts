import Phaser from 'phaser';
import { BossZombie } from './BossZombie';
import { BossType, ZombieState } from '../../types/ZombieTypes';
import { BOSS_DATA } from '../../data/ZombieData';
import { EventBus } from '../../utils/EventBus';
import { GameEvents } from '../../types/EventTypes';

/**
 * Brute Boss -- the melee powerhouse.
 *
 * A massive, hulking zombie that lumbers toward the player and
 * delivers devastating blows. When its HP drops below 50% it
 * enters Phase 2 and gains a **charge attack**: a high-speed
 * dash across the train car that deals heavy damage and sends
 * the player flying.
 *
 * Phase 1:  Normal approach + heavy melee attacks.
 * Phase 2:  Enraged -- gains red tint, increased speed, and
 *           periodically performs charge attacks.
 */
export class BruteBoss extends BossZombie {
  // ----------------------------------------------------------------
  // Charge attack
  // ----------------------------------------------------------------

  /** Is the boss currently mid-charge? */
  private _isCharging: boolean = false;

  /** Timestamp when the current charge started. */
  private _chargeStartTime: number = 0;

  /** Duration of a single charge dash (ms). */
  private static readonly CHARGE_DURATION_MS = 700;

  /** Speed during the charge (pixels / sec). */
  private static readonly CHARGE_SPEED = 350;

  /** Damage dealt by the charge impact. */
  private static readonly CHARGE_DAMAGE = 60;

  /** Cooldown between charges (ms). */
  private static readonly CHARGE_COOLDOWN_MS = 5000;

  /** Timestamp of last charge completion. */
  private _lastChargeTime: number = 0;

  /** Wind-up pause before the charge launches (ms). */
  private static readonly CHARGE_WINDUP_MS = 600;

  /** Is the boss in the wind-up phase? */
  private _isWindingUp: boolean = false;
  private _windupEndTime: number = 0;

  /** Whether the boss is enraged (phase 2). */
  private _enraged: boolean = false;

  /** The base speed before enrage. */
  private _baseSpeed: number = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'boss-brute');
  }

  // ----------------------------------------------------------------
  // Overrides
  // ----------------------------------------------------------------

  public getZombieType(): string {
    return BossType.BRUTE;
  }

  protected override onBossSpawn(): void {
    this.setTexture('boss-brute');
    this.setTint(BOSS_DATA[BossType.BRUTE].color);

    // Phase thresholds: phase 2 triggers at 50% HP
    this.phaseThresholds = [1.0, 0.5];

    this._isCharging = false;
    this._isWindingUp = false;
    this._lastChargeTime = 0;
    this._enraged = false;
    this._baseSpeed = this.speed;

    // Larger scale for the brute
    this.setScale(1.8);
    this.attackRange = 52;
  }

  // ----------------------------------------------------------------
  // Phase transitions
  // ----------------------------------------------------------------

  protected onPhaseChange(oldPhase: number, newPhase: number): void {
    if (newPhase === 2 && !this._enraged) {
      this.enterEnrage();
    }
  }

  private enterEnrage(): void {
    this._enraged = true;

    // Visual: red tint pulsing
    this.setTint(0xff3333);

    // Speed boost
    this.speed = this._baseSpeed * 1.35;

    // Screen shake for the roar
    EventBus.emit(GameEvents.SCREEN_SHAKE, {
      intensity: 5,
      duration: 400,
    });

    // Flash screen red
    EventBus.emit(GameEvents.SCREEN_FLASH, {
      color: 0xff0000,
      duration: 200,
    });

    // Brief pause during the roar
    this.body.setVelocityX(0);
    this.scene.time.delayedCall(500, () => {
      // Resume AI after roar
      if (this.isAlive()) {
        this.transitionTo(ZombieState.APPROACHING);
      }
    });
  }

  // ----------------------------------------------------------------
  // AI hooks
  // ----------------------------------------------------------------

  protected override onApproach(
    player: Phaser.GameObjects.Sprite,
    time: number,
    delta: number,
    _barricades?: Phaser.GameObjects.Group,
  ): void {
    // --- Wind-up phase ---
    if (this._isWindingUp) {
      this.body.setVelocityX(0);
      if (time >= this._windupEndTime) {
        this.launchCharge(player, time);
      }
      return;
    }

    // --- Active charge ---
    if (this._isCharging) {
      this.updateCharge(player, time);
      return;
    }

    // --- Phase 2: check if we should start a charge ---
    if (this._enraged) {
      const dist = this.distanceTo(player);
      const canCharge =
        time - this._lastChargeTime >= BruteBoss.CHARGE_COOLDOWN_MS;

      // Charge when player is between 120 and 350 px away
      if (canCharge && dist > 120 && dist < 350) {
        this.startChargeWindup(time);
        return;
      }

      // Enraged tint pulse
      const pulse = Math.sin(time * 0.006) * 0.15 + 0.85;
      this.setAlpha(pulse);
    }
  }

  // ----------------------------------------------------------------
  // Charge attack
  // ----------------------------------------------------------------

  private startChargeWindup(time: number): void {
    this._isWindingUp = true;
    this._windupEndTime = time + BruteBoss.CHARGE_WINDUP_MS;

    // Visual telegraph: crouch / flash red
    this.setTint(0xff0000);
    this.setScale(1.8, 1.5); // Slightly squish to telegraph

    // Stop moving during windup
    this.body.setVelocityX(0);
  }

  private launchCharge(
    player: Phaser.GameObjects.Sprite,
    time: number,
  ): void {
    this._isWindingUp = false;
    this._isCharging = true;
    this._chargeStartTime = time;

    // Restore scale
    this.setScale(1.8);

    // Determine charge direction toward player
    this.facing = player.x < this.x ? -1 : 1;
    this.setFlipX(this.facing > 0);

    // Lunge with high horizontal speed
    this.body.setVelocityX(this.facing * BruteBoss.CHARGE_SPEED);
    this.body.setVelocityY(-80); // Slight upward for visual weight

    // Screen shake during charge
    EventBus.emit(GameEvents.SCREEN_SHAKE, {
      intensity: 3,
      duration: BruteBoss.CHARGE_DURATION_MS,
    });
  }

  private updateCharge(
    player: Phaser.GameObjects.Sprite,
    time: number,
  ): void {
    // Maintain charge velocity
    this.body.setVelocityX(this.facing * BruteBoss.CHARGE_SPEED);

    // Check collision with player during charge
    const dist = this.distanceTo(player);
    if (dist < 50) {
      this.onChargeHitPlayer(player);
    }

    // Check if charge duration expired or we hit a wall
    const elapsed = time - this._chargeStartTime;
    if (
      elapsed >= BruteBoss.CHARGE_DURATION_MS ||
      this.body.blocked.left ||
      this.body.blocked.right
    ) {
      this.endCharge(time);
    }
  }

  private onChargeHitPlayer(player: Phaser.GameObjects.Sprite): void {
    // Deal charge damage
    EventBus.emit(GameEvents.PLAYER_DAMAGED, {
      damage: BruteBoss.CHARGE_DAMAGE,
      source: this,
      isCharge: true,
    });

    // Heavy screen shake on impact
    EventBus.emit(GameEvents.SCREEN_SHAKE, {
      intensity: 7,
      duration: 300,
    });

    // End the charge on hit
    this.endCharge(this.scene.time.now);
  }

  private endCharge(time: number): void {
    this._isCharging = false;
    this._lastChargeTime = time;

    // Skid to a stop
    this.body.setVelocityX(0);

    // Brief recovery pause before resuming AI
    this.scene.time.delayedCall(400, () => {
      if (this.isAlive()) {
        this.setTint(this._enraged ? 0xff3333 : BOSS_DATA[BossType.BRUTE].color);
        this.transitionTo(ZombieState.APPROACHING);
      }
    });
  }

  // ----------------------------------------------------------------
  // Heavy melee attack override
  // ----------------------------------------------------------------

  protected override performAttack(): void {
    if (!this.target || !this.target.active) return;

    if (this.targetIsBarricade) {
      // Brute smashes barricades hard
      EventBus.emit(GameEvents.BARRICADE_DAMAGED, {
        barricade: this.target,
        damage: this.damage * 2,
        source: this,
      });
      EventBus.emit(GameEvents.SCREEN_SHAKE, {
        intensity: 3,
        duration: 120,
      });
    } else {
      // Heavy player hit
      EventBus.emit(GameEvents.PLAYER_DAMAGED, {
        damage: this.damage,
        source: this,
      });
      EventBus.emit(GameEvents.SCREEN_SHAKE, {
        intensity: 4,
        duration: 150,
      });
    }
  }

  // ----------------------------------------------------------------
  // Animations
  // ----------------------------------------------------------------

  protected override playWalkAnim(): void {
    const key = 'boss-brute-walk';
    if (this.anims.exists(key) && this.anims.currentAnim?.key !== key) {
      this.play(key, true);
    }
  }

  protected override playAttackAnim(): void {
    const key = this._isCharging ? 'boss-brute-charge' : 'boss-brute-attack';
    if (this.anims.exists(key) && this.anims.currentAnim?.key !== key) {
      this.play(key, true);
    }
  }
}
