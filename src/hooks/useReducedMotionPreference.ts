import { useSyncExternalStore } from "react";
import { prefersReducedMotion } from "@/lib/motion";

const subscribe = (notify: () => void) => {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};

/** Respond to accessibility changes without requiring a page reload. */
export function useReducedMotionPreference() {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => true);
}