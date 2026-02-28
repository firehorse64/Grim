export enum GameState {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  GAME_OVER = 'GAME_OVER',
}

export enum GameMode {
  TRAVELING = 'TRAVELING',
  STOPPED = 'STOPPED',
  EXPLORING = 'EXPLORING',
}

export enum Direction {
  UP = 'UP',
  DOWN = 'DOWN',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
}

export enum TimeOfDay {
  DAWN = 'DAWN',
  DAY = 'DAY',
  DUSK = 'DUSK',
  NIGHT = 'NIGHT',
}

export enum Weather {
  CLEAR = 'CLEAR',
  RAIN = 'RAIN',
  FOG = 'FOG',
  STORM = 'STORM',
}

export enum WeaponType {
  RIFLE = 'RIFLE',
  MELEE = 'MELEE',
}

export interface InputState {
  moveX: number;   // -1..1
  moveY: number;   // -1..1
  interact: boolean;
  attack: boolean;
  openInventory: boolean;
  cancel: boolean;
  pause: boolean;
}

export interface SurvivalState {
  hunger: number;   // 0..100
  energy: number;   // 0..100
  health: number;   // 0..100
}

export interface InventoryItem {
  id: string;
  name: string;
  type: 'food' | 'material' | 'medicine' | 'ammo' | 'tool';
  quantity: number;
  icon: string;      // texture key
}

export interface CraftRecipe {
  id: string;
  name: string;
  ingredients: { itemId: string; quantity: number }[];
  result: { itemId: string; quantity: number };
  requiredStation: 'workbench' | 'stove' | 'none';
}

export interface SaveData {
  version: number;
  survival: SurvivalState;
  inventory: InventoryItem[];
  gameMode: GameMode;
  timeOfDay: TimeOfDay;
  dayTime: number;
  trainMoving: boolean;
  npcNames: string[];
  windowStates: { carIndex: number; row: number; col: number; hp: number; barricaded: boolean }[];
  maintenanceHp: { engine: number; brake: number; wheels: number };
}
