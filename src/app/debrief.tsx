import { useLocalSearchParams } from 'expo-router';

import { DebriefScreen } from '@/features/debrief/debrief-screen';

export default function DebriefRoute() {
  const { fixtureId } = useLocalSearchParams<{ fixtureId?: string }>();
  return <DebriefScreen fixtureId={fixtureId} />;
}
