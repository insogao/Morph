# Morph Master Skill｜开发方案 v0.3

- 日期：2026-11-07
- 状态：方案已定，尚未开始编码
- 取代：`source/02_Morph_Master_Development_Plan.md`（v0.1）。调研输入：`source/01_Morph_Master_Research.md`、`source/expanded-2026-11-07/`（官网核验资料包）、`research-morph-studio.md`（含官方教程逐帧观察）
- v0.3 相对 v0.2：加入教程观察（第 2 节），算子语义和反作弊规则（第 3.1、6 节），测试素材集，以及花 → 蝴蝶、鱼 → 鸟两个指定 Demo。资料包要求的 MP4 交付按用户决定改为网页 Demo

## 0. 相对 v0.1 的改动

| 项 | v0.1 | v0.2 |
| --- | --- | --- |
| 运行环境 | 要求 Windows 验收，AE 可选 | **只在网页运行**，和操作系统无关；不涉及 AE |
| 交付物 | MP4 / GIF / 帧序列 | **网页 Demo**：播放器场景 + 可离线打开的单个 HTML。不渲染视频 |
| Morph Studio | 安装 AE 试用版做黑盒测试 | 只借鉴思路（pins、序列、Transform 同步、样式通道、回弹），见调研笔记 |
| 技术主线 | flubber + 网格形变 | **两条轨道**：精确矢量轨道（新建）+ 有机场轨道（已有 SDF 部件场），两者可以在画面中交接 |
| Skill 组织 | 按能力包 M0–M5 | **先按素材类型分流**，每类素材写清楚能做什么、推荐什么、不做什么 |
| Remotion / Python | 候选 | 不用。保持 TypeScript + WebGL2 / Canvas2D，Playwright 只用于自检 |

**目标一句话**：AI 拿到用户的素材（或只有一句描述），先判断素材类型，再从这类素材的效果清单里挑选并组合，最后生成一个好看、可拖动的网页 morph。

## 1. 核心设计：素材类型决定效果菜单

Skill 的第一步永远是**诊断素材**。每种素材都有自己的效果菜单，AI 不能跨菜单乱用。比如照片不能直接承诺“生物变身”。

### 1.1 素材类型 × 效果矩阵（Skill 的核心）

状态：✅ 已有可运行 Demo；🔧 本方案要做；🧪 需要单独过门禁才承诺；⛔ 不支持（Skill 必须告诉用户，并给替代方案）。

