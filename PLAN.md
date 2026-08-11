# 基于三维激光点云的电力巡检业务系统 — 设计方案

> 状态：待评审（2026-08-11）
> 前置决策：Web 化 / 内网单机 Docker / 双轨推理 / MinIO / 弃用 Unity

## 1. 项目背景与目标

面向电力巡检场景，搭建一套基于三维激光点云的业务系统，核心业务包括：

- 点云分类与三维数字走廊可视化
- 导线/绝缘子工况计算（DL/T 5582-2020，含风偏、弧垂、净空校验）
- 无人机航迹规划（一键航点、拍照点命名、导则校验、机型匹配、导出）
- 树障分析（净空/隐患双标准、工况与倒伏模拟、测绘、报告）
- 标注修正闭环（用户修正 → 训练集 → 模型迭代）

交付形态：**Web 为主**，内网单机 Docker Compose 起步，架构保留云化与多租户扩展能力。

## 2. 已确认决策（2026-08-11）

| 决策点 | 选择 | 说明 |
|---|---|---|
| 产品形态 | Web 化 | 前端 React + TS + Potree，基于 OTA 仓库现有基座 |
| MVP 优先 | 点云分类 + 三维走廊 + 工况计算 | 最快形成可演示闭环 |
| 部署方式 | 内网单机 Docker | MinIO + PostgreSQL + Redis/Celery 同机部署 |
| 推理路线 | 双轨 | 先跑现有 Python 几何管线，KPConv/Triton 预留 |
| 对象存储 | MinIO | 预留阿里云 OSS 切换能力 |
| 离线编辑 | 弃用 Unity | CloudCompare 外部工具链（MVP）+ Tauri 本地模式（后期） |
| 后端 | FastAPI + Celery + Redis | 替代现有 Express 业务层 |
| 数据库 | PostgreSQL | 工程/任务/标注/报告元数据 |
| UI 基调 | 苹果半透毛玻璃风格 | 详见 §7 |

## 3. 资产盘点与迁移策略

| 资产 | 位置 | 处置 |
|---|---|---|
| Unity 航迹/树障原型 | `E:\unity\3dTrack`、`3DTrackPlan_new` | 归档参考；抽取参数与算法 |
| Python 四阶段分类管线 | `E:\unity\Plans\Points` | 服务化进 Celery worker，与 PDAL 并行对照 |
| Web 工况+点云走廊 | OTA 仓库（`E:\unity\Plans\OTA`） | 前端基座；工况计算引擎原样保留 |
| 真实 LAS 数据 | `E:\unity\点云` | 测试/验收数据，不纳入 git |
| ONNX 分割模型记忆 | CC `las-segmentation-unity-onnx` | 作为域偏移教训与后续模型参考 |

### 3.1 从 Unity 抽取清单（M0 执行）

- 机型库 `uav.temp`（7 款机型 + 镜头参数）
- 安全距离表 `OTASetting.json`（35kV~1000kV）
- 导线库 `WireSetting.json`、气象/导则 `guidelines.json`
- 塔型模板与部件标注逻辑（TowerKmlLoader / TowerPlanManager / InsulatorSign）
- 航点生成与导则校验算法（RouteGroupManager / GuidelineVerification）
- KMZ/KML/Excel 导出逻辑（KMLExporter / ProjectExporter）
- Aspose 报告逻辑 → 后端 python-docx / openpyxl 重写

## 4. 系统架构

```
┌────────────────────────────────────────────────────────────┐
│ 浏览器前端（OTA 仓库演进）                                   │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│ │ Potree 渲染    │ │ 交互工具面板   │ │ Wasm 几何引擎(后置)    │ │
│ │ 点云可视化      │ │ 框选/笔刷/标注 │ │ 局部 RANSAC 等        │ │
│ └──────┬───────┘ └──────┬───────┘ └─────────┬────────────┘ │
│        │                │                   │              │
│        └────────────────┼───────────────────┘              │
│                    ┌────┴─────┐                            │
│                    │ Zustand  │                            │
│                    │ 状态管理   │                            │
│                    └────┬─────┘                            │
└─────────────────────────┼──────────────────────────────────┘
                          │ HTTP / WebSocket
┌─────────────────────────┼──────────────────────────────────┐
│ 服务器后端（新建/迁移）     │                                  │
│ ┌────────────────────────┴───────────────────────────────┐ │
│ │ FastAPI REST + WebSocket（替代 Express）                 │ │
│ └───────┬───────────────────────────────┬────────────────┘ │
│ ┌───────┴───────┐               ┌───────┴───────┐          │
│ │ Celery 任务队列 │               │ Triton Server  │          │
│ │ 异步大数据处理   │               │ (KPConv, 预留)  │          │
│ └───────┬───────┘               └───────┬───────┘          │
│ ┌───────┴───────────────────────────────┴───────┐          │
│ │ PDAL 管线 + 几何分类管线 + 点云存储(MinIO)        │          │
│ └───────────────────────────────────────────────┘          │
└────────────────────────────────────────────────────────────┘
```

