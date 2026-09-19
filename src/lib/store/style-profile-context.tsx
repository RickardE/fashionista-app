"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from "react";
import { PRODUCTS_BY_ID } from "@/lib/data/products";
import { BUILTIN_STYLE_PRESETS, DEFAULT_STYLE_ID } from "@/lib/data/styles";
import { mergeAffinity, rankedIds, reorderTail } from "@/lib/personalization";
import type { AffinityMap } from "@/lib/personalization";
import type { Outfit, OutfitItems, StylePreset, StyleProfile, StyleTag } from "@/lib/types";

const STORAGE_KEY = "styleai:v2";

interface StyleProfileState {
  styles: Record<string, StyleProfile>;
  styleOrder: string[];
  activeStyleId: string;
  hasOnboarded: boolean;
  savedOutfits: Outfit[];
}

type Action =
  | { type: "hydrate"; state: StyleProfileState }
  | { type: "react"; id: string; direction: 1 | -1 }
  | { type: "next" }
  | { type: "prev" }
  | { type: "setFeedIndex"; index: number }
  | { type: "resetFeed" }
  | { type: "toggleDetailLike"; id: string }
  | { type: "completeOnboarding" }
  | { type: "setActiveStyle"; styleId: string }
  | {
      type: "createStyle";
      name: string;
      seedAffinity: AffinityMap;
      description: string;
    }
  | { type: "duplicateStyle"; sourceId: string; name: string }
  | { type: "saveOutfit"; anchorId: string; items: OutfitItems }
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
    feedOrder: rankedIds(preset.seedAffinity),
    feedIndex: 0,
    showSwipeHint: true,
    createdAt: Date.now(),
  };
}

function initialState(): StyleProfileState {
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
  };
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

function reducer(state: StyleProfileState, action: Action): StyleProfileState {
  switch (action.type) {
    case "hydrate":
      return action.state;

    case "react": {
      const product = PRODUCTS_BY_ID[action.id];
      if (!product) return state;
      return updateStyle(state, state.activeStyleId, (style) => {
        const affinity = { ...style.affinity };
        product.tags.forEach((tag) => {
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
        const effective = mergeAffinity(style.seedAffinity, affinity);
        return {
          ...style,
          affinity,
          liked,
          disliked,
          interactions: style.interactions + 1,
          feedOrder: reorderTail(style.feedOrder, style.feedIndex, effective),
          showSwipeHint: false,
        };
      });
    }

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

    case "toggleDetailLike": {
      const product = PRODUCTS_BY_ID[action.id];
      if (!product) return state;
      return updateStyle(state, state.activeStyleId, (style) => {
        if (style.liked[action.id]) {
          const liked = { ...style.liked };
          delete liked[action.id];
          return { ...style, liked };
        }
        const affinity = { ...style.affinity };
        product.tags.forEach((tag) => {
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

    case "completeOnboarding":
      return { ...state, hasOnboarded: true };

    case "setActiveStyle":
      if (!state.styles[action.styleId]) return state;
      return { ...state, activeStyleId: action.styleId };

    case "createStyle": {
      const id = `style-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const style = makeStyleProfile({
        id,
        name: action.name,
        description: action.description,
        seedAffinity: action.seedAffinity,
      });
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

    case "saveOutfit": {
      const outfit: Outfit = {
        id: `look-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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
      return initialState();

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
  react: (id: string, direction: 1 | -1) => void;
  next: () => void;
  prev: () => void;
  setFeedIndex: (index: number) => void;
  resetFeed: () => void;
  toggleDetailLike: (id: string) => void;
  completeOnboarding: () => void;
  setActiveStyle: (styleId: string) => void;
  createStyle: (input: {
    name: string;
    description?: string;
    seedAffinity?: AffinityMap;
  }) => void;
  duplicateStyle: (sourceId: string, name: string) => void;
  saveOutfit: (anchorId: string, items: OutfitItems) => void;
  removeOutfit: (id: string) => void;
  restart: () => void;
  feedLength: number;
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

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StyleProfileState>;
        // Merge over fresh defaults so state saved before a schema change
        // still hydrates safely.
        dispatch({ type: "hydrate", state: { ...initialState(), ...parsed } });
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      // localStorage unavailable — start fresh
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      // storage full or unavailable — ignore, state still works in memory
    }
  }, [state]);

  const react = useCallback(
    (id: string, direction: 1 | -1) => dispatch({ type: "react", id, direction }),
    [],
  );
  const next = useCallback(() => dispatch({ type: "next" }), []);
  const prev = useCallback(() => dispatch({ type: "prev" }), []);
  const setFeedIndex = useCallback(
    (index: number) => dispatch({ type: "setFeedIndex", index }),
    [],
  );
  const resetFeed = useCallback(() => dispatch({ type: "resetFeed" }), []);
  const toggleDetailLike = useCallback(
    (id: string) => dispatch({ type: "toggleDetailLike", id }),
    [],
  );
  const completeOnboarding = useCallback(
    () => dispatch({ type: "completeOnboarding" }),
    [],
  );
  const setActiveStyle = useCallback(
    (styleId: string) => dispatch({ type: "setActiveStyle", styleId }),
    [],
  );
  const createStyle = useCallback(
    (input: { name: string; description?: string; seedAffinity?: AffinityMap }) =>
      dispatch({
        type: "createStyle",
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
  const saveOutfit = useCallback(
    (anchorId: string, items: OutfitItems) =>
      dispatch({ type: "saveOutfit", anchorId, items }),
    [],
  );
  const removeOutfit = useCallback(
    (id: string) => dispatch({ type: "removeOutfit", id }),
    [],
  );
  const restart = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      // ignore
    }
    dispatch({ type: "restart" });
  }, []);

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
      next,
      prev,
      setFeedIndex,
      resetFeed,
      toggleDetailLike,
      completeOnboarding,
      setActiveStyle,
      createStyle,
      duplicateStyle,
      saveOutfit,
      removeOutfit,
      restart,
      feedLength: feedLengthOf(activeStyle),
      effectiveAffinity,
    }),
    [
      state,
      styles,
      activeStyle,
      react,
      next,
      prev,
      setFeedIndex,
      resetFeed,
      toggleDetailLike,
      completeOnboarding,
      setActiveStyle,
      createStyle,
      duplicateStyle,
      saveOutfit,
      removeOutfit,
      restart,
      effectiveAffinity,
    ],
  );

  return (
    <StyleProfileContext.Provider value={value}>
      {children}
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