| 素材 | 首推效果 | 其他可用效果 | 不支持 / 降级 | 前处理 |
| --- | --- | --- | --- | --- |
| **文字**（单词、句子、汉字、数字） | 逐字槽矢量形变 + 错开时序；词 → 词（相同字母保持不动） | 文字 → 图标；笔画书写；文字一笔画；碎裂重组；粒子聚散；汉字笔画 → 物体（字即骨架）；字体粗细或字体之间插值 | 超长段落逐字形变（改用整行打散）；手写体连笔的笔画语义 | 字体 → 轮廓（opentype.js）；单线字体 → 笔画中心线；汉字笔顺数据（需核许可） |
| **图标 / 剪影 SVG**（单色闭合路径） | 精确矢量形变 + pins + 回弹；多形状循环序列 | 液态融化（转入 SDF）；轮廓残影 / 伪挤出；碎裂；粒子；生长填充；一笔画 | — | 路径解析、规范化（方向、起点、细分） |
| **多部件 SVG**（带 id 或分组） | 部件对应：能平移旋转的部件优先用 Transform，其余逐部件形变；错开时序 | 分裂 / 融合；层级交换；颜色通道单独进行；部件转入 SDF 做液态 | 无 id 且部件数差异大时，自动对应不可靠（让 AI 先标注） | 部件树、包围盒、面积、质心；AI 写 `correspondence` |
| **线稿 SVG**（开放路径、描边） | 描边绘制 / 擦除；一笔画抽线重绘 | 开放路径 → 开放路径形变；描边 → 骨架（转入 SDF 长出体积） | 填充区域语义 | 路径按长度重采样 |
| **扁平位图**（Logo PNG、透明 PNG） | 提取 alpha 轮廓 → 走矢量轨道；像素粒子（保留原图颜色） | 碎片贴原图的碎裂；网格翻转；遮罩揭示 | 🧪 纹理随形状变形（网格形变，需过门禁） | alpha 等值线 + 简化；按颜色分块（可选） |
| **分层 PNG** | 🧪 每层网格形变 + 部件运动 | 逐层碎裂 / 粒子 / 揭示 | 被遮挡区域的补绘 | 用户提供图层和层名 |
| **照片 / 复杂插画**（无透明） | 像素粒子聚散；碎裂重组；网格翻转 | 位移扭曲；圆形或笔刷遮罩揭示；像素排序 | ⛔ 两张照片之间的“生物变身”；⛔ 自动语义分割（以后再研究） | 降采样 |
| **3D 模型**（glTF / GLB） | 🔧 表面点云聚散重组；部件爆炸再装配 | 溶解着色器；体素化重建 | ⛔ 任意网格之间的拓扑形变（只做程序化 SDF 体） | three.js 加载；按面积采样表面 |
| **程序化 3D**（AI 自己建模） | ✅ 光线步进 SDF 形变（甜甜圈 → 杯） | ✅ 车削网格 | — | — |
| **无素材，只有描述** | ✅ 现有 creative-morph 全部机制（液态部件场、溅射长出、粒子轨道、碎裂、一笔画、生长…） | 也可以先生成 SVG 再走矢量轨道 | — | — |

### 1.2 两条渲染轨道

| 轨道 | 适合 | 外观 | 实现 |
| --- | --- | --- | --- |
| **V 精确矢量**（新建） | 文字、Logo、图标、扁平插画、运动图形 | 边缘锐利，拐角清楚，纯色或渐变 | Canvas2D / SVG 路径：Bézier 规范化 → 对应 → 插值 |
| **O 有机场**（已有） | 生物、液体、融化、拓扑变化 | 柔软，有体积光照和投影 | `sdf-gl` 部件场、粒子、碎裂、生长、3D raymarch |

**交接**：矢量路径可以直接转成 SDF 图元（新增 `polygon` 图元：采样后的折线距离场）。这样一个 Logo 可以先锐利地形变，再“融化”成液体，然后长成生物。交接点上两个轨道画同一个轮廓，所以不会跳变。

## 2. 精确矢量轨道（V）设计

借鉴 Morph Studio 和 GSAP MorphSVG 的成熟做法，自己实现。

教程证实，Morph Studio 的核心是“自动算出顶点对应 + pin 作为全局约束重算 + 可视化诊断”，帧间插值交给 AE 原生路径关键帧，中间帧普遍偏圆（见调研笔记第 1 节）。我们的目标是：**对应关系至少和它一样好，插值明显更好**。

1. **解析**：SVG `path / rect / circle / polygon / text` 全部转成三次 Bézier；处理 `transform`、`viewBox`，以及 `fill-rule` 下的洞。
2. **规范化**：统一绕向，外轮廓顺时针、洞逆时针；按弧长细分，让两边段数相同。细分位置优先选在拐角，保证直角不被磨圆。
3. **两类点**（照搬 Morph Studio 的概念）：原始顶点（authored）和补出来的拓扑点（generated）。自动对应时，**拐角优先对拐角**：按转角大小排序配对，再在拐角之间按弧长比例撒点。
4. **子路径配对**：外轮廓配外轮廓，洞配洞，按面积和质心做最小代价匹配。pin 按子路径分别设置。多出来的子路径用**消失点**处理：缩到一个目标点后消失，反过来就是从这一点长出。目标点默认是它自己的中心（原地缩小），也可以指定为配对形状的中心（飞入合并）。另一种做法是从相邻轮廓分裂出来。
5. **起点和方向**：自动搜索使平均位移最小的起点偏移（相当于 shapeIndex）。**pins** 可以覆盖：`{ a: 锚点, b: 锚点 }`。锚点可以是坐标、顶点序号，或可读名字（`top`、`sharpest-left`、`corner:3`），由引擎解析。AI 一般只写 0–3 对 pin。pin 是**全局约束**：每加一个 pin，在满足所有 pin 的前提下重算全部对应关系。允许一对多。
6. **插值方式**：
   - `linear`：直接插坐标，也就是 Morph Studio 的做法，作为对照基线；
   - `rotational`：围绕质心插角度和半径，防止中途塌缩；
   - 控制柄按角度 + 长度插值，防止折角；
   - 可选 `via`：经过一个中间形状（如圆或星）的两段式路线；
   - **预旋转对齐**：自动搜索使总位移最小的旋转角（例如 E 转 90° 再配 M），也可以手动指定。
