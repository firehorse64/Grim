import Phaser from 'phaser';
import { EventBus } from '../utils/EventBus';
import { Zombie } from '../entities/zombies/Zombie';
import {
  TILE_SIZE,
  BUILDING_COUNT_MIN,
  BUILDING_COUNT_MAX,
  BUILDING_MIN_SIZE,
  BUILDING_MAX_SIZE,
  EXPLORE_RESOURCE_TOTAL,
  EXPLORE_ZOMBIE_MAX,
  EXPLORE_ZOMBIE_SPAWN_INTERVAL,
  EXPLORE_AREA_WIDTH,
  EXPLORE_AREA_HEIGHT,
} from '../data/BalanceConstants';

interface Building {
  x: number;
  y: number;
  w: number;
  h: number;
  walls: Phaser.Physics.Arcade.StaticGroup;
  container: Phaser.GameObjects.Container;
}

interface ResourcePickup {
  sprite: Phaser.GameObjects.Image;
  itemId: string;
  name: string;
  type: 'food' | 'material' | 'medicine' | 'ammo';
  icon: string;
  quantity: number;
}

/**
 * Manages exploration when the train is stopped.
 * Generates buildings, resources, and hostile zombies around the train.
 */
export class ExplorationManager {
  private scene!: Phaser.Scene;
  public active: boolean = false;

  private buildings: Building[] = [];
  private resources: ResourcePickup[] = [];
  private zombies: Zombie[] = [];
  private zombieTimer: number = 0;

  private floorTiles: Phaser.GameObjects.Image[] = [];
  private areaX: number = 0;
  private areaY: number = 0;

  public create(scene: Phaser.Scene): void {
    this.scene = scene;
    this.active = false;
  }

  /** Generate the exploration area around the train. */
  public generate(
    trainBounds: { x: number; y: number; w: number; h: number },
  ): { walls: Phaser.Physics.Arcade.StaticGroup[]; bounds: { x: number; y: number; w: number; h: number } } {
    this.active = true;
    this.zombieTimer = 0;

    // Exploration area extends below the train
    this.areaX = trainBounds.x - EXPLORE_AREA_WIDTH / 2;
    this.areaY = trainBounds.y + trainBounds.h + 20;

    // Ground tiles for the exploration area
    for (let gx = this.areaX; gx < this.areaX + EXPLORE_AREA_WIDTH; gx += TILE_SIZE) {
      for (let gy = this.areaY; gy < this.areaY + EXPLORE_AREA_HEIGHT; gy += TILE_SIZE) {
        const tex = Math.random() < 0.6 ? 'ground-dirt' : 'ground-grass';
        const tile = this.scene.add.image(gx + TILE_SIZE / 2, gy + TILE_SIZE / 2, tex);
        tile.setDisplaySize(TILE_SIZE, TILE_SIZE);
        tile.setDepth(0);
        this.floorTiles.push(tile);
      }
    }

    // Road through center
    const roadX = this.areaX + EXPLORE_AREA_WIDTH / 2 - TILE_SIZE * 2;
    for (let gy = this.areaY; gy < this.areaY + EXPLORE_AREA_HEIGHT; gy += TILE_SIZE) {
      for (let rx = 0; rx < 4; rx++) {
        const tile = this.scene.add.image(
          roadX + rx * TILE_SIZE + TILE_SIZE / 2,
          gy + TILE_SIZE / 2,
          'ground-gravel',
        );
        tile.setDisplaySize(TILE_SIZE, TILE_SIZE);
        tile.setDepth(0.1);
        this.floorTiles.push(tile);
      }
    }

    // Generate buildings
    const allWalls: Phaser.Physics.Arcade.StaticGroup[] = [];
    const numBuildings = BUILDING_COUNT_MIN + Math.floor(Math.random() * (BUILDING_COUNT_MAX - BUILDING_COUNT_MIN + 1));

    for (let i = 0; i < numBuildings; i++) {
      const bw = BUILDING_MIN_SIZE + Math.floor(Math.random() * (BUILDING_MAX_SIZE - BUILDING_MIN_SIZE + 1));
      const bh = BUILDING_MIN_SIZE + Math.floor(Math.random() * (BUILDING_MAX_SIZE - BUILDING_MIN_SIZE + 1));

      // Position building in the exploration area, avoiding road center
      let bx: number;
      if (Math.random() < 0.5) {
        bx = this.areaX + 20 + Math.random() * (EXPLORE_AREA_WIDTH / 2 - bw * TILE_SIZE - 80);
      } else {
        bx = this.areaX + EXPLORE_AREA_WIDTH / 2 + 80 + Math.random() * (EXPLORE_AREA_WIDTH / 2 - bw * TILE_SIZE - 100);
      }
      const by = this.areaY + 40 + Math.random() * (EXPLORE_AREA_HEIGHT - bh * TILE_SIZE - 80);

      const building = this.createBuilding(bx, by, bw, bh);
      this.buildings.push(building);
      allWalls.push(building.walls);
    }

    // Spawn resources — some inside buildings, some outside
    this.spawnResources();

    const bounds = {
      x: this.areaX - 50,
      y: this.areaY - 50,
      w: EXPLORE_AREA_WIDTH + 100,
      h: EXPLORE_AREA_HEIGHT + 100,
    };

    EventBus.emit('exploration:started');
    return { walls: allWalls, bounds };
  }

