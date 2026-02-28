import Phaser from 'phaser';

/**
 * Abstract base class for all game entities (player, zombies, NPCs).
 * Extends Phaser.Physics.Arcade.Sprite with a health system and damage flash.
 */
export abstract class Entity extends Phaser.Physics.Arcade.Sprite {
  public hp: number;
  public maxHp: number;

  private _flashUntil: number = 0;
  private static readonly FLASH_DURATION_MS = 120;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    frame?: string | number,
    maxHp: number = 100,
  ) {
    super(scene, x, y, texture, frame);
    this.maxHp = maxHp;
    this.hp = maxHp;
    scene.add.existing(this);
    scene.physics.add.existing(this);
  }

  public takeDamage(amount: number): void {
    if (!this.isAlive()) return;
    this.hp = Math.max(0, this.hp - amount);
    this.setTintFill(0xffffff);
    this._flashUntil = this.scene.time.now + Entity.FLASH_DURATION_MS;
    if (this.hp <= 0) {
      this.die();
    }
  }

  public heal(amount: number): void {
    if (!this.isAlive()) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  public die(): void {
    this.hp = 0;
    this.clearTint();
    this.setAlpha(1);
    this.onDeath();
    this.setActive(false);
    this.setVisible(false);
    if (this.body) {
      (this.body as Phaser.Physics.Arcade.Body).enable = false;
    }
  }

  protected onDeath(): void {}

  public isAlive(): boolean {
    return this.active && this.hp > 0;
  }

  protected updateFlash(time: number): void {
    if (this._flashUntil > 0 && time >= this._flashUntil) {
      this.clearTint();
      this._flashUntil = 0;
    }
  }
}
