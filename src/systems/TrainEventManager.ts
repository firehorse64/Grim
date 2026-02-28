import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { GameMode } from '../types/GameTypes';
import { FurnitureType, MaintenanceComponent, WindowState } from '../types/TrainTypes';
import { Train } from '../train/Train';
import { TrainCar } from '../train/TrainCar';
import { Zombie } from '../entities/zombies/Zombie';
import { InventoryManager } from './InventoryManager';
import {
  ENGINE_MAX_HP,
  ENGINE_DEGRADE_PER_SEC,
  BRAKE_MAX_HP,
  BRAKE_DEGRADE_PER_SEC,
  WHEELS_MAX_HP,
  WHEELS_DEGRADE_PER_SEC,
  REPAIR_MATERIAL_COST,
  REPAIR_AMOUNT,
  MAINTENANCE_WARNING_THRESHOLD,
  WINDOW_MAX_HP,
  BARRICADE_HP,
  BARRICADE_MATERIAL_COST,
  BREACH_CHANCE_PER_MIN_STOPPED,
  ZOMBIE_WINDOW_DAMAGE,
  BREACH_ZOMBIE_COUNT,
  FIRE_CHANCE_PER_MIN,
  FIRE_DAMAGE_PER_SEC,
  FIRE_SPREAD_TIME_MS,
} from '../data/BalanceConstants';

interface FireEvent {
  carIndex: number;
  tileX: number;
  tileY: number;
  timer: number;
  sprite: Phaser.GameObjects.Image;
}

/**
 * Manages train events: maintenance degradation, zombie breaches,
 * barricading windows, and fire events.
 */
export class TrainEventManager {
  private scene!: Phaser.Scene;
  private train!: Train;

  // Maintenance
  public maintenance: MaintenanceComponent[] = [];

  // Breach
  private breachTimer: number = 0;
  private breachZombies: Zombie[] = [];

  // Fire
  private fires: FireEvent[] = [];
  private fireTimer: number = 0;

  // Barricading
  private barricadeProgress: number = 0;
  private isBarricading: boolean = false;

  public create(scene: Phaser.Scene, train: Train): void {
    this.scene = scene;
    this.train = train;
    this.breachZombies = [];
    this.fires = [];

    // Initialize maintenance components
    this.maintenance = [
      { id: 'engine', name: 'Engine', hp: ENGINE_MAX_HP, maxHp: ENGINE_MAX_HP, degradeRate: ENGINE_DEGRADE_PER_SEC },
      { id: 'brake', name: 'Brake System', hp: BRAKE_MAX_HP, maxHp: BRAKE_MAX_HP, degradeRate: BRAKE_DEGRADE_PER_SEC },
      { id: 'wheels', name: 'Wheels', hp: WHEELS_MAX_HP, maxHp: WHEELS_MAX_HP, degradeRate: WHEELS_DEGRADE_PER_SEC },
    ];

    // Initialize window states on each car
    for (const car of train.cars) {
      if (!car.layout.windows) {
        car.layout.windows = [];
      }
      // Find all window tiles
      for (let row = 0; row < car.layout.tiles.length; row++) {
        for (let col = 0; col < car.layout.tiles[row].length; col++) {
          if (car.layout.tiles[row][col] === 3) { // TileType.WINDOW
            car.layout.windows.push({
              row, col,
              hp: WINDOW_MAX_HP,
              maxHp: WINDOW_MAX_HP,
              barricaded: false,
              barricadeHp: 0,
            });
          }
        }
      }
    }
  }

  /** Update all train events. */
  public update(delta: number, gameMode: GameMode): void {
    const dt = delta / 1000;

    // Maintenance degradation (only when moving)
    if (gameMode === GameMode.TRAVELING) {
      this.updateMaintenance(dt);
    }

    // Breach attempts (only when stopped)
    if (gameMode === GameMode.STOPPED) {
      this.updateBreach(delta);
    }

    // Fire events (any time)
    this.updateFires(delta);

    // Update breach zombies
    for (let i = this.breachZombies.length - 1; i >= 0; i--) {
      const z = this.breachZombies[i];
      if (!z.isAlive()) {
        z.destroy();
        this.breachZombies.splice(i, 1);
      }
    }
  }