  private createBuilding(x: number, y: number, widthTiles: number, heightTiles: number): Building {
    const container = this.scene.add.container(0, 0);
    const walls = this.scene.physics.add.staticGroup();

    const pw = widthTiles * TILE_SIZE;
    const ph = heightTiles * TILE_SIZE;

    // Floor
    for (let tx = 0; tx < widthTiles; tx++) {
      for (let ty = 0; ty < heightTiles; ty++) {
        const floor = this.scene.add.image(
          x + tx * TILE_SIZE + TILE_SIZE / 2,
          y + ty * TILE_SIZE + TILE_SIZE / 2,
          'building-floor',
        );
        floor.setDisplaySize(TILE_SIZE, TILE_SIZE);
        floor.setDepth(0.2);
        container.add(floor);
      }
    }

    // Walls
    for (let tx = 0; tx < widthTiles; tx++) {
      for (let ty = 0; ty < heightTiles; ty++) {
        const isEdge = tx === 0 || tx === widthTiles - 1 || ty === 0 || ty === heightTiles - 1;
        if (!isEdge) continue;

        // Door opening at bottom center
        const isDoor = ty === heightTiles - 1 && tx === Math.floor(widthTiles / 2);
        if (isDoor) continue;

        const wx = x + tx * TILE_SIZE + TILE_SIZE / 2;
        const wy = y + ty * TILE_SIZE + TILE_SIZE / 2;

        const wallImg = this.scene.add.image(wx, wy, 'building-wall');
        wallImg.setDisplaySize(TILE_SIZE, TILE_SIZE);
        wallImg.setDepth(3);
        container.add(wallImg);

        const body = walls.create(wx, wy, 'pixel') as Phaser.Physics.Arcade.Sprite;
        body.setDisplaySize(TILE_SIZE, TILE_SIZE);
        body.setVisible(false);
        body.refreshBody();
      }
    }

    // Shelves inside (decorative + loot spawn points)
    if (widthTiles > 3 && heightTiles > 3) {
      const shelfImg = this.scene.add.image(
        x + TILE_SIZE * 1.5,
        y + TILE_SIZE * 1.5,
        'train-shelf',
      );
      shelfImg.setDisplaySize(TILE_SIZE, 16);
      shelfImg.setDepth(4);
      container.add(shelfImg);
    }

    return { x, y, w: pw, h: ph, walls, container };
  }

