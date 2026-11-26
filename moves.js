/* =========================================================
   운동 동작 일러스트 (인라인 SVG)
   - 72×72 뷰박스, 사람 실루엣 + 움직임 화살표 + 자극 부위 강조
   - 한도·로딩 절약을 위해 이미지 생성 없이 선(line) 도형으로만 그림
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

const svg = (inner, groundY = null) =>
  `<svg viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">` +
  (groundY == null ? '' : ground(groundY)) +
  inner +
  `</svg>`;

const MOVES = {
  /* ---------- 유산소 ---------- */
  walk: svg(
    head(36, 15, 5) +
      `<path d="M36 20L33 38" ${INK}/>` +
      `<path d="M33 38L41 47L43 60" ${INK}/>` +
      `<path d="M43 60L42 64H47" ${INK}/>` +
      `<path d="M33 38L27 49L24 61" ${INK}/>` +
      `<path d="M24 61L21 64H27" ${INK}/>` +
      `<path d="M35 25L41 30L44 36" ${INK}/>` +
      `<path d="M34 25L28 30L25 35" ${INK2}/>` +
      arrowR(52, 22, 12) +
      arrowR(52, 33, 12),
    66
  ),

  postmeal: svg(
    head(36, 15, 5) +
      `<path d="M36 20L33 38" ${INK}/>` +
      `<path d="M33 38L40 47L42 59" ${INK}/>` +
      `<path d="M42 59L41 63H46" ${INK}/>` +
      `<path d="M33 38L28 49L25 60" ${INK}/>` +
      `<path d="M25 60L22 63H28" ${INK}/>` +
      `<path d="M35 25L40 30L43 35" ${INK}/>` +
      `<path d="M34 25L29 30L26 35" ${INK2}/>` +
      `<circle cx="59" cy="14" r="7" ${MOVE}/><path d="M59 10v4l3 2" ${MOVE}/>`,
    64
  ),

  incline: svg(
    `<path d="M12 62L54 48" ${GEAR}/>` +
      `<path d="M58 64V36" ${GEAR}/><path d="M48 36H60" ${GEAR}/>` +
      head(27, 18, 5) +
      `<path d="M28 23L32 40" ${INK}/>` +
      `<path d="M32 40L40 47L44 51" ${INK}/>` +
      `<path d="M32 40L25 51L22 59" ${INK}/>` +
      `<path d="M31 27L38 33L36 40" ${INK}/>` +
      `<path d="M30 27L23 33L26 39" ${INK2}/>` +
      `<path d="M10 22l4-4 4 4" ${MOVE}/><path d="M10 30l4-4 4 4" ${MOVE}/>`,
    66
  ),

  bike: svg(
    `<circle cx="57" cy="46" r="7.5" ${GEAR}/><circle cx="57" cy="46" r="1.8" ${THIN}/>` +
      `<path d="M25 34L32 52L57 46" ${THIN}/>` +
      `<path d="M32 52L54 32" ${THIN}/>` +
      `<path d="M54 32V27" ${THIN}/><path d="M50 26H60" ${GEAR}/>` +
      `<path d="M18 33H26" ${GEAR}/>` +
      `<path d="M32 52L37 58" ${THIN}/><path d="M35 60H41" ${THIN}/>` +
      `<path d="M30 64H62" ${THIN}/><path d="M57 53.5V64" ${THIN}/>` +
      head(35, 18, 4.5) +
      `<path d="M26 34L34 25" ${INK}/>` +
      `<path d="M34 26L42 28L50 27" ${INK}/>` +
      `<path d="M26 34L37 41L37 57" ${INK}/>` +
      `<path d="M26 34L34 42L30 52" ${INK2}/>`,
    66
  ),

  stairs: svg(
    `<path d="M30 66V58H38V50H46V42H54V34H62V26" ${GEAR}/>` +
      head(21, 20, 4.8) +
      `<path d="M21 25L24 40" ${INK}/>` +
      `<path d="M24 40L35 43L36 58" ${INK}/>` +
      `<path d="M24 40L17 52L13 64" ${INK}/>` +
      `<path d="M9 64H16" ${INK2}/>` +
      `<path d="M22 29L29 34" ${INK}/>` +
      `<path d="M20 30L15 36" ${INK2}/>` +
      arrowU(8, 50, 12),
    66
  ),

  /* ---------- 하체 ---------- */
  squat: svg(
    glow(34, 37, 8, 6) +
      head(30, 14, 5) +
      `<path d="M30 19L34 36" ${INK}/>` +
      `<path d="M34 36L45 42L43 62" ${INK}/>` +
      `<path d="M43 62L39 65H48" ${INK}/>` +
      `<path d="M34 36L44 44L42 62" ${INK2}/>` +
      `<path d="M31 24L41 27L46 25" ${INK}/>` +
      arrowBoth(60, 20, 46),
    66
  ),

  legpress: svg(
    `<path d="M14 26L22 40" ${GEAR}/><path d="M22 44H34" ${GEAR}/>` +
      `<path d="M34 44L34 56" ${THIN}/>` +
      `<path d="M54 20V54" ${GEAR}/><path d="M46 54H62" ${THIN}/>` +
      head(14, 30, 4.4) +
      `<path d="M18 33L30 43" ${INK}/>` +
      `<path d="M30 43L40 37L52 31" ${INK}/>` +
      `<path d="M30 43L40 41L52 36" ${INK2}/>` +
      arrowR(24, 16, 12),
    66
  ),

  lunge: svg(
    glow(33, 35, 7, 5.5) +
      head(32, 12, 5) +
      `<path d="M32 17V34" ${INK}/>` +
      `<path d="M32 34L44 38L44 61" ${INK}/>` +
      `<path d="M44 61L40 65H49" ${INK}/>` +
      `<path d="M32 34L23 50L17 62" ${INK}/>` +
      `<path d="M17 62L13 65H20" ${INK2}/>` +
      `<path d="M31 23L29 34" ${INK}/><path d="M34 23L37 33" ${INK2}/>` +
      arrowBoth(56, 20, 46),
    66
  ),

  /* ---------- 상체 ---------- */
  pulldown: svg(
    `<path d="M62 66V10H48" ${GEAR}/><path d="M48 10V22" ${THIN}/>` +
      `<path d="M34 22H56" ${GEAR}/>` +
      `<path d="M28 52H44" ${GEAR}/><path d="M33 52V66" ${THIN}/>` +
      glow(34, 41, 4, 7) +
      glow(42, 41, 4, 7) +
      head(38, 33, 4.6) +
      `<path d="M38 38V50" ${INK}/>` +
      `<path d="M38 50L50 52L52 62" ${INK}/>` +
      `<path d="M52 62L48 65H56" ${INK2}/>` +
      `<path d="M37 41L30 34L37 23" ${INK}/>` +
      `<path d="M39 41L46 34L49 23" ${INK}/>` +
      arrowD(52, 13, 7),
    66
  ),

  row: svg(
    `<path d="M60 34V60" ${GEAR}/><path d="M52 66H64" ${THIN}/>` +
      `<path d="M20 50H36" ${GEAR}/><path d="M26 50V66" ${THIN}/>` +
      glow(27, 34, 4, 7) +
      head(22, 22, 4.6) +
      `<path d="M22 27L24 44" ${INK}/>` +
      `<path d="M24 44L38 46L58 44" ${INK}/>` +
      `<path d="M24 44L38 49L57 47" ${INK2}/>` +
      `<path d="M23 31L32 35L40 34" ${INK}/>` +
      `<path d="M58 34H41" ${THIN}/>` +
      arrowL(50, 25, 11),
    66
  ),

  pushup: svg(
    head(17, 37, 4.5) +
      `<path d="M22 40L40 44L56 47" ${INK}/>` +
      `<path d="M56 47L58 54" ${INK}/>` +
      `<path d="M22 40L21 47L26 54" ${INK}/>` +
      arrowBoth(46, 26, 37),
    58
  ),

  shoulderpress: svg(
    glow(33, 27, 3, 3) +
      glow(39, 27, 3, 3) +
      head(36, 17, 5) +
      `<path d="M36 22V44" ${INK}/>` +
      `<path d="M36 44L30 65" ${INK}/><path d="M25 66H33" ${INK2}/>` +
      `<path d="M36 44L42 65" ${INK}/><path d="M38 66H46" ${INK2}/>` +
      `<path d="M34 26L26 21L29 14" ${INK}/>` +
      `<path d="M38 26L46 21L43 14" ${INK}/>` +
      `<path d="M24 13H34" ${THIN}/><circle cx="24" cy="13" r="2.4" fill="rgba(255,255,255,0.30)"/>` +
      `<circle cx="34" cy="13" r="2.4" fill="rgba(255,255,255,0.30)"/>` +
      `<path d="M38 13H48" ${THIN}/><circle cx="38" cy="13" r="2.4" fill="rgba(255,255,255,0.30)"/>` +
      `<circle cx="48" cy="13" r="2.4" fill="rgba(255,255,255,0.30)"/>` +
      arrowU(58, 42, 14),
    66
  ),

  plank: svg(
    head(16, 37, 4.5) +
      `<path d="M21 39L40 45L56 48" ${INK}/>` +
      `<path d="M56 48L58 56" ${INK}/>` +
      `<path d="M21 39L20 48L11 53" ${INK}/>` +
      `<path d="M13 34L59 45" fill="none" stroke="#2ee6a8" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="3 5" opacity=".55"/>`,
    58
  ),

  deadbug: svg(
    glow(24, 44, 7, 3) +
      head(11, 42, 4.6) +
      `<path d="M16 43L32 45" ${INK}/>` +
      `<path d="M17 43L16 30" ${INK}/>` +
      `<path d="M16 43L7 39" ${INK2}/>` +
      `<path d="M33 45L33 31L43 31" ${INK}/>` +
      `<path d="M33 45L47 48" ${INK2}/>`,
    54
  ),

  fullbody: svg(
    glow(34, 42, 5, 4) +
      glow(40, 42, 5, 4) +
      head(36, 13, 5) +
      `<path d="M36 18V40" ${INK}/>` +
      `<path d="M36 40L31 64" ${INK}/><path d="M26 66H34" ${INK2}/>` +
      `<path d="M36 40L41 64" ${INK}/><path d="M38 66H46" ${INK2}/>` +
      `<path d="M22 23H50" ${GEAR}/>` +
      `<rect x="18" y="17" width="4" height="12" rx="1.6" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>` +
      `<rect x="50" y="17" width="4" height="12" rx="1.6" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>` +
      `<path d="M33 27L27 23" ${INK}/><path d="M39 27L45 23" ${INK}/>` +
      arrowBoth(60, 22, 44),
    66
  ),
};

export { MOVES };
