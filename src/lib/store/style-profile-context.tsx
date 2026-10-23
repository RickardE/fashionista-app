"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { BUILTIN_STYLE_PRESETS, DEFAULT_STYLE_ID } from "@/lib/data/styles";
import { mergeAffinity } from "@/lib/personalization";
import type { AffinityMap } from "@/lib/personalization";
import { type Account, useServerSync } from "@/lib/store/use-server-sync";
import type {
  Outfit,
  OutfitItems,
  Product,
  ShopperGender,
  StylePreset,
  StyleProfile,
  StyleTag,
} from "@/lib/types";

export interface PersistedState {
  styles: Record<string, StyleProfile>;
  styleOrder: string[];
  activeStyleId: string;
  hasOnboarded: boolean;
  savedOutfits: Outfit[];
}

/**
 * The most recent swipe, kept so it can be undone. Only one swipe is ever
 * remembered: the next swipe replaces it. Session-only — never persisted.
 */
export type LastSwipe = {
  styleId: string;
  tags: StyleTag[];
  direction: 1 | -1;
  /** Thumbnails (one per piece for an outfit, at most three) and alt text for the undo button. */
  images: string[];
  label: string;
} & (
  | {
      kind: "product";
      productId: string;
      /** The product's reaction before the swipe (it may have been liked from its details). */
      prevReaction: "like" | "dislike" | null;
      prevFeedIndex: number;
    }
  | {
      kind: "outfit";
      outfitKey: string;
      /** Set when the swipe saved the outfit. */
      savedOutfitId?: string;
    }
);

export type StyleProfileState = PersistedState & {
  /**
   * False until the account's state has been loaded into the reducer. Nothing
   * is synced before then — otherwise the default state could overwrite what
   * was saved.
   */
  hydrated: boolean;
};

type Action =
  | { type: "hydrate"; state: StyleProfileState }
  | { type: "react"; id: string; tags: StyleTag[]; direction: 1 | -1 }
  | { type: "appendFeed"; styleId: string; gender: ShopperGender; ids: string[]; exhausted: boolean }
  | { type: "setStyleGender"; styleId: string; gender: ShopperGender }
  | { type: "chooseGender"; gender: ShopperGender }
  | { type: "reactOutfit"; tags: StyleTag[]; direction: 1 | -1 }
  | { type: "undoSwipe"; swipe: LastSwipe }
  | { type: "setOutfitCursor"; styleId: string; cursor: string | undefined }
  | { type: "next" }
  | { type: "prev" }
  | { type: "setFeedIndex"; index: number }
  | { type: "resetFeed" }
  | { type: "refreshFeed" }
  | { type: "toggleDetailLike"; id: string; tags: StyleTag[] }
  | { type: "addSeedAffinity"; styleId: string; affinity: AffinityMap }
  | { type: "completeOnboarding" }
  | { type: "setActiveStyle"; styleId: string }
  | {
      type: "createStyle";
      name: string;
      seedAffinity: AffinityMap;
      description: string;
      gender?: ShopperGender;
    }
  | { type: "duplicateStyle"; sourceId: string; name: string }
  | { type: "renameStyle"; id: string; name: string }
  | { type: "saveOutfit"; anchorId: string; items: OutfitItems; id?: string }
  | { type: "removeOutfit"; id: string }
  | { type: "restart" };

function makeStyleProfile(preset: {
  id: string;
  name: string;
  description: string;
  seedAffinity: AffinityMap;
}): StyleProfile {
  return {
    id: preset.id,
    name: preset.name,
    description: preset.description,
    seedAffinity: preset.seedAffinity,
    liked: {},
    disliked: {},
    affinity: {},
    interactions: 0,
    feedOrder: [],
    feedIndex: 0,
    feedExhausted: false,
    outfitAffinity: {},
    likedOutfits: 0,
    dislikedOutfits: 0,
    showSwipeHint: true,
    createdAt: Date.now(),
  };
}

