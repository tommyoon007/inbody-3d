/* =========================================================
   운동 동작 일러스트 (인라인 SVG)
   - 72×72 뷰박스, 사람 실루엣 + 움직임 화살표 + 자극 부위 강조
   - 한도·로딩 절약을 위해 이미지 생성 없이 선(line) 도형으로만 그림
   - 관절(엉덩이·무릎·어깨·팔꿈치)을 <g>로 묶어 두고,
     styles.css의 @keyframes가 그 <g>를 회전·이동시켜 실제 동작처럼 반복 재생
   ========================================================= */

const INK = 'fill="none" stroke="#e8f0f8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"';
const INK2 = 'fill="none" stroke="#e8f0f8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity=".45"';
const GEAR = 'fill="none" stroke="rgba(255,255,255,0.30)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"';
const THIN = 'fill="none" stroke="rgba(255,255,255,0.34)" stroke-width="2" stroke-linecap="round"';
const MOVE = 'fill="none" stroke="#2ee6a8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';

const ground = (y = 66) =>
  `<path d="M6 ${y}H66" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="2" stroke-linecap="round"/>`;
const glow = (cx, cy, rx, ry) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#2ee6a8" opacity="0.22"/>`;
const head = (cx, cy, r = 5) => `<circle cx="${cx}" cy="${cy}" r="${r}" ${INK}/>`;
const arrowR = (x, y, len = 11) =>
  `<path d="M${x} ${y}h${len}" ${MOVE}/><path d="M${x + len - 4} ${y - 4}l4 4-4 4" ${MOVE}/>`;
const arrowL = (x, y, len = 11) =>
  `<path d="M${x} ${y}h-${len}" ${MOVE}/><path d="M${x - len + 4} ${y - 4}l-4 4 4 4" ${MOVE}/>`;
const arrowU = (x, y, len = 12) =>
  `<path d="M${x} ${y}v-${len}" ${MOVE}/><path d="M${x - 4} ${y - len + 4}l4-4 4 4" ${MOVE}/>`;
const arrowD = (x, y, len = 12) =>
  `<path d="M${x} ${y}v${len}" ${MOVE}/><path d="M${x - 4} ${y + len - 4}l4 4 4-4" ${MOVE}/>`;
const arrowBoth = (x, y1, y2) =>
  `<path d="M${x} ${y1}v${y2 - y1}" ${MOVE}/>` +
  `<path d="M${x - 4} ${y1 + 4}l4-4 4 4" ${MOVE}/>` +
  `<path d="M${x - 4} ${y2 - 4}l4 4 4-4" ${MOVE}/>`;

// 움직임이 있는 부위(관절) 묶음
const grp = (cls, inner) => `<g class="${cls}">${inner}</g>`;

const svg = (inner, groundY = null, cls = '') =>
  `<svg class="mv ${cls}" viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">` +
  (groundY == null ? '' : ground(groundY)) +
  inner +
  `</svg>`;

