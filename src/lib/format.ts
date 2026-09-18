export function formatPrice(price: number, currency: "SEK"): string {
  return `${new Intl.NumberFormat("sv-SE").format(price)} ${currency}`;
}
