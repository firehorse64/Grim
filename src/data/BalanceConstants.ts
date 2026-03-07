// ============================
// Global Balance Constants
// ============================

// Game dimensions
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

// Tile / grid
export const TILE_SIZE = 32;
export const HALF_TILE = 16;

// Train car layout (in tiles).  Each car viewed from a 3/4 angle:
//   width  = interior walkable columns  (the aisle + seats on each side)
//   height = interior walkable rows     (length of the car along the aisle)
export const CAR_TILE_WIDTH = 7;       // 7 × 32 = 224 px interior width
export const CAR_TILE_HEIGHT = 12;     // 12 × 32 = 384 px interior length
export const CAR_PIXEL_WIDTH = CAR_TILE_WIDTH * TILE_SIZE;
export const CAR_PIXEL_HEIGHT = CAR_TILE_HEIGHT * TILE_SIZE;

// Perspective wall heights (for the 3/4-view rendered walls)
export const WALL_VISUAL_HEIGHT = 48;  // how tall walls look from the angle
export const WINDOW_WIDTH = 40;
export const WINDOW_HEIGHT = 28;

// Number of starting train cars
export const NUM_TRAIN_CARS = 3;

// Gap between cars (connector corridor)
export const CAR_GAP = 40;

// Player
export const PLAYER_SPEED = 140;
export const PLAYER_START_HP = 100;
export const PLAYER_MAX_HP = 100;
export const PLAYER_INTERACT_RANGE = 44;

// NPC
export const NPC_SPEED = 60;
export const NPC_IDLE_MIN_MS = 2000;
export const NPC_IDLE_MAX_MS = 5000;

// Survival
export const HUNGER_MAX = 100;
export const ENERGY_MAX = 100;
export const HUNGER_DECAY_PER_SEC = 0.12;      // ~14 min to empty
export const ENERGY_DECAY_PER_SEC = 0.06;       // ~28 min to empty
export const LOW_STAT_THRESHOLD = 25;           // warnings below this
export const CRITICAL_STAT_THRESHOLD = 10;      // health drain below this
export const HEALTH_DRAIN_PER_SEC = 0.5;        // when hunger/energy critical
export const SLEEP_RESTORE_AMOUNT = 80;
export const EAT_RESTORE_AMOUNT = 30;

// Train movement / scrolling
export const TRAIN_SCROLL_SPEED = 80;  // px/s exterior scrolls when train moves

// Zombies (ambient / exterior)
export const ZOMBIE_AMBIENT_SPEED = 18;
export const ZOMBIE_CHASE_SPEED = 38;
export const ZOMBIE_AGGRO_RANGE = 180;
export const ZOMBIE_DAMAGE = 5;
export const ZOMBIE_ATTACK_COOLDOWN_MS = 2000;
export const AMBIENT_ZOMBIE_SPAWN_INTERVAL = 2000;  // ms between ambient spawns
export const ZOMBIE_SPAWN_RADIUS = 25;              // how far from player zombies spawn
export const ZOMBIE_MAX_COUNT = 40;                  // max zombies at once

// Exploration
export const EXPLORE_AREA_WIDTH = 800;
export const EXPLORE_AREA_HEIGHT = 600;
export const EXPLORE_ZOMBIE_SPAWN_INTERVAL = 5000;
export const RESOURCE_SPAWN_COUNT = 8;

// Combat
export const RIFLE_DAMAGE = 25;
export const RIFLE_FIRE_RATE_MS = 400;
export const RIFLE_RANGE = 200;
export const MELEE_DAMAGE = 15;
export const MELEE_RANGE = 36;
export const MELEE_COOLDOWN_MS = 500;
export const BULLET_SPEED = 350;

// Inventory
export const INVENTORY_MAX_SLOTS = 20;
export const STARTING_AMMO = 15;
export const STARTING_FOOD = 3;
export const STARTING_MATERIALS = 5;

// Barricading
export const BARRICADE_HP = 80;
export const BARRICADE_BUILD_TIME_MS = 2000;
export const BARRICADE_MATERIAL_COST = 3;
export const WINDOW_MAX_HP = 50;

