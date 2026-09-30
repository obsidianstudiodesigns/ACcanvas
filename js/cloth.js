// Photoreal hanging canvas: Verlet cloth + PBR fabric, lit like a studio product shot.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const FABRICS = {
  'mush-brown': { name: 'Mush Brown', hex: '#5a4535' },
  'olive': { name: 'Olive', hex: '#4c4f30' },
  'beige': { name: 'Beige', hex: '#b9a57c' },
  'charcoal': { name: 'Charcoal', hex: '#4b4f55' },
  'saila-black': { name: 'Saila Black', hex: '#26272a' },
  'pvc-blue': { name: 'PVC Blue', hex: '#1f4fb0', pvc: true },
};

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- procedural textures ---------- */

function weaveTextures() {
  // Plain-weave height field -> normal + roughness maps, tiled.
  const S = 256, threads = 8, cell = S / threads;
  const h = new Float32Array(S * S);
  const jitter = Array.from({ length: threads * 2 }, () => 0.85 + Math.random() * 0.3);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = Math.floor(x / cell), j = Math.floor(y / cell);
      const u = (x % cell) / cell, v = (y % cell) / cell;
      const warp = Math.pow(Math.sin(Math.PI * u), 0.6) * (0.55 + 0.45 * Math.sin(Math.PI * v)) * jitter[i];
      const weft = Math.pow(Math.sin(Math.PI * v), 0.6) * (0.55 + 0.45 * Math.sin(Math.PI * u)) * jitter[threads + j];
      const over = (i + j) % 2 === 0;
      const fibre = (Math.random() - 0.5) * 0.08;
      h[y * S + x] = (over ? Math.max(warp, weft * 0.55) : Math.max(weft, warp * 0.55)) + fibre;
    }
  }
  const n = document.createElement('canvas'); n.width = n.height = S;
  const r = document.createElement('canvas'); r.width = r.height = S;
  const nc = n.getContext('2d'), rc = r.getContext('2d');
  const nd = nc.createImageData(S, S), rd = rc.createImageData(S, S);
  const at = (x, y) => h[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 2.2;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 2.2;
      const len = Math.hypot(dx, dy, 1);
      const k = (y * S + x) * 4;
      nd.data[k] = ((-dx / len) * 0.5 + 0.5) * 255;
      nd.data[k + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      nd.data[k + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      nd.data[k + 3] = 255;
      const rough = 0.98 - at(x, y) * 0.16; // thread crowns are slightly burnished
      rd.data[k] = rd.data[k + 1] = rd.data[k + 2] = rough * 255; rd.data[k + 3] = 255;
    }
  }
  nc.putImageData(nd, 0, 0); rc.putImageData(rd, 0, 0);
  const normal = new THREE.CanvasTexture(n), rough = new THREE.CanvasTexture(r);
  for (const t of [normal, rough]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  return { normal, rough };
}

function shade(hex, amt) {
  const c = new THREE.Color(hex); const hsl = {}; c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, THREE.MathUtils.clamp(hsl.l + amt, 0, 1));
  return '#' + c.getHexString();
}

