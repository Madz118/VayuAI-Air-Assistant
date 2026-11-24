import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

interface VayuWindSceneProps {
  intensity?: 'prominent' | 'subdued';
  reducedMotion?: boolean;
  className?: string;
}

const RIBBON_VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying float vDepth;
  uniform float uTime;
  uniform float uPhase;
  uniform float uAmplitude;

  void main() {
    vUv = uv;
    vec3 pos = position;

    // Multi-harmonic organic wind currents across XYZ with cross-stream flutter
    float crossOffset = uv.y - 0.5;
    float primaryWave = sin(uv.x * 7.5 - uTime * 0.85 + uPhase) * uAmplitude;
    float secondaryWave = cos(uv.x * 13.0 - uTime * 1.25 + uPhase * 1.7) * (uAmplitude * 0.34);
    float lateralSway = cos(uv.x * 5.2 - uTime * 0.58 + uPhase * 1.35) * (uAmplitude * 0.72);
    float ribbonFlutter = sin(uv.x * 11.0 - uTime * 1.45 + uPhase + crossOffset * 2.2) * (uAmplitude * 0.24 * crossOffset);

    pos.y += primaryWave + secondaryWave + ribbonFlutter;
    pos.z += lateralSway + sin(uv.x * 9.0 - uTime * 0.75 + uPhase) * (uAmplitude * 0.28);

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    vViewPos = -mvPos.xyz;
    vDepth = -mvPos.z;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const RIBBON_FRAGMENT_SHADER = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying float vDepth;
  uniform float uTime;
  uniform float uPhase;
  uniform float uOpacity;
  uniform vec3 uColorA;
  uniform vec3 uColorB;

  void main() {
    vec3 viewDir = normalize(vViewPos);
    float ndotv = abs(dot(viewDir, normalize(vNormal)));
    float fresnel = pow(1.0 - ndotv, 1.65);

    // Dual-layer flowing filaments along the ribbon length & width
    float streamA = sin(vUv.x * 11.0 - uTime * 1.3 + uPhase) * 0.5 + 0.5;
    float streamB = sin(vUv.x * 23.0 - uTime * 2.05 + uPhase * 1.6 + vUv.y * 3.0) * 0.5 + 0.5;
    float filament = smoothstep(0.32, 0.92, streamA * 0.65 + streamB * 0.35);

    // Silky core & feathered edge fade
    float edgeFade = smoothstep(0.0, 0.16, vUv.x) * (1.0 - smoothstep(0.84, 1.0, vUv.x));
    float crossProfile = pow(sin(vUv.y * 3.14159265), 0.78);
    float coreSheen = exp(-pow((vUv.y - 0.5) * 3.2, 2.0)) * 0.38;

    // Gentle atmospheric depth attenuation
    float depthAtten = clamp(1.22 - (vDepth - 6.0) * 0.055, 0.48, 1.0);

    vec3 col = mix(uColorA, uColorB, filament * 0.72 + fresnel * 0.28);
    col += uColorB * (fresnel * 0.22 + coreSheen * 0.35);

    float alpha = uOpacity * edgeFade * crossProfile * (0.48 + 0.52 * filament + fresnel * 0.25) * depthAtten;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.85));
  }
