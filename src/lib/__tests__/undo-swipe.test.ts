import { describe, expect, it } from "vitest";
import { diffState } from "@/lib/store/state-sync";
import { initialState, reducer, type LastSwipe } from "@/lib/store/style-profile-context";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

type State = ReturnType<typeof initialState>;
const run = (state: State, ...actions: Parameters<typeof reducer>[1][]) => actions.reduce(reducer, state);

function withFeed(): State {
  return run(
    { ...initialState(), hydrated: true },
    { type: "chooseGender", gender: "women" },
    { type: "appendFeed", styleId: "everyday", gender: "women", ids: [A, B], exhausted: false },
  );
}

function productSwipe(direction: 1 | -1, prevReaction: "like" | "dislike" | null = null): LastSwipe {
  return {
    kind: "product",
    styleId: "everyday",
    productId: A,
    tags: ["black", "relaxed"],
    direction,
    prevReaction,
    prevFeedIndex: 0,
    images: [],
    label: "",
  };
}

const swipe = (direction: 1 | -1): Parameters<typeof reducer>[1][] => [
  { type: "react", id: A, tags: ["black", "relaxed"], direction },
  { type: "next" },
];

describe("undo swipe", () => {
  it("reverses a product like: reaction, taste, interactions and feed position", () => {
    const before = withFeed();
    const undone = run(before, ...swipe(1), { type: "undoSwipe", swipe: productSwipe(1) });
    expect(undone.styles.everyday).toMatchObject({
      liked: {},
      disliked: {},
      affinity: {},
      interactions: 0,
      feedIndex: 0,
    });
    // Nothing left to tell the server.
    expect(diffState(before, undone)).toEqual([]);
  });

  it("reverses a product dislike", () => {
    const undone = run(withFeed(), ...swipe(-1), { type: "undoSwipe", swipe: productSwipe(-1) });
    expect(undone.styles.everyday).toMatchObject({ liked: {}, disliked: {}, affinity: {}, feedIndex: 0 });
  });

  it("restores a like the product had before it was swiped away", () => {
    const liked = run(withFeed(), { type: "toggleDetailLike", id: A, tags: ["black", "relaxed"] });
    const undone = run(liked, ...swipe(-1), { type: "undoSwipe", swipe: productSwipe(-1, "like") });
    expect(undone.styles.everyday.liked).toEqual({ [A]: true });
    expect(undone.styles.everyday.disliked).toEqual({});
    expect(undone.styles.everyday.affinity).toEqual(liked.styles.everyday.affinity);
  });

  it("leaves the feed position alone once the feed no longer holds the card", () => {
    const undone = run(withFeed(), ...swipe(1), { type: "refreshFeed" }, { type: "undoSwipe", swipe: productSwipe(1) });
    expect(undone.styles.everyday.feedIndex).toBe(0);
    expect(undone.styles.everyday.liked).toEqual({});
  });

  it("reverses an outfit like and removes the outfit it saved", () => {
    const before = withFeed();
    const liked = run(
      before,
      { type: "reactOutfit", tags: ["neutral"], direction: 1 },
      { type: "saveOutfit", anchorId: A, items: { top: A, bottom: B }, id: "look-1" },
    );
    const undone = run(liked, {
      type: "undoSwipe",
      swipe: {
        kind: "outfit",
        styleId: "everyday",
        outfitKey: "k",
        tags: ["neutral"],
        direction: 1,
        savedOutfitId: "look-1",
        images: [],
        label: "",
      },
    });
    expect(undone.styles.everyday).toMatchObject({ outfitAffinity: {}, likedOutfits: 0, dislikedOutfits: 0 });
    expect(undone.savedOutfits).toEqual([]);
    expect(diffState(before, undone)).toEqual([]);
  });
});
