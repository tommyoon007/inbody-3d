import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Anatomy, deriveParams, makeHeadTexture, makeSkinBump } from './body.js';

/* =========================================================
   1. 데이터
   ========================================================= */
const HEIGHT_CM = 176;
const STORE_KEY = 'inbody3d.records.v1';

const state = {
  mode: 'model',
  records: [],
  index: 1,          // currently displayed record (float while morphing)
  anim: 'idle',
  playing: false,
  ready: false,
};

const PI = Math.PI;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function fatMassOf(r) {
  return r.bodyFatMass != null ? r.bodyFatMass : (r.weight * r.bodyFatPct) / 100;
}
function waistOf(r) {
  return r.waistRatio != null ? r.waistRatio : 0.86 + (r.bodyFatPct - 17.5) * 0.0129;
}
function visceralOf(r) {
  return r.visceralFat != null ? r.visceralFat : 7 + (r.bodyFatPct - 17.5) * 0.4;
}
function bmiOf(r) {
  const h = HEIGHT_CM / 100;
  return r.bmi != null ? r.bmi : r.weight / (h * h);
}
function scoreOf(r) {
  if (r.score != null) return r.score;
  // 2026-10-26 실측(68점)을 기준점으로 근육·체지방 변화만큼 추정
  return Math.round(clamp(68 + (r.skeletalMuscle - 34.6) * 1.5 + (29.9 - r.bodyFatPct) * 0.9, 40, 95));
}

function labelOf(r) {
  if (r.goal) return '목표 체형';
  if (r.label) return r.label;
  return '측정';
}

function dateText(r) {
  if (r.goal) return '목표';
  if (!r.date) return '날짜 없음';
  const [y, m, d] = r.date.split('-');
  return `${y}.${m}.${d}`;
}
function shortDate(r) {
  if (r.goal) return '목표';
  if (!r.date) return '—';
  const [, m, d] = r.date.split('-');
  return `${Number(m)}/${Number(d)}`;
}

async function loadRecords() {
  const base = await fetch('data.json', { cache: 'no-cache' }).then(r => r.json());
  const local = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
  const all = [...(base.records || []), ...local];
  const measured = all.filter(r => !r.goal).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const goal = all.filter(r => r.goal);
  state.records = [...measured, ...goal];
}

/* 체형 파라미터 (인바디 수치 → 해부 비율) */
function morphTargets(r) {
  return deriveParams({
    bodyFatPct: r.bodyFatPct,
    skeletalMuscle: r.skeletalMuscle,
    waistRatio: waistOf(r),
    visceralFat: visceralOf(r),
  });
}

function paramsAt(fIndex) {
  const n = state.records.length;
  const i = clamp(fIndex, 0, n - 1);
  const i0 = Math.floor(i), i1 = Math.min(n - 1, i0 + 1);
  const t = i - i0;
  const a = morphTargets(state.records[i0]);
  const b = morphTargets(state.records[i1]);
  const out = {};
  for (const k in a) out[k] = lerp(a[k], b[k], t);
  return out;
}

function recordAt(fIndex) {
  const n = state.records.length;
  const i = clamp(fIndex, 0, n - 1);
  const i0 = Math.floor(i), i1 = Math.min(n - 1, i0 + 1);
  const t = i - i0;
  if (t < 0.001) return state.records[i0];
  // 화면 표시용: 가까운 기록
  return state.records[t < 0.5 ? i0 : i1];
}

/* =========================================================
   2. UI 렌더
   ========================================================= */
const $ = s => document.querySelector(s);

function fmt(v, digits = 1) {
  if (v == null) return '—';
  return Number(v).toFixed(digits);
}

