import Phaser from 'phaser';
import { Survivor } from '../entities/npcs/Survivor';
import { Train } from '../train/Train';
import { CarPurpose } from '../types/TrainTypes';
import { EventBus } from '../utils/EventBus';
import { MAX_NPCS, NPC_RECRUIT_CHANCE } from '../data/BalanceConstants';

interface NPCTask {
  type: 'guard' | 'cook' | 'maintain' | 'idle';
  npcName: string;
}

/**
 * Manages all NPCs — creation, recruitment, task assignment.
 */
export class NPCManager {
  private scene!: Phaser.Scene;
  private train!: Train;
  public npcs: Survivor[] = [];
  private tasks: NPCTask[] = [];

  // Names pool for recruitable NPCs
  private namePool: string[] = ['Marcus', 'Elena', 'Jin', 'Rosa', 'Dmitri', 'Lily', 'Kai', 'Nadia'];
  private usedNames: Set<string> = new Set();

  // Dialogue pools by NPC personality
  private dialoguePools: string[][] = [
    [
      'Keep your head down.',
      'I used to be a mechanic.',
      'We should fortify this car more.',
      'I\'ll watch the door.',
      'Ammo is running low...',
    ],
    [
      'I found some herbs outside.',
      'The plants are growing well!',
      'We need to ration the food.',
      'I can cook if you bring supplies.',
      'It\'s almost peaceful in here...',
    ],
    [
      'Do you hear that scratching?',
      'I haven\'t slept in days.',
      'Where are we even going?',
      'I saw a horde from the window...',
      'We need to keep moving.',
    ],
  ];

  public create(scene: Phaser.Scene, train: Train): void {
    this.scene = scene;
    this.train = train;
    this.npcs = [];
    this.tasks = [];
    this.usedNames = new Set();
  }

  /** Add the initial NPC (Sarah). */
  public addInitialNPC(npc: Survivor): void {
    this.npcs.push(npc);
    this.usedNames.add(npc.npcName);
    this.tasks.push({ type: 'idle', npcName: npc.npcName });
  }

  /** Try to recruit a new NPC during exploration. Returns the new NPC or null. */
  public tryRecruit(): Survivor | null {
    if (this.npcs.length >= MAX_NPCS) return null;
    if (Math.random() > NPC_RECRUIT_CHANCE) return null;

    const availableNames = this.namePool.filter(n => !this.usedNames.has(n));
    if (availableNames.length === 0) return null;

    const name = availableNames[Math.floor(Math.random() * availableNames.length)];
    this.usedNames.add(name);

    // Spawn in living car
    const livingCar = this.train.cars.find(c => c.purpose === CarPurpose.LIVING) || this.train.cars[1];
    const bounds = livingCar.getInteriorBounds();
    const x = bounds.x + 20 + Math.random() * (bounds.w - 40);
    const y = bounds.y + 20 + Math.random() * (bounds.h - 40);

    const npc = new Survivor(this.scene, x, y, name);

    // Give them custom dialogue
    const pool = this.dialoguePools[Math.floor(Math.random() * this.dialoguePools.length)];
    (npc as any).dialogueLines = [...pool]; // Override dialogue

    npc.setWanderBounds(bounds.x, bounds.y, bounds.w, bounds.h);
    this.npcs.push(npc);
    this.tasks.push({ type: 'idle', npcName: name });

    EventBus.emit('npc:recruited', name);
    return npc;
  }

  /** Assign a task to an NPC. */
  public assignTask(npcName: string, task: NPCTask['type']): void {
    const existing = this.tasks.find(t => t.npcName === npcName);
    if (existing) {
      existing.type = task;
    } else {
      this.tasks.push({ type: task, npcName });
    }
    EventBus.emit('npc:task-assigned', { npcName, task });
  }

  /** Get the task assigned to an NPC. */
  public getTask(npcName: string): NPCTask['type'] {
    return this.tasks.find(t => t.npcName === npcName)?.type ?? 'idle';
  }

  /** Update all NPCs. */
  public update(time: number, delta: number): void {
    for (const npc of this.npcs) {
      if (npc.isAlive()) {
        npc.update(time, delta);
      }
    }
  }

  /** Add wall collisions for all NPCs. */
  public addCollisions(wallGroups: Phaser.Physics.Arcade.StaticGroup[], furnGroups: Phaser.Physics.Arcade.StaticGroup[]): void {
    for (const npc of this.npcs) {
      for (const wg of wallGroups) {
        this.scene.physics.add.collider(npc, wg);
      }
      for (const fg of furnGroups) {
        this.scene.physics.add.collider(npc, fg);
      }
    }
  }

  /** Get all NPC names. */
  public getNames(): string[] {
    return this.npcs.map(n => n.npcName);
  }

  /** Get NPC count. */
  public getCount(): number {
    return this.npcs.length;
  }

  /** Find nearest NPC to a point. */
  public findNearest(x: number, y: number): { npc: Survivor; dist: number } | null {
    let best: { npc: Survivor; dist: number } | null = null;

    for (const npc of this.npcs) {
      if (!npc.isAlive()) continue;
      const dx = x - npc.x;
      const dy = y - npc.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (!best || dist < best.dist) {
        best = { npc, dist };
      }
    }

    return best;
  }
}
