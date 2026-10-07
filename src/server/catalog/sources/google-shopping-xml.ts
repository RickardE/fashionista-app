/**
 * Parser for Google Shopping-style XML product feeds (RSS `<item>` or Atom
 * `<entry>`, fields with or without the `g:` namespace prefix). Many affiliate
 * networks (Adtraction, Awin, ...) use this format, so it lives outside any
 * single provider's folder.
 */

import { XMLParser, XMLValidator } from "fast-xml-parser";
import { z } from "zod";
import type { Money, RawProduct, RawRowResult } from "../types";

export class FeedParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedParseError";
  }
}

const ARRAY_FIELDS = new Set(["item", "entry", "product_type", "additional_image_link"]);

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false, // keep GTINs, ids and prices as strings
  trimValues: true,
  processEntities: true,
  isArray: (name) => ARRAY_FIELDS.has(name),
});

/** Parses "1299.00 SEK", "1 299,00 SEK", "SEK 1299" into minor units. */
export function parseMoney(value: unknown, defaultCurrency?: string): Money | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const currency = value.match(/[A-Z]{3}/)?.[0] ?? defaultCurrency;
  let number = value.replace(/[A-Z]{3}/g, "").replace(/[\s ]/g, "");
  if (/,\d{1,2}$/.test(number)) number = number.replace(/\./g, "").replace(",", ".");
  else number = number.replace(/,/g, "");
  const amount = Number(number);
  if (!currency || !Number.isFinite(amount) || amount < 0) return undefined;
  return { amountMinor: Math.round(amount * 100), currency };
}

function text(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return text(value[0]);
  if (typeof value === "object") return undefined;
  const s = String(value).trim();
  return s || undefined;
}

function textList(value: unknown): string[] {
  const list = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return list.map(text).filter((s): s is string => !!s);
}

const rowSchema = z.object({
  externalId: z.string().min(1, "missing id"),
  title: z.string().min(1, "missing title"),
});

export function extractItems(xml: string): Record<string, unknown>[] {
  const valid = XMLValidator.validate(xml);
  if (valid !== true) {
    throw new FeedParseError(`Malformed XML at line ${valid.err.line}: ${valid.err.msg}`);
  }
  const doc = parser.parse(xml) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const items = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? doc?.channel?.item;
  if (!Array.isArray(items)) {
    throw new FeedParseError("No <item> or <entry> elements found — not a product feed?");
  }
  return items;
}

export function parseGoogleShoppingFeed(
  xml: string,
  options: { defaultCurrency?: string } = {},
): RawRowResult[] {
  return extractItems(xml).map((item, index): RawRowResult => {
    try {
      const candidate = {
        externalId: text(item.id) ?? "",
        title: text(item.title) ?? "",
      };
      const check = rowSchema.safeParse(candidate);
      if (!check.success) {
        return {
          ok: false,
          index,
          externalId: candidate.externalId || undefined,
          reason: check.error.issues.map((i) => i.message).join(", "),
        };
      }
      const product: RawProduct = {
        externalId: candidate.externalId,
        externalGroupId: text(item.item_group_id),
        title: candidate.title,
        description: text(item.description),
        categoryPaths: textList(item.product_type),
        taxonomyPath: text(item.google_product_category),
        brand: text(item.brand),
        gender: text(item.gender),
        ageGroup: text(item.age_group),
        color: text(item.color),
        material: text(item.material),
        pattern: text(item.pattern),
        size: text(item.size),
        price: parseMoney(text(item.price), options.defaultCurrency),
        salePrice: parseMoney(text(item.sale_price), options.defaultCurrency),
        availability: text(item.availability),
        condition: text(item.condition),
        productUrl: text(item.link),
        imageUrl: text(item.image_link),
        additionalImageUrls: textList(item.additional_image_link),
        gtin: text(item.gtin),
        mpn: text(item.mpn),
        raw: item,
      };
      return { ok: true, product };
    } catch (err) {
      return { ok: false, index, reason: `unparseable row: ${(err as Error).message}` };
    }
  });
}
