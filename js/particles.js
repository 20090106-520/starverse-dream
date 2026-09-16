/* =============================================================================
   STARVERSE DREAM · 星域梦境
   particles.js — 手写 Canvas 2D 粒子引擎
   -----------------------------------------------------------------------------
   能力：
     · 自由漂移（流场驱动，越界环绕）
     · 形态聚合：星系漩涡 / 坍缩成星 / 行星轨道 / 星座连线 / 双星相会 / 人像剪影
     · 鼠标涡旋引力、点击星爆、涟漪、流星、烟花
     · 主题色插值、自适应粒子数量、帧率自适应降级
   对外接口：window.Starverse.engine / Starverse.mulberry32
   ============================================================================= */
(function (global) {
  'use strict';

  /* ---------------------------------------------------------------------------
     基础数学工具
     ------------------------------------------------------------------------ */
  const TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  /** 帧率无关的阻尼：k 为「每帧保留系数」 */
  const damp = (v, k, dt) => v * Math.pow(k, dt);

  /** 可复现伪随机（mulberry32）—— 用于生成用户专属宇宙常量 */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------------------------------------------------------------------
     光晕精灵缓存
     粒子用预渲染的径向渐变贴图绘制，避免 shadowBlur（极慢）带来的开销。
     ------------------------------------------------------------------------ */
  const spriteCache = new Map();
  function glowSprite(r, g, b) {
    const key = r + '|' + g + '|' + b;
    let sp = spriteCache.get(key);
    if (sp) return sp;
    if (spriteCache.size > 72) spriteCache.clear(); // 主题切换时自然回收
    const S = 32;                                   // 32px 足够：粒子最大也只画到 ~20px
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const x = c.getContext('2d');
    const grad = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0.00, `rgba(${r},${g},${b},1)`);
    grad.addColorStop(0.16, `rgba(${r},${g},${b},0.82)`);
    grad.addColorStop(0.42, `rgba(${r},${g},${b},0.20)`);
    grad.addColorStop(1.00, `rgba(${r},${g},${b},0)`);
    x.fillStyle = grad;
    x.fillRect(0, 0, S, S);
    spriteCache.set(key, c);
    return c;
  }

  /* ---------------------------------------------------------------------------
     形态生成器
     每个生成器返回 { points, lines?, anchors?, rings?, core? }
     point 结构：
       { x, y,                 // 极坐标时的圆心 / 直角坐标时的位置
         r, a, spin, sq,       // 极坐标参数（r > 0 时生效）
         breathe,              // 直角坐标时的呼吸振幅
         size }                // 视觉尺寸系数
     ------------------------------------------------------------------------ */
  const Shapes = {

    /** 自由漂移：无目标点，由流场与鼠标驱动 */
    drift() { return { points: null }; },

    /** 星系漩涡：三条旋臂，内圈转得快，整体略微倾斜 */
    galaxy(count, w, h) {
      const cx = w * 0.5, cy = h * 0.53;
      const R = Math.min(w, h) * 0.46;
      const arms = 3;
      const pts = [];
      for (let i = 0; i < count; i++) {
        const t = Math.pow(Math.random(), 0.52);        // 向中心聚集
        const r = 12 + t * R;
        const a = (i % arms) * (TAU / arms) + r * 0.0125 + rnd(-0.42, 0.42) * (1 - t * 0.42);
        pts.push({
          x: cx, y: cy, r, a,
          spin: 0.26 - t * 0.17,                        // 开普勒式：越外越慢
          sq: 0.6 + t * 0.22,                           // 稍作压缩 → 倾斜星盘
          size: lerp(1.7, 0.55, t) * rnd(0.75, 1.3)
        });
      }
      return { points: pts, core: { x: cx, y: cy, r: R * 0.1 } };
    },

    /** 坍缩成星：高斯球 + 高亮核心（第一章） */
    collapse(count, w, h) {
      const cx = w * 0.5, cy = h * 0.5;
      const R = Math.min(w, h) * 0.34;
      const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.9;
      const pts = [];
      for (let i = 0; i < count; i++) {
        const isCore = i % 7 === 0;
        const rr = isCore
          ? Math.abs(gauss()) * R * 0.12
          : Math.abs(gauss()) * R * (0.45 + Math.random() * 0.75);
        pts.push({
          x: cx, y: cy, r: rr,
          a: Math.random() * TAU,
          spin: (0.42 - rr / R * 0.3) * (isCore ? 1.9 : 0.8),
          sq: 1,
          size: isCore ? rnd(1.5, 2.8) : rnd(0.5, 1.5)
        });
      }
      return { points: pts, core: { x: cx, y: cy, r: R * 0.2 } };
    },

    /** 行星轨道：多层同心椭圆，相邻层反向旋转，附轨道参考线（第二章） */
    orbit(count, w, h) {
      const cx = w * 0.5, cy = h * 0.5;
      const R = Math.min(w, h) * 0.47;
      const rings = 6;
      const pts = [];
      const decoRings = [];
      for (let k = 0; k < rings; k++) {
        decoRings.push({ r: R * (0.22 + k * 0.14), sq: 0.34 });
      }
      for (let i = 0; i < count; i++) {
        const k = i % rings;
        const r = R * (0.22 + k * 0.14) * rnd(0.975, 1.025);
        const dir = k % 2 === 0 ? 1 : -1;
        pts.push({
          x: cx, y: cy, r,
          a: Math.random() * TAU,
          spin: dir * 0.62 / Math.pow(Math.max(r / R, 0.2), 1.25),
          sq: 0.34,
          size: rnd(0.7, 1.9)
        });
      }
      return { points: pts, rings: decoRings };
    },

    /** 星座连线：星辰节点 + 闭合的连接线（第三章） */
    constellation(count, w, h) {
      const N = 9;
      const padX = w * 0.17, padY = h * 0.18;
      const nodes = [];
      for (let i = 0; i < N; i++) {
        nodes.push({ x: rnd(padX, w - padX), y: rnd(padY, h - padY) });
      }
      const lines = [];
      for (let i = 0; i < N - 1; i++) {
        lines.push({ x1: nodes[i].x, y1: nodes[i].y, x2: nodes[i + 1].x, y2: nodes[i + 1].y });
      }
      // 首尾相连，让星座成为一条不断裂的环
      lines.push({ x1: nodes[N - 1].x, y1: nodes[N - 1].y, x2: nodes[0].x, y2: nodes[0].y });

      const pts = [];
      for (let i = 0; i < count; i++) {
        if (i % 6 === 0) {
          // 节点星：更亮更大，带轻微呼吸
          const n = nodes[i % N];
          pts.push({ x: n.x, y: n.y, breathe: 3.5, size: rnd(1.8, 3) });
        } else {
          // 沿线分布的星尘
          const L = lines[i % lines.length];
          const t = Math.random();
          const dx = L.x2 - L.x1, dy = L.y2 - L.y1;
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len, ny = dx / len;
          const j = rnd(-1, 1) * 9 * (0.35 + Math.random());
          pts.push({
            x: lerp(L.x1, L.x2, t) + nx * j,
            y: lerp(L.y1, L.y2, t) + ny * j,
            breathe: 2.2,
            size: rnd(0.5, 1.4)
          });
        }
      }
      return {
        points: pts,
        lines,
        anchors: nodes.map(n => ({ x: n.x, y: n.y }))
      };
    },

    /** 双星相会：两团星光缓慢靠近、各自旋转（第四章） */
    converge(count, w, h) {
      const cx = w * 0.5, cy = h * 0.5;
      const R = Math.min(w, h) * 0.3;
      const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.95;
      const pts = [];
      for (let i = 0; i < count; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        pts.push({
          x: cx + R * 0.72 * side, y: cy,
          r: Math.abs(gauss()) * R * 0.46,
          a: Math.random() * TAU,
          spin: side * 0.5,
          sq: 0.86,
          size: rnd(0.6, 1.9)
        });
      }
      return { points: pts };
    },

    /** 人像剪影：在离屏画布上绘制半身像并像素采样（终章） */
    silhouette(count, w, h) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.floor(w));
      c.height = Math.max(1, Math.floor(h));
      const x = c.getContext('2d');
      x.fillStyle = '#fff';

      const s = Math.min(w, h) * 0.86;
      const cx = w * 0.5, cy = h * 0.575;

      // 头
      x.beginPath();
      x.ellipse(cx, cy - s * 0.155, s * 0.082, s * 0.104, 0, 0, TAU);
      x.fill();
      // 颈
      x.beginPath();
      x.moveTo(cx - s * 0.042, cy - s * 0.08);
      x.lineTo(cx + s * 0.042, cy - s * 0.08);
      x.lineTo(cx + s * 0.062, cy + s * 0.03);
      x.lineTo(cx - s * 0.062, cy + s * 0.03);
      x.closePath();
      x.fill();
      // 肩与胸
      x.beginPath();
      x.moveTo(cx - s * 0.05, cy + s * 0.022);
      x.bezierCurveTo(cx - s * 0.185, cy + s * 0.055, cx - s * 0.245, cy + s * 0.175, cx - s * 0.262, cy + s * 0.34);
      x.lineTo(cx + s * 0.262, cy + s * 0.34);
      x.bezierCurveTo(cx + s * 0.245, cy + s * 0.175, cx + s * 0.185, cy + s * 0.055, cx + s * 0.05, cy + s * 0.022);
      x.closePath();
      x.fill();

      // 像素采样：每隔 step 取一点，抖动采样点让轮廓更自然
      const step = Math.max(4, Math.round(Math.min(w, h) / 190));
      let data;
      try {
        data = x.getImageData(0, 0, c.width, c.height).data;
      } catch (err) {
        return { points: null }; // 极端情况下（画布被污染）退回自由漂移
      }
      const candidates = [];
      for (let py = 0; py < c.height; py += step) {
        for (let px = 0; px < c.width; px += step) {
          if (data[(py * c.width + px) * 4 + 3] > 128) {
            candidates.push({ x: px + rnd(-step / 2, step / 2), y: py + rnd(-step / 2, step / 2) });
          }
        }
      }
      // 洗牌
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = candidates[i]; candidates[i] = candidates[j]; candidates[j] = t;
      }

      const pts = [];
      const figureCount = Math.min(Math.floor(count * 0.86), candidates.length);
      for (let i = 0; i < count; i++) {
        if (i < figureCount) {
          const p = candidates[i];
          const edge = Math.random();
          pts.push({
            x: p.x, y: p.y,
            breathe: edge < 0.25 ? rnd(2, 5) : rnd(0.6, 2), // 边缘呼吸更明显
            size: edge < 0.12 ? rnd(1.3, 2.3) : rnd(0.45, 1.15),
            // 剪影略压暗一档：它是一道背影，文字要能站在它前面
            dim: edge < 0.12 ? 0.9 : 0.6
          });
        } else {
          // 剩余粒子作为环绕剪影的萤火
          const ang = Math.random() * TAU;
          const rad = Math.min(w, h) * rnd(0.36, 0.72);
          pts.push({
            x: cx + Math.cos(ang) * rad,
            y: cy + Math.sin(ang) * rad * 0.72,
            breathe: rnd(6, 18),
            size: rnd(0.4, 1.5),
            dim: 0.72
          });
        }
      }
      return { points: pts };
    }
  };

  /* ---------------------------------------------------------------------------
     引擎主体
     ------------------------------------------------------------------------ */
  const Engine = {
    canvas: null,
    ctx: null,
    w: 0, h: 0, dpr: 1,

    particles: [],
    bursts: [],
    ripples: [],
    shooting: [],
    wishes: [],

    shapeName: 'drift',
    deco: {},
    palette: [],

    pointer: { x: 0, y: 0, active: false },
    tilt: { x: 0, y: 0, tx: 0, ty: 0 },

    time: 0,
    last: 0,
    energy: 0,
    fireworkTimer: 0,
    shootingTimer: 600,

    onFirework: null,
    highlightWish: -1,

    /* ---------------- 初始化 ---------------- */
    init(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: true });
      this.tickBound = this.tick.bind(this);

      this.resize(true);
      global.addEventListener('resize', () => this.resize(false), { passive: true });
      document.addEventListener('visibilitychange', () => {
        // 切回前台时重置计时，避免 dt 爆炸
        this.last = performance.now();
      });

      this.last = performance.now();
      requestAnimationFrame(this.tickBound);
      return this;
    },

    /* ---------------- 尺寸 / 粒子数量自适应 ---------------- */
    resize(initial) {
      const w = Math.max(320, global.innerWidth);
      const h = Math.max(320, global.innerHeight);
      const isMobile = w < 760 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
      const reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const dpr = Math.min(global.devicePixelRatio || 1, isMobile ? 1.5 : 2);

      // 按视口面积推算粒子数：移动端更稀疏，桌面端给足密度
      let target = Math.round((w * h) / (isMobile ? 1700 : 680));
      target = clamp(target, isMobile ? 380 : 1200, isMobile ? 1300 : 3800);
      if (reduce) target = Math.round(target * 0.42);

      this.w = w; this.h = h; this.dpr = dpr;
      this.targetCount = target;
      this.minCount = Math.max(isMobile ? 260 : 700, Math.round(target * 0.42));
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      this.syncCount(target);
      if (!initial) this.setShape(this.shapeName, true);
    },

    /** 按目标数量增删粒子（保持已有粒子的运动状态，避免闪跳） */
    syncCount(n) {
      const P = this.particles;
      while (P.length < n) P.push(this.makeParticle());
      if (P.length > n) P.length = n;
    },

    makeParticle() {
      return {
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        vx: rnd(-0.3, 0.3),
        vy: rnd(-0.3, 0.3),
        size: rnd(0.5, 1.65),
        alpha: 1,
        tw: Math.random() * 12,          // 闪烁相位
        twSpeed: rnd(0.5, 1.9),
        ph: Math.random() * TAU,         // 噪声相位
        // 目标
        px: null, py: null,              // 极坐标圆心 / 直角坐标位置
        pr: null, pa: 0, spin: 0, sq: 1, // 极坐标参数（pr 非 null 且 > 0 时生效）
        tx0: 0, ty0: 0,                  // 直角坐标目标
        breathe: 0,
        dim: 1,                          // 透明度系数：让某些形态（如剪影）退到文字后面
        spring: rnd(0.018, 0.045),
        // 颜色（当前 / 目标由 palette 索引决定）
        cr: rnd(140, 200) | 0, cg: rnd(160, 220) | 0, cb: 255,
        ciTarget: 0
      };
    },

    /* ---------------- 形态切换 ---------------- */
    setShape(name, silent) {
      const fn = Shapes[name] ? name : 'drift';
      const res = Shapes[fn](this.particles.length, this.w, this.h);
      this.shapeName = fn;

      const pts = res.points;
      if (!pts) {
        // 自由漂移：清空目标，粒子依靠当前速度自然散开
        for (const p of this.particles) { p.px = null; p.pr = null; }
        this.deco = {};
        return;
      }

      // 目标点随机重排，避免空间相关性造成的规律感
      const order = pts.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = order[i]; order[i] = order[j]; order[j] = t;
      }

      const P = this.particles;
      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        const pt = pts[order[i % pts.length]];
        p.px = pt.x; p.py = pt.y;
        p.dim = pt.dim === undefined ? 1 : pt.dim;
        if (pt.r > 0) {
          p.pr = pt.r; p.pa = pt.a; p.spin = pt.spin; p.sq = pt.sq === undefined ? 1 : pt.sq;
          p.breathe = 0;
        } else {
          p.pr = null;
          p.tx0 = pt.x + rnd(-2.5, 2.5);
          p.ty0 = pt.y + rnd(-2.5, 2.5);
          p.sq = 1;
          p.breathe = pt.breathe || 0;
        }
        p.size = p.size + (pt.size - p.size) * 0.6;
        p.spring = rnd(0.018, 0.05);
      }

      this.deco = {
        lines: res.lines || null,
        anchors: res.anchors || null,
        rings: res.rings || null,
        core: res.core || null
      };
      if (!silent) { /* 形态切换的瞬间可以留白，这里不做额外特效 */ }
    },

    /* ---------------- 主题色 ---------------- */
    setTheme(palette) {
      if (!palette || !palette.length) return;
      this.palette = palette;
      // 按顺序分配目标色，保证各色均匀分布
      for (let i = 0; i < this.particles.length; i++) {
        this.particles[i].ciTarget = i % palette.length;
      }
    },

    /* ---------------- 交互 ---------------- */
    setPointer(x, y, active) {
      this.pointer.x = x; this.pointer.y = y;
      this.pointer.active = active !== false;
    },
    clearPointer() { this.pointer.active = false; },

    /** 视角倾斜（第二章：鼠标控制星域视角） */
    setTilt(nx, ny) {
      this.tilt.tx = nx; this.tilt.ty = ny;
    },

    /** 点击星爆 */
    burst(x, y, opt) {
      const o = opt || {};
      const count = o.count || 24;
      const speed = o.speed || 4;
      const pal = this.palette.length ? this.palette : [[255, 255, 255]];
      if (this.bursts.length > 760) this.bursts.splice(0, this.bursts.length - 760);
      for (let i = 0; i < count; i++) {
        const a = Math.random() * TAU;
        const v = speed * (0.25 + Math.pow(Math.random(), 0.6));
        const c = pal[(Math.random() * pal.length) | 0];
        this.bursts.push({
          x, y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          life: 1,
          decay: rnd(0.008, 0.022),
          size: rnd(0.7, 2.3),
          r: c[0], g: c[1], b: c[2]
        });
      }
    },

    /** 涟漪（扩散光环） */
    ripple(x, y) {
      this.ripples.push({ x, y, r: 6, max: rnd(120, 190), life: 1, c: this.palette[0] || [180, 200, 255] });
      if (this.ripples.length > 24) this.ripples.shift();
    },

    /** 全屏脉冲：从中心荡开一圈光 */
    pulse() {
      this.ripple(this.w / 2, this.h / 2);
      const pal = this.palette.length ? this.palette : [[255, 255, 255]];
      for (let i = 0; i < 90; i++) {
        const a = Math.random() * TAU, v = rnd(1.5, 7);
        const c = pal[(Math.random() * pal.length) | 0];
        this.bursts.push({
          x: this.w / 2, y: this.h / 2,
          vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          life: 1, decay: rnd(0.006, 0.016), size: rnd(0.6, 2.2),
          r: c[0], g: c[1], b: c[2]
        });
      }
    },

    /** 终章烟花强度（0 关闭，1 开启） */
    setEnergy(v) { this.energy = v > 0 ? 1 : 0; },

    /* ---------------- 星光寄语（本地存储的内容 → 真实的星） ---------------- */
    addWish(text, silent) {
      // 用文本哈希决定星的坐标：同一句话永远在同一片天空
      let h = 2166136261;
      for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      const r1 = ((h >>> 8) & 0xffff) / 0xffff;
      const r2 = ((h >>> 20) & 0xffff) / 0xffff;
      // 存归一化坐标，窗口尺寸变化后星仍在相对位置
      const nx = 0.1 + r1 * 0.8;
      const ny = 0.12 + r2 * 0.7;
      this.wishes.push({ nx, ny, text, phase: Math.random() * TAU });
      if (!silent) {
        this.burst(nx * this.w, ny * this.h, { count: 30, speed: 2.8 });
        this.ripple(nx * this.w, ny * this.h);
      }
    },

    clearWishes() { this.wishes.length = 0; this.highlightWish = -1; },

    /* ---------------- 主循环 ---------------- */
    tick(now) {
      const delta = Math.min(now - this.last, 64);
      this.last = now;
      const dt = clamp(delta / 16.667, 0.15, 2.4);
      this.time += delta * 0.001;

      this.update(dt, delta);
      this.draw();

      this.monitorFPS(delta);
      requestAnimationFrame(this.tickBound);
    },

    /* 帧率自适应：持续偏低就减粒子，长时间富余再逐步补回。
       削减时直接截断数组即可 —— 剩余粒子保留原有目标点，无需重算形态。 */
    fpsAcc: 0, fpsFrames: 0, slowStreak: 0, fastStreak: 0,
    monitorFPS(delta) {
      this.fpsAcc += delta; this.fpsFrames++;
      if (this.fpsFrames < 90) return;
      const avg = this.fpsAcc / this.fpsFrames;
      this.fpsAcc = 0; this.fpsFrames = 0;

      if (avg > 22) {                                    // 低于约 45fps
        this.fastStreak = 0;
        if (++this.slowStreak >= 2 && this.particles.length > this.minCount) {
          this.slowStreak = 0;
          this.particles.length = Math.max(this.minCount, Math.round(this.particles.length * 0.85));
        }
      } else if (avg < 12.5) {                           // 高于约 80fps，有余量就补回星尘
        this.slowStreak = 0;
        if (++this.fastStreak >= 3 && this.particles.length < this.targetCount) {
          this.fastStreak = 0;
          this.syncCount(Math.min(this.targetCount, Math.round(this.particles.length * 1.12)));
          this.setShape(this.shapeName, true);
        }
      } else {
        this.slowStreak = 0; this.fastStreak = 0;
      }
    },

    /* ---------------- 更新 ---------------- */
    update(dt, deltaMs) {
      const { pointer, tilt } = this;
      const t = this.time;

      // 视角倾斜平滑
      tilt.x += (tilt.tx - tilt.x) * 0.045 * dt;
      tilt.y += (tilt.ty - tilt.y) * 0.045 * dt;
      const rotA = tilt.x * 0.34;
      const useRot = Math.abs(rotA) > 0.002;
      const cosR = Math.cos(rotA), sinR = Math.sin(rotA);
      const ox = tilt.y * 26;
      const oy = tilt.y * 12;

      const P = this.particles;
      const pal = this.palette;
      const palLen = pal.length;
      const px = pointer.x, py = pointer.y, pActive = pointer.active;

      for (let i = 0; i < P.length; i++) {
        const p = P[i];

        /* --- 1. 求目标位置 --- */
        let tx = null, ty = null;
        if (p.pr !== null) {
          const a = p.pa + t * p.spin;
          tx = p.px + Math.cos(a) * p.pr;
          ty = p.py + Math.sin(a) * p.pr * p.sq;
        } else if (p.px !== null) {
          tx = p.tx0 + ox;
          ty = p.ty0 + oy;
          if (p.breathe) {
            tx += Math.cos(t * 0.8 + p.ph) * p.breathe;
            ty += Math.sin(t * 0.72 + p.ph) * p.breathe;
          }
        }

        /* --- 2. 运动 --- */
        if (tx !== null) {
          if (useRot) {
            // 围绕画面中心旋转 → 沉浸式视角倾斜
            const dx = tx - this.w * 0.5, dy = ty - this.h * 0.5;
            tx = this.w * 0.5 + dx * cosR - dy * sinR;
            ty = this.h * 0.5 + dx * sinR + dy * cosR;
          }
          p.vx += (tx - p.x) * p.spring * dt;
          p.vy += (ty - p.y) * p.spring * dt;
          p.vx = damp(p.vx, 0.9, dt);
          p.vy = damp(p.vy, 0.9, dt);
          // 一丝噪声，让聚合体保持"活着"的呼吸感
          p.vx += Math.sin((p.y + t * 60) * 0.011 + p.ph) * 0.02 * dt;
          p.vy += Math.cos((p.x - t * 52) * 0.011 + p.ph) * 0.02 * dt;
        } else {
          // 流场漂移：用两组正交的正弦场制造柔和的漩涡气流
          const fx = Math.sin(p.y * 0.0026 + t * 0.35) * Math.cos(p.x * 0.0019 - t * 0.22);
          const fy = Math.cos(p.x * 0.0024 - t * 0.29) * Math.sin(p.y * 0.0021 + t * 0.22);
          p.vx += fx * 0.032 * dt;
          p.vy += fy * 0.032 * dt;
          p.vx = damp(p.vx, 0.988, dt);
          p.vy = damp(p.vy, 0.988, dt);
        }

        // 鼠标涡旋：切向推 + 轻微向外排斥
        if (pActive) {
          const dx = p.x - px, dy = p.y - py;
          const d2 = dx * dx + dy * dy;
          const R = 190;
          if (d2 < R * R) {
            const d = Math.sqrt(d2) + 0.001;
            const f = 1 - d / R;
            const k = (p.px !== null ? 0.34 : 1) * f * f;
            p.vx += (-dy / d) * k * 0.6 * dt + (dx / d) * k * 0.2 * dt;
            p.vy += (dx / d) * k * 0.6 * dt + (dy / d) * k * 0.2 * dt;
          }
        }

        // 限速 + 位移
        const sp2 = p.vx * p.vx + p.vy * p.vy;
        if (sp2 > 40) { const s = 6.3 / Math.sqrt(sp2); p.vx *= s; p.vy *= s; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // 完全自由（没有任何目标）时才越界环绕，保持星场密度均匀
        if (p.px === null) {
          const m = 34;
          if (p.x < -m) p.x = this.w + m; else if (p.x > this.w + m) p.x = -m;
          if (p.y < -m) p.y = this.h + m; else if (p.y > this.h + m) p.y = -m;
        }

        /* --- 3. 闪烁与颜色插值 --- */
        p.tw += p.twSpeed * 0.02 * dt;
        const tw = 0.58 + 0.42 * Math.sin(p.tw);
        p.alpha = (p.px !== null ? tw : tw * 0.86) * p.dim;

        if (palLen) {
          const c = pal[p.ciTarget % palLen];
          p.cr += (c[0] - p.cr) * 0.05 * dt;
          p.cg += (c[1] - p.cg) * 0.05 * dt;
          p.cb += (c[2] - p.cb) * 0.05 * dt;
        }
      }

      /* --- 4. 星爆粒子 --- */
      for (let i = this.bursts.length - 1; i >= 0; i--) {
        const b = this.bursts[i];
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.vx = damp(b.vx, 0.955, dt);
        b.vy = damp(b.vy, 0.955, dt);
        b.life -= b.decay * dt;
        if (b.life <= 0) this.bursts.splice(i, 1);
      }

      /* --- 5. 涟漪 --- */
      for (let i = this.ripples.length - 1; i >= 0; i--) {
        const r = this.ripples[i];
        r.r += (r.max - r.r) * 0.045 * dt;
        r.life -= 0.012 * dt;
        if (r.life <= 0) this.ripples.splice(i, 1);
      }

      /* --- 6. 流星：随机出现 --- */
      this.shootingTimer -= deltaMs;
      if (this.shootingTimer <= 0) {
        this.spawnShooting();
        this.shootingTimer = rnd(2600, 7800);
      }
      for (let i = this.shooting.length - 1; i >= 0; i--) {
        const s = this.shooting[i];
        s.x += s.vx * dt; s.y += s.vy * dt;
        s.life -= 0.006 * dt;
        if (s.life <= 0 || s.x > this.w + 300 || s.y > this.h + 300) this.shooting.splice(i, 1);
      }

      /* --- 7. 终章烟花 --- */
      if (this.energy > 0) {
        this.fireworkTimer -= deltaMs;
        if (this.fireworkTimer <= 0) {
          this.fireworkTimer = rnd(560, 1250);
          const fx = this.w * rnd(0.14, 0.86);
          const fy = this.h * rnd(0.1, 0.55);
          this.burst(fx, fy, { count: 74, speed: rnd(5, 9.5) });
          this.ripple(fx, fy);
          if (typeof this.onFirework === 'function') this.onFirework();
        }
      }
    },

    spawnShooting() {
      const fromTop = Math.random() < 0.7;
      const speed = rnd(7, 14);
      const ang = fromTop ? rnd(0.28, 0.6) : rnd(0.15, 0.4);  // 与 x 轴夹角
      const x = fromTop ? rnd(-0.1, 0.8) * this.w : -160;
      const y = fromTop ? -60 : rnd(0.05, 0.4) * this.h;
      this.shooting.push({
        x, y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        len: rnd(120, 260),
        life: 1,
        w: rnd(0.9, 2.0)
      });
    },

    /* ---------------- 绘制 ---------------- */
    draw() {
      const ctx = this.ctx;
      const w = this.w, h = this.h;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';

      const deco = this.deco || {};

      /* 轨道参考线（第二章） */
      if (deco.rings && this.shapeName === 'orbit') {
        const pulse = 0.05 + 0.03 * Math.sin(this.time * 1.1);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(150, 240, 230, ' + (pulse + 0.05).toFixed(3) + ')';
        for (const r of deco.rings) {
          ctx.beginPath();
          ctx.ellipse(w * 0.5, h * 0.5, r.r, r.r * r.sq, 0, 0, TAU);
          ctx.stroke();
        }
      }

      /* 星座连线（第三章） */
      if (deco.lines) {
        const pulse = 0.12 + 0.1 * Math.sin(this.time * 0.9);
        ctx.lineWidth = 0.9;
        ctx.strokeStyle = 'rgba(160, 225, 255, ' + pulse.toFixed(3) + ')';
        ctx.beginPath();
        for (const L of deco.lines) {
          ctx.moveTo(L.x1, L.y1);
          ctx.lineTo(L.x2, L.y2);
        }
        ctx.stroke();

        if (deco.anchors) {
          for (const a of deco.anchors) {
            const s = 46 + Math.sin(this.time * 1.4 + a.x * 0.01) * 10;
            ctx.globalAlpha = 0.42;
            ctx.drawImage(glowSprite(170, 230, 255), a.x - s / 2, a.y - s / 2, s, s);
          }
        }
      }

      /* 粒子本体 */
      const P = this.particles;
      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        if (p.x < -40 || p.x > w + 40 || p.y < -40 || p.y > h + 40) continue;

        const cr = p.cr & ~7, cg = p.cg & ~7, cb = p.cb & ~7; // 量化 → 命中精灵缓存
        const sp = glowSprite(cr, cg, cb);
        const s = p.size * 9 * (0.86 + 0.34 * Math.sin(p.tw));

        // 高速粒子补一条拖尾，强化流动感（描边较贵，只给够快、够大的粒子加）
        const vx = p.vx, vy = p.vy;
        const speed = Math.sqrt(vx * vx + vy * vy);
        if (speed > 3.1 && p.size > 0.9) {
          ctx.globalAlpha = p.alpha * 0.24;
          ctx.strokeStyle = 'rgb(' + cr + ',' + cg + ',' + cb + ')';
          ctx.lineWidth = Math.max(0.6, p.size * 0.7);
          ctx.beginPath();
          ctx.moveTo(p.x - vx * 2.1, p.y - vy * 2.1);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }

        ctx.globalAlpha = p.alpha;
        ctx.drawImage(sp, p.x - s / 2, p.y - s / 2, s, s);
      }

      /* 核心光团（坍缩 / 星系中心） */
      if (deco.core) {
        const pulse = 1 + Math.sin(this.time * 1.7) * 0.08;
        const R = deco.core.r * pulse * 2.4;
        const g = ctx.createRadialGradient(deco.core.x, deco.core.y, 0, deco.core.x, deco.core.y, R);
        g.addColorStop(0, 'rgba(255,255,255,0.5)');
        g.addColorStop(0.22, 'rgba(255,238,205,0.2)');
        g.addColorStop(1, 'rgba(255,190,110,0)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(deco.core.x, deco.core.y, R, 0, TAU);
        ctx.fill();
      }

      /* 星光寄语 */
      if (this.wishes.length) {
        ctx.font = '12px "Microsoft YaHei UI","PingFang SC",sans-serif';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < this.wishes.length; i++) {
          const ws = this.wishes[i];
          const wx = ws.nx * w, wy = ws.ny * h;
          const hl = i === this.highlightWish;
          const pulse = 1 + Math.sin(this.time * 2.2 + ws.phase) * (hl ? 0.28 : 0.14);
          const s = (hl ? 74 : 44) * pulse;
          const pal = this.palette.length ? this.palette[i % this.palette.length] : [255, 255, 255];
          ctx.globalAlpha = hl ? 0.95 : 0.7;
          ctx.drawImage(glowSprite(pal[0] & ~7, pal[1] & ~7, pal[2] & ~7), wx - s / 2, wy - s / 2, s, s);
          ctx.globalAlpha = hl ? 0.85 : 0.34;
          ctx.fillStyle = '#dceaff';
          ctx.fillText(ws.text.length > 18 ? ws.text.slice(0, 18) + '…' : ws.text, wx + 14, wy + 1);
        }
      }

      /* 涟漪 */
      for (const r of this.ripples) {
        ctx.globalAlpha = clamp(r.life, 0, 1) * 0.34;
        ctx.strokeStyle = 'rgb(' + (r.c[0] | 0) + ',' + (r.c[1] | 0) + ',' + (r.c[2] | 0) + ')';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r, 0, TAU);
        ctx.stroke();
      }

      /* 星爆粒子 */
      for (const b of this.bursts) {
        const s = b.size * 10 * (0.5 + b.life * 0.9);
        ctx.globalAlpha = clamp(b.life, 0, 1);
        ctx.drawImage(glowSprite(b.r & ~7, b.g & ~7, b.b & ~7), b.x - s / 2, b.y - s / 2, s, s);
      }

      /* 流星 */
      for (const s of this.shooting) {
        const nx = s.vx / Math.hypot(s.vx, s.vy);
        const ny = s.vy / Math.hypot(s.vx, s.vy);
        const tx = s.x - nx * s.len, ty = s.y - ny * s.len;
        const g = ctx.createLinearGradient(s.x, s.y, tx, ty);
        const a = clamp(s.life, 0, 1);
        g.addColorStop(0, 'rgba(255,255,255,' + (0.85 * a).toFixed(3) + ')');
        g.addColorStop(0.28, 'rgba(180,220,255,' + (0.32 * a).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(140,180,255,0)');
        ctx.globalAlpha = 1;
        ctx.strokeStyle = g;
        ctx.lineWidth = s.w;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        // 头部亮点
        ctx.globalAlpha = a;
        ctx.drawImage(glowSprite(255, 255, 255), s.x - 12, s.y - 12, 24, 24);
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  };

  /* ---------------------------------------------------------------------------
     对外暴露
     ------------------------------------------------------------------------ */
  global.Starverse = global.Starverse || {};
  global.Starverse.engine = Engine;
  global.Starverse.mulberry32 = mulberry32;
  global.Starverse.Shapes = Shapes;

})(window);