function fabricMap({ hex, pvc }, W, H, print, pins, pinXs) {
  const cw = 2048, ch = Math.round(cw * H / W);
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const g = c.getContext('2d');
  g.fillStyle = hex; g.fillRect(0, 0, cw, ch);

  // Dye mottling and sun fade: soft low-frequency variation.
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * cw, y = Math.random() * ch, rad = 120 + Math.random() * 420;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    const light = Math.random() > 0.5;
    grd.addColorStop(0, light ? `rgba(255,255,255,${pvc ? 0.015 : 0.025})` : `rgba(0,0,0,${pvc ? 0.02 : 0.035})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // Fine slub noise along the warp.
  if (!pvc) {
    g.globalAlpha = 0.05;
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = Math.random() > 0.5 ? '#fff' : '#000';
      g.fillRect(Math.random() * cw, Math.random() * ch, 1 + Math.random() * 2, 6 + Math.random() * 30);
    }
    g.globalAlpha = 1;
  }

  // Printed content.
  if (print?.image) {
    const img = print.image, pw = cw * (print.scale ?? 0.62), ph = pw * img.height / img.width;
    g.save(); g.globalAlpha = pvc ? 0.97 : 0.92;
    g.drawImage(img, (cw - pw) / 2, ch * (print.y ?? 0.36) - ph / 2, pw, ph);
    g.restore();
  }
  if (print?.text) {
    g.save();
    const size = Math.round(ch * (print.size ?? 0.42));
    g.font = `800 ${size}px "Big Shoulders Stencil Display", Impact, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = print.color ?? '#F6C90E'; g.globalAlpha = 0.94;
    let fs = size;
    while (g.measureText(print.text).width > cw * 0.84 && fs > 40) { fs -= 8; g.font = `800 ${fs}px "Big Shoulders Stencil Display", Impact, sans-serif`; }
    g.fillText(print.text, cw / 2, ch * (print.y ?? 0.56));
    g.restore();
  }

  // Hem: folded edge, then a double row of lock stitches in tonal thread.
  const hem = cw * 0.022;
  g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 3;
  g.strokeRect(hem, hem * 2.4, cw - hem * 2, ch - hem * 3.4);
  g.fillStyle = 'rgba(0,0,0,0.10)';
  g.fillRect(0, 0, cw, hem * 2.4); // doubled header band
  const thread = pvc ? shade(hex, 0.2) : shade(hex, 0.22);
  g.strokeStyle = thread; g.lineWidth = 2.4; g.setLineDash([9, 7]);
  for (const inset of [hem * 0.55, hem * 0.9]) {
    g.strokeRect(inset, inset, cw - inset * 2, ch - inset * 2);
  }
  g.beginPath(); g.moveTo(0, hem * 2.4 - 6); g.lineTo(cw, hem * 2.4 - 6); g.stroke();
  g.setLineDash([]);

  // Eyelet holes + reinforcement.
  for (const u of pinXs) {
    const x = u * cw, y = hem * 1.2;
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.arc(x, y, hem * 0.95, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0b0b0c'; g.beginPath(); g.arc(x, y, hem * 0.42, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/* ---------- cloth ---------- */

export async function createCloth(container, opts = {}) {
  const small = innerWidth < 760;
  const o = Object.assign({
    width: 4.2, height: 5, cols: small ? 30 : 44, rows: small ? 34 : 50,
    pinEvery: 4, fabric: 'mush-brown', print: null, wind: 1, intro: true,
    focusX: 0, portion: 1, margin: 1.3,
  }, opts);

  const W = o.width, H = o.height, nx = o.cols, ny = o.rows;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.4;

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);

  // Highveld sun: warm key from upper left, cool rim from behind.
  const sun = new THREE.DirectionalLight(0xfff1dc, 3.0);
  sun.position.set(-4, 6, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -W; sun.shadow.camera.right = W;
  sun.shadow.camera.top = H; sun.shadow.camera.bottom = -H;
  sun.shadow.radius = 6; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
  const rim = new THREE.DirectionalLight(0xbcd0ff, 1.6);
  rim.position.set(5, 3, -4); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xdfe6f5, 0x2a2016, 0.35));

  const group = new THREE.Group(); scene.add(group);
  group.add(sun, sun.target);

  // Backdrop that only receives the cloth's shadow.
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(W * 6, H * 4), new THREE.ShadowMaterial({ opacity: 0.32 }));
  wall.position.z = -1.1; wall.receiveShadow = true; group.add(wall);

  // Particles.
  const geo = new THREE.PlaneGeometry(W, H, nx, ny);
  const N = (nx + 1) * (ny + 1);
  const pos = geo.attributes.position.array;
  const P = new Float32Array(N * 3), prev = new Float32Array(N * 3), rest = new Float32Array(N * 3);
  const inv = new Float32Array(N).fill(1);
  const top = H / 2;
  const pinCols = [];
  for (let c = 0; c <= nx; c += o.pinEvery) pinCols.push(c);
  if (pinCols[pinCols.length - 1] !== nx) pinCols.push(nx);
  for (let i = 0; i < N; i++) {
    rest[i * 3] = pos[i * 3]; rest[i * 3 + 1] = pos[i * 3 + 1]; rest[i * 3 + 2] = 0;
  }
  for (const c of pinCols) inv[c] = 0;

  // Constraints: structural, shear, bend (canvas is stiff).
  const cons = [];
  const idx = (c, r) => r * (nx + 1) + c;
  const dx = W / nx, dy = H / ny;
  for (let r = 0; r <= ny; r++) for (let c = 0; c <= nx; c++) {
    if (c < nx) cons.push(idx(c, r), idx(c + 1, r), dx);
    if (r < ny) cons.push(idx(c, r), idx(c, r + 1), dy);
    if (c < nx && r < ny) { const d = Math.hypot(dx, dy); cons.push(idx(c, r), idx(c + 1, r + 1), d, idx(c + 1, r), idx(c, r + 1), d); }
    if (c < nx - 1) cons.push(idx(c, r), idx(c + 2, r), dx * 2);
    if (r < ny - 1) cons.push(idx(c, r), idx(c, r + 2), dy * 2);
  }
  const C = new Float32Array(cons);

  function place(dropped) {
    for (let i = 0; i < N; i++) {
      const r = Math.floor(i / (nx + 1));
      let x = rest[i * 3], y = rest[i * 3 + 1], z = 0;
      if (dropped && inv[i]) { // start held out toward the viewer, then let gravity swing it down
        const d = r * dy, a = 1.25; y = top - d * Math.cos(a); z = d * Math.sin(a);
      }
      P[i * 3] = prev[i * 3] = x; P[i * 3 + 1] = prev[i * 3 + 1] = y; P[i * 3 + 2] = prev[i * 3 + 2] = z;
    }
  }
  place(o.intro && !reduced);

  const weave = weaveTextures();
  weave.normal.repeat.set(W * 26, H * 26); weave.rough.repeat.copy(weave.normal.repeat);
  const pinXs = pinCols.map(c => c / nx);
  const mapCache = {};
  const getMap = key => (mapCache[key] ??= fabricMap(FABRICS[key], W, H, o.print, pinCols, pinXs));

  const mat = new THREE.MeshPhysicalMaterial({
    side: THREE.DoubleSide, roughness: 0.93, metalness: 0,
    normalMap: weave.normal, roughnessMap: weave.rough, normalScale: new THREE.Vector2(0.45, 0.45),
    sheen: 0.4, sheenRoughness: 0.7,
  });
  function setFabric(key) {
    const f = FABRICS[key]; if (!f) return;
    mat.map = getMap(key);
    mat.sheenColor = new THREE.Color(shade(f.hex, 0.25));
    if (f.pvc) {
      mat.roughness = 0.42; mat.clearcoat = 0.55; mat.clearcoatRoughness = 0.28;
      mat.normalScale.set(0.06, 0.06); mat.sheen = 0.1;
    } else {
      mat.roughness = 0.93; mat.clearcoat = 0; mat.normalScale.set(0.45, 0.45); mat.sheen = 0.4;
    }
    mat.needsUpdate = true;
  }
  setFabric(o.fabric);

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  group.add(mesh);
  mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });

  // Hardware: galvanised rail, brackets, brass eyelets and steel rings.
  const steel = new THREE.MeshPhysicalMaterial({ color: 0xb9bec6, metalness: 1, roughness: 0.32, clearcoat: 0.3 });
  const brass = new THREE.MeshPhysicalMaterial({ color: 0xc9a24e, metalness: 1, roughness: 0.28 });
  const railY = top + 0.2, railLen = W + 0.9;
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, railLen, 32), steel);
  rail.rotation.z = Math.PI / 2; rail.position.set(0, railY, 0); rail.castShadow = true; group.add(rail);
  for (const s of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 16), steel);
    cap.position.set(s * railLen / 2, railY, 0); cap.castShadow = true; group.add(cap);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 16), steel);
    arm.rotation.x = Math.PI / 2; arm.position.set(s * (railLen / 2 - 0.12), railY, -0.55); arm.castShadow = true; group.add(arm);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.28, 0.03), steel);
    plate.position.set(s * (railLen / 2 - 0.12), railY, -1.09); group.add(plate);
  }
  const eyeGeo = new THREE.TorusGeometry(0.05, 0.016, 12, 32);
  const ringGeo = new THREE.TorusGeometry(0.1, 0.011, 10, 36);
  const pinY = top - H * 0.022 * 1.2 / 1; // eyelet sits in the header band
  for (const c of pinCols) {
    const x = rest[c * 3];
    const eye = new THREE.Mesh(eyeGeo, brass); eye.position.set(x, top - 0.05, 0.006); eye.castShadow = true; group.add(eye);
    const eyeB = eye.clone(); eyeB.position.z = -0.006; group.add(eyeB);
    const ring = new THREE.Mesh(ringGeo, steel); ring.rotation.y = Math.PI / 2;
    ring.position.set(x, (railY + top - 0.05) / 2 + 0.01, 0); ring.scale.set(1, 1.15, 1); ring.castShadow = true; group.add(ring);
  }
  // Pins sit in the eyelets, slightly below the fabric top edge.
  for (const c of pinCols) { rest[c * 3 + 1] = top; }

  /* ----- simulation ----- */
  const g = -9.8, damping = 0.984, iters = small ? 10 : 14, dt = 1 / 90;
  const normals = geo.attributes.normal.array;
  let t = 0, acc = 0, windScale = o.wind;
  const pointer = { x: 0, y: 0, vx: 0, vy: 0, active: false, world: new THREE.Vector3() };
  let gust = 0;

  function step() {
    t += dt;
    const base = reduced ? 0.25 : 1;
    // A Highveld breeze: it breathes in and out, swings side to side, and gusts.
    const breath = 0.5 + 0.3 * Math.sin(t * 0.6) + 0.2 * Math.sin(t * 1.7 + 1.3) + gust;
    const strength = 3.6 * breath * windScale * base;
    const wx = 0.5 * Math.sin(t * 0.23), wz = 0.6 + 0.4 * Math.sin(t * 0.47);
    for (let i = 0; i < N; i++) {
      if (!inv[i]) continue;
      const k = i * 3;
      const x = P[k], y = P[k + 1], z = P[k + 2];
      const ripple = 1 + 0.8 * Math.sin(x * 1.6 - t * 2.3) * Math.cos(y * 1.1 + t * 1.4) + 0.15 * Math.sin(x * 2.4 + y * 1.8 - t * 3.1);
      const nX = normals[k], nY = normals[k + 1], nZ = normals[k + 2];
      const dot = nX * wx + nZ * wz;
      const f = dot * strength * ripple;
      const ax = nX * f, ay = nY * f + g, az = nZ * f;
      P[k] = x + (x - prev[k]) * damping + ax * dt * dt;
      P[k + 1] = y + (y - prev[k + 1]) * damping + ay * dt * dt;
      P[k + 2] = z + (z - prev[k + 2]) * damping + az * dt * dt;
      prev[k] = x; prev[k + 1] = y; prev[k + 2] = z;
    }
    gust *= 0.985;
    // Pointer drag pushes the fabric like a hand sweeping across it.
    if (pointer.active) {
      const px = pointer.world.x, py = pointer.world.y, R = 0.9;
      for (let i = 0; i < N; i++) {
        if (!inv[i]) continue;
        const k = i * 3, ddx = P[k] - px, ddy = P[k + 1] - py, d2 = ddx * ddx + ddy * ddy;
        if (d2 < R * R) {
          const fall = 1 - Math.sqrt(d2) / R;
          P[k] += pointer.vx * 0.012 * fall; P[k + 1] += pointer.vy * 0.012 * fall;
          P[k + 2] -= Math.min(Math.hypot(pointer.vx, pointer.vy), 6) * 0.004 * fall;
        }
      }
    }
    for (let it = 0; it < iters; it++) {
      for (let q = 0; q < C.length; q += 3) {
        const a = C[q] * 3, b = C[q + 1] * 3, L = C[q + 2];
        const wa = inv[C[q]], wb = inv[C[q + 1]], w = wa + wb;
        if (!w) continue;
        const ex = P[b] - P[a], ey = P[b + 1] - P[a + 1], ez = P[b + 2] - P[a + 2];
        const d = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1e-6;
        const s = (d - L) / (d * w);
        P[a] += ex * s * wa; P[a + 1] += ey * s * wa; P[a + 2] += ez * s * wa;
        P[b] -= ex * s * wb; P[b + 1] -= ey * s * wb; P[b + 2] -= ez * s * wb;
      }
      for (const c of pinCols) { const k = c * 3; P[k] = rest[k]; P[k + 1] = top; P[k + 2] = 0; }
    }
    // Keep fabric in front of the wall.
    for (let i = 0; i < N; i++) if (P[i * 3 + 2] < -1.0) P[i * 3 + 2] = -1.0;
  }

  /* ----- framing ----- */
  let vw = 1, vh = 1;
  function frame() {
    const r = container.getBoundingClientRect();
    vw = Math.max(1, r.width); vh = Math.max(1, r.height);
    renderer.setSize(vw, vh, false);
    renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
    camera.aspect = vw / vh;
    const narrow = vw < 900;
    const portion = narrow ? 1 : o.portion, focusX = narrow ? 0 : o.focusX;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dH = (H + 0.6) * o.margin / 2 / tan;
    const dW = (railLen + 0.2) * o.margin / 2 / (tan * camera.aspect * portion);
    const d = Math.max(dH, dW);
    camera.position.set(0, 0.15, d);
    camera.userData.d = d;
    group.position.x = focusX * d * tan * camera.aspect;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(frame); ro.observe(container); frame();

  /* ----- input ----- */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  let lastX = 0, lastY = 0, lastT = 0, parX = 0, parY = 0, idleTimer;
  function onMove(e) {
    const r = container.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    parX = (x / r.width - 0.5); parY = (y / r.height - 0.5);
    ndc.set((x / r.width) * 2 - 1, -(y / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    if (ray.ray.intersectPlane(plane, hit)) {
      hit.x -= group.position.x;
      const now = performance.now(), dtm = Math.max(8, now - lastT);
      pointer.vx = (hit.x - pointer.world.x) / dtm * 1000 * 0.1;
      pointer.vy = (hit.y - pointer.world.y) / dtm * 1000 * 0.1;
      pointer.world.copy(hit); lastT = now;
      pointer.active = Math.abs(hit.x) < W / 2 + 0.6 && Math.abs(hit.y) < H / 2 + 0.6;
      clearTimeout(idleTimer); idleTimer = setTimeout(() => (pointer.active = false), 120);
    }
  }
  if (!reduced) container.addEventListener('pointermove', onMove, { passive: true });

  /* ----- loop ----- */
  let visible = true, raf = 0, last = performance.now();
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
  });
  io.observe(container);

  // Settle hidden frames if reduced motion so the first paint is at rest.
  if (reduced) for (let i = 0; i < 240; i++) { step(); geo.computeVertexNormals(); }

  const posAttr = geo.attributes.position;
  let camX = 0, camY = 0.15;
  function tick(now) {
    raf = 0;
    if (!visible) return;
    const frameDt = Math.min(0.05, (now - last) / 1000); last = now;
    acc += frameDt;
    let n = 0;
    while (acc >= dt && n < 3) { step(); acc -= dt; n++; }
    if (n === 3) acc = 0;
    posAttr.array.set(P); posAttr.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    // Subtle parallax: the camera drifts with the pointer.
    camX += ((reduced ? 0 : parX * 0.6) - camX) * 0.04;
    camY += ((reduced ? 0.15 : 0.15 - parY * 0.35) - camY) * 0.04;
    camera.position.x = camX; camera.position.y = camY;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  return {
    setFabric(key) { setFabric(key); if (!reduced) gust = 1.4; },
    gust(v = 1.2) { if (!reduced) gust = v; },
    destroy() { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); renderer.dispose(); },
  };
}
