import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ELEMENTS, CATEGORIES, PROPS, shellsOf } from './data.js';

// ───────────── 狀態 ─────────────
const state = { z: 10, prop: PROPS[0], view: 'table', temp: 298, hover: -1 };
const MAX_H = 4.2, MIN_H = 0.12;
const $ = (id) => document.getElementById(id);
const N = ELEMENTS.length;

// ───────────── 場景 ─────────────
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
camera.position.set(0, 24, 30);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 1, 0.5);
controls.maxPolarAngle = Math.PI * 0.49;

scene.add(new THREE.HemisphereLight(0xbcd2ff, 0x1a1f33, 0.9));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.0);
sun.position.set(-8, 16, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 10, bottom: -10, near: 1, far: 50 });
scene.add(sun);
const rim = new THREE.PointLight(0x7cc4ff, 40, 40);
rim.position.set(8, 5, -8);
scene.add(rim);

// ───────────── 週期表群組 ─────────────
const tableGroup = new THREE.Group();
scene.add(tableGroup);

const slab = new THREE.Mesh(
  new THREE.BoxGeometry(20.4, 0.3, 11.6),
  new THREE.MeshStandardMaterial({ color: 0x151b30, roughness: 0.6, metalness: 0.3 }));
slab.position.set(0, -0.15, 0.4);
slab.receiveShadow = true;
tableGroup.add(slab);

const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 64),
  new THREE.MeshStandardMaterial({ color: 0x0b0f1d, roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.31;
floor.receiveShadow = true;
scene.add(floor);
const grid = new THREE.GridHelper(60, 60, 0x2a3558, 0x182040);
grid.position.y = -0.3;
grid.material.transparent = true; grid.material.opacity = 0.5;
scene.add(grid);

const boxGeo = new THREE.BoxGeometry(0.86, 1, 0.86);
const cols = new THREE.InstancedMesh(boxGeo,
  new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.25 }), N);
cols.castShadow = cols.receiveShadow = true;
cols.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
tableGroup.add(cols);

const pos = ELEMENTS.map((e) => new THREE.Vector3(e.col - 9.5, 0, e.row - 4.6));
const baseColor = ELEMENTS.map((e) => new THREE.Color(CATEGORIES[e.cat].color));
const curH = new Float32Array(N).fill(MIN_H);
const goalH = new Float32Array(N).fill(MIN_H);

function makeLabel(e) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.textAlign = 'center';
  g.fillStyle = '#9fb0d8'; g.font = '600 26px system-ui'; g.fillText(e.z, 64, 32);
  g.fillStyle = '#ffffff'; g.font = '700 62px system-ui'; g.fillText(e.sym, 64, 98);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(0.8, 0.8, 1);
  return s;
}
const labels = ELEMENTS.map((e) => { const s = makeLabel(e); tableGroup.add(s); return s; });

// 目前屬性正規化高度
function computeHeights() {
  const f = state.prop.field;
  const tf = state.prop.scale === 'sqrt' ? Math.sqrt : (x) => x;
  const vals = ELEMENTS.map((e) => (e[f] == null ? null : tf(e[f])));
  const valid = vals.filter((v) => v != null);
  const lo = Math.min(...valid), hi = Math.max(...valid);
  vals.forEach((v, i) => {
    goalH[i] = v == null ? MIN_H : MIN_H + (MAX_H - MIN_H) * (v - lo) / (hi - lo);
  });
}

// 排名（由大到小）
function rankOf(z) {
  const f = state.prop.field;
  const e = ELEMENTS[z - 1];
  if (e[f] == null) return null;
  const arr = ELEMENTS.filter((x) => x[f] != null).sort((a, b) => b[f] - a[f]);
  return { rank: arr.findIndex((x) => x.z === z) + 1, of: arr.length };
}

