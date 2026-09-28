'use strict';

/* =====================================================================
 * 数学表达式解析器
 * 语法: + - * / ^ ( ) ,  支持隐式乘法 (2x, x y, x(y+1), )(x))
 *       兼容 unicode 输入: − × ÷ π √  以及 ** 作为幂
 * ===================================================================== */

const CONSTANTS = { pi: Math.PI, e: Math.E };

// 函数表: 值 = 参数个数 (-1 表示变长)
const FUNCS = {
  sin: 1, cos: 1, tan: 1, asin: 1, acos: 1, atan: 1, atan2: 2,
  sinh: 1, cosh: 1, tanh: 1, asinh: 1, acosh: 1, atanh: 1,
  exp: 1, ln: 1, log: 1, lg: 1, log10: 1, log2: 1,
  sqrt: 1, cbrt: 1, abs: 1, sign: 1,
  floor: 1, ceil: 1, round: 1, trunc: 1,
  sec: 1, csc: 1, cot: 1,
  min: -1, max: -1, hypot: -1, pow: 2, mod: 2, clamp: 3, step: 2
};

function tokenize(src) {
  const norm = src
    .replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/')
    .replace(/π/g, 'pi').replace(/\*\*/g, '^');
  const t = [];
  let i = 0;
  while (i < norm.length) {
    const c = norm[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?/.exec(norm.slice(i));
      if (!m) throw { pos: i, msg: '数字格式有误' };
      t.push({ k: 'num', v: parseFloat(m[0]), pos: i });
      i += m[0].length; continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      const m = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(norm.slice(i));
      t.push({ k: 'id', v: m[0], pos: i });
      i += m[0].length; continue;
    }
    if (c === '√') { t.push({ k: 'sqrt', pos: i }); i++; continue; }
    if ('+-*/^'.includes(c)) { t.push({ k: 'op', v: c, pos: i }); i++; continue; }
    if (c === '(') { t.push({ k: 'lp', pos: i }); i++; continue; }
    if (c === ')') { t.push({ k: 'rp', pos: i }); i++; continue; }
    if (c === ',') { t.push({ k: 'comma', pos: i }); i++; continue; }
    throw { pos: i, msg: `无法识别的字符 "${c}"` };
  }
  return t;
}

// 把未知多字符标识符贪心拆成单字符变量/常数: xy -> x*y, pi x -> pi*x
function splitIdent(s) {
  const low = s.toLowerCase();
  const out = [];
  let j = 0;
  while (j < low.length) {
    if (low.startsWith('pi', j)) { out.push({ t: 'const', n: 'pi' }); j += 2; }
    else if (low[j] === 'x' || low[j] === 'y') { out.push({ t: 'var', n: low[j] }); j++; }
    else if (low[j] === 'e') { out.push({ t: 'const', n: 'e' }); j++; }
    else return null;
  }
  return out.length ? out : null;
}

function parseAST(src) {
  const toks = tokenize(src);
  let i = 0;
  const peek = () => toks[i];
  const startsFactor = k => k === 'num' || k === 'id' || k === 'lp' || k === 'sqrt';
  const die = (pos, msg) => { throw { pos, msg }; };

  function parseExpr() {
    let a = parseTerm();
    while (peek() && peek().k === 'op' && (peek().v === '+' || peek().v === '-')) {
      const op = toks[i++].v;
      a = { t: 'bin', op, a, b: parseTerm() };
    }
    return a;
  }

  function parseTerm() {
    let a = parseUnary();
    while (peek()) {
      const tk = peek();
      if (tk.k === 'op' && (tk.v === '*' || tk.v === '/')) {
        i++;
        a = { t: 'bin', op: tk.v, a, b: parseUnary() };
      } else if (startsFactor(tk.k)) {
        a = { t: 'bin', op: '*', a, b: parseUnary() };  // 隐式乘法
      } else break;
    }
    return a;
  }

  function parseUnary() {
    const tk = peek();
    if (tk && tk.k === 'op' && (tk.v === '-' || tk.v === '+')) {
      i++;
      const a = parseUnary();
      return tk.v === '-' ? { t: 'neg', a } : a;
    }
    return parsePow();
  }

  // 右结合; 指数允许一元负号 (x^-1); -x^2 = -(x^2)
  function parsePow() {
    const base = parsePrimary();
    if (peek() && peek().k === 'op' && peek().v === '^') {
      i++;
      return { t: 'bin', op: '^', a: base, b: parseUnary() };
    }
    return base;
  }

  function parsePrimary() {
    const tk = peek();
    if (!tk) die(src.length, '表达式意外结束');
    i++;
    if (tk.k === 'num') return { t: 'num', v: tk.v };
    if (tk.k === 'lp') {
      const e = parseExpr();
      if (!peek() || peek().k !== 'rp') die(tk.pos, '缺少右括号');
      i++;
      return e;
    }
    if (tk.k === 'sqrt') return { t: 'call', f: 'sqrt', args: [parsePow()] };
    if (tk.k === 'id') {
      const name = tk.v.toLowerCase();
      if (name === 'x' || name === 'y') return { t: 'var', n: name };
      if (name in CONSTANTS) return { t: 'const', n: name };
      if (name in FUNCS) {
        if (!peek() || peek().k !== 'lp') {
          die(tk.pos, `函数 ${name} 需要括号，例如 ${name}(x)`);
        }
        i++;
        const args = [parseExpr()];
        while (peek() && peek().k === 'comma') { i++; args.push(parseExpr()); }
        if (!peek() || peek().k !== 'rp') die(tk.pos, '缺少右括号');
        i++;
        const ar = FUNCS[name];
        if (ar >= 0 && args.length !== ar) die(tk.pos, `函数 ${name} 需要 ${ar} 个参数`);
        return { t: 'call', f: name, args };
      }
      const parts = splitIdent(tk.v);
      if (parts) {
        let node = parts[0];
        for (let k = 1; k < parts.length; k++) {
          node = { t: 'bin', op: '*', a: node, b: parts[k] };
        }
        return node;
      }
      die(tk.pos, `未知名称 "${tk.v}"`);
    }
    die(tk.pos, '此处不应出现该符号');
  }

  const ast = parseExpr();
  if (i < toks.length) die(toks[i].pos, '此处之后有多余的内容');
  return ast;
}

