import type { MonModel } from './types';

export const POWERUP_BANDS: [number, number, number][] = [
  [1.0, 200, 1], [3.0, 400, 1], [5.0, 600, 1], [7.0, 800, 1],
  [9.0, 1000, 1], [11.0, 1300, 2], [13.0, 1600, 2], [15.0, 1900, 2],
  [17.0, 2200, 2], [19.0, 2500, 2], [21.0, 3000, 3], [23.0, 3500, 3],
  [25.0, 4000, 3], [26.0, 4000, 4], [27.0, 4500, 4], [29.0, 5000, 4],
  [31.0, 6000, 6], [33.0, 7000, 8], [35.0, 8000, 10], [37.0, 9000, 12],
  [39.0, 10000, 15],
];

export const XL_STEPS: Record<number, [number, number]> = {
  40.5: [10000, 10], 41.0: [10000, 10], 41.5: [11000, 10], 42.0: [11000, 10],
  42.5: [11000, 12], 43.0: [11000, 12], 43.5: [12000, 12], 44.0: [12000, 12],
  44.5: [12000, 15], 45.0: [12000, 15], 45.5: [13000, 15], 46.0: [13000, 15],
  46.5: [13000, 17], 47.0: [13000, 17], 47.5: [14000, 17], 48.0: [14000, 17],
  48.5: [14000, 20], 49.0: [14000, 20], 49.5: [15000, 20], 50.0: [15000, 20],
};

function powerupCost(targetLevel: number): [number, number, number] {
  if (targetLevel > 40.0 + 1e-9) {
    const key = Math.round(targetLevel * 10) / 10;
    const xlPair = XL_STEPS[key] ?? [15000, 20];
    return [xlPair[0], 0, xlPair[1]];
  }
  const frm = targetLevel - 0.5;
  let dust = POWERUP_BANDS[POWERUP_BANDS.length - 1][1];
  let candy = POWERUP_BANDS[POWERUP_BANDS.length - 1][2];
  for (const [start, d, c] of POWERUP_BANDS) {
    if (start <= frm + 1e-9) {
      dust = d;
      candy = c;
    } else {
      break;
    }
  }
  return [dust, candy, 0];
}

export function stardustToLevel(
  fromLvl: number,
  toLvl: number,
  opts: { isShadow?: boolean; isLucky?: boolean; isPurified?: boolean } = {},
): [number, number, number] {
  const lo = Number(fromLvl);
  const hi = Number(toLvl);
  if (hi <= lo) return [0, 0, 0];
  const steps = Math.max(1, Math.round((hi - lo) * 2));
  let dust = 0;
  let candy = 0;
  let xl = 0;
  for (let i = 0; i < steps; i++) {
    const tgt = Math.round((lo + 0.5 * (i + 1)) * 10) / 10;
    let [d, c, x] = powerupCost(tgt);
    if (opts.isShadow) {
      d = Math.ceil(d * 1.2);
      c = Math.ceil(c * 1.2);
      x = Math.ceil(x * 1.2);
    }
    if (opts.isLucky) {
      d = Math.round(d * 0.5);
    }
    if (opts.isPurified) {
      d = Math.round(d * 0.9);
      c = Math.round(c * 0.9);
      x = Math.round(x * 0.9);
    }
    dust += d;
    candy += c;
    xl += x;
  }
  return [dust, candy, xl];
}

