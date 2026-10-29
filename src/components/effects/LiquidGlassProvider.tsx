import { memo, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import type { GlassConfig, LiquidGlass } from "@ybouane/liquidglass";
import { isLowPowerDevice } from "@/lib/motion";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";

let activeRoots = 0;
const waitingRoots = new Set<() => void>();
const releaseRoot = () => {
  activeRoots -= 1;
  for (const retry of waitingRoots) queueMicrotask(retry);
};

/**
 * Scoped, visibility-managed ybouane liquidglass with CSS fallback.
 */
interface LiquidGlassProviderProps {
  children: React.ReactNode;
  config?: Partial<GlassConfig>;
  fallbackClassName?: string;
  className?: string;
  enabled?: boolean;
}

const LiquidGlassProvider = memo(({ children, className, config = {}, enabled = true, fallbackClassName = "liquid-glass-fallback" }: LiquidGlassProviderProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const configKey = JSON.stringify(config);
  const privatePage = pathname.startsWith("/admin") || pathname.startsWith("/student");
  const reducedMotion = useReducedMotionPreference();
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const surfaces = Array.from(root.children).filter((node): node is HTMLElement => node instanceof HTMLElement && node.hasAttribute("data-liquid-glass"));
    if (!surfaces.length) return;
    const fallbackClasses = fallbackClassName.split(/\s+/).filter(Boolean);
    surfaces.forEach((surface) => surface.classList.add(...fallbackClasses));
    const clearFallback = () => surfaces.forEach((surface) => surface.classList.remove(...fallbackClasses));
    if (!enabled || privatePage || reducedMotion || isLowPowerDevice()) return clearFallback;
    let instance: LiquidGlass | undefined;
    let cancelled = false;
    let visible = false;
    let pending = false;
    let generation = 0;
    let failed = false;
    const stop = () => {
      generation += 1;
      if (instance) { instance.destroy(); instance = undefined; releaseRoot(); }
      root.removeAttribute("data-glass-ready");
    };
    const start = async () => {
      if (cancelled || pending || instance || failed || !visible || document.hidden || activeRoots >= 2) return;
      const current = generation;
      pending = true; activeRoots += 1;
      try {
        const { LiquidGlass } = await import("@ybouane/liquidglass");
        if (cancelled || current !== generation) { releaseRoot(); return; }
        const created = await LiquidGlass.init({ root, glassElements: surfaces, defaults: { ...JSON.parse(configKey), floating: false, opacity: 0.22, fresnel: 0.08, cornerRadius: 16, zRadius: 8 } });
        if (cancelled || current !== generation || !visible || document.hidden) { created.destroy(); releaseRoot(); return; }
        instance = created; root.dataset.glassReady = "true";
      } catch { failed = true; releaseRoot(); }
      finally {
        pending = false;
        if (!cancelled && current !== generation) void start();
      }
    };
    const retry = () => { void start(); };
    waitingRoots.add(retry);
    const observer = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      if (visible) void start(); else stop();
    });
    observer.observe(root);
    const visibility = () => { if (document.hidden) stop(); else void start(); };
    document.addEventListener("visibilitychange", visibility);
    return () => { cancelled = true; waitingRoots.delete(retry); observer.disconnect(); document.removeEventListener("visibilitychange", visibility); stop(); clearFallback(); };
  }, [configKey, enabled, privatePage, reducedMotion, fallbackClassName]);
  return (
    <div ref={rootRef} className={`scoped-liquid-glass ${className || ""}`}>
      {children}
    </div>
  );
});

LiquidGlassProvider.displayName = "LiquidGlassProvider";

export default LiquidGlassProvider;
