/* =========================================================
   body.js — 해부학적 인체 메쉬 생성기
   구·원기둥을 붙인 마네킹 대신, 높이별 단면(로프팅)으로
   이어진 연속 표면 + 본(Bone) 스키닝으로 관절이 끊기지 않게 만든다.
   ========================================================= */
import * as THREE from 'three';

const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const gauss = (x, s) => Math.exp(-(x * x) / (2 * s * s));
const mix = (a, b, t) => a + (b - a) * t;

/* ---------- 본 인덱스 ---------- */
export const B = {
  hips: 0, spine: 1, chest: 2, neck: 3, head: 4,
  upL: 5, foreL: 6, handL: 7,
  upR: 8, foreR: 9, handR: 10,
  thighL: 11, shinL: 12, footL: 13,
  thighR: 14, shinR: 15, footR: 16,
};

/* ---------- 인바디 수치 → 해부 파라미터 ---------- */
export function deriveParams(r) {
  const fat = clamp((r.bodyFatPct - 15) / (32 - 15), 0, 1.3);
  const mus = clamp((r.skeletalMuscle - 33) / (37 - 33), 0, 1.2);
  const wN = clamp(((r.waistRatio != null ? r.waistRatio : 0.9) - 0.84) / (1.04 - 0.84), 0, 1.3);
  const vN = clamp(((r.visceralFat != null ? r.visceralFat : 9) - 6) / (13 - 6), 0, 1.3);
  return {
    fat, mus, wN, vN,
    shoulderX: 0.170 + 0.020 * mus + 0.004 * fat,
    chestW: 0.164 + 0.016 * mus + 0.004 * fat,
    chestD: 0.100 + 0.014 * mus + 0.010 * fat,
    waistW: 0.146 + 0.018 * wN + 0.010 * fat,
    waistD: 0.090 + 0.008 * wN,
    belly: 0.020 * fat + 0.014 * vN,
    hipW: 0.158 + 0.014 * fat + 0.004 * mus,
    hipD: 0.100 + 0.008 * fat,
    uarmR: 0.046 + 0.011 * mus + 0.006 * fat,
    elbowR: 0.037 + 0.004 * mus + 0.003 * fat,
    farmR: 0.041 + 0.007 * mus + 0.004 * fat,
    wristR: 0.026 + 0.003 * fat,
    thighR: 0.082 + 0.017 * fat - 0.002 * mus,
    kneeR: 0.051 + 0.006 * fat + 0.003 * mus,
    calfR: 0.050 + 0.006 * fat + 0.007 * mus,
    ankleR: 0.031 + 0.003 * fat,
    neckR: 0.056 + 0.006 * fat + 0.005 * mus,
    headW: 0.079 + 0.003 * fat,
    headH: 0.115,
    headD: 0.092,
  };
}

/* ---------- 메쉬 누적기 ---------- */
class MeshAcc {
  constructor() { this.p = []; this.uv = []; this.idx = []; this.si = []; this.sw = []; }
  clear() { this.p.length = 0; this.uv.length = 0; this.idx.length = 0; this.si.length = 0; this.sw.length = 0; }
  get count() { return this.p.length / 3; }
  v(x, y, z, u, vv, w) {
    const i = this.count;
    this.p.push(x, y, z);
    this.uv.push(u, vv);
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0, b0 = 0, b1 = 0, b2 = 0, b3 = 0;
    const n = Math.min(4, w ? w.length : 0);
    for (let k = 0; k < n; k++) {
      const wi = w[k][0], si = w[k][1];
      if (k === 0) { b0 = wi; s0 = si; }
      else if (k === 1) { b1 = wi; s1 = si; }
      else if (k === 2) { b2 = wi; s2 = si; }
      else { b3 = wi; s3 = si; }
    }
    let tot = s0 + s1 + s2 + s3;
    if (tot <= 0) { b0 = B.hips; s0 = 1; tot = 1; }
    this.si.push(b0, b1, b2, b3);
    this.sw.push(s0 / tot, s1 / tot, s2 / tot, s3 / tot);
    return i;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  /* 위쪽 링 → 아래쪽 링 (바깥 방향 노멀) */
  link(rA, rB) {
    const n = rA.length;
    for (let j = 0; j < n; j++) {
      const j2 = (j + 1) % n;
      this.tri(rA[j], rB[j], rA[j2]);
      this.tri(rA[j2], rB[j], rB[j2]);
    }
  }
  cap(pole, ring, up) {
    const n = ring.length;
    for (let j = 0; j < n; j++) {
      const j2 = (j + 1) % n;
      if (up) this.tri(pole, ring[j], ring[j2]);
      else this.tri(pole, ring[j2], ring[j]);
    }
  }
}

const f0u = curve => {
  const c = curve.getPointAt(0), d = curve.getTangentAt(0).normalize();
  return frameOf(c.clone().sub(d), c.clone().add(d.clone())).u;
};
const f0v = curve => {
  const c = curve.getPointAt(0), d = curve.getTangentAt(0).normalize();
  return frameOf(c.clone().sub(d), c.clone().add(d.clone())).v;
};
const frameOf = (a, b) => {
  const d = new THREE.Vector3().subVectors(b, a).normalize();
  const ref = Math.abs(d.y) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(ref, d).normalize();
  const v = new THREE.Vector3().crossVectors(d, u).normalize();
  return { d, u, v };
};

/* ---------- 몸통 단면 키 (y 내림차순) ---------- */
const TORSO_KEYS = [
  [1.470, 0.080, 0.066, -0.008],
  [1.455, 0.106, 0.076, -0.008],
  [1.435, 0.138, 0.086, -0.006],
  [1.410, 0.163, 0.094, -0.004],
  [1.385, 0.175, 0.100, -0.002],
  [1.350, 0.179, 0.104, 0.000],
  [1.330, 0.166, 0.103, 0.000],
  [1.280, 0.160, 0.102, 0.001],
  [1.220, 0.154, 0.098, 0.002],
  [1.160, 0.149, 0.093, 0.003],
  [1.100, 0.146, 0.089, 0.004],
  [1.040, 0.146, 0.088, 0.004],
  [0.990, 0.149, 0.090, 0.003],
  [0.940, 0.154, 0.095, 0.002],
  [0.890, 0.156, 0.098, 0.001],
  [0.840, 0.151, 0.096, 0.002],
  [0.800, 0.144, 0.092, 0.003],
  [0.775, 0.137, 0.087, 0.004],
];

/* =========================================================
   Anatomy
   ========================================================= */
export class Anatomy {
  constructor(params, mats /* [body, head, shorts, hair] */, headTex) {
    this.P0 = { ...params };
    this.mats = mats;
    this.headTex = headTex || null;

    this.m = new MeshAcc();
    this.geom = new THREE.BufferGeometry();
    this._buildSkeleton();

    this.mesh = new THREE.SkinnedMesh(this.geom, mats);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;

    this.root = new THREE.Group();
    this.root.add(this.bHips);
    this.root.add(this.mesh);

    this.root.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(this.bones);
    this.mesh.bind(this.skeleton);

    this.update(params);
  }