const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();
function updateColumns() {
  for (let i = 0; i < N; i++) {
    curH[i] += (goalH[i] - curH[i]) * 0.12;
    const h = curH[i];
    dummy.position.set(pos[i].x, h / 2, pos[i].z);
    dummy.scale.set(1, h, 1);
    dummy.updateMatrix();
    cols.setMatrixAt(i, dummy.matrix);
    const isSel = ELEMENTS[i].z === state.z;
    tmpColor.copy(baseColor[i]);
    if (i === state.hover) tmpColor.lerp(new THREE.Color(0xffffff), 0.3);
    if (isSel) tmpColor.lerp(new THREE.Color(0xffffff), 0.55);
    if (!isSel && ELEMENTS[i][state.prop.field] == null) tmpColor.multiplyScalar(0.35);
    cols.setColorAt(i, tmpColor);
    labels[i].position.set(pos[i].x, h + 0.55, pos[i].z);
  }
  cols.instanceMatrix.needsUpdate = true;
  cols.instanceColor.needsUpdate = true;
}

// ───────────── 原子群組 ─────────────
const atomGroup = new THREE.Group();
atomGroup.visible = false;
scene.add(atomGroup);
let electrons = null, nucleus = null, atomShellsR = [];
const electronData = [];

function seeded(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

function buildAtom(z) {
  while (atomGroup.children.length) {
    const o = atomGroup.children.pop();
    o.geometry?.dispose();
    o.material?.dispose?.();
  }
  electronData.length = 0;
  const e = ELEMENTS[z - 1];
  const cat = new THREE.Color(CATEGORIES[e.cat].color);
  const A = Math.round(e.mass);
  const neutrons = Math.max(0, A - z);
  const rnd = seeded(z * 97 + 13);

  // 原子核：質子與中子堆成一團
  const rN = 0.13 * Math.cbrt(A) + 0.1;
  nucleus = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 14, 10),
    new THREE.MeshStandardMaterial({ roughness: 0.4, emissive: 0x331100, emissiveIntensity: 0.6 }), z + neutrons);
  for (let i = 0; i < z + neutrons; i++) {
    let p;
    do { p = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1); } while (p.lengthSq() > 1);
    p.multiplyScalar(rN);
    dummy.position.copy(p); dummy.scale.setScalar(1); dummy.updateMatrix();
    nucleus.setMatrixAt(i, dummy.matrix);
    nucleus.setColorAt(i, new THREE.Color(i < z ? 0xff5a4a : 0x9aa6c8));
  }
  atomGroup.add(nucleus);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(rN * 1.5, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xff8a50, transparent: true, opacity: 0.08, depthWrite: false }));
  atomGroup.add(glow);

  // 電子殼
  const shells = shellsOf(z);
  const R1 = Math.max(1.3, rN + 0.9);
  atomShellsR = shells.map((_, i) => R1 + i * 0.95);
  let total = 0;
  shells.forEach((c, i) => {
    const last = i === shells.length - 1;
    const col = last ? new THREE.Color(0xffd86b) : cat.clone().lerp(new THREE.Color(0xffffff), 0.3);
    const shell = new THREE.Mesh(new THREE.SphereGeometry(atomShellsR[i], 28, 14),
      new THREE.MeshBasicMaterial({ color: col, wireframe: true, transparent: true, opacity: last ? 0.07 : 0.035, depthWrite: false }));
    atomGroup.add(shell);
    for (let k = 0; k < c; k++) {
      const nrm = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize();
      const u = new THREE.Vector3().crossVectors(nrm, new THREE.Vector3(0.3, 1, 0.2)).normalize();
      const v = new THREE.Vector3().crossVectors(nrm, u).normalize();
      electronData.push({ shell: i, u, v, phase: rnd() * Math.PI * 2, speed: 1.4 / (1 + i * 0.55), col, last });
      total++;
    }
  });
  electrons = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 12, 8),
    new THREE.MeshBasicMaterial(), total);
  electronData.forEach((d, i) => electrons.setColorAt(i, d.col));
  atomGroup.add(electrons);
  atomGroup.userData.maxR = atomShellsR[atomShellsR.length - 1];
}

function updateAtom(t) {
  if (!electrons) return;
  electronData.forEach((d, i) => {
    const a = d.phase + t * d.speed;
    const r = atomShellsR[d.shell];
    dummy.position.set(
      r * (d.u.x * Math.cos(a) + d.v.x * Math.sin(a)),
      r * (d.u.y * Math.cos(a) + d.v.y * Math.sin(a)),
      r * (d.u.z * Math.cos(a) + d.v.z * Math.sin(a)));
    dummy.scale.setScalar(d.last ? 1.25 : 1);
    dummy.updateMatrix();
    electrons.setMatrixAt(i, dummy.matrix);
  });
  electrons.instanceMatrix.needsUpdate = true;
  nucleus.rotation.y = t * 0.3;
}

