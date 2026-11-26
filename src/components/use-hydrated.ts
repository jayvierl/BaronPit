"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

/** Browser-local draft actions can run only once their event handlers are attached. */
export function useHydrated() {
  return useSyncExternalStore(subscribe, clientReady, serverReady);
}
