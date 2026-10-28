import { scrubIdCheckBreadcrumb, scrubIdCheckEvent, setIdCheckActive } from '../sentryScrub';

afterEach(() => setIdCheckActive(false));

describe('ID check Sentry scrub', () => {
  it('passes everything through when no ID check is open', () => {
    const crumb = { category: 'console', message: 'L898902C3' };
    expect(scrubIdCheckBreadcrumb(crumb)).toBe(crumb);
    const event = { type: undefined, message: 'hello', extra: { a: 1 } };
    expect(scrubIdCheckEvent(event)).toBe(event);
  });

  it('drops console breadcrumbs while an ID check is open', () => {
    setIdCheckActive(true);
    expect(scrubIdCheckBreadcrumb({ category: 'console', message: 'L898902C3' })).toBeNull();
    expect(scrubIdCheckBreadcrumb({ category: 'touch', message: 'ERIKSSON' })).toBeNull();
    expect(scrubIdCheckBreadcrumb({ category: 'navigation' })).not.toBeNull();
  });

  it('strips messages, extras and console breadcrumbs from events', () => {
    setIdCheckActive(true);
    const scrubbed = scrubIdCheckEvent({
      type: undefined,
      message: 'MRZ P<UTOERIKSSON',
      extra: { mrz: 'P<UTOERIKSSON' },
      breadcrumbs: [{ category: 'console', message: 'P<UTO' }, { category: 'navigation' }],
    });
    expect(JSON.stringify(scrubbed)).not.toContain('ERIKSSON');
    expect(scrubbed.breadcrumbs).toEqual([{ category: 'navigation' }]);
  });
});
