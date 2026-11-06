// distance.mjs — 给候选地点算"离家白云区"的直线距离并打标签
// 用法:
//   node scripts/distance.mjs                       # 用默认候选（今天推荐过的地点）
//   node scripts/distance.mjs "时尚天河" "云幕剧场"   # 自定义地点列表
//   node scripts/distance.mjs --places-file x.json   # 从 JSON 数组读地点
//   node scripts/distance.mjs --json                 # 输出纯 JSON（供其他脚本消费）
//
// 数据源: Photon (OSM, 免费无 key) 在线 geocoding，带磁盘缓存；
//         本地 anchors 兜底小众场馆（坐标已用 Photon/公开资料校准过）；
//         最后兜底按"区域"粗距离。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PROFILE_PATH = path.join(ROOT, "data", "profile.json");
const GEOCACHE_PATH = path.join(ROOT, "data", "geocache.json");
const USER_AGENT = "weekend-planner/1.0 (local personal use)";

// ---- 本地锚点 ----
// 坐标优先取 Photon 实测值；识别不稳的小众场馆给 confidence=low 提示
const ANCHORS = [
  { aliases: ["时尚天河", "时尚天河商业广场"], lat: 23.1369, lon: 113.3195, area: "天河区·体育西路", confidence: "high" },
  { aliases: ["广东美术馆新馆", "白鹅潭广东美术馆", "白鹅潭美术馆"], lat: 23.1062, lon: 113.2367, area: "荔湾区·白鹅潭", confidence: "mid" },
  { aliases: ["云幕剧场"], lat: 23.138, lon: 113.341, area: "天河区·天河北（近广州东站）", confidence: "low" },
  { aliases: ["西城智汇park", "西城智汇", "西城智汇路演中心"], lat: 23.1996, lon: 113.3209, area: "白云区·同和", confidence: "mid" },
  { aliases: ["悦方城", "南沙悦方城"], lat: 22.8167, lon: 113.4966, area: "南沙区·黄阁", confidence: "high" },
  { aliases: ["广州文化公园", "文化公园"], lat: 23.1117, lon: 113.2445, area: "荔湾区·文化公园", confidence: "high" },
  { aliases: ["永庆坊"], lat: 23.1175, lon: 113.2329, area: "荔湾区·多宝", confidence: "high" },
  { aliases: ["MAO Livehouse 中大二号店", "MAO Livehouse", "MAO中大二号店", "MAO Livehouse 中大"], lat: 23.093, lon: 113.293, area: "海珠区·中大", confidence: "low" },
  { aliases: ["腾势MINI中心", "腾势mini中心"], lat: 23.015, lon: 113.385, area: "番禺区", confidence: "low" },
  { aliases: ["海珠匹克球", "燕岗"], lat: 23.0787, lon: 113.2660, area: "海珠区·燕岗", confidence: "mid" },
  { aliases: ["临江带状公园", "临江大道带状公园"], lat: 23.108, lon: 113.33, area: "天河区·临江大道（珠江新城段）", confidence: "mid" },
  { aliases: ["万顷沙·水岸里", "万顷沙"], lat: 22.71, lon: 113.51, area: "南沙区·万顷沙", confidence: "low" },
  { aliases: ["地王广场"], lat: 23.1287, lon: 113.2787, area: "越秀区·大东街道", confidence: "high" },
  { aliases: ["流花中心"], lat: 23.145, lon: 113.253, area: "越秀区·流花", confidence: "mid" },
  { aliases: ["北京路", "北京路步行街"], lat: 23.1216, lon: 113.2650, area: "越秀区·北京路", confidence: "high" },
  { aliases: ["小洲村", "小洲艺术村"], lat: 23.0620, lon: 113.3501, area: "海珠区·华洲街道", confidence: "high" },
  { aliases: ["琶洲牧山集", "牧山集"], lat: 23.1013, lon: 113.3622, area: "海珠区·琶洲", confidence: "mid" },
  { aliases: ["广交会展馆", "琶洲展馆"], lat: 23.104, lon: 113.354, area: "海珠区·琶洲", confidence: "high" },
  { aliases: ["保利鱼珠时光", "鱼珠时光"], lat: 23.1028, lon: 113.4268, area: "黄埔区·鱼珠", confidence: "high" },
  { aliases: ["晟潮C-WAVE", "南村万博"], lat: 23.005, lon: 113.38, area: "番禺区·南村", confidence: "low" },
];

// ---- 区域粗距离（白云区中心为原点的已知区域半径，km） ----
const DISTRICT_KM = {
  白云区: 0, 越秀区: 12, 荔湾区: 14, 海珠区: 16, 天河区: 14, 黄埔区: 22, 番禺区: 28, 南沙区: 55, 花都区: 18, 从化区: 45, 增城区: 35,
};

const ARGV = process.argv.slice(2);
const JSON_MODE = ARGV.includes("--json");
const FILE_IDX = ARGV.indexOf("--places-file");

const norm = (s) => (s || "").toLowerCase().replace(/[\s·•\-_()（）【】\[\]]/g, "");

