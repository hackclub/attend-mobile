import type { Breadcrumb } from '@sentry/react-native';

const HTTP_CATEGORIES = new Set(['fetch', 'xhr', 'http']);

/** `https://host/path?q=x#y` → `https://host/path`. */
export function stripUrlQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

/**
 * HTTP breadcrumbs record the full request URL, and some requests carry
 * personal data in the query string (the participant search sends the typed
 * name as `?q=`). Keep the path, drop the query and fragment.
 */
export function stripHttpBreadcrumbQuery(breadcrumb: Breadcrumb): Breadcrumb {
  if (!breadcrumb.category || !HTTP_CATEGORIES.has(breadcrumb.category)) return breadcrumb;
  const data = breadcrumb.data;
  if (!data) return breadcrumb;
  const { ['http.query']: _query, ['http.fragment']: _fragment, ...rest } = data;
  return {
    ...breadcrumb,
    data: {
      ...rest,
      ...(typeof data.url === 'string' ? { url: stripUrlQuery(data.url) } : {}),
    },
  };
}