/* ---------- AST -> JS ---------- */
function genJS(n) {
  switch (n.t) {
    case 'num': return '(' + n.v + ')';
    case 'var': return n.n;
    case 'const': return '(' + CONSTANTS[n.n] + ')';
    case 'neg': return '(-(' + genJS(n.a) + '))';
    case 'bin':
      if (n.op === '^') return 'Math.pow(' + genJS(n.a) + ',' + genJS(n.b) + ')';
      return '(' + genJS(n.a) + n.op + genJS(n.b) + ')';
    case 'call': {
      const a = n.args.map(genJS);
      switch (n.f) {
        case 'ln': case 'log': return 'Math.log(' + a[0] + ')';
        case 'lg': case 'log10': return 'Math.log10(' + a[0] + ')';
        case 'mod': return '(' + a[0] + '%' + a[1] + ')';
        case 'sec': return '(1/Math.cos(' + a[0] + '))';
        case 'csc': return '(1/Math.sin(' + a[0] + '))';
        case 'cot': return '(1/Math.tan(' + a[0] + '))';
        case 'clamp': return 'Math.min(Math.max(' + a[0] + ',' + a[1] + '),' + a[2] + ')';
        case 'step': return '(' + a[1] + '<' + a[0] + '?0:1)';
        default: return 'Math.' + n.f + '(' + a.join(',') + ')';
      }
    }
  }
}

function compile(src) {
  const ast = parseAST(src);
  const fn = new Function('x', 'y', '"use strict";return(' + genJS(ast) + ');');
  fn(0.37, -0.62); // 冒烟测试 (允许 NaN, 只捕语法错误)
  return { ast, fn };
}

/* ---------- AST -> HTML 预览 ---------- */
function prec(n) {
  if (n.t === 'bin') return (n.op === '+' || n.op === '-') ? 1 : (n.op === '*' || n.op === '/') ? 2 : 3;
  if (n.t === 'neg') return 4;
  return 9;
}
function numStr(v) {
  if (!isFinite(v)) return String(v);
  if (Math.abs(v) < 1e-12) return '0';
  return String(Math.round(v * 1e10) / 1e10);
}
function fmtHTML(n) {
  switch (n.t) {
    case 'num': return numStr(n.v);
    case 'var': return '<i>' + n.n + '</i>';
    case 'const': return '<i>' + (n.n === 'pi' ? 'π' : 'e') + '</i>';
    case 'neg': {
      const inner = (prec(n.a) <= 1 || n.a.t === 'neg') ? '(' + fmtHTML(n.a) + ')' : fmtHTML(n.a);
      return '−' + inner;
    }
    case 'bin': {
      const { op, a, b } = n;
      if (op === '+')
        return fmtHTML(a) + ' + ' + ((b.t === 'bin' && b.op === '-') || b.t === 'neg' ? '(' + fmtHTML(b) + ')' : fmtHTML(b));
      if (op === '-')
        return fmtHTML(a) + ' − ' + (prec(b) <= 1 ? '(' + fmtHTML(b) + ')' : fmtHTML(b));
      if (op === '*') {
        const L = (prec(a) < 2 || a.t === 'neg') ? '(' + fmtHTML(a) + ')' : fmtHTML(a);
        const R = (prec(b) < 2 || b.t === 'neg') ? '(' + fmtHTML(b) + ')' : fmtHTML(b);
        return L + '·' + R;
      }
      if (op === '/')
        return '<span class="frac"><span>' + fmtHTML(a) + '</span><span>' + fmtHTML(b) + '</span></span>';
      if (op === '^') {
        const base = (prec(a) < 3 || a.t === 'neg') ? '(' + fmtHTML(a) + ')' : fmtHTML(a);
        return base + '<sup>' + fmtHTML(b) + '</sup>';
      }
    }
    // eslint-disable-next-line no-fallthrough
    case 'call': {
      const a = n.args.map(fmtHTML);
      if (n.f === 'abs') return '|' + a[0] + '|';
      if (n.f === 'sqrt') return '√<span class="rtrad">' + a[0] + '</span>';
      const name = n.f === 'log10' ? 'lg' : n.f;
      return name + '(' + a.join(', ') + ')';
    }
  }
}

/* =====================================================================
 * 数值工具
 * ===================================================================== */
const H = 1e-4;
const ddx = (f, x, y) => (f(x + H, y) - f(x - H, y)) / (2 * H);
const ddy = (f, x, y) => (f(x, y + H) - f(x, y - H)) / (2 * H);
const lap = (f, x, y) =>
  (f(x + H, y) + f(x - H, y) + f(x, y + H) + f(x, y - H) - 4 * f(x, y)) / (H * H);

// ∮ F·dr, 沿半径 R 的圆周 (逆时针)
function circulation(F, R, N = 720) {
  let s = 0;
  for (let k = 0; k < N; k++) {
    const th = 2 * Math.PI * k / N;
    const px = R * Math.cos(th), py = R * Math.sin(th);
    const v = F(px, py);
    if (!isFinite(v[0]) || !isFinite(v[1])) return NaN;
    s += v[0] * (-R * Math.sin(th)) + v[1] * (R * Math.cos(th));
  }
  return s * 2 * Math.PI / N;
}

/* =====================================================================
 * 预设函数: 四个量分别为 0 的情形 + 教学示例
 * ===================================================================== */
const PRESETS_VEC = [
  { label: '散度=0', title: '纯旋转场 ∇·F=0, ∇×F=+2', P: '-y', Q: 'x' },
  { label: '旋度=0', title: '放射场(源) ∇×F=0, ∇·F=+2, 环量=0', P: 'x', Q: 'y' },
  { label: '环量=0', title: '鞍形场 F=∇((x²−y²)/2)，保守场环量=0', P: 'x', Q: '-y' },
  { label: '汇(负散度)', title: '∇·F=−2，箭头向内', P: '-x', Q: '-y' },
  { label: '奇点涡旋', title: 'F=(−y,x)/(x²+y²)：除原点外旋度≈0，但环量=2π —— 格林公式在奇点处失效', P: '-y/(x^2+y^2)', Q: 'x/(x^2+y^2)' },
  { label: '双曲场(全零)', title: '∇·F=0, ∇×F=0, 环量=0', P: 'y', Q: 'x' },
  { label: '剪切流', title: '∇·F=0, ∇×F=−1', P: 'y', Q: '0' },
  { label: '波状场', title: 'P=sin(y), Q=sin(x)', P: 'sin(y)', Q: 'sin(x)' }
];
const PRESETS_SCALAR = [
  { label: '梯度=0', title: '常数函数 ∇f=0', f: '1' },
  { label: '向外梯度', title: 'f=x²+y²，∇f 向外', f: 'x^2+y^2' },
  { label: '向内梯度', title: 'f=−(x²+y²)，∇f 向内', f: '-(x^2+y^2)' },
  { label: '山峰', title: 'f=e^(−(x²+y²))，梯度指向峰顶', f: 'e^(-(x^2+y^2))' },
  { label: '鞍面', title: 'f=x²−y²', f: 'x^2-y^2' },
  { label: '波纹', title: 'f=sin(3x)·cos(3y)', f: 'sin(3x)*cos(3y)' }
];

