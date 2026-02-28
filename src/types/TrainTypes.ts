export enum TileType {
  EMPTY = 0,
  FLOOR = 1,
  WALL = 2,
  WINDOW = 3,
  DOOR = 4,
  SEAT_LEFT = 5,
  SEAT_RIGHT = 6,
  SHELF = 7,
}

export enum FurnitureType {
  BED = 'BED',
  STORAGE_CRATE = 'STORAGE_CRATE',
  WORKBENCH = 'WORKBENCH',
  BRAKE_PANEL = 'BRAKE_PANEL',
  COOKING_STOVE = 'COOKING_STOVE',
  BARRICADE_SPOT = 'BARRICADE_SPOT',
  FIRST_AID = 'FIRST_AID',
  PLANT_BOX = 'PLANT_BOX',
}

export enum CarPurpose {
  ENGINE = 'ENGINE',
  LIVING = 'LIVING',
  STORAGE = 'STORAGE',
}

export interface PlacedFurniture {
  type: FurnitureType;
  tileX: number;
  tileY: number;
  widthTiles: number;
  heightTiles: number;
  hp?: number;
  maxHp?: number;
  uses?: number;          // e.g. food crate has limited uses
  interactPrompt: string; // e.g. "Press E to Sleep"
}

export interface WindowState {
  row: number;
  col: number;
  hp: number;
  maxHp: number;
  barricaded: boolean;
  barricadeHp: number;
}

export interface MaintenanceComponent {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  degradeRate: number; // per second while moving
}

export interface CarLayout {
  purpose: CarPurpose;
  tiles: TileType[][];         // [row][col]
  furniture: PlacedFurniture[];
  windows: WindowState[];
}
