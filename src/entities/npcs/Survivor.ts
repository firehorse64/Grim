import Phaser from 'phaser';
import { Entity } from '../Entity';
import { EventBus } from '../../utils/EventBus';
import { GameEvents } from '../../types/EventTypes';
import { SURVIVOR_RESCUE_BONUS, GAME_HEIGHT } from '../../data/BalanceConstants';
import { distance } from '../../utils/MathUtils';

// ─────────────────────────────────────────────────────────────────────────────
// Survivor states
// ─────────────────────────────────────────────────────────────────────────────

export enum SurvivorState {
  TRAPPED = 'trapped',
  FOLLOWING = 'following',
  RESCUED = 'rescued',
  DEAD = 'dead',
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const SURVIVOR_HP = 50;
const FOLLOW_OFFSET_X = -40;     // Walk behind the player
const FOLLOW_OFFSET_Y = 0;
const FOLLOW_SPEED = 170;        // Slightly slower than player
const FOLLOW_MIN_DIST = 30;      // Stop when this close to target
const INTERACTION_RANGE = 60;    // How close player must be to interact
const DETECTION_RANGE = 120;     // Range at which SURVIVOR_FOUND fires
const ZOMBIE_FLEE_RANGE = 80;    // Distance at which survivor flees zombies
const ZOMBIE_FLEE_FORCE = 100;   // Flee velocity boost

// Wave animation for TRAPPED state
const WAVE_ANIM_SPEED = 0.004;   // Radians per ms for arm-wave bob
const WAVE_BOB_AMOUNT = 3;       // Pixels of vertical bob

// ─────────────────────────────────────────────────────────────────────────────
// Survivor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A rescuable NPC entity found at train stations. The survivor progresses
 * through three states:
 *
 * 1. **TRAPPED** -- Standing still on a platform, waving for help. When the
 *    player gets within DETECTION_RANGE, emits SURVIVOR_FOUND.
 * 2. **FOLLOWING** -- After the player presses E within INTERACTION_RANGE,
 *    the survivor follows the player around the train, staying behind them
 *    and fleeing from nearby zombies.
 * 3. **RESCUED** -- When escorted to a designated safe car, awards
 *    SURVIVOR_RESCUE_BONUS currency and emits SURVIVOR_RESCUED.
 *
 * If the survivor's HP reaches zero, emits SURVIVOR_DIED.
 */
export class Survivor extends Entity {
  public survivorState: SurvivorState = SurvivorState.TRAPPED;

  // ── References ─────────────────────────────────────────────────────────
  private playerRef: Phaser.Physics.Arcade.Sprite | null = null;
  private zombiePoolGetter: (() => Phaser.Physics.Arcade.Sprite[]) | null = null;

  // ── Rescue zone (car index or world-x range) ──────────────────────────
  private rescueZoneX: number = 0;
  private rescueZoneWidth: number = 200;

  // ── Internal flags ─────────────────────────────────────────────────────
  private hasEmittedFound: boolean = false;
  private waveTimer: number = 0;

  // ── Exclamation mark indicator ─────────────────────────────────────────
  private exclamation: Phaser.GameObjects.Text | null = null;

  // ─── Constructor ───────────────────────────────────────────────────────

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'survivor', undefined, SURVIVOR_HP);

