// weather.mjs — 查询广州周末天气，输出筛选决策 JSON
// 用法: ego-browser nodejs < scripts/weather.mjs   或   node weather.mjs（不依赖 ego，纯 Node fetch 也可跑）
// 数据源: wttr.in（免费无注册）。失败降级: filter_applied=false 且不筛任何主题。

const CITY = process.env.WEATHER_CITY || "Guangzhou";
const OUTDOOR_THEMES = ["徒步", "爬山", "露营", "登山", "森林公园", "公园", "赏花", "户外"];
const NOON_OUTDOOR_THEMES = ["爬山", "登山", "徒步"]; // 正午长时间户外

function nextWeekendDates() {
  const now = new Date();
  const dow = now.getDay(); // 0=Sun
  // 找本周六/日；若今天已是周六/日，就用今天/明天
  const satOffset = (6 - dow + 7) % 7;
  const sunOffset = (7 - dow + 7) % 7;
  const sat = new Date(now); sat.setDate(now.getDate() + satOffset);
  const sun = new Date(now); sun.setDate(now.getDate() + sunOffset);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { sat: iso(sat), sun: iso(sun) };
}

async function fetchWeather() {
  const url = `https://wttr.in/${CITY}?format=j1`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

function classifyDay(day) {
  // hourly[4] ≈ 12:00 时段；取全天最大降水概率更稳
  const maxRain = Math.max(...day.hourly.map((h) => parseInt(h.chanceofrain, 10) || 0));
  const maxTemp = parseInt(day.maxtempC, 10);
  const minTemp = parseInt(day.mintempC, 10);
  const desc = day.hourly[4]?.weatherDesc?.[0]?.value ?? "";
  let level = "ok"; // ok | caution | block
  const reasons = [];
  if (maxRain >= 60 || /Heavy|Thunder/i.test(desc)) {
    level = "block";
    reasons.push(`降水${maxRain}%`);
  } else if (maxRain >= 30 || /rain|shower|drizzle/i.test(desc)) {
    level = "caution";
    reasons.push(`降水${maxRain}%`);
  }
  if (maxTemp >= 35) {
    if (level === "ok") level = "caution";
    reasons.push(`高温${maxTemp}℃`);
  }
  return { maxRain, maxTemp, minTemp, desc, level, reasons };
}

function decide(theme, dayClass) {
  const t = theme || "";
  const isOutdoor = OUTDOOR_THEMES.some((k) => t.includes(k));
  const isNoonOutdoor = NOON_OUTDOOR_THEMES.some((k) => t.includes(k));
  if (dayClass.level === "block" && isOutdoor) return { action: "exclude", why: `${dayClass.desc} 降水${dayClass.maxRain}%，排除户外` };
  if (dayClass.level === "caution" && isOutdoor) return { action: "downgrade", why: `${dayClass.desc} 降水${dayClass.maxRain}%，户外降权带伞` };
  if (dayClass.maxTemp >= 35 && isNoonOutdoor) return { action: "downgrade", why: `高温${dayClass.maxTemp}℃，避免正午户外` };
  return { action: "keep", why: null };
}

(async () => {
  const weekend = nextWeekendDates();
  let raw;
  try {
    raw = await fetchWeather();
  } catch (e) {
    console.log(JSON.stringify({
      city: CITY, weekend, filter_applied: false, degraded: true,
      reason: `天气获取失败(${String(e).slice(0, 60)})，未做筛选`,
    }, null, 1));
    return;
  }
  const byDate = {};
  for (const d of raw.weather ?? []) byDate[d.date] = classifyDay(d);
  const sat = byDate[weekend.sat] ?? null;
  const sun = byDate[weekend.sun] ?? null;
  const summary = {
    city: CITY,
    weekend,
    filter_applied: true,
    degraded: false,
    days: {
      sat: sat ? { date: weekend.sat, desc: sat.desc, temp: `${sat.minTemp}~${sat.maxTemp}℃`, rain: sat.maxRain + "%", level: sat.level } : null,
      sun: sun ? { date: weekend.sun, desc: sun.desc, temp: `${sun.minTemp}~${sun.maxTemp}℃`, rain: sun.maxRain + "%", level: sun.level } : null,
    },
  };
  // 附一个可直接对主题调用的判定示例：真正的筛选在推荐汇总时调用本脚本输出的 days.*.level
  summary.rule = "level=block→排除户外主题; caution→降权附注; 高温≥35℃→避免正午户外";
  console.log(JSON.stringify(summary, null, 1));
})();