  // ---- Maintenance ----

  private updateMaintenance(dt: number): void {
    for (const comp of this.maintenance) {
      const prevHp = comp.hp;
      comp.hp = Math.max(0, comp.hp - comp.degradeRate * dt);

      // Emit warning when crossing threshold
      if (prevHp > MAINTENANCE_WARNING_THRESHOLD && comp.hp <= MAINTENANCE_WARNING_THRESHOLD) {
        EventBus.emit('maintenance:warning', comp);
      }

      // Engine failure — force stop
      if (comp.id === 'engine' && comp.hp <= 0 && this.train.isMoving) {
        this.train.stop();
        EventBus.emit('maintenance:engine-failure');
      }
    }
  }

  /** Repair a component using materials. Returns true if repaired. */
  public repair(componentId: string, inventory: InventoryManager): boolean {
    const comp = this.maintenance.find(c => c.id === componentId);
    if (!comp) return false;

    // Check for repair kit first, then raw materials
    if (inventory.hasItem('repair-kit', 1)) {
      inventory.removeItem('repair-kit', 1);
      comp.hp = Math.min(comp.maxHp, comp.hp + REPAIR_AMOUNT * 1.5);
      EventBus.emit('maintenance:repaired', comp);
      return true;
    }

    if (!inventory.hasItem('scrap-metal', REPAIR_MATERIAL_COST)) return false;

    inventory.removeItem('scrap-metal', REPAIR_MATERIAL_COST);
    comp.hp = Math.min(comp.maxHp, comp.hp + REPAIR_AMOUNT);
    EventBus.emit('maintenance:repaired', comp);
    return true;
  }

  /** Get component by id. */
  public getComponent(id: string): MaintenanceComponent | undefined {
    return this.maintenance.find(c => c.id === id);
  }

  /** Check if any component needs repair. */
  public needsRepair(): boolean {
    return this.maintenance.some(c => c.hp < MAINTENANCE_WARNING_THRESHOLD);
  }

  // ---- Breach ----

  private updateBreach(delta: number): void {
    this.breachTimer += delta;
    const interval = 60000 / BREACH_CHANCE_PER_MIN_STOPPED; // ms between checks

    if (this.breachTimer > interval) {
      this.breachTimer = 0;
      if (Math.random() < BREACH_CHANCE_PER_MIN_STOPPED) {
        this.attemptBreach();
      }
    }
  }

  private attemptBreach(): void {
    // Pick a random car and window
    const carIndex = Math.floor(Math.random() * this.train.cars.length);
    const car = this.train.cars[carIndex];
    const windows = car.layout.windows.filter(w => !w.barricaded && w.hp > 0);
    if (windows.length === 0) return;

    const window = windows[Math.floor(Math.random() * windows.length)];

    // Damage the window
    window.hp -= ZOMBIE_WINDOW_DAMAGE * 10; // chunks of damage
    EventBus.emit('breach:window-damaged', { carIndex, window });

    if (window.hp <= 0) {
      // Breach! Spawn zombies inside
      window.hp = 0;
      this.spawnBreachZombies(car, window);
      EventBus.emit('breach:zombies-entered', { carIndex });
    }
  }

  private spawnBreachZombies(car: TrainCar, window: WindowState): void {
    const wx = car.worldX + window.col * 32 + 16;
    const wy = car.worldY + window.row * 32 + 16;

    for (let i = 0; i < BREACH_ZOMBIE_COUNT; i++) {
      const z = new Zombie(
        this.scene,
        wx + (Math.random() - 0.5) * 20,
        wy + (Math.random() - 0.5) * 20,
      );
      z.setChasing();
      this.breachZombies.push(z);
    }
  }

  /** Get all breach zombies (for collision/combat checks). */
  public getBreachZombies(): Zombie[] {
    return this.breachZombies;
  }

  // ---- Barricading ----

