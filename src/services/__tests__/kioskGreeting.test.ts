import { firstName } from '../kioskGreeting';

describe('firstName', () => {
  it('greets by the first word of the name they go by', () => {
    expect(firstName({ display_name: 'Ingo Wolf', full_name: 'Ingo Michael Wolf' })).toBe('Ingo');
    expect(firstName({ display_name: '  Sam  ', full_name: 'Samuel Lee' })).toBe('Sam');
  });

  it('falls back to the full name, then to nothing', () => {
    expect(firstName({ display_name: '', full_name: 'Ada Lovelace' })).toBe('Ada');
    expect(firstName({ display_name: '', full_name: '' })).toBe('');
    expect(firstName(undefined)).toBe('');
  });
});