  /* ---------------- 스켈레톤 ---------------- */
  _buildSkeleton() {
    const P = this.P0;
    const bones = [];
    const q0 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), PI);
    const Z = new THREE.Vector3(0, 0, 1);
    const mk = (parent, worldPos, worldQuat) => {
      const b = new THREE.Bone();
      if (parent) {
        parent.add(b);
        const inv = parent.userData.q.clone().invert();
        b.position.copy(worldPos).sub(parent.userData.p).applyQuaternion(inv);
        b.quaternion.copy(inv).multiply(worldQuat);
      } else {
        b.position.copy(worldPos);
        b.quaternion.copy(worldQuat);
      }
      b.userData.p = worldPos.clone();
      b.userData.q = worldQuat.clone();
      b.userData.bind = b.quaternion.clone();
      bones.push(b);
      return b;
    };
    const I = new THREE.Quaternion();

    const hips = mk(null, new THREE.Vector3(0, 0.92, 0), I);
    const spine = mk(hips, new THREE.Vector3(0, 1.00, 0), I);
    const chest = mk(spine, new THREE.Vector3(0, 1.16, 0), I);
    const neck = mk(chest, new THREE.Vector3(0, 1.44, 0), I);
    const head = mk(neck, new THREE.Vector3(0, 1.52, 0), I);

    this.joints = {};
    // 본 인덱스 순서(B)와 정확히 일치하도록: 팔 L, 팔 R, 다리 L, 다리 R
    for (const s of [-1, 1]) {
      const sh = new THREE.Vector3(s * (P.shoulderX - 0.022), 1.376, -0.004);
      const el = new THREE.Vector3(s * (P.shoulderX + 0.014), 1.096, -0.010);
      const wr = new THREE.Vector3(s * (P.shoulderX + 0.030), 0.848, 0.006);
      const ab = 0.14 * s;
      const qArm = new THREE.Quaternion().setFromAxisAngle(Z, ab).multiply(q0);
      const qFore = new THREE.Quaternion().setFromAxisAngle(Z, ab * 1.08).multiply(q0);
      const up = mk(chest, sh, qArm);
      const fore = mk(up, el, qFore);
      const hand = mk(fore, wr, qFore);
      this.joints[s] = this.joints[s] || {};
      Object.assign(this.joints[s], { sh, el, wr });
      if (s < 0) { this.bUpL = up; this.bForeL = fore; this.bHandL = hand; }
      else { this.bUpR = up; this.bForeR = fore; this.bHandR = hand; }
    }
    for (const s of [-1, 1]) {
      const hipJ = new THREE.Vector3(s * 0.088, 0.925, 0.002);
      const kn = new THREE.Vector3(s * 0.101, 0.472, 0.006);
      const an = new THREE.Vector3(s * 0.104, 0.083, -0.014);
      const legOut = 0.035 * s;
      const qThigh = new THREE.Quaternion().setFromAxisAngle(Z, legOut).multiply(q0);
      const qShin = new THREE.Quaternion().setFromAxisAngle(Z, legOut * 1.25).multiply(q0);
      const th = mk(hips, hipJ, qThigh);
      const shin = mk(th, kn, qShin);
      const foot = mk(shin, an, qShin);
      Object.assign(this.joints[s], { hipJ, kn, an });
      if (s < 0) { this.bThL = th; this.bShinL = shin; this.bFootL = foot; }
      else { this.bThR = th; this.bShinR = shin; this.bFootR = foot; }
    }

