// PLACEHOLDER — replace with founder-supplied copy per CLAUDE.md /docs/archetypes.md.
// `debriefClause` feeds directly into the seeded first-debrief sentence (see
// first-debrief-teaser-step.tsx) — keep it a lowercase fragment that reads naturally
// after "who".
export type Archetype = {
  id: string;
  name: string;
  description: string;
  debriefClause: string;
};

export const ARCHETYPES: Archetype[] = [
  {
    id: 'shoulder_runner',
    name: 'The Shoulder-Runner',
    description: "Lives off the last defender's shoulder, always looking to get in behind.",
    debriefClause: 'lives off the shoulder',
  },
  {
    id: 'deep_orchestrator',
    name: 'The Deep Orchestrator',
    description: 'Sees the pass before everyone else and sets the tempo from deep.',
    debriefClause: 'dictates the tempo from deep',
  },
  {
    id: 'box_presence',
    name: 'The Box Presence',
    description: 'Wins the ball in the air and dominates the six-yard box at both ends.',
    debriefClause: 'dominates his box',
  },
  {
    id: 'two_way_engine',
    name: 'The Two-Way Engine',
    description: 'Covers every blade of grass, equally happy defending and driving forward.',
    debriefClause: 'covers every blade of grass',
  },
  {
    id: 'direct_runner',
    name: 'The Direct Runner',
    description: 'Takes players on and creates something out of nothing.',
    debriefClause: 'takes people on',
  },
  {
    id: 'calm_head',
    name: 'The Calm Head',
    description: 'Rarely rattled, reads danger early, organises the players around them.',
    debriefClause: 'reads the danger before it happens',
  },
];
