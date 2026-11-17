/** Test: the game-master evolution reader and the cost lookup order (game data > built-in table > guess). */
import { collectEvolutionCosts } from '../src/engine/gameDataClient';
import { setLiveEvolveCosts, stepCostInfo, EVOLVE_COSTS } from '../src/engine/costTables';
let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(ok ? '  ✓' : '  ✗ FAIL:', msg); if (!ok) fails++; };

// A snippet shaped like the PokeMiners game master
const out: Record<string, { c: number; i: string | null }> = {};
collectEvolutionCosts({ pokemonId: 'RATTATA', form: 'RATTATA_NORMAL', evolutionBranch: [{ evolution: 'RATICATE', form: 'RATICATE_NORMAL', candyCost: 25 }] }, out);
collectEvolutionCosts({ pokemonId: 'RATTATA', form: 'RATTATA_ALOLA', evolutionBranch: [{ evolution: 'RATICATE', form: 'RATICATE_ALOLA', candyCost: 25 }] }, out);
collectEvolutionCosts({ pokemonId: 'SLOWPOKE', form: 'SLOWPOKE_NORMAL', evolutionBranch: [{ evolution: 'SLOWKING', form: 'SLOWKING_NORMAL', candyCost: 100, evolutionItemRequirement: 'ITEM_KINGS_ROCK' }] }, out);
collectEvolutionCosts({ pokemonId: 'ROSELIA', form: 'ROSELIA_NORMAL', evolutionBranch: [{ evolution: 'ROSERADE', candyCost: 100, evolutionItemRequirement: 'ITEM_GEN4_EVOLUTION_STONE' }] }, out);
collectEvolutionCosts({ pokemonId: 'EEVEE', form: 'EEVEE_NORMAL', evolutionBranch: [{ evolution: 'UMBREON', candyCost: 25, kmBuddyDistanceRequirement: 10, onlyNighttime: true }] }, out);
collectEvolutionCosts({ pokemonId: 'MAGNEMITE', evolutionBranch: [{ evolution: 'MAGNETON', candyCost: 50, lureItemRequirement: 'ITEM_TROY_DISK_MAGNETIC' }] }, out);
collectEvolutionCosts({ pokemonId: 'DITTO' }, out); // no branches: ignored
check(out['rattata|raticate']?.c === 25, 'plain evolution cost read');
check(out['rattata_alolan|raticate_alolan']?.c === 25, 'Alolan form key uses the *_alolan id');
check(out['slowpoke|slowking']?.i === "King's Rock", "item name mapped (King's Rock)");
check(out['roselia|roserade']?.i === 'Sinnoh Stone', 'Sinnoh Stone mapped');
check(out['eevee|umbreon']?.i === 'walk 10 km as buddy + night', 'buddy walk + night described');
check(out['magnemite|magneton']?.i === 'Magnetic Lure', 'lure described');
check(Object.keys(out).length === 6, 'no entry for a Pokémon without evolutions');

const byId = new Map<string, any>();
setLiveEvolveCosts(null);
const t = stepCostInfo('pikachu', 'raichu', byId);
check(t.source === 'table' && t.cost === 50, 'without game data the table is used and flagged "table"');
setLiveEvolveCosts({ 'pikachu|raichu': { c: 77, i: null } });
const g = stepCostInfo('pikachu', 'raichu', byId);
check(g.source === 'game' && g.cost === 77, 'game data overrides the table');
check(stepCostInfo('pikachu_shadow', 'raichu_shadow', byId).source === 'game', 'shadow/purified variants use the base cost');
setLiveEvolveCosts(null);
check(stepCostInfo('zzz', 'yyy', byId).source === 'guess', 'unknown pair is flagged "guess"');
check(!EVOLVE_COSTS.has('weavile|sneasler') && !EVOLVE_COSTS.has('klawf|klawf'), 'bad rows removed from the table');
check(EVOLVE_COSTS.get('jigglypuff|wigglytuff')?.[1] === null, 'Jigglypuff no longer needs a made-up stone');
console.log(fails ? `\n${fails} FAILED` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