export function initialState(): StyleProfileState {
  const styles: Record<string, StyleProfile> = {};
  BUILTIN_STYLE_PRESETS.forEach((preset) => {
    styles[preset.id] = makeStyleProfile(preset);
  });
  return {
    styles,
    styleOrder: BUILTIN_STYLE_PRESETS.map((p) => p.id),
    activeStyleId: DEFAULT_STYLE_ID,
    hasOnboarded: false,
    savedOutfits: [],
    hydrated: false,
  };
}

/** Adds `delta` to each tag's weight, dropping weights that end up at zero. */
function shiftAffinity(affinity: AffinityMap, tags: StyleTag[], delta: number): AffinityMap {
  const next = { ...affinity };
  tags.forEach((tag) => {
    const value = (next[tag] ?? 0) + delta;
    if (value === 0) delete next[tag];
    else next[tag] = value;
  });
  return next;
}

function feedLengthOf(style: StyleProfile): number {
  return style.feedOrder.length + 1;
}

/** Applies an update to a single style profile, leaving every other style untouched. */
function updateStyle(
  state: StyleProfileState,
  id: string,
  fn: (style: StyleProfile) => StyleProfile,
): StyleProfileState {
  const current = state.styles[id];
  if (!current) return state;
  return { ...state, styles: { ...state.styles, [id]: fn(current) } };
}

/**
 * Sets a style's gender. A different gender means a different catalogue, so
 * that style's feed positions restart; its saved items and taste are kept.
 */
function withGender(style: StyleProfile, gender: ShopperGender): StyleProfile {
  if (style.gender === gender) return style;
  return {
    ...style,
    gender,
    feedOrder: [],
    feedIndex: 0,
    feedExhausted: false,
    outfitCursor: undefined,
  };
}

