import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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
  return Math.round(clamp(52 + r.skeletalMuscle * 0.55 - r.bodyFatPct * 0.75, 40, 95));
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

/* 체형 파라미터 (인바디 수치 → 3D 비율) */
function morphTargets(r) {
  const fat = clamp((r.bodyFatPct - 15) / (32 - 15), 0, 1.3);
  const mus = clamp((r.skeletalMuscle - 33) / (37 - 33), 0, 1.2);
  const wN = clamp((waistOf(r) - 0.84) / (1.04 - 0.84), 0, 1.3);
  const vN = clamp((visceralOf(r) - 6) / (13 - 6), 0, 1.3);

  const waistW = 0.142 + 0.046 * wN + 0.014 * fat;
  const waistD = 0.093 + 0.014 * wN;
  return {
    shoulder: 0.178 + 0.036 * mus + 0.010 * fat,
    chestD: 0.108 + 0.020 * mus + 0.032 * fat,
    waistW,
    waistD,
    bellyD: waistD + 0.010 + 0.038 * fat + 0.010 * vN,
    belly: 0.006 + 0.030 * fat + 0.012 * vN,
    hipW: 0.148 + 0.030 * fat + 0.004 * mus,
    hipD: 0.100 + 0.018 * fat,
    thighR: 0.067 + 0.019 * fat - 0.002 * mus,
    armR: 0.036 + 0.009 * fat + 0.013 * mus,
    calfR: 0.048 + 0.009 * fat + 0.006 * mus,
    neckR: 0.046 + 0.008 * fat,
    headW: 0.098 + 0.013 * fat,
    faceFull: fat,
  };
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
   3. 3D 캐릭터
   ========================================================= */
const COLORS = {
  skin: 0xd9a07c,
  skinDark: 0xc98f6b,
  shirt: 0xb7bcc5,
  shorts: 0x171b22,
  shoe: 0xeef1f4,
  hair: 0x14100f,
  floor: 0x0f1620,
};

function buildTubeGeometry(rings, radial) {
  const geo = new THREE.BufferGeometry();
  const count = rings * radial + 2;
  const pos = new Float32Array(count * 3);
  const idx = [];
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + ((j + 1) % radial);
      idx.push(a, b, c, b, d, c);
    }
  }
  const bc = rings * radial, tc = rings * radial + 1;
  for (let j = 0; j < radial; j++) {
    idx.push(bc, (j + 1) % radial, j);
    idx.push(tc, (rings - 1) * radial + j, (rings - 1) * radial + ((j + 1) % radial));
  }
  geo.setIndex(idx);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.userData = { rings, radial, bc, tc };
  return geo;
}

function updateTube(geo, profileFn, y0, height) {
  const { rings, radial, bc, tc } = geo.userData;
  const pos = geo.attributes.position.array;
  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1);
    const { rx, rz, z } = profileFn(t);
    const y = y0 + t * height;
    for (let j = 0; j < radial; j++) {
      const ang = (j / radial) * Math.PI * 2;
      const k = (i * radial + j) * 3;
      pos[k] = Math.sin(ang) * rx;
      pos[k + 1] = y;
      pos[k + 2] = Math.cos(ang) * rz + z;
    }
  }
  pos[bc * 3] = 0; pos[bc * 3 + 1] = y0; pos[bc * 3 + 2] = 0;
  pos[tc * 3] = 0; pos[tc * 3 + 1] = y0 + height; pos[tc * 3 + 2] = 0;
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
}

const CAPSULE = new THREE.CapsuleGeometry(1, 1, 8, 20); // 총 높이 3

