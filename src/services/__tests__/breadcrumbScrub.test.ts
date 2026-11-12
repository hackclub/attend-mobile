import { stripHttpBreadcrumbQuery, stripUrlQuery } from '../breadcrumbScrub';

describe('stripUrlQuery', () => {
  it('drops the query string and fragment', () => {
    expect(stripUrlQuery('https://a.test/api/v1/events/1/participants?q=Jane%20Doe')).toBe(
      'https://a.test/api/v1/events/1/participants'
    );
    expect(stripUrlQuery('https://a.test/x#frag')).toBe('https://a.test/x');
    expect(stripUrlQuery('https://a.test/x')).toBe('https://a.test/x');
  });
});

describe('stripHttpBreadcrumbQuery', () => {
  it('strips the query from fetch and xhr breadcrumb URLs', () => {
    for (const category of ['fetch', 'xhr', 'http']) {
      const crumb = stripHttpBreadcrumbQuery({
        category,
        data: { url: 'https://a.test/search?q=jane', method: 'GET', status_code: 200, 'http.query': 'q=jane' },
      });
      expect(crumb.data).toEqual({ url: 'https://a.test/search', method: 'GET', status_code: 200 });
    }
  });

  it('leaves other breadcrumbs alone', () => {
    const crumb = { category: 'navigation', data: { from: 'a?x=1', to: 'b' } };
    expect(stripHttpBreadcrumbQuery(crumb)).toBe(crumb);
    const noData = { category: 'fetch' };
    expect(stripHttpBreadcrumbQuery(noData)).toBe(noData);
  });
});
