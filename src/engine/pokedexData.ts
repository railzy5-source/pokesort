import type { RaidTier, SpeciesEntry } from './types';

type RawTuple = [
  dex: number,
  key: string,
  name: string,
  atk: number,
  def: number,
  sta: number,
  types: string[],
  family: string,
  evolutions: string[],
  raidTier: RaidTier,
  pvp?: { little?: boolean; great?: boolean; ultra?: boolean; master?: boolean },
  flags?: {
    form?: string;
    isLegendary?: boolean;
    isMythical?: boolean;
    isUltraBeast?: boolean;
    isRegional?: boolean;
    canMega?: boolean;
  }
];

const RAW_SPECIES: RawTuple[] = [
  // Kanto Starters & Evolutions
  [1, 'BULBASAUR', 'Bulbasaur', 118, 111, 128, ['Grass', 'Poison'], 'BULBASAUR', ['VENUSAUR'], 'C', { little: true }],
  [2, 'IVYSAUR', 'Ivysaur', 151, 143, 155, ['Grass', 'Poison'], 'BULBASAUR', ['VENUSAUR'], 'C', { great: true }],
  [3, 'VENUSAUR', 'Venusaur', 198, 189, 190, ['Grass', 'Poison'], 'BULBASAUR', [], 'A', { great: true, ultra: true }, { canMega: true }],
  [4, 'CHARMANDER', 'Charmander', 116, 93, 118, ['Fire'], 'CHARMANDER', ['CHARIZARD'], 'C', { little: true }],
  [5, 'CHARMELEON', 'Charmeleon', 158, 126, 151, ['Fire'], 'CHARMANDER', ['CHARIZARD'], 'C'],
  [6, 'CHARIZARD', 'Charizard', 223, 173, 186, ['Fire', 'Flying'], 'CHARMANDER', [], 'A', { great: true, ultra: true }, { canMega: true }],
  [7, 'SQUIRTLE', 'Squirtle', 94, 121, 127, ['Water'], 'SQUIRTLE', ['BLASTOISE'], 'C', { little: true }],
  [8, 'WARTORTLE', 'Wartortle', 126, 155, 153, ['Water'], 'SQUIRTLE', ['BLASTOISE'], 'C', { great: true }],
  [9, 'BLASTOISE', 'Blastoise', 171, 207, 188, ['Water'], 'SQUIRTLE', [], 'B', { great: true, ultra: true }, { canMega: true }],

  // Kanto Staples & PvP/Raid Meta
  [10, 'CATERPIE', 'Caterpie', 55, 55, 128, ['Bug'], 'CATERPIE', ['BUTTERFREE'], 'C'],
  [12, 'BUTTERFREE', 'Butterfree', 167, 137, 155, ['Bug', 'Flying'], 'CATERPIE', [], 'C'],
  [13, 'WEEDLE', 'Weedle', 63, 50, 120, ['Bug', 'Poison'], 'WEEDLE', ['BEEDRILL'], 'C'],
  [15, 'BEEDRILL', 'Beedrill', 169, 130, 163, ['Bug', 'Poison'], 'WEEDLE', [], 'B', { great: true }, { canMega: true }],
  [16, 'PIDGEY', 'Pidgey', 85, 73, 120, ['Normal', 'Flying'], 'PIDGEY', ['PIDGEOT'], 'C'],
  [18, 'PIDGEOT', 'Pidgeot', 166, 154, 195, ['Normal', 'Flying'], 'PIDGEY', [], 'B', { great: true, ultra: true }, { canMega: true }],
  [19, 'RATTATA', 'Rattata', 103, 70, 102, ['Normal'], 'RATTATA', ['RATICATE'], 'C'],
  [20, 'RATICATE', 'Raticate', 161, 139, 146, ['Normal'], 'RATTATA', [], 'C'],
  [25, 'PIKACHU', 'Pikachu', 112, 96, 111, ['Electric'], 'PIKACHU', ['RAICHU'], 'C', { little: true }],
  [26, 'RAICHU', 'Raichu', 193, 151, 155, ['Electric'], 'PIKACHU', [], 'C', { great: true }],
  [26, 'RAICHU_ALOLA', 'Alolan Raichu', 201, 154, 155, ['Electric', 'Psychic'], 'PIKACHU', [], 'C', { great: true }, { form: 'ALOLA' }],
  [27, 'SANDSHREW_ALOLA', 'Alolan Sandshrew', 125, 129, 137, ['Ice', 'Steel'], 'SANDSHREW', ['SANDSLASH_ALOLA'], 'C', { great: true }, { form: 'ALOLA' }],
  [28, 'SANDSLASH', 'Sandslash', 182, 175, 181, ['Ground'], 'SANDSHREW', [], 'C', { great: true }],
  [28, 'SANDSLASH_ALOLA', 'Alolan Sandslash', 177, 195, 181, ['Ice', 'Steel'], 'SANDSHREW', [], 'C', { great: true, ultra: true }, { form: 'ALOLA' }],
  [29, 'NIDORAN_FEMALE', 'Nidoran♀', 86, 89, 146, ['Poison'], 'NIDORAN_F', ['NIDOQUEEN'], 'C'],
  [31, 'NIDOQUEEN', 'Nidoqueen', 180, 173, 207, ['Poison', 'Ground'], 'NIDORAN_F', [], 'C', { great: true, ultra: true }],
  [37, 'VULPIX_ALOLA', 'Alolan Vulpix', 96, 109, 116, ['Ice'], 'VULPIX', ['NINETALES_ALOLA'], 'C', { little: true }, { form: 'ALOLA' }],
  [38, 'NINETALES', 'Ninetales', 169, 190, 177, ['Fire'], 'VULPIX', [], 'C', { great: true, ultra: true }],
  [38, 'NINETALES_ALOLA', 'Alolan Ninetales', 170, 193, 177, ['Ice', 'Fairy'], 'VULPIX', [], 'C', { great: true, ultra: true }, { form: 'ALOLA' }],
  [39, 'JIGGLYPUFF', 'Jigglypuff', 80, 41, 251, ['Normal', 'Fairy'], 'JIGGLYPUFF', ['WIGGLYTUFF'], 'C'],
  [40, 'WIGGLYTUFF', 'Wigglytuff', 156, 90, 295, ['Normal', 'Fairy'], 'JIGGLYPUFF', [], 'C', { great: true }],
  [41, 'ZUBAT', 'Zubat', 83, 73, 120, ['Poison', 'Flying'], 'ZUBAT', ['GOLBAT', 'CROBAT'], 'C'],
  [42, 'GOLBAT', 'Golbat', 161, 150, 181, ['Poison', 'Flying'], 'ZUBAT', ['CROBAT'], 'C', { great: true }],
  [52, 'MEOWTH_GALARIAN', 'Galarian Meowth', 115, 92, 137, ['Steel'], 'MEOWTH', ['PERRSERKER'], 'C', {}, { form: 'GALARIAN' }],
  [57, 'PRIMEAPE', 'Primeape', 207, 138, 163, ['Fighting'], 'MANKEY', ['ANNIHILAPE'], 'C', { great: true }],
  [58, 'GROWLITHE', 'Growlithe', 136, 93, 146, ['Fire'], 'GROWLITHE', ['ARCANINE'], 'C'],
  [59, 'ARCANINE', 'Arcanine', 227, 166, 207, ['Fire'], 'GROWLITHE', [], 'B'],
  [60, 'POLIWAG', 'Poliwag', 101, 82, 120, ['Water'], 'POLIWAG', ['POLIWRATH', 'POLITOED'], 'C'],
  [62, 'POLIWRATH', 'Poliwrath', 182, 184, 207, ['Water', 'Fighting'], 'POLIWAG', [], 'C', { great: true, ultra: true }],
  [63, 'ABRA', 'Abra', 195, 82, 93, ['Psychic'], 'ABRA', ['ALAKAZAM'], 'C'],
  [65, 'ALAKAZAM', 'Alakazam', 271, 167, 146, ['Psychic'], 'ABRA', [], 'A', {}, { canMega: true }],
  [66, 'MACHOP', 'Machop', 137, 82, 172, ['Fighting'], 'MACHOP', ['MACHAMP'], 'C'],
  [67, 'MACHOKE', 'Machoke', 177, 125, 190, ['Fighting'], 'MACHOP', ['MACHAMP'], 'C'],
  [68, 'MACHAMP', 'Machamp', 234, 159, 207, ['Fighting'], 'MACHOP', [], 'A', { great: true, ultra: true }],
  [70, 'WEEPINBELL', 'Weepinbell', 172, 92, 163, ['Grass', 'Poison'], 'BELLSPROUT', ['VICTREEBEL'], 'C'],
  [71, 'VICTREEBEL', 'Victreebel', 207, 135, 190, ['Grass', 'Poison'], 'BELLSPROUT', [], 'B', { great: true }],
  [72, 'TENTACOOL', 'Tentacool', 97, 149, 120, ['Water', 'Poison'], 'TENTACOOL', ['TENTACRUEL'], 'C'],
  [73, 'TENTACRUEL', 'Tentacruel', 166, 209, 190, ['Water', 'Poison'], 'TENTACOOL', [], 'C', { great: true, ultra: true }],
  [74, 'GEODUDE', 'Geodude', 132, 132, 120, ['Rock', 'Ground'], 'GEODUDE', ['GOLEM'], 'C'],
  [76, 'GOLEM', 'Golem', 211, 198, 190, ['Rock', 'Ground'], 'GEODUDE', [], 'B'],
  [81, 'MAGNEMITE', 'Magnemite', 165, 121, 93, ['Electric', 'Steel'], 'MAGNEMITE', ['MAGNEZONE'], 'C'],
  [82, 'MAGNETON', 'Magneton', 223, 169, 137, ['Electric', 'Steel'], 'MAGNEMITE', ['MAGNEZONE'], 'B'],
  [83, 'FARFETCHD_GALARIAN', 'Galarian Farfetch’d', 174, 114, 141, ['Fighting'], 'FARFETCHD', ['SIRFETCHD'], 'C', {}, { form: 'GALARIAN' }],
  [87, 'DEWGONG', 'Dewgong', 139, 177, 207, ['Water', 'Ice'], 'SEEL', [], 'C', { great: true }],
  [88, 'GRIMER_ALOLA', 'Alolan Grimer', 135, 90, 190, ['Poison', 'Dark'], 'GRIMER', ['MUK_ALOLA'], 'C', {}, { form: 'ALOLA' }],
  [89, 'MUK_ALOLA', 'Alolan Muk', 190, 172, 233, ['Poison', 'Dark'], 'GRIMER', [], 'C', { great: true, ultra: true }, { form: 'ALOLA' }],
  [92, 'GASTLY', 'Gastly', 186, 67, 102, ['Ghost', 'Poison'], 'GASTLY', ['HAUNTER', 'GENGAR'], 'C'],
  [93, 'HAUNTER', 'Haunter', 223, 107, 128, ['Ghost', 'Poison'], 'GASTLY', ['GENGAR'], 'C', { great: true }],
  [94, 'GENGAR', 'Gengar', 261, 149, 155, ['Ghost', 'Poison'], 'GASTLY', [], 'S', {}, { canMega: true }],
  [95, 'ONIX', 'Onix', 85, 232, 111, ['Rock', 'Ground'], 'ONIX', ['STEELIX'], 'C', { little: true }],
  [98, 'KRABBY', 'Krabby', 181, 124, 102, ['Water'], 'KRABBY', ['KINGLER'], 'C'],
  [99, 'KINGLER', 'Kingler', 240, 181, 146, ['Water'], 'KRABBY', [], 'A'],
  [104, 'CUBONE', 'Cubone', 90, 144, 137, ['Ground'], 'CUBONE', ['MAROWAK', 'MAROWAK_ALOLA'], 'C'],
  [105, 'MAROWAK_ALOLA', 'Alolan Marowak', 144, 186, 155, ['Fire', 'Ghost'], 'CUBONE', [], 'C', { great: true }, { form: 'ALOLA' }],
  [108, 'LICKITUNG', 'Lickitung', 108, 137, 207, ['Normal'], 'LICKITUNG', ['LICKILICKY'], 'C', { great: true }],
  [111, 'RHYHORN', 'Rhyhorn', 140, 127, 190, ['Ground', 'Rock'], 'RHYHORN', ['RHYPERIOR'], 'C'],
  [112, 'RHYDON', 'Rhydon', 222, 171, 233, ['Ground', 'Rock'], 'RHYHORN', ['RHYPERIOR'], 'B'],
  [113, 'CHANSEY', 'Chansey', 60, 128, 487, ['Normal'], 'CHANSEY', ['BLISSEY'], 'C'],
  [114, 'TANGELA', 'Tangela', 183, 169, 163, ['Grass'], 'TANGELA', ['TANGROWTH'], 'C'],
  [115, 'KANGASKHAN', 'Kangaskhan', 181, 165, 233, ['Normal'], 'KANGASKHAN', [], 'B', {}, { isRegional: true, canMega: true }],
  [122, 'MR_MIME', 'Mr. Mime', 192, 205, 120, ['Psychic', 'Fairy'], 'MR_MIME', [], 'C', {}, { isRegional: true }],
  [123, 'SCYTHER', 'Scyther', 218, 170, 172, ['Bug', 'Flying'], 'SCYTHER', ['SCIZOR'], 'B'],
  [127, 'PINSIR', 'Pinsir', 238, 182, 163, ['Bug'], 'PINSIR', [], 'A', {}, { canMega: true }],
  [128, 'TAUROS', 'Tauros', 198, 183, 181, ['Normal'], 'TAUROS', [], 'C', {}, { isRegional: true }],
  [129, 'MAGIKARP', 'Magikarp', 29, 85, 85, ['Water'], 'MAGIKARP', ['GYARADOS'], 'C'],
  [130, 'GYARADOS', 'Gyarados', 237, 186, 216, ['Water', 'Flying'], 'MAGIKARP', [], 'A', { ultra: true, master: true }, { canMega: true }],
  [131, 'LAPRAS', 'Lapras', 165, 174, 277, ['Water', 'Ice'], 'LAPRAS', [], 'C', { great: true, ultra: true }],
  [132, 'DITTO', 'Ditto', 91, 91, 134, ['Normal'], 'DITTO', [], 'C'],
  [133, 'EEVEE', 'Eevee', 104, 114, 146, ['Normal'], 'EEVEE', ['VAPOREON', 'JOLTEON', 'FLAREON', 'ESPEON', 'UMBREON', 'GLACEON', 'SYLVEON'], 'C'],
  [134, 'VAPOREON', 'Vaporeon', 205, 161, 277, ['Water'], 'EEVEE', [], 'B'],
  [135, 'JOLTEON', 'Jolteon', 232, 182, 163, ['Electric'], 'EEVEE', [], 'B'],
  [136, 'FLAREON', 'Flareon', 246, 179, 163, ['Fire'], 'EEVEE', [], 'B'],
  [137, 'PORYGON', 'Porygon', 153, 136, 163, ['Normal'], 'PORYGON', ['PORYGON_Z'], 'C'],
  [142, 'AERODACTYL', 'Aerodactyl', 221, 159, 190, ['Rock', 'Flying'], 'AERODACTYL', [], 'A', {}, { canMega: true }],
  [143, 'SNORLAX', 'Snorlax', 190, 169, 330, ['Normal'], 'SNORLAX', [], 'B', { ultra: true, master: true }],
  [144, 'ARTICUNO', 'Articuno', 192, 236, 207, ['Ice', 'Flying'], 'ARTICUNO', [], 'B', { ultra: true }, { isLegendary: true }],
  [145, 'ZAPDOS', 'Zapdos', 253, 185, 207, ['Electric', 'Flying'], 'ZAPDOS', [], 'A', {}, { isLegendary: true }],
  [146, 'MOLTRES', 'Moltres', 251, 181, 207, ['Fire', 'Flying'], 'MOLTRES', [], 'A', {}, { isLegendary: true }],
  [147, 'DRATINI', 'Dratini', 119, 91, 121, ['Dragon'], 'DRATINI', ['DRAGONAIR', 'DRAGONITE'], 'C'],
  [148, 'DRAGONAIR', 'Dragonair', 163, 135, 156, ['Dragon'], 'DRATINI', ['DRAGONITE'], 'C', { great: true }],
  [149, 'DRAGONITE', 'Dragonite', 263, 198, 209, ['Dragon', 'Flying'], 'DRATINI', [], 'S', { ultra: true, master: true }],
  [150, 'MEWTWO', 'Mewtwo', 300, 182, 214, ['Psychic'], 'MEWTWO', [], 'S', { master: true }, { isLegendary: true, canMega: true }],
  [150, 'MEWTWO_ARMORED', 'Armored Mewtwo', 182, 278, 214, ['Psychic'], 'MEWTWO', [], 'C', { ultra: true }, { form: 'ARMORED', isLegendary: true }],
  [151, 'MEW', 'Mew', 210, 210, 225, ['Psychic'], 'MEW', [], 'B', { great: true }, { isMythical: true }],

  // Johto
  [152, 'CHIKORITA', 'Chikorita', 92, 122, 128, ['Grass'], 'CHIKORITA', ['MEGANIUM'], 'C'],
  [154, 'MEGANIUM', 'Meganium', 168, 202, 190, ['Grass'], 'CHIKORITA', [], 'C', { great: true, ultra: true }],
  [155, 'CYNDAQUIL', 'Cyndaquil', 116, 93, 118, ['Fire'], 'CYNDAQUIL', ['TYPHLOSION'], 'C'],
  [157, 'TYPHLOSION', 'Typhlosion', 223, 173, 186, ['Fire'], 'CYNDAQUIL', [], 'B', { ultra: true }],
  [158, 'TOTODILE', 'Totodile', 117, 109, 137, ['Water'], 'TOTODILE', ['FERALIGATR'], 'C'],
  [160, 'FERALIGATR', 'Feraligatr', 205, 188, 198, ['Water'], 'TOTODILE', [], 'A', { great: true, ultra: true }],
  [163, 'HOOTHOOT', 'Hoothoot', 67, 88, 155, ['Normal', 'Flying'], 'HOOTHOOT', ['NOCTOWL'], 'C'],
  [164, 'NOCTOWL', 'Noctowl', 145, 156, 225, ['Normal', 'Flying'], 'HOOTHOOT', [], 'C', { great: true }],
  [169, 'CROBAT', 'Crobat', 194, 178, 198, ['Poison', 'Flying'], 'ZUBAT', [], 'C', { ultra: true }],
  [170, 'CHINCHOU', 'Chinchou', 106, 97, 181, ['Water', 'Electric'], 'CHINCHOU', ['LANTURN'], 'C', { little: true }],
  [171, 'LANTURN', 'Lanturn', 146, 137, 268, ['Water', 'Electric'], 'CHINCHOU', [], 'C', { great: true }],
  [175, 'TOGEPI', 'Togepi', 67, 116, 111, ['Fairy'], 'TOGEPI', ['TOGETIC', 'TOGEKISS'], 'C'],
  [176, 'TOGETIC', 'Togetic', 139, 181, 146, ['Fairy', 'Flying'], 'TOGEPI', ['TOGEKISS'], 'C'],
  [183, 'MARILL', 'Marill', 37, 93, 172, ['Water', 'Fairy'], 'MARILL', ['AZUMARILL'], 'C', { little: true }],
  [184, 'AZUMARILL', 'Azumarill', 112, 152, 225, ['Water', 'Fairy'], 'MARILL', [], 'C', { great: true }],
  [186, 'POLITOED', 'Politoed', 174, 179, 207, ['Water'], 'POLIWAG', [], 'C', { great: true, ultra: true }],
  [196, 'ESPEON', 'Espeon', 261, 175, 163, ['Psychic'], 'EEVEE', [], 'A'],
  [197, 'UMBREON', 'Umbreon', 126, 240, 216, ['Dark'], 'EEVEE', [], 'C', { great: true, ultra: true }],
  [198, 'MURKROW', 'Murkrow', 175, 87, 155, ['Dark', 'Flying'], 'MURKROW', ['HONCHKROW'], 'C'],
  [202, 'WOBBUFFET', 'Wobbuffet', 60, 106, 382, ['Psychic'], 'WOBBUFFET', [], 'C', { great: true }],
  [206, 'DUNSPARCE', 'Dunsparce', 131, 128, 225, ['Normal'], 'DUNSPARCE', ['DUDUNSPARCE'], 'C', { great: true }],
  [207, 'GLIGAR', 'Gligar', 143, 184, 163, ['Ground', 'Flying'], 'GLIGAR', ['GLISCOR'], 'C', { great: true }],
  [208, 'STEELIX', 'Steelix', 148, 272, 181, ['Steel', 'Ground'], 'ONIX', [], 'B', { great: true, ultra: true }, { canMega: true }],
  [212, 'SCIZOR', 'Scizor', 236, 181, 172, ['Bug', 'Steel'], 'SCYTHER', [], 'A', { ultra: true }, { canMega: true }],
  [214, 'HERACROSS', 'Heracross', 234, 179, 190, ['Bug', 'Fighting'], 'HERACROSS', [], 'A', {}, { isRegional: true, canMega: true }],
  [215, 'SNEASEL', 'Sneasel', 189, 146, 146, ['Dark', 'Ice'], 'SNEASEL', ['WEAVILE'], 'C'],
  [220, 'SWINUB', 'Swinub', 90, 69, 137, ['Ice', 'Ground'], 'SWINUB', ['MAMOSWINE'], 'C'],
  [221, 'PILOSWINE', 'Piloswine', 181, 138, 225, ['Ice', 'Ground'], 'SWINUB', ['MAMOSWINE'], 'B'],
  [227, 'SKARMORY', 'Skarmory', 148, 226, 163, ['Steel', 'Flying'], 'SKARMORY', [], 'C', { great: true, ultra: true }],
  [229, 'HOUNDOOM', 'Houndoom', 224, 144, 181, ['Dark', 'Fire'], 'HOUNDOUR', [], 'A', {}, { canMega: true }],
  [230, 'KINGDRA', 'Kingdra', 194, 194, 181, ['Water', 'Dragon'], 'HORSEA', [], 'C', { ultra: true }],
  [243, 'RAIKOU', 'Raikou', 241, 195, 207, ['Electric'], 'RAIKOU', [], 'A', {}, { isLegendary: true }],
  [244, 'ENTEI', 'Entei', 235, 171, 251, ['Fire'], 'ENTEI', [], 'A', {}, { isLegendary: true }],
  [245, 'SUICUNE', 'Suicune', 180, 235, 225, ['Water'], 'SUICUNE', [], 'C', { ultra: true }, { isLegendary: true }],
  [246, 'LARVITAR', 'Larvitar', 115, 93, 137, ['Rock', 'Ground'], 'LARVITAR', ['TYRANITAR'], 'C'],
  [248, 'TYRANITAR', 'Tyranitar', 251, 207, 225, ['Rock', 'Dark'], 'LARVITAR', [], 'S', { master: true }, { canMega: true }],
  [249, 'LUGIA', 'Lugia', 193, 310, 235, ['Psychic', 'Flying'], 'LUGIA', [], 'B', { master: true }, { isLegendary: true }],
  [250, 'HO_OH', 'Ho-Oh', 239, 244, 214, ['Fire', 'Flying'], 'HO_OH', [], 'A', { master: true }, { isLegendary: true }],
  [251, 'CELEBI', 'Celebi', 210, 210, 225, ['Psychic', 'Grass'], 'CELEBI', [], 'B', {}, { isMythical: true }],

  // Hoenn
  [252, 'TREECKO', 'Treecko', 124, 94, 120, ['Grass'], 'TREECKO', ['SCEPTILE'], 'C'],
  [254, 'SCEPTILE', 'Sceptile', 223, 169, 172, ['Grass'], 'TREECKO', [], 'S', {}, { canMega: true }],
  [255, 'TORCHIC', 'Torchic', 130, 87, 128, ['Fire'], 'TORCHIC', ['BLAZIKEN'], 'C'],
  [257, 'BLAZIKEN', 'Blaziken', 240, 141, 190, ['Fire', 'Fighting'], 'TORCHIC', [], 'S', {}, { canMega: true }],
  [258, 'MUDKIP', 'Mudkip', 126, 93, 137, ['Water'], 'MUDKIP', ['SWAMPERT'], 'C', { little: true }],
  [259, 'MARSHTOMP', 'Marshtomp', 156, 133, 172, ['Water', 'Ground'], 'MUDKIP', ['SWAMPERT'], 'C', { great: true }],
  [260, 'SWAMPERT', 'Swampert', 208, 175, 225, ['Water', 'Ground'], 'MUDKIP', [], 'S', { great: true, ultra: true }, { canMega: true }],
  [262, 'MIGHTYENA', 'Mightyena', 171, 132, 172, ['Dark'], 'POOCHYENA', [], 'C'],
  [263, 'ZIGZAGOON_GALARIAN', 'Galarian Zigzagoon', 58, 80, 116, ['Dark', 'Normal'], 'ZIGZAGOON', ['OBSTAGOON'], 'C', {}, { form: 'GALARIAN' }],
  [272, 'LUDICOLO', 'Ludicolo', 173, 176, 190, ['Water', 'Grass'], 'LOTAD', [], 'C', { great: true }],
  [275, 'SHIFTRY', 'Shiftry', 200, 121, 207, ['Grass', 'Dark'], 'SEEDOT', [], 'C', { great: true }],
  [279, 'PELIPPER', 'Pelipper', 175, 174, 155, ['Water', 'Flying'], 'WINGULL', [], 'C', { great: true }],
  [280, 'RALTS', 'Ralts', 79, 59, 99, ['Psychic', 'Fairy'], 'RALTS', ['GARDEVOIR', 'GALLADE'], 'C'],
  [282, 'GARDEVOIR', 'Gardevoir', 237, 195, 169, ['Psychic', 'Fairy'], 'RALTS', [], 'S', {}, { canMega: true }],
  [286, 'BRELOOM', 'Breloom', 241, 144, 155, ['Grass', 'Fighting'], 'SHROOMISH', [], 'A'],
  [288, 'VIGOROTH', 'Vigoroth', 159, 145, 190, ['Normal'], 'SLAKOTH', ['SLAKING'], 'C', { great: true }],
  [289, 'SLAKING', 'Slaking', 290, 166, 284, ['Normal'], 'SLAKOTH', [], 'C'],
  [296, 'MAKUHITA', 'Makuhita', 99, 54, 176, ['Fighting'], 'MAKUHITA', ['HARIYAMA'], 'C'],
  [297, 'HARIYAMA', 'Hariyama', 209, 114, 302, ['Fighting'], 'MAKUHITA', [], 'A'],
  [302, 'SABLEYE', 'Sableye', 141, 136, 137, ['Dark', 'Ghost'], 'SABLEYE', [], 'C', { great: true }, { canMega: true }],
  [306, 'AGGRON', 'Aggron', 198, 257, 172, ['Steel', 'Rock'], 'ARON', [], 'B', {}, { canMega: true }],
  [307, 'MEDITITE', 'Meditite', 78, 107, 102, ['Fighting', 'Psychic'], 'MEDITITE', ['MEDICHAM'], 'C'],
  [308, 'MEDICHAM', 'Medicham', 121, 152, 155, ['Fighting', 'Psychic'], 'MEDITITE', [], 'C', { great: true }, { canMega: true }],
  [310, 'MANECTRIC', 'Manectric', 215, 127, 172, ['Electric'], 'ELECTRIKE', [], 'A', {}, { canMega: true }],
  [319, 'SHARPEDO', 'Sharpedo', 243, 83, 172, ['Water', 'Dark'], 'CARVANHA', [], 'B', {}, { canMega: true }],
  [334, 'ALTARIA', 'Altaria', 141, 201, 181, ['Dragon', 'Flying'], 'SWABLU', [], 'C', { great: true }, { canMega: true }],
  [340, 'WHISCASH', 'Whiscash', 151, 141, 242, ['Water', 'Ground'], 'BARBOACH', [], 'C', { great: true }],
  [350, 'MILOTIC', 'Milotic', 192, 219, 216, ['Water'], 'FEEBAS', [], 'B', { master: true }],
  [359, 'ABSOL', 'Absol', 246, 120, 163, ['Dark'], 'ABSOL', [], 'A', {}, { canMega: true }],
  [365, 'WALREIN', 'Walrein', 182, 176, 242, ['Ice', 'Water'], 'SPHEAL', [], 'C', { great: true, ultra: true }],
  [371, 'BAGON', 'Bagon', 134, 93, 128, ['Dragon'], 'BAGON', ['SALAMENCE'], 'C'],
  [373, 'SALAMENCE', 'Salamence', 277, 168, 216, ['Dragon', 'Flying'], 'BAGON', [], 'S', {}, { canMega: true }],
  [374, 'BELDUM', 'Beldum', 96, 132, 120, ['Steel', 'Psychic'], 'BELDUM', ['METAGROSS'], 'C'],
  [376, 'METAGROSS', 'Metagross', 257, 228, 190, ['Steel', 'Psychic'], 'BELDUM', [], 'S', { master: true }, { canMega: true }],
  [377, 'REGIROCK', 'Regirock', 179, 309, 190, ['Rock'], 'REGIROCK', [], 'C', { great: true, ultra: true }, { isLegendary: true }],
  [378, 'REGICE', 'Regice', 179, 309, 190, ['Ice'], 'REGICE', [], 'C', { great: true, ultra: true }, { isLegendary: true }],
  [379, 'REGISTEEL', 'Registeel', 143, 285, 190, ['Steel'], 'REGISTEEL', [], 'C', { great: true, ultra: true }, { isLegendary: true }],
  [380, 'LATIAS', 'Latias', 228, 246, 190, ['Dragon', 'Psychic'], 'LATIAS', [], 'B', {}, { isLegendary: true, canMega: true }],
  [381, 'LATIOS', 'Latios', 268, 212, 190, ['Dragon', 'Psychic'], 'LATIOS', [], 'S', {}, { isLegendary: true, canMega: true }],
  [382, 'KYOGRE', 'Kyogre', 270, 228, 205, ['Water'], 'KYOGRE', [], 'S', { master: true }, { isLegendary: true, canMega: true }],
  [383, 'GROUDON', 'Groudon', 270, 228, 205, ['Ground'], 'GROUDON', [], 'S', { master: true }, { isLegendary: true, canMega: true }],
  [384, 'RAYQUAZA', 'Rayquaza', 284, 170, 213, ['Dragon', 'Flying'], 'RAYQUAZA', [], 'S', { master: true }, { isLegendary: true, canMega: true }],
  [385, 'JIRACHI', 'Jirachi', 210, 210, 225, ['Steel', 'Psychic'], 'JIRACHI', [], 'B', { great: true }, { isMythical: true }],
  [386, 'DEOXYS_DEFENSE', 'Deoxys (Defense)', 144, 330, 137, ['Psychic'], 'DEOXYS', [], 'C', { great: true, ultra: true }, { form: 'DEFENSE', isMythical: true }],

  // Sinnoh
  [387, 'TURTWIG', 'Turtwig', 119, 110, 146, ['Grass'], 'TURTWIG', ['TORTERRA'], 'C'],
  [389, 'TORTERRA', 'Torterra', 202, 188, 216, ['Grass', 'Ground'], 'TURTWIG', [], 'B'],
  [390, 'CHIMCHAR', 'Chimchar', 113, 86, 127, ['Fire'], 'CHIMCHAR', ['INFERNAPE'], 'C'],
  [392, 'INFERNAPE', 'Infernape', 222, 151, 183, ['Fire', 'Fighting'], 'CHIMCHAR', [], 'B'],
  [393, 'PIPLUP', 'Piplup', 112, 102, 142, ['Water'], 'PIPLUP', ['EMPOLEON'], 'C'],
  [395, 'EMPOLEON', 'Empoleon', 210, 186, 197, ['Water', 'Steel'], 'PIPLUP', [], 'B', { great: true, ultra: true }],
  [398, 'STARAPTOR', 'Staraptor', 234, 140, 198, ['Normal', 'Flying'], 'STARLY', [], 'A'],
  [405, 'LUXRAY', 'Luxray', 232, 156, 190, ['Electric'], 'SHINX', [], 'B'],
  [407, 'ROSERADE', 'Roserade', 243, 185, 155, ['Grass', 'Poison'], 'BUDEW', [], 'A'],
  [409, 'RAMPARDOS', 'Rampardos', 295, 109, 219, ['Rock'], 'CRANIDOS', [], 'S'],
  [410, 'SHIELDON', 'Shieldon', 76, 195, 102, ['Rock', 'Steel'], 'SHIELDON', ['BASTIODON'], 'C'],
  [411, 'BASTIODON', 'Bastiodon', 94, 286, 155, ['Rock', 'Steel'], 'SHIELDON', [], 'C', { great: true }],
  [423, 'GASTRODON', 'Gastrodon', 169, 143, 244, ['Water', 'Ground'], 'SHELLOS', [], 'C', { great: true }],
  [426, 'DRIFBLIM', 'Drifblim', 180, 102, 312, ['Ghost', 'Flying'], 'DRIFLOON', [], 'C', { great: true, ultra: true }],
  [430, 'HONCHKROW', 'Honchkrow', 243, 103, 225, ['Dark', 'Flying'], 'MURKROW', [], 'A'],
  [436, 'BRONZOR', 'Bronzor', 43, 154, 149, ['Steel', 'Psychic'], 'BRONZOR', ['BRONZONG'], 'C', { little: true }],
  [443, 'GIBLE', 'Gible', 124, 84, 151, ['Dragon', 'Ground'], 'GIBLE', ['GARCHOMP'], 'C'],
  [445, 'GARCHOMP', 'Garchomp', 261, 193, 239, ['Dragon', 'Ground'], 'GIBLE', [], 'S', { master: true }, { canMega: true }],
  [447, 'RIOLU', 'Riolu', 127, 78, 120, ['Fighting'], 'RIOLU', ['LUCARIO'], 'C'],
  [448, 'LUCARIO', 'Lucario', 236, 144, 172, ['Fighting', 'Steel'], 'RIOLU', [], 'S', { ultra: true }, { canMega: true }],
  [452, 'DRAPION', 'Drapion', 180, 202, 172, ['Poison', 'Dark'], 'SKORUPI', [], 'C', { great: true, ultra: true }],
  [454, 'TOXICROAK', 'Toxicroak', 211, 133, 195, ['Poison', 'Fighting'], 'CROAGUNK', [], 'C', { great: true, ultra: true }],
  [460, 'ABOMASNOW', 'Abomasnow', 178, 158, 207, ['Grass', 'Ice'], 'SNOVER', [], 'B', { great: true, ultra: true }, { canMega: true }],
  [461, 'WEAVILE', 'Weavile', 243, 171, 172, ['Dark', 'Ice'], 'SNEASEL', [], 'A'],
  [462, 'MAGNEZONE', 'Magnezone', 238, 205, 172, ['Electric', 'Steel'], 'MAGNEMITE', [], 'A', { ultra: true }],
  [463, 'LICKILICKY', 'Lickilicky', 161, 181, 242, ['Normal'], 'LICKITUNG', [], 'C', { ultra: true }],
  [464, 'RHYPERIOR', 'Rhyperior', 241, 190, 251, ['Ground', 'Rock'], 'RHYHORN', [], 'S', { master: true }],
  [465, 'TANGROWTH', 'Tangrowth', 207, 184, 225, ['Grass'], 'TANGELA', [], 'A'],
  [466, 'ELECTIVIRE', 'Electivire', 249, 163, 181, ['Electric'], 'ELEKID', [], 'A'],
  [468, 'TOGEKISS', 'Togekiss', 225, 217, 198, ['Fairy', 'Flying'], 'TOGEPI', [], 'A', { ultra: true, master: true }],
  [471, 'GLACEON', 'Glaceon', 238, 205, 163, ['Ice'], 'EEVEE', [], 'A'],
  [472, 'GLISCOR', 'Gliscor', 185, 222, 181, ['Ground', 'Flying'], 'GLIGAR', [], 'C', { great: true, ultra: true }],
  [473, 'MAMOSWINE', 'Mamoswine', 247, 146, 242, ['Ice', 'Ground'], 'SWINUB', [], 'S', { master: true }],
  [475, 'GALLADE', 'Gallade', 237, 195, 169, ['Psychic', 'Fighting'], 'RALTS', [], 'A', { great: true, ultra: true }, { canMega: true }],
  [478, 'FROSLASS', 'Froslass', 171, 150, 172, ['Ice', 'Ghost'], 'SNORUNT', [], 'C', { great: true }],
  [483, 'DIALGA', 'Dialga', 275, 211, 205, ['Steel', 'Dragon'], 'DIALGA', [], 'S', { master: true }, { isLegendary: true }],
  [483, 'DIALGA_ORIGIN', 'Dialga (Origin)', 270, 225, 205, ['Steel', 'Dragon'], 'DIALGA', [], 'S', { master: true }, { form: 'ORIGIN', isLegendary: true }],
  [484, 'PALKIA', 'Palkia', 280, 215, 189, ['Water', 'Dragon'], 'PALKIA', [], 'S', { master: true }, { isLegendary: true }],
  [484, 'PALKIA_ORIGIN', 'Palkia (Origin)', 286, 223, 189, ['Water', 'Dragon'], 'PALKIA', [], 'S', { master: true }, { form: 'ORIGIN', isLegendary: true }],
  [485, 'HEATRAN', 'Heatran', 251, 213, 209, ['Fire', 'Steel'], 'HEATRAN', [], 'A', { master: true }, { isLegendary: true }],
  [487, 'GIRATINA_ALTERED', 'Giratina (Altered)', 187, 225, 284, ['Ghost', 'Dragon'], 'GIRATINA', [], 'C', { ultra: true, master: true }, { form: 'ALTERED', isLegendary: true }],
  [487, 'GIRATINA_ORIGIN', 'Giratina (Origin)', 225, 187, 284, ['Ghost', 'Dragon'], 'GIRATINA', [], 'S', { master: true }, { form: 'ORIGIN', isLegendary: true }],
  [488, 'CRESSELIA', 'Cresselia', 152, 258, 260, ['Psychic'], 'CRESSELIA', [], 'C', { great: true, ultra: true }, { isLegendary: true }],
  [491, 'DARKRAI', 'Darkrai', 285, 198, 172, ['Dark'], 'DARKRAI', [], 'S', {}, { isMythical: true }],

  // Unova
  [497, 'SERPERIOR', 'Serperior', 161, 204, 181, ['Grass'], 'SNIVY', [], 'C', { great: true }],
  [503, 'SAMUROTT', 'Samurott', 212, 157, 216, ['Water'], 'OSHAWOTT', [], 'B'],
  [529, 'DRILBUR', 'Drilbur', 154, 85, 155, ['Ground'], 'DRILBUR', ['EXCADRILL'], 'C'],
  [530, 'EXCADRILL', 'Excadrill', 255, 129, 242, ['Ground', 'Steel'], 'DRILBUR', [], 'S', { master: true }],
  [532, 'TIMBURR', 'Timburr', 134, 87, 181, ['Fighting'], 'TIMBURR', ['CONKELDURR'], 'C'],
  [534, 'CONKELDURR', 'Conkeldurr', 243, 158, 233, ['Fighting'], 'TIMBURR', [], 'S', { master: true }],
  [554, 'DARUMAKA', 'Darumaka', 153, 86, 172, ['Fire'], 'DARUMAKA', ['DARMANITAN'], 'C'],
  [555, 'DARMANITAN', 'Darmanitan', 263, 114, 233, ['Fire'], 'DARUMAKA', [], 'A'],
  [555, 'DARMANITAN_GALARIAN', 'Galarian Darmanitan', 263, 114, 233, ['Ice'], 'DARUMAKA', [], 'S', {}, { form: 'GALARIAN' }],
  [559, 'SCRAGGY', 'Scraggy', 132, 132, 137, ['Dark', 'Fighting'], 'SCRAGGY', ['SCRAFTY'], 'C'],
  [560, 'SCRAFTY', 'Scrafty', 163, 222, 163, ['Dark', 'Fighting'], 'SCRAGGY', [], 'C', { great: true, ultra: true }],
  [563, 'COFAGRIGUS', 'Cofagrigus', 163, 237, 151, ['Ghost'], 'YAMASK', [], 'C', { great: true, ultra: true }],
  [592, 'FRILLISH', 'Frillish', 115, 134, 146, ['Water', 'Ghost'], 'FRILLISH', ['JELLICENT'], 'C'],
  [593, 'JELLICENT', 'Jellicent', 159, 178, 225, ['Water', 'Ghost'], 'FRILLISH', [], 'C', { great: true, ultra: true }],
  [598, 'FERROTHORN', 'Ferrothorn', 158, 223, 179, ['Grass', 'Steel'], 'FERROSEED', [], 'C', { great: true, ultra: true }],
  [609, 'CHANDELURE', 'Chandelure', 271, 182, 155, ['Ghost', 'Fire'], 'LITWICK', [], 'S'],
  [612, 'HAXORUS', 'Haxorus', 284, 172, 183, ['Dragon'], 'AXEW', [], 'A', { master: true }],
  [618, 'STUNFISK_GALARIAN', 'Galarian Stunfisk', 144, 171, 240, ['Ground', 'Steel'], 'STUNFISK', [], 'C', { great: true, ultra: true }, { form: 'GALARIAN' }],
  [625, 'BISHARP', 'Bisharp', 232, 176, 163, ['Dark', 'Steel'], 'PAWNIARD', ['KINGAMBIT'], 'B'],
  [630, 'MANDIBUZZ', 'Mandibuzz', 129, 205, 242, ['Dark', 'Flying'], 'VULLABY', [], 'C', { great: true, ultra: true }],
  [635, 'HYDREIGON', 'Hydreigon', 256, 188, 211, ['Dark', 'Dragon'], 'DEINO', [], 'S'],
  [638, 'COBALION', 'Cobalion', 192, 229, 209, ['Steel', 'Fighting'], 'COBALION', [], 'C', { ultra: true }, { isLegendary: true }],
  [639, 'TERRAKION', 'Terrakion', 260, 192, 209, ['Rock', 'Fighting'], 'TERRAKION', [], 'S', {}, { isLegendary: true }],
  [640, 'VIRIZION', 'Virizion', 192, 229, 209, ['Grass', 'Fighting'], 'VIRIZION', [], 'C', { ultra: true }, { isLegendary: true }],
  [641, 'TORNADUS_THERIAN', 'Tornadus (Therian)', 238, 189, 188, ['Flying'], 'TORNADUS', [], 'B', {}, { form: 'THERIAN', isLegendary: true }],
  [642, 'THUNDURUS_THERIAN', 'Thundurus (Therian)', 295, 161, 188, ['Electric', 'Flying'], 'THUNDURUS', [], 'S', {}, { form: 'THERIAN', isLegendary: true }],
  [643, 'RESHIRAM', 'Reshiram', 275, 211, 205, ['Dragon', 'Fire'], 'RESHIRAM', [], 'S', { master: true }, { isLegendary: true }],
  [644, 'ZEKROM', 'Zekrom', 275, 211, 205, ['Dragon', 'Electric'], 'ZEKROM', [], 'S', { master: true }, { isLegendary: true }],
  [645, 'LANDORUS_THERIAN', 'Landorus (Therian)', 289, 179, 205, ['Ground', 'Flying'], 'LANDORUS', [], 'S', { master: true }, { form: 'THERIAN', isLegendary: true }],
  [646, 'KYUREM', 'Kyurem', 246, 170, 245, ['Dragon', 'Ice'], 'KYUREM', [], 'A', { master: true }, { isLegendary: true }],

  // Kalos
  [652, 'CHESNAUGHT', 'Chesnaught', 201, 204, 204, ['Grass', 'Fighting'], 'CHESPIN', [], 'B', { great: true, ultra: true }],
  [655, 'DELPHOX', 'Delphox', 230, 189, 181, ['Fire', 'Psychic'], 'FENNEKIN', [], 'B'],
  [658, 'GRENINJA', 'Greninja', 223, 152, 176, ['Water', 'Dark'], 'FROAKIE', [], 'A', { great: true, ultra: true }],
  [660, 'DIGGERSBY', 'Diggersby', 112, 155, 198, ['Normal', 'Ground'], 'BUNNELBY', [], 'C', { great: true }],
  [663, 'TALONFLAME', 'Talonflame', 176, 155, 186, ['Fire', 'Flying'], 'FLETCHLING', [], 'C', { great: true, ultra: true }],
  [681, 'AEGISLASH', 'Aegislash', 97, 291, 155, ['Steel', 'Ghost'], 'HONEDGE', [], 'C', { great: true }],
  [687, 'MALAMAR', 'Malamar', 177, 165, 200, ['Dark', 'Psychic'], 'INKAY', [], 'C', { great: true, ultra: true }],
  [700, 'SYLVEON', 'Sylveon', 203, 205, 216, ['Fairy'], 'EEVEE', [], 'B', { ultra: true, master: true }],
  [703, 'CARBINK', 'Carbink', 95, 285, 137, ['Rock', 'Fairy'], 'CARBINK', [], 'C', { great: true }],
  [709, 'TREVENANT', 'Trevenant', 201, 154, 198, ['Ghost', 'Grass'], 'PHANTUMP', [], 'C', { great: true, ultra: true }],
  [716, 'XERNEAS', 'Xerneas', 250, 185, 246, ['Fairy'], 'XERNEAS', [], 'A', { master: true }, { isLegendary: true }],
  [717, 'YVELTAL', 'Yveltal', 250, 185, 246, ['Dark', 'Flying'], 'YVELTAL', [], 'A', { master: true }, { isLegendary: true }],
  [718, 'ZYGARDE_COMPLETE', 'Zygarde (Complete)', 184, 207, 389, ['Dragon', 'Ground'], 'ZYGARDE', [], 'B', { ultra: true, master: true }, { form: 'COMPLETE', isLegendary: true }],

  // Alola
  [724, 'DECIDUEYE', 'Decidueye', 210, 179, 186, ['Grass', 'Ghost'], 'ROWLET', [], 'B'],
  [727, 'INCINEROAR', 'Incineroar', 214, 175, 216, ['Fire', 'Dark'], 'LITTEN', [], 'B'],
  [730, 'PRIMARINA', 'Primarina', 232, 195, 190, ['Water', 'Fairy'], 'POPPLIO', [], 'A', { master: true }],
  [738, 'VIKAVOLT', 'Vikavolt', 254, 158, 184, ['Bug', 'Electric'], 'GRUBBIN', [], 'A'],
  [748, 'TOXAPEX', 'Toxapex', 114, 273, 137, ['Poison', 'Water'], 'MAREANIE', [], 'C', { great: true }],
  [785, 'TAPU_KOKO', 'Tapu Koko', 250, 181, 172, ['Electric', 'Fairy'], 'TAPU_KOKO', [], 'A', {}, { isLegendary: true }],
  [786, 'TAPU_LELE', 'Tapu Lele', 259, 208, 172, ['Psychic', 'Fairy'], 'TAPU_LELE', [], 'S', { master: true }, { isLegendary: true }],
  [788, 'TAPU_FINI', 'Tapu Fini', 189, 254, 172, ['Water', 'Fairy'], 'TAPU_FINI', [], 'C', { great: true, ultra: true }, { isLegendary: true }],
  [791, 'SOLGALEO', 'Solgaleo', 255, 191, 263, ['Psychic', 'Steel'], 'COSMOG', [], 'A', { master: true }, { isLegendary: true }],
  [792, 'LUNALA', 'Lunala', 255, 191, 263, ['Psychic', 'Ghost'], 'COSMOG', [], 'A', { master: true }, { isLegendary: true }],
  [793, 'NIHILEGO', 'Nihilego', 249, 210, 240, ['Rock', 'Poison'], 'NIHILEGO', [], 'S', {}, { isUltraBeast: true }],
  [796, 'XURKITREE', 'Xurkitree', 330, 144, 195, ['Electric'], 'XURKITREE', [], 'S', {}, { isUltraBeast: true }],
  [798, 'KARTANA', 'Kartana', 323, 182, 139, ['Grass', 'Steel'], 'KARTANA', [], 'S', {}, { isUltraBeast: true }],
  [800, 'NECROZMA_DUSK_MANE', 'Dusk Mane Necrozma', 277, 220, 200, ['Psychic', 'Steel'], 'NECROZMA', [], 'S', { master: true }, { form: 'DUSK_MANE', isLegendary: true }],
  [800, 'NECROZMA_DAWN_WINGS', 'Dawn Wings Necrozma', 277, 220, 200, ['Psychic', 'Ghost'], 'NECROZMA', [], 'S', { master: true }, { form: 'DAWN_WINGS', isLegendary: true }],
  [809, 'MELMETAL', 'Melmetal', 226, 190, 264, ['Steel'], 'MELTAN', [], 'B', { master: true }, { isMythical: true }],

  // Galar / Hisui / Paldea
  [820, 'GREEDENT', 'Greedent', 160, 156, 260, ['Normal'], 'SKWOVET', [], 'C', { great: true, ultra: true }],
  [862, 'OBSTAGOON', 'Obstagoon', 180, 194, 212, ['Dark', 'Normal'], 'ZIGZAGOON', [], 'C', { great: true, ultra: true }],
  [863, 'PERRSERKER', 'Perrserker', 195, 162, 172, ['Steel'], 'MEOWTH', [], 'C', { great: true, ultra: true }],
  [865, 'SIRFETCHD', 'Sirfetch’d', 248, 176, 158, ['Fighting'], 'FARFETCHD', [], 'A', { great: true, ultra: true }],
  [888, 'ZACIAN', 'Zacian', 254, 236, 192, ['Fairy'], 'ZACIAN', [], 'A', { master: true }, { isLegendary: true }],
  [890, 'ETERNATUS', 'Eternatus', 278, 192, 268, ['Poison', 'Dragon'], 'ETERNATUS', [], 'S', { master: true }, { isLegendary: true }],
  [901, 'URSALUNA', 'Ursaluna', 243, 181, 277, ['Ground', 'Normal'], 'TEDDIURSA', [], 'A', { master: true }],
  [979, 'ANNIHILAPE', 'Annihilape', 220, 178, 242, ['Fighting', 'Ghost'], 'MANKEY', [], 'A', { great: true, ultra: true, master: true }],
  [980, 'CLODSIRE', 'Clodsire', 123, 155, 277, ['Poison', 'Ground'], 'WOOPER', [], 'C', { great: true }],
  [983, 'KINGAMBIT', 'Kingambit', 238, 203, 225, ['Dark', 'Steel'], 'PAWNIARD', [], 'A', { master: true }],
  [998, 'BAXCALIBUR', 'Baxcalibur', 254, 168, 251, ['Dragon', 'Ice'], 'FRIGIBAX', [], 'S', { master: true }],
  [1000, 'GHOLDENGO', 'Gholdengo', 252, 190, 202, ['Steel', 'Ghost'], 'GIMMIGHOUL', [], 'A', { master: true }],
];

