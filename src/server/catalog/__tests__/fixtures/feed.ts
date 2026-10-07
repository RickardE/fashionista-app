/** Fixture Google Shopping feed modelled on the Adtraction/Johnells format. */

export interface FixtureItem {
  id?: string;
  group?: string;
  title?: string;
  description?: string;
  productType?: string[];
  gender?: string;
  color?: string;
  size?: string;
  price?: string;
  salePrice?: string;
  availability?: string;
  brand?: string;
  gtin?: string;
  material?: string;
}

const tag = (name: string, value: string | undefined) =>
  value === undefined ? "" : `<${name}><![CDATA[${value}]]></${name}>`;

export function feedXml(items: FixtureItem[]): string {
  const body = items
    .map(
      (i) => `
    <item>
      ${tag("g:id", i.id)}
      ${tag("title", i.title)}
      ${tag("description", i.description)}
      ${(i.productType ?? []).map((p) => tag("g:product_type", p)).join("")}
      ${tag("g:google_product_category", "Apparel & Accessories > Clothing")}
      ${tag("link", i.id ? `https://www.johnells.se/p/${i.group ?? i.id}` : undefined)}
      ${tag("g:image_link", i.group ? `https://img.johnells.se/${i.group}.jpg` : undefined)}
      ${tag("g:condition", "new")}
      ${tag("g:availability", i.availability ?? "in stock")}
      ${tag("g:price", i.price ?? "1299.00 SEK")}
      ${tag("g:sale_price", i.salePrice)}
      ${tag("g:gtin", i.gtin)}
      ${tag("g:brand", i.brand ?? "Oscar Jacobson")}
      ${tag("g:item_group_id", i.group)}
      ${tag("g:gender", i.gender ?? "male")}
      ${tag("g:color", i.color)}
      ${tag("g:material", i.material)}
      ${tag("g:size", i.size)}
    </item>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>Johnells SE</title>${body}
  </channel>
</rss>`;
}

const shirt = (size: string, gtin: string): FixtureItem => ({
  id: `LIN-100-${size}`,
  group: "LIN-100",
  title: "Linneskjorta Relaxed",
  description: "<p>Avslappnad skjorta i <b>100% linne</b>.</p>",
  productType: ["Man > Kläder > Skjortor > Linneskjortor", "Kampanjer > interna kategorier > Sommar 30%"],
  color: "Svart",
  size,
  price: "1 299,00 SEK",
  salePrice: "999,00 SEK",
  gtin,
});

export const SHIRT_ROWS: FixtureItem[] = [shirt("S", "0731000000011"), shirt("M", "0731000000028"), shirt("L", "0731000000035")];

export const TROUSER_ROWS: FixtureItem[] = [
  {
    id: "TRS-200-48",
    group: "TRS-200",
    title: "Wool Trousers",
    productType: ["Kampanjer > interna kategorier > Black week"],
    color: "Black",
    size: "48",
    price: "2499.00 SEK",
  },
  {
    id: "TRS-200-50",
    group: "TRS-200",
    title: "Wool Trousers",
    productType: ["Kampanjer > interna kategorier > Black week"],
    color: "Black",
    size: "50",
    price: "2499.00 SEK",
    availability: "out of stock",
  },
];

export const KNIT_ROWS: FixtureItem[] = [
  {
    id: "KNT-300-M",
    group: "KNT-300",
    title: "Merino Rollneck",
    productType: ["Dam > Kläder > Stickat"],
    gender: "female",
    color: "Vit",
    size: "M",
    price: "1599.00 SEK",
  },
];

export const INVALID_ROWS: FixtureItem[] = [
  { group: "BROKEN", title: "No id" },
  { id: "NO-TITLE-1", group: "BROKEN" },
];

export const FULL_FEED = feedXml([...SHIRT_ROWS, ...TROUSER_ROWS, ...KNIT_ROWS, ...INVALID_ROWS]);
