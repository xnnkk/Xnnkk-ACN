/* ACN 战术点击反馈（Delta Force / 三角洲行动 HUD 风格）
 * 纯原生、无依赖、自注入样式；只在点击坐标处绘制，不改动任何页面元素与版式。
 *
 * 视觉依据（已查证）：
 *  - 游戏「命中反馈 / 击杀图标」：屏幕中央白色 X 形四段斜线，短促缩放后消失；
 *    命中特效颜色可在 设置→音画设置→画面设置→命中特效 中自定义（经典红 / 亮白等）。
 *  - 准星自定义：空心十字 / 点 / 方框四角，青绿 / 橙黄，含中心点。
 *  - 官网军事科技 HUD：荧光绿 #0ff796（夜视仪绿）、橙红 #ff6b00（警告）、纯黑底白字，
 *    减法设计、细线框，不用粒子/烟花/渐变。
 *  - 骇爪「信号破译器」：一条扫过的轨迹线（此处抽象为极短的横向扫描线）。
 *
 * 因此一次点击 = 命中 X 标记 + 四角括号收拢 + 细方框扩散 + 中心点 + 扫描线，
 * 全部在 420ms 内结束，无回弹、无发光模糊、无彩色粒子。
 *
 * 用法（基线 HTML 底部加一行即可）：
 *   <script src="assets/js/acn-click-fx.js"></script>
 * 开关：localStorage acn_clickfx=off，或 window.setClickFxEnabled(false)
 * 配色：window.setClickFxTheme('hud' | 'hit' | 'alert')
 */
