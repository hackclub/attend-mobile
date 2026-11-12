import { backLabelFor, previousRoute } from '../backLabels';

describe('backLabelFor', () => {
  it('names the screen it returns to', () => {
    expect(backLabelFor({ name: 'EventHome' })).toBe('Overview');
    expect(backLabelFor({ name: 'IncidentList' })).toBe('Incidents');
    expect(backLabelFor({ name: 'PeopleHome' })).toBe('People');
  });

  it("uses the event's name for a pass", () => {
    expect(backLabelFor({ name: 'TicketDetail', params: { ticket: { event: { name: 'Campfire Sydney' } } } })).toBe(
      'Campfire Sydney'
    );
    expect(backLabelFor({ name: 'TicketDetail', params: {} })).toBe('Pass');
  });

  it('falls back to Back for an unknown or missing screen', () => {
    expect(backLabelFor({ name: 'Somewhere' })).toBe('Back');
    expect(backLabelFor(undefined)).toBe('Back');
  });
});

describe('previousRoute', () => {
  const routes = [{ name: 'EventHome' }, { name: 'IncidentList' }, { name: 'IncidentDetail' }];

  it('is the route under the focused one', () => {
    expect(previousRoute({ index: 2, routes })).toEqual({ name: 'IncidentList' });
  });

  it('is undefined at the bottom of the stack', () => {
    expect(previousRoute({ index: 0, routes })).toBeUndefined();
    expect(previousRoute(undefined)).toBeUndefined();
  });
});