const RAW_EVOLVE_PAIRS: [string, string, number, string | null][] = [
  ['pichu', 'pikachu', 25, null],
  ['cleffa', 'clefairy', 25, null],
  ['igglybuff', 'jigglypuff', 25, null],
  ['togepi', 'togetic', 25, null],
  ['tyrogue', 'hitmonlee', 25, 'atk > def'],
  ['tyrogue', 'hitmonchan', 25, 'atk < def'],
  ['tyrogue', 'hitmontop', 25, 'atk = def'],
  ['smoochum', 'jynx', 25, null],
  ['elekid', 'electabuzz', 25, null],
  ['magby', 'magmar', 25, null],
  ['azurill', 'marill', 25, null],
  ['wynaut', 'wobbuffet', 25, null],
  ['budew', 'roselia', 25, null],
  ['chingling', 'chimecho', 25, null],
  ['bonsly', 'sudowoodo', 50, null],
  ['mimejr', 'mrmime', 50, null],
  ['happiny', 'chansey', 25, null],
  ['munchlax', 'snorlax', 50, null],
  ['riolu', 'lucario', 50, null],
  ['mantyke', 'mantine', 50, 'Remoraid in party'],
  ['sneasel_hisuian', 'sneasler', 100, 'Razor Claw + day'],
  ['charmander', 'charmeleon', 25, null],
  ['cyndaquil', 'quilava', 25, null],
  ['torchic', 'combusken', 25, null],
  ['chimchar', 'monferno', 25, null],
  ['tepig', 'pignite', 25, null],
  ['fennekin', 'braixen', 25, null],
  ['litten', 'torracat', 25, null],
  ['scorbunny', 'raboot', 25, null],
  ['squirtle', 'wartortle', 25, null],
  ['totodile', 'croconaw', 25, null],
  ['mudkip', 'marshtomp', 25, null],
  ['piplup', 'prinplup', 25, null],
  ['oshawott', 'dewott', 25, null],
  ['froakie', 'frogadier', 25, null],
  ['popplio', 'brionne', 25, null],
  ['sobble', 'drizzile', 25, null],
  ['bulbasaur', 'ivysaur', 25, null],
  ['chikorita', 'bayleef', 25, null],
  ['treecko', 'grovyle', 25, null],
  ['turtwig', 'grotle', 25, null],
  ['snivy', 'servine', 25, null],
  ['chespin', 'quilladin', 25, null],
  ['rowlet', 'dartrix', 25, null],
  ['grookey', 'thwackey', 25, null],
  ['caterpie', 'metapod', 12, null],
  ['weedle', 'kakuna', 12, null],
  ['pidgey', 'pidgeotto', 12, null],
  ['rattata', 'raticate', 20, null],
  ['rattata_alolan', 'raticate_alolan', 20, null],
  ['spearow', 'fearow', 50, null],
  ['ekans', 'arbok', 50, null],
  ['pikachu', 'raichu', 50, null],
  ['pikachu_alolan', 'raichu_alolan', 50, null],
  ['sandshrew', 'sandslash', 50, null],
  ['nidoran_female', 'nidorina', 25, null],
  ['nidoran_male', 'nidorino', 25, null],
  ['vulpix', 'ninetales', 50, null],
  ['jigglypuff', 'wigglytuff', 50, null],
  ['zubat', 'golbat', 25, null],
  ['oddish', 'gloom', 25, null],
  ['paras', 'parasect', 50, null],
  ['venonat', 'venomoth', 50, null],
  ['diglett', 'dugtrio', 50, null],
  ['meowth', 'persian', 50, null],
  ['psyduck', 'golduck', 50, null],
  ['mankey', 'primeape', 50, null],
  ['growlithe', 'arcanine', 50, null],
  ['poliwag', 'poliwhirl', 25, null],
  ['abra', 'kadabra', 25, null],
  ['machop', 'machoke', 25, null],
  ['bellsprout', 'weepinbell', 25, null],
  ['tentacool', 'tentacruel', 50, null],
  ['geodude', 'graveler', 25, null],
  ['ponyta', 'rapidash', 50, null],
  ['slowpoke', 'slowbro', 50, null],
  ['magnemite', 'magneton', 25, null],
  ['doduo', 'dodrio', 50, null],
  ['seel', 'dewgong', 50, null],
  ['grimer', 'muk', 50, null],
  ['shellder', 'cloyster', 50, null],
  ['gastly', 'haunter', 25, null],
  ['drowzee', 'hypno', 50, null],
  ['krabby', 'kingler', 50, null],
  ['voltorb', 'electrode', 50, null],
  ['exeggcute', 'exeggutor', 50, null],
  ['cubone', 'marowak', 50, null],
  ['koffing', 'weezing', 50, null],
  ['rhyhorn', 'rhydon', 50, null],
  ['horsea', 'seadra', 25, null],
  ['goldeen', 'seaking', 50, null],
  ['staryu', 'starmie', 50, null],
  ['magikarp', 'gyarados', 400, null],
  ['eevee', 'vaporeon', 25, null],
  ['eevee', 'jolteon', 25, null],
  ['eevee', 'flareon', 25, null],
  ['eevee', 'espeon', 25, 'walk 10 km as buddy'],
  ['eevee', 'umbreon', 25, 'walk 10 km as buddy'],
  ['eevee', 'leafeon', 25, 'Mossy Lure'],
  ['eevee', 'glaceon', 25, 'Glacial Lure'],
  ['eevee', 'sylveon', 25, 'earn 70 buddy hearts'],
  ['omanyte', 'omastar', 50, null],
  ['kabuto', 'kabutops', 50, null],
  ['dratini', 'dragonair', 25, null],
  ['sentret', 'furret', 25, null],
  ['hoothoot', 'noctowl', 50, null],
  ['ledyba', 'ledian', 25, null],
  ['spinarak', 'ariados', 50, null],
  ['chinchou', 'lanturn', 50, null],
  ['natu', 'xatu', 50, null],
  ['mareep', 'flaaffy', 25, null],
  ['marill', 'azumarill', 25, null],
  ['hoppip', 'skiploom', 25, null],
  ['aipom', 'ambipom', 100, null],
  ['sunkern', 'sunflora', 50, 'Sun Stone'],
  ['wooper', 'quagsire', 50, null],
  ['pineco', 'forretress', 50, null],
  ['snubbull', 'granbull', 50, null],
  ['teddiursa', 'ursaring', 50, null],
  ['slugma', 'magcargo', 50, null],
  ['swinub', 'piloswine', 25, null],
  ['remoraid', 'octillery', 50, null],
  ['houndour', 'houndoom', 25, null],
  ['phanpy', 'donphan', 50, null],
  ['stantler', 'wyrdeer', 50, null],
  ['larvitar', 'pupitar', 25, null],
  ['poochyena', 'mightyena', 50, null],
  ['zigzagoon', 'linoone', 50, null],
  ['wurmple', 'silcoon', 12, null],
  ['wurmple', 'cascoon', 12, null],
  ['lotad', 'lombre', 25, null],
  ['seedot', 'nuzleaf', 25, null],
  ['taillow', 'swellow', 50, null],
  ['wingull', 'pelipper', 50, null],
  ['ralts', 'kirlia', 25, null],
  ['surskit', 'masquerain', 50, null],
  ['shroomish', 'breloom', 50, null],
  ['slakoth', 'vigoroth', 25, null],
  ['vigoroth', 'slaking', 25, null],
  ['nincada', 'ninjask', 50, null],
  ['whismur', 'loudred', 12, null],
  ['makuhita', 'hariyama', 50, null],
  ['skitty', 'delcatty', 50, 'Moon Stone'],
  ['aron', 'lairon', 25, null],
  ['meditite', 'medicham', 50, null],
  ['electrike', 'manectric', 50, null],
  ['carvanha', 'sharpedo', 50, null],
  ['numel', 'camerupt', 50, null],
  ['spoink', 'grumpig', 50, null],
  ['trapinch', 'vibrava', 25, null],
  ['cacnea', 'cacturne', 50, null],
  ['swablu', 'altaria', 400, null],
  ['barboach', 'whiscash', 50, null],
  ['corphish', 'crawdaunt', 50, null],
  ['baltoy', 'claydol', 50, null],
  ['lileep', 'cradily', 50, null],
  ['anorith', 'armaldo', 50, null],
  ['feebas', 'milotic', 100, 'walk 20 km + Prism Scale'],
  ['shuppet', 'banette', 50, null],
  ['duskull', 'dusclops', 25, null],
  ['spheal', 'sealeo', 25, null],
  ['clamperl', 'huntail', 50, 'Deep Sea Tooth'],
  ['clamperl', 'gorebyss', 50, 'Deep Sea Scale'],
  ['bagon', 'shelgon', 25, null],
  ['shelgon', 'salamence', 100, null],
  ['beldum', 'metang', 25, null],
  ['metang', 'metagross', 100, null],
  ['starly', 'staravia', 25, null],
  ['bidoof', 'bibarel', 50, null],
  ['shinx', 'luxio', 25, null],
  ['burmy', 'wormadam', 50, 'female'],
  ['burmy', 'mothim', 50, 'male'],
  ['combee', 'vespiquen', 50, 'female'],
  ['buizel', 'floatzel', 50, null],
  ['cherubi', 'cherrim', 50, null],
  ['shellos', 'gastrodon', 50, null],
  ['drifloon', 'drifblim', 50, null],
  ['buneary', 'lopunny', 50, null],
  ['glameow', 'purugly', 50, null],
  ['stunky', 'skuntank', 50, null],
  ['bronzor', 'bronzong', 50, null],
  ['gible', 'gabite', 25, null],
  ['gabite', 'garchomp', 100, null],
  ['hippopotas', 'hippowdon', 50, null],
  ['skorupi', 'drapion', 50, null],
  ['croagunk', 'toxicroak', 50, null],
  ['snover', 'abomasnow', 50, null],
  ['patrat', 'watchog', 50, null],
  ['lillipup', 'herdier', 25, null],
  ['purrloin', 'liepard', 50, null],
  ['pansage', 'simisage', 50, 'Leaf Stone'],
  ['pansear', 'simisear', 50, 'Fire Stone'],
  ['panpour', 'simipour', 50, 'Water Stone'],
  ['munna', 'musharna', 50, 'Moon Stone'],
  ['pidove', 'tranquill', 12, null],
  ['blitzle', 'zebstrika', 50, null],
  ['roggenrola', 'boldore', 25, null],
  ['boldore', 'gigalith', 100, null],
  ['woobat', 'swoobat', 50, null],
  ['timburr', 'gurdurr', 25, null],
  ['gurdurr', 'conkeldurr', 100, null],
  ['sewaddle', 'swadloon', 25, null],
  ['venipede', 'whirlipede', 25, null],
  ['cottonee', 'whimsicott', 50, 'Sun Stone'],
  ['petilil', 'lilligant', 50, 'Sun Stone'],
  ['sandile', 'krokorok', 25, null],
  ['darumaka', 'darmanitan', 50, null],
  ['dwebble', 'crustle', 50, null],
  ['scraggy', 'scrafty', 50, null],
  ['yamask', 'cofagrigus', 50, 'Unova Stone'],
  ['tirtouga', 'carracosta', 50, null],
  ['archen', 'archeops', 50, null],
  ['trubbish', 'garbodor', 50, null],
  ['zorua', 'zoroark', 50, null],
  ['minccino', 'cinccino', 50, 'Unova Stone'],
  ['gothita', 'gothorita', 25, null],
  ['solosis', 'duosion', 25, null],
  ['ducklett', 'swanna', 50, null],
  ['vanillite', 'vanillish', 25, null],
  ['deerling', 'sawsbuck', 50, null],
  ['foongus', 'amoonguss', 50, null],
  ['frillish', 'jellicent', 50, null],
  ['joltik', 'galvantula', 50, null],
  ['ferroseed', 'ferrothorn', 50, null],
  ['klink', 'klang', 25, null],
  ['tynamo', 'eelektrik', 25, null],
  ['elgyem', 'beheeyem', 50, null],
  ['litwick', 'lampent', 25, null],
  ['lampent', 'chandelure', 100, 'Unova Stone'],
  ['axew', 'fraxure', 25, null],
  ['cubchoo', 'beartic', 50, null],
  ['shelmet', 'accelgor', 50, 'trade Shelmet/Karrablast'],
  ['karrablast', 'escavalier', 50, 'trade Karrablast/Shelmet'],
  ['mienfoo', 'mienshao', 50, null],
  ['golett', 'golurk', 50, null],
  ['pawniard', 'bisharp', 50, null],
  ['rufflet', 'braviary', 50, null],
  ['vullaby', 'mandibuzz', 50, null],
  ['deino', 'zweilous', 25, null],
  ['larvesta', 'volcarona', 400, null],
  ['fletchling', 'fletchinder', 25, null],
  ['scatterbug', 'spewpa', 12, null],
  ['litleo', 'pyroar', 50, null],
  ['flabebe', 'floette', 25, null],
  ['skiddo', 'gogoat', 50, null],
  ['pancham', 'pangoro', 50, null],
  ['espurr', 'meowstic', 50, null],
  ['honedge', 'doublade', 25, null],
  ['spritzee', 'aromatisse', 50, 'trade + Sachet'],
  ['swirlix', 'slurpuff', 50, 'trade + Whipped Dream'],
  ['inkay', 'malamar', 50, 'device upside down'],
  ['skrelp', 'dragalge', 50, null],
  ['clauncher', 'clawitzer', 50, null],
  ['helioptile', 'heliolisk', 50, 'Sun Stone'],
  ['tyrunt', 'tyrantrum', 50, null],
  ['amaura', 'aurorus', 50, null],
  ['goomy', 'sliggoo', 25, null],
  ['phantump', 'trevenant', 50, null],
  ['pumpkaboo', 'gourgeist', 50, null],
  ['bergmite', 'avalugg', 50, null],
  ['noibat', 'noivern', 400, null],
  ['pikipek', 'trumbeak', 25, null],
  ['yungoos', 'gumshoos', 50, null],
  ['grubbin', 'charjabug', 25, null],
  ['crabrawler', 'crabominable', 50, null],
  ['cutiefly', 'ribombee', 50, null],
  ['rockruff', 'lycanroc', 50, null],
  ['mareanie', 'toxapex', 50, null],
  ['mudbray', 'mudsdale', 50, null],
  ['dewpider', 'araquanid', 50, null],
  ['fomantis', 'lurantis', 50, null],
  ['morelull', 'shiinotic', 50, null],
  ['salandit', 'salazzle', 50, 'female'],
  ['stufful', 'bewear', 400, null],
  ['bounsweet', 'steenee', 25, null],
  ['wimpod', 'golisopod', 400, null],
  ['sandygast', 'palossand', 50, null],
  ['typenull', 'silvally', 50, null],
  ['jangmo_o', 'hakamoo', 25, null],
  ['hakamoo', 'kommoo', 100, null],
  ['skwovet', 'greedent', 50, null],
  ['rookidee', 'corvisquire', 25, null],
  ['corvisquire', 'corviknight', 100, null],
  ['blipbug', 'dottler', 25, null],
  ['chewtle', 'drednaw', 50, null],
  ['rolycoly', 'carkol', 25, null],
  ['applin', 'flapple', 50, 'Tart Apple'],
  ['applin', 'appletun', 50, 'Sweet Apple'],
  ['applin', 'dipplin', 50, 'Syrupy Apple'],
  ['silicobra', 'sandaconda', 50, null],
  ['arrokuda', 'barraskewda', 50, null],
  ['toxel', 'toxtricity', 400, null],
  ['sizzlipede', 'centiskorch', 50, null],
  ['clobbopus', 'grapploct', 50, null],
  ['sinistea', 'polteageist', 50, 'Cracked/Chipped Pot'],
  ['hatenna', 'hattrem', 25, null],
  ['impidimp', 'morgrem', 25, null],
  ['morgrem', 'grimmsnarl', 100, null],
  ['milcery', 'alcremie', 50, 'sweet + spin'],
  ['snom', 'frosmoth', 50, 'high friendship'],
  ['cufant', 'copperajah', 50, null],
  ['dreepy', 'drakloak', 25, null],
  ['drakloak', 'dragapult', 100, null],
  ['sprigatito', 'floragato', 25, null],
  ['fuecoco', 'crocalor', 25, null],
  ['quaxly', 'quaxwell', 25, null],
  ['lechonk', 'oinkologne', 50, null],
  ['tarountula', 'spidops', 50, null],
  ['nymble', 'lokix', 50, null],
  ['pawmi', 'pawmo', 25, null],
  ['tandemaus', 'maushold', 25, null],
  ['fidough', 'dachsbun', 50, null],
  ['smoliv', 'dolliv', 25, null],
  ['nacli', 'naclstack', 25, null],
  ['charcadet', 'armarouge', 50, 'Auspicious Armor'],
  ['charcadet', 'ceruledge', 50, 'Malicious Armor'],
  ['tadbulb', 'bellibolt', 50, 'Thunder Stone'],
  ['wattrel', 'kilowattrel', 50, null],
  ['maschiff', 'mabosstiff', 50, null],
  ['shroodle', 'grafaiai', 50, null],
  ['bramblin', 'brambleghast', 50, null],
  ['toedscool', 'toedscruel', 50, null],
  ['capsakid', 'scovillain', 50, 'Fire Stone'],
  ['rellor', 'rabsca', 50, null],
  ['flittle', 'espathra', 50, null],
  ['tinkatink', 'tinkatuff', 25, null],
  ['wiglett', 'wugtrio', 50, null],
  ['finizen', 'palafin', 50, 'co-op in Union Circle'],
  ['varoom', 'revavroom', 50, null],
  ['glimmet', 'glimmora', 50, null],
  ['greavard', 'houndstone', 50, null],
  ['cetoddle', 'cetitan', 50, null],
  ['frigibax', 'arctibax', 25, null],
  ['arctibax', 'baxcalibur', 100, null],
  // Second update block (overrides/trades/items/3-stage finals)
  ['kadabra', 'alakazam', 100, null],
  ['machoke', 'machamp', 100, null],
  ['graveler', 'golem', 100, null],
  ['haunter', 'gengar', 100, null],
  ['poliwhirl', 'politoed', 100, 'Kings Rock'],
  ['slowpoke', 'slowking', 50, 'Kings Rock'],
  ['slowpoke_galarian', 'slowking_galarian', 50, 'Galarica Wreath'],
  ['slowpoke_galarian', 'slowbro_galarian', 50, 'Galarica Cuff'],
  ['seadra', 'kingdra', 100, 'Dragon Scale'],
  ['onix', 'steelix', 50, 'Metal Coat'],
  ['scyther', 'scizor', 50, 'Metal Coat'],
  ['porygon', 'porygon2', 25, 'Up-Grade'],
  ['porygon2', 'porygonz', 100, 'Dubious Disc'],
  ['gloom', 'bellossom', 100, 'Sun Stone'],
  ['gloom', 'vileplume', 100, 'Leaf Stone'],
  ['poliwhirl', 'poliwrath', 100, 'Water Stone'],
  ['pikachu', 'raichu_alolan', 50, 'Thunder Stone'],
  ['nidorina', 'nidoqueen', 100, 'Moon Stone'],
  ['nidorino', 'nidoking', 100, 'Moon Stone'],
  ['clefairy', 'clefable', 50, 'Moon Stone'],
  ['skiploom', 'jumpluff', 100, null],
  ['roselia', 'roserade', 100, 'Shiny Stone'],
  ['togetic', 'togekiss', 100, 'Shiny Stone'],
  ['murkrow', 'honchkrow', 100, 'Dusk Stone'],
  ['misdreavus', 'mismagius', 100, 'Dusk Stone'],
  ['eelektrik', 'eelektross', 100, 'Unova Stone'],
  ['doublade', 'aegislash', 100, 'Dusk Stone'],
  ['frogadier', 'greninja', 100, null],
  ['charjabug', 'vikavolt', 100, 'Magnetic Lure'],
  ['charmeleon', 'charizard', 100, null],
  ['wartortle', 'blastoise', 100, null],
  ['ivysaur', 'venusaur', 100, null],
  ['quilava', 'typhlosion', 100, null],
  ['croconaw', 'feraligatr', 100, null],
  ['bayleef', 'meganium', 100, null],
  ['combusken', 'blaziken', 100, null],
  ['marshtomp', 'swampert', 100, null],
  ['grovyle', 'sceptile', 100, null],
  ['monferno', 'infernape', 100, null],
  ['prinplup', 'empoleon', 100, null],
  ['grotle', 'torterra', 100, null],
  ['pignite', 'emboar', 100, null],
  ['dewott', 'samurott', 100, null],
  ['servine', 'serperior', 100, null],
  ['braixen', 'delphox', 100, null],
  ['quilladin', 'chesnaught', 100, null],
  ['torracat', 'incineroar', 100, null],
  ['brionne', 'primarina', 100, null],
  ['dartrix', 'decidueye', 100, null],
  ['raboot', 'cinderace', 100, null],
  ['drizzile', 'inteleon', 100, null],
  ['thwackey', 'rillaboom', 100, null],
  ['floragato', 'meowscarada', 100, null],
  ['crocalor', 'skeledirge', 100, null],
  ['quaxwell', 'quaquaval', 100, null],
  ['dragonair', 'dragonite', 100, null],
  ['pupitar', 'tyranitar', 100, null],
  ['vibrava', 'flygon', 100, null],
  ['piloswine', 'mamoswine', 100, 'Ancient Power'],
  ['yanma', 'yanmega', 100, 'Ancient Power'],
  ['tangela', 'tangrowth', 100, 'Ancient Power'],
  ['lickitung', 'lickilicky', 100, 'Rollout'],
  ['gligar', 'gliscor', 100, 'Razor Fang + night'],
  ['sneasel', 'weavile', 100, 'Razor Claw + night'],
  ['nosepass', 'probopass', 50, 'Magnetic Lure'],
  ['magneton', 'magnezone', 100, 'Magnetic Lure'],
];

