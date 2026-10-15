/* 自检：从 assets/app.js 抽取真实算法源码运行，验证概率分布与卦象查表 */
const fs = require('fs');
const APP = 'D:/WorkBuddy/TaiYi/src/assets/app.js';
const DATA = 'D:/WorkBuddy/TaiYi/src/data/zhouyi.js';
const OUT = 'D:/WorkBuddy/TaiYi/tools/raw/selftest.log';

const src = fs.readFileSync(APP, 'utf8');
const lines = [];

function grabFn(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('未找到函数 ' + name);
  let d = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (d === 0) break; }
  }
  return src.slice(i, j + 1);
}
const randIntSrc = src.split('\n').filter(function (l) { return l.trim().indexOf('var randInt =') === 0; })[0];
if (!randIntSrc) throw new Error('未找到 randInt');

const code = [randIntSrc, grabFn('castOneYao'), grabFn('yarrowOneBian'),
  'return { castOneYao: castOneYao, yarrowOneBian: yarrowOneBian };'].join('\n');
const S = { yarrow: null };
const api = new Function('S', code)(S);

/* ---------- 1. 大衍筮法 ---------- */
const N = 300000;
const cnt = { 6: 0, 7: 0, 8: 0, 9: 0 };
const badBian = [];
for (let i = 0; i < N; i++) {
  S.yarrow = { rest: 49, bian: 1, log: [], stage: 'idle' };
  const seen = [];
  for (let b = 1; b <= 3; b++) {
    const r = api.yarrowOneBian();
    seen.push(r.n + '->' + r.remain + '(-' + r.removed + ')');
    const ok = b === 1 ? (r.removed === 5 || r.removed === 9) : (r.removed === 4 || r.removed === 8);
    if (!ok) badBian.push('非法挂扐 ' + seen.join(' '));
    if (r.hung + r.lr + r.rr !== r.removed) badBian.push('算式不自洽 ' + seen.join(' '));
    if (r.remain !== r.n - r.removed) badBian.push('策数不符 ' + seen.join(' '));
    S.yarrow.bian = b + 1;
  }
  const v = S.yarrow.rest / 4;
  if (!cnt.hasOwnProperty(v)) { badBian.push('非法终数 ' + seen.join(' ')); continue; }
  cnt[v]++;
}
const total = N - badBian.length;
const theory = { 9: 3 / 16, 7: 5 / 16, 8: 7 / 16, 6: 1 / 16 };
lines.push('=== 大衍筮法（' + N + ' 次抽样）===');
[9, 7, 8, 6].forEach((v) => {
  const p = cnt[v] / total;
  const t = theory[v];
  lines.push(`  ${v}（${v === 9 ? '老阳' : v === 7 ? '少阳' : v === 8 ? '少阴' : '老阴'}）  实测 ${(p * 100).toFixed(2)}%   理论 ${(t * 100).toFixed(2)}%   偏差 ${((p - t) * 100).toFixed(2)}%`);
});
lines.push('  非法结果：' + badBian.length + (badBian.length ? '  例：' + badBian[0] : ''));

/* ---------- 2. 金钱卦 ---------- */
const c2 = { 6: 0, 7: 0, 8: 0, 9: 0 };
for (let i = 0; i < N; i++) c2[api.castOneYao().value]++;
lines.push('');
lines.push('=== 金钱卦（' + N + ' 次抽样）===');
[9, 7, 8, 6].forEach((v) => {
  lines.push(`  ${v}（${v === 9 ? '老阳' : v === 7 ? '少阳' : v === 8 ? '少阴' : '老阴'}）  ${(c2[v] / N * 100).toFixed(2)}%`);
});

/* ---------- 3. 卦象查表与上下卦分解 ---------- */
global.window = {};
eval(fs.readFileSync(DATA, 'utf8'));
const GUA = global.window.ZHOUYI;
const TRI = { '111': '乾天', '110': '兑泽', '101': '离火', '100': '震雷', '011': '巽风', '010': '坎水', '001': '艮山', '000': '坤地' };
const seen = {};
let truncErr = 0;
GUA.forEach((g) => {
  if (seen[g.binary]) truncErr++;
  seen[g.binary] = 1;
  const lo = TRI[g.binary.slice(0, 3)], up = TRI[g.binary.slice(3, 6)];
  if (lo[0] !== g.lower || up[0] !== g.upper) truncErr++;
});
const missing = [];
for (let i = 0; i < 64; i++) {
  const b = i.toString(2).padStart(6, '0');
  if (!seen[b]) missing.push(b);
}
lines.push('');
lines.push('=== 数据完整性 ===');
lines.push('  卦数 ' + GUA.length + '　二进制互异 ' + Object.keys(seen).length + '/64　缺失 ' + (missing.length ? missing.join(',') : '无') + '　错误 ' + truncErr);
lines.push('  乾之六爻全变 → ' + GUA.filter((g) => g.binary === '000000')[0].full);
lines.push('  泰（111000）初爻变 → ' + GUA.filter((g) => g.binary === '011000')[0].full);

/* ---------- 4. 经文完整性 ---------- */
let w = 0;
GUA.forEach((g) => {
  if (!g.guaCi || !g.daXiang || !g.tuan) w++;
  if (g.yaoCi.length !== 6) w++;
  if (g.xiaoXiang.length !== 6) w++;
  g.yaoCi.forEach((t) => { if (!t) w++; });
});
lines.push('  经文缺漏：' + w);
lines.push('  爻辞总条数：' + GUA.reduce((a, g) => a + g.yaoCi.length, 0));

/* ---------- 5. 动爻标记是否越出画布 ---------- */
const guaSVG = new Function('POS', grabFn('guaSVG') + '\nreturn guaSVG;')(['初', '二', '三', '四', '五', '上']);
function markOverflow(barW) {
  const cells = [0, 1, 2, 3, 4, 5].map((i) => ({ yang: i % 2 === 0, moving: i < 2, mark: i < 2 ? '○' : '' }));
  const svg = guaSVG(cells, { barW: barW });
  const vb = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  const W = Number(vb[1]);
  const xs = [];
  const re = /<text x="(\d+)"[^>]*font-size="14"[^>]*>○<\/text>/g;
  let m;
  while ((m = re.exec(svg)) !== null) xs.push(Number(m[1]));
  const worst = Math.max.apply(null, xs) + 14;   // 14px 字号的记号大约占 14px 宽
  return { W: W, markX: Math.max.apply(null, xs), right: worst, clipped: worst > W };
}
[116, 130, 108].forEach((bw) => {
  const r = markOverflow(bw);
  lines.push(`  barW=${bw}：画布宽 ${r.W}，记号右缘 ${r.right} → ${r.clipped ? '越界（会被裁切）' : '不越界'}`);
});

fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
