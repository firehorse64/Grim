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
export const ZOMBIE_AMBIENT_SPEED = 40;
export const ZOMBIE_CHASE_SPEED = 90;
export const ZOMBIE_AGGRO_RANGE = 180;
export const ZOMBIE_DAMAGE = 15;
export const ZOMBIE_ATTACK_COOLDOWN_MS = 1200;
export const AMBIENT_ZOMBIE_SPAWN_INTERVAL = 3000;  // ms between ambient spawns

// Exploration
export const EXPLORE_AREA_WIDTH = 800;
export const EXPLORE_AREA_HEIGHT = 600;
export const EXPLORE_ZOMBIE_SPAWN_INTERVAL = 5000;
export const RESOURCE_SPAWN_COUNT = 8;

// Barricading
export const BARRICADE_HP = 80;
export const BARRICADE_BUILD_TIME_MS = 2000;

// Day / night  (for future use)
export const DAY_CYCLE_DURATION_MS = 600000;  // 10 minutes per full cycle
