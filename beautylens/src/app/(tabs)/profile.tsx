import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const PINK = '#C2185B';

export default function ProfileScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.emoji}>⚙️</Text>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>App preferences and account options will appear here</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFBFE' },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 40,
  },
  emoji: { fontSize: 52, marginBottom: 8 },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  subtitle: {
    fontSize: 15,
    color: '#A0A0A0',
    textAlign: 'center',
    lineHeight: 22,
  },
});