function renderStats() {
  const r = recordAt(state.index);
  const first = state.records[0];
  const el = $('#stats');
  const cells = [
    { k: '체중', v: fmt(r.weight), u: 'kg', d: r.weight - first.weight, inv: true, est: r.estimated?.weight },
    { k: '골격근량', v: fmt(r.skeletalMuscle), u: 'kg', d: r.skeletalMuscle - first.skeletalMuscle, inv: false, est: r.estimated?.skeletalMuscle },
    { k: '체지방률', v: fmt(r.bodyFatPct), u: '%', d: r.bodyFatPct - first.bodyFatPct, inv: true, est: r.estimated?.bodyFatPct },
    { k: '체지방량', v: fmt(fatMassOf(r)), u: 'kg', d: fatMassOf(r) - fatMassOf(first), inv: true, est: r.estimated?.bodyFatMass },
    { k: 'BMI', v: fmt(bmiOf(r)), u: '', d: bmiOf(r) - bmiOf(first), inv: true, est: r.estimated?.bmi },
    { k: '복부지방률', v: fmt(waistOf(r), 2), u: '', d: waistOf(r) - waistOf(first), inv: true, est: r.estimated?.waistRatio },
    { k: '내장지방', v: fmt(visceralOf(r), 0), u: '레벨', d: visceralOf(r) - visceralOf(first), inv: true, est: r.estimated?.visceralFat },
    { k: '기초대사량', v: r.bmr ? fmt(r.bmr, 0) : '—', u: 'kcal', d: null },
  ];
  el.innerHTML = cells.map(c => {
    let d = '';
    if (c.d != null && Math.abs(c.d) > 0.001 && c.d !== 0) {
      const good = c.inv ? c.d < 0 : c.d > 0;
      d = `<div class="d ${good ? 'down' : 'up'}">${c.d > 0 ? '+' : ''}${c.d.toFixed(2).replace(/\.?0+$/, '')}</div>`;
    }
    return `<div class="stat"><div class="k">${c.k}</div>
      <div class="v">${c.v}${c.u ? `<small>${c.u}</small>` : ''}${c.est ? '<i class="est">추정</i>' : ''}</div>${d}</div>`;
  }).join('');

  $('#record-date').textContent = r.goal ? '목표 체형' : dateText(r);
  $('#record-label').textContent = r.goal
    ? 'Goal 시뮬레이션 미리보기'
    : `${labelOf(r)} · ${HEIGHT_CM}cm`;
  $('#score-value').textContent = scoreOf(r);

  $('#pill-date').textContent = r.goal ? 'GOAL' : dateText(r);
  $('#pill-shape').textContent = `체지방 ${fmt(r.bodyFatPct)}% · ${fmt(r.weight)}kg`;

  // timeline labels
  $('#timeline-labels').innerHTML = state.records.map((rec, i) => {
    const on = Math.round(state.index) === i ? 'on' : '';
    return `<span class="${on}">${shortDate(rec)}</span>`;
  }).join('');

  renderTips(r);
}

/* ---------- 맞춤 운동 팁 ---------- */
const TIPS = {
  abs: {
    title: '복부 · 내장지방 집중',
    score: r =>
      3 * clamp((visceralOf(r) - 8) / 4, 0, 1) +
      2 * clamp((waistOf(r) - 0.90) / 0.12, 0, 1) +
      1 * clamp((r.bodyFatPct - 20) / 12, 0, 1),
    why: r =>
      `복부지방률 <b>${fmt(waistOf(r), 2)}</b> · 내장지방 <b>${fmt(visceralOf(r), 0)}레벨</b> · 체지방률 <b>${fmt(r.bodyFatPct)}%</b><br>` +
      '내장지방은 배 안쪽 장기 사이에 쌓여 혈압·혈당 문제로 가장 먼저 이어지는 지방입니다.',
    tips: [
      '주 3~4회 중강도 유산소 30~45분 — 빠르게 걷기(시속 6km), 인클라인 트레드밀(경사 8~12%), 실내자전거',
      '식후 10~15분 가벼운 산책 — 식후 혈당·중성지방 상승을 눌러 줍니다',
      '강도는 “숨이 차지만 대화는 가능한” 수준(RPE 5~6), 주 150~250분 누적이 목표',
      '복부만 골라 빠지지는 않으므로 유산소 + 식사량 조절을 함께 (야식·음주 줄이기)',
    ],
  },
  lower: {
    title: '하체 대근육 (기초대사량 끌어올리기)',
    score: r =>
      2.5 * clamp((42 - musclePct(r)) / 4, 0, 1) +
      1.0 * clamp((r.bodyFatPct - 20) / 15, 0, 1) +
      0.8 * clamp((bmiOf(r) - 24) / 5, 0, 1),
    why: r =>
      `골격근량 <b>${fmt(r.skeletalMuscle)}kg</b> · 골격근/체중 <b>${fmt(musclePct(r))}%</b>(표준 42~45%)` +
      (r.bmr ? ` · 기초대사량 <b>${fmt(r.bmr, 0)}kcal</b>` : '') +
      '<br>허벅지·엉덩이 같은 큰 근육을 쓰면 기초대사량이 올라 가만히 있어도 지방 연소가 빨라집니다.',
    tips: [
      '주 2회 하체 근력 — 스쿼트 3세트×10~12회, 레그프레스 3×12, 런지 2×10(양쪽)',
      '세트 사이 60~90초 휴식, “마지막 2회가 힘든” 무게로 자세 우선',
      '근육 손실 방지용 단백질 — 체중 1kg당 1.2~1.6g (하루 약 105~140g)',
      '계단·언덕 걷기를 일상에 섞으면 하체 자극과 유산소를 동시에',
    ],
  },
  upper: {
    title: '상체 라인 & 코어',
    score: r =>
      2.2 * clamp((45 - musclePct(r)) / 6, 0, 1) +
      0.5 * clamp((bmiOf(r) - 24) / 6, 0, 1),
    why: r =>
      `골격근/체중 <b>${fmt(musclePct(r))}%</b> · 인바디점수 <b>${scoreOf(r)}점</b><br>` +
      '등·어깨를 키우면 허리가 상대적으로 좁아져 역삼각형 라인이 살고, 코어가 받쳐 주면 자세와 허리 부담이 줄어듭니다.',
    tips: [
      '랫풀다운 3×10, 시티드 로우 3×12 — 등 근육으로 어깨 라인 만들기',
      '플랭크 30~45초×3, 데드버그 10회×3 — 허리 부담 없이 복부 코어 강화',
      '푸시업·숄더프레스로 가슴·어깨 균형 맞추기 (주 2회)',
      '어깨를 뒤로 모으는 자세를 의식하면 등 근육이 제대로 쓰입니다',
    ],
  },
};

