/* =========================================================
   1. 데이터
   ========================================================= */
import { MOVES } from './moves.js';

const HEIGHT_CM = 176;
const STORE_KEY = 'inbody3d.records.v1';
const IMG_SOURCE_DATE = '2026-10-26'; // assets/body-current.webp 를 만든 측정일
const IMG_SOURCE_SHORT = '10/26';

const state = {
  mode: 'model',
  records: [],
  index: 1,          // currently displayed record (float while morphing)
  playing: false,
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
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
  // 2026-11-26 실측(68점)을 기준점으로 근육·체지방 변화만큼 추정
  return Math.round(clamp(68 + (r.skeletalMuscle - 34.1) * 1.5 + (29.2 - r.bodyFatPct) * 0.9, 40, 95));
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

/* 체형 이미지 변신 */
function goalIndex() {
  return state.records.findIndex(r => r.goal);
}

/* 첫 화면은 마지막 실측(최신 측정) 기록 */
function defaultIndex() {
  const gi = goalIndex();
  if (gi >= 0) return Math.max(0, gi - 1);
  return Math.max(0, state.records.length - 1);
}

/* fIndex 위치에 따라 목표 이미지를 얼마나 덮을지(0~1) */
function figureProgress(fIndex) {
  const gi = goalIndex();
  if (gi < 1) return 0;
  const from = gi - 1;            // 목표 바로 앞 기록(마지막 실측)
  return clamp((fIndex - from) / (gi - from), 0, 1);
}

function applyFigure(fIndex) {
  const t = figureProgress(fIndex);
  const goal = $('#figure-goal');
  if (goal) goal.style.opacity = t.toFixed(3);
  const stage = $('#stage');
  if (stage) stage.dataset.phase = t <= 0.001 ? 'before' : (t >= 0.999 ? 'goal' : 'morph');
  const hint = $('#figure-hint');
  if (hint) {
    hint.textContent = state.playing
      ? '변신 과정을 재생하는 중…'
      : (t >= 0.999
        ? '목표 체형 미리보기 · 슬라이더로 되돌아볼 수 있습니다'
        : '슬라이더를 움직이면 체형이 서서히 변합니다');
  }
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
    moves: [
      { id: 'walk', name: '빠르게 걷기', reps: '시속 6km · 30~45분' },
      { id: 'incline', name: '인클라인 트레드밀', reps: '경사 8~12% · 30분' },
      { id: 'bike', name: '실내자전거', reps: '30~45분' },
      { id: 'postmeal', name: '식후 산책', reps: '식후 10~15분' },
    ],
    notes: [
      '주 3~4회 중강도 유산소, 주 150~250분 누적이 목표',
      '강도는 “숨이 차지만 대화는 가능한” 수준(RPE 5~6)',
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
    moves: [
      { id: 'squat', name: '스쿼트', reps: '3세트 × 10~12회' },
      { id: 'legpress', name: '레그프레스', reps: '3세트 × 12회' },
      { id: 'lunge', name: '런지', reps: '2세트 × 10회 (양쪽)' },
      { id: 'stairs', name: '계단·언덕 걷기', reps: '일상에 섞기' },
    ],
    notes: [
      '주 2회 하체 근력, 세트 사이 60~90초 휴식',
      '“마지막 2회가 힘든” 무게로 자세 우선',
      '근육 손실 방지용 단백질 — 체중 1kg당 1.2~1.6g (하루 약 105~140g)',
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
    moves: [
      { id: 'pulldown', name: '랫풀다운', reps: '3세트 × 10회' },
      { id: 'row', name: '시티드 로우', reps: '3세트 × 12회' },
      { id: 'shoulderpress', name: '숄더프레스', reps: '주 2회' },
      { id: 'pushup', name: '푸시업', reps: '주 2회' },
      { id: 'plank', name: '플랭크', reps: '30~45초 × 3' },
      { id: 'deadbug', name: '데드버그', reps: '10회 × 3' },
    ],
    notes: [
      '어깨를 뒤로 모으는 자세를 의식하면 등 근육이 제대로 쓰입니다',
    ],
  },
};

function musclePct(r) {
  return (r.skeletalMuscle / r.weight) * 100;
}

let tipsKey = null;

function moveTiles(moves) {
  return `<div class="move-grid">${moves.map(mv => `
      <div class="move">
        <div class="move-art">${MOVES[mv.id] || ''}</div>
        <div class="move-name">${mv.name}</div>
        ${mv.reps ? `<div class="move-reps">${mv.reps}</div>` : ''}
      </div>`).join('')}</div>`;
}

function moveNotes(notes) {
  return `<ul class="tip-notes">${notes.map(n => `<li>${n}</li>`).join('')}</ul>`;
}

function renderTips(r) {
  if (r === tipsKey) return;
  tipsKey = r;
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
        ${moveTiles([
          { id: 'fullbody', name: '전신 근력', reps: '주 3회 · 각 40분' },
          { id: 'bike', name: '유산소', reps: '주 2회 20~30분' },
        ])}
        ${moveNotes([
          '근력 운동과 유산소를 같은 날 할 때는 근력을 먼저, 유산소를 뒤에',
          '단백질은 체중 1kg당 1.2~1.6g 유지, 수분 하루 2L',
          '월 1회 인바디 재측정으로 체지방률 ±1% 안에서 관리',
        ])}
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
      ${moveTiles(t.lib.moves)}
      ${moveNotes(t.lib.notes)}
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

/* ---------- 수치 변화 그래프 ---------- */
const METRICS = [
  { id: 'weight', name: '체중', unit: 'kg', digits: 1, lower: true, get: r => r.weight },
  { id: 'skeletalMuscle', name: '골격근량', unit: 'kg', digits: 1, lower: false, get: r => r.skeletalMuscle },
  { id: 'bodyFatPct', name: '체지방률', unit: '%', digits: 1, lower: true, get: r => r.bodyFatPct },
  { id: 'bodyFatMass', name: '체지방량', unit: 'kg', digits: 1, lower: true, get: fatMassOf },
  { id: 'bmi', name: 'BMI', unit: '', digits: 1, lower: true, get: bmiOf },
  { id: 'waistRatio', name: '복부지방률', unit: '', digits: 2, lower: true, get: waistOf },
  { id: 'visceralFat', name: '내장지방', unit: '레벨', digits: 0, lower: true, get: visceralOf },
  { id: 'score', name: '인바디점수', unit: '점', digits: 0, lower: false, get: scoreOf },
];

let chartMetric = 'weight';
let chartSig = '';
let chartObserver = null;

function renderChartTabs() {
  const el = document.getElementById('chart-tabs');
  if (!el || el.dataset.ready) return;
  el.innerHTML = METRICS.map(m =>
    `<button class="chart-tab${m.id === chartMetric ? ' on' : ''}" data-metric="${m.id}" role="tab">${m.name}</button>`).join('');
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-metric]');
    if (!b) return;
    chartMetric = b.dataset.metric;
    [...el.children].forEach(c => c.classList.toggle('on', c === b));
    chartSig = '';
    renderChart();
  });
  el.dataset.ready = '1';
}

