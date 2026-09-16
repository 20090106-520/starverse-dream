/* =============================================================================
   STARVERSE DREAM · 星域梦境
   main.js — 叙事编排与交互控制
   -----------------------------------------------------------------------------
   职责：
     · 把 HTML 里的 .scene 章节读成一份导演脚本（主题 / 形态 / 强调色）
     · 滚动进度、章节识别、氛围光交叉淡入淡出、视差
     · 逐字拆散标题动画、打字机文案、数字滚动
     · 星光寄语（localStorage）、宇宙常量计算（可复现随机）
     · 鼠标光晕 / 点击星爆 / 键盘导航 / 音频开关
   ============================================================================= */
(function () {
  'use strict';

  const S = window.Starverse;

  /* 兜底：particles.js / audio.js 任一加载失败时，绝不把访问者留在黑屏里。
     此时只把开场遮罩撤掉，让 CSS 的静态兜底规则接管正文。 */
  if (!S || !S.engine || !S.audio) {
    const v = document.getElementById('veil');
    if (v) v.classList.add('is-out');
    return;
  }

  const engine = S.engine;
  const audio = S.audio;

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* 「减少动态效果」跟随系统设置实时变化，而不是页面加载时读一次就定死 */
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduceMotion = motionQuery.matches;
  if (motionQuery.addEventListener) {
    motionQuery.addEventListener('change', (e) => { reduceMotion = e.matches; });
  }

  /* ===========================================================================
     1. 章节主题调色板（粒子用色，会随章节平滑插值）
     ========================================================================= */
  const PALETTES = {
    deepspace: [[168, 196, 255], [206, 170, 255], [255, 226, 186], [122, 224, 255]],
    nebula:    [[255, 152, 96],  [255, 96, 164],  [196, 124, 255], [255, 222, 168]],
    aurora:    [[124, 255, 214], [112, 198, 255], [186, 152, 255], [226, 255, 196]],
    ocean:     [[104, 226, 246], [86, 168, 255],  [168, 238, 255], [216, 252, 255]],
    neon:      [[255, 92, 192],  [92, 236, 255],  [255, 206, 112], [198, 158, 255]],
    firefly:   [[255, 212, 132], [255, 152, 198], [150, 255, 204], [255, 255, 222]]
  };

  /* ===========================================================================
     2. 读取章节脚本
     ========================================================================= */
  const scenes = $$('.scene').map((el) => ({
    el,
    id: el.id,
    label: el.dataset.label || el.id,
    theme: el.dataset.theme || 'deepspace',
    shape: el.dataset.shape || 'drift',
    accent: el.dataset.accent || '#8b7bff',
    aura: $('.aura', el),
    inner: $('.scene__inner', el),
    top: 0,
    height: 1,
    auraOpacity: 0,
    auraTarget: 0,
    lastWritten: 0,        // 上一次真正写进 style 的不透明度（用于脏检查）
    lastOffset: 0          // 上一次真正写进 style 的视差偏移
  }));

  /* ===========================================================================
     3. 引擎启动
     ========================================================================= */
  engine.init($('#space'));
  engine.setShape('drift', true);                     // 先自由散开
  engine.setTheme(PALETTES.deepspace);

  // 主题色插值（页面加载后先亮起深空色）
  engine.setPointer(window.innerWidth / 2, window.innerHeight / 2, false);

  // 固定 UI 句柄：在主循环启动前先解析，不再依赖文件末尾的声明顺序
  const scrollHint = $('#scrollHint');
  const veil = $('#veil');

  // 触屏设备上没有"鼠标"：第二章的交互提示改写成指尖手势
  const isTouch = (window.matchMedia && window.matchMedia('(hover: none)').matches) ||
                  (navigator.maxTouchPoints || 0) > 0;
  if (isTouch) {
    const cardTitle = $('#ch2CardTitle');
    const hintText = $('#ch2HintText');
    if (cardTitle) cardTitle.textContent = '滑动你的指尖';
    if (hintText) hintText.textContent = '在屏幕上滑动，改变星域视角';
  }

  /* ===========================================================================
     4. 逐字拆散标题 / 打字机 / 数字滚动
     ========================================================================= */
  function splitChars(el) {
    if (el.dataset.split === 'done') return;
    const text = el.textContent;
    el.textContent = '';
    const frag = document.createDocumentFragment();
    Array.from(text).forEach((ch, i) => {
      const span = document.createElement('span');
      span.className = 'ch';
      span.style.setProperty('--i', i);
      if (ch === ' ') { span.innerHTML = '&nbsp;'; }
      else { span.textContent = ch; }
      frag.appendChild(span);
    });
    el.appendChild(frag);
    el.dataset.split = 'done';
    const d = parseFloat(el.dataset.delay || '0');
    el.style.setProperty('--d', Math.round(d * 1000) + 'ms');

    // 逐字动画结束后卸掉子元素的合成层，让父元素的背景渐变能重新裁剪到文字
    el.addEventListener('animationend', (e) => {
      const t = e.target;
      if (t && t.classList && t.classList.contains('ch')) t.classList.add('is-settled');
    });
  }

  /* 解密式揭示（借鉴 canvasui「Decrypt Reveal」/ namethatui「Text Scramble」）：
     标题进入视口时，先把每个字换成同字数的星域字形，再逐位落定成真字。
     只改文本节点，不新增 DOM，也不改变读屏软件读到的原文。 */
  const SCRAMBLE = '星梦域光尘夜航坠轨旋相遇概率奇迹·✦✧∘∞01';
  const scrambleChar = () => SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];

  function decryptChars(el) {
    if (el.dataset.decrypted === 'done') return;
    el.dataset.decrypted = 'done';
    const chars = $$('.ch', el);
    if (!chars.length) return;

    chars.forEach((span) => {
      if (span.dataset.ch === undefined) span.dataset.ch = span.textContent;
      const real = span.dataset.ch;
      if (!real || real === '\u00a0') return;
      span.textContent = scrambleChar();
      span.classList.add('is-scrambling');
    });

    const base = parseFloat(el.dataset.delay || '0') * 1000;
    const step = 46;
    chars.forEach((span, i) => {
      const real = span.dataset.ch;
      if (!real || real === '\u00a0') return;
      setTimeout(() => {
        span.textContent = scrambleChar();          // 落定前再抖一下，像信号锁定
        setTimeout(() => {
          span.textContent = real;
          span.classList.remove('is-scrambling');
        }, step * 0.5);
      }, base + i * step);
    });
  }

  function prepareType(el) {
    if (el.dataset.typeReady === 'done') return;
    el.dataset.text = el.dataset.text || el.textContent.trim();
    el.textContent = '';
    el.dataset.typeReady = 'done';
    const d = parseFloat(el.dataset.delay || '0');
    el.style.setProperty('--delay', Math.round(d * 1000) + 'ms');
    el.classList.add('reveal');
  }

  function typewrite(el) {
    if (el.dataset.typed === 'done') return;
    el.dataset.typed = 'done';
    const text = el.dataset.text || '';
    const delay = parseFloat(el.dataset.delay || '0') * 1000;

    const caret = document.createElement('span');
    caret.className = 'tw-caret';
    el.appendChild(caret);

    if (reduceMotion) {
      el.insertBefore(document.createTextNode(text), caret);
      caret.remove();
      return;
    }

    let i = 0;
    const speed = text.length > 46 ? 26 : 34;
    const step = () => {
      if (i >= text.length) { setTimeout(() => caret.remove(), 1400); return; }
      el.insertBefore(document.createTextNode(text[i]), caret);
      i++;
      // 标点处稍作停顿，读起来更有呼吸
      const ch = text[i - 1];
      const pause = (ch === '，' || ch === '、' || ch === '—') ? 220 : (ch === '。' || ch === '？' || ch === '！') ? 380 : 0;
      setTimeout(step, speed + pause);
    };
    setTimeout(step, delay);
  }

  function animateCount(el, to, dec, dur) {
    const start = performance.now();
    const d = dur || 1500;
    const tick = (now) => {
      const t = clamp((now - start) / d, 0, 1);
      const e = 1 - Math.pow(1 - t, 3);                 // ease-out cubic
      const v = to * e;
      el.textContent = dec > 0 ? v.toFixed(dec) : Math.round(v).toLocaleString('en-US');
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** 科学计数法（带上标字符） */
  const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻' };
  const sup = (n) => String(n).split('').map((c) => SUP[c] || c).join('');
  function sci(x, digits) {
    const d = digits === undefined ? 2 : digits;
    let e = Math.floor(Math.log10(x));
    let c = x / Math.pow(10, e);
    // 四舍五入可能把系数顶到 10.00（如 9.999 → "10.00"），此时应进位到下一档指数
    if (Number(c.toFixed(d)) >= Math.pow(10, d)) {
      e += 1;
      c = x / Math.pow(10, e);
    }
    return { c, e, coef: c.toFixed(d) };
  }

  /* ===========================================================================
     5. 入场：遮罩 + 揭示观察器
     ========================================================================= */
  $$('[data-split]').forEach(splitChars);
  $$('[data-type]').forEach(prepareType);

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      // 标题先解密再浮现；系统「减少动态效果」时直接显示真字
      if (!reduceMotion && el.hasAttribute('data-split')) decryptChars(el);
      el.classList.add('is-in');
      if (el.hasAttribute('data-type')) typewrite(el);
      if (el.dataset.count !== undefined && !el.dataset.counted) {
        el.dataset.counted = '1';
        animateCount(el, parseFloat(el.dataset.count), parseInt(el.dataset.dec || '0', 10), 1400);
      }
      revealObserver.unobserve(el);
    });
  }, { threshold: 0.18, rootMargin: '0px 0px -12% 0px' });

  function observeReveals(scope) {
    $$('.reveal, [data-split], [data-type], [data-count]', scope || document)
      .forEach((el) => revealObserver.observe(el));
  }

  /* ===========================================================================
     6. 顶部进度条 / 章节导航
     ========================================================================= */
  const progressBar = $('#progressBar');
  const dotsNav = $('#dots');
  scenes.forEach((sc, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dots__item';
    b.innerHTML = '<span class="dots__label"></span><span class="dots__dot"></span>';
    b.querySelector('.dots__label').textContent = sc.label;
    b.setAttribute('aria-label', '前往「' + sc.label + '」');
    b.addEventListener('click', () => sc.el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }));
    dotsNav.appendChild(b);
    sc.dot = b;
  });

  /* ===========================================================================
     7. 滚动主循环：主题过渡 / 氛围光 / 视差
     ========================================================================= */
  let activeIndex = -1;
  let introDone = false;          // 开场序列结束前，暂缓形态切换（先让星尘自由散开）
  let pendingShape = 'galaxy';

  /** 形态切换（开场序列会自动延后） */
  function applyShape(name) {
    if (!introDone) { pendingShape = name; return; }
    engine.setShape(name);
  }

  let docMax = 1;
  function measure() {
    const y = window.scrollY;
    scenes.forEach((sc) => {
      const r = sc.el.getBoundingClientRect();
      sc.top = r.top + y;
      sc.height = r.height;
    });
    docMax = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  }

  function setActive(i) {
    if (i === activeIndex) return;
    activeIndex = i;
    const sc = scenes[i];
    if (!sc) return;

    // 粒子换色 + 换形态
    engine.setTheme(PALETTES[sc.theme] || PALETTES.deepspace);
    applyShape(sc.shape);

    // 强调色写入 CSS 变量
    document.documentElement.style.setProperty('--accent', sc.accent);
    document.documentElement.style.setProperty('--accent-soft', hexToRgba(sc.accent, 0.32));

    // 导航高亮
    scenes.forEach((s, k) => s.dot.classList.toggle('is-active', k === i));

    // 章节专属演出
    if (sc.id === 'ch1') setTimeout(() => engine.pulse(), 260);
    if (sc.id === 'ending') {
      engine.setEnergy(1);
      setTimeout(() => engine.pulse(), 200);
      setTimeout(() => engine.pulse(), 900);
    } else {
      engine.setEnergy(0);
    }
    if (sc.id === 'ch4') setTimeout(() => buildCalc(), 120);
  }

  function hexToRgba(hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* 统一的 UI 循环：滚动进度、章节识别、氛围光淡入淡出、视差
     放在 rAF 里而不是 scroll 事件里，是因为氛围光的交叉过渡需要持续插值收敛 */
  let lastProgress = -1;
  let lastHintHidden = null;

  function uiFrame() {
    const y = window.scrollY;
    const vh = window.innerHeight;
    const center = y + vh * 0.5;

    /* 脏检查：写 style 会触发样式重算与合成，哪怕数值其实没变。
       只在真正变化时写，画面静止的那些帧几乎零成本。 */
    const p = clamp(y / docMax, 0, 1);
    if (Math.abs(p - lastProgress) > 0.0008) {
      lastProgress = p;
      progressBar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    }

    // 章节识别：最后一个「顶部已越过视口中线」的章节即为当前章节
    let idx = 0;
    for (let i = 0; i < scenes.length; i++) {
      if (center >= scenes[i].top) idx = i;
    }
    setActive(idx);

    // 氛围光交叉淡入淡出 + 场景视差
    for (const sc of scenes) {
      const scCenter = sc.top + sc.height * 0.5;
      const d = Math.abs(scCenter - center) / (vh * 0.95);
      sc.auraTarget = clamp(1 - d, 0, 1);

      if (sc.aura) {
        if (sc.auraTarget < 0.004 && sc.auraOpacity < 0.008) {
          // 彻底淡出：直接归零，不留一个几乎看不见却仍在合成的整屏图层
          if (sc.lastWritten !== 0) {
            sc.auraOpacity = 0;
            sc.lastWritten = 0;
            sc.aura.style.opacity = '0';
            sc.aura.classList.remove('is-live');
          }
        } else {
          sc.auraOpacity += (sc.auraTarget - sc.auraOpacity) * 0.07;
          if (Math.abs(sc.auraOpacity - sc.lastWritten) > 0.004) {
            sc.lastWritten = sc.auraOpacity;
            sc.aura.style.opacity = sc.auraOpacity.toFixed(3);
            // 只有"活着"的氛围光才提升为独立合成层
            sc.aura.classList.toggle('is-live', sc.auraOpacity > 0.006);
          }
        }
      }

      if (sc.inner) {
        const off = reduceMotion ? 0 : clamp((center - scCenter) * 0.055, -46, 46);
        if (Math.abs(off - sc.lastOffset) > 0.5) {
          sc.lastOffset = off;
          sc.inner.style.transform = 'translate3d(0,' + off.toFixed(1) + 'px,0)';
        }
      }
    }

    // 滚动提示：一旦开始滚动就淡出
    const hintHidden = y > 60;
    if (hintHidden !== lastHintHidden) {
      lastHintHidden = hintHidden;
      scrollHint.classList.toggle('is-hidden', hintHidden);
    }

    requestAnimationFrame(uiFrame);
  }

  /* ===========================================================================
     8. 鼠标：光晕跟随 / 粒子涡旋 / 视角倾斜
     ========================================================================= */
  const cursorGlow = $('#cursorGlow');
  let mx = window.innerWidth / 2, my = window.innerHeight / 2;

  function onPointerMove(e) {
    mx = e.clientX; my = e.clientY;
    document.body.classList.add('has-pointer');
    engine.setPointer(mx, my, true);

    cursorGlow.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0)';

    // 第二章：鼠标控制星域视角
    const nx = (mx / window.innerWidth - 0.5) * 2;
    const ny = (my / window.innerHeight - 0.5) * 2;
    if (scenes[activeIndex] && scenes[activeIndex].id === 'ch2') engine.setTilt(nx, ny);
    else if (engine.tilt.tx !== 0 || engine.tilt.ty !== 0) engine.setTilt(0, 0);
  }

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerleave', () => engine.clearPointer());
  document.addEventListener('mouseleave', () => engine.clearPointer());

  /* 点击：星爆 + 涟漪（输入控件与按钮上不触发） */
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('input, textarea, button, a')) return;
    engine.burst(e.clientX, e.clientY, { count: 26, speed: 4.4 });
    engine.ripple(e.clientX, e.clientY);
    if (audio.enabled && Math.random() < 0.34) audio.chime();
  });

  /* 键盘：方向键 / 空格 切换章节 */
  window.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
    const dir = (e.key === 'ArrowDown' || e.key === 'PageDown') ? 1
      : (e.key === 'ArrowUp' || e.key === 'PageUp') ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = clamp(activeIndex + dir, 0, scenes.length - 1);
    scenes[next].el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  });

  /* ===========================================================================
     9. 音频开关
     ========================================================================= */
  const audioBtn = $('#audioBtn');
  audioBtn.addEventListener('click', () => {
    const on = audio.toggle();
    audioBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    audioBtn.setAttribute('aria-label', on ? '关闭星域之声' : '开启星域之声');
    toast(on ? '星域之声已开启 · 戴上耳机更好听' : '星域之声已安静下来');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) audio.autoMute();
    else audio.autoResume();
  });

  // 烟花绽放时给一声钟响，让视听同步
  engine.onFirework = () => { if (audio.enabled) audio.chime(); };

  /* ===========================================================================
     10. 轻提示
     ========================================================================= */
  const toastEl = $('#toast');
  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 2600);
  }

  /* ===========================================================================
     11. 星光寄语（本地存储 → 星域里真实的星）
     ========================================================================= */
  const WISH_KEY = 'starverse.wishes.v1';
  const wishInput = $('#wishInput');
  const wishBtn = $('#wishBtn');
  const wishList = $('#wishList');
  const wishListWrap = $('#wishListWrap');
  const wishClear = $('#wishClear');

  function loadWishes() {
    try {
      const raw = localStorage.getItem(WISH_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter((t) => typeof t === 'string' && t.trim()).slice(-40) : [];
    } catch (err) { return []; }
  }
  function saveWishes(list) {
    try { localStorage.setItem(WISH_KEY, JSON.stringify(list.slice(-40))); } catch (err) { /* 隐私模式忽略 */ }
  }

  function renderWishes() {
    const list = loadWishes();
    wishList.innerHTML = '';
    wishListWrap.hidden = list.length === 0;
    list.forEach((text, i) => {
      const li = document.createElement('li');
      // 星语是真实按钮：Tab 能走到，回车／空格能点亮，不再只是"看着能点"的 li
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wish__item';
      btn.setAttribute('aria-label', '点亮这条星语：' + text);
      btn.innerHTML =
        '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">' +
        '<path d="M12 3.5 13.7 9.5 19.8 11.2 13.7 12.9 12 19 10.3 12.9 4.2 11.2 10.3 9.5Z"/></svg><span></span>';
      btn.querySelector('span').textContent = text;
      const markIt = () => { engine.highlightWish = i; };
      const unmarkIt = () => { engine.highlightWish = -1; };
      btn.addEventListener('mouseenter', markIt);
      btn.addEventListener('mouseleave', unmarkIt);
      btn.addEventListener('focus', markIt);
      btn.addEventListener('blur', unmarkIt);
      btn.addEventListener('click', () => {
        const ws = engine.wishes[i];
        if (ws) { engine.burst(ws.nx * engine.w, ws.ny * engine.h, { count: 24, speed: 3.4 }); }
      });
      li.appendChild(btn);
      wishList.appendChild(li);
    });
    // 让引擎里的星与列表一一对应
    engine.clearWishes();
    list.forEach((text) => engine.addWish(text, true));
    measure();                            // 列表高度变化会影响后续章节的位置
  }

  function submitWish() {
    const text = (wishInput.value || '').trim();
    if (!text) { toast('先写下一句话，星域在等'); wishInput.focus(); return; }
    const list = loadWishes();
    if (list.length >= 40) { toast('这片天空已经很满了，先熄灭几颗吧'); return; }
    list.push(text.slice(0, 40));
    saveWishes(list);
    wishInput.value = '';
    renderWishes();
    engine.pulse();
    // 让刚写下的那颗星在画面上"点亮"一次
    const ws = engine.wishes[engine.wishes.length - 1];
    if (ws) {
      engine.burst(ws.nx * engine.w, ws.ny * engine.h, { count: 36, speed: 3.6 });
      engine.ripple(ws.nx * engine.w, ws.ny * engine.h);
    }
    toast('它在星域里亮起来了');
    if (audio.enabled) audio.chime(880);
  }

  wishBtn.addEventListener('click', submitWish);
  wishInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitWish(); });
  /* 全部熄灭：星语是用户唯一的本地数据，清空后无法找回，
     所以做成两步确认——第一次只是"上膛"，按钮会自己改口 */
  let clearArmed = false;
  let clearTimer = null;
  wishClear.addEventListener('click', () => {
    if (!clearArmed) {
      clearArmed = true;
      wishClear.textContent = '确认全部熄灭？';
      toast('这些星语熄灭后找不回来，再点一次确认');
      clearTimer = setTimeout(() => {
        clearArmed = false;
        wishClear.textContent = '全部熄灭';
      }, 4000);
      return;
    }
    clearTimeout(clearTimer);
    clearArmed = false;
    wishClear.textContent = '全部熄灭';
    saveWishes([]);
    renderWishes();
    toast('星语已熄灭，但你说过的话会记得');
  });

  /* ===========================================================================
     12. 宇宙常量：可复现随机 + 概率计算
     ========================================================================= */
  const SEED_KEY = 'starverse.seed.v1';
  let seed = null;
  try { seed = localStorage.getItem(SEED_KEY); } catch (err) { seed = null; }
  if (!seed) {
    seed = String(Math.floor(Math.random() * 899999999) + 100000000);
    try { localStorage.setItem(SEED_KEY, seed); } catch (err) { /* 忽略 */ }
  }
  const rng = S.mulberry32(parseInt(seed, 10) || 20260916);

  const COSMIC_ID = '#' + String(seed).padStart(9, '0').replace(/(\d{3})(\d{3})(\d{3})/, '$1-$2-$3');
  const footYear = $('#footYear');
  if (footYear) footYear.textContent = new Date().getFullYear();

  const DIMS = [
    { k: '银河系恒星总数', v: 1.0e11 },
    { k: '同处一片时空的可能', v: (1.15 + rng() * 0.75) * 1e4 },
    { k: '恰好同时抬头仰望的角度', v: (2.7 + rng() * 1.9) * 1e3 },
    { k: '恰好没有错过的那几秒', v: (1.8 + rng() * 1.5) * 1e2 }
  ];
  const TOTAL = DIMS.reduce((acc, d) => acc * d.v, 1);
  const TOTAL_E = sci(TOTAL);
  const YEARS = TOTAL / 3.15576e7;                 // 每秒认识一个人 → 年
  const YEARS_E = sci(YEARS);

  let calcBuilt = false;
  function buildCalc() {
    const grid = $('#calcGrid');
    const probValue = $('#probValue');
    const probYears = $('#probYears');
    const cosmicId = $('#cosmicId');
    if (!grid || calcBuilt) return;
    calcBuilt = true;

    if (cosmicId) cosmicId.textContent = '宇宙编号 ' + COSMIC_ID;
    const footId = $('#footId');
    if (footId) footId.textContent = COSMIC_ID;

    // 四项因子
    DIMS.forEach((d) => {
      const s = sci(d.v);
      const cell = document.createElement('div');
      cell.className = 'calc__cell';
      cell.innerHTML = '<span class="calc__k"></span><span class="calc__v"></span>';
      cell.querySelector('.calc__k').textContent = d.k;
      cell.querySelector('.calc__v').innerHTML = s.coef + '×10<sup>' + sup(s.e) + '</sup>';
      grid.appendChild(cell);
    });

    // 连乘表达式（整行）
    const wide = document.createElement('div');
    wide.className = 'calc__cell calc__cell--wide';
    wide.innerHTML = '<span class="calc__k">四项相乘</span><span class="calc__v"></span>';
    wide.querySelector('.calc__v').innerHTML = DIMS
      .map((d) => { const s = sci(d.v); return s.coef + '×10<sup>' + sup(s.e) + '</sup>'; })
      .join(' <em style="opacity:.4;font-style:normal">×</em> ');
    grid.appendChild(wide);

    // 概率指数滚动动画
    const t0 = performance.now();
    const dur = 1700;
    const step = (now) => {
      const t = clamp((now - t0) / dur, 0, 1);
      const e = 1 - Math.pow(1 - t, 3);
      const coefNow = (TOTAL_E.c * e).toFixed(2);
      const expNow = Math.max(1, Math.round(TOTAL_E.e * e));
      probValue.innerHTML = coefNow + '×10<sup>' + sup(expNow) + '</sup>';
      const yExp = Math.max(1, Math.round(YEARS_E.e * e));
      probYears.innerHTML = (YEARS_E.c * e).toFixed(2) + '×10<sup>' + sup(yExp) + '</sup>';
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);

    toast('已为你生成专属宇宙常量 ' + COSMIC_ID);
  }

  /* ===========================================================================
     13. 终章：再绽放一次
     ========================================================================= */
  $('#replayBtn').addEventListener('click', () => {
    engine.pulse();
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        engine.burst(
          engine.w * (0.2 + Math.random() * 0.6),
          engine.h * (0.15 + Math.random() * 0.4),
          { count: 80, speed: 8 }
        );
        if (audio.enabled) audio.chime();
      }, i * 230);
    }
    toast('愿你的星，一直亮着');
  });

  /* ===========================================================================
     14. 尺寸变化
     ========================================================================= */
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(measure, 160);
  }, { passive: true });
  // 字体/布局稳定后再量一次，避免首帧高度偏差
  window.addEventListener('load', () => setTimeout(measure, 300));

  /* ===========================================================================
     15. 启动序列
     ========================================================================= */
  // 从本地存储恢复「星光寄语」，静默点亮（不重复放烟花的特效）
  renderWishes();

  measure();
  observeReveals(document);
  requestAnimationFrame(uiFrame);

  // 遮罩淡出 → 标题逐字浮现 → 星域收拢成星系
  const t1 = reduceMotion ? 0 : 520;
  const t2 = reduceMotion ? 0 : 900;
  const t3 = reduceMotion ? 0 : 1150;

  setTimeout(() => veil.classList.add('is-out'), t1);
  // 安全网：若后续任一步骤抛错导致遮罩没被正常撤下，3 秒后强制放行 —— 永不白屏
  setTimeout(() => veil.classList.add('is-out'), 3000);
  setTimeout(() => {
    const intro = $('#intro');
    $$('.reveal, [data-split]', intro).forEach((el) => {
      el.classList.add('is-in');
      if (el.hasAttribute('data-type')) typewrite(el);
    });
  }, t2);
  setTimeout(() => {
    introDone = true;
    engine.setShape(pendingShape || 'galaxy');   // ← 星尘在此刻收拢成星系
    pendingShape = null;
  }, t3);

  // 首屏的先知提示
  setTimeout(() => toast('点击任意位置，会有一颗星为你炸开'), reduceMotion ? 2400 : 6400);

})();