    this.bones = bones;
    this.bHips = hips; this.bSpine = spine; this.bChest = chest; this.bNeck = neck; this.bHead = head;
  }

  /* ---------------- 메쉬 갱신 ---------------- */
  update(params) {
    this.P = params || this.P0;
    const m = this.m;
    m.clear();

    this._torso();
    this._neck();
    this._arms();
    this._legs();
    const bodyEnd = m.idx.length;

    this._head();
    this._ears();
    const headEnd = m.idx.length;

    this._shorts();
    const shortsEnd = m.idx.length;

    this._hair();
    const hairEnd = m.idx.length;

    const geo = this.geom;
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(m.p), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(m.uv), 2));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(m.si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(m.sw, 4));
    geo.setIndex(m.idx);
    geo.clearGroups();
    geo.addGroup(0, bodyEnd, 0);
    geo.addGroup(bodyEnd, headEnd - bodyEnd, 1);
    geo.addGroup(headEnd, shortsEnd - headEnd, 2);
    geo.addGroup(shortsEnd, hairEnd - shortsEnd, 3);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  }

  /* --- 몸통 --- */
  _torsoProfile(y) {
    const P = this.P;
    const K = TORSO_KEYS;
    let i = 0;
    while (i < K.length - 2 && y < K[i + 1][0]) i++;
    const A = K[i], Bk = K[i + 1];
    const t = clamp((A[0] - y) / (A[0] - Bk[0] || 1), 0, 1);
    const e = t * t * (3 - 2 * t);
    let a = mix(A[1], Bk[1], e);
    let b = mix(A[2], Bk[2], e);
    let zc = mix(A[3], Bk[3], e);
    const f = P.fat, mu = P.mus;
    a += 0.026 * f * gauss(y - 1.00, 0.075);
    a += 0.010 * P.wN * gauss(y - 1.03, 0.10);
    a += 0.020 * mu * gauss(y - 1.30, 0.085);
    a += 0.010 * mu * gauss(y - 1.20, 0.09);
    a *= (0.55 + 0.45 * (P.chestW / 0.164));   // 가슴 폭 파라미터 반영
    b += 0.028 * f * gauss(y - 1.005, 0.065);
    b += 0.016 * P.vN * gauss(y - 1.02, 0.06);
    b += 0.014 * mu * gauss(y - 1.29, 0.075);
    b *= (0.6 + 0.4 * (P.chestD / 0.100));
    zc += P.belly * gauss(y - 1.01, 0.075);
    return { a, b, zc };
  }

  _torsoMod(A, y) {
    const P = this.P, mu = P.mus, f = P.fat;
    let d = 0;
    d += 0.016 * mu * gauss(y - 1.298, 0.05) * gauss(A - 0.55, 0.38);     // 대흉근
    d -= 0.008 * gauss(A, 0.11) * gauss(y - 1.30, 0.055);                 // 명치
    const ab = 0.006 * clamp(mu - f * 0.7, 0, 1.2);
    d += ab * gauss(A - 0.12, 0.26) * gauss(y - 1.13, 0.05) * (0.55 + 0.45 * Math.cos((y - 1.02) * 62));
    d += 0.018 * mu * gauss(A - 2.25, 0.38) * gauss(y - 1.27, 0.085);     // 광배근
    d += 0.012 * mu * gauss(A - PI, 0.85) * gauss(y - 1.40, 0.05);        // 승모근
    d -= 0.006 * gauss(A - 2.72, 0.16) * gauss(y - 1.30, 0.07);           // 견갑골 홈
    d += 0.012 * f * gauss(A - 1.42, 0.42) * gauss(y - 1.01, 0.07);       // 옆구리
    d += 0.006 * f * gauss(A - PI, 0.95) * gauss(y - 0.97, 0.08);
    d += 0.014 * f * gauss(A, 0.75) * gauss(y - 0.98, 0.06);              // 아랫배
    return d;
  }

  _torsoWeights(y) {
    const s1 = smoothstep(0.93, 1.06, y);
    const s2 = smoothstep(1.12, 1.30, y);
    const s3 = smoothstep(1.40, 1.50, y);
    const w = [];
    if (1 - s1 > 0.001) w.push([B.hips, 1 - s1]);
    if (s1 * (1 - s2) > 0.001) w.push([B.spine, s1 * (1 - s2)]);
    if (s2 * (1 - s3) > 0.001) w.push([B.chest, s2 * (1 - s3)]);
    if (s3 > 0.001) w.push([B.neck, s3]);
    return w;
  }

  _torso() {
    const m = this.m;
    const ROWS = 86, SEG = 64;
    const yTop = 1.470, yBot = 0.775;
    const rings = [];
    for (let i = 0; i < ROWS; i++) {
      const t = i / (ROWS - 1);
      const y = mix(yTop, yBot, t);
      const { a, b, zc } = this._torsoProfile(y);
      const ring = [];
      for (let j = 0; j < SEG; j++) {
        const ang = (j / SEG) * TAU;
        const sa = Math.sin(ang), ca = Math.cos(ang);
        let r = 1 / Math.sqrt((sa / a) ** 2 + (ca / b) ** 2);
        r += this._torsoMod(Math.abs(ang > PI ? ang - TAU : ang), y);
        ring.push(m.v(sa * r, y, ca * r + zc, (j / SEG + 0.5) % 1, (y - 0.7) * 0.9, this._torsoWeights(y)));
      }
      rings.push(ring);
    }
    for (let i = 0; i < rings.length - 1; i++) m.link(rings[i], rings[i + 1]);
    const pr = this._torsoProfile(yTop);
    m.cap(m.v(0, yTop, pr.zc, 0.5, 1, this._torsoWeights(yTop)), rings[0], true);
    const pb = this._torsoProfile(yBot);
    m.cap(m.v(0, yBot, pb.zc, 0.5, 0, this._torsoWeights(yBot)), rings[rings.length - 1], false);
  }

  /* --- 목 --- */
  _neck() {
    const m = this.m, P = this.P;
    const ROWS = 18, SEG = 44;
    const rings = [];
    for (let i = 0; i < ROWS; i++) {
      const t = i / (ROWS - 1);
      const y = mix(1.552, 1.392, t);
      let rr = mix(P.neckR * 0.86, P.neckR * 1.18, smoothstep(1.39, 1.52, y));
      rr *= 1 - 0.42 * smoothstep(1.500, 1.552, y);   // 턱 밑으로 접어 넣기
      const zc = 0.004 - 0.020 * smoothstep(1.40, 1.545, y);
      const ring = [];
      for (let j = 0; j < SEG; j++) {
        const ang = (j / SEG) * TAU;
        const sa = Math.sin(ang), ca = Math.cos(ang);
        const rx = rr;
        const rz = rr * 1.05;
        const wh = smoothstep(1.460, 1.535, y);
        const w = [[B.neck, 1 - wh * 0.8], [B.head, wh * 0.8]];
        ring.push(m.v(sa * rx, y, ca * rz + zc, j / SEG, t, w));
      }
      rings.push(ring);
    }
    for (let i = 0; i < rings.length - 1; i++) m.link(rings[i], rings[i + 1]);
    m.cap(m.v(0, 1.552, 0.004 - 0.020, 0.5, 0, [[B.neck, 1]]), rings[0], true);
  }

  /* --- 머리 --- */
  _headC() { return { y: 1.626, z: 0.004 }; }

  _headShape(u, v, sa, ca) {
    const P = this.P, c = this._headC();
    const hw = P.headW, hh = P.headH, hd = P.headD;
    const rv = Math.sqrt(clamp(1 - Math.pow(v * 2 - 1, 2), 0.0001, 1));
    let sx = hw * rv, sz = hd * rv;
    const y = c.y + (v - 0.5) * 2 * hh;

    const jaw = smoothstep(0.34, 0.0, v);
    sx *= 1 - 0.15 * jaw;
    sz *= 1 - 0.05 * jaw;
    sx *= 1 + 0.05 * gauss(v - 0.40, 0.08);
    const back = clamp(-ca, 0, 1);
    sz *= 1 + 0.05 * back * smoothstep(0.15, 0.55, v);
    const front = clamp(ca, 0, 1);

    let x = sa * sx;
    let z = ca * sz;
    z -= 0.008 * front * smoothstep(0.08, 0.55, v) * smoothstep(0.97, 0.6, v);
    z += 0.014 * front * gauss(v - 0.10, 0.09);                 // 턱
    const du = Math.min(Math.abs(u - 0.25), 1 - Math.abs(u - 0.25));
    z += 0.022 * front * gauss(du, 0.030) * gauss(v - 0.40, 0.05);  // 코
    z -= 0.005 * front * gauss(v - 0.52, 0.035) * gauss(du, 0.13);  // 눈두덩
    z += 0.005 * front * gauss(v - 0.68, 0.08);                     // 이마
    x += 0.004 * Math.sign(x || 1) * gauss(du - 0.16, 0.08) * gauss(v - 0.33, 0.08);
    return { x, y, z: z + c.z };
  }

  _head() {
    const m = this.m;
    const c = this._headC(), P = this.P;
    const ROWS = 46, SEG = 64;
    const yBot = c.y - P.headH, yTop = c.y + P.headH;
    const rings = [];
    for (let i = 0; i < ROWS; i++) {
      const t = i / (ROWS - 1);
      const v = 1 - t;
      const ring = [];
      for (let j = 0; j < SEG; j++) {
        const u = j / SEG;
        const ang = (u - 0.25) * TAU;
        const p = this._headShape(u, clamp(v, 0.002, 0.998), Math.sin(ang), Math.cos(ang));
        const uTex = (ang / TAU + 0.5 + 1) % 1;
        ring.push(m.v(p.x, p.y, p.z, uTex, v, [[B.head, 1]]));
      }
      rings.push(ring);
    }
    for (let i = 0; i < rings.length - 1; i++) m.link(rings[i], rings[i + 1]);
    m.cap(m.v(0, yTop + 0.002, c.z, 0.5, 1, [[B.head, 1]]), rings[0], true);
    m.cap(m.v(0, yBot - 0.004, c.z + 0.004, 0.5, 0, [[B.head, 1]]), rings[rings.length - 1], false);
  }

  _ears() {
    const m = this.m, P = this.P, c = this._headC();
    for (const s of [-1, 1]) {
      const ROWS = 10, SEG = 14;
      const cx = s * P.headW * 0.96, cy = c.y + 0.002, cz = -0.008;
      const rings = [];
      for (let i = 0; i < ROWS; i++) {
        const t = i / (ROWS - 1);
        const a = t * PI;
        const rr = Math.sin(a);
        const ox = s * (0.006 + 0.010 * Math.sin(a));
        const ring = [];
        for (let j = 0; j < SEG; j++) {
          const ang = (j / SEG) * TAU;
          ring.push(m.v(cx + ox * (0.35 + 0.65 * rr), cy + 0.030 * rr * Math.cos(ang),
            cz + 0.019 * rr * Math.sin(ang) - 0.004, j / SEG, t, [[B.head, 1]]));
        }
        rings.push(ring);
      }
      for (let i = 0; i < rings.length - 1; i++) m.link(rings[i], rings[i + 1]);
    }
  }

  /* --- 머리카락 --- */
  _hair() {
    const m = this.m, P = this.P, c = this._headC();
    const ROWS = 24, SEG = 96;
    const edge = u => {
      const du = Math.min(Math.abs(u - 0.25), 1 - Math.abs(u - 0.25));
      // du 0 = 이마 앞, du 0.5 = 뒤통수
      const side = u < 0.5 ? u : u - 1;                        // -0.25(좌) ~ +0.25(우)
      let e = 0.285 + 0.435 * smoothstep(0.32, 0.05, du);
      e += 0.035 * (0.25 - Math.abs(side) * 2) * smoothstep(0.16, 0.02, du); // 가르마 쪽 살짝 올림
      e -= 0.055 * gauss(du - 0.185, 0.055);                   // 귀 위 오목
      e += 0.022 * Math.sin(du * 42 + 0.6) * smoothstep(0.26, 0.03, du);
      e -= 0.030 * gauss(du - 0.045, 0.045);                   // 이마 한쪽 결
      return clamp(e, 0.24, 0.78);
    };
    const rings = [];
    for (let i = 0; i < ROWS; i++) {
      const k = i / (ROWS - 1);
      const ring = [];
      for (let j = 0; j < SEG; j++) {
        const u = j / SEG;
        const vE = edge(u);
        const v = mix(0.985, vE, Math.pow(k, 0.92));
        const ang = (u - 0.25) * TAU;
        const base = this._headShape(u, clamp(v, 0.002, 0.995), Math.sin(ang), Math.cos(ang));
        const du = Math.min(Math.abs(u - 0.25), 1 - Math.abs(u - 0.25));
        let th = 0.008 + 0.009 * smoothstep(0.55, 0.95, v);
        th += 0.004 * gauss(du - 0.20, 0.10);
        // 머리카락 결(가닥) — 굴곡으로 결을 표현
        th += 0.0026 * Math.sin(u * TAU * 14 + v * 5.5) * smoothstep(0.15, 0.5, v);
        th += 0.0018 * Math.sin(u * TAU * 7 - v * 9) * smoothstep(0.2, 0.6, v);
        th *= mix(1.0, 0.22, smoothstep(0.74, 1.0, k));
        const nx = base.x, ny = base.y - c.y, nz = base.z - c.z;
        const len = Math.hypot(nx, ny, nz) || 1;
        const uTex = (ang / TAU + 0.5 + 1) % 1;
        ring.push(m.v(base.x + (nx / len) * th * 1.5, base.y + (ny / len) * th,
          base.z + (nz / len) * th * 1.5, uTex, v, [[B.head, 1]]));
      }
      rings.push(ring);
    }
    for (let i = 0; i < rings.length - 1; i++) m.link(rings[i], rings[i + 1]);
    // 정수리 마감
    m.cap(m.v(0, c.y + P.headH + 0.014, c.z, 0.5, 1, [[B.head, 1]]), rings[0], true);
    // 가장자리를 머리에 붙여 마감
    const inner = [];
    for (let j = 0; j < SEG; j++) {
      const u = j / SEG;
      const vE = edge(u);
      const ang = (u - 0.25) * TAU;
      const p = this._headShape(u, vE - 0.006, Math.sin(ang), Math.cos(ang));
      const uTex = (ang / TAU + 0.5 + 1) % 1;
      inner.push(m.v(p.x, p.y, p.z, uTex, vE, [[B.head, 1]]));
    }
    m.link(rings[rings.length - 1], inner);
  }

  /* --- 팔 --- */
  _arms() { for (const s of [-1, 1]) this._arm(s); }

  _arm(s) {
    const P = this.P;
    const J = this.joints[s];
    const upB = B.upL + (s > 0 ? 3 : 0);
    const foreB = B.foreL + (s > 0 ? 3 : 0);
    const elR = P.elbowR, wrR = P.wristR;

    const p0 = J.sh.clone().add(new THREE.Vector3(0, -0.030, 0));
    const p1 = J.el;
    const p2 = J.wr;
    this._curveLimb({
      pts: [p0.clone().add(new THREE.Vector3(0, 0.010, 0)), p0, p1, p2],
      rows: 64, seg: 40,
      radius: t => {
        // t: 어깨 위 → 손목
        let r = 0.045 + (P.uarmR * 1.24 - 0.045) * smoothstep(0.0, 0.13, t);
        r = mix(r, elR * 0.98, smoothstep(0.18, 0.50, t));
        r += 0.007 * gauss(t - 0.30, 0.07) * (0.4 + P.mus * 0.8);      // 이두근
        r += 0.008 * gauss(t - 0.575, 0.055) * (0.5 + P.mus * 0.6);    // 전완 근복
        r = mix(r, wrR, smoothstep(0.78, 1.0, t));
        return r;
      },
      oval: t => ({ a: 1.0, b: mix(1.02, 0.80, smoothstep(0.3, 1.0, t)) }),
      weights: t => {
        const s1 = smoothstep(0.0, 0.09, t);            // chest → upperArm
        const s2 = smoothstep(0.46, 0.60, t);           // upperArm → forearm
        const w = [];
        const chestW = (1 - s1) * 0.35;
        const upW = s1 * (1 - s2);
        const foreW = s1 * s2;
        if (chestW > 0.01) w.push([B.chest, chestW]);
        if (upW > 0.01) w.push([upB, upW]);
        if (foreW > 0.01) w.push([foreB, foreW]);
        return w;
      },
      capTop: true, capBot: true,
    });

    this._hand(s);
  }

  _hand(s) {
    const m = this.m, P = this.P;
    const J = this.joints[s];
    const dir = new THREE.Vector3().subVectors(J.wr, J.el).normalize();
    const f = frameOf(J.el, J.wr);
    const bone = B.handL + (s > 0 ? 3 : 0);
    const pt = (t, a, b) => J.wr.clone().addScaledVector(dir, t).addScaledVector(f.u, a).addScaledVector(f.v, b);

    const rows = 16, seg = 24;
    const rings = [];
    for (let i = 0; i < rows; i++) {
      const t = i / (rows - 1);
      const w = mix(P.wristR * 1.08, 0.040, smoothstep(0, 0.42, t)) * mix(1, 0.90, smoothstep(0.55, 1, t));
      const th = mix(P.wristR * 0.92, 0.017, smoothstep(0, 0.45, t));
      const ring = [];
      for (let j = 0; j < seg; j++) {
        const ang = (j / seg) * TAU;
        const sa = Math.sin(ang), ca = Math.cos(ang);
        const k = 2.7;
        const sx = Math.sign(sa || 1) * Math.pow(Math.abs(sa), 2 / k) * w;
        const sz = Math.sign(ca || 1) * Math.pow(Math.abs(ca), 2 / k) * th;
        const p = pt(t * 0.100, sx, sz);
        ring.push(m.v(p.x, p.y, p.z, j / seg, t, [[bone, 1]]));
      }
      rings.push(ring);
    }
    for (let i = 0; i < rings.length - 1; i++) m.link(rings[i], rings[i + 1]);
    const a0 = pt(0, 0, 0), a1 = pt(0.100, 0, 0);
    m.cap(m.v(a0.x, a0.y, a0.z, 0.5, 0, [[bone, 1]]), rings[0], true);
    m.cap(m.v(a1.x, a1.y, a1.z, 0.5, 1, [[bone, 1]]), rings[rings.length - 1], false);

    const fingers = [
      { a: 0.0265, len: 0.066, r: 0.0094 },
      { a: 0.0085, len: 0.074, r: 0.0098 },
      { a: -0.0095, len: 0.070, r: 0.0094 },
      { a: -0.0265, len: 0.055, r: 0.0084 },
    ];
    for (const fg of fingers) {
      const p0 = pt(0.092, fg.a * -s, 0.0);
      const d2 = new THREE.Vector3().addScaledVector(dir, 1).addScaledVector(f.v, -0.20).normalize();
      this._miniTube(p0, d2, fg.len, fg.r, bone);
    }
    const th0 = pt(0.028, 0.033 * -s, 0.004);
    const thDir = new THREE.Vector3().addScaledVector(dir, 0.90).addScaledVector(f.u, 0.42 * -s).addScaledVector(f.v, 0.10).normalize();
    this._miniTube(th0, thDir, 0.058, 0.0118, bone);
  }

  _miniTube(from, dirv, len, r0, bone) {
    const m = this.m;
    const rows = 8, seg = 12;
    const f2 = frameOf(new THREE.Vector3(), dirv);
    const rings = [];
    for (let i = 0; i < rows; i++) {
      const t = i / (rows - 1);
      const rr = r0 * (1 - 0.35 * t * t);
      const c = from.clone().addScaledVector(dirv, len * t);
      const ring = [];
      for (let j = 0; j < seg; j++) {
        const ang = (j / seg) * TAU;
        const p = c.clone().addScaledVector(f2.u, Math.cos(ang) * rr).addScaledVector(f2.v, Math.sin(ang) * rr);
        ring.push(m.v(p.x, p.y, p.z, j / seg, t, [[bone, 1]]));
      }
      rings.push(ring);
    }
    for (let i = 0; i < rings.length - 1; i++) m.link(rings[i], rings[i + 1]);
    const tipC = from.clone().addScaledVector(dirv, len + r0 * 0.55);
    m.cap(m.v(tipC.x, tipC.y, tipC.z, 0.5, 1, [[bone, 1]]), rings[rings.length - 1], false);
  }

  /* --- 다리 --- */
  _legs() { for (const s of [-1, 1]) this._leg(s); }

  _leg(s) {
    const P = this.P;
    const J = this.joints[s];
    const thB = B.thighL + (s > 0 ? 3 : 0);
    const shB = B.shinL + (s > 0 ? 3 : 0);

    const p0 = J.hipJ.clone().add(new THREE.Vector3(0, 0.05, 0));
    this._curveLimb({
      pts: [p0.clone().add(new THREE.Vector3(0, 0.02, 0)), p0, J.kn, J.an],
      rows: 76, seg: 44,
      radius: t => {
        let r = mix(P.thighR * 0.86, P.thighR * 1.02, smoothstep(0.02, 0.16, t));
        r = mix(r, P.thighR * 0.92, smoothstep(0.30, 0.45, t));
        r = mix(r, P.kneeR * 0.98, smoothstep(0.46, 0.56, t));
        r += 0.007 * gauss(t - 0.30, 0.08) * (0.4 + P.mus * 0.7);       // 대퇴사두근
        r += 0.012 * gauss(t - 0.63, 0.05) * (0.5 + P.mus * 0.6);       // 장딴지
        r = mix(r, P.ankleR, smoothstep(0.86, 1.0, t));
        return r;
      },
      oval: t => ({ a: 1.0, b: mix(1.06, 0.86, smoothstep(0.2, 1.0, t)) }),
      weights: t => {
        const s1 = smoothstep(0.0, 0.14, t);
        const s2 = smoothstep(0.52, 0.62, t);
        const hipsW = (1 - s1) * 0.5;
        const thW = s1 * (1 - s2);
        const shW = s1 * s2;
        const w = [];
        if (hipsW > 0.01) w.push([B.hips, hipsW]);
        if (thW > 0.01) w.push([thB, thW]);
        if (shW > 0.01) w.push([shB, shW]);
        return w;
      },
      capTop: true, capBot: true,
    });

    this._foot(s);
  }

  _foot(s) {
    const m = this.m;
    const J = this.joints[s];
    const an = J.an;
    const bone = B.footL + (s > 0 ? 3 : 0);
    const x0 = an.x;
    const rows = 24, seg = 30;
    const Z0 = -0.078, Z1 = 0.172;
    const prof = [
      [-0.078, 0.023, 0.036], [-0.055, 0.032, 0.058], [-0.025, 0.038, 0.078],
      [0.006, 0.042, 0.084], [0.040, 0.045, 0.067], [0.076, 0.047, 0.050],
      [0.110, 0.047, 0.039], [0.146, 0.043, 0.030], [0.172, 0.032, 0.021],
    ];
    const sample = z => {
      let i = 0;
      while (i < prof.length - 2 && z > prof[i + 1][0]) i++;
      const A = prof[i], Bk = prof[i + 1];
      const t = clamp((z - A[0]) / (Bk[0] - A[0] || 1), 0, 1);
      const e = t * t * (3 - 2 * t);
      return { w: mix(A[1], Bk[1], e), h: mix(A[2], Bk[2], e) };
    };
    const rings = [];
    for (let i = 0; i < rows; i++) {
      const t = i / (rows - 1);
      const z = mix(Z0, Z1, t);
      const { w, h } = sample(z);
      const ring = [];
      for (let j = 0; j < seg; j++) {
        const ang = (j / seg) * TAU;
        const sa = Math.sin(ang), ca = Math.cos(ang);
        const x = x0 + sa * w;
        let y = h * 0.5 + ca * h * 0.5;
        if (y < 0.005) y = 0.005;
        ring.push(m.v(x, y, an.z + z, j / seg, t, [[bone, 1]]));
      }
      rings.push(ring);
    }
    for (let i = 0; i < rings.length - 1; i++) m.link(rings[i], rings[i + 1]);
    m.cap(m.v(x0, 0.018, an.z + Z0 - 0.008, 0.5, 0, [[bone, 1]]), rings[0], true);
    m.cap(m.v(x0, 0.011, an.z + Z1 + 0.004, 0.5, 1, [[bone, 1]]), rings[rings.length - 1], false);
  }

  _curveLimb({ pts, rows, seg, radius, oval, weights, capTop, capBot }) {
    const m = this.m;
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
    curve.arcLengthDivisions = 400;
    const rings = [];
    for (let i = 0; i < rows; i++) {
      const t = i / (rows - 1);
      const c = curve.getPointAt(t);
      const d = curve.getTangentAt(t).normalize();
      const f = frameOf(c.clone().sub(d), c.clone().add(d.clone()));
      const rr = radius(t);
      const ov = oval ? oval(t) : { a: 1, b: 1 };
      const ring = [];
      for (let j = 0; j < seg; j++) {
        const ang = (j / seg) * TAU;
        const p = c.clone().addScaledVector(f.u, Math.sin(ang) * rr * ov.a)
          .addScaledVector(f.v, Math.cos(ang) * rr * ov.b);
        ring.push(m.v(p.x, p.y, p.z, j / seg, t, weights(t)));
      }
      rings.push(ring);
    }
    for (let i = 0; i < rings.length - 1; i++) m.link(rings[i], rings[i + 1]);
    if (capTop) {
      const c0 = curve.getPointAt(0), d0 = curve.getTangentAt(0).normalize();
      const K = 4, r0 = radius(0);
      const extra = [];
      for (let k = K; k >= 1; k--) {
        const phi = (k / K) * (PI / 2);
        const cc = c0.clone().addScaledVector(d0, -r0 * 0.9 * Math.sin(phi));
        extra.push([cc, r0 * Math.cos(phi), phi]);
      }
      const rings2 = extra.map(([cc, rr], idx) => {
        const ring = [];
        for (let j = 0; j < seg; j++) {
          const ang = (j / seg) * TAU;
          const p = cc.clone().addScaledVector(f0u(curve), Math.sin(ang) * rr).addScaledVector(f0v(curve), Math.cos(ang) * rr);
          ring.push(m.v(p.x, p.y, p.z, j / seg, 0, weights(0)));
        }
        return ring;
      });
      // 링 순서: [가장 좁은 끝 …] → 본체, 위에서부터 연결
      rings2.push(rings[0]);
      for (let i = 0; i < rings2.length - 1; i++) m.link(rings2[i], rings2[i + 1]);
      const tip = c0.clone().addScaledVector(d0, -r0 * 0.9);
      m.cap(m.v(tip.x, tip.y, tip.z, 0.5, 0, weights(0)), rings2[0], true);
    }
    if (capBot) {
      const c1 = curve.getPointAt(1), d1 = curve.getTangentAt(1).normalize();
      const r1 = radius(1);
      const f1 = frameOf(c1.clone().sub(d1), c1.clone().add(d1.clone()));
      const K = 4;
      let prev = rings[rings.length - 1];
      for (let k = 1; k <= K; k++) {
        const phi = (k / K) * (PI / 2);
        const cc = c1.clone().addScaledVector(d1, r1 * 0.9 * Math.sin(phi));
        const rr = r1 * Math.cos(phi);
        const ring = [];
        for (let j = 0; j < seg; j++) {
          const ang = (j / seg) * TAU;
          const p = cc.clone().addScaledVector(f1.u, Math.sin(ang) * rr).addScaledVector(f1.v, Math.cos(ang) * rr);
          ring.push(m.v(p.x, p.y, p.z, j / seg, 1, weights(1)));
        }
        m.link(prev, ring);
        prev = ring;
      }
      const tip = c1.clone().addScaledVector(d1, r1 * 0.9);
      m.cap(m.v(tip.x, tip.y, tip.z, 0.5, 1, weights(1)), prev, false);
    }
  }

  /* --- 범용 튜브 (양 끝 둥근 마감) --- */
  _tube({ A, B, rows, seg, radius, oval, weights, capTop, capBot, zOff }) {
    const m = this.m;
    const f = frameOf(A, B);
    const rings = [];
    const push = (c, rr, ov, t, w) => {
      const ring = [];
      for (let j = 0; j < seg; j++) {
        const ang = (j / seg) * TAU;
        const p = c.clone().addScaledVector(f.u, Math.sin(ang) * rr * ov.a)
          .addScaledVector(f.v, Math.cos(ang) * rr * ov.b);
        if (zOff) p.z += zOff(t);
        ring.push(m.v(p.x, p.y, p.z, j / seg, t, w));
      }
      return ring;
    };
    // 위쪽 돔
    if (capTop) {
      const r0 = radius(0);
      const K = 4;
      for (let k = K; k >= 1; k--) {
        const phi = (k / K) * (PI / 2);
        const c = A.clone().addScaledVector(f.d, -r0 * 0.85 * Math.sin(phi));
        rings.push(push(c, r0 * Math.cos(phi), oval ? oval(0) : { a: 1, b: 1 }, 0, weights(0)));
      }
    }
    for (let i = 0; i < rows; i++) {
      const t = i / (rows - 1);
      rings.push(push(A.clone().lerp(B, t), radius(t), oval ? oval(t) : { a: 1, b: 1 }, t, weights(t)));
    }
    if (capBot) {
      const r1 = radius(1);
      const K = 4;
      for (let k = 1; k <= K; k++) {
        const phi = (k / K) * (PI / 2);
        const c = B.clone().addScaledVector(f.d, r1 * 0.85 * Math.sin(phi));
        rings.push(push(c, r1 * Math.cos(phi), oval ? oval(1) : { a: 1, b: 1 }, 1, weights(1)));
      }
    }
    for (let i = 0; i < rings.length - 1; i++) m.link(rings[i], rings[i + 1]);
    if (capTop) {
      const c = A.clone().addScaledVector(f.d, -radius(0) * 0.85);
      m.cap(m.v(c.x, c.y, c.z, 0.5, 0, weights(0)), rings[0], true);
    }
    if (capBot) {
      const c = B.clone().addScaledVector(f.d, radius(1) * 0.85);
      m.cap(m.v(c.x, c.y, c.z, 0.5, 1, weights(1)), rings[rings.length - 1], false);
    }
  }

  /* --- 반바지(컴프레션 쇼츠) --- */
  _shorts() {
    const m = this.m, P = this.P;
    const ROWS = 28, SEG = 72;
    const yTop = 1.012, yBot = 0.862;
    const rings = [];
    for (let i = 0; i < ROWS; i++) {
      const t = i / (ROWS - 1);
      const y = mix(yTop, yBot, t);
      const { a, b, zc } = this._torsoProfile(y);
      const pad = 0.009 + 0.008 * smoothstep(0.35, 1.0, t);
      const tt = clamp((0.925 - y) / (0.925 - 0.472), 0, 1);
      const cx = 0.088 + 0.014 * tt;
      const cz = 0.002;
      const R = P.thighR * 1.10 + pad;
      const snug = i === 0 ? 0.985 : 1;
      const ring = [];
      for (let j = 0; j < SEG; j++) {
        const ang = (j / SEG) * TAU;
        const dx = Math.sin(ang), dz = Math.cos(ang);
        const aa = Math.abs(ang > PI ? ang - TAU : ang);
        // 몸통 표면 + 여유
        let r = 1 / Math.sqrt((dx / a) ** 2 + (dz / b) ** 2) + this._torsoMod(aa, y) + pad;
        // 허벅지 두 원과의 합집합
        for (const s of [-1, 1]) {
          const ox = s * cx, oz = cz - zc;
          const cd = ox * dx + oz * dz;
          const perp2 = (ox * ox + oz * oz) - cd * cd;
          const disc = R * R - perp2;
          if (disc > 0) r = Math.max(r, cd + Math.sqrt(disc));
        }
        ring.push(m.v(dx * r * snug, y, dz * r * snug + zc, j / SEG, t,
          [[B.hips, 0.9], [B.spine, 0.1]]));
      }
      rings.push(ring);
    }
    for (let i = 0; i < rings.length - 1; i++) m.link(rings[i], rings[i + 1]);
    // 밑단 마감(안쪽으로 살짝 접어 넣기)
    const pr = this._torsoProfile(yBot);
    const innerRing = [];
    for (let j = 0; j < SEG; j++) {
      const ang = (j / SEG) * TAU;
      const dx = Math.sin(ang), dz = Math.cos(ang);
      const r = (1 / Math.sqrt((dx / pr.a) ** 2 + (dz / pr.b) ** 2)) * 0.94;
      innerRing.push(m.v(dx * r, yBot - 0.012, dz * r + pr.zc, j / SEG, 1, [[B.hips, 1]]));
    }
    m.link(rings[rings.length - 1], innerRing);

    // 다리 밑단
    for (const s of [-1, 1]) {
      const thB = B.thighL + (s > 0 ? 3 : 0);
      const rows2 = 16, seg2 = 48;
      const rr = [];
      for (let i = 0; i < rows2; i++) {
        const t = i / (rows2 - 1);
        const y = mix(0.878, 0.700, t);
        const tt = clamp((0.925 - y) / (0.925 - 0.472), 0, 1);
        const cx = 0.088 + 0.014 * tt;
        const cz = 0.002;
        const base = P.thighR * mix(1.10, 1.01, smoothstep(0.0, 1.0, t));
        const rad = base + mix(0.021, 0.005, smoothstep(0.70, 1.0, t));
        const ring = [];
        for (let j = 0; j < seg2; j++) {
          const ang = (j / seg2) * TAU;
          const sa = Math.sin(ang), ca = Math.cos(ang);
          ring.push(m.v(s * cx + sa * rad, y, cz + ca * rad * 0.99, j / seg2, t,
            i === 0 ? [[B.hips, 0.55], [thB, 0.45]] : [[B.hips, 0.18], [thB, 0.82]]));
        }
        rr.push(ring);
      }
      for (let i = 0; i < rr.length - 1; i++) m.link(rr[i], rr[i + 1]);
    }
  }

  /* --- 포즈 --- */
  setPose(P) {
    const setR = (bone, x, y, z) => {
      if (!bone) return;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(x || 0, y || 0, z || 0, 'XYZ'));
      bone.quaternion.copy(bone.userData.bind).multiply(q);
    };
    setR(this.bHips, P.hipsX, P.hipsY, 0);
    setR(this.bSpine, P.spineX, P.spineY, 0);
    setR(this.bChest, P.chestX, P.chestY, 0);
    setR(this.bNeck, P.neckX, P.neckY, 0);
    setR(this.bHead, P.headX, P.headY, 0);

    // 팔: 로컬 Z축 회전 = 옆으로 벌리기(양수=벌림)
    setR(this.bUpL, P.armLX || 0, 0, (P.armLZ || 0));
    setR(this.bUpR, P.armRX || 0, 0, -(P.armRZ || 0));
    setR(this.bForeL, P.elbLX || 0, 0, 0);
    setR(this.bForeR, P.elbRX || 0, 0, 0);
    setR(this.bHandL, P.handLX || 0, 0, 0);
    setR(this.bHandR, P.handRX || 0, 0, 0);

    setR(this.bThL, P.thighLX || 0, 0, (P.thighLZ || 0));
    setR(this.bThR, P.thighRX || 0, 0, -(P.thighRZ || 0));
    setR(this.bShinL, P.kneeLX || 0, 0, 0);
    setR(this.bShinR, P.kneeRX || 0, 0, 0);
    setR(this.bFootL, P.footLX || 0, 0, 0);
    setR(this.bFootR, P.footRX || 0, 0, 0);

    const br = P.breath || 0;
    this.bChest.scale.setScalar(1 + br * 0.010);
    this.bSpine.scale.set(1 + br * 0.006, 1, 1 + br * 0.008);
  }
}

