import Phaser from 'phaser';
import { Entity } from './Entity';
import { Direction, InputState, SurvivalState } from '../types/GameTypes';
import {
  PLAYER_START_HP,
  PLAYER_MAX_HP,
  PLAYER_SPEED,
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
  public interactTarget: string | null = null;

  private _speed: number = PLAYER_SPEED;
  private _interactPressed: boolean = false;
  private _interactJustPressed: boolean = false;
  private _attackPressed: boolean = false;
  private _attackJustPressed: boolean = false;
  private _invPressed: boolean = false;
  private _invJustPressed: boolean = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player-down', undefined, PLAYER_MAX_HP);

    this.survival = {
      hunger: HUNGER_MAX,
      energy: ENERGY_MAX,
      health: PLAYER_START_HP,
    };

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

    let vx = 0;
    let vy = 0;

    if (input.moveX !== 0 || input.moveY !== 0) {
      const len = Math.sqrt(input.moveX * input.moveX + input.moveY * input.moveY);
      vx = (input.moveX / len) * speed;
      vy = (input.moveY / len) * speed;

      if (Math.abs(input.moveX) > Math.abs(input.moveY)) {
        this.facing = input.moveX < 0 ? Direction.LEFT : Direction.RIGHT;
      } else {
        this.facing = input.moveY < 0 ? Direction.UP : Direction.DOWN;
      }
    }

    body.setVelocity(vx, vy);

    const texKey = `player-${this.facing.toLowerCase()}`;
    if (this.texture.key !== texKey) {
      this.setTexture(texKey);
    }

    // Interact input (track just-pressed)
    const wasInteract = this._interactPressed;
    this._interactPressed = input.interact;
    this._interactJustPressed = input.interact && !wasInteract;

    // Attack input
    const wasAttack = this._attackPressed;
    this._attackPressed = input.attack;
    this._attackJustPressed = input.attack && !wasAttack;

    // Inventory input
    const wasInv = this._invPressed;
    this._invPressed = input.openInventory;
    this._invJustPressed = input.openInventory && !wasInv;
  }

  public isInteractJustPressed(): boolean {
    return this._interactJustPressed;
  }

  public isAttackJustPressed(): boolean {
    return this._attackJustPressed;
  }

  public isInventoryJustPressed(): boolean {
    return this._invJustPressed;
  }

  public setSpeedMultiplier(mult: number): void {
    this._speed = PLAYER_SPEED * mult;
  }

  public updateDepth(): void {
    this.setDepth(10 + this.y * 0.01);
  }

  public update(time: number, _delta: number): void {
    this.updateFlash(time);
    this.updateDepth();
  }
}
