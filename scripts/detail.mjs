// Round 2b: 用带 xsec_token 的 /search_result/ 链接 goto 进详情，提取正文+图片并下载
import { mkdir } from "node:fs/promises";

const task = await takeOverTaskSpace(2);
const page = task.page("p1");

// token 来自 Round1 搜索页的实时提取（每篇笔记的 token 与搜索会话绑定）
const targets = [
  {
    id: "6acedc820000000001009ea6",
    tag: "qiurijingse",
    token: "ABTNE0We937nybKmyJ8W9wxyysw5wGhv-y3N-1cs28Ano=",
  },
  {
    id: "6ad8a7e0000000002c01ff89",
    tag: "citywalk",
    token: "ABwzn58ubvWtR_KkUgJmuQUxUAV9r8wtOVwVSVkcHAIfk=",
  },
  {
    id: "6ae5ac2b000000001202de0e",
    tag: "tubu",
    token: "ABgk9aBNhVRzq6Mc2VsP8QkOI2nWIYyb_dJwuG788IwNk=",
  },
];

const baseDir = "C:/Users/asta1/ego-shots/xhs-weekend/gz-20261106";
await mkdir(baseDir, { recursive: true });

const results = [];

for (const t of targets) {
  const url = `https://www.xiaohongshu.com/search_result/${t.id}?xsec_token=${encodeURIComponent(t.token)}&xsec_source=`;
  await page.goto(url, { timeout: 30000 }).catch(() => {});
  await page.waitForLoadState("load", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const detail = await page.evaluate(() => {
    const unwrap = (v) => (v && typeof v === "object" && "_value" in v) ? v._value : v;
    const is404 = location.pathname.includes("404");
    if (is404) return { is404, url: location.href.slice(0, 90) };
    const mapRaw = unwrap(window.__INITIAL_STATE__?.note?.noteDetailMap);
    const first = mapRaw ? Object.values(mapRaw)[0] : null;
    const nc = unwrap(first?.note);
    const domImgs = [
      ...document.querySelectorAll('img[src*="sns-webpic"]'),
    ].map((i) => i.src);
    const tagEls = [...document.querySelectorAll("a.tag, .note-content a")].map((x) => x.textContent?.trim()).filter((x) => x && x.startsWith("#"));
    return {
      is404: false,
      url: location.href.slice(0, 80),
      title: nc?.title ?? null,
      desc: nc?.desc ?? null,
      liked: nc?.interactInfo?.likedCount ?? null,
      collected: nc?.interactInfo?.collectedCount ?? null,
      author: nc?.user?.nickname ?? null,
      imageCount: (nc?.imageList ?? []).length,
      domImgs: domImgs.slice(0, 8),
      tags: [...new Set(tagEls)].slice(0, 10),
    };
  });

  if (detail.is404) {
    results.push({ id: t.id, tag: t.tag, is404: true });
    continue;
  }

  // 下载前 3 张图（去重）
  const saved = [];
  const uniq = [...new Set(detail.domImgs)];
  for (let i = 0; i < Math.min(3, uniq.length); i++) {
    try {
      const path = `${baseDir}/${t.tag}-${i + 1}.webp`;
      const r = await page.fetch(uniq[i], { saveAs: path, timeout: 20000 });
      if (r.ok) saved.push(path);
      else saved.push("HTTP" + r.status);
    } catch (e) {
      saved.push("FAIL:" + String(e).slice(0, 50));
    }
  }

  results.push({
    id: t.id,
    tag: t.tag,
    ...detail,
    desc: detail.desc ? detail.desc.slice(0, 500) : null,
    savedImages: saved,
  });
}

console.log(JSON.stringify(results, null, 1));
