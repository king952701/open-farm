/* ==========================================================================
 * 牧野田园 · 安卓资源同步脚本
 *
 *   node farm3d-android/scripts/prepare.js
 *
 * 做三件事：
 *   1. 把 farm3d/ 的运行时文件（index.html / js / vendor）同步到
 *      farm3d-android/app/src/main/assets —— 网页端就是 APK 的单一来源，改一次两处生效
 *   2. 由 index.html 派生出移动端入口 m.html：注入触控层 js/mobile.js 与几行 meta
 *      （桌面 index.html 保持干净，不加载 mobile.js，PC 端行为零影响）
 *   3. 顺手清掉不该进包的开发文件（测试脚本 / 设计文档 / 截图）
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'farm3d');               // 游戏源码（唯一真源）
const DIST = path.join(__dirname, '..', 'app', 'src', 'main', 'assets');

/* 只同步运行必需的东西：_* 是开发与测试文件，不要打进 APK */
const ALLOW_DIRS = ['js', 'vendor'];
const SKIP = new Set(['_smoke.js', '_e2e.js', '_e2e_mobile.js', '_probe.js']);

function rimraf(p) { fs.rmSync(p, { recursive: true, force: true }); }

function copyFile(rel) {
  const to = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(SRC, rel), to);
}

function copyDir(dir) {
  const from = path.join(SRC, dir);
  if (!fs.existsSync(from)) throw new Error('缺少目录：' + SRC + '\\' + dir);
  for (const name of fs.readdirSync(from)) {
    if (name.startsWith('_') || SKIP.has(name)) continue;
    const rel = dir + '/' + name;
    const st = fs.statSync(path.join(from, name));
    if (st.isDirectory()) copyDir(rel);
    else if (/\.(js|html|json|css|map)$/i.test(name)) copyFile(rel);
  }
}

/* ---------- 生成移动端入口 m.html ---------- */
function buildMobileHtml() {
  const raw = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
  if (raw.indexOf('js/mobile.js') >= 0) throw new Error('index.html 里不该出现 mobile.js：请先回滚对该文件的手工改动');
  let html = raw
    .replace('<title>', '<meta name="mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="theme-color" content="#2e4a34">\n<title>')
    .replace('<script src="js/main.js"></script>',
      '<script src="js/main.js"></script>\n<script src="js/mobile.js"></script>');
  if (html.indexOf('js/mobile.js') < 0) throw new Error('注入 mobile.js 失败：index.html 结构变了，请同步 prepare.js 里的锚点');
  fs.writeFileSync(path.join(DIST, 'm.html'), html, 'utf8');
}

/* ---------- 主流程 ---------- */
(function main() {
  if (!fs.existsSync(SRC)) { console.error('找不到源码目录：' + SRC); process.exit(1); }
  if (fs.existsSync(DIST)) rimraf(DIST);
  fs.mkdirSync(DIST, { recursive: true });

  copyFile('index.html');
  for (const d of ALLOW_DIRS) copyDir(d);
  if (!fs.existsSync(path.join(DIST, 'js', 'mobile.js'))) throw new Error('缺少 js/mobile.js（触控层）');
  buildMobileHtml();

  const size = dir => {
    let n = 0;
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      n += f.isDirectory() ? size(p) : fs.statSync(p).size;
    }
    return n;
  };
  let js = 0, html = 0;
  for (const f of fs.readdirSync(path.join(DIST, 'js'))) {
    if (f.endsWith('.js')) { js++; html += fs.statSync(path.join(DIST, 'js', f)).size; }
  }
  console.log('同步完成 →', DIST);
  console.log(`  assets 体积 ${(size(DIST) / 1024 / 1024).toFixed(2)} MB · js ${js} 个（${(html / 1024).toFixed(0)} KB）· 含入口 index.html 与 m.html`);
})();
