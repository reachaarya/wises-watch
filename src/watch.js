import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

/* Everything the scroll timeline animates lives on this one object. */
export const pose = {
  rotX: 0.28, rotY: -0.6, rotZ: 0.14, // radians
  x: 0.42, y: 0.0,                     // fraction of half the viewport (−1 … 1)
  scale: 1.22,
  explode: 0,                          // 0 assembled → 1 fully apart
  labels: 0,                           // part annotations opacity
  hours: 0,                            // extra hours swept onto the hands
  opacity: 1,
};

/* How each assembly leaves the watch: offset (world units), spin (radians), stagger delay (0–1). */
const EXPLODE = {
  crystal:      { to: [0, 0, 3.2],   spin: [0.5, 0, 0],      delay: 0.0 },
  bezel:        { to: [0, 0, 2.35],  spin: [0, 0, -Math.PI], delay: 0.06 },
  hand_second:  { to: [0, 0, 1.85],  spin: [0, 0, 0],        delay: 0.12 },
  hand_minute:  { to: [0, 0, 1.5],   spin: [0, 0, 0],        delay: 0.16 },
  hand_hour:    { to: [0, 0, 1.18],  spin: [0, 0, 0],        delay: 0.2 },
  dial:         { to: [0, 0, 0.8],   spin: [0, 0, 0.6],      delay: 0.26 },
  case:         { to: [0, 0, 0],     spin: [0, 0, 0],        delay: 0 },
  caseback:     { to: [0, 0, -1.4],  spin: [0, 0, Math.PI],  delay: 0.2 },
  crown:        { to: [1.6, 0, 0],   spin: [Math.PI * 2, 0, 0], delay: 0.3 },
  strap_top:    { to: [0, 1.7, -0.4], spin: [-0.3, 0, 0],    delay: 0.34 },
  strap_bottom: { to: [0, -1.7, -0.4], spin: [0.3, 0, 0],    delay: 0.34 },
};

/* Annotations shown during the anatomy chapter. anchor: where on the part's bounding box the leader line lands. */
const LABELS = [
  { part: 'crystal',     text: 'Crystal',  num: 'i',   anchor: [0, 0.5, 0],  lift: 120 },
  { part: 'bezel',       text: 'Bezel',    num: 'ii',  anchor: [0, 0.5, 0],  lift: 70 },
  { part: 'hand_minute', text: 'Hands',    num: 'iii', anchor: [0, 0, 0],    lift: 150 },
  { part: 'dial',        text: 'Dial',     num: 'iv',  anchor: [0, 0.5, 0],  lift: 95 },
  { part: 'case',        text: 'Case',     num: 'v',   anchor: [0, -0.5, 0], lift: -80 },
  { part: 'caseback',    text: 'Caseback', num: 'vi',  anchor: [0, -0.5, 0], lift: -120 },
  { part: 'crown',       text: 'Crown',    num: 'vii', anchor: [0, 0, 0],    lift: -60 },
  { part: 'strap_bottom', text: 'Bracelet', num: 'viii', anchor: [0, 0, 0.5], lift: -70 },
];

/* Clockwise angle (degrees from 12 o'clock) each hand points to in the model file. Printed by tools/process-datejust.mjs. */
const HAND_BASE = { hand_minute: 64.7, hand_hour: 299.8, hand_second: 184.2 };
const DIAL_CENTER_LOCAL = new THREE.Vector3(0, 0, 0); // the model is baked with the dial centre at the origin

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

export class WatchStage {
  constructor(canvas, labelsEl) {
    this.canvas = canvas;
    this.labelsEl = labelsEl;
    this.pointer = { x: 0, y: 0, sx: 0, sy: 0 };
    this.parts = {};
    this.hands = {};
    this.labels = [];
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(studioEnvironment(), 0.02).texture;
    this.scene.environmentIntensity = 1;

    this.camera = new THREE.PerspectiveCamera(26, 1, 0.1, 200);
    this.camera.position.set(0, 0, 18);

    // warm studio lighting: amber key, low fill, copper rim
    const key = new THREE.DirectionalLight(0xffd6a8, 1.6);
    key.position.set(-5, 6, 7);
    const fill = new THREE.DirectionalLight(0xffe9d0, 0.25);
    fill.position.set(6, -2, 5);
    const rim = new THREE.DirectionalLight(0xff8a3d, 1.8);
    rim.position.set(4, 3, -6);
    const rim2 = new THREE.DirectionalLight(0xffb070, 1.2);
    rim2.position.set(-6, -3, -4);
    this.scene.add(key, fill, rim, rim2, new THREE.HemisphereLight(0xfff1dc, 0x2a160a, 0.15));

    // stage (cursor parallax) → spinner (scroll pose) → model
    this.stage = new THREE.Group();
    this.spinner = new THREE.Group();
    this.stage.add(this.spinner);
    this.scene.add(this.stage);

    this.resize = this.resize.bind(this);
    addEventListener('resize', this.resize);
    if (!this.reduced) {
      addEventListener('pointermove', (e) => {
        this.pointer.x = (e.clientX / innerWidth) * 2 - 1;
        this.pointer.y = (e.clientY / innerHeight) * 2 - 1;
      }, { passive: true });
    }
    this.resize();
  }

