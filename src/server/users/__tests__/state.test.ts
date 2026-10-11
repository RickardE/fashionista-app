import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SyncedStyleFields, SyncOp } from "@/lib/store/state-sync";
import { importFromSource } from "@/server/catalog/ingest";
import { createTestDb, memorySource, silentLogger } from "@/server/catalog/__tests__/helpers";
import { FULL_FEED } from "@/server/catalog/__tests__/fixtures/feed";
import type { Db } from "@/server/db/client";
import { products } from "@/server/db/schema";
import { applySync, getUserState } from "@/server/users/state";
import { createUser, testAuth } from "./helpers";

let db: Db;
vi.mock("@/server/db/client", () => ({ getDb: () => db }));
vi.mock("@/server/auth/auth", () => ({ getAuth: () => testAuth }));

const { GET: getState } = await import("@/app/api/me/state/route");
const { POST: sync } = await import("@/app/api/me/sync/route");

let close: () => Promise<void>;
let alice: string;
let bob: string;
let p1: string;
let p2: string;
const missing = "99999999-9999-4999-8999-999999999999";

const style = (id: string, over: Partial<SyncedStyleFields> = {}): SyncedStyleFields => ({
  id,
  name: id,
  description: "",
  seedAffinity: {},
  affinity: {},
  outfitAffinity: {},
  interactions: 0,
  likedOutfits: 0,
  dislikedOutfits: 0,
  createdAt: 1_700_000_000_000,
  ...over,
});

const aliceSetup = (): SyncOp[] => [
  { op: "upsertStyle", style: style("everyday", { affinity: { relaxed: 2 }, gender: "men" }), position: 0 },
  { op: "upsertStyle", style: style("work"), position: 1 },
  { op: "react", styleId: "everyday", productId: p1, reaction: "like" },
  { op: "react", styleId: "everyday", productId: p2, reaction: "dislike" },
  {
    op: "saveOutfit",
    outfit: { id: "look-1", anchorId: p1, items: { top: p1, bottom: p2 }, styleId: "everyday", createdAt: 1_700_000_000_000 },
  },
  { op: "prefs", activeStyleId: "work", hasOnboarded: true },
];

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await importFromSource(db, memorySource(FULL_FEED), { logger: silentLogger });
  [{ id: p1 }, { id: p2 }] = await db.select({ id: products.id }).from(products).limit(2);
  alice = await createUser(db, "alice@example.test");
  bob = await createUser(db, "bob@example.test");
});
afterAll(async () => {
  await close();
});

describe("user style state", () => {
  it("is null for a new account", async () => {
    expect(await getUserState(db, alice)).toBeNull();
  });

  it("stores styles, reactions, outfits and preferences", async () => {
    expect(await applySync(db, alice, aliceSetup())).toEqual({ applied: 6, skipped: [] });
    const state = (await getUserState(db, alice))!;
    expect(state.styles.map((s) => s.id)).toEqual(["everyday", "work"]);
    expect(state.styles[0]).toMatchObject({ affinity: { relaxed: 2 }, gender: "men", liked: [p1], disliked: [p2] });
    expect(state.savedOutfits).toEqual([
      { id: "look-1", anchorId: p1, items: { top: p1, bottom: p2 }, styleId: "everyday", createdAt: 1_700_000_000_000 },
    ]);
    expect(state).toMatchObject({ activeStyleId: "work", hasOnboarded: true });
  });

  it("is idempotent, so a retried batch changes nothing", async () => {
    const before = await getUserState(db, alice);
    await applySync(db, alice, aliceSetup());
    expect(await getUserState(db, alice)).toEqual(before);
  });

  it("switches and clears reactions", async () => {
    await applySync(db, alice, [
      { op: "react", styleId: "everyday", productId: p2, reaction: "like" },
      { op: "react", styleId: "everyday", productId: p1, reaction: null },
    ]);
    const [everyday] = (await getUserState(db, alice))!.styles;
    expect(everyday).toMatchObject({ liked: [p2], disliked: [] });
  });

  it("reports unknown products and styles instead of dropping them silently", async () => {
    const result = await applySync(db, alice, [
      { op: "react", styleId: "everyday", productId: missing, reaction: "like" },
      { op: "react", styleId: "nope", productId: p1, reaction: "like" },
    ]);
    expect(result).toEqual({
      applied: 0,
      skipped: [
        { op: "react", reason: "unknown_product" },
        { op: "react", reason: "unknown_style" },
      ],
    });
  });
});

describe("isolation between users", () => {
  it("keeps the same style key separate per user", async () => {
    await applySync(db, bob, [{ op: "upsertStyle", style: style("everyday", { name: "Bob's" }), position: 0 }]);
    const bobState = (await getUserState(db, bob))!;
    expect(bobState.styles).toEqual([expect.objectContaining({ id: "everyday", name: "Bob's", liked: [], disliked: [] })]);
    expect(bobState.savedOutfits).toEqual([]);
    expect((await getUserState(db, alice))!.styles[0].name).toBe("everyday");
  });

  it("cannot change or delete another user's data by guessing keys", async () => {
    const before = await getUserState(db, alice);
    await applySync(db, bob, [
      { op: "removeOutfit", outfitId: "look-1" },
      { op: "deleteStyle", styleId: "work" },
      { op: "react", styleId: "work", productId: p1, reaction: "like" },
      { op: "prefs", activeStyleId: "everyday", hasOnboarded: false },
    ]);
    expect(await getUserState(db, alice)).toEqual(before);
  });
});

describe("/api/me routes", () => {
  const as = (userId: string | null, path: string, init: RequestInit = {}) =>
    new Request(`http://localhost${path}`, {
      ...init,
      headers: { ...(userId ? { "x-test-user": userId } : {}), ...(init.headers as Record<string, string>) },
    });
  const post = (userId: string | null, body: unknown, headers: Record<string, string> = {}) =>
    as(userId, "/api/me/sync", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", origin: "http://localhost", ...headers },
    });

  it("require a session", async () => {
    expect((await getState(as(null, "/api/me/state"))).status).toBe(401);
    expect((await sync(post(null, { ops: [] }))).status).toBe(401);
  });

  it("return only the signed-in user's state", async () => {
    const res = await getState(as(bob, "/api/me/state"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const body = await res.json();
    expect(body.user.id).toBe(bob);
    expect(body.state.styles.map((s: { name: string }) => s.name)).toEqual(["Bob's"]);
  });

  it("apply a batch for the signed-in user", async () => {
    const res = await sync(post(bob, { ops: [{ op: "react", styleId: "everyday", productId: p1, reaction: "like" }] }));
    expect(await res.json()).toEqual({ applied: 1, skipped: [] });
    expect((await getUserState(db, bob))!.styles[0].liked).toEqual([p1]);
  });

  it("reject other origins, non-JSON and malformed batches", async () => {
    expect((await sync(post(bob, { ops: [] }, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await sync(post(bob, { ops: [] }, { "content-type": "text/plain" }))).status).toBe(415);
    const bad = await sync(post(bob, { ops: [{ op: "react", styleId: "everyday", productId: "x", reaction: "like" }] }));
    expect(bad.status).toBe(400);
    const userIdInBody = await sync(post(bob, { userId: alice, ops: [{ op: "deleteStyle", styleId: "work" }] }));
    expect(userIdInBody.status).toBe(200);
    expect((await getUserState(db, alice))!.styles.map((s) => s.id)).toContain("work");
  });
});
