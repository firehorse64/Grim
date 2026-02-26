import Phaser from 'phaser';
import { EventBus } from '../../utils/EventBus';
import { GameEvents } from '../../types/EventTypes';

export class Grenade extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;

  public damage: number = 0;
  public explosionRadius: number = 120;
  public knockback: number = 0;
  public owner: Phaser.GameObjects.Sprite | null = null;

  private fuseTimer: number = 0;
  private fuseTime: number = 2000; // explodes after 2 seconds or on ground contact
  private hasExploded: boolean = false;
  private bounceCount: number = 0;
  private maxBounces: number = 2;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'grenade');

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setActive(false);
    this.setVisible(false);

    // Grenades are affected by gravity for arc trajectory
    this.body.setAllowGravity(true);
    this.body.setSize(10, 10);
    this.body.setBounce(0.4, 0.3);
    this.body.setDrag(80, 0);
  }

  /**
   * Fire/throw the grenade from a position at a given angle.
   */
  fire(
    x: number,
    y: number,
    angle: number,
    speed: number,
    damage: number = 100,
    explosionRadius: number = 120,
    knockback: number = 300,
    owner: Phaser.GameObjects.Sprite | null = null
  ): void {
    this.setActive(true);
    this.setVisible(true);
    this.setPosition(x, y);

    this.damage = damage;
    this.explosionRadius = explosionRadius;
    this.knockback = knockback;
    this.owner = owner;
    this.fuseTimer = 0;
    this.hasExploded = false;
    this.bounceCount = 0;

    // Launch with arc - add upward component
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed - 150; // add upward arc

    this.body.setVelocity(vx, vy);
    this.body.setEnable(true);
    this.body.setAngularVelocity(360); // spin while airborne

    this.setAlpha(1);
    this.setScale(1);
  }

  /**
   * Call when the grenade lands on a surface.
   */
  onBounce(): void {
    this.bounceCount++;
    if (this.bounceCount >= this.maxBounces) {
      this.explode();
    }
  }

  /**
   * Trigger the explosion.
   */
  explode(): void {
    if (this.hasExploded) return;
    this.hasExploded = true;

    // Create explosion visual
    this.createExplosionEffect();

    // Emit event for the combat system to deal AOE damage
    EventBus.emit(GameEvents.GRENADE_EXPLODED, {
      x: this.x,
      y: this.y,
      damage: this.damage,
      radius: this.explosionRadius,
      knockback: this.knockback,
      owner: this.owner,
    });

    // Screen shake feedback
    EventBus.emit(GameEvents.SCREEN_SHAKE, {
      intensity: 4,
      duration: 200,
    });

    this.deactivate();
  }

  /**
   * Create a visual explosion effect at the grenade's position.
   */
  private createExplosionEffect(): void {
    // Explosion sprite / animation
    const explosion = this.scene.add.sprite(this.x, this.y, 'explosion');
    explosion.setScale(this.explosionRadius / 60); // scale based on radius
    explosion.setAlpha(0.9);
    explosion.setDepth(10);

    // If explosion animation exists, play it; otherwise tween
    if (this.scene.anims.exists('explosion-anim')) {
      explosion.play('explosion-anim');
      explosion.once('animationcomplete', () => {
        explosion.destroy();
      });
    } else {
      // Fallback: tween-based explosion
      this.scene.tweens.add({
        targets: explosion,
        scaleX: explosion.scaleX * 1.5,
        scaleY: explosion.scaleY * 1.5,
        alpha: 0,
        duration: 400,
        ease: 'Power2',
        onComplete: () => {
          explosion.destroy();
        },
      });
    }

    // Flash effect
    EventBus.emit(GameEvents.SCREEN_FLASH, {
      color: 0xff6600,
      alpha: 0.3,
      duration: 100,
    });
  }

  /**
   * Deactivate and return to pool.
   */
  deactivate(): void {
    this.setActive(false);
    this.setVisible(false);
    this.body.setEnable(false);
    this.body.setVelocity(0, 0);
    this.body.setAngularVelocity(0);
    this.damage = 0;
    this.owner = null;
  }

  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);

    if (!this.active || this.hasExploded) return;

    this.fuseTimer += delta;

    // Flash/blink as fuse runs out
    if (this.fuseTimer > this.fuseTime * 0.6) {
      const blinkRate = Math.max(
        50,
        200 - (this.fuseTimer / this.fuseTime) * 180
      );
      this.setAlpha(Math.sin(this.fuseTimer / blinkRate) > 0 ? 1 : 0.4);
    }

    // Explode on fuse timeout
    if (this.fuseTimer >= this.fuseTime) {
      this.explode();
      return;
    }

    // Explode if resting on ground (velocity near zero and touching down)
    if (
      this.body.blocked.down &&
      Math.abs(this.body.velocity.x) < 20 &&
      this.fuseTimer > 300
    ) {
      this.explode();
    }
  }
}
