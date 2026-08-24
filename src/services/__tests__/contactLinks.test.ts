import { buildPhoneActions, buildPhoneLinks } from '../contactLinks';

describe('buildPhoneLinks', () => {
  it('builds phone, WhatsApp, and Dialpad links from a formatted international number', () => {
    expect(buildPhoneLinks(' +44 20 1234-5678 ')).toEqual({
      phone: 'tel:+442012345678',
      whatsapp: 'https://wa.me/442012345678',
      dialpad: 'dialpad://+442012345678',
    });
  });

  it('preserves a domestic number for phone and Dialpad while stripping formatting', () => {
    expect(buildPhoneLinks('(415) 555-0123')).toEqual({
      phone: 'tel:4155550123',
      whatsapp: 'https://wa.me/4155550123',
      dialpad: 'dialpad://4155550123',
    });
  });

  it('returns null when the value contains no digits', () => {
    expect(buildPhoneLinks('not available')).toBeNull();
  });
});

describe('buildPhoneActions', () => {
  it('maps each native menu option to its matching destination', () => {
    expect(buildPhoneActions('+1 415 555 0123')).toEqual([
      { label: 'Phone', url: 'tel:+14155550123' },
      { label: 'WhatsApp', url: 'https://wa.me/14155550123' },
      { label: 'Dialpad', url: 'dialpad://+14155550123' },
    ]);
  });

  it('returns an empty list when the phone number is invalid', () => {
    expect(buildPhoneActions('unknown')).toEqual([]);
  });
});