// ───────────── 樣品群組 ─────────────
const sampleGroup = new THREE.Group();
sampleGroup.visible = false;
scene.add(sampleGroup);
const SN = 6, SP = SN * SN * SN, SPACE = 0.62, BOX = SN * SPACE;
const sampleMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 14),
  new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.5 }), SP);
sampleMesh.castShadow = true;
sampleGroup.add(sampleMesh);
const boxLines = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(BOX + 0.5, BOX + 0.5, BOX + 0.5)),
  new THREE.LineBasicMaterial({ color: 0x7cc4ff, transparent: true, opacity: 0.5 }));
sampleGroup.add(boxLines);
const home = [], sp = [], sv = [];
for (let i = 0; i < SN; i++) for (let j = 0; j < SN; j++) for (let k = 0; k < SN; k++) {
  const p = new THREE.Vector3((i - (SN - 1) / 2) * SPACE, (j - (SN - 1) / 2) * SPACE, (k - (SN - 1) / 2) * SPACE);
  home.push(p); sp.push(p.clone()); sv.push(new THREE.Vector3());
}
let sampleRadius = 0.25;
function buildSample(z) {
  const e = ELEMENTS[z - 1];
  const r = e.rad ?? 140;
  sampleRadius = 0.1 + 0.2 * Math.min(1, r / 260);
  const c = new THREE.Color(CATEGORIES[e.cat].color);
  for (let i = 0; i < SP; i++) sampleMesh.setColorAt(i, c);
  sampleMesh.instanceColor.needsUpdate = true;
}
function updateSample(dt, t) {
  const e = ELEMENTS[state.z - 1];
  const T = state.temp;
  const molten = e.mp != null && T >= e.mp;
  const jit = 0.004 + 0.045 * Math.sqrt(T / 1000);
  const lim = BOX / 2 + 0.1;
  const speed = 0.35 * Math.sqrt(Math.max(T, 1) / 300);
  for (let i = 0; i < SP; i++) {
    if (!molten) {
      sp[i].lerp(home[i], 0.12);
      sp[i].x += (Math.random() - 0.5) * jit;
      sp[i].y += (Math.random() - 0.5) * jit;
      sp[i].z += (Math.random() - 0.5) * jit;
      sv[i].set((Math.random() - 0.5) * speed, (Math.random() - 0.5) * speed, (Math.random() - 0.5) * speed);
    } else {
      sv[i].x += (Math.random() - 0.5) * 0.4 * speed;
      sv[i].y += (Math.random() - 0.5) * 0.4 * speed - 0.0;
      sv[i].z += (Math.random() - 0.5) * 0.4 * speed;
      sv[i].clampLength(0, speed * 2.2);
      sp[i].addScaledVector(sv[i], dt * 2);
      for (const ax of ['x', 'y', 'z']) {
        if (Math.abs(sp[i][ax]) > lim) { sp[i][ax] = Math.sign(sp[i][ax]) * lim; sv[i][ax] *= -1; }
      }
    }
    dummy.position.copy(sp[i]);
    dummy.scale.setScalar(sampleRadius);
    dummy.updateMatrix();
    sampleMesh.setMatrixAt(i, dummy.matrix);
  }
  sampleMesh.instanceMatrix.needsUpdate = true;
  sampleGroup.rotation.y = t * 0.12;
}

// ───────────── UI ─────────────
function fmt(v, unit) {
  if (v == null) return '—';
  const s = v >= 100 ? Math.round(v).toString() : v >= 1 ? v.toFixed(2).replace(/\.?0+$/, '') : v.toString();
  return unit ? `${s} ${unit}` : s;
}

