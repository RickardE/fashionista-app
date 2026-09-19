"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from "react";
import { PRODUCTS, PRODUCTS_BY_ID } from "@/lib/data/products";
import { DEFAULT_STYLE_ID, styleById } from "@/lib/data/styles";
import { mergeAffinity, reorderTail } from "@/lib/personalization";
import type { AffinityMap } from "@/lib/personalization";
import type { Outfit, OutfitItems } from "@/lib/types";

const STORAGE_KEY = "styleai:v1";

interface StyleProfileState {
  liked: Record<string, true>;
  disliked: Record<string, true>;
  affinity: AffinityMap;
  interactions: number;
  feedOrder: string[];
  feedIndex: number;
  showSwipeHint: boolean;
  hasOnboarded: boolean;
  activeStyleId: string;
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
  | { type: "saveOutfit"; anchorId: string; items: OutfitItems }
  | { type: "removeOutfit"; id: string }
  | { type: "restart" };

function initialState(): StyleProfileState {
  return {
    liked: {},
    disliked: {},
    affinity: {},
    interactions: 0,
    feedOrder: PRODUCTS.map((p) => p.id),
    feedIndex: 0,
    showSwipeHint: true,
    hasOnboarded: false,
    activeStyleId: DEFAULT_STYLE_ID,
    savedOutfits: [],
  };
}

function feedLength(state: StyleProfileState): number {
  return state.feedOrder.length + 1;
}

function reducer(state: StyleProfileState, action: Action): StyleProfileState {
  switch (action.type) {
    case "hydrate":
      return action.state;

    case "react": {
      const product = PRODUCTS_BY_ID[action.id];
      if (!product) return state;
      const affinity = { ...state.affinity };
      product.tags.forEach((tag) => {
        affinity[tag] = (affinity[tag] ?? 0) + action.direction;
      });
      const liked = { ...state.liked };
      const disliked = { ...state.disliked };
      if (action.direction > 0) {
        liked[action.id] = true;
        delete disliked[action.id];
      } else {
        disliked[action.id] = true;
        delete liked[action.id];
      }
      return {
        ...state,
        affinity,
        liked,
        disliked,
        interactions: state.interactions + 1,
        feedOrder: reorderTail(state.feedOrder, state.feedIndex, affinity),
        showSwipeHint: false,
      };
    }

    case "next":
      return {
        ...state,
        feedIndex: Math.min(state.feedIndex + 1, feedLength(state) - 1),
        showSwipeHint: false,
      };

    case "prev":
      return { ...state, feedIndex: Math.max(state.feedIndex - 1, 0) };

    case "setFeedIndex":
      return {
        ...state,
        feedIndex: Math.max(0, Math.min(action.index, feedLength(state) - 1)),
      };

    case "resetFeed":
      return { ...state, feedIndex: 0 };

    case "toggleDetailLike": {
      const product = PRODUCTS_BY_ID[action.id];
      if (!product) return state;
      if (state.liked[action.id]) {
        const liked = { ...state.liked };
        delete liked[action.id];
        return { ...state, liked };
      }
      const affinity = { ...state.affinity };
      product.tags.forEach((tag) => {
        affinity[tag] = (affinity[tag] ?? 0) + 1;
      });
      return {
        ...state,
        liked: { ...state.liked, [action.id]: true },
        affinity,
        interactions: state.interactions + 1,
      };
    }

    case "completeOnboarding":
      return { ...state, hasOnboarded: true };

    case "setActiveStyle": {
      const affinity = mergeAffinity(
        styleById(action.styleId).seedAffinity,
        state.affinity,
      );
      return {
        ...state,
        activeStyleId: action.styleId,
        feedOrder: reorderTail(state.feedOrder, state.feedIndex, affinity),
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
  react: (id: string, direction: 1 | -1) => void;
  next: () => void;
  prev: () => void;
  setFeedIndex: (index: number) => void;
  resetFeed: () => void;
  toggleDetailLike: (id: string) => void;
  completeOnboarding: () => void;
  setActiveStyle: (styleId: string) => void;
  saveOutfit: (anchorId: string, items: OutfitItems) => void;
  removeOutfit: (id: string) => void;
  restart: () => void;
  feedLength: number;
  /** The active personal style's seed leaning merged with everything the user has actually liked/disliked. */
  effectiveAffinity: AffinityMap;
}

const StyleProfileContext = createContext<StyleProfileContextValue | null>(
  null,
);

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
        // (e.g. an older build with no personal styles / saved outfits)
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

  const effectiveAffinity = useMemo(
    () => mergeAffinity(styleById(state.activeStyleId).seedAffinity, state.affinity),
    [state.activeStyleId, state.affinity],
  );

  const value = useMemo<StyleProfileContextValue>(
    () => ({
      state,
      react,
      next,
      prev,
      setFeedIndex,
      resetFeed,
      toggleDetailLike,
      completeOnboarding,
      setActiveStyle,
      saveOutfit,
      removeOutfit,
      restart,
      feedLength: feedLength(state),
      effectiveAffinity,
    }),
    [
      state,
      react,
      next,
      prev,
      setFeedIndex,
      resetFeed,
      toggleDetailLike,
      completeOnboarding,
      setActiveStyle,
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
