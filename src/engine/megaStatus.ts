/**
 * Mega Evolution status of an individual Pokémon for one specific Mega form.
 *
 * A Pokémon is NOT an unlocked Mega just because its species has a Mega form. The only trustworthy evidence is the list of
 * Mega forms that this exact specimen has evolved into (`megaEvolvedForms` in the export). Unlocking Mega Charizard X says
 * nothing about Mega Charizard Y.
 */
import type { Dex } from './pveModel';
import type { MonModel } from './types';

export type MegaStatus =
  | 'NO_SPECIMEN' //        no Pokémon of this Mega's family is owned
  | 'BASE_OWNED' //         owns the base Pokémon, but it is not a suitable specimen to invest in
  | 'NEEDS_EVOLVE' //       a pre-evolution: it has to be evolved before it can Mega Evolve
  | 'NEEDS_FIRST_MEGA' //   the right base Pokémon, never Mega Evolved into this form
  | 'FORM_UNCONFIRMED' //   it has Mega Evolved, but the export does not say which form
  | 'UNLOCKED' //           has Mega Evolved into this form before
  | 'ACTIVE'; //            unlocked and currently Mega Evolved

export const MEGA_STATUS_LABEL: Record<MegaStatus, string> = {
  NO_SPECIMEN: 'No suitable Pokémon owned',
  BASE_OWNED: 'Base Pokémon owned (not a suitable specimen)',
  NEEDS_EVOLVE: 'Needs evolving first',
  NEEDS_FIRST_MEGA: 'Needs its first Mega Evolution',
  FORM_UNCONFIRMED: 'Mega Evolved, but the export does not say which form',
  UNLOCKED: 'Mega unlocked',
  ACTIVE: 'Mega active now',
};

/** Only these may fill an actual Mega slot. */
export const SLOT_STATUSES: ReadonlySet<MegaStatus> = new Set<MegaStatus>(['UNLOCKED', 'ACTIVE']);

/** How close a non-unlocked status is to being a Mega (lower number = closer), for investment ordering. */
export const MEGA_INVEST_ORDER: Record<MegaStatus, number> = {
  ACTIVE: 0,
  UNLOCKED: 0,
  NEEDS_FIRST_MEGA: 1,
  FORM_UNCONFIRMED: 2,
  NEEDS_EVOLVE: 3,
  BASE_OWNED: 4,
  NO_SPECIMEN: 5,
};

/**
 * Temporary-evolution ids used by the game. 1 = Mega, 2 = Mega X, 3 = Mega Y were checked against a real export
 * (a Charizard that evolved into both reports [3, 2]). Any other id is treated as "an unidentified form".
 */
const TEMP_EVO_SUFFIX: Record<number, string> = { 1: 'mega', 2: 'mega_x', 3: 'mega_y' };

export function tempEvoSuffix(id: number): string | null {
  return TEMP_EVO_SUFFIX[Number(id)] ?? null;
}

/** 'charizard_mega_x' -> 'charizard', 'groudon_primal' -> 'groudon' */
export function megaBaseSid(megaSid: string): string {
  return megaSid.replace(/_mega(_[xyz])?$|_primal$/i, '');
}

/** 'charizard_mega_x' -> 'mega_x', 'rayquaza_mega' -> 'mega', 'groudon_primal' -> 'primal' */
export function megaFormSuffix(megaSid: string): string {
  const m = /_(mega(?:_[xyz])?|primal)$/i.exec(megaSid);
  return m ? m[1].toLowerCase() : '';
}

/** Pokémon you are not keeping cannot count as owned Mega material. */
export function isDisposedVerdict(verdict: string): boolean {
  return verdict === 'TRANSFER' || verdict === 'TRADE' || verdict === 'REVIEW';
}

export interface MegaAssessment {
  status: MegaStatus;
  /** True only when this specimen may occupy an actual Mega slot. */
  slotEligible: boolean;
  /** Plain-language reason, shown to the player. */
  evidence: string;
  /** The Mega Energy required is never in the export, so it is always UNKNOWN. */
  energy: 'UNKNOWN';
  /** Marked TRANSFER / TRADE / REVIEW, so it is not valid retained Mega ownership. */
  blockedByVerdict: boolean;
}

export interface MegaAssessOptions {
  /** A base Pokémon below these thresholds is only BASE_OWNED, not a candidate worth investing in. */
  minIvPct?: number;
  minAtkIv?: number;
  /**
   * Ignore the Pokémon's verdict. Use ONLY while verdicts are still being decided (placement). Once verdicts are final
   * (team building, reports) leave this off so TRANSFER / TRADE / REVIEW Pokémon do not count as retained Mega ownership.
   */
  ignoreVerdict?: boolean;
}

export function assessMegaForm(m: MonModel, megaSid: string, dex: Dex, opts: MegaAssessOptions = {}): MegaAssessment {
  const blockedByVerdict = !opts.ignoreVerdict && isDisposedVerdict(m.verdict);
  const make = (status: MegaStatus, evidence: string): MegaAssessment => ({
    status,
    slotEligible: SLOT_STATUSES.has(status) && !blockedByVerdict && !m.is_shadow,
    evidence,
    energy: 'UNKNOWN',
    blockedByVerdict,
  });

  const spId = m.species?.speciesId ?? '';
  const base = megaBaseSid(megaSid);
  const suffix = megaFormSuffix(megaSid);
  if (!spId) return make('NO_SPECIMEN', 'Species could not be identified');

  const suitable = m.iv_pct >= (opts.minIvPct ?? 0) && m.a >= (opts.minAtkIv ?? 0);

  // Not the Mega's base Pokémon: either a pre-evolution of it, or unrelated.
  if (spId !== base) {
    if (!dex.familyMegaInfo(spId).includes(megaSid)) return make('NO_SPECIMEN', "Not part of this Mega's family");
    return suitable
      ? make('NEEDS_EVOLVE', 'Evolve it first; only the final form can Mega Evolve')
      : make('BASE_OWNED', 'A Pokémon of this family is owned, but its IVs are too low to be worth a Mega investment');
  }

  const ids = (m.mega_forms || []).map(Number);
  const identified = ids.map(tempEvoSuffix).filter((x): x is string => Boolean(x));
  const hasUnidentified = ids.some((id) => !tempEvoSuffix(id));

  if (identified.includes(suffix)) {
    const curId = Number(
      ((m.raw as Record<string, unknown>).pokemonDisplay as Record<string, unknown> | undefined)?.currentTempEvolution || 0,
    );
    const curSuffix = curId ? tempEvoSuffix(curId) : null;
    if (m.is_currently_mega && (!curSuffix || curSuffix === suffix)) return make('ACTIVE', 'Mega Evolved into this form right now');
    return make('UNLOCKED', 'This Pokémon has Mega Evolved into this form before');
  }
  if (identified.length > 0 && !hasUnidentified) {
    return make('NEEDS_FIRST_MEGA', 'It has only Mega Evolved into other forms; this form is not unlocked');
  }

  // Evidence that it Mega Evolved, but not which form (no form list, or ids we do not recognise).
  if (m.has_mega_unlocked || hasUnidentified) {
    const forms = dex.megaBases.get(base) || [];
    if (forms.length <= 1) return make('UNLOCKED', 'It has Mega Evolved, and this is the only Mega form');
    return make('FORM_UNCONFIRMED', 'It has Mega Evolved, but the export does not say which form');
  }

  if (!suitable) return make('BASE_OWNED', 'The base Pokémon is owned, but its IVs are too low to be worth a Mega investment');
  return make('NEEDS_FIRST_MEGA', 'Never Mega Evolved: needs its first Mega Evolution');
}