## 5. 核心数据流

```
上传 LAS → 前端解析文件头 → 分块上传 MinIO
                                        │
后端异步任务 ← ← ← ← ← ← ← ← ← ← ← ← ┘
  ├─ PDAL：去噪 + 地面滤波 + 归一化
  ├─ 推理：几何管线(MVP) → KPConv/Triton(正式)
  ├─ 后处理：连通分量 + 杆塔定位 + 导线矢量化
  └─ 存储：PostgreSQL + LAS 分类属性写回
                    │
WebSocket 通知 → Potree 加载着色 → 用户浏览/标注
                    │
修正请求回传 → 标注库 → 训练集导出 → 模型迭代
```

## 6. 模块设计

### 6.1 数据接入与预处理

- LAS/LAZ 头解析（前端预览）、分块上传、断点续传
- PDAL 管线：去噪、地面滤波、归一化（与现有 Python `ground_separator` 对照验证）
- 任务状态机：pending → preprocessing → inference → postprocess → done/failed，全程 WebSocket 进度推送

### 6.2 点云分类

- MVP：现有四阶段几何管线（地面/杆塔/导线/植被 + 拓扑校验），评估器对标 LAS 2/14/15/16
- 正式：KPConv 逐点分类（Triton 推理），训练数据来自标注闭环（真实数据，避免合成色域偏移）
- 分类结果双写：PostgreSQL 属性表 + LAS classification 字段

### 6.3 后处理与矢量化

- 连通分量分析、杆塔中心/方向估计、绝缘子串精化
- 导线矢量化（PCA + 悬链线拟合），输出导线 id/挂点/弧垂参数

### 6.4 走廊可视化

- Potree 分类着色（ASPRS 标准配色）、多文件加载、剖面/量测工具
- 叠加杆塔模型、导线曲线、工况标注

### 6.5 工况计算（复用 OTA 计算引擎）

- DL/T 5582-2020：导线比载、状态方程、应力/弧垂/风偏、绝缘子串校验
- 与导线矢量化联动：自动取档距、高差、交跨净空

### 6.6 航迹规划

- 塔型模板库（从 Unity 抽取）、一键航点生成、拍照点命名规范
- 安全距离/俯仰角参数、导则校验（guidelines.json 迁移）
- 机型库与镜头模拟（uav.temp 迁移）、KMZ/KML/Excel 导出

### 6.7 树障分析

- 净空/隐患双标准（35kV~1000kV 阈值来自 OTASetting.json）
- 工况模拟（温度/风速/覆冰）、边坡树木倒伏、热力图
- 测绘：线树距离、对地、面积、交跨、单点
- 报告：Word/Excel 一键导出，模板可定制

### 6.8 标注闭环

- 框选/笔刷工具（先 TS 实现，Wasm 后置）
- 修正结果写 PostgreSQL，支持导出训练集（patch + label + meta）
- 为 KPConv 训练与几何管线回归测试提供数据

### 6.9 业务平台

- 工程/线路/任务管理、用户与权限、操作审计
- AI 助手（复用现有 Gemini 接口思路，统一走 FastAPI）

## 7. Web 端 UI 设计基调

产品 UI 参考苹果半透明毛玻璃（Glassmorphism）风格，作为全局视觉基线：

| 维度 | 规范 |
|---|---|
| 毛玻璃 | 面板背景 rgba(255,255,255,0.55~0.72)（暗色 rgba(20,20,24,0.55~0.7)）+ backdrop-filter: blur(18-28px) saturate(160%) |
| 描边与高光 | 1px 半透明白色描边 + 顶部内高光，模拟玻璃边缘 |
| 圆角与阴影 | 大圆角 12-16px，柔和多层阴影（如 0 8px 32px rgba(0,0,0,0.12)） |
| 层次 | 导航/侧栏/工具面板/弹窗分层悬浮，点云画布为底层内容 |
| 字体 | Noto Sans SC + 等宽数字（沿用 JetBrains Mono），用字重/字号/透明度区分层级 |
| 色彩 | 中性浅灰底（沿用 #E4E3E0 系），强调色克制使用（蓝/绿） |
| 动效 | motion 库 150-250ms ease-out，面板出现/切换轻量过渡 |
| 深浅色 | 支持亮/暗模式自适应（暗色下毛玻璃效果更明显） |

