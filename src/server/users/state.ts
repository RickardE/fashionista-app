/**
 * A user's style data: load it, and apply sync batches from the app (see
 * src/lib/store/state-sync.ts). Every query is scoped by the user id from the
 * session; style and outfit ids from the client are only keys *within* that
 * user, so one user can never address another's rows.
 */

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { SyncedState, SyncOp } from "@/lib/store/state-sync";
import { TAG_LABELS } from "@/lib/style-tags";
import type { Db } from "@/server/db/client";
import {
  productReactions,
  products,
  savedOutfits,
  seenOutfitAnchors,
  styleProfiles,
  userPreferences,
} from "@/server/db/schema";
import { SHOPPER_GENDERS } from "@/server/products/eligibility";

export const MAX_OPS = 500;
export const MAX_STYLES = 30;

export const clientKey = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const productId = z.uuid();
const score = z.number().finite().min(-1e6).max(1e6);
const tagScores = z.partialRecord(z.enum(Object.keys(TAG_LABELS) as [string, ...string[]]), score);
const count = z.number().int().min(0).max(1e7);

const styleFields = z.object({
  id: clientKey,
  name: z.string().trim().min(1).max(60),
  description: z.string().max(200),
  gender: z.enum(SHOPPER_GENDERS).optional(),
  seedAffinity: tagScores,
  affinity: tagScores,
  outfitAffinity: tagScores,
  interactions: count,
  likedOutfits: count,
  dislikedOutfits: count,
  createdAt: z.number().int().positive(),
});

const outfit = z.object({
  id: clientKey,
  anchorId: productId,
  items: z
    .object({ outerwear: productId, top: productId, bottom: productId, footwear: productId })
    .partial()
    .strict(),
  styleId: clientKey,
  createdAt: z.number().int().positive(),
});

export const syncBody = z.object({
  ops: z
    .array(
      z.discriminatedUnion("op", [
        z.object({ op: z.literal("upsertStyle"), style: styleFields, position: z.number().int().min(0).max(1000) }),
        z.object({ op: z.literal("deleteStyle"), styleId: clientKey }),
        z.object({
          op: z.literal("react"),
          styleId: clientKey,
          productId,
          reaction: z.enum(["like", "dislike"]).nullable(),
        }),
        z.object({
          op: z.literal("outfitsSeen"),
          styleId: clientKey,
          anchorIds: z.array(productId).min(1).max(MAX_OPS),
          seen: z.boolean(),
        }),
        z.object({ op: z.literal("saveOutfit"), outfit }),
        z.object({ op: z.literal("removeOutfit"), outfitId: clientKey }),
        z.object({ op: z.literal("prefs"), activeStyleId: z.union([clientKey, z.literal("")]), hasOnboarded: z.boolean() }),
      ]),
    )
    .max(MAX_OPS),
});

/** The row id of one of the user's styles; undefined if it isn't on the server (yet). */
export async function styleProfileIdFor(db: Db, userId: string, styleKey: string): Promise<string | undefined> {
  const [row] = await db
    .select({ id: styleProfiles.id })
    .from(styleProfiles)
    .where(and(eq(styleProfiles.userId, userId), eq(styleProfiles.clientKey, styleKey)));
  return row?.id;
}

