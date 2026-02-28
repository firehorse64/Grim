import Phaser from 'phaser';
import { Entity } from './Entity';
import { Direction, InputState, SurvivalState } from '../types/GameTypes';
import {
  PLAYER_START_HP,
  PLAYER_MAX_HP,
  PLAYER_SPEED,
  PLAYER_INTERACT_RANGE,
  HUNGER_MAX,
  ENERGY_MAX,
} from '../data/BalanceConstants';

/**
 * Player character – 3/4 angle, 4-directional movement.
 * Yellow hoodie girl with backpack and rifle.
 */
export class Player extends Entity {
  public facing: Direction = Direction.DOWN;
  public survival: SurvivalState;
  public interactTarget: string | null = null; // prompt text of nearest interactable

  private _speed: number = PLAYER_SPEED;
  private _interactPressed: boolean = false;
  private _interactJustPressed: boolean = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player-down', undefined, PLAYER_MAX_HP);

    this.survival = {
      hunger: HUNGER_MAX,
      energy: ENERGY_MAX,
      health: PLAYER_START_HP,
    };

    // Physics body — slightly smaller than sprite for forgiving collision
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(16, 16);
    body.setOffset(4, 14);
    body.setCollideWorldBounds(false);

    this.setDepth(10);
  }

  /** Update player movement and direction from input state. */
  public handleInput(input: InputState): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const speed = this._speed;

    // Movement
    let vx = 0;
    let vy = 0;

    if (input.moveX !== 0 || input.moveY !== 0) {
      // Normalize diagonal movement
      const len = Math.sqrt(input.moveX * input.moveX + input.moveY * input.moveY);
      vx = (input.moveX / len) * speed;
      vy = (input.moveY / len) * speed;

      // Update facing based on dominant direction
      if (Math.abs(input.moveX) > Math.abs(input.moveY)) {
        this.facing = input.moveX < 0 ? Direction.LEFT : Direction.RIGHT;
      } else {
        this.facing = input.moveY < 0 ? Direction.UP : Direction.DOWN;
      }
    }

    body.setVelocity(vx, vy);

    // Update sprite based on facing
    const texKey = `player-${this.facing.toLowerCase()}`;
    if (this.texture.key !== texKey) {
      this.setTexture(texKey);
    }

    // Interact input (track just-pressed for single-fire)
    const wasPressed = this._interactPressed;
    this._interactPressed = input.interact;
    this._interactJustPressed = input.interact && !wasPressed;
  }

  /** Returns true on the frame the interact button was first pressed. */
  public isInteractJustPressed(): boolean {
    return this._interactJustPressed;
  }

  /** Apply speed modifier (e.g. from low energy). */
  public setSpeedMultiplier(mult: number): void {
    this._speed = PLAYER_SPEED * mult;
  }

  /** Depth sort: set depth based on Y position. */
  public updateDepth(): void {
    this.setDepth(10 + this.y * 0.01);
  }

  public update(time: number, _delta: number): void {
    this.updateFlash(time);
    this.updateDepth();
  }
}
