import { useContext, useEffect, type RefObject } from 'react';
import {
  NavigationContext,
  NavigationRouteContext,
  type EventArg,
  type NavigationProp,
  type ParamListBase,
} from '@react-navigation/native';

/** Anything with a way to scroll back to its top: a ScrollView, FlatList, SectionList or FlashList. */
export type ScrollableToTop =
  | { scrollTo(options: { y: number; animated: boolean }): void }
  | { scrollToOffset(options: { offset: number; animated: boolean }): void }
  | { getScrollResponder(): unknown };

type TabPressEvent = EventArg<'tabPress', true, { origin?: string } | undefined>;

function scrollToTop(scrollable: ScrollableToTop | null) {
  if (!scrollable) return;
  if ('scrollTo' in scrollable) scrollable.scrollTo({ y: 0, animated: true });
  else if ('scrollToOffset' in scrollable) scrollable.scrollToOffset({ offset: 0, animated: true });
  else if ('getScrollResponder' in scrollable) {
    const responder = scrollable.getScrollResponder() as ScrollableToTop | null;
    if (responder && 'scrollTo' in responder) responder.scrollTo({ y: 0, animated: true });
  }
}

/**
 * Tapping the tab the user is already on scrolls this page back to its top,
 * as native tab bars do, when the page is the first screen of its tab. (On
 * a screen pushed further in, the tab's stack pops back to that first
 * screen instead: native-stack does that itself.)
 *
 * React Navigation's useScrollToTop does the same, but it throws outside a
 * screen, and the Screen scaffold also renders in Android's drawers, which
 * aren't routes. Here, with no screen or no tab navigator above, it does
 * nothing.
 */
export function useScrollToTopOnTabPress(ref: RefObject<ScrollableToTop | null>) {
  const navigation = useContext(NavigationContext) as NavigationProp<ParamListBase> | undefined;
  const route = useContext(NavigationRouteContext);
  const routeKey = route?.key;

  useEffect(() => {
    if (!navigation || !routeKey) return;
    const tabs: NavigationProp<ParamListBase>[] = [];
    for (let nav: NavigationProp<ParamListBase> | undefined = navigation; nav; nav = nav.getParent()) {
      if (nav.getState()?.type === 'tab') tabs.push(nav);
    }
    const unsubscribers = tabs.map((tab) =>
      // @ts-expect-error tabPress is a tab navigator's event, not in the generic map
      tab.addListener('tabPress', (e: TabPressEvent) => {
        const focused = navigation.isFocused();
        const first = tabs.includes(navigation) || navigation.getState()?.routes[0]?.key === routeKey;
        // A frame on, once every listener has had the chance to prevent it.
        requestAnimationFrame(() => {
          if (focused && first && !e.defaultPrevented && e.data?.origin !== 'native') scrollToTop(ref.current);
        });
      })
    );
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [navigation, ref, routeKey]);
}
