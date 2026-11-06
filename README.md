# weekend-planner

周末出游推荐助手：用 ego lite 浏览器自动化抓取小红书的周末游玩内容（徒步 / citywalk / 赏花 / 展览 / 市集），下载笔记图片，结合旅游历史记录做不重复的情侣周末推荐。

## 项目定位

- **城市**：目前只考虑广州。
- **用户**：本人 + 对象，情侣周末出游场景。
- **数据源**：小红书网页版（登录态，通过 ego lite 驱动）。
- **形态**：独立项目，不依赖 OpenDomino 架构；后续封装为 ZCode skill 供对话式调用。

## 目录结构

```
weekend-planner/
├── scripts/          # ego-browser nodejs 脚本（搜索 / 详情 / 图片下载）
├── data/
│   ├── history/      # 旅游历史记录（JSONL，每次推荐一行）
│   └── images/       # 下载的笔记图片（按 日期-城市 分目录）
└── docs/             # 使用说明与运行手册
```

## 运行前提

1. **ego lite** 已安装并完成 onboarding（Windows 安装包：https://lite.ego.app/ ）
   - `ego-browser` 命令可用（已注册到用户 PATH：`C:\Program Files\Citro Labs\ego lite\Application\0.6.2.8`）
   - 注意：0.6.2.8 的 CLI 连不上 bootstrap 时，用 0.6.1.13 版本的 exe 兜底
2. **小红书登录态**：ego lite 里的小红书已完成扫码登录（账号：星星的AI日记）
   - 登录态失效时需重新扫码（用小号，降低风控风险）

## 核心链路（已验证）

```
搜索页（DOM 提取笔记列表：标题/作者/点赞/封面/带 token 链接）
   ↓  必须用带 xsec_token 的链接进详情，直接 /explore/ URL 会被 300031 风控拦
详情页（__INITIAL_STATE__ 解包 Vue ref 取正文；或直接读 DOM）
   ↓  图片有防盗链：页面内 fetch 会被 CORS 拦
page.fetch(url, { saveAs })  走浏览器网络栈下载图片
   ↓
结果 JSON + 本地图片 → 人工/AI 汇总推荐 → 追加记录到 data/history/
```

## 使用方式（当前版本）

```bash
# 1. 搜索（改脚本里的关键词后运行）
ego-browser nodejs < scripts/search.mjs

# 2. 进详情 + 下载图片（改脚本里的 targets：id/tag/token）
ego-browser nodejs < scripts/detail.mjs

# 3. 记录历史：把入选笔记写入 data/history/YYYY-MM-DD.jsonl
```

脚本里任务空间 id（当前是 `takeOverTaskSpace(2)`）依赖 ego lite 当前会话，运行前按需调整。

## 已知坑（重要）

| 坑 | 处理 |
|---|---|
| `/explore/{id}` 直接 URL 触发 300031 风控 | 只用搜索页拿到的带 `xsec_token` 链接 |
| 搜索 API 直调缺签名返回 500 | 搜索走真实页面导航，不裸调接口 |
| 页面内 fetch 图片被 CORS 拦 | 用 `page.fetch(url, { saveAs })` |
| `__INITIAL_STATE__` 数据是 Vue ref 包装 | 读 `_value` 解包，或直接读渲染后的 DOM |
| 同账号多设备登录互踢 | 一台设备登录，别和手机 App 同时 frequent 切换 |
| 低频拟人化操作 | 每次只查 1 个关键词、进 ≤5 篇详情，别循环爬 |

## 数据规范

- 历史记录一行一条 JSON，字段见 `data/history/history-2026-11-06.jsonl` 样例：
  `date / city / keyword / source / notes[]（note_id, title, author, liked, collected, url, places[], theme, images[]）/ picked_reason`
- 图片命名：`{主题tag}-{序号}.webp`，目录 `data/images/{城市}-{YYYYMMDD}/`
- 推荐时先读历史，避免推荐去过/推过的地方。
