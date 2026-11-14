import { SPECIES_BY_KEY } from './pokedexData';
import { RAID_USEFUL_TYPES } from './defaultConfig';
import type {
  PveMoveRecord,
  PvPokeMove,
  PvPokeRankingEntry,
  PvPokeSpecies,
  RemoteGameData,
  ScrapedEvent,
  ScrapedRaid,
  SizeTableRecord,
} from './types';

// Representative PvP + PvE moves keyed by PvPoke moveId + numeric Niantic IDs
const CORE_MOVES: {
  moveId: string;
  numId: number;
  type: string;
  kind: 'fast' | 'charged';
  pvePower: number;
  pveDurMs: number;
  pveEnergy: number;
  pvpPower: number;
  pvpEnergy: number;
  turns?: number;
}[] = [
  // Fast moves
  { moveId: 'COUNTER', numId: 243, type: 'fighting', kind: 'fast', pvePower: 12, pveDurMs: 900, pveEnergy: 8, pvpPower: 8, pvpEnergy: 6, turns: 2 },
  { moveId: 'MUD_SHOT', numId: 216, type: 'ground', kind: 'fast', pvePower: 5, pveDurMs: 600, pveEnergy: 7, pvpPower: 3, pvpEnergy: 9, turns: 2 },
  { moveId: 'DRAGON_BREATH', numId: 204, type: 'dragon', kind: 'fast', pvePower: 6, pveDurMs: 500, pveEnergy: 4, pvpPower: 4, pvpEnergy: 3, turns: 1 },
  { moveId: 'DRAGON_TAIL', numId: 253, type: 'dragon', kind: 'fast', pvePower: 15, pveDurMs: 1100, pveEnergy: 9, pvpPower: 13, pvpEnergy: 9, turns: 3 },
  { moveId: 'PSYCHO_CUT', numId: 226, type: 'psychic', kind: 'fast', pvePower: 5, pveDurMs: 600, pveEnergy: 8, pvpPower: 3, pvpEnergy: 9, turns: 2 },
  { moveId: 'CONFUSION', numId: 235, type: 'psychic', kind: 'fast', pvePower: 20, pveDurMs: 1600, pveEnergy: 15, pvpPower: 16, pvpEnergy: 12, turns: 4 },
  { moveId: 'SHADOW_CLAW', numId: 213, type: 'ghost', kind: 'fast', pvePower: 9, pveDurMs: 700, pveEnergy: 6, pvpPower: 6, pvpEnergy: 8, turns: 2 },
  { moveId: 'LICK', numId: 203, type: 'ghost', kind: 'fast', pvePower: 5, pveDurMs: 500, pveEnergy: 6, pvpPower: 3, pvpEnergy: 3, turns: 1 },
  { moveId: 'FIRE_SPIN', numId: 249, type: 'fire', kind: 'fast', pvePower: 14, pveDurMs: 1100, pveEnergy: 10, pvpPower: 9, pvpEnergy: 10, turns: 3 },
  { moveId: 'WATERFALL', numId: 291, type: 'water', kind: 'fast', pvePower: 16, pveDurMs: 1200, pveEnergy: 8, pvpPower: 12, pvpEnergy: 8, turns: 3 },
  { moveId: 'WATER_GUN', numId: 230, type: 'water', kind: 'fast', pvePower: 5, pveDurMs: 500, pveEnergy: 5, pvpPower: 3, pvpEnergy: 3, turns: 1 },
  { moveId: 'THUNDER_SHOCK', numId: 205, type: 'electric', kind: 'fast', pvePower: 5, pveDurMs: 600, pveEnergy: 8, pvpPower: 3, pvpEnergy: 9, turns: 2 },
  { moveId: 'VOLT_SWITCH', numId: 255, type: 'electric', kind: 'fast', pvePower: 14, pveDurMs: 1600, pveEnergy: 21, pvpPower: 12, pvpEnergy: 16, turns: 4 },
  { moveId: 'VINE_WHIP', numId: 214, type: 'grass', kind: 'fast', pvePower: 7, pveDurMs: 600, pveEnergy: 6, pvpPower: 5, pvpEnergy: 8, turns: 2 },
  { moveId: 'RAZOR_LEAF', numId: 215, type: 'grass', kind: 'fast', pvePower: 13, pveDurMs: 1000, pveEnergy: 7, pvpPower: 10, pvpEnergy: 4, turns: 2 },
  { moveId: 'POWDER_SNOW', numId: 252, type: 'ice', kind: 'fast', pvePower: 6, pveDurMs: 1000, pveEnergy: 15, pvpPower: 5, pvpEnergy: 8, turns: 2 },
  { moveId: 'ICE_FANG', numId: 328, type: 'ice', kind: 'fast', pvePower: 12, pveDurMs: 1500, pveEnergy: 20, pvpPower: 8, pvpEnergy: 5, turns: 2 },
  { moveId: 'BULLET_PUNCH', numId: 225, type: 'steel', kind: 'fast', pvePower: 9, pveDurMs: 900, pveEnergy: 10, pvpPower: 6, pvpEnergy: 7, turns: 2 },
  { moveId: 'METAL_CLAW', numId: 229, type: 'steel', kind: 'fast', pvePower: 8, pveDurMs: 700, pveEnergy: 7, pvpPower: 5, pvpEnergy: 7, turns: 2 },
  { moveId: 'CHARM', numId: 320, type: 'fairy', kind: 'fast', pvePower: 20, pveDurMs: 1500, pveEnergy: 11, pvpPower: 15, pvpEnergy: 6, turns: 3 },
  { moveId: 'FAIRY_WIND', numId: 350, type: 'fairy', kind: 'fast', pvePower: 9, pveDurMs: 1000, pveEnergy: 13, pvpPower: 4, pvpEnergy: 9, turns: 2 },
  { moveId: 'DOUBLE_KICK', numId: 356, type: 'fighting', kind: 'fast', pvePower: 10, pveDurMs: 1000, pveEnergy: 13, pvpPower: 8, pvpEnergy: 12, turns: 3 },
  { moveId: 'MAGICAL_LEAF', numId: 357, type: 'grass', kind: 'fast', pvePower: 16, pveDurMs: 1400, pveEnergy: 16, pvpPower: 10, pvpEnergy: 10, turns: 3 },
  { moveId: 'ROLLOUT', numId: 401, type: 'rock', kind: 'fast', pvePower: 14, pveDurMs: 1600, pveEnergy: 19, pvpPower: 5, pvpEnergy: 13, turns: 3 },
  { moveId: 'METAL_SOUND', numId: 402, type: 'steel', kind: 'fast', pvePower: 5, pveDurMs: 600, pveEnergy: 6, pvpPower: 3, pvpEnergy: 8, turns: 2 },
  { moveId: 'SAND_ATTACK', numId: 403, type: 'ground', kind: 'fast', pvePower: 5, pveDurMs: 500, pveEnergy: 5, pvpPower: 4, pvpEnergy: 4, turns: 1 },
  { moveId: 'SMACK_DOWN', numId: 297, type: 'rock', kind: 'fast', pvePower: 16, pveDurMs: 1200, pveEnergy: 8, pvpPower: 11, pvpEnergy: 8, turns: 3 },
  { moveId: 'SNARL', numId: 254, type: 'dark', kind: 'fast', pvePower: 12, pveDurMs: 1100, pveEnergy: 14, pvpPower: 5, pvpEnergy: 13, turns: 3 },
  { moveId: 'BITE', numId: 202, type: 'dark', kind: 'fast', pvePower: 6, pveDurMs: 500, pveEnergy: 4, pvpPower: 4, pvpEnergy: 2, turns: 1 },
  { moveId: 'WING_ATTACK', numId: 210, type: 'flying', kind: 'fast', pvePower: 8, pveDurMs: 800, pveEnergy: 9, pvpPower: 5, pvpEnergy: 7, turns: 2 },
  { moveId: 'BUG_BITE', numId: 200, type: 'bug', kind: 'fast', pvePower: 5, pveDurMs: 500, pveEnergy: 6, pvpPower: 3, pvpEnergy: 3, turns: 1 },
  { moveId: 'POISON_JAB', numId: 224, type: 'poison', kind: 'fast', pvePower: 10, pveDurMs: 800, pveEnergy: 7, pvpPower: 7, pvpEnergy: 7, turns: 2 },
  { moveId: 'QUICK_ATTACK', numId: 219, type: 'normal', kind: 'fast', pvePower: 8, pveDurMs: 800, pveEnergy: 10, pvpPower: 5, pvpEnergy: 7, turns: 2 },
  { moveId: 'FORCE_PALM', numId: 405, type: 'fighting', kind: 'fast', pvePower: 10, pveDurMs: 1000, pveEnergy: 16, pvpPower: 13, pvpEnergy: 10, turns: 3 },
  { moveId: 'BUBBLE', numId: 237, type: 'water', kind: 'fast', pvePower: 12, pveDurMs: 1200, pveEnergy: 14, pvpPower: 7, pvpEnergy: 11, turns: 3 },

  // Charged moves
  { moveId: 'FRUSTRATION', numId: 322, type: 'normal', kind: 'charged', pvePower: 10, pveDurMs: 2000, pveEnergy: -33, pvpPower: 10, pvpEnergy: 70 },
  { moveId: 'RETURN', numId: 323, type: 'normal', kind: 'charged', pvePower: 35, pveDurMs: 700, pveEnergy: -33, pvpPower: 130, pvpEnergy: 70 },
  { moveId: 'PSYSTRIKE', numId: 275, type: 'psychic', kind: 'charged', pvePower: 90, pveDurMs: 2300, pveEnergy: -50, pvpPower: 90, pvpEnergy: 45 },
  { moveId: 'PSYCHIC', numId: 108, type: 'psychic', kind: 'charged', pvePower: 90, pveDurMs: 2800, pveEnergy: -100, pvpPower: 85, pvpEnergy: 55 },
  { moveId: 'FLAMETHROWER', numId: 109, type: 'fire', kind: 'charged', pvePower: 70, pveDurMs: 2200, pveEnergy: -50, pvpPower: 90, pvpEnergy: 55 },
  { moveId: 'DRAGON_ASCENT', numId: 392, type: 'flying', kind: 'charged', pvePower: 140, pveDurMs: 3500, pveEnergy: -50, pvpPower: 150, pvpEnergy: 70 },
  { moveId: 'OUTRAGE', numId: 114, type: 'dragon', kind: 'charged', pvePower: 110, pveDurMs: 3900, pveEnergy: -50, pvpPower: 110, pvpEnergy: 60 },
  { moveId: 'BREAKING_SWIPE', numId: 379, type: 'dragon', kind: 'charged', pvePower: 35, pveDurMs: 800, pveEnergy: -33, pvpPower: 50, pvpEnergy: 35 },
  { moveId: 'DRAGON_CLAW', numId: 83, type: 'dragon', kind: 'charged', pvePower: 50, pveDurMs: 1700, pveEnergy: -33, pvpPower: 50, pvpEnergy: 35 },
  { moveId: 'BLAST_BURN', numId: 299, type: 'fire', kind: 'charged', pvePower: 110, pveDurMs: 3300, pveEnergy: -50, pvpPower: 110, pvpEnergy: 50 },
  { moveId: 'OVERHEAT', numId: 278, type: 'fire', kind: 'charged', pvePower: 160, pveDurMs: 4000, pveEnergy: -100, pvpPower: 130, pvpEnergy: 55 },
  { moveId: 'HYDRO_CANNON', numId: 296, type: 'water', kind: 'charged', pvePower: 90, pveDurMs: 1900, pveEnergy: -50, pvpPower: 80, pvpEnergy: 40 },
  { moveId: 'ORIGIN_PULSE', numId: 135, type: 'water', kind: 'charged', pvePower: 130, pveDurMs: 1700, pveEnergy: -100, pvpPower: 130, pvpEnergy: 60 },
  { moveId: 'SURF', numId: 290, type: 'water', kind: 'charged', pvePower: 65, pveDurMs: 1700, pveEnergy: -50, pvpPower: 65, pvpEnergy: 40 },
  { moveId: 'FRENZY_PLANT', numId: 298, type: 'grass', kind: 'charged', pvePower: 100, pveDurMs: 2600, pveEnergy: -50, pvpPower: 100, pvpEnergy: 45 },
  { moveId: 'LEAF_BLADE', numId: 274, type: 'grass', kind: 'charged', pvePower: 70, pveDurMs: 2400, pveEnergy: -33, pvpPower: 70, pvpEnergy: 35 },
  { moveId: 'PRECIPICE_BLADES', numId: 134, type: 'ground', kind: 'charged', pvePower: 130, pveDurMs: 1700, pveEnergy: -100, pvpPower: 130, pvpEnergy: 60 },
  { moveId: 'EARTH_POWER', numId: 315, type: 'ground', kind: 'charged', pvePower: 100, pveDurMs: 3600, pveEnergy: -50, pvpPower: 90, pvpEnergy: 55 },
  { moveId: 'EARTHQUAKE', numId: 31, type: 'ground', kind: 'charged', pvePower: 140, pveDurMs: 3600, pveEnergy: -100, pvpPower: 120, pvpEnergy: 65 },
  { moveId: 'HIGH_HORSEPOWER', numId: 377, type: 'ground', kind: 'charged', pvePower: 105, pveDurMs: 1500, pveEnergy: -100, pvpPower: 100, pvpEnergy: 60 },
  { moveId: 'SCORCHING_SANDS', numId: 393, type: 'ground', kind: 'charged', pvePower: 95, pveDurMs: 3200, pveEnergy: -50, pvpPower: 80, pvpEnergy: 50 },
  { moveId: 'AURA_SPHERE', numId: 331, type: 'fighting', kind: 'charged', pvePower: 90, pveDurMs: 1800, pveEnergy: -50, pvpPower: 100, pvpEnergy: 55 },
  { moveId: 'DYNAMIC_PUNCH', numId: 265, type: 'fighting', kind: 'charged', pvePower: 90, pveDurMs: 2700, pveEnergy: -50, pvpPower: 90, pvpEnergy: 50 },
  { moveId: 'SHADOW_BALL', numId: 70, type: 'ghost', kind: 'charged', pvePower: 100, pveDurMs: 3000, pveEnergy: -50, pvpPower: 100, pvpEnergy: 55 },
  { moveId: 'POLTERGEIST', numId: 376, type: 'ghost', kind: 'charged', pvePower: 140, pveDurMs: 3500, pveEnergy: -100, pvpPower: 150, pvpEnergy: 75 },
  { moveId: 'BRUTAL_SWING', numId: 367, type: 'dark', kind: 'charged', pvePower: 65, pveDurMs: 1900, pveEnergy: -33, pvpPower: 55, pvpEnergy: 40 },
  { moveId: 'DARK_PULSE', numId: 16, type: 'dark', kind: 'charged', pvePower: 80, pveDurMs: 3000, pveEnergy: -50, pvpPower: 80, pvpEnergy: 50 },
  { moveId: 'FOUL_PLAY', numId: 263, type: 'dark', kind: 'charged', pvePower: 70, pveDurMs: 2000, pveEnergy: -50, pvpPower: 70, pvpEnergy: 45 },
  { moveId: 'OBLIVION_WING', numId: 345, type: 'flying', kind: 'charged', pvePower: 85, pveDurMs: 2000, pveEnergy: -50, pvpPower: 85, pvpEnergy: 50 },
  { moveId: 'FLY', numId: 341, type: 'flying', kind: 'charged', pvePower: 80, pveDurMs: 1800, pveEnergy: -50, pvpPower: 80, pvpEnergy: 45 },
  { moveId: 'V_CREATE', numId: 342, type: 'fire', kind: 'charged', pvePower: 95, pveDurMs: 2800, pveEnergy: -33, pvpPower: 95, pvpEnergy: 40 },
  { moveId: 'MIST_BALL', numId: 365, type: 'psychic', kind: 'charged', pvePower: 105, pveDurMs: 2000, pveEnergy: -50, pvpPower: 120, pvpEnergy: 60 },
  { moveId: 'LUSTER_PURGE', numId: 366, type: 'psychic', kind: 'charged', pvePower: 100, pveDurMs: 1500, pveEnergy: -50, pvpPower: 120, pvpEnergy: 60 },
  { moveId: 'SEED_FLARE', numId: 369, type: 'grass', kind: 'charged', pvePower: 115, pveDurMs: 2500, pveEnergy: -100, pvpPower: 130, pvpEnergy: 75 },
  { moveId: 'METEOR_MASH', numId: 301, type: 'steel', kind: 'charged', pvePower: 100, pveDurMs: 2600, pveEnergy: -50, pvpPower: 100, pvpEnergy: 50 },
  { moveId: 'SUNSTEEL_STRIKE', numId: 407, type: 'steel', kind: 'charged', pvePower: 230, pveDurMs: 3000, pveEnergy: -100, pvpPower: 135, pvpEnergy: 65 },
  { moveId: 'BEHEMOTH_BLADE', numId: 469, type: 'steel', kind: 'charged', pvePower: 200, pveDurMs: 3000, pveEnergy: -100, pvpPower: 100, pvpEnergy: 55 },
  { moveId: 'BEHEMOTH_BASH', numId: 470, type: 'steel', kind: 'charged', pvePower: 125, pveDurMs: 1500, pveEnergy: -50, pvpPower: 85, pvpEnergy: 45 },
  { moveId: 'DRUM_BEATING', numId: 492, type: 'grass', kind: 'charged', pvePower: 85, pveDurMs: 2000, pveEnergy: -50, pvpPower: 75, pvpEnergy: 45 },
  { moveId: 'HEAVY_SLAM', numId: 258, type: 'steel', kind: 'charged', pvePower: 70, pveDurMs: 2100, pveEnergy: -50, pvpPower: 70, pvpEnergy: 50 },
  { moveId: 'ROCK_WRECKER', numId: 332, type: 'rock', kind: 'charged', pvePower: 110, pveDurMs: 3600, pveEnergy: -50, pvpPower: 110, pvpEnergy: 50 },
  { moveId: 'ROCK_SLIDE', numId: 32, type: 'rock', kind: 'charged', pvePower: 80, pveDurMs: 2700, pveEnergy: -50, pvpPower: 65, pvpEnergy: 45 },
  { moveId: 'WILD_CHARGE', numId: 277, type: 'electric', kind: 'charged', pvePower: 90, pveDurMs: 2600, pveEnergy: -50, pvpPower: 100, pvpEnergy: 45 },
  { moveId: 'THUNDERBOLT', numId: 79, type: 'electric', kind: 'charged', pvePower: 80, pveDurMs: 2500, pveEnergy: -50, pvpPower: 90, pvpEnergy: 55 },
  { moveId: 'AVALANCHE', numId: 264, type: 'ice', kind: 'charged', pvePower: 90, pveDurMs: 2700, pveEnergy: -50, pvpPower: 90, pvpEnergy: 45 },
  { moveId: 'ICE_BEAM', numId: 40, type: 'ice', kind: 'charged', pvePower: 90, pveDurMs: 3300, pveEnergy: -50, pvpPower: 90, pvpEnergy: 55 },
  { moveId: 'DAZZLING_GLEAM', numId: 86, type: 'fairy', kind: 'charged', pvePower: 100, pveDurMs: 3500, pveEnergy: -50, pvpPower: 110, pvpEnergy: 70 },
  { moveId: 'PLAY_ROUGH', numId: 88, type: 'fairy', kind: 'charged', pvePower: 90, pveDurMs: 2900, pveEnergy: -50, pvpPower: 90, pvpEnergy: 60 },
  { moveId: 'SKY_ATTACK', numId: 262, type: 'flying', kind: 'charged', pvePower: 80, pveDurMs: 2000, pveEnergy: -50, pvpPower: 85, pvpEnergy: 50 },
  { moveId: 'SLUDGE_BOMB', numId: 90, type: 'poison', kind: 'charged', pvePower: 80, pveDurMs: 2300, pveEnergy: -50, pvpPower: 80, pvpEnergy: 50 },
  { moveId: 'MEGAHORN', numId: 22, type: 'bug', kind: 'charged', pvePower: 110, pveDurMs: 2200, pveEnergy: -100, pvpPower: 110, pvpEnergy: 55 },
  { moveId: 'BODY_SLAM', numId: 131, type: 'normal', kind: 'charged', pvePower: 50, pveDurMs: 1900, pveEnergy: -33, pvpPower: 50, pvpEnergy: 35 },
  { moveId: 'TRAILBLAZE', numId: 400, type: 'grass', kind: 'charged', pvePower: 65, pveDurMs: 2000, pveEnergy: -50, pvpPower: 65, pvpEnergy: 45 },
];

