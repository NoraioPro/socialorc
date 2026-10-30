"use client";

/**
 * The SocialOrk hero object — a faithful port of the 3D scene in the Claude
 * Design handoff (SocialOrk Landing.dc.html, `class Component.init`).
 *
 * Same geometry, same lights, same motion curve, same seven platform tiles:
 *  - core: icosahedron 0.85 / detail 5, physical material, emissive #48ED85
 *  - shell: wireframe icosahedron 1.22, opacity .16
 *  - two orbit rings, seven extruded rounded tiles with canvas-drawn glyphs
 *  - particle field, a pulse ring that fires every ~2.3 s and flashes a tile
 *  - camera drifts with the pointer; rendering pauses when scrolled away
 *
 * `prefers-reduced-motion` freezes the clock, and the canvas stays transparent
 * so the landing background shows through.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";

const GLYPHS: string[] = [
  "M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45z",
  "M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64z",
  "M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.72 3.72 0 0 1-1.38-.9 3.72 3.72 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63a5.88 5.88 0 0 0-2.13 1.38A5.88 5.88 0 0 0 .63 4.14C.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.31.79.72 1.45 1.38 2.13a5.88 5.88 0 0 0 2.13 1.38c.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.88 5.88 0 0 0 2.13-1.38 5.88 5.88 0 0 0 1.38-2.13c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.88 5.88 0 0 0-1.38-2.13A5.88 5.88 0 0 0 19.86.63C19.1.33 18.22.13 16.95.07 15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.4-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z",
  "M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.32l-.53 3.5h-2.8V24C19.62 23.1 24 18.1 24 12.07z",
  "M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81zM9.55 15.57V8.43L15.82 12l-6.27 3.57z",
  "M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
  "M11.94 0A12 12 0 1 0 24 12 12 12 0 0 0 11.94 0zm5.56 8.16c-.18 1.9-.96 6.5-1.36 8.62-.17.9-.5 1.2-.82 1.23-.7.06-1.23-.46-1.9-.9-1.06-.7-1.65-1.13-2.68-1.8-1.19-.79-.42-1.22.26-1.93.18-.18 3.25-2.98 3.31-3.23a.24.24 0 0 0-.06-.21.27.27 0 0 0-.24-.02c-.1.02-1.79 1.14-5.06 3.35-.48.33-.91.49-1.3.48-.43-.01-1.25-.24-1.86-.44-.75-.24-1.35-.37-1.3-.79.03-.22.33-.44.9-.67 3.5-1.52 5.83-2.53 7-3.02 3.33-1.39 4.03-1.63 4.48-1.64.1 0 .32.02.47.14a.5.5 0 0 1 .17.33c.02.13.03.27.02.4z"
];

export function Hero3D({ className }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let raf = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let observer: ResizeObserver | null = null;
    let io: IntersectionObserver | null = null;
    let onPointer: ((e: PointerEvent) => void) | null = null;

    const W = () => Math.max(1, host.clientWidth);
    const H = () => Math.max(1, host.clientHeight);

    (async () => {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      if (disposed) return;
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(W(), H());
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      renderer.domElement.style.cssText =
        "position:absolute;inset:0;width:100%;height:100%;opacity:0;transition:opacity 1.2s ease";
      host.appendChild(renderer.domElement);
      requestAnimationFrame(() => {
        if (renderer) renderer.domElement.style.opacity = "1";
      });

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(34, W() / H(), 0.1, 100);
      camera.position.set(0, 2.4, 10);
      camera.lookAt(0, 0, 0);

      scene.add(new THREE.AmbientLight(0xffffff, 0.4));
      const key = new THREE.DirectionalLight(0xffffff, 1.5);
      key.position.set(4, 6, 6);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x8db8f5, 0.6);
      rim.position.set(-6, 2, -4);
      scene.add(rim);
      const point = new THREE.PointLight(0x48ed85, 22, 14, 2);
      scene.add(point);

      const core = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.85, 5),
        new THREE.MeshPhysicalMaterial({
          color: 0x0b2214, emissive: 0x48ed85, emissiveIntensity: 0.5,
          roughness: 0.22, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.15,
        }),
      );
      scene.add(core);

      const shell = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.22, 1),
        new THREE.MeshBasicMaterial({ color: 0x48ed85, wireframe: true, transparent: true, opacity: 0.16 }),
      );
      scene.add(shell);

      const orbit = new THREE.Group();
      orbit.rotation.x = 0.34;
      orbit.rotation.z = -0.1;
      scene.add(orbit);
      orbit.updateMatrixWorld();

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(3.2, 0.006, 8, 240),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14 }),
      );
      ring.rotation.x = Math.PI / 2;
      orbit.add(ring);

      const ring2 = new THREE.Mesh(
        new THREE.TorusGeometry(2.05, 0.004, 8, 200),
        new THREE.MeshBasicMaterial({ color: 0x48ed85, transparent: true, opacity: 0.18 }),
      );
      ring2.rotation.x = Math.PI / 2;
      orbit.add(ring2);

      const rounded = (w: number, h: number, q: number) => {
        const s = new THREE.Shape();
        const x = -w / 2, y = -h / 2;
        s.moveTo(x + q, y);
        s.lineTo(x + w - q, y); s.quadraticCurveTo(x + w, y, x + w, y + q);
        s.lineTo(x + w, y + h - q); s.quadraticCurveTo(x + w, y + h, x + w - q, y + h);
        s.lineTo(x + q, y + h); s.quadraticCurveTo(x, y + h, x, y + h - q);
        s.lineTo(x, y + q); s.quadraticCurveTo(x, y, x + q, y);
        return s;
      };
      const tileGeo = new THREE.ExtrudeGeometry(rounded(0.86, 0.86, 0.2), {
        depth: 0.14, bevelEnabled: true, bevelThickness: 0.05,
        bevelSize: 0.05, bevelSegments: 5, curveSegments: 12,
      });
      tileGeo.center();

      const texture = (d: string) => {
        const c = document.createElement("canvas");
        c.width = c.height = 256;
        const ctx = c.getContext("2d")!;
        ctx.translate(48, 48);
        ctx.scale(160 / 24, 160 / 24);
        ctx.fillStyle = "#ECECF1";
        ctx.fill(new Path2D(d));
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        return t;
      };

      const inverse = orbit.quaternion.clone().invert();
      const tiles = GLYPHS.map((d, i) => {
        const group = new THREE.Group();
        const material = new THREE.MeshPhysicalMaterial({
          color: 0x1b1b22, roughness: 0.3, metalness: 0.35,
          clearcoat: 0.8, clearcoatRoughness: 0.25, emissive: 0x48ed85, emissiveIntensity: 0,
        });
        group.add(new THREE.Mesh(tileGeo, material));
        const face = new THREE.Mesh(
          new THREE.PlaneGeometry(0.44, 0.44),
          new THREE.MeshBasicMaterial({ map: texture(d), transparent: true }),
        );
        face.position.z = 0.13;
        group.add(face);
        orbit.add(group);
        const lineGeometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(), new THREE.Vector3(),
        ]);
        const line = new THREE.Line(
          lineGeometry,
          new THREE.LineBasicMaterial({ color: 0x48ed85, transparent: true, opacity: 0.15 }),
        );
        orbit.add(line);
        return { group, material, line, angle: (i / GLYPHS.length) * Math.PI * 2, flash: 0 };
      });

      const COUNT = 320;
      const positions = new Float32Array(COUNT * 3);
      for (let i = 0; i < COUNT; i++) {
        const radius = 1.8 + Math.random() * 4.5;
        const a = Math.random() * Math.PI * 2;
        positions[i * 3] = Math.cos(a) * radius;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 3.2;
        positions[i * 3 + 2] = Math.sin(a) * radius;
      }
      const particleGeometry = new THREE.BufferGeometry();
      particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const particles = new THREE.Points(
        particleGeometry,
        new THREE.PointsMaterial({ color: 0x48ed85, size: 0.028, transparent: true, opacity: 0.55, depthWrite: false }),
      );
      scene.add(particles);

      const pulse = new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.014, 8, 160),
        new THREE.MeshBasicMaterial({ color: 0x48ed85, transparent: true, opacity: 0 }),
      );
      pulse.rotation.x = Math.PI / 2;
      orbit.add(pulse);

      let mx = 0, my = 0;
      onPointer = (e: PointerEvent) => {
        const b = host.getBoundingClientRect();
        mx = Math.max(-1, Math.min(1, (e.clientX - b.left) / b.width - 0.5));
        my = Math.max(-1, Math.min(1, (e.clientY - b.top) / b.height - 0.5));
      };
      window.addEventListener("pointermove", onPointer, { passive: true });

      observer = new ResizeObserver(() => {
        if (!renderer) return;
        renderer.setSize(W(), H());
        camera.aspect = W() / H();
        camera.updateProjectionMatrix();
      });
      observer.observe(host);

      let visible = true;
      io = new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; });
      io.observe(host);

      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const clock = new THREE.Clock();
      let nextPulse = 1.4;
      let pulseStart: number | null = null;
      let pulseTarget: number | null = null;
      let sized = false;

      const tick = () => {
        if (disposed || !renderer) return;
        raf = requestAnimationFrame(tick);
        if (!visible) return;
        if (!sized || renderer.domElement.width < 2) {
          renderer.setSize(W(), H());
          camera.aspect = W() / H();
          camera.updateProjectionMatrix();
          sized = true;
        }
        const t = reduce ? 2 : clock.getElapsedTime();

        core.rotation.y = t * 0.25;
        shell.rotation.y = -t * 0.12;
        shell.rotation.x = t * 0.06;
        (core.material as THREE.MeshPhysicalMaterial).emissiveIntensity = 0.48 + Math.sin(t * 1.8) * 0.08;
        const spin = t * 0.16;
        const camQuat = inverse.clone().multiply(camera.quaternion);

        tiles.forEach((tile, i) => {
          const a = tile.angle + spin;
          const x = Math.cos(a) * 3.2;
          const z = Math.sin(a) * 3.2;
          const y = Math.sin(t * 1.1 + i * 0.9) * 0.14;
          tile.group.position.set(x, y, z);
          tile.group.quaternion.copy(camQuat);
          tile.flash *= 0.955;
          tile.material.emissiveIntensity = tile.flash * 0.85;
          tile.group.scale.setScalar(1 + tile.flash * 0.14);
          const attr = tile.line.geometry.attributes.position as THREE.BufferAttribute;
          attr.setXYZ(1, x, y, z);
          attr.needsUpdate = true;
          (tile.line.material as THREE.LineBasicMaterial).opacity = 0.1 + tile.flash * 0.65;
        });

        if (!reduce && t > nextPulse) {
          nextPulse = t + 2.3;
          pulseStart = t;
          pulseTarget = Math.floor(Math.random() * tiles.length);
        }
        if (pulseStart !== null) {
          const k = (t - pulseStart) / 0.85;
          if (k < 1) {
            pulse.scale.setScalar(0.9 + k * 2.3);
            (pulse.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.7;
          } else {
            (pulse.material as THREE.MeshBasicMaterial).opacity = 0;
            if (pulseTarget !== null) tiles[pulseTarget].flash = 1;
            pulseTarget = null;
            pulseStart = null;
          }
        }

        particles.rotation.y = t * 0.025;
        camera.position.x += (mx * 2.4 - camera.position.x) * 0.04;
        camera.position.y += (2.4 - my * 1.6 - camera.position.y) * 0.04;
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
      };
      tick();
    })().catch(() => {
      /* WebGL unavailable: the landing still renders, the stage stays empty. */
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer?.disconnect();
      io?.disconnect();
      if (onPointer) window.removeEventListener("pointermove", onPointer);
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, []);

  return <div ref={hostRef} className={className} style={{ position: "absolute", inset: 0 }} aria-hidden="true" />;
}
