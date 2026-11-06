// Round 1: 搜索"广州周末去哪玩"，提取笔记列表
const task = await takeOverTaskSpace(2);
const page = task.page("p1");

await page.goto(
  "https://www.xiaohongshu.com/search_result?keyword=" +
  encodeURIComponent("广州周末去哪玩"),
  { timeout: 30000 },
).catch(() => {});
await page.waitForLoadState("load", { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(2500);

const data = await page.evaluate(() => {
  const unwrap = (v) => (v && typeof v === "object" && "_value" in v) ? v._value : v;
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
    items.push({
      id: idm[1],
      href,
      title,
      author,
      liked,
      cover,
    });
  }
  return { is404, url: location.href.slice(0, 90), count: items.length, items };
});

console.log(JSON.stringify(data, null, 1));