    // Physics body setup
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setSize(24, 44);
      body.setOffset(4, 4);
      body.setCollideWorldBounds(false);
      body.allowGravity = true;
    }

    // Visual setup
    this.setDepth(12);
    this.setTint(0x66aaff); // Distinctive blue tint so player notices them

    // Exclamation indicator
    this.exclamation = scene.add.text(x, y - 32, '!', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#ffff00',
      fontStyle: 'bold',
    });
    this.exclamation.setOrigin(0.5);
    this.exclamation.setDepth(30);

    // Start inactive (pooled)
    this.setActive(false);
    this.setVisible(false);
    if (body) body.enable = false;
    this.exclamation.setVisible(false);
  }

  // ─── Public API ────────────────────────────────────────────────────────

  /**
   * (Re)spawn this survivor at the given position.
   * Resets state for object pool reuse.
   */
  public spawn(x: number, y: number): void {
    this.setActive(true);
    this.setVisible(true);
    this.setPosition(x, y);
    this.setAlpha(1);
    this.clearTint();
    this.setTint(0x66aaff);

    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.enable = true;
      body.setVelocity(0, 0);
    }

    this.hp = SURVIVOR_HP;
    this.maxHp = SURVIVOR_HP;
    this.survivorState = SurvivorState.TRAPPED;
    this.hasEmittedFound = false;
    this.waveTimer = 0;

    // Show exclamation
    if (this.exclamation) {
      this.exclamation.setPosition(x, y - 32);
      this.exclamation.setVisible(true);
    }
  }

  /**
   * Set references needed for AI behaviour.
   */
  public setRefs(
    player: Phaser.Physics.Arcade.Sprite,
    zombiePoolGetter: () => Phaser.Physics.Arcade.Sprite[],
  ): void {
    this.playerRef = player;
    this.zombiePoolGetter = zombiePoolGetter;
  }

  /**
   * Set the rescue zone (the safe car or area where survivor counts as rescued).
   */
  public setRescueZone(worldX: number, width: number): void {
    this.rescueZoneX = worldX;
    this.rescueZoneWidth = width;
  }

  /**
   * Called when the player presses interact (E) near this survivor.
   * Transitions from TRAPPED to FOLLOWING.
   */
  public interact(): boolean {
    if (this.survivorState !== SurvivorState.TRAPPED) return false;
    if (!this.playerRef) return false;

    const dist = distance(this.x, this.y, this.playerRef.x, this.playerRef.y);
    if (dist > INTERACTION_RANGE) return false;

    this.survivorState = SurvivorState.FOLLOWING;

    // Hide exclamation mark
    if (this.exclamation) {
      this.exclamation.setVisible(false);
    }

    // Change tint to green to indicate following
    this.clearTint();
    this.setTint(0x66ff66);

    return true;
  }

  // ─── Per-frame update ──────────────────────────────────────────────────

  public update(time: number, delta: number): void {
    if (!this.active || this.survivorState === SurvivorState.RESCUED ||
        this.survivorState === SurvivorState.DEAD) {
      return;
    }

    this.updateFlash(time);

    switch (this.survivorState) {
      case SurvivorState.TRAPPED:
        this.updateTrapped(time, delta);
        break;
      case SurvivorState.FOLLOWING:
        this.updateFollowing(time, delta);
        break;
    }

    // Keep exclamation above survivor
    if (this.exclamation && this.exclamation.visible) {
      this.exclamation.setPosition(this.x, this.y - 32);
      // Bob the exclamation
      this.exclamation.y += Math.sin(time * 0.006) * 2;
    }
  }

  // ─── Death override ────────────────────────────────────────────────────

  protected onDeath(): void {
    this.survivorState = SurvivorState.DEAD;

    if (this.exclamation) {
      this.exclamation.setVisible(false);
    }

    EventBus.emit(GameEvents.SURVIVOR_DIED, {
      x: this.x,
      y: this.y,
    });
  }

  /**
   * Clean up associated objects.
   */
  public destroy(fromScene?: boolean): void {
    if (this.exclamation) {
      this.exclamation.destroy();
      this.exclamation = null;
    }
    super.destroy(fromScene);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // State updates
  // ─────────────────────────────────────────────────────────────────────────

  private updateTrapped(time: number, _delta: number): void {
    // Idle bob / wave animation
    this.waveTimer += _delta;
    this.y += Math.sin(time * WAVE_ANIM_SPEED) * WAVE_BOB_AMOUNT * (_delta / 16);

    // Check if player is nearby
    if (this.playerRef && this.playerRef.active) {
      const dist = distance(this.x, this.y, this.playerRef.x, this.playerRef.y);

      // Emit SURVIVOR_FOUND when player first gets close
      if (!this.hasEmittedFound && dist <= DETECTION_RANGE) {
        this.hasEmittedFound = true;
        EventBus.emit(GameEvents.SURVIVOR_FOUND, {
          x: this.x,
          y: this.y,
          survivor: this,
        });
      }
    }

    // Stop horizontal movement while trapped
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setVelocityX(0);
    }
  }

  private updateFollowing(time: number, delta: number): void {
    if (!this.playerRef || !this.playerRef.active) return;

    const body = this.body as Phaser.Physics.Arcade.Body;
    if (!body) return;

    // Target position: behind the player
    const playerFacing = this.playerRef.flipX ? 1 : -1; // If player faces left, follow on right
    const targetX = this.playerRef.x + FOLLOW_OFFSET_X * playerFacing;
    const targetY = this.playerRef.y + FOLLOW_OFFSET_Y;

    const distToTarget = distance(this.x, this.y, targetX, targetY);

    // ── Zombie avoidance ─────────────────────────────────────────────
    let fleeVX = 0;
    let fleeVY = 0;

    if (this.zombiePoolGetter) {
      const zombies = this.zombiePoolGetter();
      for (const zombie of zombies) {
        if (!zombie.active) continue;
        const dist = distance(this.x, this.y, zombie.x, zombie.y);
        if (dist < ZOMBIE_FLEE_RANGE && dist > 0) {
          // Flee away from zombie
          const dx = this.x - zombie.x;
          const dy = this.y - zombie.y;
          const norm = Math.sqrt(dx * dx + dy * dy) || 1;
          fleeVX += (dx / norm) * ZOMBIE_FLEE_FORCE * (1 - dist / ZOMBIE_FLEE_RANGE);
          fleeVY += (dy / norm) * ZOMBIE_FLEE_FORCE * (1 - dist / ZOMBIE_FLEE_RANGE);
        }
      }
    }

    // ── Move toward target ───────────────────────────────────────────
    if (distToTarget > FOLLOW_MIN_DIST) {
      const dx = targetX - this.x;
      const dy = targetY - this.y;
      const norm = Math.sqrt(dx * dx + dy * dy) || 1;

      const moveVX = (dx / norm) * FOLLOW_SPEED + fleeVX;
      const moveVY = fleeVY; // Only flee vertically, don't normally chase Y

      body.setVelocityX(moveVX);

      // Face the direction of movement
      if (moveVX < -5) {
        this.setFlipX(true);
      } else if (moveVX > 5) {
        this.setFlipX(false);
      }
    } else {
      // Close enough, just apply flee velocity
      body.setVelocityX(fleeVX);
    }

    // ── Check if in rescue zone ──────────────────────────────────────
    if (
      this.x >= this.rescueZoneX &&
      this.x <= this.rescueZoneX + this.rescueZoneWidth
    ) {
      this.rescue();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Rescue
  // ─────────────────────────────────────────────────────────────────────────

  private rescue(): void {
    this.survivorState = SurvivorState.RESCUED;

    if (this.exclamation) {
      this.exclamation.setVisible(false);
    }

    // Play a small celebration effect (green flash)
    this.setTintFill(0x00ff00);
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      y: this.y - 20,
      duration: 600,
      ease: 'Power2',
      onComplete: () => {
        this.setActive(false);
        this.setVisible(false);
        const body = this.body as Phaser.Physics.Arcade.Body;
        if (body) body.enable = false;
      },
    });

    EventBus.emit(GameEvents.SURVIVOR_RESCUED, {
      x: this.x,
      y: this.y,
      bonus: SURVIVOR_RESCUE_BONUS,
    });

    // Award currency
    EventBus.emit(GameEvents.CURRENCY_CHANGED, {
      amount: SURVIVOR_RESCUE_BONUS,
      reason: 'survivor-rescue',
    });
  }
}
