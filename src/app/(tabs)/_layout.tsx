// Takt — tab layout. Black pill bottom nav (Today / Calendar / Stats);
// the active tab is a filled paper pill inside it.
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radii } from '../../theme/tokens';

const TAB_LABELS: Record<string, string> = {
  index: 'Today',
  calendar: 'Calendar',
  stats: 'Stats',
};

// Structural type for the tab bar props (avoids a direct dependency on
// @react-navigation/bottom-tabs, which expo-router nests internally).
interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigateToTab: (routeKey: string) => void;
}

function TabBar({ state, navigateToTab }: TabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.barWrap, { bottom: insets.bottom + 12 }]}>
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const isActive = state.index === index;
          const label = TAB_LABELS[route.name] ?? route.name;
          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              onPress={() => navigateToTab(route.key)}
              style={[styles.tab, isActive && styles.tabActive]}
            >
              <Text style={[styles.label, isActive && styles.labelActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar' }} />
      <Tabs.Screen name="stats" options={{ title: 'Stats' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  barWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.carbon,
    borderRadius: radii.pill,
    padding: 6,
    gap: 4,
    shadowColor: colors.carbon,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 6,
  },
  tab: {
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: { backgroundColor: colors.paper },
  label: { fontFamily: fonts.medium, fontSize: 15, color: colors.paper, opacity: 0.75 },
  labelActive: { color: colors.carbon, opacity: 1, fontFamily: fonts.semibold },
});