/* =========================================================
   텍스처 — 머리(얼굴 사진 합성), 피부 요철
   ========================================================= */
export const FACE = {
  U0: 0.27, U1: 0.73,        // 얼굴 텍스처가 차지하는 u 범위(가로)
  V0: 0.10, V1: 0.775,       // v 범위 (0=턱, 1=정수리)
  SX0: 0.13, SX1: 0.87,      // 사진에서 잘라 쓸 가로 범위
  SY0: 0.30, SY1: 1.0,       // 사진에서 잘라 쓸 세로 범위
  SKIN: '#e2a077',
};

export function makeHeadTexture(img) {
  const W = 1024, H = 512;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');

  // 기본 피부색
  g.fillStyle = FACE.SKIN;
  g.fillRect(0, 0, W, H);
  // 뒤통수·정수리는 머리카락색으로 어둡게
  const back = g.createLinearGradient(0, 0, W, 0);
  back.addColorStop(0.00, 'rgba(10,8,7,0.85)');
  back.addColorStop(0.13, 'rgba(10,8,7,0.85)');
  back.addColorStop(0.22, 'rgba(10,8,7,0.35)');
  back.addColorStop(0.27, 'rgba(0,0,0,0)');
  back.addColorStop(0.73, 'rgba(0,0,0,0)');
  back.addColorStop(0.78, 'rgba(10,8,7,0.35)');
  back.addColorStop(0.87, 'rgba(10,8,7,0.85)');
  back.addColorStop(1.00, 'rgba(10,8,7,0.85)');
  g.fillStyle = back;
  g.fillRect(0, 0, W, H);
  // 정수리
  const top = g.createLinearGradient(0, 0, 0, H);
  top.addColorStop(0.00, 'rgba(10,8,7,0.95)');
  top.addColorStop(0.16, 'rgba(10,8,7,0.35)');
  top.addColorStop(0.30, 'rgba(10,8,7,0)');
  g.fillStyle = top;
  g.fillRect(0, 0, W, H);

  if (!img) return new THREE.CanvasTexture(cv);

  // 얼굴 사진 전처리 (흰 테두리 제거 + 부드러운 마스크)
  const sx = Math.round(FACE.SX0 * img.width), sw = Math.round((FACE.SX1 - FACE.SX0) * img.width);
  const sy = Math.round(FACE.SY0 * img.height), sh = Math.round((FACE.SY1 - FACE.SY0) * img.height);
  const tmp = document.createElement('canvas');
  tmp.width = sw; tmp.height = sh;
  const tg = tmp.getContext('2d');
  tg.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  const id = tg.getImageData(0, 0, sw, sh);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a < 250) {
      const bright = (d[i] + d[i + 1] + d[i + 2]) / 3;
      if (bright > 190) d[i + 3] = Math.round(a * 0.15);     // 흰 후광 제거
      else if (a < 8) d[i + 3] = 0;
    }
  }
  tg.putImageData(id, 0, 0);

  // 가장자리 페더링
  const feather = document.createElement('canvas');
  feather.width = sw; feather.height = sh;
  const fg = feather.getContext('2d');
  fg.drawImage(tmp, 0, 0);
  fg.globalCompositeOperation = 'destination-in';
  const gx = fg.createLinearGradient(0, 0, sw, 0);
  gx.addColorStop(0, 'rgba(0,0,0,0)');
  gx.addColorStop(0.10, 'rgba(0,0,0,1)');
  gx.addColorStop(0.90, 'rgba(0,0,0,1)');
  gx.addColorStop(1, 'rgba(0,0,0,0)');
  fg.fillStyle = gx; fg.fillRect(0, 0, sw, sh);
  const gy = fg.createLinearGradient(0, 0, 0, sh);
  gy.addColorStop(0, 'rgba(0,0,0,0)');
  gy.addColorStop(0.05, 'rgba(0,0,0,1)');
  gy.addColorStop(0.93, 'rgba(0,0,0,1)');
  gy.addColorStop(1, 'rgba(0,0,0,0)');
  fg.fillStyle = gy; fg.fillRect(0, 0, sw, sh);

  const dx = FACE.U0 * W, dw = (FACE.U1 - FACE.U0) * W;
  const dy = (1 - FACE.V1) * H, dh = (FACE.V1 - FACE.V0) * H;
  g.save();
  g.filter = 'brightness(1.14) saturate(0.94)';
  g.drawImage(feather, 0, 0, sw, sh, dx, dy, dw, dh);
  g.restore();

  if (typeof window !== 'undefined') window.__headCanvas = cv;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

export function makeSkinBump() {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#808080';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 5200; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    const r = 0.6 + Math.random() * 2.2;
    const v = 128 + (Math.random() - 0.5) * 60;
    g.fillStyle = `rgba(${v},${v},${v},0.5)`;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  return tex;
}