/* =====================================================================
 * 页面逻辑
 * ===================================================================== */
const R = 1;          // 圆域半径 (环量沿此圆积分, 与视频一致)
const VIEW = 1.35;    // 世界坐标视野 [-1.35, 1.35]

const state = {
  mode: 'vec',
  P: null, Q: null, f: null,       // 编译后的函数
  Psrc: '-y', Qsrc: 'x', fsrc: 'x^2+y^2',
  probe: { x: 0, y: 0 },
  playing: true, speed: 1,
  dirty: true
};
let fieldVer = 0;            // 场内容版本号: 变了就重算热力图/曲面/环量曲线
const hmCache = {};          // 热力图数值缓存

function currentField() {
  if (state.mode === 'vec') {
    const P = state.P, Q = state.Q;
    return (x, y) => [P(x, y), Q(x, y)];
  }
  const f = state.f;
  return (x, y) => [ddx(f, x, y), ddy(f, x, y)];   // ∇f
}

/* ============================== Node 导出 (测试用) ============================== */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseAST, compile, genJS, fmtHTML, circulation, tokenize };
}

/* ============================== 浏览器端 ============================== */
if (typeof document !== 'undefined') init();

function init() {
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');
  const staticCv = document.createElement('canvas');
  const sctx = staticCv.getContext('2d');
  const trailCv = document.createElement('canvas');
  const tctx = trailCv.getContext('2d');

  const $ = id => document.getElementById(id);
  const inP = $('inP'), inQ = $('inQ'), inf = $('inf');
  const inputs = [inP, inQ, inf];
  let lastInput = inP;

  /* ---------- 画布尺寸 ---------- */
  let dpr = 1, size = 640;
  function resize() {
    dpr = window.devicePixelRatio || 1;
    size = cv.clientWidth;
    for (const c of [cv, staticCv, trailCv]) {
      c.width = size * dpr; c.height = size * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.dirty = true;
    resizeSurface();
    drawHeatmap($('hmDiv'), 'div');
    drawHeatmap($('hmCurl'), 'curl');
    drawCircCurve();
  }
  const w2c = v => (v / VIEW + 1) * 0.5 * size;   // world -> css px
  const c2w = p => (p / size * 2 - 1) * VIEW;     // css px -> world
  window.addEventListener('resize', resize);

  /* ---------- 表达式输入 ---------- */
  function setErr(input, err) {
    const box = input.closest('label').querySelector('.err');
    if (!err) { box.textContent = ''; input.classList.remove('bad'); return; }
    input.classList.add('bad');
    const src = input.value;
    const caret = '　'.repeat(0) + '↑ 第 ' + (err.pos + 1) + ' 个字符附近';
    box.textContent = '⚠ ' + err.msg + '　' + caret + '："' +
      src.slice(Math.max(0, err.pos - 6), err.pos) + '⟪' + (src[err.pos] || '∅') + '⟫' +
      src.slice(err.pos + 1, err.pos + 8) + '"';
  }

  function tryCompile(input, key) {
    const src = input.value.trim();
    if (!src) { setErr(input, { pos: 0, msg: '表达式为空' }); return false; }
    try {
      const { ast, fn } = compile(src);
      state[key] = fn;
      input.dataset.html = fmtHTML(ast);
      setErr(input, null);
      return true;
    } catch (e) {
      setErr(input, e.msg ? e : { pos: 0, msg: String(e) });
      return false;
    }
  }

  function updatePreview() {
    const pv = $('preview');
    if (state.mode === 'vec') {
      if (inP.dataset.html && inQ.dataset.html) {
        pv.innerHTML = 'F(x,y) = ⟨ ' + inP.dataset.html + ' , ' + inQ.dataset.html + ' ⟩';
      }
    } else if (inf.dataset.html) {
      pv.innerHTML = 'f(x,y) = ' + inf.dataset.html + '　→　∇f = ⟨ ∂f/∂x , ∂f/∂y ⟩';
    }
  }

  function recompile() {
    if (state.mode === 'vec') {
      const okP = tryCompile(inP, 'P'), okQ = tryCompile(inQ, 'Q');
      if (!okP || !okQ) return;
    } else {
      if (!tryCompile(inf, 'f')) return;
    }
    updatePreview();
    updateMetrics();
    state.dirty = true;
    fieldVer++;
    for (const k in hmCache) delete hmCache[k];
    surfVersion++;
    clearTrails();
    drawSurface();
    drawHeatmap($('hmDiv'), 'div');
    drawHeatmap($('hmCurl'), 'curl');
    drawCircCurve();
  }
  inputs.forEach(inp => {
    inp.addEventListener('input', recompile);
    inp.addEventListener('focus', () => { lastInput = inp; });
  });

  /* ---------- 虚拟键盘 ---------- */
  const KEYS = ['x', 'y', 'π', 'e', '(', ')', ',', '^',
    '+', '−', '×', '÷', '√(', 'abs(', 'min(', 'max(',
    'sin(', 'cos(', 'tan(', 'asin(', 'acos(', 'atan(', 'atan2(', 'cot(',
    'exp(', 'ln(', 'lg(', 'sinh(', 'cosh(', 'hypot(', 'pow(', 'mod('];
  const kb = $('keypad');
  for (const k of KEYS) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = k.replace('(', ''); b.dataset.ins = k;
    b.onclick = () => insertText(k);
    kb.appendChild(b);
  }
  const back = document.createElement('button');
  back.textContent = '⌫'; back.className = 'wide';
  back.onclick = () => {
    const inp = lastInput, s = inp.selectionStart;
    if (s > 0) {
      inp.value = inp.value.slice(0, s - 1) + inp.value.slice(inp.selectionEnd);
      inp.setSelectionRange(s - 1, s - 1); inp.dispatchEvent(new Event('input'));
    }
    inp.focus();
  };
  kb.appendChild(back);
  const clr = document.createElement('button');
  clr.textContent = '清空'; clr.className = 'wide';
  clr.onclick = () => { lastInput.value = ''; lastInput.dispatchEvent(new Event('input')); lastInput.focus(); };
  kb.appendChild(clr);

  function insertText(s) {
    const inp = lastInput;
    const st = inp.selectionStart ?? inp.value.length;
    const en = inp.selectionEnd ?? inp.value.length;
    inp.value = inp.value.slice(0, st) + s + inp.value.slice(en);
    inp.setSelectionRange(st + s.length, st + s.length);
    inp.dispatchEvent(new Event('input'));
    inp.focus();
  }

  /* ---------- 模式切换 ---------- */
  function setMode(m) {
    state.mode = m;
    $('tabVec').classList.toggle('active', m === 'vec');
    $('tabScalar').classList.toggle('active', m === 'scalar');
    $('vecRow').hidden = m !== 'vec';
    $('scalarRow').hidden = m !== 'scalar';
    $('presetVec').hidden = m !== 'vec';
    $('presetScalar').hidden = m !== 'scalar';
    $('contourRow').hidden = m !== 'scalar';
    $('capDiv').textContent = m === 'scalar' ? '拉普拉斯 ∇²f = ∇·(∇f)' : '散度 ∇·F';
    $('capCurl').textContent = m === 'scalar' ? '旋度 ∇×∇f（恒为 0）' : '旋度 ∇×F';
    fillBgOptions();
    recompile();
  }
  $('tabVec').onclick = () => setMode('vec');
  $('tabScalar').onclick = () => setMode('scalar');

  /* ---------- 预设 ---------- */
  function buildPresets(list, el, apply) {
    for (const p of list) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = p.label; b.title = p.title;
      b.onclick = () => apply(p);
      el.appendChild(b);
    }
  }
  buildPresets(PRESETS_VEC, $('presetVec'), p => {
    inP.value = p.P; inQ.value = p.Q; recompile();
  });
  buildPresets(PRESETS_SCALAR, $('presetScalar'), p => {
    inf.value = p.f; recompile();
  });

  /* ---------- 背景选项 ---------- */
  const BG_VEC = [['none', '无'], ['div', '散度 ∇·F'], ['curl', '旋度 ∇×F'], ['speed', '流速 |F|']];
  const BG_SCALAR = [['none', '无'], ['fval', 'f 的正负'], ['gmag', '梯度模 |∇f|'], ['lap', '拉普拉斯 ∇²f']];
  function fillBgOptions() {
    const sel = $('bgSel'); sel.innerHTML = '';
    for (const [v, t] of (state.mode === 'vec' ? BG_VEC : BG_SCALAR)) {
      const o = document.createElement('option'); o.value = v; o.textContent = t;
      sel.appendChild(o);
    }
  }
  $('bgSel').onchange = () => { state.dirty = true; };

  /* ---------- 控件 ---------- */
  $('btnPlay').onclick = () => {
    state.playing = !state.playing;
    $('btnPlay').textContent = state.playing ? '⏸ 暂停' : '▶ 播放';
  };
  $('speed').oninput = e => { state.speed = +e.target.value; };
  $('pcount').onchange = e => { setParticleCount(+e.target.value); };
  $('chkFlow').onchange = () => { clearTrails(); };
  $('chkArrows').onchange = () => { state.dirty = true; };
  $('chkNorm').onchange = () => { state.dirty = true; };
  $('chkContour').onchange = () => { state.dirty = true; };

  /* ---------- 观测点 ---------- */
  cv.addEventListener('click', e => {
    const r = cv.getBoundingClientRect();
    state.probe.x = c2w(e.clientX - r.left);
    state.probe.y = -((e.clientY - r.top) / size * 2 - 1) * VIEW;
    updateMetrics();
    state.dirty = true;
    drawHeatmap($('hmDiv'), 'div');
    drawHeatmap($('hmCurl'), 'curl');
  });

  /* ---------- 数值面板 ---------- */
  function fmtVal(v) {
    if (!isFinite(v)) return { s: '—', cls: 'na', title: '此处为奇异点或不可计算' };
    if (Math.abs(v) < 1e-7) return { s: '0', cls: 'zero' };
    const s = Math.abs(v) >= 1e4 || Math.abs(v) < 1e-3 ? v.toExponential(3) : (+v.toPrecision(4)).toString();
    return { s: (v > 0 ? '+' : '') + s, cls: v > 0 ? 'pos' : 'neg' };
  }

  function updateMetrics() {
    const F = currentField();
    const { x, y } = state.probe;
    const v = F(x, y);
    const P = (x, y) => F(x, y)[0], Q = (x, y) => F(x, y)[1];
    const div = ddx(P, x, y) + ddy(Q, x, y);
    const curl = ddx(Q, x, y) - ddy(P, x, y);
    const circ = circulation(F, R);
    const spd = Math.hypot(v[0], v[1]);

    let chips;
    if (state.mode === 'vec') {
      chips = [
        ['散度 ∇·F', div, '∂P/∂x + ∂Q/∂y'],
        ['旋度 ∇×F', curl, '∂Q/∂x − ∂P/∂y'],
        ['环量 ∮F·dr', circ, '沿 R=1 圆周，逆时针'],
        ['流速 |F|', spd, '观测点处速率']
      ];
    } else {
      chips = [
        ['梯度模 |∇f|', spd, '变化最快的方向的大小'],
        ['拉普拉斯 ∇²f', lap(state.f, x, y), '= ∇·(∇f)'],
        ['旋度 ∇×∇f', curl, '梯度场必为无旋场'],
        ['环量 ∮∇f·dr', circ, '保守场环量恒为 0']
      ];
    }
    $('probeLbl').textContent = `　观测点 (${x.toFixed(2)}, ${y.toFixed(2)})` +
      (state.mode === 'scalar' ? `　f = ${numStr(state.f(x, y))}` : '');
    $('metrics').innerHTML = chips.map(([t, val, sub]) => {
      const f0 = fmtVal(val);
      return `<div class="chip ${f0.cls}" title="${sub}${f0.title ? '；' + f0.title : ''}">
        <span class="cap">${t}</span><span class="val">${f0.s}</span></div>`;
    }).join('');
  }

  /* ---------- 粒子系统 ---------- */
  let px = new Float32Array(0), py = new Float32Array(0), life = new Int32Array(0);
  let P_COUNT = 700;
  function setParticleCount(n) { P_COUNT = n; px = new Float32Array(n); py = new Float32Array(n); life = new Int32Array(n); for (let i = 0; i < n; i++) respawn(i); }
  function respawn(i) {
    const a = Math.random() * 2 * Math.PI, r = Math.sqrt(Math.random()) * R * 0.97;
    px[i] = r * Math.cos(a); py[i] = r * Math.sin(a); life[i] = Math.random() * 240 | 0;
  }
  function clearTrails() { tctx.clearRect(0, 0, size, size); for (let i = 0; i < P_COUNT; i++) respawn(i); }

  /* ---------- 静态层: 背景 + 箭头 + 圆 + 等值线 ---------- */
  function drawStatic() {
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.clearRect(0, 0, size, size);
    const F = currentField();

    // 背景着色
    const bg = $('bgSel').value;
    if (bg !== 'none') {
      const N = 56, cell = size / N;
      const vals = new Float64Array(N * N);
      let maxAbs = 1e-9;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = ((i + 0.5) / N * 2 - 1) * VIEW, y = -((j + 0.5) / N * 2 - 1) * VIEW;
        if (x * x + y * y > R * R) { vals[j * N + i] = NaN; continue; }
        let v;
        if (bg === 'speed' || bg === 'gmag') { const w = F(x, y); v = Math.hypot(w[0], w[1]); }
        else if (bg === 'div') v = ddx((a, b) => F(a, b)[0], x, y) + ddy((a, b) => F(a, b)[1], x, y);
        else if (bg === 'curl') v = ddx((a, b) => F(a, b)[1], x, y) - ddy((a, b) => F(a, b)[0], x, y);
        else if (bg === 'fval') v = state.f(x, y);
        else v = lap(state.f, x, y);
        vals[j * N + i] = v;
        if (isFinite(v) && Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
      }
      const single = (bg === 'speed' || bg === 'gmag');
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const v = vals[j * N + i];
        if (!isFinite(v)) continue;
        const a = Math.min(0.42, 0.42 * Math.abs(v) / maxAbs);
        sctx.fillStyle = single ? `rgba(13,148,136,${a})`
          : v > 0 ? `rgba(16,122,87,${a})` : `rgba(185,28,60,${a})`;
        sctx.fillRect(i * cell, j * cell, cell + 0.5, cell + 0.5);
      }
    }

    // 等值线 (标量模式)
    if (state.mode === 'scalar' && $('chkContour').checked) drawContours();

    // 箭头
    if ($('chkArrows').checked) drawArrows(F);

    // 坐标轴 + 圆边界
    sctx.strokeStyle = 'rgba(100,116,139,.45)'; sctx.lineWidth = 1;
    sctx.beginPath(); sctx.moveTo(0, size / 2); sctx.lineTo(size, size / 2);
    sctx.moveTo(size / 2, 0); sctx.lineTo(size / 2, size); sctx.stroke();
    for (const t of [-1, 1]) {
      sctx.beginPath(); sctx.moveTo(w2c(t), size / 2 - 4); sctx.lineTo(w2c(t), size / 2 + 4); sctx.stroke();
      sctx.beginPath(); sctx.moveTo(size / 2 - 4, w2c(t)); sctx.lineTo(size / 2 + 4, w2c(t)); sctx.stroke();
    }
    sctx.fillStyle = 'rgba(100,116,139,.8)'; sctx.font = '11px sans-serif';
    sctx.fillText('1', w2c(1) + 4, size / 2 + 14);
    sctx.fillText('−1', w2c(-1) + 4, size / 2 + 14);
    sctx.fillText('1', size / 2 + 6, w2c(1) - 4);
    sctx.fillText('−1', size / 2 + 6, w2c(-1) - 4);
    sctx.beginPath(); sctx.arc(size / 2, size / 2, w2c(R) - size / 2, 0, Math.PI * 2);
    sctx.strokeStyle = 'rgba(51,65,85,.9)'; sctx.lineWidth = 1.4; sctx.stroke();
    sctx.fillStyle = 'rgba(51,65,85,.7)'; sctx.font = '11px sans-serif';
    sctx.fillText('R=1', size / 2 + (w2c(R) - size / 2) * Math.SQRT1_2 + 3, size / 2 - (w2c(R) - size / 2) * Math.SQRT1_2 - 3);

    // 观测点
    const pxp = w2c(state.probe.x), pyp = w2c(-state.probe.y);
    sctx.strokeStyle = '#b91c1c'; sctx.lineWidth = 1.4;
    sctx.beginPath(); sctx.arc(pxp, pyp, 4, 0, Math.PI * 2); sctx.stroke();
    sctx.beginPath(); sctx.moveTo(pxp - 7, pyp); sctx.lineTo(pxp + 7, pyp);
    sctx.moveTo(pxp, pyp - 7); sctx.lineTo(pxp, pyp + 7); sctx.stroke();
  }

  function drawArrows(F) {
    const n = 15, span = 2 * R, step = span / (n - 1);
    const norm = $('chkNorm').checked;
    const mags = [];
    const pts = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = -R + i * step, y = -R + j * step;
      if (x * x + y * y > R * R * 0.96) continue;
      const v = F(x, y), m = Math.hypot(v[0], v[1]);
      if (!isFinite(m)) continue;
      pts.push({ x, y, vx: v[0], vy: v[1], m });
      mags.push(m);
    }
    mags.sort((a, b) => a - b);
    const med = mags[mags.length >> 1] || 1;
    sctx.strokeStyle = 'rgba(30,50,70,.88)'; sctx.fillStyle = 'rgba(30,50,70,.88)';
    sctx.lineWidth = 1.2; sctx.lineCap = 'round';
    const L = step * 0.42;
    for (const p of pts) {
      const cx = w2c(p.x), cy = w2c(-p.y);
      if (p.m < 1e-7) { sctx.beginPath(); sctx.arc(cx, cy, 1.3, 0, 7); sctx.fill(); continue; }
      const k = norm ? L : L * (p.m / (p.m + med));
      const ux = p.vx / p.m, uy = p.vy / p.m;
      const x2 = cx + ux * k, y2 = cy - uy * k;
      sctx.beginPath(); sctx.moveTo(cx - ux * k * 0.4, cy + uy * k * 0.4); sctx.lineTo(x2, y2); sctx.stroke();
      const ha = 0.45;
      const hx = -ux * Math.cos(ha) + uy * Math.sin(ha), hy = -uy * Math.cos(ha) - ux * Math.sin(ha);
      const hx2 = -ux * Math.cos(ha) - uy * Math.sin(ha), hy2 = -uy * Math.cos(ha) + ux * Math.sin(ha);
      sctx.beginPath();
      sctx.moveTo(x2, y2); sctx.lineTo(x2 + hx * k * 0.38, y2 - hy * k * 0.38);
      sctx.moveTo(x2, y2); sctx.lineTo(x2 + hx2 * k * 0.38, y2 - hy2 * k * 0.38);
      sctx.stroke();
    }
  }

  function drawContours() {
    const f = state.f, G = 90;
    const g = new Float64Array((G + 1) * (G + 1));
    let mn = Infinity, mx = -Infinity;
    for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) {
      const x = (i / G * 2 - 1) * VIEW, y = -(j / G * 2 - 1) * VIEW;
      const v = f(x, y);
      g[j * (G + 1) + i] = isFinite(v) ? v : NaN;
      if (isFinite(v)) { if (v < mn) mn = v; if (v > mx) mx = v; }
    }
    if (!isFinite(mn) || mx - mn < 1e-9) return;
    const L = 12;
    sctx.strokeStyle = 'rgba(100,116,139,.5)'; sctx.lineWidth = 1;
    sctx.beginPath();
    const X = i => (i / G * 2 - 1) * VIEW, Y = j => -(j / G * 2 - 1) * VIEW;
    for (let li = 1; li <= L; li++) {
      const iso = mn + (mx - mn) * li / (L + 1);
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
        const a = g[j * (G + 1) + i], b = g[j * (G + 1) + i + 1],
          c = g[(j + 1) * (G + 1) + i + 1], d = g[(j + 1) * (G + 1) + i];
        if ([a, b, c, d].some(v => !isFinite(v))) continue;
        const code = (a > iso ? 8 : 0) | (b > iso ? 4 : 0) | (c > iso ? 2 : 0) | (d > iso ? 1 : 0);
        if (code === 0 || code === 15) continue;
        const mx2 = (X(i) + X(i + 1)) / 2, my2 = (Y(j) + Y(j + 1)) / 2;
        if (mx2 * mx2 + my2 * my2 > R * R) continue;
        const tx = (u, v) => (iso - u) / (v - u);
        // 边: top(a-b) right(b-c) bottom(d-c) left(a-d)
        const T = [X(i) + tx(a, b) * (X(i + 1) - X(i)), Y(j)];
        const Rt = [X(i + 1), Y(j) + tx(b, c) * (Y(j + 1) - Y(j))];
        const B = [X(i) + tx(d, c) * (X(i + 1) - X(i)), Y(j + 1)];
        const Lf = [X(i), Y(j) + tx(a, d) * (Y(j + 1) - Y(j))];
        const seg = (p, q) => { sctx.moveTo(w2c(p[0]), w2c(-p[1])); sctx.lineTo(w2c(q[0]), w2c(-q[1])); };
        switch (code) {
          case 1: case 14: seg(Lf, B); break;
          case 2: case 13: seg(B, Rt); break;
          case 3: case 12: seg(Lf, Rt); break;
          case 4: case 11: seg(T, Rt); break;
          case 5: seg(T, Rt); seg(Lf, B); break;
          case 6: case 9: seg(T, B); break;
          case 7: case 8: seg(Lf, T); break;
          case 10: seg(Lf, T); seg(B, Rt); break;
        }
      }
    }
    sctx.stroke();
  }

  /* ---------- 量场分布: 散度/旋度热力图 + 环量曲线 ---------- */
  // 把"量"当作标量场: div/curl/速度 都可用于热力图和 3D 曲面
  function scalarField(kind) {
    const F = currentField();
    if (kind === 'div') return (x, y) =>
      (F(x + H, y)[0] - F(x - H, y)[0] + F(x, y + H)[1] - F(x, y - H)[1]) / (2 * H);
    if (kind === 'curl') return (x, y) =>
      (F(x + H, y)[1] - F(x - H, y)[1] - F(x, y - H)[0] + F(x, y + H)[0]) / (2 * H);
    return (x, y) => Math.hypot(F(x, y)[0], F(x, y)[1]);   // 'speed'
  }

  function drawHeatmap(cnv, kind) {
    const c2 = cnv.getContext('2d');
    const s = cnv.clientWidth;
    cnv.width = s * dpr; cnv.height = s * dpr;
    c2.setTransform(dpr, 0, 0, dpr, 0, 0);
    c2.clearRect(0, 0, s, s);
    const N = 96, cell = s / N;
    let cache = hmCache[kind];
    if (!cache || cache.v !== fieldVer) {
      const fn = scalarField(kind);
      const vals = new Float64Array(N * N);
      let mx = 1e-9, mn = Infinity, mxv = -Infinity;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = ((i + 0.5) / N * 2 - 1) * VIEW, y = -((j + 0.5) / N * 2 - 1) * VIEW;
        if (x * x + y * y > R * R) { vals[j * N + i] = NaN; continue; }
        const v = fn(x, y);
        vals[j * N + i] = v;
        if (isFinite(v)) {
          mx = Math.max(mx, Math.abs(v));
          mn = Math.min(mn, v); mxv = Math.max(mxv, v);
        }
      }
      cache = hmCache[kind] = { vals, mx, mn, mxv, v: fieldVer };
      const sub = kind === 'div' ? $('subDiv') : $('subCurl');
      if (!isFinite(mn)) sub.textContent = '全域奇异';
      else sub.textContent = `[${numStr(mn)}, ${numStr(mxv)}]`;
    }
    const { vals, mx } = cache;
    const single = kind === 'speed';
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const v = vals[j * N + i];
      if (!isFinite(v)) continue;
      const a = Math.min(0.85, 0.07 + 0.85 * Math.abs(v) / mx);
      c2.fillStyle = single ? `rgba(13,148,136,${a})`
        : v > 0 ? `rgba(15,118,110,${a})` : `rgba(185,28,60,${a})`;
      c2.fillRect(i * cell, j * cell, cell + 0.6, cell + 0.6);
    }
    // 圆界 + 观测点十字
    c2.strokeStyle = 'rgba(51,65,85,.9)'; c2.lineWidth = 1.2;
    c2.beginPath(); c2.arc(s / 2, s / 2, s / 2 * (R / VIEW), 0, Math.PI * 2); c2.stroke();
    const px = (state.probe.x / VIEW + 1) / 2 * s, py = (-state.probe.y / VIEW + 1) / 2 * s;
    c2.strokeStyle = '#b91c1c';
    c2.beginPath(); c2.arc(px, py, 3.5, 0, Math.PI * 2); c2.stroke();
    c2.beginPath(); c2.moveTo(px - 6, py); c2.lineTo(px + 6, py);
    c2.moveTo(px, py - 6); c2.lineTo(px, py + 6); c2.stroke();
  }

  // 环量随圆半径 r 变化的曲线: C(r) = ∮_{|p|=r} F·dr
  function drawCircCurve() {
    const cnv = $('lnCirc'), c2 = cnv.getContext('2d');
    const s = cnv.clientWidth;
    cnv.width = s * dpr; cnv.height = s * dpr;
    c2.setTransform(dpr, 0, 0, dpr, 0, 0);
    c2.clearRect(0, 0, s, s);
    const F = currentField();
    const M = 56, pts = [];
    let mx = 1e-9;
    for (let i = 1; i <= M; i++) {
      const c = circulation(F, R * i / M, 240);
      pts.push([R * i / M, c]);
      if (isFinite(c)) mx = Math.max(mx, Math.abs(c));
    }
    const L = 30, B = 20, T = 8, Rt = 8;
    const pw = s - L - Rt, ph = s - T - B;
    const yZ = T + ph / 2;
    // 坐标轴 + 零线
    c2.strokeStyle = 'rgba(100,116,139,.55)'; c2.lineWidth = 1;
    c2.beginPath(); c2.moveTo(L, T); c2.lineTo(L, T + ph); c2.lineTo(L + pw, T + ph); c2.stroke();
    c2.beginPath(); c2.moveTo(L, yZ); c2.lineTo(L + pw, yZ); c2.stroke();
    // ±2π 参考线 (视频里的基准值)
    const refY = c => yZ - (c / mx) * (ph / 2 - 4);
    if (mx >= Math.PI) {
      c2.setLineDash([3, 3]); c2.strokeStyle = 'rgba(100,116,139,.45)';
      for (const r0 of [2 * Math.PI, -2 * Math.PI]) {
        if (Math.abs(r0) <= mx * 1.02) {
          c2.beginPath(); c2.moveTo(L, refY(r0)); c2.lineTo(L + pw, refY(r0)); c2.stroke();
        }
      }
      c2.setLineDash([]);
    }
    c2.fillStyle = '#64748b'; c2.font = '10px sans-serif';
    c2.fillText(numStr(mx), 2, T + 9);
    c2.fillText('0', L - 9, yZ + 3);
    c2.fillText('−' + numStr(mx), 2, T + ph);
    c2.fillText('r', L + pw - 6, s - 5);
    if (mx >= 2 * Math.PI * 0.98) c2.fillText('±2π', L + 3, refY(2 * Math.PI) - 3);
    // 曲线
    c2.strokeStyle = '#0f766e'; c2.lineWidth = 1.7;
    c2.beginPath();
    let started = false, lx = 0, ly = 0, lastC = NaN;
    for (const [r, c] of pts) {
      if (!isFinite(c)) { started = false; continue; }
      const X = L + (r / R) * pw, Y = refY(c);
      if (started) c2.lineTo(X, Y); else c2.moveTo(X, Y);
      started = true; lx = X; ly = Y; lastC = c;
    }
    c2.stroke();
    if (started) {
      c2.fillStyle = '#b91c1c';
      c2.beginPath(); c2.arc(lx, ly, 3, 0, Math.PI * 2); c2.fill();
      $('subCirc').textContent = 'C(1) ≈ ' + (isFinite(lastC) ? numStr(lastC) : '—');
    }
  }

  // 热力图点击 -> 移动观测点
  for (const [cnv, kind] of [[$('hmDiv'), 'div'], [$('hmCurl'), 'curl']]) {
    cnv.addEventListener('click', e => {
      const r = cnv.getBoundingClientRect(), s = r.width;
      state.probe.x = ((e.clientX - r.left) / s * 2 - 1) * VIEW;
      state.probe.y = -(((e.clientY - r.top) / s) * 2 - 1) * VIEW;
      updateMetrics(); state.dirty = true;
      drawHeatmap($('hmDiv'), 'div');
      drawHeatmap($('hmCurl'), 'curl');
    });
  }
  $('surfSel').onchange = () => { surfVersion++; drawSurface(); };

  /* ---------- 原函数 / 势函数 3D 曲面 ---------- */
  const sv = $('sv'), sx = sv.getContext('2d');
  let sW = 480, sH = 360;
  let yaw = -0.72, pitch = 1.02, surfGrid = null, surfVersion = 0, drawnVersion = -1;

  function resizeSurface() {
    sW = sv.clientWidth; sH = sv.clientHeight;
    sv.width = sW * dpr; sv.height = sH * dpr;
    sx.setTransform(dpr, 0, 0, dpr, 0, 0);
    surfVersion++;
    drawSurface();
  }

  // 采样 z: auto=原函数 f / 势函数 φ; 也可直接画 散度/旋度/流速 标量场
  function computeSurface() {
    const G = 56, V = 1.2, n = G + 1;
    const z = new Float64Array(n * n);
    const xy = i => -V + 2 * V * i / G;
    const sel = $('surfSel').value;
    let cap;
    if (sel !== 'auto') {
      const fn = scalarField(sel);
      for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++)
        z[j * n + i] = fn(xy(i), xy(j));
      const name = { div: '散度场 ∇·F', curl: '旋度场 ∇×F', speed: '流速场 |F|' }[sel];
      cap = `z = ${name} · 拖拽旋转 · 绿为正、红为负`;
    } else if (state.mode === 'scalar') {
      for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++)
        z[j * n + i] = state.f(xy(i), xy(j));
      cap = 'z = f(x,y) 原函数曲面 · 拖拽旋转 · 绿为正、红为负';
    } else {
      const F = currentField();
      const dx = 2 * V / G, dy = 2 * V / G;
      z[0] = 0;
      for (let i = 1; i <= G; i++) {            // 底边行沿 x 对 P 积分
        const a = F(xy(i - 1), xy(0))[0], b = F(xy(i), xy(0))[0];
        z[i] = (isFinite(a) && isFinite(b) && isFinite(z[i - 1]))
          ? z[i - 1] + (a + b) / 2 * dx : NaN;
      }
      for (let i = 0; i <= G; i++) for (let j = 1; j <= G; j++) {  // 各列沿 y 对 Q 积分
        const a = F(xy(i), xy(j - 1))[1], b = F(xy(i), xy(j))[1];
        const prev = z[(j - 1) * n + i];
        z[j * n + i] = (isFinite(a) && isFinite(b) && isFinite(prev))
          ? prev + (a + b) / 2 * dy : NaN;
      }
      cap = 'z = φ(x,y)：∇φ = F 的势函数（路径积分重构；∇×F≠0 时与路径有关，曲面会出现裂口）';
    }
    surfGrid = { G, V, z };
    $('svCap').textContent = cap + '；地面椭圆是 R=1 圆';
  }

  function drawSurface() {
    if (drawnVersion === surfVersion && surfGrid) return;
    drawnVersion = surfVersion;
    computeSurface();
    const { G, V, z } = surfGrid, n = G + 1;
    sx.clearRect(0, 0, sW, sH);

    let zmin = Infinity, zmax = -Infinity;
    for (let k = 0; k < z.length; k++) {
      if (!isFinite(z[k])) continue;
      if (z[k] < zmin) zmin = z[k];
      if (z[k] > zmax) zmax = z[k];
    }
    if (!isFinite(zmin)) {
      sx.fillStyle = '#94a3b8'; sx.font = '14px sans-serif';
      sx.fillText('函数在此区域不可计算', 20, 30);
      return;
    }
    const zspan = Math.max(zmax - zmin, 1e-9);
    const maxAbs = Math.max(Math.abs(zmin), Math.abs(zmax), 1e-9);
    const zc = (zmin + zmax) / 2, zscale = 1.15 / zspan;   // 归一化后的视觉高度

    const cy1 = Math.cos(yaw), sy1 = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const S = Math.min(sW, sH) / (2 * V * 1.28), cx = sW / 2, cyc = sH * 0.56;
    // 世界 (x,y,z) -> 屏幕 (X, Y, depth)
    const proj = (x, y, zz) => {
      const x1 = x * cy1 - y * sy1, y1 = x * sy1 + y * cy1;
      return [cx + x1 * S, cyc - (y1 * cp - zz * sp) * S, y1 * sp + zz * cp];
    };
    const zAt = (i, j) => isFinite(z[j * n + i]) ? (z[j * n + i] - zc) * zscale : NaN;
    const xy = i => -V + 2 * V * i / G;

    // 地面: x/y 轴 + R=1 圆
    sx.lineWidth = 1;
    sx.strokeStyle = 'rgba(100,116,139,.5)';
    const line3 = (a, b) => { sx.beginPath(); sx.moveTo(a[0], a[1]); sx.lineTo(b[0], b[1]); sx.stroke(); };
    line3(proj(-V, 0, 0), proj(V, 0, 0));
    line3(proj(0, -V, 0), proj(0, V, 0));
    sx.setLineDash([4, 3]);
    sx.beginPath();
    for (let k = 0; k <= 72; k++) {
      const th = 2 * Math.PI * k / 72;
      const p = proj(R * Math.cos(th), R * Math.sin(th), 0);
      k ? sx.lineTo(p[0], p[1]) : sx.moveTo(p[0], p[1]);
    }
    sx.stroke(); sx.setLineDash([]);
    sx.fillStyle = 'rgba(100,116,139,.9)'; sx.font = '12px sans-serif';
    const lx = proj(V, 0, 0), ly = proj(0, V, 0);
    sx.fillText('x', lx[0] + 4, lx[1]); sx.fillText('y', ly[0] + 4, ly[1]);

    // 构造四边形并按深度排序 (画家算法)
    const quads = [];
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const z00 = zAt(i, j), z10 = zAt(i + 1, j), z01 = zAt(i, j + 1), z11 = zAt(i + 1, j + 1);
      if (![z00, z10, z01, z11].every(isFinite)) continue;
      const x0 = xy(i), x1 = xy(i + 1), y0 = xy(j), y1 = xy(j + 1);
      const p00 = proj(x0, y0, z00), p10 = proj(x1, y0, z10),
        p01 = proj(x0, y1, z01), p11 = proj(x1, y1, z11);
      quads.push({ p: [p00, p10, p11, p01], d: (p00[2] + p10[2] + p01[2] + p11[2]) / 4, zm: (z00 + z10 + z01 + z11) / 4 });
    }
    quads.sort((a, b) => a.d - b.d);

    const L = [-0.35, 0.55, -0.75];   // 光源方向 (屏幕空间: 上右前)
    for (const q of quads) {
      const [p00, p10, p11, p01] = q.p;
      // 屏幕空间法线 -> 明暗
      const ux = p10[0] - p00[0], uy = p10[1] - p00[1], ud = p10[2] - p00[2];
      const vx = p01[0] - p00[0], vy = p01[1] - p00[1], vd = p01[2] - p00[2];
      let nx = uy * vd - ud * vy, ny = ud * vx - ux * vd, nd = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nd) || 1;
      const lambert = Math.abs((nx * L[0] + ny * L[1] + nd * L[2]) / nl);
      const zorig = q.zm / zscale + zc;                     // 还原真实 z 值
      const t = Math.abs(zorig) / maxAbs;                   // |z|/max|z| -> 饱和度
      const base = zorig >= 0 ? [13, 120, 110] : [185, 28, 60];
      const inten = Math.min(1.15, 0.34 + 0.5 * t + 0.45 * lambert);
      const rr = Math.min(255, base[0] * inten + 30), gg = Math.min(255, base[1] * inten + 30), bb = Math.min(255, base[2] * inten + 30);
      sx.fillStyle = `rgb(${rr | 0},${gg | 0},${bb | 0})`;
      sx.beginPath();
      sx.moveTo(p00[0], p00[1]); sx.lineTo(p10[0], p10[1]);
      sx.lineTo(p11[0], p11[1]); sx.lineTo(p01[0], p01[1]);
      sx.closePath(); sx.fill();
      sx.strokeStyle = 'rgba(15,23,42,.14)'; sx.lineWidth = 0.6; sx.stroke();
    }
  }

  let drag = null;
  sv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; sv.setPointerCapture(e.pointerId); });
  sv.addEventListener('pointermove', e => {
    if (!drag) return;
    yaw += (e.clientX - drag.x) * 0.012;
    pitch = Math.max(0.12, Math.min(1.5, pitch - (e.clientY - drag.y) * 0.012));
    drag = { x: e.clientX, y: e.clientY };
    drawnVersion = -1; drawSurface();
  });
  sv.addEventListener('pointerup', () => { drag = null; });

  /* ---------- 主循环 ---------- */
  function frame() {
    if (state.dirty) { drawStatic(); state.dirty = false; }
    const F = currentField();
    const showFlow = $('chkFlow').checked;

    if (state.playing && showFlow) {
      // 淡出拖尾
      tctx.globalCompositeOperation = 'destination-out';
      tctx.fillStyle = 'rgba(0,0,0,0.055)';
      tctx.fillRect(0, 0, size, size);
      tctx.globalCompositeOperation = 'source-over';

      const dt = 0.016 * state.speed, maxStep = 0.09;
      tctx.strokeStyle = 'rgba(13,120,110,.55)'; tctx.lineWidth = 1.3;
      tctx.beginPath();
      for (let i = 0; i < P_COUNT; i++) {
        const v = F(px[i], py[i]);
        const m = Math.hypot(v[0], v[1]);
        if (!isFinite(m) || m < 1e-7) { if (++life[i] > 60) respawn(i); continue; }
        let s = m * dt; if (s > maxStep) s = maxStep;
        const nx = px[i] + v[0] / m * s, ny = py[i] + v[1] / m * s;
        if (nx * nx + ny * ny > R * R || ++life[i] > 480) { respawn(i); continue; }
        tctx.moveTo(w2c(px[i]), w2c(-py[i]));
        tctx.lineTo(w2c(nx), w2c(-ny));
        px[i] = nx; py[i] = ny;
      }
      tctx.stroke();
    }

    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(staticCv, 0, 0, size, size);
    ctx.drawImage(trailCv, 0, 0, size, size);
    requestAnimationFrame(frame);
  }

  /* ---------- 启动 ---------- */
  inP.value = state.Psrc; inQ.value = state.Qsrc; inf.value = state.fsrc;
  setParticleCount(P_COUNT);
  fillBgOptions();
  recompile();          // 先编译场 (内部会画一次)
  resize();             // 再按实际尺寸统一重绘
  requestAnimationFrame(frame);
}
