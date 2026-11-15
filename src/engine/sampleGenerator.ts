import { CPM } from './cpmTable';
import type { RawPokemon } from './types';

function makePokemon(opts: {
  id: string;
  dex: number;
  cp: number;
  a: number;
  d: number;
  s: number;
  level: number;
  formName?: string;
  shadow?: boolean;
  purified?: boolean;
  shiny?: boolean;
  lucky?: boolean;
  favorite?: boolean;
  move1?: number;
  move2?: number;
  move3?: number;
  year?: number;
  megaLevel?: number;
  dynamax?: boolean;
  gmax?: boolean;
  maxAtt?: number;
  maxGuard?: number;
  maxSpirit?: number;
  heightM?: number;
  weightKg?: number;
  size?: number;
  battlesAttacked?: number;
  battlesDefended?: number;
  fromFort?: boolean;
  hatchedFromEgg?: boolean;
  weatherBoosted?: boolean;
  caughtInParty?: boolean;
  tradedTimeMs?: number;
  deployedFortId?: string;
  deployedDurationMs?: number;
  pokemonTagIds?: number[];
  originEvents?: string[];
  megaFinishMs?: number;
}): RawPokemon {
  const yr = opts.year ?? 2024;
  const dt = Date.UTC(yr, 5, 15, 12, 0, 0);
  return {
    id: opts.id,
    pokemonId: opts.dex,
    cp: opts.cp,
    individualAttack: opts.a,
    individualDefense: opts.d,
    individualStamina: opts.s,
    cpMultiplier: CPM[opts.level] ?? CPM[20],
    additionalCpMultiplier: 0,
    favorite: opts.favorite ?? false,
    isLucky: opts.lucky ?? false,
    move1: opts.move1,
    move2: opts.move2,
    move3: opts.move3,
    creationTimeMs: dt,
    megaLevel: opts.megaLevel,
    hasMegaUnlocked: (opts.megaLevel ?? 0) > 0,
    heightM: opts.heightM,
    weightKg: opts.weightKg,
    size: opts.size,
    battlesAttacked: opts.battlesAttacked,
    battlesDefended: opts.battlesDefended,
    fromFort: opts.fromFort,
    hatchedFromEgg: opts.hatchedFromEgg,
    weatherBoostedCondition: opts.weatherBoosted ? 1 : 0,
    caughtInParty: opts.caughtInParty,
    tradedTimeMs: opts.tradedTimeMs,
    deployedFortId: opts.deployedFortId,
    deployedDurationMs: opts.deployedDurationMs,
    pokemonTagIds: opts.pokemonTagIds,
    originEvents: opts.originEvents,
    breadMoves: opts.dynamax || opts.gmax
      ? [
          { moveType: 1, moveLevel: opts.maxAtt ?? 1 },
          { moveType: 2, moveLevel: opts.maxGuard ?? 0 },
          { moveType: 3, moveLevel: opts.maxSpirit ?? 0 },
        ]
      : undefined,
    pokemonDisplay: {
      formName: opts.formName || 'UNSET',
      alignment: opts.shadow ? 1 : opts.purified ? 2 : 0,
      shiny: opts.shiny ?? false,
      megaLevel: opts.megaLevel,
      currentTempEvolution: opts.megaFinishMs ? 1 : 0,
      temporaryEvolutionFinishMs: opts.megaFinishMs,
      breadModeEnum: opts.gmax ? 2 : opts.dynamax ? 1 : 0,
    },
  };
}

