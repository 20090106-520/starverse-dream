/* =============================================================================
   STARVERSE DREAM · 星域梦境
   ui-extras.js — 参考融合扩展层（零依赖 · 全部节点由本文件创建）
   -----------------------------------------------------------------------------
   参考来源与对应手法：
     · namethatui.com          Progress Ring（阅读进度环）
                              Command Palette（⌘K / Ctrl+K 命令面板）
                              Bento Grid（终章「星域档案」章节索引）
     · canvasui.dev            Decrypt Reveal（章节标题解密，见 js/main.js）
                              Particle Reveal（光标揭示，见 js/particles.js）
     · styles.refero.design    设计令牌 / DESIGN.md 的组织方式（见 DESIGN.md）
     · beautiful-ui            稀疏导航、状态覆盖、降级与「减少动态效果」回退
   原则：不引入任何外部依赖；新交互全部键盘可达；系统开启「减少动态效果」时退化为静态。
   ============================================================================= */
(function () {
  'use strict';

  var S = window.Starverse || {};
  var audio = S.audio || null;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reduceMotion = function () { return !!(motionQuery && motionQuery.matches); };
  var smoothScroll = function (el) {
    if (!el) return;
    el.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
  };
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /* ---------------------------------------------------------------------------
     0. 轻提示：复用主脚本已有的 toast 容器（没有就静默降级）
     ------------------------------------------------------------------------ */
  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('is-on'); }, 2600);
  }

  /* ---------------------------------------------------------------------------
     1. 场景索引：章节名与标题都取自页面真实 DOM，不硬编码文案
     ------------------------------------------------------------------------ */
  var SCENES = $$('.scene').map(function (el) {
    var h = el.querySelector('.hero-title, .scene-title, .end-title');
    var label = el.id === 'intro' ? '序章'
      : el.id === 'ending' ? '终章'
        : (/^ch\d+$/.test(el.id) ? '第' + el.id.slice(2) + '章' : el.id);
    return { el: el, label: label, title: h && h.textContent.trim() ? h.textContent.trim() : el.id };
  });
  if (!SCENES.length) return;

  /* ---------------------------------------------------------------------------
     2. 动作：声音开关 / 复制宇宙编号
     ------------------------------------------------------------------------ */
  function toggleAudio() {
    if (!audio || typeof audio.toggle !== 'function') { toast('星域之声暂不可用'); return; }
    var on = audio.toggle();
    var btn = $('#audioBtn');
    if (btn) {
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.setAttribute('aria-label', on ? '关闭星域之声' : '开启星域之声');
    }
    toast(on ? '星域之声已开启 · 戴上耳机更好听' : '星域之声已安静下来');
  }

  function copyId() {
    var node = $('#cosmicId') || $('#footId');
    var text = node ? node.textContent.trim() : '';
    var m = text.match(/#\s*([^\s#]+)/);
    var id = m ? '#' + m[1] : '';
    if (!id) { toast('宇宙编号还在计算中，稍等一下'); return; }
    var done = function () { toast('宇宙编号 ' + id + ' 已复制'); };
    var fail = function () { toast('复制失败，编号是 ' + id); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(id).then(done, fail);
    } else {
      try {
        var ta = document.createElement('textarea');
        ta.value = id;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        done();
      } catch (err) { fail(); }
    }
  }

  function replay() {
    var btn = $('#replayBtn');
    if (btn) { btn.click(); return; }
    var last = SCENES[SCENES.length - 1].el;
    var first = SCENES[0].el;
    if (last.getBoundingClientRect().top < window.innerHeight && first.getBoundingClientRect().top < 0) {
      window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
    } else {
      smoothScroll(first);
    }
  }

  /* ---------------------------------------------------------------------------
     3. 命令面板（Command Palette）：⌘K / Ctrl+K
     ------------------------------------------------------------------------ */
  var panel = document.createElement('div');
  panel.className = 'cmdk';
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML =
    '<div class="cmdk__backdrop" data-close></div>' +
    '<div class="cmdk__panel" role="dialog" aria-modal="true" aria-label="命令面板">' +
      '<div class="cmdk__field">' +
        '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">' +
          '<circle cx="11" cy="11" r="6.4"/><path d="m16.1 16.1 4.2 4.2"/></svg>' +
        '<input class="cmdk__input" id="cmdkInput" type="text" role="combobox" aria-expanded="true" ' +
          'aria-controls="cmdkList" aria-autocomplete="list" autocomplete="off" spellcheck="false" ' +
          'placeholder="搜索章节或动作…" aria-label="搜索命令">' +
        '<kbd class="cmdk__kbd">ESC</kbd>' +
      '</div>' +
      '<ul class="cmdk__list" id="cmdkList" role="listbox" aria-label="命令列表"></ul>' +
      '<div class="cmdk__foot">' +
        '<span><kbd>↑</kbd><kbd>↓</kbd>移动</span>' +
        '<span><kbd>Enter</kbd>执行</span>' +
        '<span class="cmdk__count" aria-live="polite"></span>' +
      '</div>' +
    '</div>';
  document.body.appendChild(panel);

  var listEl = panel.querySelector('#cmdkList');
  var inputEl = panel.querySelector('#cmdkInput');
  var countEl = panel.querySelector('.cmdk__count');

  function buildCommands() {
    var cmds = SCENES.map(function (s) {
      return {
        group: '章节',
        label: s.label + ' · ' + s.title,
        keywords: s.label + ' 章节 跳转 前往 ' + s.title,
        run: function () { smoothScroll(s.el); }
      };
    });
    cmds.push({
      group: '声音',
      label: (audio && audio.enabled ? '关闭星域之声' : '开启星域之声'),
      keywords: '声音 音频 音乐 环境音 静音 mute',
      run: toggleAudio
    });
    cmds.push({ group: '工具', label: '复制我的宇宙编号', keywords: '复制 编号 id 分享 share', run: copyId });
    cmds.push({ group: '工具', label: '再绽放一次（回到序章重播）', keywords: '重播 重来 replay 重新开始 回到开头', run: replay });
    return cmds;
  }

  var items = [];
  var filtered = [];
  var active = 0;

  function render(q) {
    var key = (q || '').trim().toLowerCase();
    filtered = items.filter(function (c) {
      if (!key) return true;
      var hay = (c.label + ' ' + c.group + ' ' + (c.keywords || '')).toLowerCase();
      return hay.indexOf(key) >= 0;
    });
    active = 0;
    if (!filtered.length) {
      listEl.innerHTML = '<li class="cmdk__item is-empty" role="option" aria-disabled="true" aria-selected="false">' +
        '没有匹配的命令<span class="cmdk__item-group">试试「章节」「声音」</span></li>';
      countEl.textContent = '0 项';
      return;
    }
    listEl.innerHTML = filtered.map(function (c, i) {
      return '<li class="cmdk__item' + (i === 0 ? ' is-active' : '') + '" role="option" aria-selected="' + (i === 0) + '" data-i="' + i + '">' +
        '<span class="cmdk__item-label">' + esc(c.label) + '</span>' +
        '<span class="cmdk__item-group">' + esc(c.group) + '</span></li>';
    }).join('');
    countEl.textContent = filtered.length + ' 项';
  }

  function setActive(i) {
    if (!filtered.length) return;
    active = (i + filtered.length) % filtered.length;
    $$('.cmdk__item', listEl).forEach(function (el) {
      var on = Number(el.dataset.i) === active;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    });
  }

  function runActive() {
    var c = filtered[active];
    if (!c) return;
    closePanel();
    /* 先关闭面板，再执行动作，焦点与滚动都更自然 */
    setTimeout(function () { c.run(); }, reduceMotion() ? 0 : 60);
  }

  var lastFocus = null;
  function openPanel() {
    items = buildCommands();
    inputEl.value = '';
    render('');
    lastFocus = document.activeElement;
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('is-cmdk');
    inputEl.focus();
  }
  function closePanel() {
    if (!panel.classList.contains('is-open')) return;
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('is-cmdk');
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus();
    lastFocus = null;
  }

  inputEl.addEventListener('input', function () { render(inputEl.value); });
  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); runActive(); }
    else if (e.key === 'Escape') { e.preventDefault(); closePanel(); }
    else if (e.key === 'Tab') { e.preventDefault(); }
  });
  listEl.addEventListener('click', function (e) {
    var li = e.target.closest ? e.target.closest('.cmdk__item') : null;
    if (!li || li.classList.contains('is-empty')) return;
    active = Number(li.dataset.i) || 0;
    runActive();
  });
  listEl.addEventListener('mousemove', function (e) {
    var li = e.target.closest ? e.target.closest('.cmdk__item') : null;
    if (li && !li.classList.contains('is-empty')) setActive(Number(li.dataset.i) || 0);
  });
  panel.addEventListener('click', function (e) { if (e.target.hasAttribute('data-close')) closePanel(); });

  window.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase();
    var typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (panel.classList.contains('is-open')) closePanel(); else openPanel();
      return;
    }
    if (e.key === 'Escape' && panel.classList.contains('is-open')) { closePanel(); return; }
    if (!typing && e.key === '/') { e.preventDefault(); openPanel(); }
  });

  /* ---------------------------------------------------------------------------
     4. 右下角 HUD：命令入口 + 阅读进度环（Progress Ring）
     ------------------------------------------------------------------------ */
  var hud = document.createElement('div');
  hud.className = 'hud';

  var cmdBtn = document.createElement('button');
  cmdBtn.type = 'button';
  cmdBtn.className = 'hud__btn';
  cmdBtn.setAttribute('aria-label', '打开命令面板（快捷键 Ctrl 或 Command 加 K）');
  cmdBtn.innerHTML =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">' +
      '<circle cx="11" cy="11" r="6.4"/><path d="m16.1 16.1 4.2 4.2"/></svg>' +
    '<span class="hud__btn-label">⌘K</span>';
  cmdBtn.addEventListener('click', openPanel);

  var ringBtn = document.createElement('button');
  ringBtn.type = 'button';
  ringBtn.className = 'readring';
  ringBtn.innerHTML =
    '<svg viewBox="0 0 44 44" aria-hidden="true">' +
      '<circle class="readring__track" cx="22" cy="22" r="19"></circle>' +
      '<circle class="readring__bar" cx="22" cy="22" r="19"></circle>' +
    '</svg>' +
    '<span class="readring__pct" aria-hidden="true">0%</span>' +
    '<span class="readring__hint" aria-hidden="true">回到序章</span>';

  var ringBar = ringBtn.querySelector('.readring__bar');
  var ringPct = ringBtn.querySelector('.readring__pct');
  var CIRC = 2 * Math.PI * 19;
  ringBar.style.strokeDasharray = CIRC + ' ' + CIRC;
  ringBar.style.strokeDashoffset = CIRC;
  ringBtn.addEventListener('click', function () { smoothScroll(SCENES[0].el); });

  hud.appendChild(cmdBtn);
  hud.appendChild(ringBtn);
  document.body.appendChild(hud);

  /* 只在滚动期间运转，避免与粒子引擎抢帧 */
  var ringQueued = false;
  var lastPct = -1;
  function updateRing() {
    ringQueued = false;
    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    var p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    ringBar.style.strokeDashoffset = (CIRC * (1 - p)).toFixed(2);
    var pct = Math.round(p * 100);
    if (pct !== lastPct) {
      lastPct = pct;
      ringPct.textContent = pct + '%';
      ringBtn.setAttribute('aria-label', '阅读进度 ' + pct + '%，点击回到序章');
    }
  }
  function onScroll() {
    if (ringQueued) return;
    ringQueued = true;
    requestAnimationFrame(updateRing);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  updateRing();

  /* ---------------------------------------------------------------------------
     5. 终章「星域档案」：Bento 网格章节索引
     ------------------------------------------------------------------------ */
  function buildBento() {
    var ending = document.getElementById('ending');
    if (!ending) return;
    var wrap = document.createElement('section');
    wrap.className = 'bento';
    wrap.setAttribute('aria-label', '星域档案 · 章节索引');
    var title = document.createElement('h3');
    title.className = 'bento__title';
    title.textContent = '星域档案';
    wrap.prepend(title);
    SCENES.forEach(function (s, i) {
      var cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'bento__cell' + (i === 0 || i === SCENES.length - 1 ? ' bento__cell--wide' : '');
      cell.innerHTML =
        '<span class="bento__idx">' + esc(s.label) + '</span>' +
        '<span class="bento__title">' + esc(s.title) + '</span>' +
        '<span class="bento__meta">' + esc(i === 0 ? '开场 · 星尘收拢' : i === SCENES.length - 1 ? '尾声 · 再绽放一次' : '滚动叙事') + '</span>';
      cell.addEventListener('click', function () { smoothScroll(s.el); });
      wrap.appendChild(cell);
    });
    /* footer 可能嵌在终章的内层容器里，用它的父节点做插入点才安全 */
    var foot = ending.querySelector('.footer');
    if (foot && foot.parentNode) foot.parentNode.insertBefore(wrap, foot); else ending.appendChild(wrap);

    /* 文档高度变了 → 让主脚本重新测量章节位置与顶部进度条 */
    window.dispatchEvent(new Event('resize'));
  }
  buildBento();
})();