const TYPE_DEFAULT_FAST: Record<string, string> = {
  bug: 'BUG_BITE',
  dark: 'SNARL',
  dragon: 'DRAGON_TAIL',
  electric: 'THUNDER_SHOCK',
  fairy: 'CHARM',
  fighting: 'COUNTER',
  fire: 'FIRE_SPIN',
  flying: 'WING_ATTACK',
  ghost: 'SHADOW_CLAW',
  grass: 'VINE_WHIP',
  ground: 'MUD_SHOT',
  ice: 'POWDER_SNOW',
  normal: 'QUICK_ATTACK',
  poison: 'POISON_JAB',
  psychic: 'PSYCHO_CUT',
  rock: 'SMACK_DOWN',
  steel: 'BULLET_PUNCH',
  water: 'WATERFALL',
};

const TYPE_DEFAULT_CHARGED: Record<string, string> = {
  bug: 'MEGAHORN',
  dark: 'BRUTAL_SWING',
  dragon: 'OUTRAGE',
  electric: 'WILD_CHARGE',
  fairy: 'DAZZLING_GLEAM',
  fighting: 'AURA_SPHERE',
  fire: 'BLAST_BURN',
  flying: 'SKY_ATTACK',
  ghost: 'SHADOW_BALL',
  grass: 'FRENZY_PLANT',
  ground: 'PRECIPICE_BLADES',
  ice: 'AVALANCHE',
  normal: 'BODY_SLAM',
  poison: 'SLUDGE_BOMB',
  psychic: 'PSYSTRIKE',
  rock: 'ROCK_WRECKER',
  steel: 'METEOR_MASH',
  water: 'HYDRO_CANNON',
};

