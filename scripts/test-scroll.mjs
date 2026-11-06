// 滚动加载测试：验证滚动后帖子数量 & token 是否可抽
// 用法: ego-browser nodejs < scripts/test-scroll.mjs

const SPACE = "weekend-planner";
const KEYWORD = "广州周末 室内 展览 市集";
const SCROLL_TIMES = 3;

const task = await taskSpace(SPACE);
const page = task.page("p1");

await page.goto(
  "https://www.xiaohongshu.com/search_result?keyword=" + encodeURIComponent(KEYWORD),
  { timeout: 30000 },
).catch(() => {});
await page.waitForLoadState("load", { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(2500);

// 抽取函数：返回当前 DOM 里所有 {id, href, token, title, liked}
const extract = `(() => {
  const unwrap = (v) => (v && typeof v === "object" && "_value" in v) ? v._value : v;
  const out = new Map();

  // anchor
  for (const a of document.querySelectorAll('a[href*="/search_result/"], a[href*="/explore/"]')) {
    const href = a.getAttribute("href") || "";
    const m = href.match(/\\/(?:search_result|explore)\\/([0-9a-f]{24})/);
    if (!m) continue;
    const tok = (href.match(/xsec_token=([^&]+)/) || [])[1] || null;
    const sec = a.closest("section");
    const title = sec?.querySelector(".title")?.textContent?.trim() || "";
    const liked = sec?.querySelector(".like-wrapper .count, .count")?.textContent?.trim() || "";
    const prev = out.get(m[1]) || {};
    out.set(m[1], { ...prev, id: m[1], href, token: prev.token || tok, title: prev.title || title, liked: prev.liked || liked });
  }

  // __INITIAL_STATE__ 里的 xsecToken
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

const rounds = [];
const seenIds = new Set();

for (let i = 0; i <= SCROLL_TIMES; i++) {
  const items = await page.evaluate(extract);
  const newItems = items.filter((x) => !seenIds.has(x.id));
  newItems.forEach((x) => seenIds.add(x.id));

  const withToken = items.filter((x) => x.token).length;
  const newWithToken = newItems.filter((x) => x.token).length;

  rounds.push({
    round: i,
    scrollY: await page.evaluate(() => window.scrollY),
    totalUnique: items.length,
    newThisRound: newItems.length,
    withToken,
    newWithToken,
    sampleNew: newItems.slice(0, 3).map((x) => ({ id: x.id, hasToken: !!x.token, title: (x.title || "").slice(0, 30), liked: x.liked })),
  });

  if (i < SCROLL_TIMES) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2200 + Math.floor(Math.random() * 1200));
  }
}

// 全部滚完后，把累计列表落盘，供 detail 阶段挑
const allItems = await page.evaluate(extract);
const fs = await import("node:fs/promises");
await fs.mkdir("C:/Users/asta1/ai-project/weekend-planner/data/search", { recursive: true });
const dumpPath = `C:/Users/asta1/ai-project/weekend-planner/data/search/test-scroll-${Date.now()}.json`;
await fs.writeFile(dumpPath, JSON.stringify({ keyword: KEYWORD, total: allItems.length, items: allItems }, null, 1));

console.log(JSON.stringify({ rounds, finalTotal: allItems.length, finalWithToken: allItems.filter((x) => x.token).length, dumpPath }, null, 1));
