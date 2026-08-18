export type PositionGroupId = 'GK' | 'CB' | 'FB' | 'CDM_CM' | 'CAM' | 'W' | 'ST';

// `personLabel` is the grammatically correct noun for a player of this position
// (used when templating a sentence, e.g. the seeded first-debrief prompt) — distinct
// from `label`, which is the short chip text shown in the picker.
export const POSITION_GROUPS: { id: PositionGroupId; label: string; personLabel: string }[] = [
  { id: 'GK', label: 'Goalkeeper', personLabel: 'goalkeeper' },
  { id: 'CB', label: 'Centre-back', personLabel: 'centre-back' },
  { id: 'FB', label: 'Full-back', personLabel: 'full-back' },
  { id: 'CDM_CM', label: 'Central midfield', personLabel: 'central midfielder' },
  { id: 'CAM', label: 'Attacking mid', personLabel: 'attacking midfielder' },
  { id: 'W', label: 'Winger', personLabel: 'winger' },
  { id: 'ST', label: 'Striker', personLabel: 'striker' },
];

export type PlayerLevelId = 'sunday_league' | 'semi_pro' | 'academy' | 'pro_pathway';

export const PLAYER_LEVELS: { id: PlayerLevelId; label: string }[] = [
  { id: 'sunday_league', label: 'Sunday league' },
  { id: 'semi_pro', label: 'Semi-pro' },
  { id: 'academy', label: 'Academy' },
  { id: 'pro_pathway', label: 'Pro pathway' },
];

// Age bracket cutoffs aren't specified in CLAUDE.md — placeholder buckets, easy to adjust.
export type AgeBracketId = 'u16' | '16_18' | '19_21' | '22_25' | '25_plus';

export const AGE_BRACKETS: { id: AgeBracketId; label: string }[] = [
  { id: 'u16', label: 'Under 16' },
  { id: '16_18', label: '16–18' },
  { id: '19_21', label: '19–21' },
  { id: '22_25', label: '22–25' },
  { id: '25_plus', label: '25+' },
];

export type FootId = 'left' | 'right' | 'both';

export const FEET: { id: FootId; label: string }[] = [
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'both', label: 'Both' },
];
