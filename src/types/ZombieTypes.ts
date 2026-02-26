export enum ZombieType {
  WALKER = 'walker',
  RUNNER = 'runner',
  TANK = 'tank',
  CRAWLER = 'crawler',
  SPITTER = 'spitter',
}

export enum BossType {
  BRUTE = 'brute',
  HIVE = 'hive',
}

export interface ZombieStats {
  hp: number;
  speed: number;
  damage: number;
  attackRate: number;       // ms between attacks
  points: number;
  currencyDrop: number;
  width: number;
  height: number;
  canClimbBarricade: boolean;
  canCrawlUnder: boolean;
  isRanged: boolean;
  projectileType?: string;
  color: number;            // tint color
}

export enum ZombieState {
  SPAWNING = 'spawning',
  APPROACHING = 'approaching',
  ATTACKING = 'attacking',
  STUNNED = 'stunned',
  DYING = 'dying',
}