7. **通道**：几何 / Transform / 填充 / 描边颜色 / 描边宽度 / 不透明度，各自有时间窗和缓动。颜色在 OKLab 空间插值。
8. **次级动作**：
   - 回弹：参数沿用 Amplitude / Frequency / Decay，作用在路径上；
   - 错开时序（逐字槽、逐部件）；
   - 轮廓残影 / 伪挤出；
   - 容器挤压；
   - 运动模糊（按速度方向复制几层）。
9. **自检**：25 / 50 / 75% 处检测自交、面积突变、顶点速度突变；**轨迹交叉（fault）**：两个顶点从 A 到 B 的路径相交时报告，并指出涉及哪些点，方便 AI 加 pin 修正；端点与输入路径逐点比对；输出“有形度”（50% 帧的拐角数和面积 / 周长比），与 linear 基线对比。
10. **调试视图**（对应 Morph Studio 的 PREVIEW & MAP）：播放器里可以切换显示两边线框叠加、原始点和生成点、顶点连线（`show point connections`）、pin、fault 高亮；只看某一条子路径；单段 / 整条预览。AI 截图检查对应关系时用。

## 3. 效果算子库

按“观众看到了什么”组织，每个算子标明适用的素材类型。

| 类别 | 算子 | 素材 | 状态 |
| --- | --- | --- | --- |
| 形状 | 矢量形变（pins、rotational）、序列 / 循环、多形状合一、一分多 | 文字、SVG、位图轮廓 | 🔧 |
| 形状 | 液态部件场、溅射长出、拉链式分裂 | 无素材 / SVG 转入 | ✅ |
| 结构 | 部件对应（Transform 优先）、拆散重组、层级交换 | 多部件 SVG | 🔧 |
| 结构 | Voronoi 碎裂 + 双面碎片 | 所有 | ✅（贴图版 🔧） |
| 线条 | 描边绘制 / 擦除、一笔画抽线、开放路径形变 | 线稿、文字 | ✅ 一笔画 / 🔧 其余 |
| 粒子 | 轨道聚散、像素粒子（取原图颜色）、3D 表面点云 | 所有 | ✅ / 🔧 |
| 生长 | 空间殖民生长、结晶 | 剪影 | ✅ / 待做 |
| 运动图形 | 回弹、错开、残影 / 伪挤出、容器挤压、运动模糊、逐字槽 | 文字、SVG | 🔧 |
| 平面 | 网格翻转、遮罩揭示、折纸、揭开卷起 | 位图、照片 | 🔧 / 待做 |
| 3D | raymarch SDF、车削网格、glTF 点云 / 爆炸装配 | 3D | ✅ / 🔧 |

### 3.1 多目标算子的语义（必须分开实现、分开测试）