// Maintenance
export const ENGINE_MAX_HP = 100;
export const ENGINE_DEGRADE_PER_SEC = 0.03;
export const BRAKE_MAX_HP = 100;
export const BRAKE_DEGRADE_PER_SEC = 0.02;
export const WHEELS_MAX_HP = 100;
export const WHEELS_DEGRADE_PER_SEC = 0.015;
export const REPAIR_MATERIAL_COST = 2;
export const REPAIR_AMOUNT = 30;
export const MAINTENANCE_WARNING_THRESHOLD = 30;

// Day / night
export const DAY_CYCLE_DURATION_MS = 600000;  // 10 minutes per full cycle
export const DAY_PHASE_DURATION_MS = 150000;  // 2.5 min per phase
export const NIGHT_ZOMBIE_MULTIPLIER = 2.0;
export const NIGHT_AMBIENT_ALPHA = 0.35;

// Zombie variants
export const CRAWLER_HP = 30;
export const CRAWLER_SPEED = 12;
export const CRAWLER_DAMAGE = 3;
export const RUNNER_HP = 35;
export const RUNNER_SPEED = 70;
export const RUNNER_DAMAGE = 8;
export const SCREAMER_HP = 25;
export const SCREAMER_SPEED = 15;
export const SCREAMER_DAMAGE = 2;
export const SCREAMER_ALERT_RANGE = 20;
export const EXPLODER_HP = 40;
export const EXPLODER_SPEED = 14;
export const EXPLODER_DAMAGE = 25;
export const EXPLODER_RADIUS = 4;

// Horde night
export const HORDE_CYCLE_DAYS = 7;
export const HORDE_DURATION_MS = 90000;     // 1.5 minutes of horde
export const HORDE_SPAWN_INTERVAL = 400;    // rapid spawning during horde
export const HORDE_MAX_ZOMBIES = 80;
export const HORDE_WARNING_TIME_MS = 15000; // 15s warning before horde

// Stealth
export const CROUCH_SPEED_MULT = 0.4;
export const CROUCH_NOISE_MULT = 0.3;
export const STANDING_NOISE_RADIUS = 8;
export const SPRINT_NOISE_RADIUS = 16;
export const GUNSHOT_NOISE_RADIUS = 40;
export const MELEE_NOISE_RADIUS = 6;
export const STEALTH_KILL_MULT = 3.0; // damage multiplier from behind

// Weapon durability
export const RIFLE_MAX_DURABILITY = 100;
export const MELEE_MAX_DURABILITY = 80;
export const RIFLE_DURABILITY_COST = 2;   // per shot
export const MELEE_DURABILITY_COST = 3;   // per swing
export const REPAIR_WEAPON_COST = 2;      // materials to repair

// Barricading
export const BARRICADE_MAX_HP = 80;
export const BARRICADE_BUILD_COST = 2;     // materials per barricade

// Exploration
export const BUILDING_COUNT_MIN = 2;
export const BUILDING_COUNT_MAX = 4;
export const BUILDING_MIN_SIZE = 4;
export const BUILDING_MAX_SIZE = 7;
export const EXPLORE_RESOURCE_TOTAL = 10;
export const EXPLORE_ZOMBIE_MAX = 8;
export const EXIT_TRAIN_RANGE = 40;

// Fire events
export const FIRE_CHANCE_PER_MIN = 0.02;
export const FIRE_DAMAGE_PER_SEC = 5;
export const FIRE_SPREAD_TIME_MS = 8000;

// Breach
export const BREACH_CHANCE_PER_MIN_STOPPED = 0.08;
export const ZOMBIE_WINDOW_DAMAGE = 2;
export const BREACH_ZOMBIE_COUNT = 2;

// NPC
export const MAX_NPCS = 4;
export const NPC_RECRUIT_CHANCE = 0.3;

// Crafting
export const CRAFT_TIME_MS = 1500;

// Save
export const SAVE_VERSION = 1;
export const SAVE_KEY = 'grim-line-save';

// Fuel
export const FUEL_MAX = 100;
export const FUEL_CONSUMPTION_PER_SEC = 0.08;
export const FUEL_PER_SCRAP = 10;

// Train speed
export const TRAIN_SPEED_MIN = 30;
export const TRAIN_SPEED_MAX = 160;
export const TRAIN_SPEED_DEFAULT = 80;
export const TRAIN_SPEED_STEP = 10;

// World expansion
export const WORLD_EXPAND_LEFT = 400;
export const WORLD_EXPAND_RIGHT = 400;

// Travel
export const TRAVEL_SPEED_FACTOR = 0.5;
