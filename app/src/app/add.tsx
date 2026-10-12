import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Adding } from '../add';
import { additionIn } from '../invite';
import { Header, Screen } from '../ui';

/** Where a scanned link to a Toto lands when the app already knows another. */
export default function AddScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const addition = useMemo(() => additionIn(params), [params]);
  return (
    <Screen bare>
      <Header title="add" />
      <Adding addition={addition} onDone={() => router.replace('/')} />
    </Screen>
  );
}
