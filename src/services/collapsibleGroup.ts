/**
 * How a collapsible group (the switcher's and tickets' Past, Incidents'
 * Closed) shows: its rows while it's open, or while a search shows every
 * match; its toggle only when there's no search overriding it.
 */
export function collapsibleGroup(open: boolean, searching = false): { expanded: boolean; toggleable: boolean } {
  return { expanded: open || searching, toggleable: !searching };
}
