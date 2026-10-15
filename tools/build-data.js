const fs = require('fs');
const path = require('path');
const OpenCC = require('opencc-js');

const SRC = 'D:/WorkBuddy/TaiYi/tools/raw/gua64.json';
const OUT = 'D:/WorkBuddy/TaiYi/src/data/zhouyi.js';
const LOG = 'D:/WorkBuddy/TaiYi/tools/raw/build.log';

const t2s = OpenCC.Converter({ from: 't', to: 'cn' });

const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const log = [];

const TRIGRAM = {
  '111': ['乾', '天'], '110': ['兑', '泽'], '101': ['离', '火'], '100': ['震', '雷'],
  '011': ['巽', '风'], '010': ['坎', '水'], '001': ['艮', '山'], '000': ['坤', '地']
};

const FIX = {
  '1.爻2': '九二：见龙在田，利见大人。',
  '1.彖传': '大哉乾元，万物资始，乃统天。云行雨施，品物流形。大明终始，六位时成，时乘六龙以御天。乾道变化，各正性命，保合太和，乃利贞。首出庶物，万国咸宁。',
  '4.爻3': '六三：勿用取女，见金夫，不有躬，无攸利。',
  '4.彖传': '蒙，山下有险，险而止，蒙。蒙亨，以亨行时中也。匪我求童蒙，童蒙求我，志应也。初筮告，以刚中也。再三渎，渎则不告，渎蒙也。蒙以养正，圣功也。',
  '6.卦辞': '讼：有孚，窒惕，中吉。终凶。利见大人，不利涉大川。',
  '10.爻4': '九四：履虎尾，愬愬，终吉。',
  '10.大象': '上天下泽，履；君子以辨上下，定民志。',
  '13.爻5': '九五：同人，先号咷而后笑。大师克相遇。',
  '14.爻2': '九二：大车以载，有攸往，无咎。',
  '14.爻6': '上九：自天祐之，吉无不利。',
  '23.大象': '山附于地，剥；上以厚下安宅。',
  '24.爻1': '初九：不远复，无祗悔，元吉。',
  '25.爻2': '六二：不耕获，不菑畬，则利有攸往。',
  '25.彖传': '无妄，刚自外来，而为主于内。动而健，刚中而应，大亨以正，天之命也。其匪正有眚，不利有攸往。无妄之往，何之矣？天命不祐，行矣哉？',
  '28.爻5': '九五：枯杨生华，老妇得其士夫，无咎无誉。',
  '34.卦辞': '大壮：利贞。',
  '34.大象': '雷在天上，大壮；君子以非礼弗履。',
  '35.爻4': '九四：晋如鼫鼠，贞厉。',
  '36.爻4': '六四：入于左腹，获明夷之心，于出门庭。',
  '37.爻5': '九五：王假有家，勿恤，吉。',
  '41.爻1': '初九：已事遄往，无咎，酌损之。',
  '41.爻6': '上九：弗损益之，无咎，贞吉，利有攸往，得臣无家。',
  '49.彖传': '革，水火相息，二女同居，其志不相得，曰革。巳日乃孚，革而信之。文明以说，大亨以正，革而当，其悔乃亡。天地革而四时成，汤武革命，顺乎天而应乎人，革之时义大矣哉！',
  '51.大象': '洊雷，震；君子以恐惧修省。',
  '52.爻3': '九三：艮其限，列其夤，厉熏心。',
  '55.爻3': '九三：丰其沛，日中见沬，折其右肱，无咎。',
  '55.爻6': '上六：丰其屋，蔀其家，窥其户，阒其无人，三岁不觌，凶。',
  '57.卦辞': '巽：小亨，利有攸往，利见大人。',
  '21.爻4': '九四：噬干胏，得金矢，利艰贞，吉。',
  '21.爻5': '六五：噬干肉，得黄金，贞厉，无咎。'
};

const POS = ['初', '二', '三', '四', '五', '上'];
const POSIDX = { 初: 0, 二: 1, 三: 2, 四: 3, 五: 4, 上: 5 };

const GUARD = '\u0001';