  private spawnResources(): void {
    const resourceTypes = [
      { itemId: 'canned-food', name: 'Canned Food', type: 'food' as const, icon: 'pickup-food', quantity: 1 },
      { itemId: 'scrap-metal', name: 'Scrap Metal', type: 'material' as const, icon: 'pickup-material', quantity: 2 },
      { itemId: 'bandage', name: 'Bandage', type: 'medicine' as const, icon: 'pickup-medicine', quantity: 1 },
      { itemId: 'ammo-rifle', name: 'Rifle Ammo', type: 'ammo' as const, icon: 'pickup-material', quantity: 3 },
      { itemId: 'water-bottle', name: 'Water Bottle', type: 'food' as const, icon: 'pickup-water', quantity: 1 },
      { itemId: 'scrap-metal', name: 'Scrap Metal', type: 'material' as const, icon: 'pickup-material', quantity: 3 },
    ];

    for (let i = 0; i < EXPLORE_RESOURCE_TOTAL; i++) {
      const rType = resourceTypes[Math.floor(Math.random() * resourceTypes.length)];

      let rx: number, ry: number;

      // Half inside buildings, half outside
      if (i < EXPLORE_RESOURCE_TOTAL / 2 && this.buildings.length > 0) {
        const b = this.buildings[Math.floor(Math.random() * this.buildings.length)];
        rx = b.x + TILE_SIZE + Math.random() * (b.w - TILE_SIZE * 2);
        ry = b.y + TILE_SIZE + Math.random() * (b.h - TILE_SIZE * 2);
      } else {
        rx = this.areaX + 30 + Math.random() * (EXPLORE_AREA_WIDTH - 60);
        ry = this.areaY + 30 + Math.random() * (EXPLORE_AREA_HEIGHT - 60);
      }

      const sprite = this.scene.add.image(rx, ry, rType.icon);
      sprite.setDisplaySize(16, 16);
      sprite.setDepth(5);

      // Floating bob animation
      this.scene.tweens.add({
        targets: sprite,
        y: ry - 4,
        yoyo: true,
        repeat: -1,
        duration: 800 + Math.random() * 400,
        ease: 'Sine.easeInOut',
      });

      // Glow effect
      const glow = this.scene.add.image(rx, ry, 'pixel');
      glow.setDisplaySize(20, 20);
      glow.setTint(0xffff88);
      glow.setAlpha(0.15);
      glow.setDepth(4.9);
      this.scene.tweens.add({
        targets: glow,
        alpha: 0.05,
        yoyo: true,
        repeat: -1,
        duration: 1000,
      });

      this.resources.push({
        sprite,
        itemId: rType.itemId,
        name: rType.name,
        type: rType.type,
        icon: rType.icon,
        quantity: rType.quantity,
      });
    }
  }

  /** Update exploration — spawn zombies, etc. */
  public update(delta: number, playerX: number, playerY: number): void {
    if (!this.active) return;

    // Spawn zombies
    this.zombieTimer += delta;
    if (this.zombieTimer > EXPLORE_ZOMBIE_SPAWN_INTERVAL && this.zombies.length < EXPLORE_ZOMBIE_MAX) {
      this.zombieTimer = 0;
      this.spawnExploreZombie(playerX, playerY);
    }

    // Update zombies
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      if (!z.isAlive()) {
        z.destroy();
        this.zombies.splice(i, 1);
        continue;
      }
      z.updateZombie(0, delta, 0, playerX, playerY);
    }
  }

  /** Check if player is near a resource pickup. Returns the resource if within range. */
  public checkPickup(px: number, py: number, range: number): ResourcePickup | null {
    for (const r of this.resources) {
      const dx = px - r.sprite.x;
      const dy = py - r.sprite.y;
      if (dx * dx + dy * dy < range * range) {
        return r;
      }
    }
    return null;
  }

  /** Collect a resource (remove from world). */
  public collectResource(resource: ResourcePickup): void {
    resource.sprite.destroy();
    this.resources = this.resources.filter(r => r !== resource);
  }

  /** Get all exploration zombies. */
  public getZombies(): Zombie[] {
    return this.zombies;
  }

  private spawnExploreZombie(playerX: number, playerY: number): void {
    // Spawn at random edge of exploration area
    const angle = Math.random() * Math.PI * 2;
    const dist = 200 + Math.random() * 100;
    const x = playerX + Math.cos(angle) * dist;
    const y = playerY + Math.sin(angle) * dist;

    // Clamp to exploration area
    const cx = Math.max(this.areaX, Math.min(this.areaX + EXPLORE_AREA_WIDTH, x));
    const cy = Math.max(this.areaY, Math.min(this.areaY + EXPLORE_AREA_HEIGHT, y));

    const zombie = new Zombie(this.scene, cx, cy);
    zombie.setChasing();
    this.zombies.push(zombie);
  }

  /** Clean up all exploration objects. */
  public cleanup(): void {
    for (const b of this.buildings) {
      b.container.destroy();
      b.walls.clear(true, true);
    }
    this.buildings = [];

    for (const r of this.resources) {
      r.sprite.destroy();
    }
    this.resources = [];

    for (const z of this.zombies) {
      z.destroy();
    }
    this.zombies = [];

    for (const t of this.floorTiles) {
      t.destroy();
    }
    this.floorTiles = [];

    this.active = false;
    EventBus.emit('exploration:ended');
  }

  /** Get exploration area bounds. */
  public getBounds(): { x: number; y: number; w: number; h: number } {
    return {
      x: this.areaX,
      y: this.areaY,
      w: EXPLORE_AREA_WIDTH,
      h: EXPLORE_AREA_HEIGHT,
    };
  }
}