function musclePct(r) {
  return (r.skeletalMuscle / r.weight) * 100;
}

function renderTips(r) {
  const ranked = Object.entries(TIPS)
    .map(([id, lib]) => ({ id, lib, s: lib.score(r) }))
    .sort((a, b) => b.s - a.s);

  $('#tips-for').textContent = r.goal ? '목표 체형 기준' : `${dateText(r)} 기준`;

  const maintain = r.goal || ranked[0].s < 1.6;

  if (maintain) {
    const why = r.goal
      ? `목표 수치(체지방 <b>${fmt(r.bodyFatPct)}%</b> · 골격근 <b>${fmt(r.skeletalMuscle)}kg</b> · 점수 <b>${scoreOf(r)}점</b>)에 도달한 상태입니다.<br>이제는 줄이는 국면이 아니라 <b>지키고 다듬는</b> 국면 — 근육을 유지해야 요요 없이 체형이 남습니다.`
      : `체지방률 <b>${fmt(r.bodyFatPct)}%</b> · 골격근 <b>${fmt(r.skeletalMuscle)}kg</b> — 큰 보완 부위는 없습니다.<br>지금 균형을 유지하면서 근육을 조금씩 더하는 것이 다음 단계입니다.`;
    $('#tips-list').innerHTML = `
      <div class="tip p0">
        <div class="tip-top"><span class="tip-rank">${r.goal ? 'GOAL' : '유지'}</span><span class="tip-title">유지 · 강화 모드</span></div>
        <p class="tip-why">${why}</p>
        <ul>
          <li>전신 근력 주 3회(각 40분)로 지금 근육량 유지 — 하체·등 위주</li>
          <li>유산소는 주 2회 20~30분이면 충분, 근력 운동과 같은 날은 뒤에 배치</li>
          <li>단백질은 체중 1kg당 1.2~1.6g 유지, 수분 하루 2L</li>
          <li>월 1회 인바디 재측정으로 체지방률 ±1% 안에서 관리</li>
        </ul>
      </div>`;
    $('#week-plan').innerHTML = buildWeek([], true)
      .map(w => `<span class="${w.k}"><b>${w.d}</b>${w.t}</span>`).join('');
    return;
  }

  const top = ranked.slice(0, 3);
  $('#tips-list').innerHTML = top.map((t, i) => `
    <div class="tip p${i + 1}">
      <div class="tip-top"><span class="tip-rank">${i + 1}순위</span><span class="tip-title">${t.lib.title}</span></div>
      <p class="tip-why">${t.lib.why(r)}</p>
      <ul>${t.lib.tips.map(x => `<li>${x}</li>`).join('')}</ul>
    </div>`).join('');

  $('#week-plan').innerHTML = buildWeek(top.map(t => t.id), false)
    .map(w => `<span class="${w.k}"><b>${w.d}</b>${w.t}</span>`).join('');
}

function buildWeek(areas, maintain) {
  const days = ['월', '화', '수', '목', '금', '토', '일'];
  const has = id => areas.includes(id);
  let plan;
  if (maintain) {
    plan = [
      { t: '전신 근력 A', k: 'strength' },
      { t: '유산소 25분', k: 'cardio' },
      { t: '전신 근력 B', k: 'strength' },
      { t: '가벼운 걷기', k: '' },
      { t: '유산소 인터벌', k: 'cardio' },
      { t: '근력·코어', k: 'strength' },
      { t: '휴식', k: 'rest' },
    ];
  } else {
    plan = [
      has('lower') ? { t: '하체 근력', k: 'strength' } : { t: '전신 근력', k: 'strength' },
      has('abs') ? { t: '유산소 40분', k: 'cardio' } : { t: '걷기 40분', k: '' },
      has('upper') ? { t: '상체·코어', k: 'strength' } : { t: '코어 서킷', k: 'strength' },
      has('abs') ? { t: '유산소 30분', k: 'cardio' } : { t: '가벼운 걷기', k: '' },
      has('lower') ? { t: '하체·코어', k: 'strength' } : { t: '전신 근력', k: 'strength' },
      { t: '걷기 60분', k: 'cardio' },
      { t: '휴식', k: 'rest' },
    ];
  }
  return days.map((d, i) => ({ d, ...plan[i] }));
}

