// Takt — layout contract (Fix 3). One source of truth for bottom space.
//
// The navbar is an absolute overlay and the dock floats above it, so content
// cannot just "leave room" with a magic number: the real navbar height (measured
// with onLayout), the real dock height (collapsed or expanded, reported by the
// Dock), the safe-area bottom, and a fixed 16dp gap are combined here and
// exposed through useBottomInset(). Screens must use <Screen> / <ScrollScreen>
// / <ListScreen> — never a raw ScrollView / FlatList with a hand-written
// paddingBottom — so the last item is always scrollable fully above the
// navbar and dock. Floating elements (dock, toasts, undo bars) position
// themselves from the same context, never with hard-coded bottom values.
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { FlatList, ScrollView, StyleSheet, View, type FlatListProps, type ScrollViewProps, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/tokens';

/** Fixed breathing room between the navbar, the dock, and the content. */
export const LAYOUT_GAP = 16;

interface LayoutContextValue {
  /** Height of the black pill navbar itself (0 when the tabs are not mounted). */
  navbarHeight: number;
  setNavbarHeight: (h: number) => void;
  /** Height of the dock as currently rendered (0 when no dock is mounted). */
  dockHeight: number;
  setDockHeight: (h: number) => void;
  /** True while the dock is expanded into its grid. */
  dockExpanded: boolean;
  setDockExpanded: (expanded: boolean) => void;
  /** Full space the bottom chrome occupies from the screen bottom, incl. safe area + gaps. */
  bottomInset: number;
  /** Space from the screen bottom to the dock's bottom edge (navbar + gap). */
  dockBottom: number;
  /** Safe-area bottom inset (0 on most Android devices with gesture nav off). */
  safeBottom: number;
}

const LayoutContext = createContext<LayoutContextValue | null>(null);

export function LayoutProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [navbarHeight, setNavbarHeight] = useState(0);
  const [dockHeight, setDockHeight] = useState(0);
  const [dockExpanded, setDockExpanded] = useState(false);

  const value = useMemo<LayoutContextValue>(() => {
    // The navbar floats `insets.bottom + 12` above the screen bottom.
    const navbarTotal = navbarHeight > 0 ? navbarHeight + insets.bottom + 12 : 0;
    const dockBottom = navbarTotal + LAYOUT_GAP;
    const bottomInset =
      dockHeight > 0
        ? dockBottom + dockHeight + LAYOUT_GAP
        : navbarTotal > 0
          ? navbarTotal + LAYOUT_GAP
          : insets.bottom + LAYOUT_GAP;
    return {
      navbarHeight,
      setNavbarHeight,
      dockHeight,
      setDockHeight,
      dockExpanded,
      setDockExpanded,
      bottomInset,
      dockBottom,
      safeBottom: insets.bottom,
    };
  }, [navbarHeight, dockHeight, dockExpanded, insets.bottom]);

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}

function useLayout(): LayoutContextValue {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error('useBottomInset must be used inside <LayoutProvider>');
  return ctx;
}

/** Bottom space (dp) content must clear: navbar + dock + safe area + gaps. */
export function useBottomInset(): number {
  return useLayout().bottomInset;
}

/** Bottom edge (dp from screen bottom) the dock sits at: navbar + gap. */
export function useDockBottom(): number {
  return useLayout().dockBottom;
}

/** Report the navbar's measured height; call with 0 when it unmounts. */
export function useNavbarHeightReporter(): (h: number) => void {
  return useLayout().setNavbarHeight;
}

/** Report the dock's measured height; call with 0 when it unmounts. */
export function useDockHeightReporter(): (h: number) => void {
  return useLayout().setDockHeight;
}

export function useDockExpandedState(): [boolean, (expanded: boolean) => void] {
  const { dockExpanded, setDockExpanded } = useLayout();
  return [dockExpanded, setDockExpanded];
}

export interface ScreenProps extends ViewProps {
  /** 'tabs' (default): inset clears navbar + dock. 'none': only safe area + gap (pushed screens like Settings). */
  chrome?: 'tabs' | 'none';
}

/**
 * Mandatory wrapper for every non-scrolling screen. Applies the layout
 * contract's bottom inset as padding so content never hides under the
 * navbar or dock.
 */
export function Screen({ chrome = 'tabs', style, children, ...rest }: ScreenProps) {
  const { bottomInset, safeBottom } = useLayout();
  const pad = chrome === 'tabs' ? bottomInset : safeBottom + LAYOUT_GAP;
  return (
    <View style={[styles.screen, { paddingBottom: pad }, style]} {...rest}>
      {children}
    </View>
  );
}

export interface ScrollScreenProps extends ScrollViewProps {
  chrome?: 'tabs' | 'none';
}

/** Mandatory wrapper for every scrolling screen. */
export function ScrollScreen({ chrome = 'tabs', contentContainerStyle, style, children, ...rest }: ScrollScreenProps) {
  const { bottomInset, safeBottom } = useLayout();
  const pad = chrome === 'tabs' ? bottomInset : safeBottom + LAYOUT_GAP;
  return (
    <ScrollView
      style={[styles.screen, style]}
      contentContainerStyle={[{ paddingBottom: pad }, contentContainerStyle]}
      {...rest}
    >
      {children}
    </ScrollView>
  );
}

export interface ListScreenProps<ItemT> extends FlatListProps<ItemT> {
  chrome?: 'tabs' | 'none';
}

/** Mandatory wrapper for every list screen. */
export function ListScreen<ItemT>({ chrome = 'tabs', contentContainerStyle, style, ...rest }: ListScreenProps<ItemT>) {
  const { bottomInset, safeBottom } = useLayout();
  const pad = chrome === 'tabs' ? bottomInset : safeBottom + LAYOUT_GAP;
  return (
    <FlatList
      style={[styles.screen, style]}
      contentContainerStyle={[{ paddingBottom: pad }, contentContainerStyle]}
      {...(rest as FlatListProps<ItemT>)}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cloud },
});
