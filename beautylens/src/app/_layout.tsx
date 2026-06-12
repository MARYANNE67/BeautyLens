import { Stack } from 'expo-router';

const PINK = '#C2185B';

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: PINK },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold', fontSize: 18 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: '#fff' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'BeautyLens' }} />
      <Stack.Screen name="scan" options={{ title: 'Scan Product', headerShown: false }} />
      <Stack.Screen name="tryon" options={{ title: 'Virtual Try-On' }} />
      <Stack.Screen name="camera" options={{ title: 'AR Try-On', headerShown: false }} />
    </Stack>
  );
}