// 验证滚动后加载出的帖子，token 能否正常进详情
// 挑的是 round 3 才出现的两篇（首屏不可见）
const SPACE = "weekend-planner";

// 从 dump 文件里读 round 3 才出现的帖子
const fs = await import("node:fs/promises");
const dumpDir = "C:/Users/asta1/ai-project/weekend-planner/data/search";
const files = (await fs.readdir(dumpDir)).filter((f) => f.startsWith("test-scroll-")).sort();
const latest = JSON.parse(await fs.readFile(`${dumpDir}/${files[files.length - 1]}`, "utf8"));

// 首屏 20 条的 id（从 search.mjs 写死的 + round 0 sample 已知 6aed... 是 round 0 的，但简化处理：直接拿 dump 的后 20 条 = round 3 新增）
const tail = latest.items.slice(-20);
const targets = tail.slice(0, 2).map((x) => ({ id: x.id, token: x.token, title: x.title }));

console.log("targets:", JSON.stringify(targets, null, 1));

const task = await taskSpace(SPACE);
const page = task.page("p1");

const results = [];
for (const t of targets) {
  const url = `https://www.xiaohongshu.com/search_result/${t.id}?xsec_token=${encodeURIComponent(t.token)}&xsec_source=`;
  await page.goto(url, { timeout: 30000 }).catch(() => {});
  await page.waitForLoadState("load", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const detail = await page.evaluate(() => {
    const unwrap = (v) => (v && typeof v === "object" && "_value" in v) ? v._value : v;
    if (location.pathname.includes("404")) return { is404: true, url: location.href.slice(0, 90) };
    const mapRaw = unwrap(window.__INITIAL_STATE__?.note?.noteDetailMap);
    const first = mapRaw ? Object.values(mapRaw)[0] : null;
    const nc = unwrap(first?.note);
    return {
      is404: false,
      title: nc?.title ?? document.title,
      liked: nc?.interactInfo?.likedCount ?? null,
      author: nc?.user?.nickname ?? null,
      imageCount: (nc?.imageList ?? []).length,
      descLen: (nc?.desc ?? "").length,
    };
  });
  results.push({ id: t.id, title_expect: t.title, ...detail });
  await page.waitForTimeout(2000 + Math.floor(Math.random() * 1500));
}
console.log(JSON.stringify(results, null, 1));