export function generateSamplePgsStatsJson(): Record<string, unknown> {
  const refNow = Date.UTC(2026, 3, 12, 10, 30, 0);
  const pokemon: RawPokemon[] = [
    // Master League & Top Raid Hundos / Shadows
    makePokemon({ id: 'smp-150-1', dex: 150, cp: 4178, a: 15, d: 15, s: 15, level: 40, favorite: true, move1: 226, move2: 328, move3: 24, year: 2023, fromFort: true, battlesAttacked: 412, pokemonTagIds: [1] }),
    makePokemon({ id: 'smp-150-sh', dex: 150, cp: 3812, a: 14, d: 12, s: 13, level: 35, shadow: true, move1: 226, move2: 328, year: 2024, battlesAttacked: 164 }),
    makePokemon({ id: 'smp-384-1', dex: 384, cp: 4336, a: 15, d: 14, s: 15, level: 50, favorite: true, shiny: true, megaLevel: 3, move1: 282, move2: 383, year: 2023, fromFort: true, battlesAttacked: 580, megaFinishMs: refNow + 4 * 3600_000, originEvents: ['GO_FEST_2023'] }),
    makePokemon({ id: 'smp-383-1', dex: 383, cp: 4115, a: 15, d: 15, s: 14, level: 40, favorite: true, megaLevel: 2, move1: 233, move2: 381, year: 2024, fromFort: true, battlesAttacked: 128 }),
    makePokemon({ id: 'smp-382-1', dex: 382, cp: 4092, a: 15, d: 14, s: 14, level: 40, favorite: true, megaLevel: 2, move1: 291, move2: 382, year: 2024, fromFort: true, battlesAttacked: 95 }),
    makePokemon({ id: 'smp-445-1', dex: 445, cp: 3962, a: 15, d: 15, s: 15, level: 40, lucky: true, tradedTimeMs: refNow - 900 * 86400_000, megaLevel: 2, move1: 233, move2: 332, move3: 249, year: 2021, pokemonTagIds: [1] }),
    makePokemon({ id: 'smp-445-2', dex: 445, cp: 3210, a: 13, d: 14, s: 12, level: 30, move1: 282, move2: 249 }),
    makePokemon({ id: 'smp-248-1', dex: 248, cp: 3834, a: 15, d: 15, s: 14, level: 40, megaLevel: 3, move1: 297, move2: 396, year: 2018, battlesAttacked: 245 }),
    makePokemon({ id: 'smp-248-sh', dex: 248, cp: 3480, a: 14, d: 11, s: 13, level: 34, shadow: true, move1: 202, move2: 396 }),
    makePokemon({ id: 'smp-376-1', dex: 376, cp: 3791, a: 15, d: 15, s: 15, level: 40, favorite: true, megaLevel: 1, move1: 237, move2: 301, year: 2022, battlesAttacked: 189, pokemonTagIds: [1] }),
    makePokemon({ id: 'smp-373-1', dex: 373, cp: 3720, a: 15, d: 14, s: 13, level: 40, move1: 282, move2: 249 }),
    makePokemon({ id: 'smp-409-1', dex: 409, cp: 3254, a: 15, d: 13, s: 14, level: 38, move1: 297, move2: 140 }),
    makePokemon({ id: 'smp-461-1', dex: 461, cp: 2992, a: 15, d: 14, s: 13, level: 38, move1: 218, move2: 264 }),
    makePokemon({ id: 'smp-464-1', dex: 464, cp: 3698, a: 15, d: 14, s: 14, level: 40, move1: 233, move2: 331 }),
    makePokemon({ id: 'smp-473-1', dex: 473, cp: 3290, a: 15, d: 14, s: 15, level: 40, move1: 284, move2: 264 }),
    makePokemon({ id: 'smp-643-1', dex: 643, cp: 3988, a: 15, d: 14, s: 15, level: 40, move1: 249, move2: 386, fromFort: true }),
    makePokemon({ id: 'smp-644-1', dex: 644, cp: 3960, a: 15, d: 15, s: 13, level: 40, move1: 287, move2: 387, fromFort: true }),

    // Great League & Fantasy Cup contenders
    makePokemon({ id: 'smp-423-gl', dex: 423, cp: 1492, a: 0, d: 14, s: 15, level: 24.5, move1: 233, move2: 256, move3: 245, pokemonTagIds: [2] }),
    makePokemon({ id: 'smp-184-gl', dex: 184, cp: 1498, a: 0, d: 15, s: 14, level: 45, move1: 230, move2: 58, move3: 220, pokemonTagIds: [2] }),
    makePokemon({ id: 'smp-227-gl', dex: 227, cp: 1489, a: 1, d: 15, s: 14, level: 26.5, move1: 211, move2: 251, move3: 118, pokemonTagIds: [2] }),
    makePokemon({ id: 'smp-618-gl', dex: 618, cp: 1495, a: 0, d: 13, s: 15, level: 27, formName: 'STUNFISK_GALARIAN', move1: 233, move2: 140, move3: 245, hatchedFromEgg: true }),
    makePokemon({ id: 'smp-703-gl', dex: 703, cp: 1496, a: 3, d: 14, s: 15, level: 49, move1: 214, move2: 140, move3: 222 }),
    makePokemon({ id: 'smp-980-gl', dex: 980, cp: 1491, a: 0, d: 14, s: 14, level: 29, move1: 289, move2: 245, move3: 325, weatherBoosted: true }),
    makePokemon({ id: 'smp-56-gl', dex: 56, cp: 840, a: 1, d: 15, s: 14, level: 24, move1: 293, move2: 279 }),
    makePokemon({ id: 'smp-663-gl', dex: 663, cp: 1494, a: 2, d: 15, s: 15, level: 25.5, move1: 248, move2: 334, move3: 118 }),

    // Ultra League contenders
    makePokemon({ id: 'smp-260-ul', dex: 260, cp: 2496, a: 0, d: 14, s: 15, level: 32.5, move1: 233, move2: 299, move3: 245 }),
    makePokemon({ id: 'smp-488-ul', dex: 488, cp: 2489, a: 2, d: 15, s: 14, level: 32.5, move1: 226, move2: 261, move3: 222 }),
    makePokemon({ id: 'smp-724-ul', dex: 724, cp: 2481, a: 1, d: 14, s: 13, level: 31, move1: 283, move2: 300, pokemonTagIds: [2] }), // intentional GL tag on 2481 CP mon to trigger tag audit

    // Dynamax & Gigantamax attackers & tanks
    makePokemon({ id: 'smp-6-gmax', dex: 6, cp: 2889, a: 15, d: 14, s: 14, level: 40, gmax: true, maxAtt: 2, maxGuard: 1, megaLevel: 2, move1: 205, move2: 300 }),
    makePokemon({ id: 'smp-9-gmax', dex: 9, cp: 2450, a: 13, d: 15, s: 15, level: 38, gmax: true, maxAtt: 1, maxGuard: 2, maxSpirit: 1, move1: 230, move2: 299 }),
    makePokemon({ id: 'smp-94-gmax', dex: 94, cp: 2840, a: 15, d: 13, s: 14, level: 40, gmax: true, maxAtt: 3, megaLevel: 1, move1: 213, move2: 70 }),
    makePokemon({ id: 'smp-530-dmax', dex: 530, cp: 3214, a: 15, d: 15, s: 13, level: 40, dynamax: true, maxAtt: 2, move1: 233, move2: 311 }),
    makePokemon({ id: 'smp-812-dmax', dex: 812, cp: 2740, a: 14, d: 13, s: 14, level: 35, dynamax: true, maxAtt: 1, maxSpirit: 1 }),
    makePokemon({ id: 'smp-376-dmax', dex: 376, cp: 3650, a: 14, d: 15, s: 14, level: 39, dynamax: true, maxAtt: 2, maxGuard: 1 }),

    // Mega pre-evos & gym defenders
    makePokemon({ id: 'smp-1-mega', dex: 1, cp: 940, a: 15, d: 14, s: 15, level: 30 }),
    makePokemon({ id: 'smp-242-gym', dex: 242, cp: 2718, a: 12, d: 15, s: 15, level: 40, deployedFortId: 'gym-central-01', deployedDurationMs: 5 * 3600_000 + 25 * 60_000, battlesDefended: 47 }),
    makePokemon({ id: 'smp-143-gym', dex: 143, cp: 3180, a: 14, d: 14, s: 15, level: 40, deployedFortId: 'gym-harbor-02', deployedDurationMs: 2 * 3600_000 + 10 * 60_000, battlesDefended: 18 }),

    // Showcase XXL winners
    makePokemon({ id: 'smp-143-xxl', dex: 143, cp: 2450, a: 12, d: 10, s: 11, level: 28, heightM: 3.18, weightKg: 710, size: 5 }),
    makePokemon({ id: 'smp-321-xxl', dex: 321, cp: 1620, a: 10, d: 12, s: 9, level: 25, heightM: 22.4, weightKg: 620, size: 5 }),

    // Legacy 2016 + Shiny + REVIEW + Safe Transfer / Mass-Evolve Fodder
    makePokemon({ id: 'smp-131-leg', dex: 131, cp: 1920, a: 12, d: 14, s: 11, level: 26, year: 2016 }),
    makePokemon({ id: 'smp-149-rev', dex: 149, cp: 2400, a: 11, d: 15, s: 14, level: 23, caughtInParty: true }),
    makePokemon({ id: 'smp-445-rev', dex: 445, cp: 2190, a: 10, d: 14, s: 13, level: 20 }),
    makePokemon({ id: 'smp-373-rev', dex: 373, cp: 2610, a: 11, d: 12, s: 12, level: 25 }),
    makePokemon({ id: 'smp-19-tr1', dex: 19, cp: 312, a: 5, d: 7, s: 4, level: 18 }),
    makePokemon({ id: 'smp-19-tr2', dex: 19, cp: 410, a: 4, d: 9, s: 6, level: 22 }),
    makePokemon({ id: 'smp-16-tr1', dex: 16, cp: 388, a: 7, d: 6, s: 8, level: 21 }),
    makePokemon({ id: 'smp-16-tr2', dex: 16, cp: 290, a: 3, d: 8, s: 5, level: 16 }),
    makePokemon({ id: 'smp-147-tr1', dex: 147, cp: 615, a: 9, d: 11, s: 8, level: 22 }),
    makePokemon({ id: 'smp-246-tr1', dex: 246, cp: 580, a: 8, d: 10, s: 9, level: 20 }),
  ];

  return {
    exportTime: '2026-04-12T10:30:00Z',
    account: {
      level: 47,
      kmWalked: 4820,
      maxPokemonStorage: 1400,
      maxItemStorage: 1600,
      purchasedPokemonStorage: 21,
      purchasedItemStorage: 25,
      currencyBalance: [
        { currencyType: 'STARDUST', quantity: 642500 },
        { currencyType: 'POKECOIN', quantity: 680 },
      ],
      tags: [
        { id: 1, name: 'Hundo', color: 1 },
        { id: 2, name: 'GreatLeague', color: 2 },
      ],
      trading: { guaranteedLuckyTradesRemaining: 9 },
      consumedEeveeEasterEggs: ['Rainer', 'Sparky', 'Pyro', 'Sakura'],
      pokecoinCaps: [{ pokecoinEarned: 20 }],
      activeTrainingPokemon: [],
      buddyPokemonProto: {
        buddyPokemonId: 'smp-384-1',
        dailyBuddySwaps: { count: 2 },
      },
      buddyObservedData: {
        currentEmotionPoints: 18,
        currentPointsEarned: 18,
        todayStatsShownHearts: { walkHearts: 2, feedHearts: 2, petHearts: 1, battleHearts: 1 },
      },
      player: {
        level: 47,
        experience: 148420000,
        prevLevelExp: 136500000,
        nextLevelExp: 155500000,
        kmWalked: 4820,
        numPokemonCaptured: 54210,
        numPokemonEncountered: 63400,
        numEggsHatched: 1420,
        numEvolutions: 2180,
        numTrades: 840,
        numRaidBattleTotal: 920,
        numRaidBattleWon: 875,
        numLegendaryBattleTotal: 540,
        numLegendaryBattleWon: 512,
        numGruntsDefeated: 1120,
        numUniquePokedexEntries: 824,
        numBestBuddies: 14,
        bigMagikarpCaught: 318,
        smallRattataCaught: 284,
        sevenDayStreaks: 48,
        totalDefendedMs: 4280 * 3600_000,
        tradeAccumulatedDistanceKm: 1840000,
        uniquePokestopsVisited: 1140,
        pokestopsVisited: 28400,
        pokemonCaughtByType: [4200, 1850, 3900, 2600, 1920, 1740, 3100, 1250, 1680, 2800, 5120, 3400, 2100, 2550, 1180, 1420, 1980, 1540],
      },
      combatLog: {
        currentSeasonResults: { season: 22, rank: 20, rating: 2285, currentStreak: 3, longestWinStreak: 11, stardustEarned: 485000, totalBattles: 410, totalWins: 224 },
        previousSeasonResults: { season: 21, rank: 21, rating: 2540, currentStreak: 0, longestWinStreak: 14, stardustEarned: 1120000, totalBattles: 920, totalWins: 492 },
        lifetimeResults: { stardustEarned: 8450000, totalBattles: 6420, totalWins: 3380, longestWinStreak: 17 },
        currentVsSeekerSetResults: [{ totalWins: 4, totalBattles: 5, rank: 20 }],
      },
      playerPreferences: {
        battleParties: {
          battleParties: [
            { name: 'GL Core', combatLeagueId: 'COMBAT_LEAGUE_DEFAULT_GREAT', ids: ['smp-423-gl', 'smp-184-gl', 'smp-227-gl'] },
            { name: 'Raid Dragon', combatLeagueId: 'BATTLE_LEAGUE_GYM_RAID', ids: ['smp-384-1', 'smp-445-1', 'smp-373-1'] },
          ],
        },
      },
    },
    items: [
      { itemId: 'ITEM_RARE_CANDY', count: 84 },
      { itemId: 'ITEM_FAST_TM', count: 32 },
      { itemId: 'ITEM_CHARGE_TM', count: 29 },
      { itemId: 'ITEM_PAID_RAID_TICKET', count: 14 },
      { itemId: 'ITEM_REMOTE_RAID_TICKET', count: 5 },
      { itemId: 'ITEM_LUCKY_EGG', count: 12 },
      { itemId: 'ITEM_GOLDEN_RAZZ_BERRY', count: 95 },
      { itemId: 'ITEM_STAR_PIECE', count: 9 },
      { itemId: 'ITEM_POFFIN', count: 4 },
      { itemId: 'ITEM_GEN4_EVOLUTION_STONE', itemName: 'ITEM_GEN4_EVOLUTION_STONE', count: 6 },
      { itemId: 'ITEM_SUN_STONE', itemName: 'ITEM_SUN_STONE', count: 3 },
      { itemId: 'ITEM_MASTER_BALL', count: 2 },
      { itemId: 'ITEM_HYPER_POTION', itemName: 'ITEM_HYPER_POTION', count: 120 },
      { itemId: 'ITEM_REVIVE', itemName: 'ITEM_REVIVE', count: 85 },
      { itemId: 'ITEM_ULTRA_BALL', itemName: 'ITEM_ULTRA_BALL', count: 340 },
    ],
    pokemon,
  };
}
