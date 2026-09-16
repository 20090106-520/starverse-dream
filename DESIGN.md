# STARVERSE DREAM · 星域梦境 — DESIGN.md

> 单页滚动叙事网站的完整设计系统。用粒子与光写成的一封信：零依赖、离线可用、可被 AI 直接读取并安全扩展。
> 本文档同时面向人与 AI 编码代理：任何新增章节、组件或动效，都必须先在本文件里找到对应的令牌与规则，再动手写代码。

---

## 1. 项目定位

| 项 | 值 |
| --- | --- |
| 形态 | 单页滚动叙事（六幕） |
| 技术 | 原生 HTML / CSS / JavaScript，无框架、无构建、无外部请求 |
| 渲染 | 手写 Canvas 2D 粒子引擎（`js/particles.js`） |
| 声音 | Web Audio 实时合成环境音（`js/audio.js`），无音频文件 |
| 字体 | 仅 `local()` 引用本机字体，不产生网络请求 |
| 部署 | 纯静态，GitHub Pages 直接托管 |

**硬约束（不可协商）**

1. 不引入任何外部依赖、CDN、字体或图片资源；新增能力一律手写。
2. 首屏必须能在两次心跳内出现可读文字（遮罩最多停留 3 秒，且有强制放行兜底）。
3. `prefers-reduced-motion: reduce` 下所有装饰动效退化为静态或瞬时完成。
4. 无 JavaScript 时正文仍然可读（`html.no-js` 兜底规则）。

---

## 2. 设计令牌（`css/style.css` §1）

### 2.1 颜色

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--accent` | `#8b7bff`（由 JS 按章节插值） | 全站强调色：进度环、焦点环、命令面板高亮 |
| `--accent-soft` | `rgba(139,123,255,.35)` | 强调色的低透明形态 |
| `--bg-0 / --bg-1 / --bg-2` | `#04050d / #0a0a1f / #12102e` | 深空底色阶梯（由深到浅） |
| `--text` | `#eef2ff` | 正文与标题 |
| `--text-dim` | `rgba(228,234,255,.78)` | 次级信息 |
| `--text-faint` | `rgba(216,225,255,.62)` | 元信息、说明；已按深底校准到 WCAG AA |

规则：**新颜色一律从令牌派生**（`color-mix(in srgb, var(--accent) 58%, transparent)`），禁止在组件里写死十六进制强调色。

