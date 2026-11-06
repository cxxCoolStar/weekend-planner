// Round 1: 搜索小红书，滚动加载后提取笔记列表（含 xsec_token），落盘到 data/search/
// 用法: ego-browser nodejs < scripts/search.mjs
// 每次只改一个关键词，低频拟人化（见 README 已知坑）。

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SPACE = "weekend-planner";
const KEYWORD = "广州周末 室内 展览 市集";
const CITY = "gz";
const SCROLL_TIMES = 2;          // 滚动 2 次：首屏 20 → 累计 60 条左右
const SCROLL_WAIT_MIN = 2200;
const SCROLL_WAIT_MAX = 3400;

const ROOT = "C:/Users/asta1/ai-project/weekend-planner";
const OUT_DIR = path.join(ROOT, "data/search");

const task = await taskSpace(SPACE);
const page = task.page("p1");

await page.goto(
  "https://www.xiaohongshu.com/search_result?keyword=" + encodeURIComponent(KEYWORD),
  { timeout: 30000 },
).catch(() => {});
await page.waitForLoadState("load", { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(2500);

// 在页面上下文里定义抽取函数：anchor href + __INITIAL_STATE__.search 双源抽 token
const EXTRACT = `(() => {
  const unwrap = (v) => (v && typeof v === "object" && "_value" in v) ? v._value : v;
  const out = new Map();

  for (const a of document.querySelectorAll('a[href*="/search_result/"], a[href*="/explore/"]')) {
    const href = a.getAttribute("href") || "";
    const m = href.match(/\\/(?:search_result|explore)\\/([0-9a-f]{24})/);
    if (!m) continue;
    const tok = (href.match(/xsec_token=([^&]+)/) || [])[1] || null;
    const sec = a.closest("section");
    const title = sec?.querySelector(".title")?.textContent?.trim()
      || a.querySelector(".title")?.textContent?.trim() || "";
    const author = sec?.querySelector(".author .name")?.textContent?.trim()
      || sec?.querySelector(".name")?.textContent?.trim() || "";
    const liked = sec?.querySelector(".like-wrapper .count")?.textContent?.trim()
      || sec?.querySelector(".count")?.textContent?.trim() || "";
    const cover = sec?.querySelector("img")?.src || "";
    const prev = out.get(m[1]) || {};
    out.set(m[1], {
      ...prev,
      id: m[1],
      href,
      token: prev.token || tok,
      title: prev.title || title,
      author: prev.author || author,
      liked: prev.liked || liked,
      cover: prev.cover || cover,
    });
  }

  const state = unwrap(window.__INITIAL_STATE__) || {};
  const collect = (obj, depth = 0) => {
    if (!obj || depth > 5) return;
    if (Array.isArray(obj)) { obj.forEach((x) => collect(x, depth + 1)); return; }
    if (typeof obj !== "object") return;
    if (obj.id && obj.xsecToken && /^[0-9a-f]{24}$/.test(obj.id)) {
      const prev = out.get(obj.id) || {};
      out.set(obj.id, { ...prev, id: obj.id, token: prev.token || obj.xsecToken });
    }
    for (const v of Object.values(obj)) collect(v, depth + 1);
  };
  collect(unwrap(state.search));

  return [...out.values()];
})()`;

// 首屏抽一次，再滚动 SCROLL_TIMES 次，每次都重新抽（滚动新增的卡片 token 也当场拿）
const seen = new Map();
const recordRound = async (round) => {
  const items = await page.evaluate(EXTRACT);
  let added = 0;
  for (const it of items) {
    if (!seen.has(it.id)) { seen.set(it.id, it); added++; }
    else if (it.token && !seen.get(it.id).token) { seen.get(it.id).token = it.token; }
  }
  return { round, total: seen.size, added };
};

const rounds = [await recordRound(0)];
for (let i = 0; i < SCROLL_TIMES; i++) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const wait = SCROLL_WAIT_MIN + Math.floor(Math.random() * (SCROLL_WAIT_MAX - SCROLL_WAIT_MIN));
  await page.waitForTimeout(wait);
  rounds.push(await recordRound(i + 1));
}

const items = [...seen.values()];
const dateStr = new Date().toISOString().slice(0, 10);
await mkdir(OUT_DIR, { recursive: true });
const outFile = path.join(OUT_DIR, `${CITY}-${dateStr}.json`);
await writeFile(outFile, JSON.stringify({
  keyword: KEYWORD,
  city: CITY,
  date: dateStr,
  total: items.length,
  withToken: items.filter((x) => x.token).length,
  rounds,
  items,
}, null, 1));

console.log(JSON.stringify({ spaceId: task.spaceId, keyword: KEYWORD, rounds, total: items.length, withToken: items.filter((x) => x.token).length, outFile }, null, 1));
