export type TraitId =
  | 'pace'
  | 'finishing'
  | 'passing_range'
  | 'first_touch'
  | 'positioning'
  | 'aerial_ability'
  | 'physicality'
  | 'decision_making'
  | 'consistency'
  | 'confidence'
  | 'work_rate'
  | 'leadership';

export const TRAITS: { id: TraitId; label: string }[] = [
  { id: 'pace', label: 'Pace' },
  { id: 'finishing', label: 'Finishing' },
  { id: 'passing_range', label: 'Passing range' },
  { id: 'first_touch', label: 'First touch' },
  { id: 'positioning', label: 'Positioning' },
  { id: 'aerial_ability', label: 'Aerial ability' },
  { id: 'physicality', label: 'Physicality' },
  { id: 'decision_making', label: 'Decision-making' },
  { id: 'consistency', label: 'Consistency' },
  { id: 'confidence', label: 'Confidence' },
  { id: 'work_rate', label: 'Work rate' },
  { id: 'leadership', label: 'Leadership' },
];
