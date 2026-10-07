import { describe, expect, it } from "vitest";
import { initialState, reducer } from "@/lib/store/style-profile-context";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

type State = ReturnType<typeof initialState>;
const run = (state: State, ...actions: Parameters<typeof reducer>[1][]) => actions.reduce(reducer, state);

function fresh(): State {
  return { ...initialState(), hydrated: true };
}

describe("style gender", () => {
  it("starts unset; the first choice applies to every style without one", () => {
    const s = run(fresh(), { type: "chooseGender", gender: "women" });
    expect(Object.values(s.styles).map((st) => st.gender)).toEqual(["women", "women", "women"]);
  });

  it("a first choice doesn't override styles that already have a gender", () => {
    const s = run(
      fresh(),
      { type: "setStyleGender", styleId: "work", gender: "men" },
      { type: "chooseGender", gender: "women" },
    );
    expect(s.styles.work.gender).toBe("men");
    expect(s.styles.everyday.gender).toBe("women");
  });

  it("changing a style's gender resets only that style's feeds, keeping saved items and taste", () => {
    let s = run(
      fresh(),
      { type: "chooseGender", gender: "men" },
      { type: "appendFeed", styleId: "everyday", gender: "men", ids: [A, B], exhausted: false },
      { type: "appendFeed", styleId: "work", gender: "men", ids: [A], exhausted: false },
      { type: "react", id: A, tags: ["black"], direction: 1 },
      { type: "next" },
      { type: "reactOutfit", tags: ["neutral"], direction: 1 },
      { type: "setOutfitCursor", styleId: "everyday", cursor: B },
      { type: "saveOutfit", anchorId: A, items: { top: A, bottom: B } },
    );
    s = run(s, { type: "setStyleGender", styleId: "everyday", gender: "women" });

    const everyday = s.styles.everyday;
    expect(everyday).toMatchObject({ gender: "women", feedOrder: [], feedIndex: 0, outfitCursor: undefined });
    expect(everyday.liked).toEqual({ [A]: true });
    expect(everyday.affinity).toEqual({ black: 1 });
    expect(everyday.outfitAffinity).toEqual({ neutral: 1 });
    expect(s.savedOutfits).toHaveLength(1);
    // Work untouched
    expect(s.styles.work).toMatchObject({ gender: "men", feedOrder: [A] });
  });

  it("drops a feed page fetched for the previous gender", () => {
    const s = run(
      fresh(),
      { type: "chooseGender", gender: "men" },
      { type: "setStyleGender", styleId: "everyday", gender: "women" },
      { type: "appendFeed", styleId: "everyday", gender: "men", ids: [A], exhausted: false },
    );
    expect(s.styles.everyday.feedOrder).toEqual([]);
  });

  it("new styles take the chosen gender", () => {
    const s = run(fresh(), { type: "createStyle", name: "Date night", seedAffinity: {}, description: "", gender: "women" });
    expect(s.styles[s.activeStyleId]).toMatchObject({ name: "Date night", gender: "women", feedOrder: [] });
  });
});

describe("style isolation", () => {
  it("saved products, saved outfits and feedback never leak between styles", () => {
    const s = run(
      fresh(),
      { type: "chooseGender", gender: "men" },
      { type: "react", id: A, tags: ["black"], direction: 1 },
      { type: "reactOutfit", tags: ["neutral"], direction: -1 },
      { type: "saveOutfit", anchorId: A, items: { top: A } },
      { type: "setActiveStyle", styleId: "work" },
      { type: "react", id: B, tags: ["tailoring"], direction: 1 },
    );
    expect(s.styles.everyday.liked).toEqual({ [A]: true });
    expect(s.styles.work.liked).toEqual({ [B]: true });
    expect(s.styles.everyday.dislikedOutfits).toBe(1);
    expect(s.styles.work.dislikedOutfits).toBe(0);
    expect(s.styles.work.affinity).toEqual({ tailoring: 1 });
    expect(s.savedOutfits.map((o) => o.styleId)).toEqual(["everyday"]);
  });
});
