import { useEffect, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useReducedMotionPreference } from '@/hooks/useReducedMotionPreference';
import type Lenis from 'lenis';
import { setGlobalLenis } from '@/lib/scroll';

interface SmoothScrollProps {
  children: ReactNode;
}

/**
 * Lenis-powered smooth scrolling for the public marketing pages.
 *
 * Deliberately NOT enabled when:
 *  - the visitor asked for reduced motion,
 *  - the route is an admin/CMS route, where long forms, dialogs and nested
 *    scroll containers fight the virtual scroller.
 *
 * Touch gestures remain native (syncTouch is disabled).
 * ScrollTrigger positions are refreshed after fonts/images settle and on
 * debounced resizes, so reveal animations can't measure stale positions and
 * leave sections blank. Mobile URL-bar resizes are ignored to stop thrash.
 */
export default function SmoothScroll({ children }: SmoothScrollProps) {
  const { pathname } = useLocation();
  const isAdminRoute = pathname.startsWith('/admin') || pathname.startsWith('/student');
  const reducedMotion = useReducedMotionPreference();

  // oxlint-disable-next-line react-doctor/effect-needs-cleanup
  useEffect(() => {
    let lenisInstance: Lenis | undefined;
    let gsapInstance: typeof import('gsap')['gsap'] | undefined;
    let tickerCallback: ((time: number) => void) | undefined;
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    const setupRefreshers = (ST: typeof import('gsap/ScrollTrigger')['ScrollTrigger']) => {
      // Mobile browsers resize the viewport when the URL bar hides; refreshing
      // on that causes visible jumps and dropped frames.
      ST.config({ ignoreMobileResize: true });

      const refresh = () => ST.refresh();

      // Late-loading fonts and images shift layout — remeasure once settled.
      if (document.fonts?.ready) {
        document.fonts.ready.then(() => !cancelled && refresh()).catch(() => {});
      }
      const onLoad = () => refresh();
      window.addEventListener('load', onLoad, { once: true });
      cleanups.push(() => window.removeEventListener('load', onLoad));

      let resizeTimer: number | undefined;
      let lastWidth = window.innerWidth;
      const onResize = () => {
        if (window.innerWidth === lastWidth && window.matchMedia('(pointer: coarse)').matches) return;
        lastWidth = window.innerWidth;
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(refresh, 250);
      };
      window.addEventListener('resize', onResize, { passive: true });
      cleanups.push(() => {
        window.clearTimeout(resizeTimer);
        window.removeEventListener('resize', onResize);
      });

      // Lazy-loaded sections change document height after mount.
      const settle = window.setTimeout(refresh, 1200);
      cleanups.push(() => window.clearTimeout(settle));
    };

    const init = async () => {
      if (isAdminRoute || reducedMotion) return;
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ]);
      if (cancelled) return;

      gsapInstance = gsap;
      gsap.registerPlugin(ScrollTrigger);
      setupRefreshers(ScrollTrigger);

      const Lenis = await import('lenis').then((m) => m.default);
      if (cancelled) return;

      lenisInstance = new Lenis({
        duration: 0.9,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        orientation: 'vertical',
        gestureOrientation: 'vertical',
        smoothWheel: true,
        wheelMultiplier: 1,
        syncTouch: false,
        // Leave dialogs, dropdowns and code blocks to the browser.
        prevent: (node: Element) =>
          Boolean(node.closest?.('[data-lenis-prevent], [role="dialog"], [role="alertdialog"], [data-radix-scroll-area-viewport], textarea, select')),
      });

      setGlobalLenis(lenisInstance);
      lenisInstance.on('scroll', ScrollTrigger.update);

      tickerCallback = (time: number) => lenisInstance?.raf(time * 1000);
      gsap.ticker.add(tickerCallback);
      // Keep GSAP's default lag smoothing: disabling it made a single slow
      // frame cascade into visible scroll stutter.
    };

    void init().catch(() => { /* Native scrolling remains available if an effect cannot load. */ });

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
      if (gsapInstance && tickerCallback) gsapInstance.ticker.remove(tickerCallback);
      if (lenisInstance) lenisInstance.destroy();
      setGlobalLenis(undefined);
    };
  }, [isAdminRoute, reducedMotion]);

  return <>{children}</>;
}