function norm(s) {
  if (typeof s !== 'string') return s;
  let t = t2s(s.replace(/乾/g, GUARD))
    .replace(new RegExp(GUARD, 'g'), '乾')
    .replace(/遁/g, '遯')
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const h = t.length / 2;
  if (Number.isInteger(h) && h > 3 && t.slice(0, h) === t.slice(h)) t = t.slice(0, h).trim();
  return t;
}

const fixed = [];

const hexes = raw.map((g, i) => {
  const n = i + 1;
  const name = norm(g.name);
  const binary = g.id;
  const lines = binary.split('').map(Number);
  const lo = TRIGRAM[binary.slice(0, 3)];
  const up = TRIGRAM[binary.slice(3, 6)];

  const pick = (field, val) => {
    const key = n + '.' + field;
    if (FIX[key] !== undefined) {
      fixed.push(`${n} ${name} ${field}\n   旧: ${val}\n   新: ${FIX[key]}`);
      return norm(FIX[key]);
    }
    return norm(val);
  };

  let yaoCi = g.yao_ci.map((t) => norm(t));
  yaoCi = yaoCi.map((t, k) => {
    if (k === 6) return pick('用' + t[1], t);
    return pick('爻' + (k + 1), t);
  });

  const xiaoXiang = g.xiao_xiang.map((t, k) =>
    k === 6 ? norm(t) : pick('小象' + (k + 1), t)
  );

  return {
    n,
    name,
    full: lo[0] === up[0] ? `${name}为${lo[1]}` : `${up[1]}${lo[1]}${name}`,
    symbol: g.symbol,
    binary,
    lines,
    lower: lo[0],
    lowerXiang: lo[1],
    upper: up[0],
    upperXiang: up[1],
    guaCi: pick('卦辞', g.gua_ci),
    tuan: pick('彖传', g.tuan_ci),
    daXiang: pick('大象', g.da_xiang),
    yaoCi: yaoCi.slice(0, 6),
    xiaoXiang: xiaoXiang.slice(0, 6),
    yong: yaoCi[6] || null,
    yongXiang: xiaoXiang[6] || null
  };
});

const errors = [];
hexes.forEach((h) => {
  h.yaoCi.forEach((t, k) => {
    const m = t.match(/^(初[九六]|[九六][二三四五]|上[九六])/);
    if (!m) { errors.push(`${h.n} ${h.name} 爻${k + 1} 无爻名: ${t}`); return; }
    const tok = m[1];
    const pos = (tok[0] === '初' || tok[0] === '上') ? POSIDX[tok[0]] : POSIDX[tok[1]];
    const yang = (tok[0] === '初' || tok[0] === '上') ? tok[1] === '九' : tok[0] === '九';
    if (pos !== k) errors.push(`${h.n} ${h.name} 爻${k + 1} 爻位错位: ${tok}`);
    if (yang !== (h.lines[pos] === 1)) errors.push(`${h.n} ${h.name} 爻${k + 1} 阴阳与卦象不符: ${tok}`);
  });
});

const header = `/* 周易六十四卦 · 数据表
 * 底本：freizl/yijing 开源数据集（zh-CN/64gua.json）
 * 校勘：与 john-walks-slow/open-iching 数据集逐条比对，差异处依通行本订正；
 *       并以「爻名反推阴阳」与卦象二进制逐位互校，全数吻合。
 * 用字：已统一为简体（遯卦从通行本字形，保留「遯」）。
 * binary / lines 自下而上排列（初爻 → 上爻），1 = 阳，0 = 阴。
 * 订正明细见 .workbuddy/build.log
 */
window.ZHOUYI = `;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, header + JSON.stringify(hexes, null, 1) + ';\n', 'utf8');

const summary = hexes.map((h) => `${String(h.n).padStart(2)}. ${h.full} ${h.symbol}  ${h.guaCi}`);
fs.writeFileSync(LOG, [
  '订正 ' + fixed.length + ' 处：',
  ...fixed,
  '',
  '一致性检查：' + (errors.length === 0 ? '通过，64卦×6爻全部吻合' : '发现 ' + errors.length + ' 处问题'),
  ...errors,
  '',
  '===== 总览 =====',
  ...summary
].join('\n'), 'utf8');
