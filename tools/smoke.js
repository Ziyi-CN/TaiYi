/* 无头冒烟测试：把单文件版丢进 jsdom，跑一遍真实交互
 * 另含两个回归用例，对应 2026-10-12 修掉的并发 bug：
 *   A. 金钱卦动画期间连点 8 下 —— 早先会把第 7 个爻塞进数组
 *   B. 大衍筮法第三变后的 700ms 空窗期 —— 早先会多算一变、爻值算错            */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'TaiYi.html');
const OUT = path.join(ROOT, 'tools/raw/smoke.log');
const log = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

function mockStream(chunks, delay) {
  const enc = new TextEncoder();
  return function () {
    let i = 0;
    return Promise.resolve({
      ok: true, status: 200, headers: { get: () => null },
      text: () => Promise.resolve(''),
      body: {
        getReader: () => ({
          read: () => new Promise((res) => {
            setTimeout(() => {
              if (i < chunks.length) {
                const payload = 'data: ' + JSON.stringify({ choices: [{ delta: { content: chunks[i++] } }] }) + '\n\n';
                res({ done: false, value: enc.encode(payload) });
              } else { res({ done: true, value: undefined }); }
            }, delay);
          })
        })
      }
    });
  };
}

const CHUNKS = [
  '### 一、卦象解析\n',
  '本卦是山泽损，**先减而后得**。',
  '二、动爻定位\n',
  '九二在下卦中位，讲的是起步。\n\n',
  '### 三、就事论事\n',
  '直说：**这一卦不支持大张旗鼓。**\n\n',
  '**四、一句断语**\n',
  '收敛为上，速去速回。\n'
];