function renderTable() {
  const rs = state.records;
  const rows = [
    ['체중', r => fmt(r.weight) + 'kg', true],
    ['골격근량', r => fmt(r.skeletalMuscle) + 'kg', false],
    ['체지방량', r => fmt(fatMassOf(r)) + 'kg', true],
    ['체지방률', r => fmt(r.bodyFatPct) + '%', true],
    ['BMI', r => fmt(bmiOf(r)), true],
    ['인바디점수', r => String(scoreOf(r)), false],
    ['복부지방률', r => fmt(waistOf(r), 2), true],
    ['내장지방', r => fmt(visceralOf(r), 0) + '레벨', true],
  ];
  const head = `<thead><tr><th>항목</th>${rs.map(r => `<th>${shortDate(r)}</th>`).join('')}<th>변화</th></tr></thead>`;
  const body = rows.map(([name, fn, lowerBetter]) => {
    const first = rs[0], last = rs[rs.length - 1];
    const cells = rs.map(r => `<td class="${r.goal ? 'goal' : ''}">${fn(r)}</td>`).join('');
    const fv = parseFloat(fn(first)), lv = parseFloat(fn(last));
    const diff = lv - fv;
    const good = lowerBetter ? diff < 0 : diff > 0;
    const diffTxt = isNaN(diff) || Math.abs(diff) < 0.001 ? '—'
      : `<span class="${good ? 'delta-good' : 'delta-bad'}">${diff > 0 ? '+' : ''}${diff.toFixed(1)}</span>`;
    return `<tr><td>${name}</td>${cells}<td>${diffTxt}</td></tr>`;
  }).join('');
  $('#cmp-table').innerHTML = head + `<tbody>${body}</tbody>`;
}

