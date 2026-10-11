"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import {
  diffState,
  EMPTY_SYNCED,
  fromSynced,
  type SyncableState,
  type SyncedState,
} from "@/lib/store/state-sync";
import { initialState, type StyleProfileState } from "@/lib/store/style-profile-context";
import type { StyleProfile } from "@/lib/types";

export interface Account {
  id: string;
  email: string;
  name: string;
  image: string | null;
}

/** Per-device feed positions; everything else lives on the server. */
type DeviceStyle = Pick<StyleProfile, "feedOrder" | "feedIndex" | "feedExhausted" | "outfitCursor" | "showSwipeHint">;

const deviceKey = (userId: string) => `styleai:device:${userId}`;
/** Pre-account storage (no real users had data in it); removed on first load. */
const OLD_KEYS = ["styleai:v3", "styleai:v2"];

const SYNC_DELAY_MS = 400;
const RETRY_MS = [2_000, 5_000, 10_000, 30_000];

function readDevice(userId: string): Record<string, DeviceStyle> {
  try {
    return JSON.parse(window.localStorage.getItem(deviceKey(userId)) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

function writeDevice(userId: string, state: StyleProfileState) {
  const device = Object.fromEntries(
    Object.entries(state.styles).map(([id, s]) => [
      id,
      {
        feedOrder: s.feedOrder,
        feedIndex: s.feedIndex,
        feedExhausted: s.feedExhausted,
        outfitCursor: s.outfitCursor,
        showSwipeHint: s.showSwipeHint,
      } satisfies DeviceStyle,
    ]),
  );
  try {
    window.localStorage.setItem(deviceKey(userId), JSON.stringify(device));
  } catch {
    // storage full or unavailable — positions just restart next visit
  }
}

/**
 * A full page load, on purpose: it drops all in-memory state of the previous
 * session (useRouter would keep it).
 */
function hardNavigate(url: string) {
  window.location.assign(url);
}

function toLogin() {
  const { pathname, search } = window.location;
  hardNavigate(pathname === "/" ? "/login" : `/login?next=${encodeURIComponent(pathname + search)}`);
}

/**
 * Sends local changes to the server: each flush diffs the last acknowledged
 * state against the current one (see state-sync.ts), so a failed batch is
 * simply recomputed — merged with later changes — on retry.
 */
function createSyncer() {
  let current: StyleProfileState | null = null;
  let acked: SyncableState = EMPTY_SYNCED;
  let inFlight: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;

  const schedule = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), ms);
  };

  async function send(snapshot: StyleProfileState, keepalive: boolean) {
    const res = await fetch("/api/me/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ops: diffState(acked, snapshot) }),
      keepalive,
    }).catch(() => null);

    if (res?.status === 401) return toLogin();
    if (res && (res.ok || res.status === 400)) {
      if (res.ok) {
        const result = (await res.json()) as { skipped: unknown[] };
        if (result.skipped.length) console.warn("[sync] server skipped changes", result.skipped);
      } else {
        // A malformed batch won't succeed on retry; report it instead of looping.
        console.error("[sync] server rejected changes", await res.json().catch(() => null));
      }
      acked = snapshot;
      failures = 0;
      return;
    }
    schedule(RETRY_MS[Math.min(failures++, RETRY_MS.length - 1)]);
  }

  async function flush(opts: { keepalive?: boolean } = {}): Promise<void> {
    clearTimeout(timer);
    if (inFlight) {
      await inFlight;
      return flush(opts);
    }
    const snapshot = current;
    if (!snapshot?.hydrated || !diffState(acked, snapshot).length) return;
    inFlight = send(snapshot, opts.keepalive ?? false).finally(() => {
      inFlight = null;
    });
    await inFlight;
    // Changes made while the request was in flight.
    if (failures === 0 && current && diffState(acked, current).length) schedule(SYNC_DELAY_MS);
  }

  return {
    /** Sets the server's state as loaded; nothing before it is sent. */
    loaded(state: SyncableState) {
      acked = state;
    },
    /** Records the latest state and sends it shortly (unless a retry is already pending). */
    update(state: StyleProfileState) {
      current = state;
      if (failures === 0) schedule(SYNC_DELAY_MS);
    },
    flush,
  };
}

/**
 * Loads the signed-in user's state into the reducer, then keeps the server in
 * step: batched, retried with backoff, flushed when the page is hidden. A 401
 * at any point means the session ended — back to login.
 */
export function useServerSync(
  state: StyleProfileState,
  dispatch: (action: { type: "hydrate"; state: StyleProfileState }) => void,
) {
  const isLogin = usePathname() === "/login";
  const [account, setAccount] = useState<Account | null>(null);
  const [syncer] = useState(createSyncer);

  // Load once per signed-in page load.
  useEffect(() => {
    if (isLogin || account) return;
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/me/state", { headers: { accept: "application/json" } }).catch(() => null);
      if (cancelled) return;
      if (res?.status === 401) return toLogin();
      if (!res?.ok) {
        // Server unreachable: retry by reloading rather than showing defaults that would overwrite the account.
        setTimeout(() => !cancelled && window.location.reload(), RETRY_MS[1]);
        return;
      }
      const body = (await res.json()) as { user: Account; state: SyncedState | null };
      if (cancelled) return;

      const synced = body.state ? fromSynced(body.state) : null;
      // A new account starts from the built-in styles; the first sync uploads them.
      const base = synced ?? initialState();
      const device = readDevice(body.user.id);
      const styles = Object.fromEntries(
        Object.entries(base.styles).map(([id, s]) => [id, { ...s, ...device[id] }]),
      );
      syncer.loaded(synced ?? EMPTY_SYNCED);
      try {
        OLD_KEYS.forEach((key) => window.localStorage.removeItem(key));
      } catch {}
      setAccount(body.user);
      dispatch({ type: "hydrate", state: { ...base, styles, hydrated: true } });
    })();
    return () => {
      cancelled = true;
    };
  }, [isLogin, account, dispatch, syncer]);

  useEffect(() => {
    if (!state.hydrated || !account) return;
    writeDevice(account.id, state);
    syncer.update(state);
  }, [state, account, syncer]);

  // Don't lose the last swipe when the tab is closed or backgrounded.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void syncer.flush({ keepalive: true });
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [syncer]);

  const signOut = useCallback(async () => {
    await syncer.flush();
    await authClient.signOut();
    hardNavigate("/login");
  }, [syncer]);

  const clearDevice = useCallback(() => {
    if (!account) return;
    try {
      window.localStorage.removeItem(deviceKey(account.id));
    } catch {}
  }, [account]);

  return { account, signOut, clearDevice };
}
