# 星域梦境 · STARVERSE DREAM

> 每一个你，都是一颗独一无二的星辰。

一场由粒子与光写成的沉浸式数字艺术体验。全屏 Canvas 粒子系统 + 滚动叙事，六个「梦境章节」各有独立的视觉主题与粒子形态，随滚动平滑过渡。

**在线体验** → <https://20090106-520.github.io/starverse-dream/>

---

## 特性

**粒子引擎（手写 Canvas 2D）**

- 七种粒子形态：星系漩涡、星云坍缩、轨道环绕、星座连线、双星相会、粒子人像剪影（离屏像素采样）、自由漂移
- 鼠标涡旋引力：光标经过处星尘被卷入涡流
- 主题调色板随滚动插值，颜色与形态平滑过渡而非硬切
- 光晕精灵预渲染缓存，避免 `shadowBlur` 性能陷阱
- 按视口面积自适应粒子数 + 帧率自适应升降级

**沉浸叙事**

- 开场标题逐字散落归位（散落 → 旋转 → 失焦 → 归位）
- 六章滚动叙事，配滚动进度条与章节导航圆点（支持方向键翻章）
- 场景氛围光按视口距离交叉淡入淡出

**交互细节**

- 鼠标光晕跟随、点击星爆 + 涟漪、随机流星划过、终章烟花绽放
- 打字机文案浮现
- 星光寄语：写下一句话 → 化为星空中一颗有坐标的星（文本哈希定坐标，同一句话永远落在同一片天），`localStorage` 持久化
- 相遇概率：由本机专属种子推导的浪漫统计，刷新不变
- 环境音：Web Audio 实时合成（低音 drone + 风噪 + 五声音阶钟声），**零音频文件**

**扩展层（`js/ui-extras.js`，零依赖，全部节点运行时创建）**

- 阅读进度环：右下角 SVG 描边进度 + 百分比，点击回到序章
- 命令面板：`⌘K` / `Ctrl+K` / `/` 唤出，可搜索跳章、开关声音、复制宇宙编号、重播
- 星域档案：终章 Bento 网格章节索引，任意一章一键直达
- 光标揭示：光标半径内的星尘被点亮，移开后留下缓慢衰减的余辉
- 标题解密：章节标题以星域字形乱序落定，像信号逐位锁定

## 参考来源

本项目的设计系统与交互手法参考了以下公开资源，落地方式记录在 `DESIGN.md` §8：

| 来源 | 借鉴内容 |
| --- | --- |
| [styles.refero.design](https://styles.refero.design) | 设计令牌分层、DESIGN.md 的组织方式 |
| [canvasui.dev](https://canvasui.dev) | Decrypt Reveal、Particle Reveal |
| [namethatui.com](https://namethatui.com) | Progress Ring、Command Palette、Bento Grid |
| [github.com/Kainiko943/beautiful-ui](https://github.com/Kainiko943/beautiful-ui) | 稀疏导航、状态覆盖、质量栏与降级纪律 |

## 技术约束

- 纯 HTML / CSS / JavaScript，**零构建工具、零外部依赖**
- 不引用任何外部图片、字体、音频或 JS 库；图标与装饰全部由 CSS / SVG / Canvas 绘制
- 双击 `index.html` 即可运行，也可直接部署到任意静态托管

## 目录结构

```
starverse-dream/
├── index.html          # 页面结构与全部文案
├── css/
│   └── style.css       # 视觉系统：主题、玻璃拟态、逐字动画、场景氛围光
└── js/
    ├── particles.js    # Canvas 2D 粒子引擎（形态生成 / 物理 / 渲染）
    ├── audio.js        # Web Audio 环境音合成
    ├── main.js         # 滚动叙事编排、章节过渡、交互与本地存储
    └── ui-extras.js    # 扩展层：阅读进度环 / ⌘K 命令面板 / 星域档案网格

DESIGN.md               # 设计系统文档（令牌 / 组件 / 动效 / 无障碍 / 质量栏）
```

## 本地运行

无需安装任何依赖：

```bash
# 方式一：直接打开
双击 index.html

# 方式二：起一个本地服务（推荐，避免 file:// 的部分限制）
python -m http.server 8080
# 然后访问 http://localhost:8080
```

## 部署到任意静态托管

本项目是纯静态站点，以下平台均可免费部署，**无需构建步骤**：

| 平台 | 操作 |
| --- | --- |
| GitHub Pages | 推送仓库后，Settings → Pages → Source 选 `main` 分支根目录 |
| Netlify | 直接把整个文件夹拖进 Netlify Drop |
| Vercel | `vercel --prod`，或导入 Git 仓库（框架预设选 Other） |
| Cloudflare Pages | 连接仓库，构建命令留空，输出目录填 `/` |

## 浏览器要求

Chrome / Edge / Safari / Firefox 现代版本。`backdrop-filter`（玻璃拟态）与 Web Audio 在较旧浏览器上会优雅降级。

## 发布注意

仓库内 `index.html` / `css/style.css` / `js/*.js` 必须以 **UTF-8 文本**提交。若以 Base64 形式入库，GitHub Pages 将无法解析渲染（页面只剩源码字符串）。

## 许可

[MIT](LICENSE)