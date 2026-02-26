import Phaser from 'phaser';
import { EventBus } from '../../utils/EventBus';
import { GameEvents } from '../../types/EventTypes';

/**
 * Acid projectile used by Spitter zombies.
 * Travels in an arc and creates an acid pool on impact that damages over time.
 */
export class AcidBlob extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;

  public damage: number = 0;
  public poolDamagePerTick: number = 0;
  public poolDuration: number = 3000; // acid pool lasts 3 seconds
  public poolRadius: number = 40;
  public owner: Phaser.GameObjects.Sprite | null = null;

  private lifeTimer: number = 0;
  private maxLifeTime: number = 3000;
  private hasImpacted: boolean = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'acid-blob');

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setActive(false);
    this.setVisible(false);

    this.body.setAllowGravity(true);
    this.body.setSize(8, 8);
  }

  /**
   * Fire the acid blob from a position at a given angle.
   */
  fire(
    x: number,
    y: number,
    angle: number,
    speed: number,
    damage: number = 15,
    poolDamagePerTick: number = 5,
    owner: Phaser.GameObjects.Sprite | null = null
  ): void {
    this.setActive(true);
    this.setVisible(true);
    this.setPosition(x, y);

    this.damage = damage;
    this.poolDamagePerTick = poolDamagePerTick;
    this.owner = owner;
    this.lifeTimer = 0;
    this.hasImpacted = false;

    // Arc trajectory
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed - 100;

    this.body.setVelocity(vx, vy);
    this.body.setEnable(true);
    this.body.setAngularVelocity(180);

    this.setAlpha(1);
    this.setScale(1);
    this.setTint(0x44ff22);
  }

  /**
   * Called when the acid blob hits a surface or entity.
   */
  onImpact(): void {
    if (this.hasImpacted) return;
    this.hasImpacted = true;

    this.createAcidPool();
    this.deactivate();
  }

  /**
   * Create an acid pool at the impact position that damages over time.
   */
  private createAcidPool(): void {
    const poolX = this.x;
    const poolY = this.y;

    // Create acid pool visual
    const pool = this.scene.add.ellipse(
      poolX,
      poolY,
      this.poolRadius * 2,
      this.poolRadius * 0.6,
      0x44ff22,
      0.5
    );
    pool.setDepth(1);

    // Acid pool physics zone for overlap detection
    const poolZone = this.scene.add.zone(
      poolX,
      poolY,
      this.poolRadius * 2,
      this.poolRadius * 0.6
    );
    this.scene.physics.add.existing(poolZone, true); // static body

    // Pulsing effect
    this.scene.tweens.add({
      targets: pool,
      scaleX: 1.1,
      scaleY: 0.9,
      alpha: 0.6,
      duration: 500,
      yoyo: true,
      repeat: -1,
    });

    // Emit event for combat system to handle DOT damage
    const damageInterval = this.scene.time.addEvent({
      delay: 500,
      repeat: Math.floor(this.poolDuration / 500) - 1,
      callback: () => {
        EventBus.emit('acid-pool-tick', {
          x: poolX,
          y: poolY,
          radius: this.poolRadius,
          damage: this.poolDamagePerTick,
          owner: this.owner,
          zone: poolZone,
        });
      },
    });

    // Clean up pool after duration
    this.scene.time.delayedCall(this.poolDuration, () => {
      this.scene.tweens.add({
        targets: pool,
        alpha: 0,
        scaleX: 0.5,
        scaleY: 0.3,
        duration: 500,
        onComplete: () => {
          pool.destroy();
          poolZone.destroy();
          damageInterval.destroy();
        },
      });
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

    if (!this.active || this.hasImpacted) return;

    this.lifeTimer += delta;

    // Rotate sprite to face travel direction
    const angle = Math.atan2(this.body.velocity.y, this.body.velocity.x);
    this.setRotation(angle);

    if (this.lifeTimer >= this.maxLifeTime) {
      this.onImpact();
      return;
    }

    // Impact on ground contact
    if (this.body.blocked.down) {
      this.onImpact();
    }
  }
}