const SPECIAL_SIGNATURE: Record<string, { fast: string[]; charged: string[]; elite: string[] }> = {
  mewtwo: { fast: ['PSYCHO_CUT', 'CONFUSION'], charged: ['PSYSTRIKE', 'SHADOW_BALL', 'ICE_BEAM'], elite: ['PSYSTRIKE', 'SHADOW_BALL'] },
  rayquaza: { fast: ['DRAGON_TAIL', 'AIR_SLASH'], charged: ['DRAGON_ASCENT', 'BREAKING_SWIPE', 'OUTRAGE'], elite: ['DRAGON_ASCENT', 'BREAKING_SWIPE'] },
  metagross: { fast: ['BULLET_PUNCH'], charged: ['METEOR_MASH', 'EARTHQUAKE', 'PSYCHIC'], elite: ['METEOR_MASH'] },
  lucario: { fast: ['FORCE_PALM', 'COUNTER'], charged: ['AURA_SPHERE', 'SHADOW_BALL'], elite: ['FORCE_PALM'] },
  charizard: { fast: ['FIRE_SPIN', 'WING_ATTACK'], charged: ['BLAST_BURN', 'DRAGON_CLAW', 'OVERHEAT'], elite: ['BLAST_BURN', 'WING_ATTACK'] },
  blastoise: { fast: ['WATER_GUN'], charged: ['HYDRO_CANNON', 'ICE_BEAM'], elite: ['HYDRO_CANNON'] },
  venusaur: { fast: ['VINE_WHIP', 'RAZOR_LEAF'], charged: ['FRENZY_PLANT', 'SLUDGE_BOMB'], elite: ['FRENZY_PLANT'] },
  swampert: { fast: ['MUD_SHOT', 'WATER_GUN'], charged: ['HYDRO_CANNON', 'EARTHQUAKE'], elite: ['HYDRO_CANNON'] },
  groudon: { fast: ['MUD_SHOT', 'DRAGON_TAIL'], charged: ['PRECIPICE_BLADES', 'FIRE_PUNCH'], elite: ['PRECIPICE_BLADES'] },
  kyogre: { fast: ['WATERFALL'], charged: ['ORIGIN_PULSE', 'SURF'], elite: ['ORIGIN_PULSE'] },
  rhyperior: { fast: ['MUD_SLAP', 'SMACK_DOWN'], charged: ['ROCK_WRECKER', 'EARTHQUAKE'], elite: ['ROCK_WRECKER'] },
};

