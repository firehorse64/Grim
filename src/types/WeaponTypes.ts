export enum WeaponType {
  PISTOL = 'pistol',
  SHOTGUN = 'shotgun',
  SMG = 'smg',
  RIFLE = 'rifle',
  GRENADE = 'grenade',
}

export interface WeaponStats {
  name: string;
  damage: number;
  fireRate: number;        // ms between shots
  clipSize: number;
  reloadTime: number;      // ms
  bulletSpeed: number;     // px/s
  spread: number;          // radians of inaccuracy
  projectileType: 'bullet' | 'pellet' | 'grenade';
  projectilesPerShot: number;
  unlimitedReserve: boolean;
  maxReserve: number;
  knockback: number;
  piercing: boolean;
  explosionRadius: number; // 0 = no explosion
}

export interface WeaponState {
  type: WeaponType;
  currentAmmo: number;
  reserveAmmo: number;
  isReloading: boolean;
  reloadTimer: number;
  fireCooldown: number;
  level: number;
}