(async () => {
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push('jsdomError: ' + e.message));
  vc.on('error', (m) => errors.push('console.error: ' + m));

  const dom = new JSDOM(fs.readFileSync(FILE, 'utf8'), {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc
  });
  const win = dom.window;
  const doc = win.document;
  win.alert = (m) => errors.push('alert: ' + m);
  win.confirm = () => true;
  win.scrollTo = () => {};
  win.localStorage.setItem('taiyi.config', JSON.stringify({ base: 'https://x/y', model: 'm', key: 'k' }));
  win.fetch = mockStream(CHUNKS, 25);

  await new Promise((r) => win.addEventListener('load', r));
  const $ = (s) => doc.querySelector(s);
  const txt = (s) => ($(s) ? $(s).textContent : '');
  const done = () => doc.querySelectorAll('.progress-track i.done').length;

  log.push('卦象数据：' + (win.ZHOUYI ? win.ZHOUYI.length + ' 卦' : '未载入'));

  /* ---- 回归 A：金钱卦动画期间连点 8 下 ---- */
  log.push('');
  log.push('=== 回归 A：金钱卦连点 8 下 ===');
  for (let i = 0; i < 8; i++) { const b = $('#btnCast'); if (b && !b.disabled) b.click(); }
  await sleep(4000);
  log.push('已成爻：' + done() + '（期望 6；旧版会到 7，随后查表失败弹告警）');
  log.push('卦象推算出错告警：' + (errors.some(function (e) { return e.indexOf('alert') >= 0; }) ? '有（未修好）' : '无'));
  log.push('已成卦：' + txt('#resultBody .gua-name').replace(/\s+/g, ' ').trim());
  $('#btnReset').click();
  await sleep(200);

  /* ---- 正常金钱卦 ---- */
  log.push('');
  log.push('=== 金钱卦（正常流程）===');
  for (let i = 0; i < 6; i++) { $('#btnCast').click(); await sleep(760); }
  await sleep(400);
  log.push('卦名：' + txt('#resultBody .gua-name').replace(/\s+/g, ' ').trim());
  log.push('动爻提示：' + (txt('#resultBody .hint').match(/动爻：.*/) || ['（无）'])[0]);

  /* ---- 解卦：连点两次 ---- */
  log.push('');
  log.push('=== 解卦（连点两次）===');
  const btn = $('#btnRead');
  log.push('初始按钮：' + btn.textContent.trim() + '　disabled=' + btn.disabled);
  btn.click();
  await sleep(120);
  log.push('流式中按钮：' + btn.textContent.trim() + '　disabled=' + btn.disabled);
  btn.click();
  await sleep(120);
  btn.click();
  await sleep(2500);

  const box = $('#reading');
  const raw = box.textContent;
  const count = (s, sub) => s.split(sub).length - 1;
  log.push('结束后按钮：' + $('#btnRead').textContent.trim());
  log.push('「卦象解析」出现次数：' + count(raw, '卦象解析') + '（期望 1）');
  log.push('「速去速回」出现次数：' + count(raw, '速去速回') + '（期望 1）');
  log.push('残留 # 号：' + count(raw, '#') + '　残留 * 号：' + count(raw, '*') + '（期望 0 / 0）');
  log.push('小标题 .rd-h：' + box.querySelectorAll('.rd-h').length + '（期望 4）');
  log.push('着重 b：' + box.querySelectorAll('b').length + '（期望 2）');
  log.push('四个小标题：' + Array.prototype.map.call(box.querySelectorAll('.rd-h'), function (n) { return n.textContent; }).join(' / '));
  log.push('粘行修复（段落里不应再出现「二、动爻定位」）：' +
    Array.prototype.some.call(box.querySelectorAll('p'), function (n) { return n.textContent.indexOf('二、动爻定位') >= 0; }));

  /* ---- 追问 ---- */
  $('#chatInput').value = '那如果非要去呢？';
  $('#btnSend').click();
  await sleep(1800);
  log.push('');
  log.push('=== 追问 ===');
  log.push('消息数：' + doc.querySelectorAll('#chatLog .msg').length + '（期望 2）');

  /* ---- 回归 B：大衍筮法第三变后的空窗期 ---- */
  log.push('');
  log.push('=== 回归 B：大衍筮法第三变空窗 ===');
  doc.querySelector('#methodSwitch button[data-method="yarrow"]').click();
  await sleep(250);
  log.push('蓍草根数：' + doc.querySelectorAll('#stalkRow .stalk').length);
  for (let i = 0; i < 3; i++) { const b = $('#btnBian'); if (b) b.click(); await sleep(80); }
  const wb = $('#btnBian');
  log.push('第三变后按钮：' + (wb ? wb.textContent.trim() : '无') + '　disabled=' + (wb ? wb.disabled : '-') + '（期望 落定中 / true）');
  log.push('此时日志条数：' + doc.querySelectorAll('#ritualArea .log-list li').length + '（期望 3；旧版再点一下就变 4，爻值跟着错）');
  if (wb && !wb.disabled) { wb.click(); log.push('（空窗期按钮竟可点，已替点一次）'); }
  await sleep(1600);
  log.push('落定后已成爻：' + done() + '（期望 1）');

  /* ---- 大衍筮法十八变 ---- */
  $('#btnBianAll').click();
  await sleep(8200);
  log.push('');
  log.push('=== 大衍筮法十八变 ===');
  log.push('成卦：' + txt('#resultBody .gua-name').replace(/\s+/g, ' ').trim());
  log.push('卦史条数：' + JSON.parse(win.localStorage.getItem('taiyi.history') || '[]').length);

  /* ---- 卦史 ---- */
  $('#btnHistory').click();
  await sleep(200);
  log.push('');
  log.push('=== 卦史 ===');
  log.push('条目数：' + doc.querySelectorAll('.hist-item').length);
  const first = doc.querySelector('.hist-item');
  if (first) {
    log.push('首条：' + first.querySelector('.sub').textContent.trim());
    first.click();
    await sleep(300);
    log.push('回看后卦名：' + txt('#resultBody .gua-name').replace(/\s+/g, ' ').trim());
  }

  /* ---- 卦史导出 / 导入 ---- */
  log.push('');
  log.push('=== 卦史导出 / 导入 ===');
  const before = JSON.parse(win.localStorage.getItem('taiyi.history') || '[]');
  const payload = {
    app: '太乙·问易', kind: 'history', version: 1,
    items: [
      { id: 9999999999999, ts: '2026-01-01T00:00:00.000Z', question: '导入测试', method: 'coin',
        values: [7, 7, 8, 8, 9, 6], dong: [4, 5], ben: '111111', bian: '000000', reading: '' },
      before[0],
      { id: 8888888888888, ts: '2026-01-02T00:00:00.000Z', question: '坏数据', ben: 'zzzzzz' }
    ].filter(Boolean)
  };
  const input = $('#importFile');
  const file = new win.File([JSON.stringify(payload)], 'h.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new win.Event('change'));
  await sleep(500);
  const after = JSON.parse(win.localStorage.getItem('taiyi.history') || '[]');
  log.push('导入前 ' + before.length + ' 条 → 导入后 ' + after.length + ' 条（期望 +1）');
  log.push('坏数据已丢弃：' + !after.filter(function (x) { return x.id === 8888888888888; })[0]);
  let exportErr = null;
  try { $('#btnExportHistory').click(); } catch (e) { exportErr = e.message; }
  await sleep(300);
  log.push('导出按钮异常：' + (exportErr || '无'));

  log.push('');
  log.push('=== 运行期错误 ===');
  log.push(errors.length ? errors.join('\n') : '无');

  fs.writeFileSync(OUT, log.join('\n'), 'utf8');
  win.close();
})();
