/* =============================================================================
   STARVERSE DREAM · 星域梦境
   audio.js — Web Audio 实时合成环境音
   -----------------------------------------------------------------------------
   不使用任何音频文件，全部由振荡器 + 噪声 + 延迟网络实时生成：
     · 低频 drone：四个失谐振荡器经低通滤波，LFO 缓慢扫动 → 深邃的空间底噪
     · 风噪：白噪声 → 带通滤波，LFO 巡回频率 → 星域的气流声
     · 钟声：随机出现的五声音阶铃声，送入延迟网络 → 教堂式的回响
   浏览器策略：AudioContext 必须在用户手势后创建/恢复，因此首次点击才真正发声。
   ============================================================================= */
(function (global) {
  'use strict';

  const Audio = {
    ctx: null,
    master: null,
    space: null,          // 延迟网络（混响替代）
    enabled: false,
    ready: false,
    chimeTimer: null,
    targetVolume: 0.34,

    /** 创建音频图（只执行一次，需在用户手势中调用） */
    init() {
      if (this.ctx) return true;
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return false;

      const ctx = this.ctx = new AC();

      // 总线：所有声音都经过 master，便于整体淡入淡出
      const master = this.master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);

      this.buildDrone();
      this.buildSpace();
      this.buildWind();

      this.ready = true;
      return true;
    },

    /* 低频 drone */
    buildDrone() {
      const ctx = this.ctx;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      filter.Q.value = 0.8;

      const gain = ctx.createGain();
      gain.gain.value = 0.5;
      filter.connect(gain);
      gain.connect(this.master);

      // A1 泛音列：55 / 82.41 / 110 / 164.81 Hz —— 空五度的堆叠
      const freqs = [55, 82.41, 110, 164.81];
      freqs.forEach((f, i) => {
        const osc = ctx.createOscillator();
        osc.type = i % 2 === 0 ? 'triangle' : 'sine';
        osc.frequency.value = f * (1 + (i - 1.5) * 0.0018); // 轻微失谐 → 缓慢拍频
        const g = ctx.createGain();
        g.gain.value = 0.26 / (i * 0.7 + 1);
        osc.connect(g);
        g.connect(filter);
        osc.start();
      });

      // LFO 缓慢扫过滤波器截止频率，制造"呼吸"
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.042;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 240;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start();
    },

    /* 延迟网络：钟声的空间感来源 */
    buildSpace() {
      const ctx = this.ctx;
      const delay = ctx.createDelay(2.5);
      delay.delayTime.value = 0.44;

      const feedback = ctx.createGain();
      feedback.gain.value = 0.44;

      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 2600;

      const wet = ctx.createGain();
      wet.gain.value = 0.5;

      delay.connect(feedback);
      feedback.connect(tone);
      tone.connect(delay);
      delay.connect(wet);
      wet.connect(this.master);

      this.space = delay;
    },

    /* 风噪 */
    buildWind() {
      const ctx = this.ctx;
      const len = Math.floor(ctx.sampleRate * 4);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      // 棕噪声：比白噪声更"厚"，像远方的气流
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        d[i] = last * 3.2;
      }

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 620;
      bp.Q.value = 0.55;

      const g = ctx.createGain();
      g.gain.value = 0.05;

      src.connect(bp);
      bp.connect(g);
      g.connect(this.master);

      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.065;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 420;
      lfo.connect(lfoGain);
      lfoGain.connect(bp.frequency);
      lfo.start();

      src.start();
    },

    /** 单声钟响（也用于点击、烟花的高光点缀） */
    chime(freq) {
      if (!this.ready || !this.enabled || !this.ctx) return;
      const ctx = this.ctx;
      const t = ctx.currentTime;

      // D 大调五声音阶，随机取音，偶尔低八度
      const scale = [587.33, 659.25, 739.99, 880.0, 987.77, 1174.66];
      const f = freq || scale[(Math.random() * scale.length) | 0] * (Math.random() < 0.25 ? 0.5 : 1);

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;

      // 一个高八度泛音，营造金属钟的质感
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = f * 2.01;

      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.14, t + 0.014);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);

      const g2 = ctx.createGain();
      g2.gain.value = 0.22;
      osc.connect(env);
      osc2.connect(g2);
      g2.connect(env);

      env.connect(this.master);
      if (this.space) env.connect(this.space);

      osc.start(t); osc2.start(t);
      osc.stop(t + 3); osc2.stop(t + 3);
    },

    /** 随机钟声调度：让星域偶尔"响一下" */
    scheduleChimes() {
      clearTimeout(this.chimeTimer);
      const loop = () => {
        if (!this.enabled) return;
        this.chime();
        this.chimeTimer = setTimeout(loop, 4200 + Math.random() * 6200);
      };
      this.chimeTimer = setTimeout(loop, 2600);
    },

    /** 开启 / 关闭 */
    toggle() {
      if (!this.init()) return false;      // 浏览器不支持
      return this.enabled ? this.off() : this.on();
    },

    on() {
      if (!this.ready) return false;
      const ctx = this.ctx;
      if (ctx.state === 'suspended') ctx.resume();
      const t = ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(Math.max(this.master.gain.value, 0.0001), t);
      this.master.gain.linearRampToValueAtTime(this.targetVolume, t + 2.6);
      this.enabled = true;
      this.scheduleChimes();
      return true;
    },

    off() {
      if (!this.ready) return false;
      const ctx = this.ctx, t = ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.master.gain.value, t);
      this.master.gain.linearRampToValueAtTime(0.0001, t + 1.4);
      this.enabled = false;
      clearTimeout(this.chimeTimer);
      return false;
    },

    /** 页面隐藏时自动静音，回到前台恢复（体贴用户） */
    autoMute() {
      if (!this.ctx || !this.enabled) return;
      const ctx = this.ctx, t = ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.linearRampToValueAtTime(0.0001, t + 0.6);
    },
    autoResume() {
      if (!this.ctx || !this.enabled) return;
      const ctx = this.ctx, t = ctx.currentTime;
      if (ctx.state === 'suspended') ctx.resume();
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.linearRampToValueAtTime(this.targetVolume, t + 1.6);
    }
  };

  global.Starverse = global.Starverse || {};
  global.Starverse.audio = Audio;

})(window);