function newOutfitId(): string {
  return `look-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function reducer(state: StyleProfileState, action: Action): StyleProfileState {
  switch (action.type) {
    case "hydrate":
      return { ...action.state, hydrated: true };

    case "react": {
      return updateStyle(state, state.activeStyleId, (style) => {
        const affinity = { ...style.affinity };
        action.tags.forEach((tag) => {
          affinity[tag] = (affinity[tag] ?? 0) + action.direction;
        });
        const liked = { ...style.liked };
        const disliked = { ...style.disliked };
        if (action.direction > 0) {
          liked[action.id] = true;
          delete disliked[action.id];
        } else {
          disliked[action.id] = true;
          delete liked[action.id];
        }
        // The feed is served in catalogue order for now; ranking by taste
        // moves server-side with the recommendation milestone.
        return {
          ...style,
          affinity,
          liked,
          disliked,
          interactions: style.interactions + 1,
          showSwipeHint: false,
        };
      });
    }

    case "reactOutfit":
      return updateStyle(state, state.activeStyleId, (style) => {
        const outfitAffinity = { ...style.outfitAffinity };
        action.tags.forEach((tag) => {
          outfitAffinity[tag] = (outfitAffinity[tag] ?? 0) + action.direction;
        });
        return {
          ...style,
          outfitAffinity,
          likedOutfits: style.likedOutfits + (action.direction > 0 ? 1 : 0),
          dislikedOutfits: style.dislikedOutfits + (action.direction < 0 ? 1 : 0),
        };
      });

    // Reverses exactly what one swipe did: its taste change, its reaction (back
    // to what it was before) and, for products, the feed position.
    case "undoSwipe": {
      const { swipe } = action;
      if (swipe.kind === "outfit") {
        const next = updateStyle(state, swipe.styleId, (style) => ({
          ...style,
          outfitAffinity: shiftAffinity(style.outfitAffinity, swipe.tags, -swipe.direction),
          likedOutfits: Math.max(0, style.likedOutfits - (swipe.direction > 0 ? 1 : 0)),
          dislikedOutfits: Math.max(0, style.dislikedOutfits - (swipe.direction < 0 ? 1 : 0)),
        }));
        return swipe.savedOutfitId
          ? { ...next, savedOutfits: next.savedOutfits.filter((o) => o.id !== swipe.savedOutfitId) }
          : next;
      }
      return updateStyle(state, swipe.styleId, (style) => {
        const liked = { ...style.liked };
        const disliked = { ...style.disliked };
        delete liked[swipe.productId];
        delete disliked[swipe.productId];
        if (swipe.prevReaction === "like") liked[swipe.productId] = true;
        if (swipe.prevReaction === "dislike") disliked[swipe.productId] = true;
        return {
          ...style,
          affinity: shiftAffinity(style.affinity, swipe.tags, -swipe.direction),
          liked,
          disliked,
          interactions: Math.max(0, style.interactions - 1),
          // Only step back if the feed still holds the card (it may have been
          // reset or refetched since).
          feedIndex: style.feedOrder[swipe.prevFeedIndex] === swipe.productId ? swipe.prevFeedIndex : style.feedIndex,
        };
      });
    }

    case "setOutfitCursor":
      return updateStyle(state, action.styleId, (style) => ({ ...style, outfitCursor: action.cursor }));

    case "setStyleGender":
      return updateStyle(state, action.styleId, (style) => withGender(style, action.gender));

    // First-time choice: applies to the active style and every style that
    // doesn't have a gender yet, so the user answers once.
    case "chooseGender": {
      const styles = { ...state.styles };
      for (const [id, style] of Object.entries(styles)) {
        if (id === state.activeStyleId || !style.gender) styles[id] = withGender(style, action.gender);
      }
      return { ...state, styles };
    }

    case "appendFeed":
      return updateStyle(state, action.styleId, (style) => {
        // A page requested for another gender (changed mid-flight) is stale.
        if (style.gender !== action.gender) return style;
        const known = new Set(style.feedOrder);
        const fresh = action.ids.filter((id) => !known.has(id));
        return {
          ...style,
          feedOrder: fresh.length ? [...style.feedOrder, ...fresh] : style.feedOrder,
          feedExhausted: action.exhausted,
        };
      });

    case "next":
      return updateStyle(state, state.activeStyleId, (style) => ({
        ...style,
        feedIndex: Math.min(style.feedIndex + 1, feedLengthOf(style) - 1),
        showSwipeHint: false,
      }));

    case "prev":
      return updateStyle(state, state.activeStyleId, (style) => ({
        ...style,
        feedIndex: Math.max(style.feedIndex - 1, 0),
      }));

    case "setFeedIndex":
      return updateStyle(state, state.activeStyleId, (style) => ({
        ...style,
        feedIndex: Math.max(0, Math.min(action.index, feedLengthOf(style) - 1)),
      }));

    case "resetFeed":
      return updateStyle(state, state.activeStyleId, (style) => ({
        ...style,
        feedIndex: 0,
      }));

    // Drops the queued feed so it is fetched again from the start — for a feed
    // that can no longer show anything (e.g. ids from a previous catalogue).
    case "refreshFeed":
      return updateStyle(state, state.activeStyleId, (style) => ({
        ...style,
        feedOrder: [],
        feedIndex: 0,
        feedExhausted: false,
      }));

    case "toggleDetailLike": {
      return updateStyle(state, state.activeStyleId, (style) => {
        if (style.liked[action.id]) {
          const liked = { ...style.liked };
          delete liked[action.id];
          return { ...style, liked };
        }
        const affinity = { ...style.affinity };
        action.tags.forEach((tag) => {
          affinity[tag] = (affinity[tag] ?? 0) + 1;
        });
        return {
          ...style,
          liked: { ...style.liked, [action.id]: true },
          affinity,
          interactions: style.interactions + 1,
        };
      });
    }

    // Picked favourites give a style a head start on top of its seed.
    case "addSeedAffinity":
      return updateStyle(state, action.styleId, (style) => ({
        ...style,
        seedAffinity: mergeAffinity(style.seedAffinity, action.affinity),
      }));

    case "completeOnboarding":
      return { ...state, hasOnboarded: true };

    case "setActiveStyle":
      if (!state.styles[action.styleId]) return state;
      return { ...state, activeStyleId: action.styleId };

    case "createStyle": {
      const id = `style-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const style = {
        ...makeStyleProfile({
          id,
          name: action.name,
          description: action.description,
          seedAffinity: action.seedAffinity,
        }),
        gender: action.gender,
      };
      return {
        ...state,
        styles: { ...state.styles, [id]: style },
        styleOrder: [...state.styleOrder, id],
        activeStyleId: id,
      };
    }

    case "duplicateStyle": {
      const source = state.styles[action.sourceId];
      if (!source) return state;
      const id = `style-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const clone: StyleProfile = {
        ...source,
        id,
        name: action.name,
        createdAt: Date.now(),
      };
      return {
        ...state,
        styles: { ...state.styles, [id]: clone },
        styleOrder: [...state.styleOrder, id],
        activeStyleId: id,
      };
    }

    case "renameStyle": {
      const name = action.name.trim();
      if (!name) return state;
      return updateStyle(state, action.id, (style) => ({ ...style, name }));
    }

    case "saveOutfit": {
      const outfit: Outfit = {
        id: action.id ?? newOutfitId(),
        anchorId: action.anchorId,
        items: action.items,
        styleId: state.activeStyleId,
        createdAt: Date.now(),
      };
      return { ...state, savedOutfits: [outfit, ...state.savedOutfits] };
    }

    case "removeOutfit":
      return {
        ...state,
        savedOutfits: state.savedOutfits.filter((o) => o.id !== action.id),
      };

    case "restart":
      return { ...initialState(), hydrated: true };

    default:
      return state;
  }
}

interface StyleProfileContextValue {
  state: StyleProfileState;
  /** The full style list, in display order. */
  styles: StyleProfile[];
  /** The currently active style — the one driving the feed, builder and saved views. */
  activeStyle: StyleProfile;
  react: (product: Product, direction: 1 | -1) => void;
  /** Adds a loaded feed page to a style's feed. */
  appendFeed: (styleId: string, gender: ShopperGender, ids: string[], exhausted: boolean) => void;
  /** Changes one style's gender (resets that style's feed positions only). */
  setStyleGender: (styleId: string, gender: ShopperGender) => void;
  /** First-time pick: active style plus every style without a gender. */
  chooseGender: (gender: ShopperGender) => void;
  /** Records a love / not-for-me on a whole outfit, given all its pieces' tags. */
  reactOutfit: (tags: StyleTag[], direction: 1 | -1) => void;
  setOutfitCursor: (styleId: string, cursor: string | undefined) => void;
  next: () => void;
  prev: () => void;
  setFeedIndex: (index: number) => void;
  resetFeed: () => void;
  refreshFeed: () => void;
  toggleDetailLike: (product: Product) => void;
  /** Adds picked favourites' tags to a style's starting taste. */
  addSeedAffinity: (styleId: string, affinity: AffinityMap) => void;
  completeOnboarding: () => void;
  setActiveStyle: (styleId: string) => void;
  createStyle: (input: {
    name: string;
    description?: string;
    seedAffinity?: AffinityMap;
    gender?: ShopperGender;
  }) => void;
  duplicateStyle: (sourceId: string, name: string) => void;
  renameStyle: (id: string, name: string) => void;
  /** Saves an outfit to the active style and returns its id. */
  saveOutfit: (anchorId: string, items: OutfitItems) => string;
  removeOutfit: (id: string) => void;
  restart: () => void;
  /** The most recent swipe, if it can still be undone. */
  lastSwipe: LastSwipe | null;
  /** Remembers a swipe so it can be undone, replacing the one before it. */
  rememberSwipe: (swipe: LastSwipe) => void;
  /** Reverses the remembered swipe and forgets it. */
  undoSwipe: () => void;
  /** The signed-in user (null only on the login page). */
  account: Account | null;
  /** Saves pending changes, ends the session and returns to the login page. */
  signOut: () => Promise<void>;
  feedLength: number;
  /** The most recent user-initiated style switch — a UI event for the switch transition, not state. */
  styleSwitch: { id: string; at: number } | null;
  /** The active style's seed leaning merged with everything the user has actually liked/disliked in it. */
  effectiveAffinity: AffinityMap;
}

const StyleProfileContext = createContext<StyleProfileContextValue | null>(
  null,
);

/** A short "Word · Word · Word" description built from a style's own top tags. */
function describeFromTags(seedAffinity: AffinityMap): string {
  const tags = (Object.keys(seedAffinity) as StyleTag[]).sort(
    (a, b) => (seedAffinity[b] ?? 0) - (seedAffinity[a] ?? 0),
  );
  if (!tags.length) return "Just getting started";
  const words = tags.slice(0, 3).map((t) => {
    const first = t.split(" ")[0];
    return first.charAt(0).toUpperCase() + first.slice(1);
  });
  return words.join(" · ");
}

export function StyleProfileProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [styleSwitch, setStyleSwitch] = useState<{ id: string; at: number } | null>(null);
  const [lastSwipe, setLastSwipe] = useState<LastSwipe | null>(null);

  const { account, signOut, clearDevice } = useServerSync(state, dispatch);
  const react = useCallback(
    (product: Product, direction: 1 | -1) =>
      dispatch({ type: "react", id: product.id, tags: product.tags, direction }),
    [],
  );
  const appendFeed = useCallback(
    (styleId: string, gender: ShopperGender, ids: string[], exhausted: boolean) =>
      dispatch({ type: "appendFeed", styleId, gender, ids, exhausted }),
    [],
  );
  const setStyleGender = useCallback(
    (styleId: string, gender: ShopperGender) => dispatch({ type: "setStyleGender", styleId, gender }),
    [],
  );
  const chooseGender = useCallback(
    (gender: ShopperGender) => dispatch({ type: "chooseGender", gender }),
    [],
  );
  const reactOutfit = useCallback(
    (tags: StyleTag[], direction: 1 | -1) => dispatch({ type: "reactOutfit", tags, direction }),
    [],
  );
  const setOutfitCursor = useCallback(
    (styleId: string, cursor: string | undefined) =>
      dispatch({ type: "setOutfitCursor", styleId, cursor }),
    [],
  );
  const next = useCallback(() => dispatch({ type: "next" }), []);
  const prev = useCallback(() => dispatch({ type: "prev" }), []);
  const setFeedIndex = useCallback(
    (index: number) => dispatch({ type: "setFeedIndex", index }),
    [],
  );
  const resetFeed = useCallback(() => dispatch({ type: "resetFeed" }), []);
  const refreshFeed = useCallback(() => dispatch({ type: "refreshFeed" }), []);
  const toggleDetailLike = useCallback(
    (product: Product) => dispatch({ type: "toggleDetailLike", id: product.id, tags: product.tags }),
    [],
  );
  const addSeedAffinity = useCallback(
    (styleId: string, affinity: AffinityMap) => dispatch({ type: "addSeedAffinity", styleId, affinity }),
    [],
  );
  const completeOnboarding = useCallback(
    () => dispatch({ type: "completeOnboarding" }),
    [],
  );
  const setActiveStyle = useCallback(
    (styleId: string) => {
      dispatch({ type: "setActiveStyle", styleId });
      setLastSwipe(null);
      setStyleSwitch({ id: styleId, at: Date.now() });
    },
    [],
  );
  const createStyle = useCallback(
    (input: { name: string; description?: string; seedAffinity?: AffinityMap; gender?: ShopperGender }) =>
      dispatch({
        type: "createStyle",
        gender: input.gender,
        name: input.name,
        seedAffinity: input.seedAffinity ?? {},
        description: input.description ?? describeFromTags(input.seedAffinity ?? {}),
      }),
    [],
  );
  const duplicateStyle = useCallback(
    (sourceId: string, name: string) =>
      dispatch({ type: "duplicateStyle", sourceId, name }),
    [],
  );
  const renameStyle = useCallback(
    (id: string, name: string) => dispatch({ type: "renameStyle", id, name }),
    [],
  );
  const saveOutfit = useCallback(
    (anchorId: string, items: OutfitItems) => {
      const id = newOutfitId();
      dispatch({ type: "saveOutfit", anchorId, items, id });
      return id;
    },
    [],
  );
  const removeOutfit = useCallback(
    (id: string) => dispatch({ type: "removeOutfit", id }),
    [],
  );
  // Resets the account's style data too: the sync sends the difference.
  const restart = useCallback(() => {
    clearDevice();
    setLastSwipe(null);
    dispatch({ type: "restart" });
  }, [clearDevice]);
  const rememberSwipe = useCallback((swipe: LastSwipe) => setLastSwipe(swipe), []);
  const undoSwipe = useCallback(() => {
    if (!lastSwipe) return;
    dispatch({ type: "undoSwipe", swipe: lastSwipe });
    setLastSwipe(null);
  }, [lastSwipe]);

  const activeStyle =
    state.styles[state.activeStyleId] ?? Object.values(state.styles)[0];

  const effectiveAffinity = useMemo(
    () => mergeAffinity(activeStyle.seedAffinity, activeStyle.affinity),
    [activeStyle],
  );

  const styles = useMemo(
    () => state.styleOrder.map((id) => state.styles[id]).filter(Boolean),
    [state.styleOrder, state.styles],
  );

  const value = useMemo<StyleProfileContextValue>(
    () => ({
      state,
      styles,
      activeStyle,
      react,
      appendFeed,
      setStyleGender,
      chooseGender,
      reactOutfit,
      setOutfitCursor,
      next,
      prev,
      setFeedIndex,
      resetFeed,
      refreshFeed,
      toggleDetailLike,
      addSeedAffinity,
      completeOnboarding,
      setActiveStyle,
      createStyle,
      duplicateStyle,
      renameStyle,
      saveOutfit,
      removeOutfit,
      restart,
      lastSwipe,
      rememberSwipe,
      undoSwipe,
      account,
      signOut,
      feedLength: feedLengthOf(activeStyle),
      styleSwitch,
      effectiveAffinity,
    }),
    [
      state,
      styles,
      activeStyle,
      react,
      appendFeed,
      setStyleGender,
      chooseGender,
      reactOutfit,
      setOutfitCursor,
      next,
      prev,
      setFeedIndex,
      resetFeed,
      refreshFeed,
      toggleDetailLike,
      addSeedAffinity,
      completeOnboarding,
      setActiveStyle,
      createStyle,
      duplicateStyle,
      renameStyle,
      saveOutfit,
      removeOutfit,
      restart,
      lastSwipe,
      rememberSwipe,
      undoSwipe,
      account,
      signOut,
      styleSwitch,
      effectiveAffinity,
    ],
  );

  // Pages read the account's state, so nothing renders until it has loaded —
  // except the login page, which has no account.
  const isLogin = usePathname() === "/login";
  return (
    <StyleProfileContext.Provider value={value}>
      {isLogin || state.hydrated ? children : <div className="h-dvh bg-paper" aria-busy="true" />}
    </StyleProfileContext.Provider>
  );
}

export function useStyleProfile() {
  const ctx = useContext(StyleProfileContext);
  if (!ctx) {
    throw new Error("useStyleProfile must be used within StyleProfileProvider");
  }
  return ctx;
}

export type { StylePreset };