function makeLimb(material) {
  const m = new THREE.Mesh(CAPSULE, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function setLimb(mesh, radius, length) {
  mesh.scale.set(radius, length / 3, radius);
  mesh.position.y = -length / 2;
}

class Character3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e13);
    this.scene.fog = new THREE.Fog(0x0a0e13, 3.4, 8);

    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40);
    this.camera.position.set(0.55, 1.35, 3.35);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0.93, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 5.5;
    this.controls.minPolarAngle = 0.5;
    this.controls.maxPolarAngle = Math.PI * 0.54;
    this.controls.rotateSpeed = 0.85;
    this.controls.zoomSpeed = 0.8;
    this.controls.update();

    this._lights();
    this._floor();
    this._materials();
    this._build();

    this.params = paramsAt(state.index);
    this.cur = { ...this.params };
    this.applyShape(this.cur);

    // 포즈 상태
    this.pose = {
      shLx: 0, shLz: 0.10, shRx: 0, shRz: -0.10,
      elLx: 0.12, elRx: 0.12,
      hipLx: 0, hipRx: 0, kneeLx: 0.04, kneeRx: 0.04,
      spineX: 0, spineY: 0, bodyY: 0, headX: 0, headY: 0,
      breath: 0,
    };
    this.clock = new THREE.Clock();
    this.time = 0;

    this._observeResize();
    this._loop();
  }

  _lights() {
    const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x1a222e, 0.85);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(2.2, 3.6, 2.8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 12;
    key.shadow.camera.left = -1.6;
    key.shadow.camera.right = 1.6;
    key.shadow.camera.top = 2.6;
    key.shadow.camera.bottom = -0.4;
    key.shadow.bias = -0.0012;
    key.shadow.radius = 3;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x9dc4ff, 0.7);
    fill.position.set(-2.6, 1.8, 1.6);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0x39e3b0, 1.5);
    rim.position.set(-0.6, 2.2, -3.2);
    this.scene.add(rim);

    const rim2 = new THREE.DirectionalLight(0x7aa7ff, 0.6);
    rim2.position.set(2.4, 1.2, -2.6);
    this.scene.add(rim2);
  }

  _floor() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(128, 128, 10, 128, 128, 128);
    grd.addColorStop(0, 'rgba(46,230,168,0.30)');
    grd.addColorStop(0.45, 'rgba(40,120,160,0.10)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.5, 64),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.002;
    this.scene.add(disc);

    const grid = new THREE.GridHelper(3.2, 16, 0x1d5a54, 0x14232b);
    grid.material.transparent = true;
    grid.material.opacity = 0.28;
    grid.position.y = 0.001;
    this.scene.add(grid);
  }

  _materials() {
    this.mat = {
      skin: new THREE.MeshStandardMaterial({ color: COLORS.skin, roughness: 0.62, metalness: 0.02 }),
      shirt: new THREE.MeshStandardMaterial({ color: COLORS.shirt, roughness: 0.88, metalness: 0.0 }),
      shorts: new THREE.MeshStandardMaterial({ color: COLORS.shorts, roughness: 0.85 }),
      shoe: new THREE.MeshStandardMaterial({ color: COLORS.shoe, roughness: 0.55 }),
      hair: new THREE.MeshStandardMaterial({ color: COLORS.hair, roughness: 0.45, metalness: 0.12 }),
    };
  }

  _build() {
    const S = this.scene;
    this.root = new THREE.Group();
    S.add(this.root);

    const body = new THREE.Group();       // 전체 상하 흔들림
    this.root.add(body);
    this.body = body;

    const hips = new THREE.Group();       // 골반 피벗 (y=0.88)
    hips.position.y = 0.88;
    body.add(hips);
    this.hips = hips;

    /* --- 몸통 (상의 없이 피부) --- */
    this.torsoGeo = buildTubeGeometry(20, 30);
    this.torso = new THREE.Mesh(this.torsoGeo, this.mat.skin);
    this.torso.castShadow = true;
    this.torso.receiveShadow = true;
    hips.add(this.torso);

    /* --- 목 --- */
    this.neck = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 20), this.mat.skin);
    this.neck.castShadow = true;
    this.neck.position.y = 0.60;
    hips.add(this.neck);

    /* --- 머리 --- */
    this.head = new THREE.Group();
    this.head.position.y = 0.66;
    hips.add(this.head);

    this.headShape = new THREE.Group();
    this.head.add(this.headShape);

    const headSphere = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 30), this.mat.skin);
    headSphere.castShadow = true;
    this.headShape.add(headSphere);

    // 얼굴 텍스처 (머리 앞면)
    const tex = new THREE.TextureLoader().load('assets/face-tex.png', t => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      this.faceReady = true;
    });
    this.faceTex = tex;
    const FACE_ARC = 2.05;
    const faceGeo = new THREE.SphereGeometry(1.012, 48, 40,
      Math.PI / 2 - FACE_ARC / 2, FACE_ARC,
      0.40, 1.42);
    this.faceMat = new THREE.MeshStandardMaterial({
      map: tex, transparent: true, alphaTest: 0.45,
      roughness: 0.78, metalness: 0.0,
      polygonOffset: true, polygonOffsetFactor: -2,
    });
    this.face = new THREE.Mesh(faceGeo, this.faceMat);
    this.headShape.add(this.face);

    // 머리카락
    const hairTop = new THREE.Mesh(
      new THREE.SphereGeometry(1.045, 40, 24, 0, Math.PI * 2, 0, 1.12),
      this.mat.hair
    );
    hairTop.castShadow = true;
    this.headShape.add(hairTop);
    const hairBack = new THREE.Mesh(
      new THREE.SphereGeometry(1.042, 40, 24, Math.PI * 0.98, Math.PI * 1.04, 0.72, 0.85),
      this.mat.hair
    );
    this.headShape.add(hairBack);

    /* --- 어깨/팔 --- */
    this.arms = {};
    for (const side of ['L', 'R']) {
      const sgn = side === 'L' ? -1 : 1;      // L = -x
      const shoulder = new THREE.Group();
      shoulder.position.set(sgn * 0.16, 0.50, 0);
      hips.add(shoulder);

      const upper = makeLimb(this.mat.skin);
      shoulder.add(upper);

      const elbow = new THREE.Group();
      elbow.position.y = -0.30;
      shoulder.add(elbow);

      const fore = makeLimb(this.mat.skin);
      elbow.add(fore);

      const hand = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), this.mat.skin);
      hand.castShadow = true;
      elbow.add(hand);

      this.arms[side] = { sgn, shoulder, upper, elbow, fore, hand };
    }

    /* --- 반바지(골반) --- */
    this.shortsGeo = buildTubeGeometry(10, 26);
    this.shortsMesh = new THREE.Mesh(this.shortsGeo, this.mat.shorts);
    this.shortsMesh.castShadow = true;
    hips.add(this.shortsMesh);

    /* --- 다리 --- */
    this.legs = {};
    for (const side of ['L', 'R']) {
      const sgn = side === 'L' ? -1 : 1;
      const hip = new THREE.Group();
      hip.position.set(sgn * 0.075, 0, 0);
      hips.add(hip);

      const thigh = makeLimb(this.mat.skin);
      hip.add(thigh);

      const shortLeg = makeLimb(this.mat.shorts);
      hip.add(shortLeg);

      const knee = new THREE.Group();
      knee.position.y = -0.41;
      hip.add(knee);

      const shin = makeLimb(this.mat.skin);
      knee.add(shin);

      const foot = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.mat.shoe);
      foot.castShadow = true;
      foot.receiveShadow = true;
      knee.add(foot);

      this.legs[side] = { sgn, hip, thigh, shortLeg, knee, shin, foot };
    }

  }

  _torsoProfile(p) {
    const keys = [
      { t: 0.00, rx: p.hipW * 0.95, rz: p.hipD * 0.95, z: 0 },
      { t: 0.10, rx: p.hipW * 0.99, rz: p.bellyD * 0.85, z: p.belly * 0.2 },
      { t: 0.26, rx: p.waistW * 1.04, rz: p.bellyD, z: p.belly },
      { t: 0.42, rx: p.waistW, rz: p.waistD + (p.bellyD - p.waistD) * 0.38, z: p.belly * 0.5 },
      { t: 0.60, rx: (p.waistW + p.shoulder) * 0.52, rz: p.chestD * 0.94, z: 0.004 },
      { t: 0.80, rx: p.shoulder * 0.99, rz: p.chestD, z: 0 },
      { t: 0.92, rx: p.shoulder * 0.9, rz: p.chestD * 0.84, z: 0 },
      { t: 1.00, rx: p.shoulder * 0.52, rz: p.chestD * 0.56, z: 0 },
    ];
    return t => {
      let i = 0;
      while (i < keys.length - 2 && t > keys[i + 1].t) i++;
      const a = keys[i], b = keys[i + 1];
      const f = clamp((t - a.t) / (b.t - a.t || 1), 0, 1);
      const e = f * f * (3 - 2 * f);
      return {
        rx: lerp(a.rx, b.rx, e),
        rz: lerp(a.rz, b.rz, e),
        z: lerp(a.z, b.z, e),
      };
    };
  }

  _applyLimbScale(p) {
    const torsoH = 0.56;
    this.torsoH = torsoH;

    updateTube(this.torsoGeo, this._torsoProfile(p), 0, torsoH);

    // 목
    this.neck.scale.set(p.neckR, 0.10, p.neckR * 1.02);
    this.neck.position.y = torsoH + 0.005;

    // 머리
    const R = p.headW;
    this.headShape.scale.set(R, R * 1.16, R * 1.04);
    this.headShape.position.y = 0.09;
    this.head.position.y = torsoH + 0.10;

    // 팔
    for (const side of ['L', 'R']) {
      const a = this.arms[side];
      a.shoulder.position.x = a.sgn * (p.shoulder * 0.86);
      a.shoulder.position.y = torsoH - 0.055;
      setLimb(a.upper, p.armR, 0.30);
      a.elbow.position.y = -0.295;
      setLimb(a.fore, p.armR * 0.86, 0.27);
      a.hand.scale.set(p.armR * 1.05, p.armR * 1.45, p.armR * 0.72);
      a.hand.position.y = -0.285;
    }

    // 반바지
    updateTube(this.shortsGeo, t => {
      const w = lerp(1.0, 1.07, t);
      return { rx: p.hipW * w, rz: p.hipD * w, z: 0 };
    }, -0.20, 0.24);

    // 다리
    for (const side of ['L', 'R']) {
      const L = this.legs[side];
      L.hip.position.x = L.sgn * p.hipW * 0.52;
      setLimb(L.thigh, p.thighR, 0.41);
      L.shortLeg.scale.set(p.thighR * 1.14, 0.085, p.thighR * 1.14);
      L.shortLeg.position.y = -0.145;
      L.knee.position.y = -0.405;
      setLimb(L.shin, p.calfR * 0.92, 0.39);
      L.foot.scale.set(0.088, 0.062, 0.225);
      L.foot.position.set(0, -0.435, 0.052);
    }
  }

  updateShape(params) {
    this._applyLimbScale(params);
  }

  _poseTargets(dt) {
    const t = this.time;
    const p = { shLx: 0, shLz: 0.11, shRx: 0, shRz: -0.11, elLx: 0.14, elRx: 0.14,
      hipLx: 0, hipRx: 0, kneeLx: 0.05, kneeRx: 0.05,
      spineX: 0, spineY: 0, bodyY: 0, headX: 0, headY: 0, breath: 0 };

    if (state.anim === 'idle') {
      const b = Math.sin(t * 1.5);
      p.breath = b * 0.5;
      p.shLz = 0.115 + b * 0.012;
      p.shRz = -0.115 - b * 0.012;
      p.shLx = Math.sin(t * 0.7) * 0.045;
      p.shRx = Math.sin(t * 0.7 + 1.6) * 0.045;
      p.elLx = 0.16 + b * 0.02;
      p.elRx = 0.16 + b * 0.02;
      p.bodyY = b * 0.004;
      p.headY = Math.sin(t * 0.42) * 0.06;
      p.headX = Math.sin(t * 0.33) * 0.03;
      p.spineY = Math.sin(t * 0.28) * 0.02;
    } else if (state.anim === 'walk') {
      const ph = t * 3.6;
      const s = Math.sin(ph), c = Math.cos(ph);
      p.hipLx = s * 0.46;
      p.hipRx = -s * 0.46;
      p.kneeLx = 0.10 + Math.max(0, -Math.sin(ph - 0.5)) * 0.85;
      p.kneeRx = 0.10 + Math.max(0, -Math.sin(ph + Math.PI - 0.5)) * 0.85;
      p.shLx = -s * 0.42;
      p.shRx = s * 0.42;
      p.shLz = 0.13; p.shRz = -0.13;
      p.elLx = 0.22 + Math.max(0, s) * 0.3;
      p.elRx = 0.22 + Math.max(0, -s) * 0.3;
      p.bodyY = Math.abs(c) * 0.012 - 0.006;
      p.spineY = s * 0.06;
      p.headY = -s * 0.04;
      p.breath = Math.sin(t * 1.4) * 0.3;
    } else if (state.anim === 'pose') {
      const b = Math.sin(t * 1.2);
      p.shLz = 2.42 + b * 0.05;
      p.shRz = -2.42 - b * 0.05;
      p.shLx = 0.12; p.shRx = 0.12;
      p.elLx = 0.55; p.elRx = 0.55;
      p.hipLx = -0.06; p.hipRx = 0.06;
      p.kneeLx = 0.06; p.kneeRx = 0.06;
      p.spineX = -0.06 + b * 0.01;
      p.headX = -0.12;
      p.bodyY = b * 0.006;
      p.breath = b * 0.6;
    }
    return p;
  }

  _applyPose(dt) {
    const target = this._poseTargets(dt);
    const k = 1 - Math.pow(0.001, dt);   // 부드러운 추적
    for (const key in target) this.pose[key] = lerp(this.pose[key], target[key], k);
    const P = this.pose;

    this.hips.rotation.set(P.spineX, P.spineY, 0);
    this.body.position.y = P.bodyY;

    this.arms.L.shoulder.rotation.set(P.shLx, 0, P.shLz);
    this.arms.R.shoulder.rotation.set(P.shRx, 0, P.shRz);
    this.arms.L.elbow.rotation.set(P.elLx, 0, 0);
    this.arms.R.elbow.rotation.set(P.elRx, 0, 0);

    this.legs.L.hip.rotation.set(P.hipLx, 0, 0);
    this.legs.R.hip.rotation.set(P.hipRx, 0, 0);
    this.legs.L.knee.rotation.set(P.kneeLx, 0, 0);
    this.legs.R.knee.rotation.set(P.kneeRx, 0, 0);

    this.head.rotation.set(P.headX, P.headY, 0);

    const br = 1 + P.breath * 0.012;
    this.torso.scale.set(br, 1 + P.breath * 0.006, br);
  }

  _observeResize() {
    const resize = () => {
      const el = this.canvas.parentElement;
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      // 모바일 세로 화면에서 인체가 잘리지 않도록 카메라 조정
      this.camera.fov = w / h < 0.85 ? 42 : 34;
      this.camera.updateProjectionMatrix();
    };
    this._resize = resize;
    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(this.canvas.parentElement);
    window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  }

  setParams(target) { this.targetParams = target; }

  _loop() {
    const render = () => {
      requestAnimationFrame(render);
      const dt = Math.min(0.05, this.clock.getDelta());
      this.time += dt;

      // 체형 모프
      if (this.targetParams) {
        const k = 1 - Math.pow(0.0008, dt);
        let changed = false;
        for (const key in this.targetParams) {
          const cur = this.cur[key];
          const tgt = this.targetParams[key];
          if (Math.abs(tgt - cur) > 1e-5) {
            this.cur[key] = lerp(cur, tgt, k);
            changed = true;
          }
        }
        if (changed) this.updateShape(this.cur);
      }

      this._applyPose(dt);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    render();
  }
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
  state.playing = false;
  const btn = $('#play');
  btn.classList.remove('playing');
  btn.textContent = '▶ 변화 과정 보기';
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

/* ---- compare slider ---- */
function initCompare() {
  const wrap = $('#compare');
  const clip = $('#compare-clip');
  const handle = $('#compare-handle');
  let dragging = false;

  const setPos = x => {
    const r = wrap.getBoundingClientRect();
    const pct = clamp(((x - r.left) / r.width) * 100, 2, 98);
    clip.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
    handle.style.left = pct + '%';
  };
  const down = e => {
    dragging = true;
    setPos(e.touches ? e.touches[0].clientX : e.clientX);
  };
  const move = e => {
    if (!dragging) return;
    setPos(e.touches ? e.touches[0].clientX : e.clientX);
    if (e.cancelable) e.preventDefault();
  };
  const up = () => { dragging = false; };

  handle.addEventListener('pointerdown', e => { dragging = true; handle.setPointerCapture?.(e.pointerId); });
  wrap.addEventListener('pointerdown', e => { dragging = true; setPos(e.clientX); });
  window.addEventListener('pointermove', e => { if (dragging) setPos(e.clientX); });
  window.addEventListener('pointerup', up);

  // 초기 위치
  clip.style.clipPath = 'inset(0 50% 0 0)';
  handle.style.left = '50%';
}

/* ---- add record ---- */
function initSheet() {
  const backdrop = $('#sheet-backdrop');
  const form = $('#record-form');
  const open = () => { backdrop.classList.remove('hidden'); form.reset(); };
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
    initData();
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

function initData() {
  refreshUI();
  const idx = clamp(Math.round(state.index), 0, state.records.length - 1);
  state.index = idx;
  setSliderUI();
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
    stopPlay();
    applyIndex(Number(e.target.value), { fromSlider: true });
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