| 算子 | 含义 | 对象数 | 实现 | 判定标准 |
| --- | --- | --- | --- | --- |
| `sequence` | A → B → C，依次进行 | 1 | 每段独立时长、缓动和 pins | 每段可单独预览（相当于 `Current Step`） |
| `merge` | 多个 → 一个 | N → 1 | 子路径配对；多出来的子路径聚拢后并入 | 输出对象数确实变为 1，身份可追踪 |
| `split` | 一个 → 多个 | 1 → N | 拉链式分离（SDF）或 flubber 式切分（矢量）；产生新的稳定 id | 分出的每个对象之后能**独立运动** |
| `blend` | 同一形状同时朝 B、C 按权重变化 | 1 | 只对同构（点数和结构一致）的状态放行；不兼容就先规范化，否则报错 | 权重连续可调，不是复制两份再叠加 |
| `parallel` | 几何、颜色、纹样、背景各自有进度 | 1 | 通道系统 | 每个通道可以单独暂停或拖动 |
| `part-remap` | 部件重新分配（花瓣 → 翅膀） | 部件级 | `correspondence` 表 + Transform 优先 | 至少 3 个部件去向一眼可读 |

`skills/creative-morph/references/effect-catalog.md` 里“待实现”的十种机制（折纸、翻牌、揭开、烟雾、鸟群、影子戏、微距穿越、燃烧、结晶、磁流体）并入这张表，按里程碑排队。

## 4. 代码与 Skill 结构

```text
packages/morph-engine/src/
├── vector/            # 🔧 V 轨道：path.ts、normalize.ts、match.ts、interpolate.ts、qc.ts
├── import/            # 🔧 svg.ts、font.ts、image.ts（alpha 轮廓、像素采样）、gltf.ts
├── effects/           # 已有 + 运动图形算子（bounce、stagger、echo…）
└── renderers/         # 已有；sdf-gl 增加 polygon 图元
tools/inspect.mjs      # 🔧 素材诊断：类型、子路径、洞、开放路径、部件 id、alpha、尺寸 → JSON
tools/evaluate.mjs     # 🔧 自检：自交、端点误差、有形度、确定性 → qc-report.json
fixtures/              # 🔧 测试素材 S0–S3（全部自制或 CC0，见 5.1）
skills/morph-master/
├── SKILL.md           # 入口：诊断 → 查矩阵 → 选效果 → 写 plan → 自检
└── references/
    ├── inputs/        # text.md、svg-icon.md、svg-parts.md、line-art.md、bitmap.md、photo.md、model-3d.md、no-asset.md
    ├── vector-track.md
    ├── operators.md   # 第 3 节算子库，每个算子：效果、参数、适用素材、Demo 链接
    └── recipes.md     # 可直接套用的组合配方
lab/mm-*/              # 每个能力一个网页 Demo
```

- 每份 `inputs/*.md` 的固定格式：**能做什么**（链接 Demo）、**首推组合**、**不做什么 + 怎么跟用户说**、**前处理步骤**、**常见失败和修法**。
- `creative-morph` 作为 `no-asset.md` 这一条分支保留。等 Morph Master 稳定后再决定是否合并成一个 Skill。
- 产出形式：AI 在 `lab/<id>/scene.ts` 写场景 → 播放器里拖动预览 → 用 `export --html-only` 导出单个离线 HTML。需要给导出脚本加一个只导出 HTML、不渲染视频的开关。
- 素材文件放在场景目录下；`plan.json` 增加 `assets`、`pins`、`sequence`、`channels` 字段，并同步更新 `schemas/morph-plan.schema.json`。

## 5. 里程碑（每步都有网页 Demo 和门禁）