function updateInfo() {
  const e = ELEMENTS[state.z - 1];
  const c = CATEGORIES[e.cat];
  const sb = $('symBox');
  sb.style.background = c.color;
  $('zNum').textContent = e.z;
  $('symTxt').textContent = e.sym;
  $('nameTxt').textContent = e.name;
  $('metaTxt').textContent = `${c.name}・${e.row >= 8 ? '鑭／錒系' : `第 ${Math.floor(e.row)} 週期`}`;
  $('massVal').textContent = e.mass;
  $('statLbl').textContent = state.prop.label;
  $('statVal').textContent = fmt(e[state.prop.field], state.prop.unit);
  const r = rankOf(state.z);
  $('rankVal').textContent = r ? `${r.rank} / ${r.of}` : '無資料';
  $('desc').textContent = state.view === 'table'
    ? `${e.name}的${state.prop.label}${e[state.prop.field] == null ? '沒有可靠資料。' : `為 ${fmt(e[state.prop.field], state.prop.unit)}。`}${state.prop.desc}`
    : state.view === 'atom'
      ? (() => { const s = shellsOf(e.z); return `${e.name}有 ${e.z} 個電子分布在 ${s.length} 層電子殼（${s.join('、')}）。金色的是最外層，決定它的化學性質。`; })()
      : `玻璃盒裡有 ${SP} 個${e.name}原子。拖曳溫度滑桿：低於熔點（${e.mp ?? '未知'} K）時原子在晶格位置上震動，高於熔點就掙脫晶格四處亂竄。`;
  const sh = shellsOf(e.z);
  $('pVal').textContent = e.z;
  $('nVal').textContent = Math.max(0, Math.round(e.mass) - e.z);
  $('vVal').textContent = sh[sh.length - 1];
  $('atomStats').style.display = state.view === 'atom' ? 'grid' : 'none';
  $('zOut').textContent = `${e.z} ${e.sym}`;
  $('zSlider').value = e.z;
  updatePhase();
}
function updatePhase() {
  const e = ELEMENTS[state.z - 1];
  $('tempOut').textContent = `${state.temp} K`;
  $('phase').textContent = e.mp == null ? '熔點未知' :
    state.temp >= e.mp ? `高於熔點 ${e.mp} K：已熔化` : `低於熔點 ${e.mp} K：固態`;
}

// 相機距離隨視窗長寬比調整，窄螢幕拉遠一點
function tableCamPos() {
  const a = camera.aspect;
  // 橫向要完整放進表格寬度（約 22 單位），直式螢幕再抬高視角
  const D = Math.max(15 + 17 / a, 11.5 / (0.364 * a));
  return a < 1 ? new THREE.Vector3(0, D * 0.8, D * 0.6) : new THREE.Vector3(0, D * 0.62, D * 0.78);
}
const portraitK = (k) => 1 / Math.min(1, camera.aspect * k);
const flyGoal = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), t: 0 };
function fly(p, t) { flyGoal.pos.copy(p); flyGoal.tgt.copy(t); flyGoal.t = 90; }

