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
├── scripts/          # ego-browser nodejs 脚本（搜索 / 详情 / token 提取 / 图片下载）
├── data/
│   ├── history/      # 推荐历史（JSONL，每次推荐一行，记录"推过什么"）
│   ├── visited.jsonl # 实际去过的地方（JSONL，一行一个地点，记录"真去过什么"）
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
# 1. 查周末天气（自动判断筛选等级；失败降级为不筛选）
node scripts/weather.mjs

# 2. 搜索（改脚本里的关键词后运行）
ego-browser nodejs < scripts/search.mjs

# 3. 进详情 + 下载图片（改脚本里的 targets：id/tag/token）
ego-browser nodejs < scripts/detail.mjs

# 4. 筛选 + 汇总推荐：结合天气等级、preferences.json 的 likes/dislikes、visited.jsonl（去过）、history（推过）
#    推荐开头必须给出天气结论与筛选理由

# 5. 记录历史：把入选笔记写入 data/history/YYYY-MM-DD.jsonl（含 weather 字段快照）

# 6. 推荐后向用户要一句反馈，提炼进 data/preferences.json（回显确认后写入）
```

脚本里任务空间 id（当前是 `takeOverTaskSpace(2)`）依赖 ego lite 当前会话，运行前按需调整。

## 天气筛选规则

数据源 [wttr.in](https://wttr.in/)（免费、无注册），取广州本周六/日午后时段：

| 条件 | 动作 |
|---|---|
| 降水 ≥60% 或雷雨 | `block`：排除户外主题（徒步/爬山/露营/赏花/公园） |
| 降水 30%~60% | `caution`：户外降权并附注"可能阵雨带伞" |
| 最高温 ≥35℃ | `caution`：避免正午长时间户外，保留树荫/水边路线 |
| 天气获取失败 | 降级：不筛选，推荐注明"天气获取失败，未做筛选" |

## 已去记录（data/visited.jsonl）

用户说"这个地方去过了"时写这里，一行一个地点，只记事实不记评价：

| 字段 | 说明 |
|---|---|
| `place` / `area` | 地点名 / 所在区域 |
| `scope` | 精确到去过哪部分（如 `5F 展厅`）；没到过的楼层不算 |
| `visited_at` / `precision` | 去的月份（`precision:"month"` 表示只精确到月） |
| `source` / `reported_at` | 来源（`user_feedback`）/ 用户哪天说的 |
| `note` | 去重时的口径（如"5F 避开，其他楼层新展仍可考虑"） |

推荐时先过一遍：命中 `place` 且 `scope` 覆盖本次主题的直接排除，只命中楼层的只排除对应楼层。
`related_note_id` 指回出处笔记；history 里被这条记录否掉的推荐会标 `visited_hit`。

## 位置与距离（data/profile.json + scripts/distance.mjs）

`data/profile.json` 的 `home` 存当前出发点（默认白云区，坐标=白云区中心三元里一带）。用户说"我在 X 区/X 街道"时改这里。

```bash
# 算一批候选地点的距离
node scripts/distance.mjs "时尚天河" "云幕剧场" "悦方城"

# 或从 JSON 文件读
node scripts/distance.mjs --places-file data/candidates.json

# 结构化输出（供推荐流程消费）
node scripts/distance.mjs --json
```

数据源优先级：本地锚点表（校准过的场馆坐标）→ Photon (OSM) 在线 geocoding（带磁盘缓存 `data/geocache.json`）→ 按区域粗距离（`DISTRICT_KM`）。距离是直线距离（Haversine），只用于粗排序，不等于通勤时间。

距离档位（profile.json `distance.bands` 可调）：

| 档位 | 范围 | 动作 |
|---|---|---|
| `near` | ≤8km | 加权重 |
| `mid` | 8~18km | 正常 |
| `far` | 18~30km | 降权 |
| `very_far` | >30km | 附注"很远"（如南沙 45km+） |

推荐汇总时把 `--json` 输出和天气、visited、history 一起喂给排序逻辑：天气 level=block 的户外主题先排除，再按距离 band 调整排序。

## 偏好记录（data/preferences.json）

```json
{
  "likes": ["命中的主题会在推荐中排前"],
  "dislikes": ["命中的主题降权或附注提醒"],
  "notes": "自由文本约束（如：对象怕晒、喜欢有咖啡歇脚的路线）",
  "updated_at": "最后更新时间"
}
```

- 冷启动为空，靠热度+主题互补兜底；每次推荐后收集一句反馈提炼写入。
- 逐地点的主观评价不写这里——直接从 history + 反馈推导，避免两处维护同一份事实。

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
  `date / city / keyword / source / notes[]（note_id, title, author, liked, collected, url, places[], theme, images[]）/ weather{sat, sun, filter_applied} / picked_reason`
- 图片命名：`{主题tag}-{序号}.webp`，目录 `data/images/{城市}-{YYYYMMDD}/`
- 推荐时先读历史，避免推荐去过/推过的地方。