/** Null when the user has never synced anything (a brand-new account). */
export async function getUserState(db: Db, userId: string): Promise<SyncedState | null> {
  const [styles, reactions, outfits, [prefs]] = await Promise.all([
    db.select().from(styleProfiles).where(eq(styleProfiles.userId, userId)).orderBy(asc(styleProfiles.position)),
    db
      .select({
        styleProfileId: productReactions.styleProfileId,
        productId: productReactions.productId,
        reaction: productReactions.reaction,
      })
      .from(productReactions)
      .where(eq(productReactions.userId, userId))
      .orderBy(asc(productReactions.updatedAt)),
    db
      .select({
        clientKey: savedOutfits.clientKey,
        styleKey: styleProfiles.clientKey,
        anchorProductId: savedOutfits.anchorProductId,
        items: savedOutfits.items,
        createdAt: savedOutfits.createdAt,
      })
      .from(savedOutfits)
      .innerJoin(styleProfiles, eq(styleProfiles.id, savedOutfits.styleProfileId))
      .where(eq(savedOutfits.userId, userId))
      .orderBy(desc(savedOutfits.createdAt)),
    db.select().from(userPreferences).where(eq(userPreferences.userId, userId)),
  ]);
  if (!styles.length && !prefs) return null;

  return {
    styles: styles.map((s) => {
      const own = reactions.filter((r) => r.styleProfileId === s.id);
      return {
        id: s.clientKey,
        name: s.name,
        description: s.description,
        gender: (SHOPPER_GENDERS as readonly string[]).includes(s.gender ?? "")
          ? (s.gender as (typeof SHOPPER_GENDERS)[number])
          : undefined,
        seedAffinity: s.seedAffinity,
        affinity: s.affinity,
        outfitAffinity: s.outfitAffinity,
        interactions: s.interactions,
        likedOutfits: s.likedOutfits,
        dislikedOutfits: s.dislikedOutfits,
        createdAt: s.createdAt.getTime(),
        liked: own.filter((r) => r.reaction === "like").map((r) => r.productId),
        disliked: own.filter((r) => r.reaction === "dislike").map((r) => r.productId),
      };
    }),
    activeStyleId: prefs?.activeStyleKey ?? null,
    hasOnboarded: prefs?.hasOnboarded ?? false,
    savedOutfits: outfits.map((o) => ({
      id: o.clientKey,
      anchorId: o.anchorProductId,
      items: o.items,
      styleId: o.styleKey,
      createdAt: o.createdAt.getTime(),
    })),
  };
}

export interface SyncResult {
  applied: number;
  /** Ops referring to unknown products or styles, or over a limit. Reported, never silently dropped. */
  skipped: { op: SyncOp["op"]; reason: string }[];
}