`;

const PARTICLE_VERTEX_SHADER = `
  attribute float aSize;
  attribute float aPhase;
  varying float vAlpha;
  uniform float uTime;

  void main() {
    vec3 pos = position;
    pos.x = mod(pos.x + uTime * 0.78 + 16.0, 32.0) - 16.0;
    pos.y += sin(uTime * 0.55 + aPhase) * 0.52 + cos(pos.x * 0.35 + aPhase) * 0.24;
    pos.z += cos(uTime * 0.42 + aPhase * 1.3) * 0.45;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    float edge = 1.0 - smoothstep(10.0, 16.0, abs(pos.x));
    float depthFade = clamp(1.15 - (-mvPosition.z - 5.0) * 0.05, 0.35, 1.0);
    vAlpha = edge * depthFade * (0.45 + 0.55 * sin(uTime * 1.15 + aPhase));
    gl_PointSize = aSize * (250.0 / max(1.0, -mvPosition.z));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const PARTICLE_FRAGMENT_SHADER = `
  varying float vAlpha;
  uniform vec3 uColor;
  uniform float uOpacity;

  void main() {
    float dist = length(gl_PointCoord - vec2(0.5));
    if (dist > 0.5) discard;
    float glow = pow(1.0 - dist * 2.0, 2.1);
    gl_FragColor = vec4(uColor, glow * vAlpha * uOpacity);
  }
`;

function buildRibbonStripGeometry(
  curve: THREE.CatmullRomCurve3,
  segments: number,
  halfWidth: number,
  twistTurns: number,
  twistPhase: number,
): THREE.BufferGeometry {
  const frames = curve.computeFrenetFrames(segments, false);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const pt = curve.getPointAt(t);
    const binormal = frames.binormals[i];
    const normal = frames.normals[i];

    // Organic helical twist along the air current so ribbons turn gracefully in 3D space
    const twistAngle = t * Math.PI * 2 * twistTurns + twistPhase + Math.sin(t * Math.PI * 3.0) * 0.35;
    const cosA = Math.cos(twistAngle);
    const sinA = Math.sin(twistAngle);

    const spanDir = new THREE.Vector3()
      .addScaledVector(binormal, cosA)
      .addScaledVector(normal, sinA)
      .normalize();
    const surfNormal = new THREE.Vector3()
      .addScaledVector(normal, cosA)
      .addScaledVector(binormal, -sinA)
      .normalize();

    const taper = Math.sin(t * Math.PI);
    const organicMod = 1 + 0.16 * Math.sin(t * Math.PI * 5.0 + twistPhase);
    const w = halfWidth * (0.28 + 0.72 * taper) * organicMod;

    const p0 = pt.clone().addScaledVector(spanDir, -w);
    const p1 = pt.clone().addScaledVector(spanDir, w);

    positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
    normals.push(surfNormal.x, surfNormal.y, surfNormal.z, surfNormal.x, surfNormal.y, surfNormal.z);
    uvs.push(t, 0, t, 1);

    if (i < segments) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

export const VayuWindScene: React.FC<VayuWindSceneProps> = ({
  intensity = 'prominent',
  reducedMotion = false,
  className = '',
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [fallbackActive, setFallbackActive] = useState(false);

  const intensityRef = useRef(intensity);
  const reducedMotionRef = useRef(reducedMotion);
  const syncSceneRef = useRef<(() => void) | null>(null);
  intensityRef.current = intensity;
  reducedMotionRef.current = reducedMotion;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Detect software WebGL safely for pacing (never altering scene content)
    const isSoftwareGl = (() => {
      try {
        const testCanvas = document.createElement('canvas');
        const gl = testCanvas.getContext('webgl2') || testCanvas.getContext('webgl');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setFallbackActive(true);
      return;
    }

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x07111f, 0.028);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 100);
    camera.position.set(0, 0.35, 10.6);

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x07111f, 0);

    container.appendChild(renderer.domElement);

    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    const ribbonConfigs = [
      { y: 1.75, z: -1.4, width: 0.44, amp: 0.38, phase: 0.0, twist: 0.65, colA: 0x16c7b0, colB: 0x49e3d0, op: 0.46 },
      { y: 0.55, z: 0.35, width: 0.58, amp: 0.48, phase: 1.1, twist: 0.85, colA: 0x49e3d0, colB: 0x55b8e8, op: 0.52 },
      { y: -0.48, z: 1.25, width: 0.38, amp: 0.34, phase: 2.3, twist: 0.55, colA: 0x16c7b0, colB: 0x55b8e8, op: 0.42 },
      { y: -1.65, z: -0.85, width: 0.5, amp: 0.42, phase: 3.4, twist: 0.75, colA: 0x55b8e8, colB: 0x49e3d0, op: 0.36 },
      { y: 2.55, z: -2.75, width: 0.34, amp: 0.3, phase: 4.5, twist: 0.5, colA: 0x16c7b0, colB: 0x49e3d0, op: 0.30 },
      { y: -2.45, z: -2.15, width: 0.4, amp: 0.32, phase: 5.2, twist: 0.6, colA: 0x49e3d0, colB: 0x55b8e8, op: 0.28 },
      { y: 0.08, z: -3.25, width: 0.68, amp: 0.52, phase: 2.8, twist: 0.45, colA: 0x0b6e78, colB: 0x49e3d0, op: 0.25 },
      { y: 1.12, z: -0.35, width: 0.26, amp: 0.36, phase: 3.9, twist: 0.95, colA: 0x55b8e8, colB: 0x16c7b0, op: 0.34 },
    ];

    const geometries: THREE.BufferGeometry[] = [];
    const ribbonMaterials: THREE.ShaderMaterial[] = [];

    ribbonConfigs.forEach((cfg, idx) => {
      const s = idx % 2 === 0 ? 1 : -1;
      const curve = new THREE.CatmullRomCurve3(
        [
          new THREE.Vector3(-15, cfg.y - 0.9 * s, cfg.z - 1.5),
          new THREE.Vector3(-9.5, cfg.y + 0.95 * s, cfg.z + 1.15),
          new THREE.Vector3(-3.8, cfg.y - 0.55 * s, cfg.z - 0.65),
          new THREE.Vector3(1.8, cfg.y + 0.72 * s, cfg.z + 0.95),
          new THREE.Vector3(7.8, cfg.y - 0.48 * s, cfg.z - 0.85),
          new THREE.Vector3(15, cfg.y + 0.55 * s, cfg.z + 1.1),
        ],
        false,
        'catmullrom',
        0.55,
      );
      const geo = buildRibbonStripGeometry(curve, 112, cfg.width, cfg.twist, cfg.phase);
      geometries.push(geo);

      const mat = new THREE.ShaderMaterial({
        vertexShader: RIBBON_VERTEX_SHADER,
        fragmentShader: RIBBON_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uPhase: { value: cfg.phase },
          uAmplitude: { value: cfg.amp },
          uOpacity: { value: cfg.op },
          uColorA: { value: new THREE.Color(cfg.colA) },
          uColorB: { value: new THREE.Color(cfg.colB) },
        },
      });
      ribbonMaterials.push(mat);

      const mesh = new THREE.Mesh(geo, mat);
      rootGroup.add(mesh);
    });

    // Atmospheric floating particles
    const particleCount = 180;
    const pPositions = new Float32Array(particleCount * 3);
    const pSizes = new Float32Array(particleCount);
    const pPhases = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) {
      pPositions[i * 3] = (Math.random() - 0.5) * 30;
      pPositions[i * 3 + 1] = (Math.random() - 0.5) * 9.5;
      pPositions[i * 3 + 2] = (Math.random() - 0.5) * 8.5 - 1;
      pSizes[i] = 0.08 + Math.random() * 0.2;
      pPhases[i] = Math.random() * Math.PI * 2;
    }

    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
    pGeo.setAttribute('aSize', new THREE.BufferAttribute(pSizes, 1));
    pGeo.setAttribute('aPhase', new THREE.BufferAttribute(pPhases, 1));
    geometries.push(pGeo);

    const pMat = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERTEX_SHADER,
      fragmentShader: PARTICLE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0x49e3d0) },
        uOpacity: { value: 0.72 },
      },
    });

    const particles = new THREE.Points(pGeo, pMat);
    rootGroup.add(particles);

    // Subtle pointer parallax
    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const onPointerMove = (e: PointerEvent) => {
      if (reducedMotionRef.current) return;
      pointer.targetX = (e.clientX / window.innerWidth - 0.5) * 0.75;
      pointer.targetY = -(e.clientY / window.innerHeight - 0.5) * 0.42;
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    let frameId = 0;
    let disposed = false;
    let isHidden = document.hidden;
    let elapsed = reducedMotionRef.current ? 3.8 : 0;
    let lastNow = performance.now();

    function afterDraw(cb: () => void) {
      try {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        if (typeof gl.fenceSync === 'function') {
          const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
          gl.flush();
          const poll = () => {
            if (disposed) return;
            const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
            if (state === gl.UNSIGNALED) {
              frameId = window.setTimeout(poll, 5);
            } else {
              if (sync) gl.deleteSync(sync);
              frameId = window.setTimeout(cb, 80);
            }
          };
          frameId = window.setTimeout(poll, 5);
          return;
        }
      } catch {
        // Fallback pacing if fenceSync unavailable
      }
      frameId = window.setTimeout(cb, 80);
    }

    function renderFrame(dt: number) {
      if (!reducedMotionRef.current) {
        elapsed += dt;
      }
      const scaleOpacity = intensityRef.current === 'prominent' ? 1.0 : 0.34;

      for (let i = 0; i < ribbonMaterials.length; i++) {
        const m = ribbonMaterials[i];
        m.uniforms.uTime.value = elapsed;
        m.uniforms.uOpacity.value = ribbonConfigs[i].op * scaleOpacity;
      }
      pMat.uniforms.uTime.value = elapsed;
      pMat.uniforms.uOpacity.value = 0.72 * scaleOpacity;

      if (!reducedMotionRef.current) {
        pointer.x += (pointer.targetX - pointer.x) * Math.min(1, dt * 3);
        pointer.y += (pointer.targetY - pointer.y) * Math.min(1, dt * 3);
      } else {
        pointer.x = 0;
        pointer.y = 0;
      }
      camera.position.x = pointer.x;
      camera.position.y = 0.35 + pointer.y;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    }

    function tick() {
      if (disposed || isHidden) return;
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastNow) / 1000);
      lastNow = now;

      renderFrame(dt);

      if (reducedMotionRef.current) {
        // Static atmospheric frame when reduced motion is enabled
        return;
      }
      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    const onVisibilityChange = () => {
      isHidden = document.hidden;
      if (!isHidden && !disposed) {
        lastNow = performance.now();
        tick();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      setFallbackActive(true);
    };
    const onContextRestored = () => {
      setFallbackActive(false);
      lastNow = performance.now();
      tick();
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    syncSceneRef.current = () => {
      if (disposed) return;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      lastNow = performance.now();
      tick();
    };

    tick();

    return () => {
      disposed = true;
      syncSceneRef.current = null;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);

      geometries.forEach((g) => g.dispose());
      ribbonMaterials.forEach((m) => m.dispose());
      pMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    syncSceneRef.current?.();
  }, [reducedMotion, intensity]);

  if (fallbackActive) {
    return (
      <div
        aria-hidden="true"
        data-testid="vayu-wind-fallback"
        className={`pointer-events-none fixed inset-0 overflow-hidden bg-[#07111F] ${className}`}
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 80% 50% at 20% 35%, rgba(22, 199, 176, 0.16), transparent 65%), radial-gradient(ellipse 70% 50% at 80% 60%, rgba(85, 184, 232, 0.14), transparent 70%)',
          }}
        />
      </div>
    );
  }

  return (
    <div
      ref={mountRef}
      aria-hidden="true"
      data-testid="vayu-wind-canvas"
      data-intensity={intensity}
      className={`pointer-events-none fixed inset-0 z-0 overflow-hidden ${className}`}
    />
  );
};
