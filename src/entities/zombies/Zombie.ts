import Phaser from 'phaser';
import { Entity } from '../Entity';
import { Direction } from '../../types/GameTypes';
import {
  ZOMBIE_AMBIENT_SPEED,
  ZOMBIE_CHASE_SPEED,
  ZOMBIE_AGGRO_RANGE,
  ZOMBIE_DAMAGE,
  ZOMBIE_ATTACK_COOLDOWN_MS,
} from '../../data/BalanceConstants';

enum ZombieMode {
  AMBIENT = 'AMBIENT',   // Wandering outside, no target
  CHASING = 'CHASING',   // Chasing player during exploration
  BANGING = 'BANGING',   // At train wall, banging (while stopped)
}

/**
 * Simple top-down zombie for the survival game.
 * In AMBIENT mode, drifts downward (scrolls with terrain when train moves).
 * In CHASING mode, pursues the player.
 */
export class Zombie extends Entity {
  public facing: Direction = Direction.UP;
  private mode: ZombieMode = ZombieMode.AMBIENT;
  private attackCooldown: number = 0;
  private wanderAngle: number = 0;
  private wanderTimer: number = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'zombie-down', undefined, 30);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(16, 16);
    body.setOffset(4, 14);
    body.setCollideWorldBounds(false);

    this.setDepth(5);
    this.wanderAngle = Math.random() * Math.PI * 2;
    this.wanderTimer = 1000 + Math.random() * 2000;
  }

  /** Set the zombie to ambient mode (outside the train, wandering). */
  public setAmbient(): void {
    this.mode = ZombieMode.AMBIENT;
  }

  /** Set the zombie to chase mode (player is exploring outside). */
  public setChasing(): void {
    this.mode = ZombieMode.CHASING;
  }

  /** Set the zombie to banging mode (train is stopped). */
  public setBanging(): void {
    this.mode = ZombieMode.BANGING;
  }

  /** Update with optional player position for chasing. */
  public updateZombie(
    time: number, delta: number,
    scrollSpeed: number,
    playerX?: number, playerY?: number,
  ): void {
    this.updateFlash(time);
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);

    const body = this.body as Phaser.Physics.Arcade.Body;

    switch (this.mode) {
      case ZombieMode.AMBIENT: {
        // Wander randomly + drift with scroll
        this.wanderTimer -= delta;
        if (this.wanderTimer <= 0) {
          this.wanderAngle = Math.random() * Math.PI * 2;
          this.wanderTimer = 1000 + Math.random() * 3000;
        }

        const wx = Math.cos(this.wanderAngle) * ZOMBIE_AMBIENT_SPEED * 0.3;
        const wy = Math.sin(this.wanderAngle) * ZOMBIE_AMBIENT_SPEED * 0.3 + scrollSpeed;
        body.setVelocity(wx, wy);
        break;
      }

      case ZombieMode.CHASING: {
        if (playerX !== undefined && playerY !== undefined) {
          const dx = playerX - this.x;
          const dy = playerY - this.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist > 4) {
            body.setVelocity(
              (dx / dist) * ZOMBIE_CHASE_SPEED,
              (dy / dist) * ZOMBIE_CHASE_SPEED,
            );
          } else {
            body.setVelocity(0, 0);
          }
        }
        break;
      }

      case ZombieMode.BANGING: {
        // Stay still, play banging animation (just idle for now)
        body.setVelocity(0, 0);
        break;
      }
    }

    // Update facing based on velocity
    const vx = body.velocity.x;
    const vy = body.velocity.y;
    if (Math.abs(vx) > 5 || Math.abs(vy) > 5) {
      if (Math.abs(vx) > Math.abs(vy)) {
        this.facing = vx < 0 ? Direction.LEFT : Direction.RIGHT;
      } else {
        this.facing = vy < 0 ? Direction.UP : Direction.DOWN;
      }
    }

    const texKey = `zombie-${this.facing.toLowerCase()}`;
    if (this.texture.key !== texKey) {
      this.setTexture(texKey);
    }

    this.setDepth(5 + this.y * 0.01);
  }

  /** Try to attack; returns damage dealt (0 if on cooldown). */
  public tryAttack(): number {
    if (this.attackCooldown > 0) return 0;
    this.attackCooldown = ZOMBIE_ATTACK_COOLDOWN_MS;
    return ZOMBIE_DAMAGE;
  }

  /** Check if player is within aggro range. */
  public isPlayerInRange(px: number, py: number): boolean {
    const dx = px - this.x;
    const dy = py - this.y;
    return dx * dx + dy * dy < ZOMBIE_AGGRO_RANGE * ZOMBIE_AGGRO_RANGE;
  }
}