| # | 内容 | Demo | 门禁（通过才进下一步） |
| --- | --- | --- | --- |
| **M1** | V 轨道核心：解析、规范化、拐角对应、子路径配对、pins、rotational、回弹、序列、merge，加调试视图 | `lab/mm-icon-loop`：环 → Y → 木 → 人 → 环（原创图形）。`lab/mm-vs-linear`：心 ↔ 星、沙漏 ↔ X + 四菱形，三栏并排：linear 基线 / flubber / 我们 | 25/50/75% 无自交、无折角；首尾帧与输入逐点一致；直角保持锐利；明显好于 flubber；3.1 中 sequence、merge 的单测通过。**已完成，见 `M1-report.md`**（原定“有形度高于 linear 基线”的门禁被证伪，已删除） |
| **M2** | 文字：字体加载、逐字槽形变、词 → 词、文字 ↔ 图标、残影 / 错开 / 容器挤压 | `lab/mm-word`：`MORPH → 变形 → ✱`，逐字错开 + 容器挤压；`lab/mm-glyph-real`：用真实字体轮廓做“鱼”字 → 锦鲤（替换手写坐标） | 中英文字体都能用；相同字母不乱动；中段可读。**`lab/mm-word` 已完成，见 `M2-report.md`；“鱼”字 → 锦鲤（真实字体）需要矢量 → SDF 交接，移到 M3** |
| **M3** | SVG 导入 + 多部件 + `inspect` + split / blend / parallel / part-remap + 矢量 → SDF 交接 | **D1** `lab/mm-flower-butterfly`：S1 花.svg → 蝴蝶.svg，花瓣 → 翅膀、花蕊 → 身体、花梗 → 触角；附“单轮廓插值”和“交叉淡化”对照。**D2** `lab/mm-fish-bird`：轮廓、鳞 → 羽纹、背景水纹 → 云纹三通道，各带独立进度条。`lab/mm-logo-melt`：Logo 锐利形变 → 融化 → 长成生物 | D1 至少 3 个部件去向一眼可读，中间不能是“消失再出现”；D2 三个通道能分别暂停；split 的子对象能独立运动；blend 权重连续；交接点无跳变。**D1、D2、split、merge、blend、parallel 已完成，见 `M3-report.md`；矢量 → SDF 交接（Logo 融化、真实字体“鱼”）为 M3b；**M3b 已完成（MM09、MM10），见 `M3-report.md` 的 M3b 节** |
| **M4** | 位图：alpha 轮廓、像素粒子、贴图碎裂、网格翻转、遮罩揭示 | `lab/mm-png`：透明 PNG Logo → 另一个；`lab/mm-photo`：照片碎裂 / 粒子重组 | 轮廓误差小于 1–2 px；粒子颜色取自原图。**已完成（MM12–MM14），见 `M4-report.md`；实测描边误差：顶点 0.17 px，弦高约 0.6 px** |
| **M4b** 🧪 | 分层 PNG 纹理网格形变 | `lab/mm-mesh-warp` | 纹理随形状走，而不是淡入淡出；记录翻折和裂缝。**已完成（MM15），见 `M4b-report.md`；翻折峰值 0.23%** |
| **M5** | 3D：glTF 点云聚散、爆炸装配 | `lab/mm-gltf`（用 CC0 模型） | 60fps 预览（GPU）；首尾是完整模型。**已完成（MM16、MM17），见 `M5-report.md`；Apple M4 上中位数 16.7 ms / 帧** |
| **M6** | Skill 封装 + 盲测 | 新会话只给 Skill，每类素材各做一个没预设过的题目 | AI 先正确诊断素材，选对菜单，不越界承诺；失败点回写 Skill |

**顺序理由**：文字和 SVG 是最常见、成功率最高的输入，也是 Morph Studio 证明过有市场的效果；位图和 3D 依赖前面的矢量和粒子工具。

### 5.1 测试素材集（全部自制或 CC0，放在 `fixtures/`）

| 集 | 内容 | 用途 |
| --- | --- | --- |
| S0 | 圆、星、心、叶、沙漏、X + 四菱形 | 几何基线，M1 |
| S1 | 同一画布、同一风格、带部件 id 的花 / 蝴蝶 / 鱼 / 鸟 / 甲虫 SVG | D1、D2，M3 |
| S2 | S1 对应的透明分层 PNG，每层带花纹 | M4b 纹理门禁 |
| S3 | S2 合成的单张 PNG | 测拆层工作量；“自动化是否值得”的依据 |
| T0 | 中英文字体（OFL）、单线字体 | M2 |
| F0 | 失败注入：SVG 缺 id、开放路径、带洞、PNG 无透明、超大图 | `inspect` 必须给出清楚的警告 |