function observeChart() {
  const host = document.getElementById('chart-plot');
  if (!host || chartObserver) return;
  chartObserver = new ResizeObserver(() => {
    clearTimeout(host._t);
    host._t = setTimeout(() => renderChart(), 120);
  });
  chartObserver.observe(host);
}

function niceStep(rough, integer) {
  if (!isFinite(rough) || rough <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const nrm = rough / mag;
  let step = (nrm <= 1 ? 1 : nrm <= 2 ? 2 : nrm <= 2.5 ? 2.5 : nrm <= 5 ? 5 : 10) * mag;
  if (integer) step = Math.max(1, Math.round(step));
  return step;
}

function renderChart() {
  const host = document.getElementById('chart-plot');
  const sum = document.getElementById('chart-sum');
  if (!host) return;

  const m = METRICS.find(x => x.id === chartMetric) || METRICS[0];
  const meas = state.records.filter(r => !r.goal && m.get(r) != null);
  const goal = state.records.find(r => r.goal);
  const goalV = goal && m.get(goal) != null ? m.get(goal) : null;

  const W = Math.max(240, Math.round(host.clientWidth || 320));
  const sig = [m.id, W, m.digits, meas.map(r => `${r.date}:${m.get(r)}`).join(','), goalV].join('|');
  if (sig === chartSig) return;
  chartSig = sig;

  if (!meas.length) {
    host.innerHTML = '<p class="chart-empty">표시할 측정 기록이 없습니다.</p>';
    if (sum) sum.innerHTML = '';
    return;
  }

  const digits = v => (m.digits ? Number(v).toFixed(m.digits) : String(Math.round(v)));
  const H = W < 420 ? 190 : 214;
  const padL = m.digits === 0 ? 26 : 34;
  const padR = 10, padT = 26, padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const vals = meas.map(m.get);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 1e-9) {
    const p = Math.max(0.5, Math.abs(hi) * 0.02);
    lo -= p; hi += p;
  }
  /* 보기 좋은 눈금(1·2·2.5·5·10 배수)으로 축 범위를 맞춘다 */
  const step = niceStep((hi - lo) / 3, m.digits === 0);
  const lo0 = Math.floor(lo / step) * step;
  const hi0 = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = lo0; v <= hi0 + step * 1e-6; v += step) ticks.push(v);
  lo = lo0; hi = hi0;
  const yOf = v => padT + (1 - (v - lo) / (hi - lo)) * plotH;
  const n = meas.length;
  const xOf = i => (n === 1 ? padL + plotW / 2 : padL + (plotW * i) / (n - 1));

  /* 눈금 + 축 라벨 */
  const grid = ticks.map(t => {
    const yy = yOf(t).toFixed(1);
    return `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>` +
      `<text x="${padL - 7}" y="${(Number(yy) + 3.2).toFixed(1)}" text-anchor="end" font-size="9.5" fill="#7f8c9d">${digits(t)}</text>`;
  }).join('');

  /* 목표선 (그래프 범위 안에 있을 때만) */
  let goalEl = '';
  if (goalV != null && goalV >= lo && goalV <= hi) {
    const gy = yOf(goalV).toFixed(1);
    goalEl = `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="#6aa9ff" stroke-width="1.4" stroke-dasharray="4 4" opacity=".7"/>` +
      `<text x="${W - padR}" y="${(Number(gy) - 5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="#9dc0ff">목표 ${digits(goalV)}${m.unit}</text>`;
  }

  /* 선 + 영역 */
  const pts = meas.map((r, i) => [xOf(i), yOf(m.get(r))]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  const baseY = (padT + plotH).toFixed(1);
  const area = n > 1
    ? `<path d="${line}L${pts[n - 1][0].toFixed(1)} ${baseY}L${pts[0][0].toFixed(1)} ${baseY}Z" fill="url(#chartArea)"/>`
    : '';
  const stroke = n > 1
    ? `<path d="${line}" fill="none" stroke="#2ee6a8" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`
    : '';

  /* 점 + 수치 라벨 + 날짜 라벨 */
  const dots = meas.map((r, i) => {
    const [x, y] = pts[i];
    const last = i === n - 1;
    const anchor = n === 1 ? 'middle' : (i === 0 ? 'start' : (last ? 'end' : 'middle'));
    const dot = `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${last ? 4.4 : 3.4}" fill="#0d1219" stroke="#2ee6a8" stroke-width="2.2"/>` +
      (last ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8.5" fill="#2ee6a8" opacity=".14"/>` : '');
    const vx = Math.min(W - 12, Math.max(12, x));
    const label = `<text x="${vx.toFixed(1)}" y="${(y - 9).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${last ? '#2ee6a8' : '#e9eef5'}">${digits(m.get(r))}</text>`;
    const dx = anchor === 'start' ? Math.max(padL, x) : (anchor === 'end' ? Math.min(W - padR, x) : x);
    const dt = `<text x="${dx.toFixed(1)}" y="${H - 8}" text-anchor="${anchor}" font-size="9.5" fill="#8c9aad">${shortDate(r)}</text>`;
    return dot + label + dt;
  }).join('');

  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${m.name} 변화 그래프">
    <defs><linearGradient id="chartArea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2ee6a8" stop-opacity="0.26"/>
      <stop offset="1" stop-color="#2ee6a8" stop-opacity="0"/>
    </linearGradient></defs>
    ${grid}${goalEl}${area}${stroke}${dots}
    <text x="6" y="12" text-anchor="start" font-size="9.5" fill="#7f8c9d">${m.unit || m.name}</text>
  </svg>`;

  /* 요약 */
  if (sum) {
    const a = m.get(meas[0]), b = m.get(meas[n - 1]);
    const d = b - a;
    const good = m.lower ? d < 0 : d > 0;
    let html = `<span>${shortDate(meas[0])} → ${shortDate(meas[n - 1])}</span>` +
      `<b>${digits(a)}${m.unit} → ${digits(b)}${m.unit}</b>`;
    if (n > 1 && Math.abs(d) > 1e-9) {
      html += `<span class="delta ${good ? 'good' : 'bad'}">${d > 0 ? '+' : ''}${digits(d)}${m.unit}</span>`;
    }
    if (goalV != null) html += `<span class="goal">목표 ${digits(goalV)}${m.unit}</span>`;
    sum.innerHTML = html;
  }
}

function renderGallery() {
  const rs = state.records;
  $('#card-count').textContent = `${rs.length}개`;
  $('#gallery').innerHTML = rs.map((r, i) => {
    const isGoal = !!r.goal;
    const src = isGoal ? 'assets/body-goal.webp' : 'assets/body-current.webp';
    let caption = '';
    if (!isGoal) caption = (r.date || '') === IMG_SOURCE_DATE
      ? '실제 측정 기반 체형 이미지'
      : `${IMG_SOURCE_SHORT} 체형 이미지로 표현`;
    if (isGoal) caption = '목표 체형 이미지';
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
  renderChart();
  renderGallery();
  renderRecordList();
  $('#date-slider').max = String(Math.max(1, state.records.length - 1));
  $('#compare-range').textContent =
    `${fmt(state.records[0].weight)}kg · ${fmt(state.records[0].bodyFatPct)}% → ` +
    `${fmt(state.records[state.records.length - 1].weight)}kg · ${fmt(state.records[state.records.length - 1].bodyFatPct)}%`;
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
function setSliderUI() {
  $('#date-slider').value = String(state.index);
}

function applyIndex(i, { fromSlider = false } = {}) {
  state.index = clamp(i, 0, state.records.length - 1);
  applyFigure(state.index);
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

  // 0부터 시작해서 마지막까지 (모습이 바뀌지 않는 구간은 짧게)
  const seq = [];
  for (let i = 0; i < n - 1; i++) {
    const moving = Math.abs(figureProgress(i + 1) - figureProgress(i)) > 0.01;
    seq.push({ from: i, to: i + 1, dur: moving ? 2600 : 700, hold: moving ? 1000 : 350 });
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
      applyFigure(state.index);
      renderStats();
      setSliderUI();
      requestAnimationFrame(step);
    } else if (el < seg.dur + seg.hold) {
      state.index = seg.to;
      applyFigure(state.index);
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
  let idx = defaultIndex();
  if (focusId) {
    const found = state.records.findIndex(r => r.id === focusId);
    if (found >= 0) idx = found;
  }
  state.index = idx;
  setSliderUI();
  renderStats();
  applyFigure(state.index);
}

async function init() {
  await loadRecords();
  initData();
  initCompare();
  initSheet();
  renderChartTabs();
  observeChart();
  renderChart();

  document.querySelectorAll('.tab').forEach(t =>
    t.addEventListener('click', () => switchMode(t.dataset.tab)));

  $('#date-slider').addEventListener('input', e => {
    const v = Number(e.target.value);
    stopPlay();
    applyIndex(v, { fromSlider: true });
  });
  $('#play').addEventListener('click', play);

  // 체형 이미지 준비되면 로더 숨김
  const figs = [...document.querySelectorAll('.figure-img')];
  Promise.all(figs.map(img => (img.complete && img.naturalWidth
    ? Promise.resolve()
    : new Promise(res => { img.addEventListener('load', res, { once: true }); img.addEventListener('error', res, { once: true }); }))))
    .then(() => {
      $('#loader').classList.add('hidden');
      figs.forEach(img => img.decode && img.decode().catch(() => {}));
    });

  // 첫 화면
  applyFigure(state.index);

  // PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
