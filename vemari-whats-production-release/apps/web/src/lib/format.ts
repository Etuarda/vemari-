export function formatMetric(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value);
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return phone;
  return `+${digits.slice(0, 2)} ••••• ${digits.slice(-4)}`;
}
