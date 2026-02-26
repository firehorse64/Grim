export enum UpgradeCategory {
  WEAPON = 'weapon',
  PLAYER = 'player',
  DEFENSE = 'defense',
  SPECIAL = 'special',
}

export interface UpgradeDefinition {
  id: string;
  name: string;
  description: string;
  category: UpgradeCategory;
  target: string | null;       // weapon type or null for global
  stat: string;
  value: number;
  cost: number;
  tier: number;
  maxTier: number;
  requires: string | null;     // prerequisite upgrade id
  icon: string;
}