export const EVOLVE_COSTS = new Map<string, [number, string | null]>();
for (const [f, t, c, item] of RAW_EVOLVE_PAIRS) {
  EVOLVE_COSTS.set(`${f}|${t}`, [c, item]);
}

/** Real costs read from the game master for the current analysis (null = not available, use the built-in table). */
let LIVE_EVOLVE_COSTS: Map<string, [number, string | null]> | null = null;
export function setLiveEvolveCosts(costs?: Record<string, { c: number; i: string | null }> | null): void {
  if (!costs || Object.keys(costs).length === 0) {
    LIVE_EVOLVE_COSTS = null;
    return;
  }
  LIVE_EVOLVE_COSTS = new Map(Object.entries(costs).map(([k, v]) => [k, [v.c, v.i] as [number, string | null]]));
}

function stripVariant(sid: string): string {
  for (const tag of ['_shadow', '_purified']) {
    if (sid.endsWith(tag)) return sid.slice(0, -tag.length);
  }
  return sid;
}

export interface StepCostInfo {
  cost: number;
  item: string | null;
  /** game = live game data, table = built-in table (may be out of date), guess = no data at all. */
  source: 'game' | 'table' | 'guess';
}

export function stepCostInfo(
  frm: string,
  to: string,
  byId: Map<string, { family?: { parent?: string; evolutions?: string[] } }>,
): StepCostInfo {
  const f = stripVariant(frm || '');
  const t = stripVariant(to || '');
  if (!f || !t || f === t) return { cost: 0, item: null, source: 'game' };
  const fBase = f.split('_')[0];
  const tBase = t.split('_')[0];

  const live = LIVE_EVOLVE_COSTS?.get(`${f}|${t}`) ?? LIVE_EVOLVE_COSTS?.get(`${fBase}|${tBase}`);
  if (live) return { cost: live[0], item: live[1], source: 'game' };

  const hit = EVOLVE_COSTS.get(`${f}|${t}`) ?? EVOLVE_COSTS.get(`${fBase}|${tBase}`);
  if (hit) return { cost: hit[0], item: hit[1], source: 'table' };

  const spF = byId.get(f);
  const spT = byId.get(t);
  if (spF && spT) {
    if (!spF.family?.parent && (spT.family?.evolutions?.length ?? 0) > 0) return { cost: 25, item: null, source: 'guess' };
    if ((spT.family?.evolutions?.length ?? 0) === 0) return { cost: 100, item: null, source: 'guess' };
    return { cost: 50, item: null, source: 'guess' };
  }
  return { cost: 50, item: null, source: 'guess' };
}