  /** Start barricading a window. Returns true if started. */
  public startBarricade(car: TrainCar, inventory: InventoryManager): WindowState | null {
    // Check for barricade boards or raw materials
    if (!inventory.hasItem('barricade-boards', 1) &&
        !inventory.hasItem('scrap-metal', BARRICADE_MATERIAL_COST)) {
      return null;
    }

    // Find nearest damaged/unbarricaded window
    const window = car.layout.windows.find(w => !w.barricaded && w.hp < w.maxHp);
    if (!window) return null;

    this.isBarricading = true;
    this.barricadeProgress = 0;
    return window;
  }

  /** Continue barricading. Returns true when done. */
  public updateBarricade(delta: number, car: TrainCar, window: WindowState, inventory: InventoryManager): boolean {
    if (!this.isBarricading) return false;

    this.barricadeProgress += delta;
    if (this.barricadeProgress >= 2000) { // 2 seconds to barricade
      // Consume materials
      if (inventory.hasItem('barricade-boards', 1)) {
        inventory.removeItem('barricade-boards', 1);
      } else {
        inventory.removeItem('scrap-metal', BARRICADE_MATERIAL_COST);
      }

      window.barricaded = true;
      window.barricadeHp = BARRICADE_HP;
      window.hp = window.maxHp;
      this.isBarricading = false;
      this.barricadeProgress = 0;

      EventBus.emit('barricade:completed', window);
      return true;
    }
    return false;
  }

  /** Cancel barricading. */
  public cancelBarricade(): void {
    this.isBarricading = false;
    this.barricadeProgress = 0;
  }

  public getBarricadeProgress(): number {
    return this.barricadeProgress / 2000; // 0-1
  }

  // ---- Fire Events ----

  private updateFires(delta: number): void {
    this.fireTimer += delta;
    const interval = 60000 / FIRE_CHANCE_PER_MIN;

    // Check for new fires
    if (this.fireTimer > interval) {
      this.fireTimer = 0;
      if (Math.random() < FIRE_CHANCE_PER_MIN && this.fires.length === 0) {
        this.startFire();
      }
    }

    // Update existing fires
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const fire = this.fires[i];
      fire.timer += delta;

      // Flicker effect
      fire.sprite.setAlpha(0.5 + Math.sin(Date.now() * 0.01) * 0.3);

      // Fire spread — emit warning
      if (fire.timer > FIRE_SPREAD_TIME_MS) {
        EventBus.emit('fire:spreading', fire);
      }
    }
  }

  private startFire(): void {
    const carIndex = Math.floor(Math.random() * this.train.cars.length);
    const car = this.train.cars[carIndex];
    const tileX = 2 + Math.floor(Math.random() * 3);
    const tileY = 2 + Math.floor(Math.random() * 8);

    const sprite = this.scene.add.image(
      car.worldX + tileX * 32 + 16,
      car.worldY + tileY * 32 + 16,
      'fire-particle',
    );
    sprite.setDisplaySize(24, 24);
    sprite.setDepth(22);
    sprite.setTint(0xff6622);

    this.fires.push({ carIndex, tileX, tileY, timer: 0, sprite });
    EventBus.emit('fire:started', { carIndex, tileX, tileY });
  }

  /** Extinguish a fire. Player needs to be near it and press interact. */
  public extinguishFire(playerX: number, playerY: number, range: number): boolean {
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const fire = this.fires[i];
      const dx = playerX - fire.sprite.x;
      const dy = playerY - fire.sprite.y;
      if (dx * dx + dy * dy < range * range) {
        fire.sprite.destroy();
        this.fires.splice(i, 1);
        EventBus.emit('fire:extinguished');
        return true;
      }
    }
    return false;
  }

  /** Get active fire count. */
  public getFireCount(): number {
    return this.fires.length;
  }

  /** Has active fires? */
  public hasFires(): boolean {
    return this.fires.length > 0;
  }

  /** Cleanup. */
  public cleanup(): void {
    for (const z of this.breachZombies) {
      z.destroy();
    }
    this.breachZombies = [];

    for (const f of this.fires) {
      f.sprite.destroy();
    }
    this.fires = [];
  }
}