### 2.2 排版

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--serif` | 思源宋体/宋体本机栈 | 叙事标题、章节标题 |
| `--kai` | 楷体本机栈 | 引文、寄语 |
| `--sans` | Inter / HarmonyOS Sans / 系统栈 | UI、按钮、元信息 |
| 标题级差 | `clamp(1.6rem, 6vw, 4.3rem)` | 首屏主标题；章节标题逐级递减 |
| 正文行高 | 1.8–2.0 | 中文长句的呼吸感 |

### 2.3 间距与节奏

- 章节内边距：`--pad-x: clamp(20px, 7vw, 130px)`；纵向 `clamp(86px, 17vh, 180px)`。
- 章节间距以 `vh` 为主、`px` 为辅，保证不同视口下叙事节奏一致。
- 移动端优先使用 `100svh`，避免地址栏收缩造成的高度跳动。

### 2.4 动效曲线

| 令牌 | 值 | 语义 |
| --- | --- | --- |
| `--ease` | `cubic-bezier(.2,.8,.2,1)` | 全站统一缓动：快出慢收 |
| 入场 | 1.05s | `.reveal` 位移 + 淡入 |
| 标题逐字 | 每字延迟 `--i × 60ms`，基延迟 `--d` | 由 JS 写入 `--i` / `--d` |
| 解密揭示 | 每字 46ms 落定 | 见 §5.2 |
| 悬停/焦点 | 0.3s | 位移不超过 3px |

---

## 3. 叙事结构（六幕）

| 场景 | id | 粒子形态 | 情绪 |
| --- | --- | --- | --- |
| 序章 | `intro` | `galaxy` 星系漩涡 | 静默、开场 |
| 第一章 | `ch1` | 坠落 / 坍缩 | 失重 |
| 第二章 | `ch2` | 行星轨道（鼠标控制视角） | 旋转、凝视 |
| 第三章 | `ch3` | 星座连线 | 秩序与许愿 |
| 第四章 | `ch4` | 双星相会 | 概率与相遇 |
| 终章 | `ending` | 人像剪影 / 自由漂移 | 收束、致意 |

规则：新增章节必须同时提供 ① 粒子形态 ② 主题色板 ③ 一句话情绪说明，并登记到上表。

---

## 4. 组件库

| 组件 | 类名 | 说明 |
| --- | --- | --- |
| 玻璃卡片 | `.glass` | 唯一容器语言：半透明渐变 + 1px 亮边 + 内阴影 |
| 按钮 | `.btn` / `.btn--ghost` | 实心为主操作，幽灵按钮为次要操作 |
| 导航圆点 | `.dots` / `.dots__item` | 右侧竖排，悬停与选中显示章节名 |
| 顶部进度条 | `.progress` | 2px，四色渐变，`scaleX` 驱动 |
| 阅读进度环 | `.readring` | 右下角，SVG 描边进度 + 百分比，点击回到序章 |
| 命令面板 | `.cmdk` | `⌘K` / `Ctrl+K` / `/` 唤出，↑↓ 选择，Enter 执行 |
| 星域档案 | `.bento` | 终章 6 格网格：序章与终章宽格，四章普通格 |
| 轻提示 | `.toast` | `role="status"`，2.6s 自动消失 |
| HUD 容器 | `.hud` | 右下角竖排控制条，收拢命令入口与进度环 |

组件规则：

1. 每个可交互组件必须是 `<button>` 或带 `tabindex` 的真实控件，禁止只靠 `li` + `click` 模拟。
2. 焦点态统一使用 `:focus-visible` 环（`outline: 2px solid color-mix(in srgb, var(--accent) 80%, #fff)`，偏移 2–3px）。
3. 组件新增必须自带响应式（`@media (max-width: 760px)`）与 `prefers-reduced-motion` 覆盖。

---

## 5. 动效阶梯

本项目的动效严格停留在「CSS / Canvas 2D」层，不越级引入视频、Lottie、Three.js 或自定义 shader——因为零依赖与离线可用优先级更高。

| 层级 | 允许使用 | 本项目用例 |
| --- | --- | --- |
| L1 CSS 过渡 | 位移/淡入 ≤ 1.05s | `.reveal`、悬停 |
| L2 CSS 关键帧 | 逐字散落、光晕呼吸 | `.ch` 入场 |
| L3 Canvas 2D | 粒子形态、星爆、涟漪、流星 | 全站背景 |
| L4 Web Audio | 实时合成环境音 | 星域之声 |

### 5.1 光标揭示（Particle Reveal）

- 光标 150px 半径内的粒子被点亮（透明度最高增益 1.15 倍），移开后按 `damp(0.93, dt)` 衰减。
- 与既有的 190px 涡旋引力共存：引力负责「推开」，揭示负责「点亮」，两者参数不得互相覆盖。

### 5.2 解密式标题（Decrypt Reveal）

- 标题进入视口时，逐字先置为星域字形集（`星梦域光尘夜航坠轨旋相遇概率奇迹·✦✧∘∞01`），随后每 46ms 落定一位真字。
- 落定期间字符附加 `.is-scrambling`（强调色 + 微光晕）。
- `prefers-reduced-motion: reduce` 时整段跳过，直接显示真字。

---

## 6. 无障碍基线

| 项 | 要求 |
| --- | --- |
| 对比度 | 正文与 UI 文本 ≥ 4.5:1（已对小字号 `--text-faint` 逐项校准） |
| 焦点 | 全站可见 `:focus-visible` 环，禁止 `outline: none` |
| 键盘 | 方向键/PageUp/PageDown 切章；`⌘K`/`Ctrl+K`/`/` 打开命令面板；`Esc` 关闭；`Tab` 不逃逸面板 |
| 语义 | 装饰层 `aria-hidden="true"`；提示区 `role="status" aria-live="polite"`；面板 `role="dialog" aria-modal="true"` |
| 动效 | 跟随系统「减少动态效果」实时切换，不只在加载时读取一次 |
| 降级 | JS 失败时遮罩自动撤下，正文静态可读；`html.no-js` 隐藏全部装饰层 |

---

## 7. 质量栏（合并前自检）

以下任一项出现即为 **不合格**，必须先修再合并：

- [ ] 引入了外部依赖、CDN、网络字体或图片
- [ ] 随机渐变 / 通用卡片堆砌等「AI 味」装饰
- [ ] 动效时长 > 1.2s 或无法被「减少动态效果」关闭
- [ ] 交互元素无法通过键盘触达，或焦点不可见
- [ ] 文本对比度低于 WCAG AA
- [ ] 首屏出现白屏或黑屏超过 3 秒
- [ ] 移动端出现横向滚动条或 `100vh` 高度跳动
- [ ] 新增组件缺少响应式或降级规则

---

## 8. 参考来源映射

| 来源 | 借鉴内容 | 落地位置 |
| --- | --- | --- |
| styles.refero.design | 设计令牌分层、DESIGN.md 组织方式 | 本文件 §2、§4 |
| canvasui.dev | Decrypt Reveal、Particle Reveal | `js/main.js`、`js/particles.js` |
| namethatui.com | Progress Ring、Command Palette、Bento Grid | `js/ui-extras.js` + `css/style.css` §13 |
| github.com/Kainiko943/beautiful-ui | 稀疏导航、状态覆盖、质量栏与降级纪律 | 本文件 §6、§7 |

---

## 9. 文件结构与发布

```text
.
├── index.html          结构与文案（含 no-js 兜底）
├── css/style.css       设计令牌 + 组件（§1–§12 原生，§13 参考融合扩展）
├── js/particles.js     粒子引擎（window.Starverse.engine）
├── js/audio.js         Web Audio 环境音（window.Starverse.audio）
├── js/main.js          叙事编排（章节、揭示、寄语、导航、快捷键）
├── js/ui-extras.js     扩展层（进度环、命令面板、星域档案）
└── DESIGN.md           本文件
```

**发布注意**：仓库内所有源码文件必须是 UTF-8 文本，禁止以 Base64 形式提交 `.html` / `.css` / `.js`，否则线上将无法解析渲染。

扩展点约定：

- 粒子能力：`window.Starverse.engine`（`setShape` / `setTheme` / `setPointer` / `setTilt` / `burst` / `ripple` / `pulse`）
- 声音：`window.Starverse.audio`（`toggle` / `chime` / `autoMute` / `autoResume`）
- 扩展 UI：`js/ui-extras.js`，只读取 DOM 与上述两个命名空间，不反向依赖 `main.js` 内部变量。
