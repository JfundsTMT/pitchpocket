import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CareerTheme } from '@/constants/career-theme';

type AudioWaveformProps = {
  // dB level from expo-audio's recorder state (isMeteringEnabled required on
  // the recorder config) — roughly -50 (near silence) to 0 (loudest). This
  // drives real bar heights, not a decorative animation loop.
  metering: number | undefined;
  active: boolean;
};

const BAR_COUNT = 28;
const MIN_DB = -50;
const MAX_DB = 0;
const MIN_BAR_HEIGHT = 4;
const MAX_BAR_HEIGHT = 36;

export function AudioWaveform({ metering, active }: AudioWaveformProps) {
  const [levels, setLevels] = useState<number[]>(() => Array(BAR_COUNT).fill(0));

  useEffect(() => {
    if (!active) {
      setLevels(Array(BAR_COUNT).fill(0));
      return;
    }
    const db = metering ?? MIN_DB;
    const normalized = Math.max(0, Math.min(1, (db - MIN_DB) / (MAX_DB - MIN_DB)));
    setLevels((current) => [...current.slice(1), normalized]);
  }, [metering, active]);

  return (
    <View style={styles.row}>
      {levels.map((level, i) => (
        <View
          key={i}
          style={[styles.bar, { height: MIN_BAR_HEIGHT + level * (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT) }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    height: MAX_BAR_HEIGHT,
  },
  bar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: CareerTheme.accent,
  },
});