export function stepCost(
  frm: string,
  to: string,
  byId: Map<string, { family?: { parent?: string; evolutions?: string[] } }>,
): [number, string | null] {
  const r = stepCostInfo(frm, to, byId);
  return [r.cost, r.item];
}

export function familyPathCost(
  startSid: string,
  targetSid: string,
  byId: Map<string, { family?: { parent?: string; evolutions?: string[] } }>,
): [number, string[], boolean] {
  const s = stripVariant(startSid || '');
  const t = stripVariant(targetSid || '');
  if (!s || !t || s === t) return [0, [], false];

  const queue: [string, number, string[], boolean][] = [[s, 0, [], false]];
  const seen = new Set<string>([s]);
  while (queue.length > 0) {
    const [cur, cost, items, est] = queue.shift()!;
    const sp = byId.get(cur);
    const evos = sp?.family?.evolutions || [];
    for (const nxt of evos) {
      const info = stepCostInfo(cur, nxt, byId);
      const newItems = info.item && !items.includes(info.item) ? [...items, info.item] : items;
      const newCost = cost + info.cost;
      const newEst = est || info.source !== 'game';
      if (stripVariant(nxt) === t) return [newCost, newItems, newEst];
      if (!seen.has(nxt)) {
        seen.add(nxt);
        queue.push([nxt, newCost, newItems, newEst]);
      }
    }
  }
  const info = stepCostInfo(s, t, byId);
  return [info.cost, info.item ? [info.item] : [], info.source !== 'game'];
}

