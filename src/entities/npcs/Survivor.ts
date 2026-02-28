import Phaser from 'phaser';
import { Entity } from '../Entity';
import { Direction } from '../../types/GameTypes';
import { NPC_SPEED, NPC_IDLE_MIN_MS, NPC_IDLE_MAX_MS } from '../../data/BalanceConstants';

enum NPCState {
  IDLE = 'IDLE',
  WALKING = 'WALKING',
}

/**
 * NPC companion that wanders inside the train.
 * Simple state machine: IDLE → WALKING → IDLE.
 */
export class Survivor extends Entity {
  public npcName: string;
  public facing: Direction = Direction.DOWN;

  // Dialogue lines
  public readonly dialogueLines: string[] = [
    'Hear that? They\'re outside...',
    'We need more food soon.',
    'I patched the window in car 3.',
    'Think we can make it to the coast?',
    'Try to get some rest.',
    'The stove still works, thankfully.',
  ];

  private npcState: NPCState = NPCState.IDLE;
  private stateTimer: number = 0;
  private targetX: number = 0;
  private targetY: number = 0;

  // Bounds this NPC can wander within
  private boundsX: number = 0;
  private boundsY: number = 0;
  private boundsW: number = 200;
  private boundsH: number = 300;

  constructor(scene: Phaser.Scene, x: number, y: number, name: string = 'Sarah') {
    super(scene, x, y, 'npc-down', undefined, 100);
    this.npcName = name;

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(16, 16);
    body.setOffset(4, 14);
    body.setCollideWorldBounds(false);

    this.setDepth(10);
    this.enterIdle();
  }

  /** Set the bounds this NPC can wander in. */
  public setWanderBounds(x: number, y: number, w: number, h: number): void {
    this.boundsX = x;
    this.boundsY = y;
    this.boundsW = w;
    this.boundsH = h;
  }

  /** Get a random dialogue line. */
  public getDialogue(): string {
    return this.dialogueLines[Math.floor(Math.random() * this.dialogueLines.length)];
  }

  public update(time: number, delta: number): void {
    this.updateFlash(time);

    this.stateTimer -= delta;

    switch (this.npcState) {
      case NPCState.IDLE:
        if (this.stateTimer <= 0) {
          this.enterWalking();
        }
        break;

      case NPCState.WALKING: {
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 8 || this.stateTimer <= 0) {
          this.enterIdle();
        } else {
          const body = this.body as Phaser.Physics.Arcade.Body;
          body.setVelocity(
            (dx / dist) * NPC_SPEED,
            (dy / dist) * NPC_SPEED,
          );

          // Update facing
          if (Math.abs(dx) > Math.abs(dy)) {
            this.facing = dx < 0 ? Direction.LEFT : Direction.RIGHT;
          } else {
            this.facing = dy < 0 ? Direction.UP : Direction.DOWN;
          }

          const texKey = `npc-${this.facing.toLowerCase()}`;
          if (this.texture.key !== texKey) {
            this.setTexture(texKey);
          }
        }
        break;
      }
    }

    // Depth sort
    this.setDepth(10 + this.y * 0.01);
  }

  private enterIdle(): void {
    this.npcState = NPCState.IDLE;
    this.stateTimer = NPC_IDLE_MIN_MS + Math.random() * (NPC_IDLE_MAX_MS - NPC_IDLE_MIN_MS);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
  }

  private enterWalking(): void {
    this.npcState = NPCState.WALKING;
    this.stateTimer = 3000 + Math.random() * 3000;

    // Pick random point within bounds
    this.targetX = this.boundsX + 16 + Math.random() * (this.boundsW - 32);
    this.targetY = this.boundsY + 16 + Math.random() * (this.boundsH - 32);
  }
}