function renderGallery() {
  const rs = state.records;
  $('#card-count').textContent = `${rs.length}개`;
  $('#gallery').innerHTML = rs.map((r, i) => {
    const isGoal = !!r.goal;
    const src = isGoal ? 'assets/body-goal.png' : 'assets/body-current.png';
    let caption = '';
    if (!isGoal && i === 0 && rs.length > 2) caption = '10/26 체형 이미지로 표현';
    if (!isGoal && i > 0) caption = '실제 측정 기반 3D 이미지';
    if (isGoal) caption = '목표 체형 3D 이미지';
    if (r.local) caption = '이미지 없음 · 수치만 기록';
    return `<div class="g-card">
      <div class="g-thumb">${r.local
        ? '<div class="ph">사진<br/>없음</div>'
        : `<img src="${src}" alt="${dateText(r)} 체형" loading="lazy" />`}</div>
      <div class="g-body">
        <div class="g-date">${isGoal ? '🎯 목표 체형' : dateText(r)}</div>
        <div class="g-sub">${labelOf(r)}${caption ? ' · ' + caption : ''}</div>
        <div class="g-metrics">
          <span class="${isGoal ? 'hl' : ''}">${fmt(r.weight)}kg</span>
          <span>근육 ${fmt(r.skeletalMuscle)}kg</span>
          <span>체지방 ${fmt(r.bodyFatPct)}%</span>
          <span>점수 ${scoreOf(r)}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderRecordList() {
  $('#record-list').innerHTML = state.records.map((r, i) => `
    <li>
      <div>
        <span class="r-date">${dateText(r)}</span>
        ${r.local ? '<span class="badge-local">이 기기</span>' : ''}
        <div class="r-meta">${fmt(r.weight)}kg · 골격근 ${fmt(r.skeletalMuscle)}kg · 체지방 ${fmt(r.bodyFatPct)}%</div>
      </div>
      ${r.local ? `<button class="del" data-del="${r.id}" aria-label="삭제">🗑</button>` : '<span class="r-meta">기본</span>'}
    </li>`).join('');
}

function refreshUI() {
  renderStats();
  renderTable();
  renderGallery();
  renderRecordList();
  $('#date-slider').max = String(Math.max(1, state.records.length - 1));
  $('#compare-range').textContent =
    `${fmt(state.records[0].weight)}kg · ${fmt(state.records[0].bodyFatPct)}% → ` +
    `${fmt(state.records[state.records.length - 1].weight)}kg · ${fmt(state.records[state.records.length - 1].bodyFatPct)}%`;
}
/* =========================================================
   3. 3D 캐릭터 (해부학 메쉬 + 스키닝)
   ========================================================= */
const COLORS = {
  skin: 0xe2a077,
  shorts: 0x141a22,
  hair: 0x100d0c,
  floor: 0x0b1017,
};

class Character3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.floor);
    this.scene.fog = new THREE.Fog(COLORS.floor, 4.2, 9.5);

    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40);
    this.camera.position.set(0.42, 1.16, 3.25);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0.94, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.4;
    this.controls.maxDistance = 5.5;
    this.controls.minPolarAngle = 0.45;
    this.controls.maxPolarAngle = Math.PI * 0.53;
    this.controls.rotateSpeed = 0.85;
    this.controls.zoomSpeed = 0.8;
    this.controls.update();

    const _q = new URLSearchParams(location.search);
    this.headView = _q.get('view') === 'head';
    if (this.headView) {
      this.camera.position.set(0.06, 1.63, 0.72);
      this.controls.target.set(0, 1.62, 0);
      this.controls.update();
    }
    this.lod = _q.get('lod');   // 저해상도 렌더(디버그)
    const camQ = _q.get('cam');
    if (camQ) {
      const v = camQ.split(',').map(Number);
      if (v.length === 6 && v.every(n => !isNaN(n))) {
        this.camera.position.set(v[0], v[1], v[2]);
        this.controls.target.set(v[3], v[4], v[5]);
        this.controls.update();
      }
    }

    this._env();
    this._lights();
    this._floor();
    this._materials();

    this.anatomy = new Anatomy(paramsAt(state.index), this.mats, this.headMat.map);
    this.scene.add(this.anatomy.root);

    this.params = paramsAt(state.index);
    this.cur = { ...this.params };
    this.headTex = this._loadFace();

    this.pose = {
      hipsX: 0, hipsY: 0, spineX: 0, spineY: 0, chestX: 0, chestY: 0,
      neckX: 0, neckY: 0, headX: 0, headY: 0,
      armLX: 0, armRX: 0, armLZ: 0, armRZ: 0,
      elbLX: 0.14, elbRX: 0.14, handLX: 0, handRX: 0,
      thighLX: 0, thighRX: 0, thighLZ: 0, thighRZ: 0,
      kneeLX: 0.04, kneeRX: 0.04, footLX: 0, footRX: 0, breath: 0,
    };
    this.clock = new THREE.Clock();
    this.time = 0;
    this._lastBuild = 0;

    this._observeResize();
    this._loop();
  }

  _env() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(env, 0.04).texture;
    env.dispose?.();
    pmrem.dispose();
  }

  _lights() {
    const hemi = new THREE.HemisphereLight(0xa9cbf5, 0x161a20, 0.55);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff1e2, 2.35);
    key.position.set(1.9, 3.1, 2.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 12;
    key.shadow.camera.left = -1.4;
    key.shadow.camera.right = 1.4;
    key.shadow.camera.top = 2.4;
    key.shadow.camera.bottom = -0.3;
    key.shadow.bias = -0.0009;
    key.shadow.radius = 4;
    this.scene.add(key);
    this.key = key;

    const fill = new THREE.DirectionalLight(0x9dbcf0, 0.62);
    fill.position.set(-2.5, 1.55, 1.7);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xbcd4ff, 1.55);
    rim.position.set(-0.7, 2.1, -2.9);
    this.scene.add(rim);

    const rim2 = new THREE.DirectionalLight(0x2ee6a8, 0.55);
    rim2.position.set(2.3, 1.1, -2.4);
    this.scene.add(rim2);

    const bounce = new THREE.DirectionalLight(0x5b7a9c, 0.28);
    bounce.position.set(0, -1.4, 1.6);
    this.scene.add(bounce);
  }

  _floor() {
    // 부드러운 조명 웅덩이
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(128, 128, 8, 128, 128, 128);
    grd.addColorStop(0, 'rgba(46,230,168,0.22)');
    grd.addColorStop(0.45, 'rgba(40,110,150,0.09)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.6, 64),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.0015;
    this.scene.add(disc);

    const grid = new THREE.GridHelper(3.2, 16, 0x1d5a54, 0x14232b);
    grid.material.transparent = true;
    grid.material.opacity = 0.22;
    grid.position.y = 0.0008;
    this.scene.add(grid);

    // 그림자 받이
    const sp = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 4),
      new THREE.ShadowMaterial({ opacity: 0.45 })
    );
    sp.rotation.x = -Math.PI / 2;
    sp.position.y = 0.0005;
    sp.receiveShadow = true;
    this.scene.add(sp);
  }

  _materials() {
    const bump = makeSkinBump();
    bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
    bump.repeat.set(5, 5);

    const skin = new THREE.MeshPhysicalMaterial({
      color: COLORS.skin,
      roughness: 0.55,
      metalness: 0.0,
      sheen: 0.35,
      sheenColor: new THREE.Color(0xffa184),
      sheenRoughness: 0.8,
      clearcoat: 0.10,
      clearcoatRoughness: 0.62,
      envMapIntensity: 0.55,
      bumpMap: bump,
      bumpScale: 0.0014,
    });

    const head = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.55,
      metalness: 0.0,
      sheen: 0.3,
      sheenColor: new THREE.Color(0xffa184),
      sheenRoughness: 0.8,
      clearcoat: 0.10,
      clearcoatRoughness: 0.62,
      envMapIntensity: 0.55,
    });

    const shorts = new THREE.MeshPhysicalMaterial({
      color: COLORS.shorts,
      roughness: 0.86,
      metalness: 0.02,
      sheen: 0.5,
      sheenColor: new THREE.Color(0x2a3d55),
      sheenRoughness: 0.95,
      envMapIntensity: 0.4,
    });

    const hair = new THREE.MeshPhysicalMaterial({
      color: COLORS.hair,
      roughness: 0.52,
      metalness: 0.0,
      sheen: 0.35,
      sheenColor: new THREE.Color(0x35302e),
      sheenRoughness: 0.6,
      clearcoat: 0.12,
      clearcoatRoughness: 0.5,
      envMapIntensity: 0.45,
    });

    this.matSkin = skin;
    this.headMat = head;
    this.mats = [skin, head, shorts, hair];
  }

  _loadFace() {
    const img = new Image();
    img.onload = () => {
      try {
        const tex = makeHeadTexture(img);
        this.headMat.map = tex;
        this.headMat.color.set(0xffffff);
        this.headMat.needsUpdate = true;
        this.faceReady = true;
      } catch (e) {
        console.warn('face texture', e);
      }
    };
    img.onerror = () => { this.faceReady = true; };
    img.src = 'assets/face-tex.png';
  }

  _observeResize() {
    const resize = () => {
      const el = this.canvas.parentElement;
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.fov = w / h < 0.9 ? 42 : 34;
      this.camera.updateProjectionMatrix();
    };
    this._resize = resize;
    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(this.canvas.parentElement);
    window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  }

  setParams(target) { this.targetParams = target; }

  _poseTargets() {
    const t = this.time;
    const p = {
      hipsX: 0, hipsY: 0, spineX: 0, spineY: 0, chestX: 0, chestY: 0,
      neckX: 0, neckY: 0, headX: 0, headY: 0,
      armLX: 0, armRX: 0, armLZ: 0, armRZ: 0, elbLX: -0.16, elbRX: -0.16,
      handLX: 0, handRX: 0,
      thighLX: 0, thighRX: 0, thighLZ: 0, thighRZ: 0,
      kneeLX: 0.05, kneeRX: 0.05, footLX: 0, footRX: 0, breath: 0,
    };
    if (state.anim === 'idle') {
      const b = Math.sin(t * 1.45);
      p.breath = b * 0.55;
      p.chestX = -0.012 + b * 0.012;
      p.spineX = b * 0.006;
      p.armLX = Math.sin(t * 0.62) * 0.05;
      p.armRX = Math.sin(t * 0.62 + 1.7) * 0.05;
      p.armLZ = 0.02 + b * 0.006;
      p.armRZ = 0.02 + b * 0.006;
      p.elbLX = -0.20 - b * 0.02;
      p.elbRX = -0.20 - b * 0.02;
      p.headY = Math.sin(t * 0.40) * 0.07;
      p.headX = Math.sin(t * 0.31) * 0.02;
      p.spineY = Math.sin(t * 0.24) * 0.02;
    } else if (state.anim === 'walk') {
      const ph = t * 3.4;
      const s = Math.sin(ph), c = Math.cos(ph);
      p.thighLX = s * 0.42;
      p.thighRX = -s * 0.42;
      p.kneeLX = 0.08 + Math.max(0, -Math.sin(ph - 0.6)) * 0.85;
      p.kneeRX = 0.08 + Math.max(0, -Math.sin(ph + PI - 0.6)) * 0.85;
      p.footLX = -s * 0.18;
      p.footRX = s * 0.18;
      p.armLX = -s * 0.34;
      p.armRX = s * 0.34;
      p.armLZ = 0.03; p.armRZ = 0.03;
      p.elbLX = -0.24 - Math.max(0, s) * 0.36;
      p.elbRX = -0.24 - Math.max(0, -s) * 0.36;
      p.hipsY = s * 0.05;
      p.spineY = -s * 0.05;
      p.headY = s * 0.03;
      p.breath = Math.sin(t * 1.2) * 0.3;
    } else if (state.anim === 'pose') {
      const b = Math.sin(t * 1.1);
      p.armLZ = 0.92 + b * 0.03;
      p.armRZ = 0.92 + b * 0.03;
      p.armLX = -0.22; p.armRX = -0.22;
      p.elbLX = -0.62; p.elbRX = -0.62;
      p.thighLZ = 0.04; p.thighRZ = 0.04;
      p.spineX = -0.03 + b * 0.006;
      p.headX = -0.07;
      p.breath = b * 0.6;
    }
    return p;
  }

  _loop() {
    const render = () => {
      requestAnimationFrame(render);
      const dt = Math.min(0.05, this.clock.getDelta());
      this.time += dt;

      // 체형 모프
      if (this.targetParams) {
        const k = 1 - Math.pow(0.0007, dt);
        let changed = false;
        for (const key in this.targetParams) {
          const cur = this.cur[key];
          const tgt = this.targetParams[key];
          if (Math.abs(tgt - cur) > 1e-5) {
            this.cur[key] = lerp(cur, tgt, k);
            changed = true;
          }
        }
        if (changed) this._shapeDirty = true;
      }
      const now = performance.now();
      if (this._shapeDirty && now - this._lastBuild > 40) {
        this.anatomy.update(this.cur);
        this._shapeDirty = false;
        this._lastBuild = now;
        this._needPose = true;
      }

      // 포즈
      const target = this._poseTargets();
      const kp = 1 - Math.pow(0.0015, dt);
      let poseChanged = false;
      for (const key in target) {
        const d = target[key] - this.pose[key];
        if (Math.abs(d) > 1e-5) { this.pose[key] = lerp(this.pose[key], target[key], kp); poseChanged = true; }
      }
      if (poseChanged || this._needPose) {
        this.anatomy.setPose(this.pose);
        this._needPose = false;
      }

      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    render();
  }
}

/* ---- compare slider (드래그 방향 = 드러나는 체형) ---- */
function initCompare() {
  const wrap = $('#compare');
  const clip = $('#compare-clip');
  const handle = $('#compare-handle');
  const hint = $('#compare-hint');
  const tagBefore = $('#tag-before');
  const tagAfter = $('#tag-after');
  let dragging = false;

  const setPos = x => {
    const r = wrap.getBoundingClientRect();
    const pct = clamp(((x - r.left) / r.width) * 100, 2, 98);
    clip.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
    handle.style.left = pct + '%';
    wrap.dataset.side = pct > 50 ? 'before' : 'after';
  };
  const down = e => {
    dragging = true;
    setPos(e.touches ? e.touches[0].clientX : e.clientX);
  };
  const up = () => { dragging = false; };

  handle.addEventListener('pointerdown', e => {
    dragging = true;
    handle.setPointerCapture?.(e.pointerId);
  });
  wrap.addEventListener('pointerdown', e => { dragging = true; setPos(e.clientX); });
  window.addEventListener('pointermove', e => { if (dragging) setPos(e.clientX); });
  window.addEventListener('pointerup', up);

  clip.style.clipPath = 'inset(0 50% 0 0)';
  handle.style.left = '50%';
  wrap.dataset.side = 'even';
}

/* =========================================================
   4. 앱 초기화 & 상호작용
   ========================================================= */
let character = null;

function setSliderUI() {
  $('#date-slider').value = String(state.index);
}

function applyIndex(i, { fromSlider = false } = {}) {
  state.index = clamp(i, 0, state.records.length - 1);
  if (character) character.setParams(paramsAt(state.index));
  renderStats();
  if (!fromSlider) setSliderUI();
}

function play() {
  if (state.playing) { stopPlay(); return; }
  state.playing = true;
  const btn = $('#play');
  btn.classList.add('playing');
  btn.textContent = '■ 재생 중지';
  const n = state.records.length;
  if (n < 2) return;

  // 0부터 시작해서 마지막까지
  const seq = [];
  for (let i = 0; i < n - 1; i++) {
    seq.push({ from: i, to: i + 1, dur: 2200, hold: 900 });
  }
  let p = 0, t0 = performance.now();

  const step = () => {
    if (!state.playing) return;
    const seg = seq[p];
    if (!seg) { stopPlay(); applyIndex(n - 1); return; }
    const el = performance.now() - t0;
    const elc = Math.max(0, el);
    if (elc < seg.dur) {
      const f = easeInOut(elc / seg.dur);
      state.index = seg.from + (seg.to - seg.from) * f;
      if (character) character.setParams(paramsAt(state.index));
      renderStats();
      setSliderUI();
      requestAnimationFrame(step);
    } else if (el < seg.dur + seg.hold) {
      state.index = seg.to;
      if (character) character.setParams(paramsAt(state.index));
      renderStats();
      setSliderUI();
      requestAnimationFrame(step);
    } else {
      p++;
      t0 = performance.now();
      requestAnimationFrame(step);
    }
  };
  // 시작 지점
  applyIndex(0);
  t0 = performance.now() + 260;
  requestAnimationFrame(step);
}

function stopPlay() {
  const wasPlaying = state.playing;
  state.playing = false;
  const btn = $('#play');
  btn.classList.remove('playing');
  btn.textContent = '▶ 변화 과정 보기';
  // 재생 중이었다면 가장 가까운 기록으로 정렬
  if (wasPlaying) applyIndex(Math.round(state.index));
}

function switchMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === mode));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${mode}`));
  if (mode === 'model' && character) {
    requestAnimationFrame(() => character._resize && character._resize());
  }
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ---- add record ---- */
function initSheet() {
  const backdrop = $('#sheet-backdrop');
  const form = $('#record-form');
  const todayISO = () => {
    const d = new Date();
    const p2 = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  };
  const open = () => {
    backdrop.classList.remove('hidden');
    form.reset();
    form.elements.date.value = todayISO();
  };
  const close = () => backdrop.classList.add('hidden');

  $('#add-btn').addEventListener('click', open);
  $('#sheet-close').addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(form);
    const num = k => (fd.get(k) === '' || fd.get(k) == null ? null : Number(fd.get(k)));
    const rec = {
      id: 'local-' + Date.now(),
      date: fd.get('date'),
      weight: num('weight'),
      skeletalMuscle: num('skeletalMuscle'),
      bodyFatPct: num('bodyFatPct'),
      bodyFatMass: num('bodyFatMass'),
      bmi: num('bmi'),
      score: num('score'),
      waistRatio: num('waistRatio'),
      visceralFat: num('visceralFat'),
      bmr: num('bmr'),
      local: true,
    };
    if (!rec.date || rec.weight == null || rec.skeletalMuscle == null || rec.bodyFatPct == null) {
      toast('측정일·체중·골격근량·체지방률은 꼭 필요합니다');
      return;
    }
    const local = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    local.push(rec);
    localStorage.setItem(STORE_KEY, JSON.stringify(local));
    close();
    initData(rec.id);
    toast('기록을 저장했습니다');
  });

  $('#record-list').addEventListener('click', e => {
    const btn = e.target.closest('[data-del]');
    if (!btn) return;
    const id = btn.dataset.del;
    const local = JSON.parse(localStorage.getItem(STORE_KEY) || '[]').filter(r => r.id !== id);
    localStorage.setItem(STORE_KEY, JSON.stringify(local));
    initData();
    toast('삭제했습니다');
  });

  $('#export-btn').addEventListener('click', () => {
    const local = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    if (!local.length) { toast('이 기기에 추가한 기록이 없습니다'); return; }
    const blob = new Blob([JSON.stringify({ records: local }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'inbody-records-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('JSON 파일을 내려받았습니다');
  });
}

async function initData(focusId) {
  await loadRecords();
  refreshUI();
  let idx = clamp(Math.round(state.index), 0, state.records.length - 1);
  if (focusId) {
    const found = state.records.findIndex(r => r.id === focusId);
    if (found >= 0) idx = found;
  }
  state.index = idx;
  setSliderUI();
  renderStats();
  if (character) character.setParams(paramsAt(state.index));
}

async function init() {
  await loadRecords();
  initData();
  initCompare();
  initSheet();

  document.querySelectorAll('.tab').forEach(t =>
    t.addEventListener('click', () => switchMode(t.dataset.tab)));

  document.querySelectorAll('[data-anim]').forEach(btn =>
    btn.addEventListener('click', () => {
      state.anim = btn.dataset.anim;
      document.querySelectorAll('[data-anim]').forEach(b => b.classList.toggle('active', b === btn));
    }));

  $('#date-slider').addEventListener('input', e => {
    const v = Number(e.target.value);
    stopPlay();
    applyIndex(v, { fromSlider: true });
  });
  $('#play').addEventListener('click', play);

  // 3D 시작
  try {
    character = new Character3D(document.getElementById('three-canvas'));
    state.ready = true;
    $('#loader').classList.add('hidden');
    character.setParams(paramsAt(state.index));
  } catch (err) {
    console.error('3D init failed', err);
    (window.__errors = window.__errors || []).push('3D init: ' + (err && err.stack ? err.stack : String(err)));
    $('#loader').textContent = '3D 모델을 표시할 수 없습니다 (WebGL 미지원)';
  }

  // PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