  load(onProgress) {
    const draco = new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
    const loader = new GLTFLoader().setDRACOLoader(draco);
    return new Promise((resolve, reject) => {
      loader.load(`${import.meta.env.BASE_URL}models/watch.glb`, (gltf) => { this.setup(gltf.scene); draco.dispose(); resolve(); },
        (e) => e.total && onProgress?.(e.loaded / e.total), reject);
    });
  }

  setup(root) {
    const watch = root.getObjectByName('Watch') ?? root;

    this.dress(root);

    // centre the watch head on the origin so it spins about itself
    const head = watch.getObjectByName('case');
    const c = new THREE.Box3().setFromObject(head).getCenter(new THREE.Vector3());
    root.position.sub(c);
    this.spinner.add(root);

    for (const name of Object.keys(EXPLODE)) {
      const obj = watch.getObjectByName(name);
      if (!obj) continue;
      this.parts[name] = { obj, base: obj.position.clone(), baseRot: obj.rotation.clone(), ...EXPLODE[name] };
    }

    // re-pivot each hand around the dial centre (in its own group space)
    for (const name of Object.keys(HAND_BASE)) {
      const group = watch.getObjectByName(name);
      if (!group) continue;
      const pivot = new THREE.Group();
      pivot.position.copy(DIAL_CENTER_LOCAL);
      [...group.children].forEach((ch) => { ch.position.sub(DIAL_CENTER_LOCAL); pivot.add(ch); });
      group.add(pivot);
      this.hands[name] = pivot;
    }

    // annotation elements
    for (const def of LABELS) {
      const part = this.parts[def.part];
      if (!part) continue;
      const box = new THREE.Box3().setFromObject(part.obj);
      const size = box.getSize(new THREE.Vector3());
      const world = box.getCenter(new THREE.Vector3()).add(new THREE.Vector3(...def.anchor).multiply(size));
      const local = part.obj.worldToLocal(world.clone());
      const el = document.createElement('div');
      el.className = 'part-label' + (def.lift < 0 ? ' part-label--below' : '');
      el.style.setProperty('--lift', `${Math.abs(def.lift)}px`);
      el.innerHTML = `<span class="part-label__dot"></span><span class="part-label__line"></span><span class="part-label__text"><em>${def.num}.</em> ${def.text}</span>`;
      this.labelsEl.appendChild(el);
      this.labels.push({ el, obj: part.obj, local });
    }
    this.ready = true;
  }

