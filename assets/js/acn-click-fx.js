/* ACN 战术点击反馈（Delta Force / 三角洲行动 命中标记）
 * 纯原生、无依赖、自注入样式；只在点击坐标处绘制，不改动任何页面元素与版式。
 *
 * 形态：一次点击 = 四条从四个角朝中心斜插的白色细线（\ / 上排，/ \ 下排），
 *       即游戏「命中反馈 / hitmarker」的 X 形四臂：内端几乎汇聚于中心、
 *       彼此不相连，外端伸向四角；动画再由四角向中心收拢。
 *       没有方框、四角括号、扫描线、中心点、粒子、发光、回弹。
 *
 * 依据：游戏内「命中反馈 / 击杀图标」为屏幕中央白色 X 形四段斜线，
 *       颜色可在 设置 → 音画设置 → 画面设置 → 命中特效 中自定义；官网军事科技 HUD
 *       采用荧光绿 #0ff796 / 警告橙 #ff6b00，强调减法设计与细线。
 *
 * 用法（页面底部加一行即可，导向站与主站通用）：
 *   <script src="assets/js/acn-click-fx.js"></script>
 *   <script src="js/acn-click-fx.js"></script>
 * 开关：localStorage acn_clickfx=off，或 window.setClickFxEnabled(false)
 * 颜色：window.setClickFxTheme('hit' 白 | 'hud' 绿 | 'alert' 橙)，默认白色
 */
(function () {
  'use strict';

  /* 默认 hit = 白色四段斜线；浅色主题自动换深色，保证在白底上可见 */
  var THEMES = {
    hud:   { x: '#0ff796' },
    hit:   { x: '#ffffff' },
    alert: { x: '#ff6b00' }
  };
  var LIGHT = {
    hud:   { x: '#0b7a4c' },
    hit:   { x: '#151517' },
    alert: { x: '#c24a00' }
  };

  var STYLE_ID = 'acn-click-fx-style';
  var THROTTLE = 80;      // 与点击音效一致，避免 label→input / 连点叠加
  var MAX_LIVE = 8;       // 同屏最多实例，超出移除最旧
  var DURATION = 380;     // 兜底清理时间（略长于动画）

  var cfg = {
    theme: 'hit',
    enabled: true,
    interactiveOnly: false,   // 全屏任意位置都出反馈
    scale: 1
  };
  try { if (localStorage.getItem('acn_clickfx') === 'off') cfg.enabled = false; } catch (e) {}
  try {
    var t = localStorage.getItem('acn_clickfx_theme');
    if (t && THEMES[t]) cfg.theme = t;
  } catch (e) {}

  var live = [];
  var last = 0;

  /* 四条线：上排 \ / ，下排 / \ ，内端朝中心，中间留空不闭合 */
  var CSS = [
    '.acn-cfx{position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;',
    'z-index:200000;--x:#fff}',
    '.acn-cfx .hit{position:absolute;left:0;top:0;display:block;',
    'animation:acn-hit .30s cubic-bezier(.2,0,0,1) both}',
    /* 四条细线各占一个角，沿对角线朝中心斜插，内端几乎汇聚、彼此不连 */
    '.acn-cfx .hit b{position:absolute;display:block;left:0;top:0;',
    'width:2px;height:22px;margin:-11px 0 0 -1px;background:var(--x)}',
    /* 注意：CSS 竖线 rotate(45deg) 得到 / ，rotate(-45deg) 得到 \ ；
       左上与右下必须同为 \ ，右上与左下必须同为 / ，才会共线成 X */
    '.acn-cfx .hit b:nth-child(1){transform:translate(-9px,-9px) rotate(-45deg)}',
    '.acn-cfx .hit b:nth-child(2){transform:translate(9px,-9px) rotate(45deg)}',
    '.acn-cfx .hit b:nth-child(3){transform:translate(9px,9px) rotate(-45deg)}',
    '.acn-cfx .hit b:nth-child(4){transform:translate(-9px,9px) rotate(45deg)}',
    /* 由四角向中心收拢 → 短暂停留 → 熄灭，无回弹、无位移 */
    '@keyframes acn-hit{0%{opacity:0;transform:scale(1.65)}',
    '22%{opacity:1;transform:scale(1)}',
    '68%{opacity:1;transform:scale(.94)}',
    '100%{opacity:0;transform:scale(.86)}}',
    '@media (prefers-reduced-motion: reduce){',
    '.acn-cfx .hit{animation:acn-hit-static .18s linear both}',
    '@keyframes acn-hit-static{0%,99%{opacity:1;transform:scale(1)}100%{opacity:0}}}'
  ].join('');

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.appendChild(document.createTextNode(CSS));
    (document.head || document.documentElement).appendChild(s);
  }

  function color() {
    var set = document.documentElement &&
      document.documentElement.getAttribute('data-theme') === 'light' ? LIGHT : THEMES;
    return (set[cfg.theme] || THEMES.hit).x;
  }

  function spawn(x, y) {
    var now = Date.now();
    if (now - last < THROTTLE) return;
    last = now;
    while (live.length >= MAX_LIVE) {
      var old = live.shift();
      if (old && old.parentNode) old.parentNode.removeChild(old);
    }

    var el = document.createElement('div');
    el.className = 'acn-cfx';
    el.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + cfg.scale + ')';
    el.style.setProperty('--x', color());
    el.innerHTML = '<i class="hit"><b></b><b></b><b></b><b></b></i>';
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
    spawn(e.clientX, e.clientY);
  }, true);

  /* 键盘 Enter / Space 在元素中心给出同样反馈 */
  document.addEventListener('keydown', function (e) {
    if (!cfg.enabled || e.repeat) return;
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    var el = document.activeElement;
    if (!el || !el.getBoundingClientRect) return;
    var r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;
    spawn(r.left + r.width / 2, r.top + r.height / 2);
  }, true);

  window.setClickFxEnabled = function (v) { cfg.enabled = !!v; };
  window.isClickFxEnabled = function () { return cfg.enabled; };
  window.setClickFxTheme = function (name) {
    if (THEMES[name]) { cfg.theme = name; try { localStorage.setItem('acn_clickfx_theme', name); } catch (e) {} }
  };
  /* 兼容旧试验台：范围/尺寸 API 保留，范围恒为全屏 */
  window.setClickFxScope = function () { cfg.interactiveOnly = false; };
  window.setClickFxScale = function (s) { cfg.scale = Math.max(.6, Math.min(1.6, Number(s) || 1)); };
  window.clickFxDemo = function (x, y) { spawn(x, y); };
})();