export function buildRowCosts(
  m: MonModel,
  byId: Map<string, { speciesId: string; family?: { parent?: string; evolutions?: string[] } }>,
): { dust: number; candy: number; xl: number; evolve_candy: number; evolve_item: string; evolve_estimated: boolean } {
  if (!m.verdict.startsWith('BUILD_') && m.verdict !== 'KEEP') {
    return { dust: 0, candy: 0, xl: 0, evolve_candy: 0, evolve_item: '', evolve_estimated: false };
  }
  const startSid = m.species?.speciesId || '';
  const targetSid =
    m.evolve_to_sid ||
    (m.verdict === 'BUILD_MEGA' || m.verdict === 'BUILD_GYM' ? startSid : m.raid_sid || m.max_sid || '');
  let evoCandy = 0;
  let evoItems: string[] = [];
  let evoEstimated = false;
  if (targetSid && startSid && targetSid !== startSid) {
    [evoCandy, evoItems, evoEstimated] = familyPathCost(startSid, targetSid, byId);
  }
  let dust = 0;
  let candy = 0;
  let xl = 0;
  if (m.power_up_to && m.power_up_to > m.level) {
    [dust, candy, xl] = stardustToLevel(m.level, m.power_up_to, {
      isShadow: m.is_shadow,
      isLucky: m.is_lucky,
      isPurified: m.is_purified,
    });
  }
  return {
    dust,
    candy: candy + evoCandy,
    xl,
    evolve_candy: evoCandy,
    evolve_item: evoItems.join(', '),
    evolve_estimated: evoEstimated,
  };
}

// ------------------------------------------------------------
// Trade Stardust costs by friendship level [Good, Great, Ultra, Best].
// Source: Bulbapedia "Trade (GO)" / Pokémon GO wiki (checked Nov 2026). Events can discount these (e.g. -10%).
//   - Regular Pokémon: always 100 if both trainers have it registered; otherwise the "new" price.
//   - Special Trade Pokémon (Legendary, Ultra Beast, Shiny, Meltan/Melmetal, Gigantamax): the "special" prices.
//   - Purified Pokémon use the regular prices but still count as a Special Trade (limited per day).
// ------------------------------------------------------------
export const TRADE_FRIEND_LEVELS = ['Good', 'Great', 'Ultra', 'Best'] as const;
export const TRADE_COST_REGULAR_REGISTERED: [number, number, number, number] = [100, 100, 100, 100];
export const TRADE_COST_REGULAR_NEW: [number, number, number, number] = [20000, 16000, 1600, 800];
export const TRADE_COST_SPECIAL_REGISTERED: [number, number, number, number] = [20000, 16000, 1600, 800];
export const TRADE_COST_SPECIAL_NEW: [number, number, number, number] = [1000000, 800000, 80000, 40000];
