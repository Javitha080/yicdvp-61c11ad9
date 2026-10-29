import { useEffect, useRef } from "react";
import { isLowPowerDevice } from "@/lib/motion";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";

export default function TiltShiftPreview({ active }: { active: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotionPreference();
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !active || reducedMotion || isLowPowerDevice() || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const image = host.parentElement?.querySelector<HTMLImageElement>("img:not([aria-hidden])");
    if (!image) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    const render = async () => {
      try {
        await image.decode();
        if (cancelled || !image.naturalWidth) return;
        const [THREE, { TiltShift }] = await Promise.all([import("three"), import("tiltshift-in-html")]);
        if (cancelled) return;
        const texture = await new THREE.TextureLoader().loadAsync(image.currentSrc || image.src);
        dispose = () => texture.dispose();
        if (cancelled) { texture.dispose(); return; }
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
        dispose = () => { texture.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); };
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
        camera.position.z = 2;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        const geometry = new THREE.PlaneGeometry(1, 1);
        const material = new THREE.MeshBasicMaterial({ map: texture });
        const plane = new THREE.Mesh(geometry, material);
        scene.add(plane);
        dispose = () => { texture.dispose(); geometry.dispose(); material.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); };
        const tilt = new TiltShift(renderer, { model: "band", bandHalfWidth: 0.28, bandFeather: 0.35, maxCoc: 6, quality: "low" });
        const draw = () => {
          if (cancelled || document.hidden) return;
          try {
            const width = host.clientWidth;
            const height = host.clientHeight;
            if (!width || !height) return;
            renderer.setPixelRatio(1); renderer.setSize(width, height);
            camera.aspect = width / height; camera.updateProjectionMatrix();
            const viewHeight = 4 * Math.tan(THREE.MathUtils.degToRad(22.5));
            const aspect = image.naturalWidth / image.naturalHeight;
            const scale = Math.max(viewHeight * camera.aspect / aspect, viewHeight);
            plane.scale.set(scale * aspect, scale, 1);
            tilt.syncSize(); tilt.render(scene, camera);
            const gl = renderer.getContext();
            const pixel = new Uint8Array(4);
            gl.readPixels(Math.floor(renderer.domElement.width / 2), Math.floor(renderer.domElement.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            if (gl.getError() !== gl.NO_ERROR || pixel[3] === 0) { host.removeAttribute("data-rendered"); return; }
            host.dataset.rendered = "true";
          } catch { host.removeAttribute("data-rendered"); }
        };
        const observer = new ResizeObserver(draw);
        dispose = () => {
          observer.disconnect(); document.removeEventListener("visibilitychange", draw);
          tilt.dispose(); texture.dispose(); geometry.dispose(); material.dispose();
          renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
          host.removeAttribute("data-rendered");
        };
        renderer.domElement.setAttribute("aria-hidden", "true");
        host.appendChild(renderer.domElement); observer.observe(host);
        document.addEventListener("visibilitychange", draw); draw();
      } catch { dispose?.(); host.removeAttribute("data-rendered"); }
    };
    void render();
    return () => { cancelled = true; dispose?.(); };
  }, [active, reducedMotion]);
  return <div ref={hostRef} aria-hidden="true" className="tiltshift-preview" />;
}