function haversineKm(aLat, aLon, bLat, bLon) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const la = (aLat * Math.PI) / 180, lb = (bLat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function bandFor(km, bands) {
  for (const b of bands) if (b.max_km === null || km <= b.max_km) return b;
  return bands[bands.length - 1];
}

async function readJson(p, fallback) {
  try { return JSON.parse(await readFile(p, "utf8")); } catch { return fallback; }
}
async function writeJson(p, obj) {
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(obj, null, 2));
}

function fromAnchor(query) {
  const n = norm(query);
  for (const a of ANCHORS) {
    if (a.aliases.some((x) => n.includes(norm(x)) || norm(x).includes(n))) {
      return { lat: a.lat, lon: a.lon, area: a.area, source: "anchor", confidence: a.confidence, matched: a.aliases[0] };
    }
  }
  return null;
}

function fromDistrict(query) {
  for (const [k, km] of Object.entries(DISTRICT_KM)) {
    if (query.includes(k)) return { district: k, km, source: "district", confidence: "rough" };
  }
  return null;
}

async function geocodePhoton(query, cache) {
  const key = "gz:" + norm(query);
  if (cache[key]) return { ...cache[key], source: "photon(cache)" };
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent("广州 " + query)}&limit=1`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": USER_AGENT } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const d = await r.json();
    const f = d?.features?.[0];
    if (!f) return null;
    const [lon, lat] = f.geometry?.coordinates ?? [];
    if (typeof lat !== "number" || typeof lon !== "number") return null;
    const p = f.properties ?? {};
    // 校验：必须在广州范围内，否则视为假命中
    if (lat < 22.4 || lat > 24.1 || lon < 112.5 || lon > 114.2) return null;
    const rec = { lat, lon, name: p.name ?? null, district: p.district ?? null, city: p.city ?? null };
    cache[key] = rec;
    return { ...rec, area: p.district ?? p.city ?? "广州", source: "photon", confidence: "mid" };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolvePlace(query, cache) {
  return fromAnchor(query) ?? (await geocodePhoton(query, cache)) ?? fromDistrict(query) ?? { source: "none", confidence: "none" };
}

async function main() {
  const profile = await readJson(PROFILE_PATH, null);
  if (!profile?.home) throw new Error("缺少 data/profile.json 的 home 配置");
  const home = profile.home;
  const bands = profile.distance?.bands ?? [
    { max_km: 8, level: "near", label: "近", action: "boost" },
    { max_km: 18, level: "mid", label: "中等", action: "keep" },
    { max_km: 30, level: "far", label: "远", action: "downgrade" },
    { max_km: null, level: "very_far", label: "很远", action: "note" },
  ];

  let places = [];
  if (FILE_IDX > -1 && ARGV[FILE_IDX + 1]) {
    places = JSON.parse(await readFile(path.resolve(ARGV[FILE_IDX + 1]), "utf8"));
  } else if (ARGV.filter((a) => !a.startsWith("--")).length > 0) {
    places = ARGV.filter((a) => !a.startsWith("--"));
  } else {
    places = [
      "时尚天河", "广东美术馆新馆", "云幕剧场", "西城智汇Park",
      "悦方城", "广州文化公园", "地王广场", "北京路",
      "万顷沙", "腾势MINI中心", "MAO Livehouse 中大二号店", "海珠匹克球",
    ];
  }
  places = places.map((x) => String(x).trim()).filter(Boolean);

  const cache = (await readJson(GEOCACHE_PATH, {})) ?? {};

  const out = [];
  for (const q of places) {
    const r = await resolvePlace(q, cache);
    let km = null;
    if (typeof r.lat === "number" && typeof r.lon === "number") {
      km = Math.round(haversineKm(home.lat, home.lon, r.lat, r.lon) * 10) / 10;
    } else if (typeof r.km === "number") {
      km = r.km;
    }
    const band = km === null ? null : bandFor(km, bands);
    out.push({
      query: q,
      km,
      band: band?.level ?? null,
      band_label: band?.label ?? null,
      action: band?.action ?? "unresolved",
      area: r.area ?? r.district ?? null,
      source: r.source,
      confidence: r.confidence,
      resolved_name: r.name ?? r.matched ?? null,
      lat: r.lat ?? null, lon: r.lon ?? null,
    });
    if (r.source === "photon") await new Promise((s) => setTimeout(s, 300));
  }

  await writeJson(GEOCACHE_PATH, cache);

  const payload = {
    home: { label: home.label, lat: home.lat, lon: home.lon },
    note: "直线距离（Haversine），仅用于粗排序；confidence=rough 表示按区域估的",
    items: out,
  };

  if (JSON_MODE) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(`🏠 出发点：${home.label}  (${home.lat.toFixed(4)}, ${home.lon.toFixed(4)})\n`);
    const sorted = [...out].sort((a, b) => (a.km ?? 999) - (b.km ?? 999));
    for (const it of sorted) {
      const dist = it.km === null ? "  ？  " : `${String(it.km).padStart(5)} km`;
      const mark = it.band_label ? `[${it.band_label}]` : "[未识别]";
      console.log(` ${dist} ${mark} ${it.query}  —  ${it.area ?? "?"} (${it.source}/${it.confidence})`);
    }
    console.log("\n提示: --json 输出结构化结果供推荐流程消费");
  }
}

main().catch((e) => {
  console.error("distance.mjs 失败:", e.message);
  process.exit(1);
});
