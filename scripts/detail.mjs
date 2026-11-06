// Round 2: 用带 xsec_token 的 /search_result/ 链接进详情，提取正文+图片并下载
// 用法: ego-browser nodejs < scripts/detail.mjs
// targets 的 token 来自 Round1 搜索页实时提取（每篇笔记 token 与搜索会话绑定，会过期）

const SPACE = "weekend-planner";
const BASE_DIR = "C:/Users/asta1/ai-project/weekend-planner/data/images/gz-20261107";

const targets = [
  {
    id: "6aed5f090000000024031048",
    tag: "nienie-fair",
    token: "ABYs1cyUlrv6oTP8cRxF1oUPnpUzJk9pOyqfvtM8pSerU=",
  },
  {
    id: "6aeb40160000000015022b8d",
    tag: "week-events",
    token: "ABwW2EiovGyLfUOWKKtYrW5XXRbpr4N_evNGrsPHirQ3I=",
  },
  {
    id: "6ae082130000000036012a8f",
    tag: "markets-nov",
    token: "ABFhszOFxc--t_Eiw29k-iNwzN2XyqdY7t6mdfWAZ7rVQ=",
  },
];

const { mkdir } = await import("node:fs/promises");
const task = await taskSpace(SPACE);
const page = task.page("p1");

await mkdir(BASE_DIR, { recursive: true });

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
    const domImgs = [...document.querySelectorAll('img[src*="sns-webpic"]')].map((i) => i.src);
    const imgList = (nc?.imageList ?? []).map((im) => im.urlDefault || im.urlPre || im.infoList?.[0]?.url).filter(Boolean);
    const tagEls = [...document.querySelectorAll("a.tag, .note-content a")]
      .map((x) => x.textContent?.trim()).filter((x) => x && x.startsWith("#"));
    const domDesc = document.querySelector("#detail-desc, .note-content .desc, .desc")?.textContent?.trim();
    return {
      is404: false,
      url: location.href.slice(0, 80),
      title: nc?.title ?? document.title,
      desc: nc?.desc ?? domDesc ?? null,
      liked: nc?.interactInfo?.likedCount ?? null,
      collected: nc?.interactInfo?.collectedCount ?? null,
      author: nc?.user?.nickname ?? null,
      imageCount: (nc?.imageList ?? []).length,
      imgs: [...new Set([...imgList, ...domImgs])].slice(0, 6),
      tags: [...new Set(tagEls)].slice(0, 10),
    };
  });

  if (detail.is404) {
    results.push({ id: t.id, tag: t.tag, is404: true });
    continue;
  }

  const saved = [];
  for (let i = 0; i < Math.min(3, detail.imgs.length); i++) {
    try {
      const path = `${BASE_DIR}/${t.tag}-${i + 1}.webp`;
      const r = await page.fetch(detail.imgs[i], { saveAs: path, timeout: 20000 });
      saved.push(r.ok ? path : "HTTP" + r.status);
    } catch (e) {
      saved.push("FAIL:" + String(e).slice(0, 50));
    }
  }

  results.push({
    id: t.id,
    tag: t.tag,
    ...detail,
    imgs: detail.imgs.length,
    desc: detail.desc ? detail.desc.slice(0, 900) : null,
    savedImages: saved,
  });
}

console.log(JSON.stringify(results, null, 1));
