// Round 1b: 从当前搜索页的 __INITIAL_STATE__ / anchor href 提取带 xsec_token 的详情链接
// 用法: ego-browser nodejs < scripts/extract-tokens.mjs （需先跑 search.mjs 且不离开搜索页）

const SPACE = "weekend-planner";
const task = await taskSpace(SPACE);
const page = task.page("p1");

const data = await page.evaluate(() => {
  const unwrap = (v) => (v && typeof v === "object" && "_value" in v) ? v._value : v;
  const out = new Map();

  // 1) 首页 anchor 的完整 href（部分卡片 href 里就带 token）
  for (const a of document.querySelectorAll('a[href*="/search_result/"], a[href*="/explore/"]')) {
    const href = a.href || "";
    const m = href.match(/\/(?:search_result|explore)\/([0-9a-f]{24})/);
    if (!m) continue;
    const tok = (href.match(/xsec_token=([^&]+)/) || [])[1] || null;
    const prev = out.get(m[1]) || {};
    out.set(m[1], { ...prev, id: m[1], href, token: prev.token || tok });
  }

  // 2) __INITIAL_STATE__ 里的 feed 项带 xsecToken 字段
  const state = unwrap(window.__INITIAL_STATE__) || {};
  const collect = (obj, depth = 0) => {
    if (!obj || depth > 4) return;
    if (Array.isArray(obj)) { obj.forEach((x) => collect(x, depth + 1)); return; }
    if (typeof obj !== "object") return;
    if (obj.id && obj.xsecToken && /^[0-9a-f]{24}$/.test(obj.id)) {
      const prev = out.get(obj.id) || {};
      out.set(obj.id, {
        ...prev,
        id: obj.id,
        token: prev.token || obj.xsecToken,
        title: prev.title || obj.noteCard?.displayTitle || obj.displayTitle || null,
        type: prev.type || obj.noteCard?.type || null,
      });
    }
    for (const v of Object.values(obj)) collect(v, depth + 1);
  };
  collect(unwrap(state.search));

  return { url: location.href.slice(0, 140), items: [...out.values()] };
});

console.log(JSON.stringify(data, null, 1));