/** Applies a batch in order, in one transaction. */
export async function applySync(db: Db, userId: string, ops: SyncOp[]): Promise<SyncResult> {
  const referenced = new Set<string>();
  for (const op of ops) {
    if (op.op === "react") referenced.add(op.productId);
    if (op.op === "outfitsSeen" && op.seen) op.anchorIds.forEach((id) => referenced.add(id));
    if (op.op === "saveOutfit") [op.outfit.anchorId, ...Object.values(op.outfit.items)].forEach((id) => id && referenced.add(id));
  }

  return db.transaction(async (tx) => {
    const known = new Set(
      referenced.size
        ? (await tx.select({ id: products.id }).from(products).where(inArray(products.id, [...referenced]))).map((p) => p.id)
        : [],
    );
    const styleIds = new Map(
      (
        await tx
          .select({ id: styleProfiles.id, key: styleProfiles.clientKey })
          .from(styleProfiles)
          .where(eq(styleProfiles.userId, userId))
      ).map((s) => [s.key, s.id]),
    );
    const result: SyncResult = { applied: 0, skipped: [] };
    const skip = (op: SyncOp, reason: string) => result.skipped.push({ op: op.op, reason });
    const now = new Date();

    for (const op of ops) {
      switch (op.op) {
        case "upsertStyle": {
          const s = op.style;
          if (!styleIds.has(s.id) && styleIds.size >= MAX_STYLES) {
            skip(op, "too_many_styles");
            continue;
          }
          const values = {
            name: s.name,
            description: s.description,
            gender: s.gender ?? null,
            position: op.position,
            seedAffinity: s.seedAffinity,
            affinity: s.affinity,
            outfitAffinity: s.outfitAffinity,
            interactions: s.interactions,
            likedOutfits: s.likedOutfits,
            dislikedOutfits: s.dislikedOutfits,
            updatedAt: now,
          } as const;
          const [row] = await tx
            .insert(styleProfiles)
            .values({ userId, clientKey: s.id, createdAt: new Date(s.createdAt), ...values })
            .onConflictDoUpdate({ target: [styleProfiles.userId, styleProfiles.clientKey], set: values })
            .returning({ id: styleProfiles.id });
          styleIds.set(s.id, row.id);
          break;
        }
        case "deleteStyle":
          await tx
            .delete(styleProfiles)
            .where(and(eq(styleProfiles.userId, userId), eq(styleProfiles.clientKey, op.styleId)));
          styleIds.delete(op.styleId);
          break;
        case "react": {
          const styleProfileId = styleIds.get(op.styleId);
          if (!styleProfileId) {
            skip(op, "unknown_style");
            continue;
          }
          if (op.reaction === null) {
            await tx
              .delete(productReactions)
              .where(
                and(
                  eq(productReactions.userId, userId),
                  eq(productReactions.styleProfileId, styleProfileId),
                  eq(productReactions.productId, op.productId),
                ),
              );
            break;
          }
          if (!known.has(op.productId)) {
            skip(op, "unknown_product");
            continue;
          }
          await tx
            .insert(productReactions)
            .values({ userId, styleProfileId, productId: op.productId, reaction: op.reaction })
            .onConflictDoUpdate({
              target: [productReactions.styleProfileId, productReactions.productId],
              set: { reaction: op.reaction, updatedAt: now },
              // The key already belongs to this user's style; this keeps the update scoped regardless.
              setWhere: eq(productReactions.userId, userId),
            });
          break;
        }
        case "outfitsSeen": {
          const styleProfileId = styleIds.get(op.styleId);
          if (!styleProfileId) {
            skip(op, "unknown_style");
            continue;
          }
          if (!op.seen) {
            await tx
              .delete(seenOutfitAnchors)
              .where(
                and(
                  eq(seenOutfitAnchors.userId, userId),
                  eq(seenOutfitAnchors.styleProfileId, styleProfileId),
                  inArray(seenOutfitAnchors.productId, op.anchorIds),
                ),
              );
            break;
          }
          const ids = op.anchorIds.filter((id) => known.has(id));
          if (ids.length < op.anchorIds.length) skip(op, "unknown_product");
          if (ids.length) {
            await tx
              .insert(seenOutfitAnchors)
              .values(ids.map((productId) => ({ userId, styleProfileId, productId })))
              .onConflictDoNothing();
          }
          break;
        }
        case "saveOutfit": {
          const o = op.outfit;
          const styleProfileId = styleIds.get(o.styleId);
          if (!styleProfileId) {
            skip(op, "unknown_style");
            continue;
          }
          if (![o.anchorId, ...Object.values(o.items)].every((id) => !id || known.has(id))) {
            skip(op, "unknown_product");
            continue;
          }
          await tx
            .insert(savedOutfits)
            .values({
              userId,
              clientKey: o.id,
              styleProfileId,
              anchorProductId: o.anchorId,
              items: o.items as Record<string, string>,
              createdAt: new Date(o.createdAt),
            })
            .onConflictDoNothing({ target: [savedOutfits.userId, savedOutfits.clientKey] });
          break;
        }
        case "removeOutfit":
          await tx
            .delete(savedOutfits)
            .where(and(eq(savedOutfits.userId, userId), eq(savedOutfits.clientKey, op.outfitId)));
          break;
        case "prefs": {
          const values = { activeStyleKey: op.activeStyleId || null, hasOnboarded: op.hasOnboarded, updatedAt: now };
          await tx
            .insert(userPreferences)
            .values({ userId, ...values })
            .onConflictDoUpdate({ target: userPreferences.userId, set: values });
          break;
        }
      }
      result.applied++;
    }
    return result;
  });
}

