// Round 1: 搜索广州周末内容，提取笔记列表
// 用法: ego-browser nodejs < scripts/search.mjs
// 每次只改一个关键词，低频拟人化（见 README 已知坑）。

const SPACE = "weekend-planner";
const KEYWORD = "广州周末 室内 展览 市集";

const task = await taskSpace(SPACE);
const page = task.page("p1");

await page.goto(
  "https://www.xiaohongshu.com/search_result?keyword=" + encodeURIComponent(KEYWORD),
  { timeout: 30000 },
).catch(() => {});
await page.waitForLoadState("load", { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(2500);

const data = await page.evaluate((kw) => {
  const is404 = location.pathname.includes("404");
  const sections = [...document.querySelectorAll("section")];
  const items = [];
  for (const sec of sections) {
    const a = sec.querySelector('a[href*="/search_result/"], a[href*="/explore/"]');
    if (!a) continue;
    const href = a.getAttribute("href") || "";
    const idm = href.match(/\/(?:search_result|explore)\/([0-9a-f]{24})/);
    if (!idm) continue;
    if (items.find((x) => x.id === idm[1])) continue;
    const title =
      sec.querySelector(".title")?.textContent?.trim() ||
      a.querySelector(".title")?.textContent?.trim() ||
      "";
    const author =
      sec.querySelector(".author .name")?.textContent?.trim() ||
      sec.querySelector(".name")?.textContent?.trim() ||
      "";
    const liked =
      sec.querySelector(".like-wrapper .count")?.textContent?.trim() ||
      sec.querySelector(".count")?.textContent?.trim() ||
      "";
    const cover = sec.querySelector("img")?.src || "";
    items.push({ id: idm[1], href, title, author, liked, cover });
  }
  return { is404, keyword: kw, url: location.href.slice(0, 120), count: items.length, items };
}, KEYWORD);

console.log(JSON.stringify({ spaceId: task.spaceId, ...data }, null, 1));
