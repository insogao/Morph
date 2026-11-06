# Creative Morph 参考源码审查

2026 年 11 月 6 日在 Windows、Node.js 24 和 Chromium 环境核查。表中的 SHA 是阅读与运行样例的固定版本。Git 直连失败后，通过 GitHub API 解析默认分支并下载按 SHA 定位的源码归档。随后用本机 HTTP 代理浅克隆，六个 Git 工作副本均与归档的 SHA 一致。附图取自本地运行。

| 项目 | 固定 commit | 许可核查 | Creative Morph 的取用方式 |
| --- | --- | --- | --- |
| [AniDoodle](https://github.com/alexgreensh/anidoodle/tree/4ae27d2c281fcfd01bce87ab13dc5ad4df81a795) | 4ae27d2c281fcfd01bce87ab13dc5ad4df81a795 | Apache-2.0，有 LICENSE、NOTICE | 借鉴确定性渲染、轮廓交接验收和 Skill 组织方式 |
| [GSAP Skills](https://github.com/greensock/gsap-skills/tree/aed9cfd3277740755f6bfc1155c7aa645403b760) | aed9cfd3277740755f6bfc1155c7aa645403b760 | Skill 仓库 MIT，另行核对 GSAP 运行时标准许可 | 文档参考，GSAP 3.15.0 作为独立 API 探针的依赖 |
| [Flubber](https://github.com/veltman/flubber/tree/0cadadf3eb15cd5b2ec7c45c70601ff88b76a6c3) | 0cadadf3eb15cd5b2ec7c45c70601ff88b76a6c3 | MIT，有 LICENSE，包元数据一致 | 候选轮廓适配器，探针运行仓库自带 build 产物 |
| [Liquid Metal Playground](https://github.com/eamonliu/liquid-metal-playground/tree/dbcdc58631936bfd5a724151579c4ba09907c1b0) | dbcdc58631936bfd5a724151579c4ba09907c1b0 | README 声明 MIT，此提交无独立 LICENSE 或包元数据的 license 字段 | 设计与算法参考，未移植代码、Shader 或商标资源 |
| [Motion Pages](https://github.com/jiangyurong609/motion-pages/tree/b54f4a1df485c67704659855d48182dd49f63528) | b54f4a1df485c67704659855d48182dd49f63528 | MIT，有 LICENSE，示例内置的 Three.js 单独标注 MIT | 借鉴目标点云、受控散开和镜头同步 |
| [WebGL Fluid Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation/tree/a2d292931f19d9b3b9f564e23e6c32729d2121c3) | a2d292931f19d9b3b9f564e23e6c32729d2121c3 | MIT，LICENSE 与 script.js 头部一致 | 流场算法参考，压力投影属于可选扩展 |

附图保留上游项目名称与界面。Creative Morph 不分发研究快照的源码或资产。运行 GSAP vanilla 样例时从本地提供它指定的 3.15.0 版本。WebGL 样例逐一在 Chromium 的 ANGLE SwiftShader 环境运行，未借此衡量实体 GPU 性能。屏蔽外部遥测与字体请求，Liquid Metal 的本地 Vercel 遥测脚本请求返回空脚本。

## 1. AniDoodle

- [SKILL.md](https://github.com/alexgreensh/anidoodle/blob/4ae27d2c281fcfd01bce87ab13dc5ad4df81a795/skills/anidoodle/SKILL.md) 将表现媒介、分镜、帧质量和交付方式分开。确定性规则由引擎接口和帧检查共同约束。
- morph.ts 的 **resample** 按轮廓弧长等距采样，**pairUp** 对齐绕向后查找代价最小的循环起点。**handoff** 先在局部形状空间插值，再施加弧形移动、旋转和拉伸。**shapeGap** 以双向采样点到轮廓的距离检查交接。适用于可对应的封闭轮廓和跨段交接。部件拆分或孔洞生成需要单独的拓扑表达。[morph.ts](https://github.com/alexgreensh/anidoodle/blob/4ae27d2c281fcfd01bce87ab13dc5ad4df81a795/skills/anidoodle/engine/src/canvas-core/morph.ts)
- morphDemo 将标点连续带入卡片，再铺成下一画面。motion-grammar 检查位置、大小、颜色、边缘和交接速度。morph.test.ts 覆盖等距采样、首尾轮廓和误差阈值。帧工具入口是 tools/still.mjs、tools/gate.mjs 和 tools/verify-export.mjs。[morphDemo.ts](https://github.com/alexgreensh/anidoodle/blob/4ae27d2c281fcfd01bce87ab13dc5ad4df81a795/skills/anidoodle/engine/src/canvas-core/morphDemo.ts) · [motion-grammar.md](https://github.com/alexgreensh/anidoodle/blob/4ae27d2c281fcfd01bce87ab13dc5ad4df81a795/skills/anidoodle/references/motion-grammar.md) · [morph.test.ts](https://github.com/alexgreensh/anidoodle/blob/4ae27d2c281fcfd01bce87ab13dc5ad4df81a795/skills/anidoodle/engine/test/morph.test.ts)
- 实跑 **node tools/still.mjs morphDemo --frames 48,66,84**。三帧均由 AniDoodle 报告可重复。帧 66 与 84 可见同一轮廓进入卡片位置。Windows 浏览器探测脚本的本地副本补上了 .exe 文件名匹配，绘图使用上游逻辑。[运行截图](../../../docs/research/contour-and-timeline.jpg)

## 2. 官方 GSAP Skills

- MorphSVG 将路径统一到三次 Bézier，提供 **shapeIndex** 和 **rotational** 插值。DrawSVG 控制描边长度，MotionPath 可沿路径取位置与旋转。适合小面积局部形变、笔触、流滴运动引导。[gsap-plugins](https://github.com/greensock/gsap-skills/blob/aed9cfd3277740755f6bfc1155c7aa645403b760/skills/gsap-plugins/SKILL.md)
- 时间轴支持标签、相对位置、嵌套和缓动。暂停的时间轴配合 **totalTime** 可作浏览器渲染适配层。部件对应、场融合和粒子调度仍由各效果模块负责。[gsap-timeline](https://github.com/greensock/gsap-skills/blob/aed9cfd3277740755f6bfc1155c7aa645403b760/skills/gsap-timeline/SKILL.md) · [gsap-core](https://github.com/greensock/gsap-skills/blob/aed9cfd3277740755f6bfc1155c7aa645403b760/skills/gsap-core/SKILL.md)
- 实跑 examples/vanilla/index.html，确认两元素分别水平移动 100 像素和垂直移动 40 像素。独立探针把 MorphSVG、DrawSVG、MotionPath 放入一条暂停时间轴，按 0、0.5、1、0.5 秒采样。中间轮廓、描边和标记位置均变化，两次 0.5 秒读数完全一致。[运行截图](../../../docs/research/contour-and-timeline.jpg)
- gsap@3.15.0 的包元数据指向 GSAP Standard License，和此 Skill 仓库的 MIT 是独立许可。[GSAP 运行时标准许可](https://gsap.com/standard-license/)

## 3. Flubber

- src/normalize.js 检查坐标是否有限，去除闭合重复点并统一绕向。src/svg.js 解析路径，src/add.js 补点或细分长边，src/rotate.js 以最小平方距离选择起点，src/interpolate.js 完成轮廓插值。[src/normalize.js](https://github.com/veltman/flubber/blob/0cadadf3eb15cd5b2ec7c45c70601ff88b76a6c3/src/normalize.js)
- **separate** 使用 src/triangulate.js 拆分源面片并对目标排序，**combine** 将拆分反向运行，**interpolateAll** 接受等长多轮廓列表。适合受控的轮廓切片，语义部件对应需由计划提供。单路径入口仅处理第一个外环。孔洞应使用独立环或场，异常轮廓在适配器入口检查有限数、最小面积和自交。[src/multiple.js](https://github.com/veltman/flubber/blob/0cadadf3eb15cd5b2ec7c45c70601ff88b76a6c3/src/multiple.js) · [上游接口限制](https://github.com/veltman/flubber/blob/0cadadf3eb15cd5b2ec7c45c70601ff88b76a6c3/README.md)
- 实跑 demos/vanilla-canvas.html 并执行一分二探针。目标帧由两个子路径组成，0.5 秒回跳输出与首次采样相同。[运行截图](../../../docs/research/contour-and-timeline.jpg)

## 4. Liquid Metal Playground

- **generatePoissonMask** 把 SVG 光栅化，分类内部和边界，在内部解固定迭代次数的离散 Poisson 方程，再把结果归一化为灰度纹理。这是基于内部势值的边缘遮罩，与严格带符号、具有长度单位的欧氏距离场存在区别。[src/webgl/poisson.ts](https://github.com/eamonliu/liquid-metal-playground/blob/dbcdc58631936bfd5a724151579c4ba09907c1b0/src/webgl/poisson.ts)
- Shader 在变形窗口内用周期包络调节 simplex 坐标扰动。它采样两张灰度纹理，先混合边缘场，再用阈值计算最终可见域并独立着色。轮廓实际变化，几何层和金属反光可以分别设计。此方法适合液态遮罩，未求解质量守恒、自由液面或物体部件映射。[src/webgl/shaders.ts](https://github.com/eamonliu/liquid-metal-playground/blob/dbcdc58631936bfd5a724151579c4ba09907c1b0/src/webgl/shaders.ts)
- **recordLogoAnimation** 建立独立离屏 WebGL 上下文，按帧号写 VideoFrame 时间戳，通过 WebCodecs 与 mp4-muxer 封装。可借鉴显式帧钟，产品导出仍需处理编码可用性和失败回退。[src/main.ts](https://github.com/eamonliu/liquid-metal-playground/blob/dbcdc58631936bfd5a724151579c4ba09907c1b0/src/main.ts)
- 实跑 npm ci、npm run build 与生产构建页面，在原版界面从 Swift 切换到 Apple，截取前、中、后画面。Chromium 的 WebCodecs 探针报告支持所测的 640×640、30 fps H.264 配置。此研究未执行上游录制按钮的完整编码。[运行截图](../../../docs/research/liquid-and-fluid.jpg)

## 5. Motion Pages

- Volera 以固定种子构造 5,600 个点的鹤、鸟群和环形目标。**morphTo** 保存当前点位作为起点，使连续触发时从现场状态重组。延迟与散开方向由固定种子决定。适合组织性分散和目标重建。可借鉴目标生成器，再由 Creative Morph 的语义部件和局部坐标匹配规定各组粒子的目的地。[volera-morph.html](https://github.com/jiangyurong609/motion-pages/blob/b54f4a1df485c67704659855d48182dd49f63528/motion-pages/examples/volera-morph.html)
- Boreal 把 6,000 个主粒子、镜头、场景标注绑定到统一滚动进度。**?still&p=** 提供固定画面采样。可借鉴共用进度值，离线时用固定输入替代实时指针和时钟。[boreal-journey.html](https://github.com/jiangyurong609/motion-pages/blob/b54f4a1df485c67704659855d48182dd49f63528/motion-pages/examples/boreal-journey.html)
- Pura 将程序化源图绘入纹理，Shader 按指针轨迹叠加波纹并偏移采样坐标，分通道采样产生折射色边。适合局部扰动和材质修饰。连通关系需要独立几何或密度场。[pura-liquid-hero.html](https://github.com/jiangyurong609/motion-pages/blob/b54f4a1df485c67704659855d48182dd49f63528/motion-pages/examples/pura-liquid-hero.html)
- 实跑三页。Volera 点击下一形态，标签从 the crane 变为 the migration，轮廓重组为多个飞鸟。Boreal 固定在 83% 处采样，进度条与参数相同。Pura 记录鼠标移动前后的画面。三页无未处理的页面错误。[运行截图](../../../docs/research/motion-pages.jpg)

## 6. WebGL Fluid Simulation

- **createDoubleFBO** 双缓冲保存速度、压力和颜料纹理。**step(dt)** 先计算旋度与涡量约束，再求散度、做 Jacobi 压力迭代并减去压力梯度，随后平流速度和颜料。**splat** 给同一区域注入定向速度与染料。模拟与输出分辨率可分别选择，WebGL2 支持不足时有降级。[script.js](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation/blob/a2d292931f19d9b3b9f564e23e6c32729d2121c3/script.js)
- 可用速度场推动染料、粒子尾迹和液桥扰动。受控外形、接触线、表面张力和预设终态需要独立的场或约束。原交互入口使用真实时间与随机初始 splat。接入离线时间轴前应使用固定步长、种子和事件队列，长期回放可通过检查点或闭式重建。
- 实跑 index.html，通过控制台调用 splat 注入两团指定速度和颜色的染料，记录流场推进前后的画面。浏览器未加载 Google Analytics。画面含上游随机初始化，未测试逐帧哈希复现。[运行截图](../../../docs/research/liquid-and-fluid.jpg)

## 工程取舍与待验收风险

1. **先固定时间轴接口。** 宿主调度 renderAt(t)。效果与导出统一使用帧号和秒数的换算，至少按前向、反向、乱序检查同一关键帧。随机种子随计划保存。
2. **按变化类型选择几何。** 稳定单环用轮廓适配器，孔洞、分叉和液桥从距离场或密度场求边界。分裂与重组用带 ID 的部件或粒子保留来源。3D 同顶点拓扑可直接用 blend shape，跨拓扑考虑部件重组或体积表示。
3. **分开验收几何、材质和镜头。** 固定材质看轮廓移动、断开与合并。固定镜头查交接位置和运动方向。单独检查透明层与高光，确保形变逻辑可辨识。
4. **给场与粒子留出导出预算。** 高分辨率 GPU 读回、浏览器编解码差异、设备的半精度纹理能力都可能影响导出。预览可降采样，交付用本机 Chromium 固定采样和 FFmpeg，核对帧数。跨设备采用容差或结构指标，同环境保留精确帧哈希。
5. **用画面和时间点记录视觉异常。** 检查首尾的可辨识度、部件交接、拓扑事件与后续动作。先验证一个能看到材料去向的核心案例，再扩大风格与组合数量。

## 截图索引

- [轮廓、时间轴和插件探针](../../../docs/research/contour-and-timeline.jpg)
- [液态遮罩和 GPU 流体](../../../docs/research/liquid-and-fluid.jpg)
- [Motion Pages 三个样例](../../../docs/research/motion-pages.jpg)
