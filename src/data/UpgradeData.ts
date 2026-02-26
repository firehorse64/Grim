import { UpgradeDefinition, UpgradeCategory } from '../types/UpgradeTypes';

export const UPGRADES: UpgradeDefinition[] = [
  // --- Pistol Upgrades ---
  {
    id: 'pistol-dmg-1', name: 'Pistol Damage I', description: '+25% pistol damage',
    category: UpgradeCategory.WEAPON, target: 'pistol', stat: 'damage', value: 0.25,
    cost: 40, tier: 1, maxTier: 3, requires: null, icon: 'pistol',
  },
  {
    id: 'pistol-dmg-2', name: 'Pistol Damage II', description: '+25% pistol damage',
    category: UpgradeCategory.WEAPON, target: 'pistol', stat: 'damage', value: 0.25,
    cost: 100, tier: 2, maxTier: 3, requires: 'pistol-dmg-1', icon: 'pistol',
  },
  {
    id: 'pistol-dmg-3', name: 'Pistol Damage III', description: '+30% pistol damage',
    category: UpgradeCategory.WEAPON, target: 'pistol', stat: 'damage', value: 0.30,
    cost: 200, tier: 3, maxTier: 3, requires: 'pistol-dmg-2', icon: 'pistol',
  },
  {
    id: 'pistol-clip-1', name: 'Extended Mag', description: '+6 pistol clip size',
    category: UpgradeCategory.WEAPON, target: 'pistol', stat: 'clipSize', value: 6,
    cost: 60, tier: 1, maxTier: 2, requires: null, icon: 'pistol',
  },
  {
    id: 'pistol-clip-2', name: 'Extended Mag II', description: '+6 pistol clip size',
    category: UpgradeCategory.WEAPON, target: 'pistol', stat: 'clipSize', value: 6,
    cost: 150, tier: 2, maxTier: 2, requires: 'pistol-clip-1', icon: 'pistol',
  },

  // --- Shotgun Upgrades ---
  {
    id: 'shotgun-dmg-1', name: 'Shotgun Power I', description: '+25% shotgun damage',
    category: UpgradeCategory.WEAPON, target: 'shotgun', stat: 'damage', value: 0.25,
    cost: 60, tier: 1, maxTier: 3, requires: null, icon: 'shotgun',
  },
  {
    id: 'shotgun-dmg-2', name: 'Shotgun Power II', description: '+25% shotgun damage',
    category: UpgradeCategory.WEAPON, target: 'shotgun', stat: 'damage', value: 0.25,
    cost: 140, tier: 2, maxTier: 3, requires: 'shotgun-dmg-1', icon: 'shotgun',
  },
  {
    id: 'shotgun-spread-1', name: 'Tighter Choke', description: '-30% shotgun spread',
    category: UpgradeCategory.WEAPON, target: 'shotgun', stat: 'spread', value: -0.30,
    cost: 80, tier: 1, maxTier: 2, requires: null, icon: 'shotgun',
  },

  // --- SMG Upgrades ---
  {
    id: 'smg-dmg-1', name: 'SMG Damage I', description: '+25% SMG damage',
    category: UpgradeCategory.WEAPON, target: 'smg', stat: 'damage', value: 0.25,
    cost: 50, tier: 1, maxTier: 3, requires: null, icon: 'smg',
  },
  {
    id: 'smg-clip-1', name: 'SMG Drum Mag', description: '+15 SMG clip size',
    category: UpgradeCategory.WEAPON, target: 'smg', stat: 'clipSize', value: 15,
    cost: 70, tier: 1, maxTier: 2, requires: null, icon: 'smg',
  },

  // --- Rifle Upgrades ---
  {
    id: 'rifle-dmg-1', name: 'Rifle Damage I', description: '+25% rifle damage',
    category: UpgradeCategory.WEAPON, target: 'rifle', stat: 'damage', value: 0.25,
    cost: 80, tier: 1, maxTier: 3, requires: null, icon: 'rifle',
  },
  {
    id: 'rifle-reload-1', name: 'Quick Bolt', description: '-20% rifle reload time',
    category: UpgradeCategory.WEAPON, target: 'rifle', stat: 'reloadTime', value: -0.20,
    cost: 100, tier: 1, maxTier: 2, requires: null, icon: 'rifle',
  },

  // --- Player Upgrades ---
  {
    id: 'player-hp-1', name: 'Tough Skin I', description: '+25 max HP',
    category: UpgradeCategory.PLAYER, target: null, stat: 'maxHp', value: 25,
    cost: 60, tier: 1, maxTier: 3, requires: null, icon: 'health',
  },
  {
    id: 'player-hp-2', name: 'Tough Skin II', description: '+25 max HP',
    category: UpgradeCategory.PLAYER, target: null, stat: 'maxHp', value: 25,
    cost: 120, tier: 2, maxTier: 3, requires: 'player-hp-1', icon: 'health',
  },
  {
    id: 'player-hp-3', name: 'Tough Skin III', description: '+50 max HP',
    category: UpgradeCategory.PLAYER, target: null, stat: 'maxHp', value: 50,
    cost: 250, tier: 3, maxTier: 3, requires: 'player-hp-2', icon: 'health',
  },
  {
    id: 'player-speed-1', name: 'Quick Feet I', description: '+15% move speed',
    category: UpgradeCategory.PLAYER, target: null, stat: 'speed', value: 0.15,
    cost: 50, tier: 1, maxTier: 2, requires: null, icon: 'speed',
  },
  {
    id: 'player-speed-2', name: 'Quick Feet II', description: '+15% move speed',
    category: UpgradeCategory.PLAYER, target: null, stat: 'speed', value: 0.15,
    cost: 120, tier: 2, maxTier: 2, requires: 'player-speed-1', icon: 'speed',
  },
  {
    id: 'player-regen-1', name: 'Regeneration', description: 'Slowly regenerate HP',
    category: UpgradeCategory.PLAYER, target: null, stat: 'regen', value: 1,
    cost: 200, tier: 1, maxTier: 1, requires: 'player-hp-1', icon: 'health',
  },

  // --- Defense Upgrades ---
  {
    id: 'barricade-hp-1', name: 'Reinforced I', description: '+50% barricade HP',
    category: UpgradeCategory.DEFENSE, target: null, stat: 'barricadeHp', value: 0.50,
    cost: 50, tier: 1, maxTier: 3, requires: null, icon: 'barricade',
  },
  {
    id: 'barricade-hp-2', name: 'Reinforced II', description: '+50% barricade HP',
    category: UpgradeCategory.DEFENSE, target: null, stat: 'barricadeHp', value: 0.50,
    cost: 120, tier: 2, maxTier: 3, requires: 'barricade-hp-1', icon: 'barricade',
  },

  // --- Special Upgrades ---
  {
    id: 'currency-bonus-1', name: 'Scavenger I', description: '+25% currency from kills',
    category: UpgradeCategory.SPECIAL, target: null, stat: 'currencyMult', value: 0.25,
    cost: 80, tier: 1, maxTier: 2, requires: null, icon: 'coin',
  },
  {
    id: 'currency-bonus-2', name: 'Scavenger II', description: '+25% currency from kills',
    category: UpgradeCategory.SPECIAL, target: null, stat: 'currencyMult', value: 0.25,
    cost: 180, tier: 2, maxTier: 2, requires: 'currency-bonus-1', icon: 'coin',
  },
  {
    id: 'crit-chance-1', name: 'Steady Aim', description: '+5% critical hit chance',
    category: UpgradeCategory.SPECIAL, target: null, stat: 'critChance', value: 0.05,
    cost: 100, tier: 1, maxTier: 3, requires: null, icon: 'crosshair',
  },
];
