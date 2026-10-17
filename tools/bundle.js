/* 把 src/ 下的源码打包成一个自包含的 HTML */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(SRC, 'assets/style.css'), 'utf8');
const data = fs.readFileSync(path.join(SRC, 'data/zhouyi.js'), 'utf8');
const app = fs.readFileSync(path.join(SRC, 'assets/app.js'), 'utf8');

const banner = '/* 太乙 · 问易 —— 单文件版，由 tools/bundle.js 从 src/ 生成，请勿直接修改本文件 */\n';
const OUT_NAME = 'TaiYi.html';

let out = html
  .replace('<link rel="stylesheet" href="assets/style.css">', '<style>\n' + css + '\n</style>')
  .replace('<script src="data/zhouyi.js"></script>',
           '<script>\n' + banner + data + '\n</script>')
  .replace('<script src="assets/app.js"></script>',
           '<script>\n' + app + '\n</script>');

if (out.indexOf('assets/style.css') >= 0 || out.indexOf('assets/app.js') >= 0) {
  throw new Error('有资源未被内联，请检查 index.html 中的引用路径');
}

fs.writeFileSync(path.join(ROOT, OUT_NAME), out, 'utf8');
console.log('单文件版已生成：' + OUT_NAME + '  ' + out.length + ' 字节');
