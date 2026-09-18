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
import { reorderTail } from "@/lib/personalization";
import type { AffinityMap } from "@/lib/personalization";

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
  restart: () => void;
  feedLength: number;
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
        const parsed = JSON.parse(raw) as StyleProfileState;
        dispatch({ type: "hydrate", state: parsed });
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
  const restart = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      // ignore
    }
    dispatch({ type: "restart" });
  }, []);

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
      restart,
      feedLength: feedLength(state),
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
      restart,
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
