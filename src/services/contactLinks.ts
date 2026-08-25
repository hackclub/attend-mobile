export interface PhoneLinks {
  phone: string;
  whatsapp: string;
  dialpad: string;
}

export interface PhoneAction {
  label: 'Phone' | 'WhatsApp' | 'Dialpad';
  url: string;
}

export function buildPhoneLinks(value: string): PhoneLinks | null {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');

  if (!digits) return null;

  const dialable = `${trimmed.startsWith('+') ? '+' : ''}${digits}`;

  return {
    phone: `tel:${dialable}`,
    whatsapp: `https://wa.me/${digits}`,
    dialpad: `dialpad://${dialable}`,
  };
}

export function buildPhoneActions(value: string): PhoneAction[] {
  const links = buildPhoneLinks(value);

  if (!links) return [];

  return [
    { label: 'Phone', url: links.phone },
    { label: 'WhatsApp', url: links.whatsapp },
    { label: 'Dialpad', url: links.dialpad },
  ];
}
