// ============================
// Global Balance Constants
// ============================

// Game dimensions
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

// Physics
export const GRAVITY = 800;
export const TRAIN_SCROLL_SPEED = 120; // pixels per second for parallax

// Player defaults
export const PLAYER_START_HP = 100;
export const PLAYER_MAX_HP = 100;
export const PLAYER_SPEED = 200;
export const PLAYER_JUMP_VELOCITY = -420;
export const PLAYER_INVINCIBILITY_MS = 1000;
export const PLAYER_START_CURRENCY = 0;

// Train layout
export const NUM_TRAIN_CARS = 5;
export const CAR_WIDTH = 480;
export const CAR_INTERIOR_HEIGHT = 180;
export const CAR_GAP = 48;
export const CAR_FLOOR_Y = 480;
export const CAR_ROOF_Y = CAR_FLOOR_Y - CAR_INTERIOR_HEIGHT;
export const CAR_ROOF_WALK_Y = CAR_ROOF_Y - 20;
export const LADDER_WIDTH = 24;
export const BARRICADE_SLOTS_PER_CAR = 3;

// Wave system
export const WAVE_COUNTDOWN_MS = 8000;
export const WAVE_BASE_ZOMBIES = 5;
export const WAVE_ZOMBIE_SCALING = 3;     // additional zombies per wave
export const WAVE_SPAWN_INTERVAL_MS = 1800;
export const WAVE_SPAWN_INTERVAL_MIN = 600;
export const WAVE_SPAWN_SPEEDUP = 80;     // ms faster per wave
export const BOSS_WAVE_INTERVAL = 10;     // boss every N waves
export const DIFFICULTY_HP_SCALE = 0.08;  // zombie HP increases per wave
export const DIFFICULTY_SPEED_SCALE = 0.02;

// Combat
export const KNOCKBACK_FORCE = 150;
export const HEADSHOT_MULTIPLIER = 2.0;
export const CRIT_CHANCE = 0.05;
export const CRIT_MULTIPLIER = 1.5;

// Barricades
export const BARRICADE_WOOD_HP = 100;
export const BARRICADE_METAL_HP = 250;
export const BARRICADE_ELECTRIC_HP = 150;
export const BARRICADE_ELECTRIC_DAMAGE = 15;
export const BARRICADE_WOOD_COST = 30;
export const BARRICADE_METAL_COST = 75;
export const BARRICADE_ELECTRIC_COST = 100;

// Economy
export const BASE_CURRENCY_PER_KILL = 5;
export const WAVE_BONUS_CURRENCY = 50;
export const SURVIVOR_RESCUE_BONUS = 100;

// Day/night cycle
export const WAVES_PER_DAY_CYCLE = 8;

// Events
export const EVENT_CHANCE_BASE = 0.15;
export const EVENT_CHANCE_INCREASE = 0.05;
export const TUNNEL_DURATION_MS = 10000;
export const BRIDGE_DURATION_MS = 15000;
export const STATION_DURATION_MS = 25000;
