import { memo, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import type { GlassConfig, LiquidGlass } from "@ybouane/liquidglass";
import { isLowPowerDevice, prefersReducedMotion } from "@/lib/motion";

let activeRoots = 0;

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

const LiquidGlassProvider = memo(({ children, className, config = {}, enabled = true }: LiquidGlassProviderProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const configKey = JSON.stringify(config);
  const privatePage = pathname.startsWith("/admin") || pathname.startsWith("/student");
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled || privatePage || prefersReducedMotion() || isLowPowerDevice()) return;
    const surfaces = Array.from(root.children).filter((node): node is HTMLElement => node instanceof HTMLElement && node.hasAttribute("data-liquid-glass"));
    if (!surfaces.length) return;
    let instance: LiquidGlass | undefined;
    let cancelled = false;
    let visible = false;
    let pending = false;
    let generation = 0;
    const stop = () => {
      generation += 1;
      if (instance) { instance.destroy(); instance = undefined; activeRoots -= 1; }
      root.removeAttribute("data-glass-ready");
    };
    const start = async () => {
      if (cancelled || pending || instance || !visible || document.hidden || activeRoots >= 2) return;
      const current = generation;
      pending = true; activeRoots += 1;
      try {
        const { LiquidGlass } = await import("@ybouane/liquidglass");
        if (cancelled || current !== generation) { activeRoots -= 1; return; }
        const created = await LiquidGlass.init({ root, glassElements: surfaces, defaults: { ...JSON.parse(configKey), floating: false, opacity: 0.22, fresnel: 0.08, cornerRadius: 16, zRadius: 8 } });
        if (cancelled || current !== generation || !visible || document.hidden) { created.destroy(); activeRoots -= 1; return; }
        instance = created; root.dataset.glassReady = "true";
      } catch { activeRoots -= 1; }
      finally { pending = false; }
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      if (visible) void start(); else stop();
    });
    observer.observe(root);
    const visibility = () => { if (document.hidden) stop(); else void start(); };
    document.addEventListener("visibilitychange", visibility);
    return () => { cancelled = true; observer.disconnect(); document.removeEventListener("visibilitychange", visibility); stop(); };
  }, [configKey, enabled, privatePage]);
  return (
    <div ref={rootRef} className={`scoped-liquid-glass ${className || ""}`}>
      {children}
    </div>
  );
});

LiquidGlassProvider.displayName = "LiquidGlassProvider";

export default LiquidGlassProvider;