## 6. “好看”的验收标准

每个 Demo 都要过以下检查，用 `npm run check:visual` 联系表加逐帧截图：

1. **锐利**：矢量轨道不出现被磨圆的直角，也不出现锯齿抖动。
2. **连贯**：没有自交、翻折、突然出现或消失；用 `tools/frames.mjs` 看形变最快的那几帧。
3. **可读**：盲看 50% 那一帧，能说出它正从什么变成什么。
4. **有节奏**：至少一种次级动作（回弹、错开、残影、跟随），不是匀速线性插值。
5. **确定性**：正放、倒放、拖动得到同一帧（现有 `check:visual` 已覆盖）。
6. **三项分开报告**：编译通过、测试通过、看起来对。

**反作弊规则**（资料包 06 节，全部采纳）：

- A 淡出、B 淡入不算形变。
- 复制两份 A 各自变形，不算 `blend`；只能算 `split` 的一种视觉手法，并且要说明对象身份。
- 单轮廓平滑插值不能说成“花瓣变翅膀”，必须有部件对应记录。
- 位图矢量化后重新上色，不能说成“保留了原纹理”。
- 任何 PASS 都要有能重跑的场景、输入、关键帧截图；只写在文档里的只能标 PROPOSED。

## 7. 依赖与许可

| 依赖 | 用途 | 许可 | 决定 |
| --- | --- | --- | --- |
| flubber | 对照 / 兜底 | MIT | 已有 |
| three | 3D、glTF | MIT | 已有 |
| opentype.js | 字体 → 轮廓 | MIT | 采用 |
| earcut / d3-delaunay | 三角剖分（网格形变、碎裂） | ISC | 按需 |
| 开源字体（Noto / 思源、Inter 等） | 内置字体 | OFL | 采用，子集化控制体积 |
| Hershey 单线字体 | 笔画书写 | 公有领域 | 候选 |
| Make Me a Hanzi | 汉字笔顺和中线 | 多重许可（Arphic / LGPL） | 🔍 用前核对原文 |
| GSAP MorphSVG | 思路参考 | 免费，但有限制条款 | 不作为依赖 |
| Potrace | 位图转矢量 | GPL | 不用 |
| VTracer 1.x | 彩色位图转矢量（可选） | MIT / Apache-2.0 | M4 再评估 WASM 版 |

## 8. 未决事项

- Morph Studio：官方教程已逐帧看过（调研笔记第 1 节）。仍未知：自动对应算法、子路径数不同时的处理、开放路径和洞。我们不依赖这些答案，M1 用线性基线对比来证明自己的质量。
- 素材来源：Demo 素材全部自制，或使用 CC0 素材，并在场景目录记录来源。
- 汉字笔顺数据的许可是否允许内置；如果不允许，汉字只用轮廓，笔画书写用骨架提取近似。

## Blind test 1 (2026-11-07)

Three fresh agents, three new pairs (SVG parts, text, 3D) → MM90–MM92. 14 gaps found and fixed (auto-rebuild, GLB inspect, morph.json field reference, text slot API, word → multi-part icon, 3D rig and per-part access). Open: 3D between very different silhouettes, and a drift cause. See [blind-test-1.md](blind-test-1.md).

## M6 · Shape-rhyme match cut (2026-11-07) — done

Push in on a part of A that already looks like a part of B, hand over there, pull out on B. Works for every material, and is the only honest subject → subject route for photos. Includes `vector/rhyme.ts`, `vector/match-cut.ts` and `tools/rhyme.ts`; demos MM95–MM97. See [M6-report.md](M6-report.md) and `skills/morph-master/references/shape-rhyme.md`.
