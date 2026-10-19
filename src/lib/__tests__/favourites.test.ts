import { describe, expect, it } from "vitest";
import { affinityFromPicks, MAX_FAVOURITES, togglePick } from "@/components/FavouritesGrid";
import { diffState } from "@/lib/store/state-sync";
import { initialState, reducer } from "@/lib/store/style-profile-context";
import type { InspirationTile } from "@/lib/use-inspiration";
import type { Product } from "@/lib/types";

const tile = (label: string, tags: Product["tags"]): InspirationTile => ({
  label,
  product: { id: label, tags } as Product,
});

describe("picking favourites", () => {
  it("toggles picks in order, up to the maximum", () => {
    let picks: number[] = [];
    for (let i = 0; i < MAX_FAVOURITES + 2; i++) picks = togglePick(picks, i);
    expect(picks).toEqual([0, 1, 2, 3, 4]);
    expect(togglePick(picks, 1)).toEqual([0, 2, 3, 4]);
  });

  it("turns picks into one point per tag", () => {
    const tiles = [tile("a", ["black", "relaxed"]), tile("b", ["black"]), tile("c", ["knitwear"])];
    expect(affinityFromPicks(tiles, [0, 1])).toEqual({ black: 2, relaxed: 1 });
  });

  it("adds favourites to a style's starting taste, which syncs", () => {
    const before = { ...initialState(), hydrated: true };
    const after = reducer(before, { type: "addSeedAffinity", styleId: "everyday", affinity: { black: 2, relaxed: 1 } });
    expect(after.styles.everyday.seedAffinity).toEqual({ relaxed: 3, neutral: 2, layer: 1, knitwear: 1, black: 2 });
    expect(after.styles.work).toBe(before.styles.work);
    expect(diffState(before, after)).toEqual([
      expect.objectContaining({ op: "upsertStyle", style: expect.objectContaining({ id: "everyday" }) }),
    ]);
  });
});