(function () {
  'use strict';

  var THEMES = {
    hud:   { main: '#0ff796', hit: '#ffffff', ring: 'rgba(15,247,150,.55)' },
    hit:   { main: '#f9fafb', hit: '#ffffff', ring: 'rgba(249,250,251,.45)' },
    alert: { main: '#ff6b00', hit: '#ffffff', ring: 'rgba(255,107,0,.55)' }
  };
  var LIGHT = {
    hud:   { main: '#0b7a4c', hit: '#151517', ring: 'rgba(11,122,76,.45)' },
    hit:   { main: '#151517', hit: '#151517', ring: 'rgba(21,21,23,.35)' },
    alert: { main: '#c24a00', hit: '#151517', ring: 'rgba(194,74,0,.45)' }
  };

  var STYLE_ID = 'acn-click-fx-style';
  var THROTTLE = 80;      // 与基线点击音效一致，避免 label→input / 连点叠加
  var MAX_LIVE = 6;       // 同屏最多实例，超出移除最旧
  var DURATION = 560;     // 兜底清理时间（略长于最长动画）
  var INTERACTIVE = [
    'a[href]', 'button', '[role="button"]', '[tabindex]', '[onclick]',
    '.brand', '.enter-btn', '.retry-link'
  ].join(',');
  var SKIP = '[disabled],[aria-disabled="true"],.disabled,.is-disabled,' +
             '.enter-btn.is-offline,input,textarea';

  var cfg = {
    theme: 'hud',
    enabled: true,
    interactiveOnly: false,   // 默认全屏任意位置都出反馈
    scale: 1
  };
  try { if (localStorage.getItem('acn_clickfx') === 'off') cfg.enabled = false; } catch (e) {}
  try {
    var t = localStorage.getItem('acn_clickfx_theme');
    if (t && THEMES[t]) cfg.theme = t;
  } catch (e) {}

  var live = [];
  var last = 0;

  var CSS = [
    '.acn-cfx{position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;',
    'z-index:200000;--m:#0ff796;--h:#fff;--r:rgba(15,247,150,.55)}',
    '.acn-cfx i{position:absolute;display:block;left:0;top:0;box-sizing:border-box}',
    '.acn-cfx .hit{animation:acn-hit .24s cubic-bezier(.2,0,0,1) both}',
    '.acn-cfx .hit b{position:absolute;display:block;width:2.5px;height:11px;',
    'margin:-5.5px 0 0 -1.25px;background:var(--h)}',
    '.acn-cfx .hit b:nth-child(1){transform:translate(-11px,-11px) rotate(45deg)}',
    '.acn-cfx .hit b:nth-child(2){transform:translate(11px,-11px) rotate(-45deg)}',
    '.acn-cfx .hit b:nth-child(3){transform:translate(11px,11px) rotate(45deg)}',
    '.acn-cfx .hit b:nth-child(4){transform:translate(-11px,11px) rotate(-45deg)}',
    '.acn-cfx .br{animation:acn-br .34s cubic-bezier(.2,0,0,1) both}',
    '.acn-cfx .br b{position:absolute;width:9px;height:9px;border:1px solid var(--m)}',
    '.acn-cfx .br b:nth-child(1){left:-21px;top:-21px;border-right:0;border-bottom:0}',
    '.acn-cfx .br b:nth-child(2){left:12px;top:-21px;border-left:0;border-bottom:0}',
    '.acn-cfx .br b:nth-child(3){left:12px;top:12px;border-left:0;border-top:0}',
    '.acn-cfx .br b:nth-child(4){left:-21px;top:12px;border-right:0;border-top:0}',
    '.acn-cfx .ring{width:18px;height:18px;margin:-9px 0 0 -9px;',
    'border:1px solid var(--m);animation:acn-ring .44s cubic-bezier(.2,0,0,1) both}',
    '.acn-cfx .dot{width:4px;height:4px;margin:-2px 0 0 -2px;background:var(--h);',
    'animation:acn-dot .20s linear both}',
    '.acn-cfx .scan{width:46px;height:1px;margin:0 0 0 -23px;background:var(--m);',
    'animation:acn-scan .20s cubic-bezier(.2,0,0,1) both}',
    '@keyframes acn-hit{0%{opacity:0;transform:scale(1.35)}35%{opacity:1}',
    '100%{opacity:0;transform:scale(1)}}',
    '@keyframes acn-br{0%{opacity:0;transform:scale(1.55)}30%{opacity:1}',
    '100%{opacity:0;transform:scale(1)}}',
    '@keyframes acn-ring{0%{opacity:.8;transform:scale(.55)}',
    '100%{opacity:0;transform:scale(2.7)}}',
    '@keyframes acn-dot{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(0)}}',
    '@keyframes acn-scan{0%{opacity:.75;transform:translateY(-16px) scaleX(.2)',
    '}100%{opacity:0;transform:translateY(16px) scaleX(1)}}',
    '@media (prefers-reduced-motion: reduce){',
    '.acn-cfx .br,.acn-cfx .ring,.acn-cfx .scan{display:none}',
    '.acn-cfx .hit{animation:acn-hit-static .12s linear both}',
    '@keyframes acn-hit-static{0%,99%{opacity:1}100%{opacity:0}}}'
  ].join('');

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.appendChild(document.createTextNode(CSS));
    (document.head || document.documentElement).appendChild(s);
  }

  function palette() {
    var set = document.documentElement &&
      document.documentElement.getAttribute('data-theme') === 'light' ? LIGHT : THEMES;
    return set[cfg.theme] || THEMES.hud;
  }

  function hit(node) {
    if (!node || !node.closest) return false;
    if (!cfg.interactiveOnly) return true;
    var el = node.closest(INTERACTIVE);
    if (!el) return false;
    if (el.matches && el.matches(SKIP)) return false;
    return true;
  }

  function spawn(x, y) {
    var now = Date.now();
    if (now - last < THROTTLE) return;
    last = now;
    while (live.length >= MAX_LIVE) {
      var old = live.shift();
      if (old && old.parentNode) old.parentNode.removeChild(old);
    }

    var p = palette();
    var el = document.createElement('div');
    el.className = 'acn-cfx';
    el.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + cfg.scale + ')';
    el.style.setProperty('--m', p.main);
    el.style.setProperty('--h', p.hit);
    el.style.setProperty('--r', p.ring);
    el.innerHTML =
      '<i class="ring"></i><i class="br"><b></b><b></b><b></b><b></b></i>' +
      '<i class="hit"><b></b><b></b><b></b><b></b></i>' +
      '<i class="scan"></i><i class="dot"></i>';
    (document.body || document.documentElement).appendChild(el);
    live.push(el);
    setTimeout(function () {
      var i = live.indexOf(el);
      if (i >= 0) live.splice(i, 1);
      if (el.parentNode) el.parentNode.removeChild(el);
    }, DURATION);
  }

  injectStyle();

  document.addEventListener('click', function (e) {
    if (!cfg.enabled) return;
    if (!hit(e.target)) return;
    spawn(e.clientX, e.clientY);
  }, true);

  document.addEventListener('keydown', function (e) {
    if (!cfg.enabled || e.repeat) return;
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    var el = document.activeElement;
    if (!hit(el) || !el.getBoundingClientRect) return;
    var r = el.getBoundingClientRect();
    spawn(r.left + r.width / 2, r.top + r.height / 2);
  }, true);

  window.setClickFxEnabled = function (v) { cfg.enabled = !!v; };
  window.isClickFxEnabled = function () { return cfg.enabled; };
  window.setClickFxTheme = function (name) {
    if (THEMES[name]) { cfg.theme = name; try { localStorage.setItem('acn_clickfx_theme', name); } catch (e) {} }
  };
  window.setClickFxScope = function (interactiveOnly) { cfg.interactiveOnly = !!interactiveOnly; };
  window.setClickFxScale = function (s) { cfg.scale = Math.max(.6, Math.min(1.6, Number(s) || 1)); };
  window.clickFxDemo = function (x, y) { spawn(x, y); };
})();