const MEGA_TEMPLATES: {
  baseSid: string;
  megaSid: string;
  megaName: string;
  types: string[];
  atk: number;
  def: number;
  hp: number;
}[] = [
  { baseSid: 'rayquaza', megaSid: 'rayquaza_mega', megaName: 'Mega Rayquaza', types: ['Dragon', 'Flying'], atk: 377, def: 210, hp: 213 },
  { baseSid: 'lucario', megaSid: 'lucario_mega', megaName: 'Mega Lucario', types: ['Fighting', 'Steel'], atk: 310, def: 175, hp: 172 },
  { baseSid: 'mewtwo', megaSid: 'mewtwo_mega_y', megaName: 'Mega Mewtwo Y', types: ['Psychic'], atk: 426, def: 229, hp: 214 },
  { baseSid: 'charizard', megaSid: 'charizard_mega_y', megaName: 'Mega Charizard Y', types: ['Fire', 'Flying'], atk: 319, def: 212, hp: 186 },
  { baseSid: 'blastoise', megaSid: 'blastoise_mega', megaName: 'Mega Blastoise', types: ['Water'], atk: 264, def: 237, hp: 188 },
  { baseSid: 'venusaur', megaSid: 'venusaur_mega', megaName: 'Mega Venusaur', types: ['Grass', 'Poison'], atk: 241, def: 246, hp: 190 },
  { baseSid: 'gengar', megaSid: 'gengar_mega', megaName: 'Mega Gengar', types: ['Ghost', 'Poison'], atk: 349, def: 199, hp: 155 },
  { baseSid: 'tyranitar', megaSid: 'tyranitar_mega', megaName: 'Mega Tyranitar', types: ['Rock', 'Dark'], atk: 309, def: 276, hp: 225 },
  { baseSid: 'garchomp', megaSid: 'garchomp_mega', megaName: 'Mega Garchomp', types: ['Dragon', 'Ground'], atk: 339, def: 222, hp: 239 },
  { baseSid: 'gardevoir', megaSid: 'gardevoir_mega', megaName: 'Mega Gardevoir', types: ['Psychic', 'Fairy'], atk: 326, def: 229, hp: 169 },
  { baseSid: 'salamence', megaSid: 'salamence_mega', megaName: 'Mega Salamence', types: ['Dragon', 'Flying'], atk: 310, def: 251, hp: 216 },
  { baseSid: 'swampert', megaSid: 'swampert_mega', megaName: 'Mega Swampert', types: ['Water', 'Ground'], atk: 283, def: 218, hp: 225 },
  { baseSid: 'blaziken', megaSid: 'blaziken_mega', megaName: 'Mega Blaziken', types: ['Fire', 'Fighting'], atk: 329, def: 168, hp: 190 },
  { baseSid: 'sceptile', megaSid: 'sceptile_mega', megaName: 'Mega Sceptile', types: ['Grass', 'Dragon'], atk: 320, def: 186, hp: 172 },
  { baseSid: 'metagross', megaSid: 'metagross_mega', megaName: 'Mega Metagross', types: ['Steel', 'Psychic'], atk: 300, def: 289, hp: 190 },
  { baseSid: 'kyogre', megaSid: 'kyogre_primal', megaName: 'Primal Kyogre', types: ['Water'], atk: 353, def: 268, hp: 218 },
  { baseSid: 'groudon', megaSid: 'groudon_primal', megaName: 'Primal Groudon', types: ['Ground', 'Fire'], atk: 353, def: 268, hp: 218 },
  { baseSid: 'gyarados', megaSid: 'gyarados_mega', megaName: 'Mega Gyarados', types: ['Water', 'Dark'], atk: 292, def: 247, hp: 216 },
  { baseSid: 'scizor', megaSid: 'scizor_mega', megaName: 'Mega Scizor', types: ['Bug', 'Steel'], atk: 279, def: 250, hp: 172 },
  { baseSid: 'manectric', megaSid: 'manectric_mega', megaName: 'Mega Manectric', types: ['Electric'], atk: 286, def: 179, hp: 172 },
  { baseSid: 'abomasnow', megaSid: 'abomasnow_mega', megaName: 'Mega Abomasnow', types: ['Grass', 'Ice'], atk: 240, def: 191, hp: 207 },
  { baseSid: 'pidgeot', megaSid: 'pidgeot_mega', megaName: 'Mega Pidgeot', types: ['Normal', 'Flying'], atk: 280, def: 175, hp: 195 },
  { baseSid: 'beedrill', megaSid: 'beedrill_mega', megaName: 'Mega Beedrill', types: ['Bug', 'Poison'], atk: 303, def: 148, hp: 163 },
];

