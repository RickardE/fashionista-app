export function formatPrice(price: number, currency: string): string {
  return `${new Intl.NumberFormat("sv-SE").format(price)} ${currency}`;
}
