// Round 2: 读 data/search/ 最新搜索结果，按 liked 降序挑前 N 篇进详情 + 下载图片
// 用法: ego-browser nodejs < scripts/detail.mjs
// - 从 search.mjs 落盘的 JSON 自动取 targets，不再手工抄 id/token
// - 跳过 history 里已抓过的 note_id
// - 遵守 README 红线：单次 ≤5 篇详情，篇间随机间隔

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SPACE = "weekend-planner";
const CITY = "gz";
const TOP_N = 5;                                 // README 红线：单次 ≤5 篇
const BASE_DIR = `C:/Users/asta1/ai-project/weekend-planner/data/images/${CITY}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
const ROOT = "C:/Users/asta1/ai-project/weekend-planner";
const SEARCH_DIR = path.join(ROOT, "data/search");
const HISTORY_DIR = path.join(ROOT, "data/history");
const DETAIL_WAIT_MIN = 3000;
const DETAIL_WAIT_MAX = 5500;

// 把 "1.2万" / "123" / "" 转成数字方便排序
const parseLiked = (s) => {
  if (!s) return 0;
  const t = String(s).trim();
  if (t.endsWith("万")) return Math.round(parseFloat(t) * 10000) || 0;
  const n = parseInt(t.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
};

// 读 history 下所有 jsonl，收集已抓过的 note_id（用于跳过）
async function loadSeenNoteIds() {
  const seen = new Set();
  try {
    const files = (await readdir(HISTORY_DIR)).filter((f) => f.endsWith(".jsonl"));
    for (const f of files) {
      const txt = await readFile(path.join(HISTORY_DIR, f), "utf8").catch(() => "");
      for (const line of txt.split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          const r = JSON.parse(line);
          for (const n of r.notes || []) if (n.note_id) seen.add(n.note_id);
        } catch {}
      }
    }
  } catch {}
  return seen;
}

// 取 data/search/ 里最新一份对应城市的 JSON
async function loadLatestSearch() {
  const files = (await readdir(SEARCH_DIR)).filter((f) => f.startsWith(`${CITY}-`) && f.endsWith(".json")).sort();
  if (!files.length) throw new Error(`no search dump found in ${SEARCH_DIR} for city=${CITY}, run search.mjs first`);
  const file = files[files.length - 1];
  const data = JSON.parse(await readFile(path.join(SEARCH_DIR, file), "utf8"));
  return { file, data };
}

const seenIds = await loadSeenNoteIds();
const { file: searchFile, data: searchData } = await loadLatestSearch();

const candidates = searchData.items
  .filter((x) => x.token && !seenIds.has(x.id))
  .sort((a, b) => parseLiked(b.liked) - parseLiked(a.liked))
  .slice(0, TOP_N);

if (!candidates.length) {
  console.log(JSON.stringify({ msg: "no new candidates", searchFile, total: searchData.total, seenCount: seenIds.size }));
  throw new Error("NO_CANDIDATES");
}

const task = await taskSpace(SPACE);
const page = task.page("p1");
await mkdir(BASE_DIR, { recursive: true });

const results = [];

for (const t of candidates) {
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
    results.push({ id: t.id, is404: true });
    continue;
  }

  // 用搜索阶段的标题前 20 字做 tag 基础，slug 化
  const tagBase = (t.title || t.id).replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 24) || t.id;
  const saved = [];
  for (let i = 0; i < Math.min(3, detail.imgs.length); i++) {
    try {
      const p = `${BASE_DIR}/${tagBase}-${i + 1}.webp`;
      const r = await page.fetch(detail.imgs[i], { saveAs: p, timeout: 20000 });
      saved.push(r.ok ? p : "HTTP" + r.status);
    } catch (e) {
      saved.push("FAIL:" + String(e).slice(0, 50));
    }
  }

  results.push({
    id: t.id,
    tag: tagBase,
    search_liked: t.liked,
    ...detail,
    imgs: detail.imgs.length,
    desc: detail.desc ? detail.desc.slice(0, 900) : null,
    savedImages: saved,
  });

  const wait = DETAIL_WAIT_MIN + Math.floor(Math.random() * (DETAIL_WAIT_MAX - DETAIL_WAIT_MIN));
  await page.waitForTimeout(wait);
}

// 把本次详情结果落盘，方便后续推荐链路消费
const dateStr = new Date().toISOString().slice(0, 10);
const outFile = path.join(SEARCH_DIR, `${CITY}-${dateStr}-detail.json`);
await writeFile(outFile, JSON.stringify({ searchFile, picked: results.length, results }, null, 1));

console.log(JSON.stringify({ searchFile, picked: results.length, outFile, results }, null, 1));