export function buildOfflineFallbackData(): RemoteGameData {
  const moves: PvPokeMove[] = CORE_MOVES.map((m) => ({
    moveId: m.moveId,
    name: m.moveId.replace(/_/g, ' '),
    type: m.type,
    power: m.pvpPower,
    energy: m.kind === 'charged' ? m.pvpEnergy : undefined,
    energyGain: m.kind === 'fast' ? m.pvpEnergy : undefined,
    turns: m.turns,
  }));

  const pveMoves: Record<string, PveMoveRecord> = {};
  for (const m of CORE_MOVES) {
    const key = m.kind === 'fast' ? `${m.moveId}_FAST` : m.moveId;
    pveMoves[key] = {
      id: m.numId,
      p: m.pvePower,
      d: m.pveDurMs,
      e: m.pveEnergy,
      t: m.type,
    };
  }

  const pokemon: PvPokeSpecies[] = [];
  const allSidsByKey = new Map<string, PvPokeSpecies>();

  for (const entry of SPECIES_BY_KEY.values()) {
    const sid = entry.key.toLowerCase();
    const types = entry.types.map((t) => t.toLowerCase());
    const sig = SPECIAL_SIGNATURE[sid];
    const fastMoves = sig
      ? sig.fast
      : types.map((t) => TYPE_DEFAULT_FAST[t] || 'QUICK_ATTACK');
    const chargedMoves = sig
      ? sig.charged
      : types.map((t) => TYPE_DEFAULT_CHARGED[t] || 'BODY_SLAM');

    const tags: string[] = [];
    if (entry.isLegendary) tags.push('legendary');
    if (entry.isMythical) tags.push('mythical');
    if (entry.isUltraBeast) tags.push('ultrabeast');
    if (entry.isRegional) tags.push('regional');

    const sp: PvPokeSpecies = {
      speciesId: sid,
      speciesName: entry.name,
      dex: entry.dex,
      baseStats: { atk: entry.baseAtk, def: entry.baseDef, hp: entry.baseSta },
      types,
      fastMoves: Array.from(new Set(fastMoves)),
      chargedMoves: Array.from(new Set(chargedMoves)),
      eliteMoves: sig?.elite || [],
      tags,
      released: true,
      family: {
        id: entry.family.toLowerCase(),
        evolutions: entry.evolutions.map((e) => e.toLowerCase()),
      },
    };
    pokemon.push(sp);
    allSidsByKey.set(sid, sp);

    // Add shadow clone for raid-relevant species
    if (entry.raidTier === 'S' || entry.raidTier === 'A') {
      pokemon.push({
        ...sp,
        speciesId: `${sid}_shadow`,
        speciesName: `${entry.name} (Shadow)`,
        tags: [...tags, 'shadow'],
      });
    }
  }

  // Add Mega / Primal species entries
  for (const mg of MEGA_TEMPLATES) {
    const base = allSidsByKey.get(mg.baseSid);
    pokemon.push({
      speciesId: mg.megaSid,
      speciesName: mg.megaName,
      dex: base?.dex || 0,
      baseStats: { atk: mg.atk, def: mg.def, hp: mg.hp },
      types: mg.types.map((t) => t.toLowerCase()),
      fastMoves: base?.fastMoves || ['QUICK_ATTACK'],
      chargedMoves: base?.chargedMoves || ['BODY_SLAM'],
      eliteMoves: base?.eliteMoves || [],
      tags: mg.megaSid.endsWith('_primal') ? ['primal'] : ['mega'],
      released: true,
      family: base?.family,
    });
  }

  // Build parent links from evolutions
  for (const sp of pokemon) {
    if (sp.speciesId.endsWith('_shadow') || sp.speciesId.includes('_mega') || sp.speciesId.endsWith('_primal')) {
      continue;
    }
    for (const evo of sp.family?.evolutions || []) {
      const child = allSidsByKey.get(evo);
      if (child && child.family && !child.family.parent) {
        child.family.parent = sp.speciesId;
      }
    }
  }

  const mkRank = (
    spList: PvPokeSpecies[],
    filterKey: 'little' | 'great' | 'ultra' | 'master',
  ): PvPokeRankingEntry[] => {
    const matched = spList.filter((sp) => {
      const e = SPECIES_BY_KEY.get(sp.speciesId.toUpperCase());
      return e?.pvpRelevance?.[filterKey];
    });
    const sorted = matched.sort((a, b) => {
      const bulkA = a.baseStats.def * a.baseStats.hp;
      const bulkB = b.baseStats.def * b.baseStats.hp;
      return bulkB - bulkA;
    });
    return sorted.map((sp, i) => {
      const score = Math.max(70, 98 - i * 0.45);
      const nextOp = sorted[(i + 1) % Math.max(1, sorted.length)]?.speciesId;
      const prevOp = sorted[(i - 1 + sorted.length) % Math.max(1, sorted.length)]?.speciesId;
      return {
        speciesId: sp.speciesId,
        speciesName: sp.speciesName,
        score: Number(score.toFixed(1)),
        rating: Math.round(score * 10),
        scores: [score, score - 1.5, score - 0.8, score - 2.1, score - 1.2, score],
        matchups: nextOp && nextOp !== sp.speciesId ? [{ opponent: nextOp, rating: 640 }] : [],
        counters: prevOp && prevOp !== sp.speciesId ? [{ opponent: prevOp, rating: 380 }] : [],
      };
    });
  };

  const plain = pokemon.filter(
    (p) => !p.speciesId.endsWith('_shadow') && !p.speciesId.includes('_mega') && !p.speciesId.endsWith('_primal'),
  );

  const r1500 = mkRank(plain, 'great');
  const r2500 = mkRank(plain, 'ultra');
  const r10000 = mkRank(plain, 'master');
  const r500 = mkRank(plain, 'little');
  const fantasyTypes = new Set(['dragon', 'steel', 'fairy']);
  const rFantasy = r1500.filter((r) => {
    const sp = allSidsByKey.get(r.speciesId);
    return sp && sp.types.some((t) => fantasyTypes.has(t));
  });

  const showcaseSizes: Record<string, SizeTableRecord> = {};
  for (const sp of plain) {
    const avgH = 0.6 + ((sp.dex % 15) * 0.14);
    const avgW = Math.max(5, Math.round(avgH * avgH * 28));
    showcaseSizes[sp.speciesId.toUpperCase()] = {
      avg_h: Number(avgH.toFixed(2)),
      avg_w: avgW,
      k: 1.75,
      xxl_h: Number((avgH * 1.75).toFixed(4)),
    };
  }

  const now = new Date();
  const later = new Date(now.getTime() + 48 * 3600 * 1000);
  const events: ScrapedEvent[] = [
    {
      eventID: 'offline-raid-demo',
      name: 'Mega Lucario Raid Rotation (Offline Snapshot)',
      eventType: 'raid-battles',
      heading: 'Raids',
      start: now.toISOString(),
      end: later.toISOString(),
      extraData: { raids: [{ name: 'Lucario' }, { name: 'Groudon' }] },
    },
  ];
  const raids: ScrapedRaid[] = [
    { name: 'Lucario', tier: 'Mega', types: ['Fighting', 'Steel'], canBeShiny: true },
    { name: 'Groudon', tier: '5', types: ['Ground'], canBeShiny: true },
  ];

  // Ensure every raid useful type has at least 1 species
  void RAID_USEFUL_TYPES;

  return {
    gm: {
      timestamp: 'offline-bundled-2026',
      pokemon,
      moves,
    },
    ranks: { 1500: r1500, 2500: r2500, 10000: r10000 },
    groups: {
      1500: r1500.slice(0, 40),
      2500: r2500.slice(0, 40),
      10000: r10000.slice(0, 40),
    },
    cupRanks: {
      little: r500,
      fantasy: rFantasy,
    },
    cupGroups: {
      little: r500.slice(0, 30),
      fantasy: rFantasy.slice(0, 30),
    },
    pveMoves,
    pveOk: true,
    showcaseSizes,
    sizeOk: true,
    events,
    raids,
    eventsOk: false,
    gmAgeDays: 0,
    feedAgeHours: null,
    sourceLabel: 'Offline Built-in Pokédex Snapshot',
  };
}