function setView(v) {
  state.view = v;
  tableGroup.visible = v === 'table';
  atomGroup.visible = v === 'atom';
  sampleGroup.visible = v === 'sample';
  floor.visible = grid.visible = v === 'table';
  scene.fog = v === 'table' ? null : new THREE.Fog(0x090d1a, 20, 70);
  $('tempbox').style.display = v === 'sample' ? 'block' : 'none';
  document.querySelectorAll('#viewBtns button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  if (v === 'table') fly(tableCamPos(), new THREE.Vector3(0, 0.5, 0.8));
  if (v === 'atom') { buildAtom(state.z); fly(new THREE.Vector3(0, 1.5, (2 + atomGroup.userData.maxR * 3.4) * portraitK(1.6)), new THREE.Vector3(0, 0, 0)); }
  if (v === 'sample') { buildSample(state.z); fly(new THREE.Vector3(3, 2.8, 7.5).multiplyScalar(portraitK(1.1)), new THREE.Vector3(0, 0, 0)); }
  updateInfo();
}
function setElement(z) {
  state.z = Math.min(N, Math.max(1, z));
  if (state.view === 'atom') { buildAtom(state.z); fly(new THREE.Vector3(0, 1.5, (2 + atomGroup.userData.maxR * 3.4) * portraitK(1.6)), new THREE.Vector3(0, 0, 0)); }
  if (state.view === 'sample') buildSample(state.z);
  updateInfo();
}
function setProp(p) {
  state.prop = p;
  document.querySelectorAll('#propBtns button').forEach((b) => b.classList.toggle('on', b.dataset.k === p.key));
  computeHeights();
  updateInfo();
}

PROPS.forEach((p) => {
  const b = document.createElement('button');
  b.textContent = p.label; b.dataset.k = p.key;
  b.onclick = () => setProp(p);
  $('propBtns').appendChild(b);
});
$('legend').innerHTML = Object.values(CATEGORIES)
  .map((c) => `<span><i style="background:${c.color}"></i>${c.name}</span>`).join('');
document.querySelectorAll('#viewBtns button').forEach((b) => (b.onclick = () => setView(b.dataset.v)));
$('zSlider').oninput = (e) => setElement(+e.target.value);
$('prev').onclick = () => setElement(state.z - 1);
$('next').onclick = () => setElement(state.z + 1);
$('temp').oninput = (e) => { state.temp = +e.target.value; updatePhase(); };
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
  if (e.key === 'ArrowRight') setElement(state.z + 1);
  else if (e.key === 'ArrowLeft') setElement(state.z - 1);
  else if (e.key === '1') setView('table');
  else if (e.key === '2') setView('atom');
  else if (e.key === '3') setView('sample');
  else if (e.key === 'Escape') setView('table');
});

// ───────────── 滑鼠拾取 ─────────────
const ray = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let down = null;
function pick(ev) {
  mouse.set((ev.clientX / innerWidth) * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObject(cols)[0];
  return hit ? hit.instanceId : -1;
}
canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  if (state.view !== 'table' || !down) return;
  if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) {
    const i = pick(e);
    if (i >= 0) {
      if (ELEMENTS[i].z === state.z) setView('atom'); else setElement(ELEMENTS[i].z);
    }
  }
  down = null;
});
canvas.addEventListener('pointermove', (e) => {
  if (state.view !== 'table') { $('tip').style.display = 'none'; return; }
  const i = pick(e);
  state.hover = i;
  canvas.style.cursor = i >= 0 ? 'pointer' : 'default';
  const tip = $('tip');
  if (i < 0) { tip.style.display = 'none'; return; }
  const el = ELEMENTS[i];
  tip.textContent = `${el.z} ${el.sym} ${el.name}　${state.prop.label} ${fmt(el[state.prop.field], state.prop.unit)}`;
  tip.style.left = e.clientX + 14 + 'px';
  tip.style.top = e.clientY + 14 + 'px';
  tip.style.display = 'block';
});

// ───────────── 主迴圈 ─────────────
let lastAspect = 0;
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  // 長寬比明顯改變（旋轉手機、縮放視窗）時，重新取景
  if (lastAspect && Math.abs(camera.aspect / lastAspect - 1) > 0.15 && state.view === 'table') {
    fly(tableCamPos(), new THREE.Vector3(0, 0.5, 0.8));
  }
  lastAspect = camera.aspect;
}
addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  if (flyGoal.t > 0) {
    flyGoal.t--;
    camera.position.lerp(flyGoal.pos, 0.08);
    controls.target.lerp(flyGoal.tgt, 0.08);
  }
  controls.update();
  if (state.view === 'table') updateColumns();
  else if (state.view === 'atom') updateAtom(t);
  else updateSample(dt, t);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

computeHeights();
curH.set(goalH);
setProp(PROPS[0]);
setView('table');
frame();

// 供截圖與測試用的掛勾
window.__set = ({ z, prop, view, temp, cam }) => {
  if (prop) setProp(PROPS.find((p) => p.key === prop));
  if (z) setElement(z);
  if (view) setView(view);
  if (temp != null) { state.temp = temp; $('temp').value = temp; updatePhase(); }
  if (cam) { camera.position.set(...cam); flyGoal.t = 0; }
};
window.__cam = () => ({ pos: camera.position.toArray(), tgt: controls.target.toArray(), aspect: camera.aspect, fly: flyGoal.t });
window.__shot =() => renderer.domElement.toDataURL('image/png');
window.__ready = true;