const MOVES = {
  /* ================= 유산소 ================= */

  /* 빠르게 걷기 — 두 다리·두 팔 교대 스윙, 상체 상하 바운스 */
  walk: svg(
    grp(
      'w-body',
      head(36, 15, 5) +
        `<path d="M36 20L33 38" ${INK}/>` +
        grp('w-leg-a',
          `<path d="M33 38L41 47" ${INK}/>` +
          grp('w-shin-a', `<path d="M41 47L43 60" ${INK}/><path d="M43 60L42 64H47" ${INK}/>`)) +
        grp('w-leg-b',
          `<path d="M33 38L27 49" ${INK}/>` +
          grp('w-shin-b', `<path d="M27 49L24 61" ${INK}/><path d="M24 61L21 64H27" ${INK}/>`)) +
        grp('w-arm-a',
          `<path d="M35 25L41 30" ${INK}/>` +
          grp('w-fore-a', `<path d="M41 30L44 36" ${INK}/>`)) +
        grp('w-arm-b',
          `<path d="M34 25L28 30" ${INK2}/>` +
          grp('w-fore-b', `<path d="M28 30L25 35" ${INK2}/>`))
    ) +
      grp('arw arw-r', arrowR(52, 22, 12) + arrowR(52, 33, 12)),
    66,
    'mv-walk'
  ),

  /* 식후 산책 — 같은 보행이되 더 느리고 작게, 시계는 살짝 맥동 */
  postmeal: svg(
    grp(
      'p-body',
      head(36, 15, 5) +
        `<path d="M36 20L33 38" ${INK}/>` +
        grp('p-leg-a',
          `<path d="M33 38L40 47" ${INK}/>` +
          grp('p-shin-a', `<path d="M40 47L42 59" ${INK}/><path d="M42 59L41 63H46" ${INK}/>`)) +
        grp('p-leg-b',
          `<path d="M33 38L28 49" ${INK}/>` +
          grp('p-shin-b', `<path d="M28 49L25 60" ${INK}/><path d="M25 60L22 63H28" ${INK}/>`)) +
        grp('p-arm-a',
          `<path d="M35 25L40 30" ${INK}/>` +
          grp('p-fore-a', `<path d="M40 30L43 35" ${INK}/>`)) +
        grp('p-arm-b',
          `<path d="M34 25L29 30" ${INK2}/>` +
          grp('p-fore-b', `<path d="M29 30L26 35" ${INK2}/>`))
    ) +
      grp('p-clock', `<circle cx="59" cy="14" r="7" ${MOVE}/><path d="M59 10v4l3 2" ${MOVE}/>`),
    64,
    'mv-postmeal'
  ),

  /* 인클라인 트레드밀 — 경사로 위를 걷는 보행, 위쪽 화살표 맥동 */
  incline: svg(
    `<path d="M12 62L54 48" ${GEAR}/>` +
      `<path d="M58 64V36" ${GEAR}/><path d="M48 36H60" ${GEAR}/>` +
      grp(
        'i-body',
        head(27, 18, 5) +
          `<path d="M28 23L32 40" ${INK}/>` +
          grp('i-leg-a',
            `<path d="M32 40L40 47" ${INK}/>` +
            grp('i-shin-a', `<path d="M40 47L44 51" ${INK}/>`)) +
          grp('i-leg-b',
            `<path d="M32 40L25 51" ${INK}/>` +
            grp('i-shin-b', `<path d="M25 51L22 59" ${INK}/>`)) +
          grp('i-arm-a',
            `<path d="M31 27L38 33" ${INK}/>` +
            grp('i-fore-a', `<path d="M38 33L36 40" ${INK}/>`)) +
          grp('i-arm-b',
            `<path d="M30 27L23 33" ${INK2}/>` +
            grp('i-fore-b', `<path d="M23 33L26 39" ${INK2}/>`))
      ) +
      grp('arw arw-u', `<path d="M10 22l4-4 4 4" ${MOVE}/><path d="M10 30l4-4 4 4" ${MOVE}/>`),
    66,
    'mv-incline'
  ),

  /* 실내자전거 — 안장에 앉아 두 다리 페달 회전 */
  bike: svg(
    `<circle cx="57" cy="46" r="7.5" ${GEAR}/><circle cx="57" cy="46" r="1.8" ${THIN}/>` +
      `<path d="M25 34L32 52L57 46" ${THIN}/>` +
      `<path d="M32 52L54 32" ${THIN}/>` +
      `<path d="M54 32V27" ${THIN}/><path d="M50 26H60" ${GEAR}/>` +
      `<path d="M18 33H26" ${GEAR}/>` +
      `<path d="M32 52L37 58" ${THIN}/><path d="M35 60H41" ${THIN}/>` +
      `<path d="M30 64H62" ${THIN}/><path d="M57 53.5V64" ${THIN}/>` +
      grp(
        'b-body',
        head(35, 18, 4.5) +
          `<path d="M26 34L34 25" ${INK}/>` +
          grp('b-arm',
            `<path d="M34 26L42 28" ${INK}/>` +
            grp('b-fore', `<path d="M42 28L50 27" ${INK}/>`)) +
          grp('b-leg-a',
            `<path d="M26 34L37 41" ${INK}/>` +
            grp('b-shin-a', `<path d="M37 41L37 57" ${INK}/>`)) +
          grp('b-leg-b',
            `<path d="M26 34L34 42" ${INK2}/>` +
            grp('b-shin-b', `<path d="M34 42L30 52" ${INK2}/>`))
      ),
    66,
    'mv-bike'
  ),

  /* 계단 오르기 — 다리 교대 디디기 + 위로 오르는 화살표 */
  stairs: svg(
    `<path d="M30 66V58H38V50H46V42H54V34H62V26" ${GEAR}/>` +
      grp(
        's-body',
        head(21, 20, 4.8) +
          `<path d="M21 25L24 40" ${INK}/>` +
          grp('s-leg-a',
            `<path d="M24 40L35 43" ${INK}/>` +
            grp('s-shin-a', `<path d="M35 43L36 58" ${INK}/>`)) +
          grp('s-leg-b',
            `<path d="M24 40L17 52" ${INK}/>` +
            grp('s-shin-b', `<path d="M17 52L13 64" ${INK}/><path d="M9 64H16" ${INK2}/>`)) +
          grp('s-arm-a', `<path d="M22 29L29 34" ${INK}/>`) +
          grp('s-arm-b', `<path d="M20 30L15 36" ${INK2}/>`)
      ) +
      grp('arw arw-u', arrowU(8, 50, 12)),
    66,
    'mv-stairs'
  ),

  /* ================= 하체 ================= */

  /* 스쿼트 — 엉덩이를 뒤로 빼며 무릎 굽혔다 펴기 */
  squat: svg(
    grp('glow', glow(34, 37, 8, 6)) +
      grp(
        'q-body',
        head(30, 14, 5) +
          `<path d="M30 19L34 36" ${INK}/>` +
          grp('q-arm', `<path d="M31 24L41 27L46 25" ${INK}/>`)
      ) +
      grp('q-leg-a',
        `<path d="M34 36L45 42" ${INK}/>` +
        grp('q-shin-a', `<path d="M45 42L43 62" ${INK}/><path d="M43 62L39 65H48" ${INK}/>`)) +
      grp('q-leg-b',
        `<path d="M34 36L44 44" ${INK2}/>` +
        grp('q-shin-b', `<path d="M44 44L42 62" ${INK2}/>`)) +
      grp('arw arw-b', arrowBoth(60, 20, 46)),
    66,
    'mv-squat'
  ),

  /* 레그프레스 — 발판을 밀었다가 천천히 되돌리기 */
  legpress: svg(
    `<path d="M14 26L22 40" ${GEAR}/><path d="M22 44H34" ${GEAR}/>` +
      `<path d="M34 44L34 56" ${THIN}/>` +
      grp('l-plate', `<path d="M54 20V54" ${GEAR}/><path d="M46 54H62" ${THIN}/>`) +
      grp('l-body',
        head(14, 30, 4.4) +
          `<path d="M18 33L30 43" ${INK}/>`) +
      grp('l-legs',
        grp('l-leg-a',
          `<path d="M30 43L40 37" ${INK}/>` +
          grp('l-shin-a', `<path d="M40 37L52 31" ${INK}/>`)) +
        grp('l-leg-b',
          `<path d="M30 43L40 41" ${INK2}/>` +
          grp('l-shin-b', `<path d="M40 41L52 36" ${INK2}/>`))) +
      grp('arw arw-r', arrowR(24, 16, 12)),
    66,
    'mv-legpress'
  ),

  /* 런지 — 앞무릎 굽혀 몸을 내렸다 올리기 */
  lunge: svg(
    grp('glow', glow(33, 35, 7, 5.5)) +
      grp(
        'u-body',
        head(32, 12, 5) +
          `<path d="M32 17V34" ${INK}/>` +
          grp('u-arm-a', `<path d="M31 23L29 34" ${INK}/>`) +
          grp('u-arm-b', `<path d="M34 23L37 33" ${INK2}/>`)
      ) +
      grp('u-leg-a',
        `<path d="M32 34L44 38" ${INK}/>` +
        grp('u-shin-a', `<path d="M44 38L44 61" ${INK}/><path d="M44 61L40 65H49" ${INK}/>`)) +
      grp('u-leg-b',
        `<path d="M32 34L23 50" ${INK}/>` +
        grp('u-shin-b', `<path d="M23 50L17 62" ${INK}/><path d="M17 62L13 65H20" ${INK2}/>`)) +
      grp('arw arw-b', arrowBoth(56, 20, 46)),
    66,
    'mv-lunge'
  ),

  /* ================= 상체 ================= */

  /* 랫풀다운 — 바를 당겨 내리고 팔꿈치 굽히기 */
  pulldown: svg(
    `<path d="M62 66V10H48" ${GEAR}/>` +
      grp('d-cable', `<path d="M48 10V22" ${THIN}/>`) +
      grp('d-bar', `<path d="M34 22H56" ${GEAR}/>`) +
      `<path d="M28 52H44" ${GEAR}/><path d="M33 52V66" ${THIN}/>` +
      grp('glow', glow(34, 41, 4, 7) + glow(42, 41, 4, 7)) +
      grp(
        'd-body',
        head(38, 33, 4.6) +
          `<path d="M38 38V50" ${INK}/>` +
          `<path d="M38 50L50 52L52 62" ${INK}/>` +
          `<path d="M52 62L48 65H56" ${INK2}/>`
      ) +
      grp('d-arm-a',
        `<path d="M37 41L30 34" ${INK}/>` +
        grp('d-fore-a', `<path d="M30 34L37 23" ${INK}/>`)) +
      grp('d-arm-b',
        `<path d="M39 41L46 34" ${INK}/>` +
        grp('d-fore-b', `<path d="M46 34L49 23" ${INK}/>`)) +
      grp('arw arw-d', arrowD(52, 13, 7)),
    66,
    'mv-pulldown'
  ),

  /* 시티드 로우 — 팔꿈치를 뒤로 당기며 등 수축 */
  row: svg(
    `<path d="M60 34V60" ${GEAR}/><path d="M52 66H64" ${THIN}/>` +
      `<path d="M20 50H36" ${GEAR}/><path d="M26 50V66" ${THIN}/>` +
      `<path d="M24 44L38 46L58 44" ${INK}/>` +
      `<path d="M24 44L38 49L57 47" ${INK2}/>` +
      grp('glow', glow(27, 34, 4, 7)) +
      grp(
        'r-torso',
        head(22, 22, 4.6) +
          `<path d="M22 27L24 44" ${INK}/>` +
          grp('r-arm',
            `<path d="M23 31L32 35" ${INK}/>` +
            grp('r-fore', `<path d="M32 35L40 34" ${INK}/>`))
      ) +
      grp('r-cable', `<path d="M58 34H41" ${THIN}/>`) +
      grp('arw arw-l', arrowL(50, 25, 11)),
    66,
    'mv-row'
  ),

  /* 푸시업 — 몸통을 낮추며 팔꿈치 굽혀펴기 */
  pushup: svg(
    grp(
      'p-fig',
      head(17, 37, 4.5) +
        `<path d="M22 40L40 44L56 47" ${INK}/>` +
        `<path d="M56 47L58 54" ${INK}/>` +
        grp('p-arm',
          `<path d="M22 40L21 47" ${INK}/>` +
          grp('p-fore', `<path d="M21 47L26 54" ${INK}/>`))
    ) +
      grp('arw arw-b', arrowBoth(46, 26, 37)),
    58,
    'mv-pushup'
  ),

  /* 숄더프레스 — 덤벨을 머리 위로 밀어 올렸다 내리기 */
  shoulderpress: svg(
    grp('glow', glow(33, 27, 3, 3) + glow(39, 27, 3, 3)) +
      grp(
        'h-body',
        head(36, 17, 5) +
          `<path d="M36 22V44" ${INK}/>` +
          `<path d="M36 44L30 65" ${INK}/><path d="M25 66H33" ${INK2}/>` +
          `<path d="M36 44L42 65" ${INK}/><path d="M38 66H46" ${INK2}/>`
      ) +
      grp('h-arm-a',
        `<path d="M34 26L26 21" ${INK}/>` +
        grp('h-fore-a', `<path d="M26 21L29 14" ${INK}/>`)) +
      grp('h-arm-b',
        `<path d="M38 26L46 21" ${INK}/>` +
        grp('h-fore-b', `<path d="M46 21L43 14" ${INK}/>`)) +
      grp('h-dumb-a',
        `<path d="M24 13H34" ${THIN}/><circle cx="24" cy="13" r="2.4" fill="rgba(255,255,255,0.30)"/>` +
        `<circle cx="34" cy="13" r="2.4" fill="rgba(255,255,255,0.30)"/>`) +
      grp('h-dumb-b',
        `<path d="M38 13H48" ${THIN}/><circle cx="38" cy="13" r="2.4" fill="rgba(255,255,255,0.30)"/>` +
        `<circle cx="48" cy="13" r="2.4" fill="rgba(255,255,255,0.30)"/>`) +
      grp('arw arw-u', arrowU(58, 42, 14)),
    66,
    'mv-shoulderpress'
  ),

  /* 플랭크 — 자세 유지, 코어 라인이 맥동하고 미세하게 호흡 */
  plank: svg(
    grp(
      'k-fig',
      head(16, 37, 4.5) +
        `<path d="M21 39L40 45L56 48" ${INK}/>` +
        `<path d="M56 48L58 56" ${INK}/>` +
        `<path d="M21 39L20 48L11 53" ${INK}/>`
    ) +
      `<path class="k-core" d="M13 34L59 45" fill="none" stroke="#2ee6a8" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="3 5" opacity=".55"/>`,
    58,
    'mv-plank'
  ),

  /* 데드버그 — 반대쪽 팔·다리를 교차로 뻗기 */
  deadbug: svg(
    grp('glow', glow(24, 44, 7, 3)) +
      head(11, 42, 4.6) +
      grp('x-body', `<path d="M16 43L32 45" ${INK}/>`) +
      grp('x-arm-a', `<path d="M17 43L16 30" ${INK}/>`) +
      grp('x-arm-b', `<path d="M16 43L7 39" ${INK2}/>`) +
      grp('x-leg-a',
        `<path d="M33 45L33 31" ${INK}/>` +
        grp('x-shin-a', `<path d="M33 31L43 31" ${INK}/>`)) +
      grp('x-leg-b', `<path d="M33 45L47 48" ${INK2}/>`),
    54,
    'mv-deadbug'
  ),

  /* 전신 근력 — 바벨을 얹고 앉았다 일어나기 */
  fullbody: svg(
    grp('glow', glow(34, 42, 5, 4) + glow(40, 42, 5, 4)) +
      grp(
        'f-body',
        head(36, 13, 5) +
          `<path d="M36 18V40" ${INK}/>` +
          `<path d="M22 23H50" ${GEAR}/>` +
          `<rect x="18" y="17" width="4" height="12" rx="1.6" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>` +
          `<rect x="50" y="17" width="4" height="12" rx="1.6" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>` +
          `<path d="M33 27L27 23" ${INK}/><path d="M39 27L45 23" ${INK}/>`
      ) +
      grp('f-leg-a', `<path d="M36 40L31 64" ${INK}/><path d="M26 66H34" ${INK2}/>`) +
      grp('f-leg-b', `<path d="M36 40L41 64" ${INK}/><path d="M38 66H46" ${INK2}/>`) +
      grp('arw arw-b', arrowBoth(60, 22, 44)),
    66,
    'mv-fullbody'
  ),
};

export { MOVES };
