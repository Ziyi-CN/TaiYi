/* 太乙 · 问易  —  起卦 / 解卦 / 追问 */
(function () {
  'use strict';

  var GUA = window.ZHOUYI || [];
  var BY_BIN = {};
  GUA.forEach(function (g) { BY_BIN[g.binary] = g; });

  var POS = ['初', '二', '三', '四', '五', '上'];

  /* 六、七、八、九 分别对应 老阴 / 少阳 / 少阴 / 老阳 */
  var TYPE = {
    6: { name: '老阴', yang: false, moving: true,  mark: '×', coin: '三字',     gua: '交' },
    7: { name: '少阳', yang: true,  moving: false, mark: '',  coin: '一背二字', gua: '单' },
    8: { name: '少阴', yang: false, moving: false, mark: '',  coin: '两背一字', gua: '拆' },
    9: { name: '老阳', yang: true,  moving: true,  mark: '○', coin: '三背',     gua: '重' }
  };

  var CFG_KEY = 'taiyi.config';
  var HIST_KEY = 'taiyi.history';
  var DEFAULT_CFG = {
    base: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-chat',
    key: ''
  };

  var S = {
    method: 'coin',
    question: '',
    yao: [],
    yarrow: null,
    streaming: false,
    result: null,
    reading: '',
    chat: [],
    histId: null
  };

  /* 起卦链代号：每开一轮自动摇、每次点「重来」都自增。
   * 在飞的 setTimeout 回调比对不上就自行退出，免得打断之后还在往卦里塞爻。 */
  var castRun = 0;
  var autoCasting = false;

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  var randInt = function (n) { return Math.floor(Math.random() * n); };
  var cnNum = function (n) { return '一二三四五六七八九'.charAt(n - 1) || String(n); };

  function scrollToEl(node, block) {
    if (!node || typeof node.scrollIntoView !== 'function') return;
    try { node.scrollIntoView({ behavior: 'smooth', block: block || 'start' }); }
    catch (e) { try { node.scrollIntoView(); } catch (e2) {} }
  }

  /* ===== 把模型返回的 Markdown 渲染成正文，不让 # 和 * 裸奔 ===== */

  function inlineMd(s) {
    return esc(s)
      .replace(/\*\*([\s\S]+?)\*\*/g, '<b>$1</b>')
      .replace(/\*\*/g, '')
      .replace(/[*`]/g, '');
  }

  function mdToHtml(src) {
    var text = String(src == null ? '' : src);
    // 流式输出的接缝处，小标题常被粘在上一句末尾，先把换行补回来
    text = text.replace(/([^\n])([一二三四五六七八九十]+[、.．][^\n，。；：！？]{1,12})(?=\n|$)/g, '$1\n$2\n');

    var lines = text.split('\n');
    var out = [];
    var para = [];
    function flush() {
      if (para.length) { out.push('<p>' + para.join('<br>') + '</p>'); para = []; }
    }
    lines.forEach(function (raw) {
      var line = raw.replace(/^\s*#{1,6}\s*/, '').replace(/\s*#+\s*$/, '').trim();
      if (!line) { flush(); return; }
      var bare = line.replace(/\*\*/g, '').trim();
      var head = (/^[一二三四五六七八九十]+[、.．]/.test(bare) && bare.length <= 22) ||
                 (/^\*\*[^*]{2,20}\*\*$/.test(line));
      if (head) { flush(); out.push('<h4 class="rd-h">' + inlineMd(bare.replace(/^[（(]|[）)]$/g, '')) + '</h4>'); return; }
      var li = line.match(/^(?:[-*•·]|\d+[.、)])\s+(.*)$/);
      if (li) { flush(); out.push('<div class="rd-li">' + inlineMd(li[1]) + '</div>'); return; }
      para.push(inlineMd(line));
    });
    flush();
    return out.join('');
  }

  /* ================= 存档 ================= */

  function loadCfg() {
    try {
      var o = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
      return { base: o.base || DEFAULT_CFG.base, model: o.model || DEFAULT_CFG.model, key: o.key || '' };
    } catch (e) { return { base: DEFAULT_CFG.base, model: DEFAULT_CFG.model, key: '' }; }
  }
  function saveCfg(c) { try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch (e) {} }

  function loadHist() {
    try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]') || []; } catch (e) { return []; }
  }
  function saveHist(list) { try { localStorage.setItem(HIST_KEY, JSON.stringify(list)); } catch (e) {} }

  /* ================= 卦象绘制 ================= */

  function yaoName(i, yang) {
    var yy = yang ? '九' : '六';
    if (i === 0) return '初' + yy;
    if (i === 5) return '上' + yy;
    return yy + POS[i];
  }

  function guaSVG(cells, opt) {
    opt = opt || {};
    var barW = opt.barW || 116, barH = 12, gap = opt.gap || 17;
    var labelW = 20, markW = 26, pad = 3;
    var rowH = barH + gap;
    var H = 6 * barH + 5 * gap + pad * 2;
    var W = labelW + barW + markW;
    var o = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img">';
    for (var i = 0; i < 6; i++) {
      var y = pad + (5 - i) * rowH;
      var c = cells[i];
      o += '<text x="' + (labelW - 7) + '" y="' + (y + barH / 2) + '" text-anchor="end" ' +
           'dominant-baseline="central" font-size="11" font-family="serif" fill="#8B8170">' + POS[i] + '</text>';
      if (!c) {
        o += '<rect x="' + labelW + '" y="' + y + '" width="' + barW + '" height="' + barH + '" rx="1.5" ' +
             'fill="none" stroke="#B9AF98" stroke-width="1" stroke-dasharray="4 4"/>';
      } else {
        var col = c.moving ? '#A6372B' : '#26221C';
        if (c.yang) {
          o += '<rect x="' + labelW + '" y="' + y + '" width="' + barW + '" height="' + barH + '" rx="1.5" fill="' + col + '"/>';
        } else {
          var seg = Math.round((barW - 34) / 2);
          o += '<rect x="' + labelW + '" y="' + y + '" width="' + seg + '" height="' + barH + '" rx="1.5" fill="' + col + '"/>';
          o += '<rect x="' + (labelW + barW - seg) + '" y="' + y + '" width="' + seg + '" height="' + barH + '" rx="1.5" fill="' + col + '"/>';
        }
        if (c.mark) {
          o += '<text x="' + (labelW + barW + 6) + '" y="' + (y + barH / 2) + '" dominant-baseline="central" ' +
               'font-size="14" font-family="serif" fill="#A6372B">' + c.mark + '</text>';
        }
      }
    }
    return o + '</svg>';
  }

  function cellOf(y) {
    if (!y) return null;
    var t = TYPE[y.value];
    return { yang: t.yang, moving: t.moving, mark: t.mark };
  }

  /* ================= 起卦：金钱卦 ================= */

  function castOneYao() {
    var coins = [0, 0, 0].map(function () { return Math.random() < 0.5 ? 1 : 0; });
    var backs = coins.reduce(function (a, b) { return a + b; }, 0);
    var value = backs === 3 ? 9 : backs === 2 ? 8 : backs === 1 ? 7 : 6;
    return { coins: coins, backs: backs, value: value };
  }

  /* ================= 起卦：大衍筮法 ================= */

  function yarrowInit() {
    S.yarrow = { rest: 49, bian: 1, log: [], stage: 'idle' };
  }

  /* 大衍筮法。
   * 第一变挂扐非五即九，古法以「得五者三、得九者一」为准（3/4 与 1/4）；
   * 第二、三变挂扐非四即八，四种组合两两各半（各 1/2）。
   * 由此推出的分布即通行之说：老阳 3/16、少阴 7/16、少阳 5/16、老阴 1/16。
   * 先按此定挂扐之数，再反推一个真实合律的分二，故界面所显算式仍是真数。
   *
   * 可到的策数只有三种：第一变 49，其后 44 或 40，第三变 32、36 或 40，
   * 全部能被 4 整除（除 49 外），故挂扐之数必有解，不会走到兜底分支。 */
  function yarrowOneBian() {
    var y = S.yarrow;
    var n = y.rest;
    var target = y.bian === 1
      ? (Math.random() < 0.75 ? 5 : 9)
      : (Math.random() < 0.5 ? 4 : 8);

    var cands = [];
    for (var L = 1; L <= n - 2; L++) {
      var R = n - L;
      var lr = L % 4; if (lr === 0) lr = 4;
      var rr = (R - 1) % 4; if (rr === 0) rr = 4;
      if (1 + lr + rr === target) cands.push({ L: L, lr: lr, rr: rr });
    }
    if (!cands.length) return null;
    var p = cands[randInt(cands.length)];
    var left = p.L;
    var right = n - left;
    var removed = 1 + p.lr + p.rr;
    var remain = n - removed;

    var rec = {
      bian: y.bian, n: n, left: left, right: right, hung: 1,
      lr: p.lr, rr: p.rr, removed: removed, remain: remain
    };
    y.log.push(rec);
    y.rest = remain;
    return rec;
  }

  /* ================= 界面渲染 ================= */

  function renderMethodNote() {
    $('methodNote').innerHTML = S.method === 'coin'
      ? '三枚铜钱，掷六次自下而上成卦。<b>一背二字</b>为单（阳），<b>两背一字</b>为拆（阴），<b>三背</b>为重（老阳，动），<b>三字</b>为交（老阴，动）。'
      : '五十根蓍草，虚一不用，余四十九策。每爻须分二、挂一、揲四、归奇，三变而后成一爻，六爻共十八变。此为《系辞》所载古法，慢，但正。';
  }

  function renderDistNote() {
    var html = S.method === 'coin'
      ? '六爻之中，老阳与老阴各占 1/8。'
      : '六爻之中，老阳 3/16、少阴 7/16、少阳 5/16、老阴 1/16 —— 蓍草法明显偏重阳动，这是它与金钱卦最实在的一处分别。';
    var el = $('distNote');
    if (el) el.innerHTML = html;
  }

  function renderBuild() {
    var html = '<div>' + guaSVG(S.yao.length ? buildCells() : [null, null, null, null, null, null], { barW: 108 }) + '</div>';
    var cap = [];
    for (var i = 5; i >= 0; i--) {
      var y = S.yao[i];
      var t = y ? TYPE[y.value] : null;
      cap.push(
        '<div class="slot-row" style="margin:0 0 0 10px">' +
        '<span class="slot-label">' + (t ? yaoName(i, t.yang) : '') + '</span>' +
        '<span style="font-size:12px;color:' + (t && t.moving ? '#A6372B' : '#8B8170') + ';font-family:var(--kai)">' +
        (t ? (t.name + (t.moving ? ' · 动' : '')) : (i === S.yao.length ? '◂ 正在起这一爻' : '')) + '</span>' +
        '</div>'
      );
    }
    html += '<div style="padding-top:3px">' + cap.join('') + '</div>';
    $('buildArea').innerHTML = html;
  }

  function buildCells() {
    var cells = [null, null, null, null, null, null];
    S.yao.forEach(function (y, i) { cells[i] = cellOf(y); });
    return cells;
  }

  function renderProgress() {
    var o = '';
    for (var i = 0; i < 6; i++) o += '<i class="' + (i < S.yao.length ? 'done' : '') + '"></i>';
    $('progress').innerHTML = o;
  }

  function renderRitual() {
    if (S.method === 'coin') renderCoinArea(); else renderYarrowArea();
    renderActions();
  }

  function renderCoinArea() {
    var last = S.yao.length ? S.yao[S.yao.length - 1] : null;
    var coins = last && last.coins ? last.coins : [null, null, null];
    var cells = coins.map(function (c) {
      var face = c === null ? '' : (c === 1 ? '背' : '字');
      return '<div class="coin-cell"><div class="coin" data-face="' + (c === null ? '' : c) + '">' +
             (face ? '<span class="glyph">' + face + '</span>' : '') + '</div>' +
             '<div class="face-name">' + (face || '—') + '</div></div>';
    }).join('');
    var note = '';
    if (last) {
      var t = TYPE[last.value];
      note = '得 <b style="color:#A6372B;font-weight:400">' + t.gua + '</b>（' + t.name + '）　' + t.coin;
    } else {
      note = '虔心默念所问之事，然后摇卦。';
    }
    $('ritualArea').innerHTML =
      '<div class="coins" id="coins">' + cells + '</div>' +
      '<p class="hint" style="text-align:center;margin:6px 0 0" id="castNote">' + note + '</p>';
  }

  function renderYarrowArea() {
    var y = S.yarrow;
    var row = '';
    if (!y) {
      row = pile(49, '四十九策');
    } else {
      var last = y.log[y.log.length - 1];
      row = pile(y.rest, y.log.length ? '余 ' + y.rest + ' 策' : '四十九策');
      if (last) row += pile(last.removed, '归奇 ' + last.removed);
    }
    var logHtml = '';
    if (y && y.log.length) {
      logHtml = '<ul class="log-list" style="margin-top:14px">' + y.log.map(function (r) {
        return '<li>第' + cnNum(r.bian) + '变：本有 <b>' + r.n + '</b> 策，分二为 ' + r.left + ' 与 ' + r.right +
               '，挂一，左揲四余 <b>' + r.lr + '</b>，右揲四余 <b>' + r.rr + '</b>，归奇 ' + r.removed +
               '，余 <b>' + r.remain + '</b> 策</li>';
      }).join('') + '</ul>';
    }
    var stage = y ? (y.bian > 3 ? '本爻已成' : '第 ' + y.bian + ' 变') : '';
    $('ritualArea').innerHTML =
      '<div class="stalk-area"><div class="stalk-row" id="stalkRow">' + row + '</div></div>' +
      '<p class="hint" style="margin:4px 0 0">' + (S.yao.length >= 6 ? '十八变已毕。' : stage + (S.yao.length ? '　已成 ' + S.yao.length + ' 爻' : '')) + '</p>' +
      logHtml;
  }

  function pile(n, label) {
    n = Math.max(0, Math.min(n, 49));
    var s = '';
    for (var i = 0; i < n; i++) s += '<i class="stalk clear"></i>';
    return '<div class="pile" data-label="' + esc(label) + '">' + s + '</div>';
  }

  function renderActions() {
    var full = S.yao.length >= 6;
    var o = '';
    if (S.method === 'coin') {
      o += '<button class="primary" id="btnCast"' + (full ? ' disabled' : '') + '>' + (full ? '卦 已 成' : '摇 一 爻') + '</button>';
      if (!full) o += '<button id="btnCastAll"' + (autoCasting ? ' disabled' : '') + '>连摇六爻</button>';
    } else {
      var y = S.yarrow;
      var waiting = !!y && y.bian > 3;
      o += '<button class="primary" id="btnBian"' + (full || waiting || autoCasting ? ' disabled' : '') + '>' +
           (full ? '卦 已 成'
                 : (waiting ? '落 定 中'
                            : (y ? '行 第' + '一二三'[y.bian - 1] + '变' : '取 蓍 草'))) + '</button>';
      if (!full) o += '<button id="btnBianAll"' + (autoCasting ? ' disabled' : '') + '>十八变到底</button>';
    }
    o += '<button id="btnReset" class="ghost">重来</button>';
    o += '<span class="hint" style="margin-left:auto">' + (S.method === 'coin' ? '每爻三枚，六爻而成' : '三变一爻，十八变而成') + '</span>';
    $('stepActions').innerHTML = o;

    var b1 = $('btnCast') || $('btnBian');
    if (b1) b1.onclick = S.method === 'coin' ? castCoinStep : yarrowStep;
    var bAll = $('btnCastAll') || $('btnBianAll');
    if (bAll) bAll.onclick = S.method === 'coin' ? castCoinAll : yarrowAll;
    $('btnReset').onclick = function () { resetAll(false); };
  }

  /* ================= 操作流程 ================= */

  function syncQuestion() { S.question = ($('question').value || '').trim(); }

  function resetAll(keepQuestion) {
    abortStream();
    castRun++;
    autoCasting = false;
    S.yao = [];
    S.yarrow = null;
    S.result = null;
    S.reading = '';
    S.chat = [];
    S.histId = null;
    if (!keepQuestion) $('question').value = '';
    if (S.method === 'yarrow') yarrowInit();
    $('stageResult').classList.add('hidden');
    $('stageAsk').classList.remove('hidden');
    renderBuild();
    renderProgress();
    renderRitual();
  }

  function castCoinStep() {
    if (S.yao.length >= 6) return;
    syncQuestion();
    var run = castRun;
    var result = castOneYao();
    var box = $('coins');
    if (box) {
      Array.prototype.forEach.call(box.children, function (c) {
        c.querySelector('.coin').classList.add('spinning');
      });
    }
    setTimeout(function () {
      if (run !== castRun) return;
      if (S.yao.length >= 6) return;
      S.yao.push(result);
      renderBuild();
      renderProgress();
      renderRitual();
      if (S.yao.length >= 6) finishCast();
    }, box ? 620 : 0);
  }

  function castCoinAll() {
    if (autoCasting) return;
    autoCasting = true;
    var run = castRun;
    (function next() {
      if (run !== castRun || S.yao.length >= 6) { autoCasting = false; renderRitual(); return; }
      castCoinStep();
      setTimeout(next, 780);
    })();
  }

  /* 大衍筮法一爻三变。第三变算完之后必须立刻把 bian 抬到 4 并禁用按钮：
   * 早先版本留着 700ms 的空窗期，那期间再点一下就会多算一变，
   * 爻值变成「四变之余数除以四」，卦就算错了。 */
  function yarrowStep() {
    if (S.yao.length >= 6) return;
    syncQuestion();
    if (!S.yarrow) yarrowInit();
    var y = S.yarrow;
    if (y.bian > 3) { pushYaoFromYarrow(); return; }
    if (!yarrowOneBian()) return;
    renderYarrowArea();
    if (y.bian >= 3) {
      y.bian = 4;
      renderActions();
      setTimeout(function () {
        if (S.yao.length < 6) pushYaoFromYarrow();
      }, 700);
    } else {
      y.bian++;
      renderActions();
    }
  }

  function pushYaoFromYarrow() {
    var y = S.yarrow;
    if (!y || y.bian <= 3 || S.yao.length >= 6) return;
    S.yao.push({ value: y.rest / 4 });
    S.yarrow = S.yao.length < 6 ? { rest: 49, bian: 1, log: [], stage: 'idle' } : null;
    renderBuild();
    renderProgress();
    renderRitual();
    if (S.yao.length >= 6) finishCast();
  }

  function yarrowAll() {
    if (autoCasting) return;
    autoCasting = true;
    var run = castRun;
    (function nextYao() {
      if (run !== castRun || S.yao.length >= 6) { autoCasting = false; renderRitual(); return; }
      if (!S.yarrow) yarrowInit();
      S.yarrow.log = [];
      S.yarrow.bian = 1;
      S.yarrow.rest = 49;
      var k = 0;
      (function nextBian() {
        if (run !== castRun) { autoCasting = false; return; }
        if (k >= 3) {
          S.yarrow.bian = 4;
          pushYaoFromYarrow();
          if (run !== castRun || S.yao.length >= 6) { autoCasting = false; return; }
          setTimeout(nextYao, 200);
          return;
        }
        k++;
        S.yarrow.bian = k;
        yarrowOneBian();
        renderYarrowArea();
        renderActions();
        setTimeout(nextBian, 320);
      })();
    })();
  }

  /* ================= 成卦 ================= */

  function finishCast() {
    var values = S.yao.map(function (y) { return y.value; });
    var benLines = values.map(function (v) { return TYPE[v].yang ? 1 : 0; });
    var bianLines = values.map(function (v) {
      if (v === 9) return 0;
      if (v === 6) return 1;
      return TYPE[v].yang ? 1 : 0;
    });
    var dong = [];
    values.forEach(function (v, i) { if (TYPE[v].moving) dong.push(i); });

    S.result = {
      values: values,
      dong: dong,
      ben: BY_BIN[benLines.join('')],
      bian: dong.length ? BY_BIN[bianLines.join('')] : null
    };
    if (!S.result.ben) { alert('卦象推算出错，请重来一次。'); return; }

    renderResult();
    saveCurrentToHistory();

    $('stageResult').classList.remove('hidden');
    scrollToEl($('stageResult'), 'start');
  }

  function renderResult() {
    var r = S.result, ben = r.ben;
    var benCells = r.values.map(function (v) { return cellOf({ value: v }); });
    var bianCells = null;
    if (r.bian) {
      bianCells = r.bian.lines.map(function (l) {
        return { yang: l === 1, moving: false, mark: '' };
      });
    }

    var dongText = r.dong.length
      ? r.dong.map(function (i) {
          var t = TYPE[r.values[i]];
          return yaoName(i, t.yang) + '（' + t.name + '）';
        }).join('、')
      : '无';

    $('resultHead').innerHTML = '卦 象　<span style="font-size:12px;color:#8B8170;letter-spacing:0">' +
      (S.method === 'coin' ? '金钱卦' : '大衍筮法') + '　' + new Date().toLocaleString('zh-CN', { hour12: false }) + '</span>';

    var h = '';

    if (S.question) {
      h += '<div class="canon-block" style="margin-top:0"><h3>所 问</h3><p>' + esc(S.question) + '</p></div>';
    }

    h += '<div class="hex-pair">';
    h += '<div class="hex-card"><div class="symbol">' + ben.symbol + '</div>' +
         '<div class="gua-name">' + ben.full + '<small>第' + ben.n + '卦</small></div>' +
         '<div style="font-size:12px;color:#8B8170">' + ben.lower + '下　' + ben.upper + '上</div>' +
         '<div style="margin-top:12px">' + guaSVG(benCells, { barW: 130 }) + '</div></div>';

    if (r.bian) {
      h += '<div class="hex-arrow">之</div>';
      h += '<div class="hex-card"><div class="symbol">' + r.bian.symbol + '</div>' +
           '<div class="gua-name">' + r.bian.full + '<small>第' + r.bian.n + '卦</small></div>' +
           '<div style="font-size:12px;color:#8B8170">' + r.bian.lower + '下　' + r.bian.upper + '上</div>' +
           '<div style="margin-top:12px">' + guaSVG(bianCells, { barW: 130 }) + '</div></div>';
    }
    h += '</div>';

    if (!r.bian) {
      h += '<p class="hint" style="text-align:center;margin-top:14px">六爻安静，无动爻。以本卦卦辞断之。</p>';
    } else {
      h += '<p class="hint" style="text-align:center;margin-top:14px">动爻：' + dongText + '</p>';
    }

    h += '<div class="canon">';
    h += '<div class="canon-block"><h3>本 卦 卦 辞</h3><p>' + esc(ben.guaCi) + '</p></div>';
    h += '<div class="canon-block"><h3>大 象</h3><p>' + esc(ben.daXiang) + '</p></div>';

    if (r.dong.length) {
      h += '<div class="canon-block"><h3>动 爻 爻 辞</h3><ul class="yao-list">' +
        r.dong.map(function (i) {
          return '<li class="changing">' + esc(ben.yaoCi[i]) + '<span class="tag">动</span></li>';
        }).join('') + '</ul></div>';
    }

    var isAllMovingQian = ben.binary === '111111' && r.dong.length === 6;
    var isAllMovingKun = ben.binary === '000000' && r.dong.length === 6;
    if (isAllMovingQian && ben.yong) {
      h += '<div class="canon-block"><h3>用 九</h3><p>' + esc(ben.yong) + '</p></div>';
    }
    if (isAllMovingKun && ben.yong) {
      h += '<div class="canon-block"><h3>用 六</h3><p>' + esc(ben.yong) + '</p></div>';
    }

    if (r.bian) {
      h += '<div class="canon-block"><h3>变 卦 卦 辞</h3><p>' + esc(r.bian.guaCi) + '</p></div>';
      h += '<div class="canon-block"><h3>变 卦 大 象</h3><p>' + esc(r.bian.daXiang) + '</p></div>';
    }

    h += '<details class="more"><summary>全 卦 爻 辞（自下而上）</summary><div class="body"><ul class="yao-list">' +
      ben.yaoCi.map(function (t, i) {
        var cls = r.dong.indexOf(i) >= 0 ? 'changing' : 'muted';
        return '<li class="' + cls + '">' + esc(t) + '</li>';
      }).join('') + '</ul>' +
      (ben.yong ? '<p style="margin-top:10px">' + esc(ben.yong) + '</p>' : '') +
      '</div></details>';

    h += '<details class="more"><summary>彖 传</summary><div class="body"><p>' + esc(ben.tuan) + '</p></div></details>';

    h += '<details class="more"><summary>小 象 传</summary><div class="body"><ul class="yao-list">' +
      ben.xiaoXiang.map(function (t, i) {
        var cls = r.dong.indexOf(i) >= 0 ? '' : 'muted';
        return '<li class="' + cls + '">' + esc(t) + '</li>';
      }).join('') + '</ul></div></details>';

    h += '</div>';

    h += '<div class="chat" style="border-top:1px solid var(--line);margin-top:26px;padding-top:22px">';
    h += '<h2 class="panel-head">解 卦</h2>';
    h += '<div class="reading" id="reading"></div>';
    h += '<div class="step-actions" id="readActions"></div>';
    h += '<div class="chat-log" id="chatLog" style="margin-top:18px"></div>';
    h += '<div class="chat-input"><textarea id="chatInput" rows="1" placeholder="还有哪里不懂？直接问，我会顺着这一卦答你"></textarea>' +
         '<button class="primary" id="btnSend" style="letter-spacing:.2em">问</button></div>';
    h += '</div>';

    $('resultBody').innerHTML = h;

    bindResult();
    if (S.reading) paintReading(S.reading);
    paintChat();
  }

  function bindResult() {
    $('readActions').innerHTML =
      '<button class="primary" id="btnRead">' + (S.reading ? '重 新 解 卦' : '请 解 卦') + '</button>' +
      '<button id="btnCopy">复制卦例</button>' +
      '<span class="hint" style="margin-left:auto;text-align:right;line-height:1.5">' +
      '上方经文取自本卦原文，解卦与追问由你自己配置的模型生成</span>';
    $('btnRead').onclick = doReading;
    $('btnRead').disabled = !!S.streaming;
    $('btnCopy').onclick = copyCase;

    var ta = $('chatInput');
    ta.onkeydown = function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askFollowUp(); }
    };
    ta.oninput = function () {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
    };
    $('btnSend').onclick = askFollowUp;
  }

  function readingContext() {
    var r = S.result, ben = r.ben;
    var L = [];
    L.push('【所问之事】' + (S.question || '（未说明，泛问）'));
    L.push('【起卦方式】' + (S.method === 'coin' ? '金钱卦（三枚铜钱掷六次）' : '大衍筮法（五十蓍草，十八变）'));
    L.push('【本卦】第' + ben.n + '卦 ' + ben.full + '　' + ben.symbol + '（' + ben.lower + '下 ' + ben.upper + '上）');
    L.push('　卦辞：' + ben.guaCi);
    L.push('　大象：' + ben.daXiang);
    if (r.dong.length) {
      L.push('【动爻】' + r.dong.map(function (i) {
        var t = TYPE[r.values[i]];
        return yaoName(i, t.yang) + '（' + t.name + '）';
      }).join('、'));
      r.dong.forEach(function (i) {
        L.push('　爻辞：' + ben.yaoCi[i]);
        L.push('　小象：' + ben.xiaoXiang[i]);
      });
    } else {
      L.push('【动爻】无（六爻安静，以本卦卦辞断）');
    }
    if (r.bian) {
      L.push('【变卦】第' + r.bian.n + '卦 ' + r.bian.full + '（' + r.bian.lower + '下 ' + r.bian.upper + '上）');
      L.push('　卦辞：' + r.bian.guaCi);
      L.push('　大象：' + r.bian.daXiang);
    }
    return L.join('\n');
  }

  var SYSTEM = [
    '你是一位通晓《周易》的解卦人，兼通象数与义理，说话直接、清楚，不说套话。',
    '求问者刚刚亲手起出了一卦，下面把这一卦的全部信息交给你。',
    '',
    '解读时请按这个结构，四节依次写：',
    '一、卦象解析 —— 从上下卦的象意入手，说清这一卦描绘的是什么局面；',
    '二、动爻定位 —— 若有动爻，说明动爻在全卦中所处的位置、以及它在提示什么；',
    '三、就事论事 —— 紧贴他问的那件事给出明确判断，该说不行就说不行，不要两边讨好；',
    '四、一句断语 —— 用一句话概括吉凶与接下来最该做的一件事。',
    '',
    '格式要求（请严格遵守）：',
    '不要使用 # 号、反引号、表格、以及 - 或 * 开头的列表符号；',
    '每一节的标题单独占一行，就写成「一、卦象解析」这个样子，后面直接跟正文；',
    '需要强调的词句，用 **两个星号** 夹起来即可，不要用别的标记；',
    '一节写完后空一行，再写下一节。',
    '',
    '内容要求：',
    '语言简洁有力，可以文雅，但不要故弄玄虚，不堆砌术语；',
    '不做绝对化的宿命断言，要把话落到「能做的事」上；',
    '涉及医疗、法律、重大财产处置时，提醒他另行核实专业意见；',
    '不要复述原文，直接解读；每一节只讲一次，不要重复前面的内容。'
  ].join('\n');

  /* ================= 模型调用 ================= */

  function chatEndpoint(base) {
    var b = (base || '').trim().replace(/\/+$/, '');
    if (!b) return DEFAULT_CFG.base;
    if (/\/chat\/completions$/.test(b)) return b;
    if (/\/v\d+$/.test(b)) return b + '/chat/completions';
    return b + '/v1/chat/completions';
  }

  function streamChat(messages, onDelta, signal) {
    var cfg = loadCfg();
    if (!cfg.key) return Promise.reject(new Error('NO_KEY'));
    var url = chatEndpoint(cfg.base);
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key },
      body: JSON.stringify({ model: cfg.model, messages: messages, stream: true, temperature: 0.85 }),
      signal: signal
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) { throw new Error('HTTP ' + res.status + '：' + t.slice(0, 300)); });
      }
      if (!res.body || !res.body.getReader) {
        return res.json().then(function (j) {
          var c = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
          if (c) onDelta(c);
        });
      }
      var reader = res.body.getReader();
      var dec = new TextDecoder('utf-8');
      var buf = '';
      return (function pump() {
        return reader.read().then(function (r) {
          if (r.done) return;
          buf += dec.decode(r.value, { stream: true });
          var lines = buf.split('\n');
          buf = lines.pop();
          lines.forEach(function (line) {
            var t = line.trim();
            if (t.indexOf('data:') !== 0) return;
            var d = t.slice(5).trim();
            if (!d || d === '[DONE]') return;
            try {
              var j = JSON.parse(d);
              var delta = j.choices && j.choices[0] && j.choices[0].delta;
              if (delta && delta.content) onDelta(delta.content);
            } catch (e) {}
          });
          return pump();
        });
      })();
    });
  }

  function apiError(err) {
    var m = String(err && err.message || err);
    if (m === 'NO_KEY') {
      openSettings('请先填入 API Key，才能解卦。经文部分不受影响，随时可以看。');
      return null;
    }
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) {
      return '连不上接口。可能是地址写错了，也可能是这个接口不允许网页直接调用（跨域限制）。\n' +
             '可以换成支持浏览器直连的接口，或找我给你写个本地小代理。';
    }
    return '出错了：' + m;
  }

  var abortCtl = null;

  function abortStream() {
    if (abortCtl) { try { abortCtl.abort(); } catch (e) {} abortCtl = null; }
    S.streaming = false;
    var box = $('reading');
    if (box) box.classList.remove('cursor-blink');
  }

  function setBusy(on) {
    S.streaming = on;
    var b = $('btnRead');
    if (b) {
      b.disabled = on;
      b.textContent = on ? '解 卦 中…' : (S.reading ? '重 新 解 卦' : '请 解 卦');
    }
    var s = $('btnSend');
    if (s) s.disabled = on;
  }

  function doReading() {
    if (S.streaming) return;
    var box = $('reading');
    if (!box) return;
    abortCtl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    setBusy(true);
    box.classList.add('cursor-blink');
    box.innerHTML = '';
    S.reading = '';
    var msgs = [{ role: 'system', content: SYSTEM + '\n\n' + readingContext() },
                { role: 'user', content: '请解这一卦。' }];
    streamChat(msgs, function (d) {
      S.reading += d;
      box.innerHTML = mdToHtml(S.reading);
    }, abortCtl ? abortCtl.signal : undefined).then(function () {
      abortCtl = null;
      box.classList.remove('cursor-blink');
      setBusy(false);
      updateHistoryReading();
      bindResult();
    }).catch(function (e) {
      abortCtl = null;
      box.classList.remove('cursor-blink');
      setBusy(false);
      if (e && e.name === 'AbortError') return;
      var msg = apiError(e);
      if (msg) box.innerHTML = '<p>' + esc(msg) + '</p>';
    });
  }

  function askFollowUp() {
    if (S.streaming) return;
    var ta = $('chatInput');
    if (!ta) return;
    var text = (ta.value || '').trim();
    if (!text) return;
    ta.value = '';
    ta.style.height = 'auto';
    S.chat.push({ role: 'user', content: text });
    paintChat();

    var log = $('chatLog');
    var bubble = document.createElement('div');
    bubble.className = 'msg ai';
    bubble.innerHTML = '<div class="who">卜</div><div class="bubble cursor-blink"></div>';
    log.appendChild(bubble);
    var body = bubble.querySelector('.bubble');
    scrollToEl(log, 'end');

    var msgs = [{ role: 'system', content: SYSTEM + '\n\n' + readingContext() +
                  '\n\n求问者会继续追问，请始终在这一卦的语境里回答他，不要重新起卦。回答同样不要用 # 号、反引号与列表符号。' }];
    if (S.reading) msgs.push({ role: 'assistant', content: S.reading });
    S.chat.forEach(function (m) { msgs.push({ role: m.role, content: m.content }); });

    abortCtl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    setBusy(true);
    var acc = '';
    streamChat(msgs, function (d) {
      acc += d;
      body.innerHTML = mdToHtml(acc);
      scrollToEl(log, 'end');
    }, abortCtl ? abortCtl.signal : undefined).then(function () {
      abortCtl = null;
      body.classList.remove('cursor-blink');
      setBusy(false);
      S.chat.push({ role: 'assistant', content: acc });
      paintChat();
    }).catch(function (e) {
      abortCtl = null;
      body.classList.remove('cursor-blink');
      setBusy(false);
      if (e && e.name === 'AbortError') {
        S.chat.push({ role: 'assistant', content: acc || '（已中断）' });
        paintChat();
        return;
      }
      var msg = apiError(e);
      body.textContent = msg || '未能作答。';
      S.chat.pop();
    });
  }

  function paintReading(text) {
    var box = $('reading');
    if (box) box.innerHTML = mdToHtml(text);
  }

  function paintChat() {
    var log = $('chatLog');
    if (!log) return;
    log.innerHTML = S.chat.map(function (m) {
      var inner = m.role === 'user' ? esc(m.content) : mdToHtml(m.content);
      return '<div class="msg ' + (m.role === 'user' ? 'me' : 'ai') + '">' +
             '<div class="who">' + (m.role === 'user' ? '问' : '卜') + '</div>' +
             '<div class="bubble">' + inner + '</div></div>';
    }).join('');
  }

  function copyCase() {
    var r = S.result, ben = r.ben;
    var txt = '【所问】' + (S.question || '未说明') + '\n' +
      '【起卦】' + (S.method === 'coin' ? '金钱卦' : '大衍筮法') + '\n' +
      '【本卦】' + ben.full + '（第' + ben.n + '卦）' + ben.symbol + '\n' +
      ben.guaCi + '\n' +
      (r.dong.length
        ? '【动爻】' + r.dong.map(function (i) { var t = TYPE[r.values[i]]; return yaoName(i, t.yang); }).join('、') + '\n' +
          r.dong.map(function (i) { return '　' + ben.yaoCi[i]; }).join('\n') + '\n'
        : '【动爻】无\n') +
      (r.bian ? '【变卦】' + r.bian.full + '（第' + r.bian.n + '卦）\n' + r.bian.guaCi + '\n' : '');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(txt).then(function () { flash('已复制'); }, function () { flash('复制失败'); });
    } else { flash('当前浏览器不支持复制'); }
  }

  function flash(t) {
    var e = document.createElement('div');
    e.textContent = t;
    e.style.cssText = 'position:fixed;left:50%;bottom:44px;transform:translateX(-50%);background:#26221C;color:#F8F3E6;' +
      'padding:8px 20px;border-radius:3px;font-size:13px;z-index:99;font-family:var(--kai)';
    document.body.appendChild(e);
    setTimeout(function () { e.remove(); }, 1600);
  }

  /* ================= 卦史 ================= */

  function currentRecord() {
    var r = S.result;
    if (!r) return null;
    return {
      id: S.histId || Date.now(),
      ts: new Date().toISOString(),
      question: S.question,
      method: S.method,
      values: r.values,
      dong: r.dong,
      ben: r.ben.binary,
      bian: r.bian ? r.bian.binary : null,
      reading: S.reading || ''
    };
  }

  function saveCurrentToHistory() {
    var rec = currentRecord();
    if (!rec) return;
    var list = loadHist();
    list.unshift(rec);
    list = list.slice(0, 300);
    saveHist(list);
    S.histId = rec.id;
    renderHistory();
  }

  function updateHistoryReading() {
    if (!S.histId) return;
    var list = loadHist();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === S.histId) { list[i].reading = S.reading || ''; break; }
    }
    saveHist(list);
  }

  function renderHistory() {
    var list = loadHist();
    var body = $('historyBody');
    if (!list.length) {
      body.innerHTML = '<p class="hint" style="margin-top:20px">还没有记过卦。起一卦就会自动存下来。</p>' +
        '<p class="hint" style="margin-top:10px;color:#AEA48F">卦史存在你这个浏览器里，不在『TaiYi.html』这个文件里。' +
        '换台电脑、换个浏览器，或者从别的地址打开，都会看不到。要带走就用上面的「导出」。</p>';
      return;
    }
    body.innerHTML =
      '<p class="hint" style="margin:0 0 8px;color:#AEA48F">共 ' + list.length + ' 条。' +
      '卦史只存在本浏览器，不随文件走，换地方请先「导出」。</p>' +
      list.map(function (it) {
      var ben = BY_BIN[it.ben] || { full: '？', symbol: '？' };
      var bian = it.bian ? BY_BIN[it.bian] : null;
      var d = new Date(it.ts);
      var stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') +
                  ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      return '<div class="hist-item" data-id="' + it.id + '">' +
        '<div class="gua-mini">' + ben.symbol + '</div>' +
        '<div class="meta">' +
          '<div class="q">' + esc(it.question || '（未记所问）') + '</div>' +
          '<div class="sub">' + stamp + '　' + (it.method === 'coin' ? '金钱卦' : '大衍筮法') + '　' +
            ben.full + (bian ? ' 之 ' + bian.full : '（无动爻）') + '</div>' +
        '</div>' +
        '<button class="del" data-del="' + it.id + '">删</button>' +
      '</div>';
    }).join('');

    Array.prototype.forEach.call(body.querySelectorAll('.hist-item'), function (node) {
      node.onclick = function (e) {
        if (e.target.dataset.del) return;
        restoreFromHistory(Number(node.dataset.id));
      };
    });
    Array.prototype.forEach.call(body.querySelectorAll('.del'), function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var id = Number(btn.dataset.del);
        saveHist(loadHist().filter(function (x) { return x.id !== id; }));
        renderHistory();
      };
    });
  }

  function restoreFromHistory(id) {
    var it = loadHist().filter(function (x) { return x.id === id; })[0];
    if (!it) return;
    var ben = BY_BIN[it.ben];
    var bian = it.bian ? BY_BIN[it.bian] : null;
    if (!ben) return;
    S.method = it.method;
    S.question = it.question || '';
    S.values = it.values;
    S.yao = it.values.map(function (v) { return { value: v }; });
    S.result = { values: it.values, dong: it.dong, ben: ben, bian: bian };
    S.reading = it.reading || '';
    S.chat = [];
    S.histId = it.id;
    S.yarrow = null;
    $('question').value = S.question;
    setMethod(it.method, true);
    $('stageResult').classList.remove('hidden');
    renderResult();
    closeDrawer();
    scrollToEl($('stageResult'), 'start');
  }

  /* ================= 卦史导出 / 导入 ================= */

  function histFileName() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return '太乙卦史-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' +
           p(d.getHours()) + p(d.getMinutes()) + '.json';
  }

  function exportHistory() {
    var list = loadHist();
    if (!list.length) { flash('卦史还是空的'); return; }
    // 只导出卦例，不包含 API Key 等设置
    var text = JSON.stringify({
      app: '太乙·问易', kind: 'history', version: 1,
      exportedAt: new Date().toISOString(), count: list.length, items: list
    }, null, 1);
    try {
      var url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      var a = document.createElement('a');
      a.href = url;
      a.download = histFileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 2000);
      flash('已导出 ' + list.length + ' 条');
    } catch (e) {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function () { flash('已复制卦史到剪贴板'); },
                                                 function () { flash('导出失败'); });
      } else { flash('导出失败'); }
    }
  }

  function mergeHistory(items) {
    var cur = loadHist();
    var byId = {};
    cur.forEach(function (x) { byId[x.id] = x; });
    var added = 0;
    items.forEach(function (x) {
      if (!x || !x.ben || !BY_BIN[x.ben]) return;
      if (byId[x.id]) {
        if (!byId[x.id].reading && x.reading) byId[x.id].reading = x.reading;
        return;
      }
      byId[x.id] = x;
      added++;
    });
    var merged = Object.keys(byId).map(function (k) { return byId[k]; })
      .sort(function (a, b) { return String(b.ts || '').localeCompare(String(a.ts || '')); });
    saveHist(merged);
    renderHistory();
    return added;
  }

  function importHistory(file) {
    if (!file) return;
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var o = JSON.parse(String(fr.result));
        var items = Array.isArray(o) ? o : (o && o.items);
        if (!Array.isArray(items)) throw new Error('不是卦史文件');
        var n = mergeHistory(items);
        flash(n ? '导入完成，新增 ' + n + ' 条' : '没有新的卦例可导入');
      } catch (e) {
        flash('导入失败：' + (e && e.message ? e.message : '文件读不出来'));
      }
    };
    fr.onerror = function () { flash('文件读取失败'); };
    fr.readAsText(file);
  }

  /* ================= 抽屉 / 设置 ================= */

  function openDrawer() { renderHistory(); $('historyDrawer').classList.add('on'); $('veil').classList.add('on'); }
  function closeDrawer() { $('historyDrawer').classList.remove('on'); $('veil').classList.remove('on'); }

  function openSettings(note) {
    var c = loadCfg();
    $('cfgBase').value = c.base;
    $('cfgModel').value = c.model;
    $('cfgKey').value = c.key;
    $('cfgStatus').textContent = note || '';
    $('settingsModal').classList.add('on');
    $('veil').classList.add('on');
  }
  function closeSettings() { $('settingsModal').classList.remove('on'); $('veil').classList.remove('on'); }

  function setMethod(m, silent) {
    S.method = m;
    Array.prototype.forEach.call($('methodSwitch').children, function (b) {
      b.classList.toggle('on', b.dataset.method === m);
    });
    renderMethodNote();
    renderDistNote();
    if (!silent) resetAll(true);
    if (m === 'yarrow' && !S.yarrow && S.yao.length < 6) yarrowInit();
    renderRitual();
  }

  /* ================= 启动 ================= */

  function init() {
    if (!GUA.length) {
      $('stageAsk').innerHTML = '<p class="hint">卦象数据未能载入，请确认 data/zhouyi.js 与本页在同一目录下。</p>';
      return;
    }
    Array.prototype.forEach.call($('methodSwitch').children, function (b) {
      b.onclick = function () { setMethod(b.dataset.method); };
    });
    $('btnHistory').onclick = openDrawer;
    $('btnSettings').onclick = function () { openSettings(); };
    $('veil').onclick = function () { closeDrawer(); closeSettings(); };
    $('btnCloseSettings').onclick = closeSettings;
    $('btnSaveSettings').onclick = function () {
      saveCfg({ base: $('cfgBase').value.trim(), model: $('cfgModel').value.trim(), key: $('cfgKey').value.trim() });
      closeSettings();
      flash('已保存');
    };
    $('btnTestApi').onclick = function () {
      saveCfg({ base: $('cfgBase').value.trim(), model: $('cfgModel').value.trim(), key: $('cfgKey').value.trim() });
      $('cfgStatus').textContent = '测试中…';
      streamChat([{ role: 'user', content: '只回复两个字：可用' }], function () {}).then(function () {
        $('cfgStatus').textContent = '连接成功。';
      }).catch(function (e) {
        var m = apiError(e);
        $('cfgStatus').textContent = m || '连接失败。';
      });
    };
    $('btnClearHistory').onclick = function () {
      if (confirm('清空全部卦史？此操作不可撤销。建议先「导出」备份。')) { saveHist([]); renderHistory(); }
    };
    $('btnExportHistory').onclick = exportHistory;
    $('btnImportHistory').onclick = function () { $('importFile').click(); };
    $('importFile').onchange = function (e) {
      var f = e.target.files && e.target.files[0];
      importHistory(f);
      e.target.value = '';
    };
    $('question').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); }
    });

    setMethod('coin', true);
    renderBuild();
    renderProgress();
    renderRitual();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