export const SPECIES_BY_KEY = new Map<string, SpeciesEntry>();
export const SPECIES_BY_DEX = new Map<number, SpeciesEntry[]>();

for (const row of RAW_SPECIES) {
  const [
    dex,
    key,
    name,
    baseAtk,
    baseDef,
    baseSta,
    types,
    family,
    evolutions,
    raidTier,
    pvpRelevance = {},
    flags = {},
  ] = row;

  const entry: SpeciesEntry = {
    key,
    dex,
    name,
    form: flags.form,
    baseAtk,
    baseDef,
    baseSta,
    types,
    family,
    evolutions,
    raidTier,
    pvpRelevance,
    isLegendary: flags.isLegendary,
    isMythical: flags.isMythical,
    isUltraBeast: flags.isUltraBeast,
    isRegional: flags.isRegional,
    canMega: flags.canMega,
  };

  SPECIES_BY_KEY.set(key, entry);
  const existing = SPECIES_BY_DEX.get(dex) ?? [];
  existing.push(entry);
  SPECIES_BY_DEX.set(dex, existing);
}

function normalizeToken(input: string | number | undefined): string {
  if (input === undefined || input === null) return '';
  return String(input)
    .trim()
    .toUpperCase()
    .replace(/['’]/g, '')
    .replace(/♀/g, '_FEMALE')
    .replace(/♂/g, '_MALE')
    .replace(/[\s\-]+/g, '_');
}

export function resolveSpecies(
  pokemonId: string | number | undefined,
  nameHint?: string,
  formHint?: string
): { entry: SpeciesEntry; statsKnown: boolean } {
  const idToken = normalizeToken(pokemonId);
  const nameToken = normalizeToken(nameHint);
  const formToken = normalizeToken(formHint);

  // Clean common suffix forms like ALOLAN -> ALOLA
  const cleanForm = formToken
    .replace(/^.*_ALOLA$/, 'ALOLA')
    .replace(/^.*_ALOLAN$/, 'ALOLA')
    .replace(/^ALOLAN$/, 'ALOLA')
    .replace(/^.*_GALARIAN$/, 'GALARIAN')
    .replace(/^.*_GALAR$/, 'GALARIAN')
    .replace(/^GALARIAN$/, 'GALARIAN')
    .replace(/^.*_HISUIAN$/, 'HISUIAN')
    .replace(/^.*_ORIGIN$/, 'ORIGIN')
    .replace(/^.*_THERIAN$/, 'THERIAN');

  const candidates: string[] = [];
  if (idToken && cleanForm && !['NORMAL', 'SHADOW', 'PURIFIED', 'FALL_2019', 'COPY_2019'].includes(cleanForm)) {
    candidates.push(`${idToken}_${cleanForm}`);
  }
  if (nameToken && cleanForm && !['NORMAL', 'SHADOW', 'PURIFIED'].includes(cleanForm)) {
    candidates.push(`${nameToken}_${cleanForm}`);
  }
  if (idToken) candidates.push(idToken);
  if (nameToken) candidates.push(nameToken);

  for (const key of candidates) {
    const direct = SPECIES_BY_KEY.get(key);
    if (direct) return { entry: direct, statsKnown: true };
  }

  // Try numeric dex lookup
  const numericDex =
    typeof pokemonId === 'number'
      ? pokemonId
      : /^\d+$/.test(idToken)
      ? parseInt(idToken, 10)
      : NaN;

  if (!Number.isNaN(numericDex)) {
    const list = SPECIES_BY_DEX.get(numericDex);
    if (list && list.length > 0) {
      if (cleanForm) {
        const matchedForm = list.find((item) => item.form === cleanForm);
        if (matchedForm) return { entry: matchedForm, statsKnown: true };
      }
      return { entry: list[0], statsKnown: true };
    }
  }

  // Name match fallback
  if (nameToken) {
    for (const entry of SPECIES_BY_KEY.values()) {
      if (normalizeToken(entry.name) === nameToken) {
        return { entry, statsKnown: true };
      }
    }
  }

  // Graceful fallback for uncatalogued dex entries so PGSStats.json never fails to parse
  const fallbackDex = !Number.isNaN(numericDex) ? numericDex : 0;
  const displayName =
    nameHint && nameHint.trim().length > 0
      ? nameHint.trim()
      : idToken
      ? idToken
          .toLowerCase()
          .split('_')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')
      : `Pokemon #${fallbackDex}`;

  return {
    statsKnown: false,
    entry: {
      key: idToken || `DEX_${fallbackDex}`,
      dex: fallbackDex,
      name: displayName,
      form: cleanForm && cleanForm !== 'NORMAL' ? cleanForm : undefined,
      baseAtk: 165,
      baseDef: 150,
      baseSta: 165,
      types: ['Normal'],
      family: idToken || `DEX_${fallbackDex}`,
      evolutions: [],
      raidTier: 'C',
      pvpRelevance: {},
    },
  };
}