性能约束：

- 毛玻璃只用于浮层/面板，**不用于 Potree 点云画布内部**；
- 大面积 backdrop-filter 会触发 GPU 合成层，面板数量与模糊半径需做性能预算；
- 点云高频交互区（框选、刷选）保持纯色半透明遮罩，避免 blur 拖慢帧率。

## 8. 数据模型（PostgreSQL 概览）

| 表 | 关键字段 | 用途 |
|---|---|---|
| projects | id, name, region, status | 工程 |
| lines | id, project_id, voltage, name | 线路 |
| tasks | id, line_id, type, status, progress | 异步任务 |
| las_files | id, task_id, minio_key, size, crs, classification_version | 点云文件 |
| towers | id, line_id, name, lat/lon, height, type | 杆塔 |
| conductors | id, tower_a, tower_b, sag, vector_meta | 导线矢量化 |
| waypoints | id, route_id, name, lat/lon/alt, pitch, camera | 航点 |
| reports | id, line_id, type, file_key, generated_at | 报告 |
| annotations | id, las_file_id, user_id, label, bbox, points | 标注修正 |
| users / roles | — | 权限 |

## 9. API 与事件概览

- `POST /api/files`（分块上传）、`GET /api/files/{id}/status`
- `POST /api/tasks`（分类/后处理/航迹/树障）、`WS /ws/tasks/{id}`（进度）
- `GET /api/lines/{id}/towers|conductors|waypoints`
- `POST /api/annotations`、`GET /api/annotations/export`
- `GET /api/reports/{id}/download`
- `POST /api/ai-assist`（迁移自现有 Express）

## 10. 仓库结构（monorepo）

```
OTA/
├── frontend/    # React + Vite + TS + Potree + Zustand（现有 src 迁入）
├── backend/     # FastAPI + Celery workers + PDAL 管线 + 几何分类
├── wasm/        # 几何引擎（先 TS，后 Rust/Wasm）
├── deploy/      # docker-compose.yml、Dockerfile、.env 模板
├── data/        # MinIO 卷、PostgreSQL、Redis（gitignore）
├── docs/        # 设计、验收、报告模板
└── PLAN.md
```

## 11. 里程碑与验收

| 阶段 | 内容 | 周期 | 验收 |
|---|---|---|---|
| M0 | monorepo 重组、Unity 参数抽取、真实数据 benchmark | 1-2 周 | 一条 220kV 线路：分类 LAS + 精度/耗时/内存报告 |
| M1 | 上传→Celery→PDAL→分类→后处理→PG+LAS→WS→Potree | 3-4 周 | 2GB LAS 上传到浏览器可见分类结果 |
| M2 | 框选/笔刷、RANSAC、标注回传、训练集导出 | 2-3 周 | 标注 2 条线路可导出训练集 |
| M3 | 导线矢量化→工况计算联动、交跨净空 | 2-3 周 | 一条线路自动出工况曲线与净空校验 |
| M4 | 航迹规划：模板/一键生成/校验/机型/导出 | 4-6 周 | 110kV 线路一键生成航线并通过导则校验 |
| M5 | 树障分析：双标准/工况/倒伏/测绘/报告 | 4-6 周 | 220kV 线路输出净空危险+隐患点报告 |
| M6 | 平台化：工程/任务/用户/权限/审计/AI | 4-6 周 | 内网部署，完整业务闭环 |

单人估算 5-7 个月；M0-M3 约 2 个月可交付首个可演示版本。

## 12. 风险与对策

| 风险 | 对策 |
|---|---|
| Web 端大点云性能 | Potree 服务端切片在 M1 先行验证；对照 CC 性能矩阵与硬件规格 |
| 分类模型域偏移 | M0 真实数据基准；几何管线兜底；标注闭环积累真实数据 |
| Unity 资产迁移遗漏 | M0 输出抽取清单，逐项核对（配置/算法/导出/报告） |
| 数据合规 | 内网部署、MinIO 本地、不上云；客户数据不出域 |
| 单机资源（磁盘/内存） | 数据盘独立；LAS 按线路切片；任务队列限流 |
| 毛玻璃 UI 性能 | 模糊只用于浮层；点云画布内禁用；面板数量与模糊半径做性能预算 |

## 13. 下一步

1. 用户评审本设计（PLAN.md）
2. 评审通过后：用 writing-plans 技能产出 M0-M1 实施计划
3. M0 开工：monorepo 重组 + 抽取清单 + benchmark