  /* Material touch-ups: crisp glass and a little more life in the steel reflections. */
  dress(root) {
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.1,
      clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.8, depthWrite: false,
    });
    root.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      if (m.name?.startsWith('glass')) {
        o.material = glass;
        o.renderOrder = 2;
        return;
      }
      if (m.metalness > 0.5) m.envMapIntensity = 1.25;
    });
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the watch a sensible size on tall phones
    this.camera.position.z = w / h < 0.8 ? 27 : 18;
    this.camera.updateProjectionMatrix();
    this.portrait = w / h < 0.8;
  }

  halfWidth() {
    return Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.position.z * this.camera.aspect;
  }

  applyPose(p, time) {
    const s = this.spinner;
    const floatY = this.reduced ? 0 : Math.sin(time * 0.9) * 0.08;
    s.rotation.set(p.rotX, p.rotY, p.rotZ + (this.reduced ? 0 : Math.sin(time * 0.55) * 0.02));
    // phones: centre the watch in the upper part of the screen, above the copy
    const lift = this.portrait && !this.snapshotting ? 0.36 : 0;
    s.position.set((this.portrait ? 0 : p.x) * this.halfWidth(), (p.y + lift) * this.halfWidth() / this.camera.aspect + floatY, 0);
    s.scale.setScalar(p.scale * (this.portrait && !this.snapshotting ? 0.68 : 1));

    for (const part of Object.values(this.parts)) {
      const e = easeInOut(clamp01((p.explode - part.delay) / (1 - part.delay * 0.9)));
      part.obj.position.set(part.base.x + part.to[0] * e, part.base.y + part.to[1] * e, part.base.z + part.to[2] * e);
      part.obj.rotation.set(part.baseRot.x + part.spin[0] * e, part.baseRot.y + part.spin[1] * e, part.baseRot.z + part.spin[2] * e);
    }

    // hands show the visitor's local time, plus whatever hours the scroll sweeps on
    const now = new Date();
    const sec = now.getSeconds() + now.getMilliseconds() / 1000;
    const min = now.getMinutes() + sec / 60 + p.hours * 60;
    const hr = (now.getHours() % 12) + now.getMinutes() / 60 + p.hours;
    const set = (name, deg) => this.hands[name] && (this.hands[name].rotation.z = -THREE.MathUtils.degToRad(deg - HAND_BASE[name]));
    set('hand_second', sec * 6);
    set('hand_minute', min * 6);
    set('hand_hour', hr * 30);
  }

  updateLabels(p) {
    const show = p.labels > 0.01;
    this.labelsEl.style.opacity = show ? p.labels : 0;
    if (!show) return;
    const v = new THREE.Vector3();
    for (const l of this.labels) {
      v.copy(l.local);
      l.obj.localToWorld(v).project(this.camera);
      const x = (v.x * 0.5 + 0.5) * innerWidth;
      const y = (-v.y * 0.5 + 0.5) * innerHeight;
      l.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }
  }

  render(time) {
    if (!this.ready) return;
    // eased cursor follow
    const k = 0.06;
    this.pointer.sx += (this.pointer.x - this.pointer.sx) * k;
    this.pointer.sy += (this.pointer.y - this.pointer.sy) * k;
    this.stage.rotation.y = this.pointer.sx * 0.22;
    this.stage.rotation.x = this.pointer.sy * 0.14;
    this.camera.position.x = -this.pointer.sx * 0.45;
    this.camera.position.y = this.pointer.sy * 0.3;
    this.camera.lookAt(0, 0, 0);

    this.applyPose(pose, time);
    if (pose.opacity <= 0.001) return;
    this.renderer.render(this.scene, this.camera);
    this.updateLabels(pose);
  }

  /* A still of the watch for the catalogue card, cropped from the live canvas. */
  snapshot(w = 720, h = 900) {
    if (!this.ready) return null;
    const saved = { ...pose };
    const sr = this.stage.rotation.clone(), cp = this.camera.position.clone();
    Object.assign(pose, { rotX: 0.18, rotY: -0.42, rotZ: 0.1, x: 0, y: 0, scale: 1.3, explode: 0, hours: 0 });
    this.stage.rotation.set(0, 0, 0);
    this.camera.position.set(0, 0, this.camera.position.z);
    this.camera.lookAt(0, 0, 0);
    const wasPortrait = this.portrait; this.portrait = true; this.snapshotting = true;
    this.applyPose(pose, 0);
    this.spinner.position.y = 0;
    this.renderer.render(this.scene, this.camera);

    const src = this.renderer.domElement;
    const ch = src.height * 0.98, cw = ch * (w / h);
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    out.getContext('2d').drawImage(src, (src.width - cw) / 2, (src.height - ch) / 2, cw, ch, 0, 0, w, h);

    this.portrait = wasPortrait; this.snapshotting = false;
    Object.assign(pose, saved);
    this.stage.rotation.copy(sr); this.camera.position.copy(cp);
    this.render(performance.now() / 1000);
    return out.toDataURL('image/png');
  }
}

/* A dark leather-toned studio with warm softboxes: gives the steel contrast instead of a flat grey glare. */
function studioEnvironment() {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.MeshBasicMaterial({ color: 0x2a190d, side: THREE.BackSide })));
  const box = (color, intensity, w, h, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 0, 0); env.add(m);
  };
  box(0xfff0dc, 3.2, 10, 3, [-6, 8, 6]);   // overhead key strip
  box(0xffc896, 2.0, 3, 12, [10, 0, 4]);   // tall side softbox
  box(0xff8a3d, 2.4, 14, 2, [0, -6, -10]); // copper floor bounce behind
  box(0xffe2c0, 1.2, 4, 4, [-10, -2, -4]); // small back-left kicker
  box(0xfff6ea, 0.6, 6, 6, [0, 2, 14]);    // soft front fill
  box(0xfff1e0, 1.3, 16, 7, [0, 7, 9]);    // broad overhead softbox so polished flanks never read pure black
  box(0x8a5a34, 1.0, 24, 6, [0, -9, 4]);   // warm leather-toned floor
  box(0xffffff, 5.0, 0.5, 16, [-7, 0, 9]);  // thin vertical strips: the long crisp highlights on polished steel
  box(0xfff2e2, 4.0, 0.5, 16, [8, 0, 7]);
  box(0xffe6cc, 3.0, 16, 0.4, [0, 9, 3]);  // a thin horizontal strip overhead
  return env;
}

