/* ガチャサイト 画面の動き（診断・近い順の在庫店）。ビルド時に assets/app.js にコピーされる */
(function () {
  "use strict";

  var langMeta = document.querySelector('meta[name="site-lang"]');
  var LANG = langMeta ? langMeta.content : "ja";
  var EN = LANG !== "ja"; // 英語・中国語・韓国語（訳がないところは英語）
  // ひらがな・カタカナ、全角・半角、大文字・小文字の違いをなくして比べる
  var NORM = function (v) {
    return String(v || "").normalize("NFKC").toLowerCase()
      .replace(/[\u3041-\u3096]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); })
      .replace(/[\s・･!！?？'’"“”:：\-‐–—~〜～、。,.\/／|｜【】\[\]「」『』()（）♪☆★™]/g, "");
  };
  var M = EN ? {
    none: "No matches. Try adding more groups or clearing the detailed picks.",
    found: function (n) { return n + " matches."; },
    next: "Next", skip: "No preference",
    searchNone: "No results. Try a shorter word.", searchCount: " results.",
    searchAll: function (n) { return "See all " + n + " results"; },
    relaxed: function (n) { return "No exact match for your age and gender, so here are " + n + " items from the groups you picked."; },
    match: "Match",
    lineup: function (n) { return n + " designs"; },
    loadErr: "Couldn't load stock information. Please reload the page later.",
    updated: function (s) { return "Updated " + s + ". "; },
    allPrefs: "All prefectures",
    noGeo: "Location isn't available on this device. Choose a prefecture instead.",
    locating: "Finding your location…",
    geoErr: "Couldn't get your location. Allow location access or choose a prefecture.",
    label: { in_stock: "In stock", few: "Few left", out_of_stock: "Sold out" },
    empty: "No shops with stock information for this selection yet.",
    nearOk: "Sorted by distance from you (sold-out shops last).",
    nearNg: function (km) { return "No shop within " + km + " km has it in stock. Try buying online below."; },
    count: function (n) { return n + " shops have it in stock. Tap \u201cUse my location\u201d to sort by distance."; }
  } : {
    none: "条件に合うガチャが見つかりませんでした。系統を増やすか、詳しい項目を外してみてください。",
    found: function (n) { return n + "件が見つかりました。"; },
    next: "次へ", skip: "こだわらない",
    searchNone: "見つかりませんでした。ことばを短くするか、ひらがな・カタカナを変えてみてください。", searchCount: "件見つかりました。",
    searchAll: function (n) { return n + "件すべて見る"; },
    relaxed: function (n) { return "年代・性別にぴったりの商品がなかったので、選んだ系統の" + n + "件を表示しています。"; },
    match: "相性",
    lineup: function (n) { return "全" + n + "種"; },
    loadErr: "在庫情報を読み込めませんでした。時間をおいて再読み込みしてください。",
    updated: function (s) { return s + " 時点の情報です。"; },
    allPrefs: "すべての都道府県",
    noGeo: "この端末では現在地を使えません。都道府県を選んでください。",
    locating: "現在地を確認しています…",
    geoErr: "現在地を取得できませんでした。位置情報を許可するか、都道府県を選んでください。",
    label: { in_stock: "在庫あり", few: "残りわずか", out_of_stock: "売り切れ" },
    empty: "この条件で在庫情報のある店舗はまだありません。",
    nearOk: "現在地から近い順に表示しています（売り切れの店は最後）。",
    nearNg: function (km) { return "現在地から" + km + "km以内に在庫のある店舗が見つかりませんでした。ネット通販もご検討ください。"; },
    count: function (n) { return n + "店舗に在庫があります。「現在地から探す」で近い順に並べ替えられます。"; }
  };
  // ブラウザの言語が中国語・韓国語なのに別の言語のページを見ているとき、その言語のページを1回だけ案内する（自動では移動しない）
  (function () {
    try {
      if (localStorage.getItem("lang-hint")) return;
      var nl = (navigator.languages || [navigator.language || ""]).map(function (x) { return String(x).toLowerCase(); });
      var want = null;
      for (var i = 0; i < nl.length && !want; i++) {
        var l = nl[i];
        if (/^ja/.test(l) || /^en/.test(l)) break;
        if (/^zh-(tw|hk|mo|hant)/.test(l)) want = "zh-tw"; else if (/^zh/.test(l)) want = "zh-cn"; else if (/^ko/.test(l)) want = "ko";
      }
      if (!want || want === LANG) return;
      var a = document.querySelector('.lang-list a[hreflang="' + ({ "zh-tw": "zh-Hant", "zh-cn": "zh-Hans", ko: "ko" })[want] + '"]');
      if (!a) return;
      var txt = { "zh-tw": "有繁體中文版喔：", "zh-cn": "本站有简体中文版：", ko: "한국어 페이지가 있어요: " }[want];
      var box = document.createElement("div"); box.className = "lang-hint"; box.setAttribute("lang", want === "ko" ? "ko" : want === "zh-tw" ? "zh-TW" : "zh-CN");
      box.innerHTML = '<span>' + txt + ' <a href="' + a.getAttribute("href") + '">' + a.textContent + '</a></span><button type="button" aria-label="close">×</button>';
      box.querySelector("button").onclick = function () { box.remove(); try { localStorage.setItem("lang-hint", "1"); } catch (e) {} };
      box.querySelector("a").onclick = function () { try { localStorage.setItem("lang-hint", "1"); } catch (e) {} };
      document.body.appendChild(box);
    } catch (e) {}
  })();
  // 中国語・韓国語の文言（ページに埋め込まれた window.__M）。{n} {s} {km} は数字に置きかえる
  if (window.__M) Object.keys(window.__M).forEach(function (k) {
    var v = window.__M[k];
    M[k] = typeof v === "string" && /\{(n|s|km)\}/.test(v) ? (function (tpl) { return function (a) { return tpl.replace(/\{(n|s|km)\}/g, a); }; })(v) : v;
  });

  // トップに ?q=〇〇 で来たら検索ページへ（Xの投稿のリンク用）
  (function () { try { var qq = new URLSearchParams(location.search).get("q"); if (qq && /^\/(en\/)?(index(\.html)?)?$/.test(location.pathname)) location.replace(location.pathname.replace(/index(\.html)?$/, "") + "search?q=" + encodeURIComponent(qq)); } catch (e) {} })();
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  // 日本時間の今日（YYYY-MM-DD）と、今週の月曜日
  var todayJST = function () { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); };
  var thisMonday = function () {
    var d = new Date(Date.now() + 9 * 3600e3);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7))).toISOString().slice(0, 10);
  };
  var relOf = function (x) { return { k: "", t: x.r || "" }; }; // 検索欄があるページで置きかえる

  /* ================= 検索（全ページのヘッダー） ================= */
  var sForm = document.querySelector("form.search");
  if (sForm) {
    var sInput = sForm.querySelector("input");
    var sPop = sForm.querySelector(".search-pop");
    var sIndex = null, sLoading = null;
    var home = sForm.getAttribute("data-home"), root = sForm.getAttribute("data-root");
    // ひらがな・カタカナ、全角・半角、大文字・小文字の違いをなくして比べる
    var norm = function (v) {
      return String(v || "").normalize("NFKC").toLowerCase()
        .replace(/[\u3041-\u3096]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); })
        .replace(/[\s・･!！?？'’"“”:：\-‐–—~〜～、。,.\/／|｜【】\[\]「」『』()（）♪☆★™]/g, "");
    };
    var load = function () {
      if (!sLoading) sLoading = fetch(sForm.getAttribute("data-index")).then(function (r) { return r.json(); }).then(function (d) {
        sIndex = d.map(function (x) { x._s = norm([x.n, x.a, x.m, x.g, x.k].join(" ")); return x; });
        return sIndex;
      });
      return sLoading;
    };
    var find = function (q) {
      var words = String(q).split(/\s+/).map(norm).filter(Boolean);
      if (!words.length) return [];
      return sIndex.filter(function (x) { return words.every(function (w) { return x._s.indexOf(w) !== -1; }); });
    };
    var thumbHTML = function (x) {
      return x.img ? '<img src="' + esc(/^https?:/.test(x.img) ? x.img : root + x.img) + '" alt="" loading="lazy" width="48" height="48">' : '<span class="sp-cap" aria-hidden="true"></span>';
    };
    // キャラクター・作品の一覧ページ（ことばが作品名に当たったら、候補のいちばん上に出す）
    var cIndex = null, cLoading = null;
    var loadChara = function () {
      if (!cLoading) cLoading = fetch(sForm.getAttribute("data-chara")).then(function (r) { return r.ok ? r.json() : []; }).then(function (d) {
        cIndex = (d || []).map(function (x) { try { x._rx = new RegExp(x.m, "i"); } catch (e) { x._rx = null; } x._s = [x.l, x.j, x.e].map(norm); return x; });
        return cIndex;
      }).catch(function () { cIndex = []; return cIndex; });
      return cLoading;
    };
    var charaFor = function (q) {
      if (!cIndex) return null;
      var nq = norm(q);
      if (nq.length < 2) return null;
      var hit = cIndex.filter(function (x) { return (x._rx && x._rx.test(q)) || x._s.some(function (s) { return s && s.indexOf(nq) === 0; }); });
      hit.sort(function (a, b) { return a.n - b.n; }); // いちばん絞りこんだ作品（例：サンリオよりハローキティ）
      return hit[0] || null;
    };
    // 発売の状態（今週発売・◯/◯〜発売・発売中）
    var REL = {}; try { REL = JSON.parse(sForm.getAttribute("data-rel") || "{}"); } catch (e) {}
    relOf = function (x) {
      var mon = thisMonday(), ym = mon.slice(0, 7);
      if (x.w) {
        if (x.w === mon) return { k: "now", t: REL.now };
        if (x.w > mon) return { k: "soon", t: String(REL.from || "").replace("{m}", +x.w.slice(5, 7)).replace("{d}", +x.w.slice(8, 10)) };
        return { k: "out", t: REL.out };
      }
      var cur = todayJST().slice(0, 7);
      if (x.ym && x.ym > cur) return { k: "soon", t: x.r };
      if (x.ym && x.ym < cur) return { k: "out", t: REL.out };
      return { k: x.ym === ym ? "now-month" : "out", t: x.r };
    };
    var render = function () {
      var q = sInput.value.trim();
      if (!q || !sIndex) { sPop.hidden = true; return; }
      var hits = find(q);
      var ch = charaFor(q);
      var chRow = ch ? '<a class="sp-chara" href="' + home + "chara/" + esc(ch.s) + '">' + esc(String(sForm.getAttribute("data-chara-tpl") || "").replace("{l}", ch.l).replace("{n}", ch.n)) + "</a>" : "";
      sPop.innerHTML = chRow + (hits.length
        ? hits.slice(0, 8).map(function (x) {
            var st = relOf(x);
            return '<a class="sp-item" href="' + home + "item/" + esc(x.id) + '">' + thumbHTML(x) + '<span class="sp-name">' + esc(x.n) + '</span><span class="sp-price">¥' + x.p + (st.t ? '<small class="sp-rel sp-' + st.k + '">' + esc(st.t) + "</small>" : "") + "</span></a>";
          }).join("") + (hits.length > 8 ? '<button class="sp-all" type="submit">' + esc(M.searchAll(hits.length)) + "</button>" : "")
        : '<p class="sp-none">' + esc(M.searchNone) + "</p>");
      sPop.hidden = false;
    };
    sInput.addEventListener("focus", loadChara);
    sInput.addEventListener("focus", load);
    sInput.addEventListener("input", function () { Promise.all([load(), loadChara()]).then(render); });
    sInput.addEventListener("keydown", function (e) { if (e.key === "Escape") { sPop.hidden = true; sInput.blur(); } });
    document.addEventListener("click", function (e) { if (!sForm.contains(e.target)) sPop.hidden = true; });

    // 検索結果ページ
    var srGrid = document.getElementById("sr-grid");
    if (srGrid) {
      var q = new URLSearchParams(location.search).get("q") || "";
      sInput.value = q;
      load().then(function () {
        var hits = find(q);
        document.getElementById("sr-title").textContent = q ? "「" + q + "」" : document.getElementById("sr-title").textContent;
        document.getElementById("sr-note").textContent = q ? (hits.length ? hits.length + M.searchCount : M.searchNone) : "";
        srGrid.innerHTML = hits.map(function (x) {
          return cardHTML({ id: x.id, name: x.n, price: x.p, lineup: x.l, image: x.img, genre_label: x.g, release_label: x.r }, { home: home, root: root }, null);
        }).join("");
      });
    }
  }

  /* 診断・入荷速報で使う商品の一覧は、ページを軽くするため別のファイルにして後から読む */
  var itemsJSON = document.getElementById("items-data");
  var DATA = itemsJSON ? JSON.parse(itemsJSON.textContent) : null;
  var itemsP = null;
  var loadItems = function () {
    if (!itemsP) itemsP = fetch(DATA.src).then(function (r) { return r.json(); }).then(function (list) { DATA.items = list; return DATA; });
    return itemsP;
  };

  /* ================= 診断（トップページ） ================= */
  var quiz = document.getElementById("quiz");
  if (quiz) {
    var data = DATA;
    // 診断を触り始めたら、裏で商品の一覧を読んでおく
    quiz.addEventListener("change", function () { loadItems(); }, { once: true });
    var results = document.getElementById("results");
    var grid = document.getElementById("results-grid");
    var note = document.getElementById("results-note");

    /* 1問ずつ表示する（JavaScriptが動かないときは全部の質問がそのまま並ぶ） */
    var steps = [].slice.call(quiz.querySelectorAll(".quiz-qs > fieldset"));
    var cur = 0;
    var stepEl = document.getElementById("quiz-step");
    var barEl = document.getElementById("quiz-bar");
    var backBtn = document.getElementById("quiz-back");
    var nextBtn = document.getElementById("quiz-next");
    var submitBtn = document.getElementById("quiz-submit");
    var calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    quiz.classList.add("is-wizard");
    function show(i, dir) {
      cur = Math.max(0, Math.min(steps.length - 1, i));
      steps.forEach(function (f, k) {
        f.hidden = k !== cur;
        f.classList.remove("enter-fwd", "enter-back");
        if (k === cur && dir && !calm) { void f.offsetWidth; f.classList.add(dir > 0 ? "enter-fwd" : "enter-back"); }
      });
      stepEl.textContent = (cur + 1) + " / " + steps.length;
      barEl.style.width = ((cur + 1) / steps.length * 100) + "%";
      backBtn.hidden = cur === 0;
      // 1問目（好きな系統）のあとは答えなくてもOK：「次へ／スキップ」と「診断する」をいつでも出す
      var last = cur === steps.length - 1;
      nextBtn.hidden = last;
      nextBtn.textContent = nextBtn.getAttribute(steps[cur].hasAttribute("data-optional") ? "data-skip" : "data-next") || nextBtn.textContent;
      submitBtn.hidden = false;
    }
    nextBtn.addEventListener("click", function () { show(cur + 1, 1); });
    steps.forEach(function (f) {
      if (!f.hasAttribute("data-auto")) return;
      // 選んだら次へ。戻ってきて同じ答えをもう一度押したときも進む（そのときは「change」が起きないので「click」で見る）
      var timer = null;
      f.addEventListener("click", function (e) {
        if (!e.target.matches || !e.target.matches('input[type="radio"]')) return;
        var me = steps.indexOf(f);
        if (timer || me !== cur) return;
        timer = setTimeout(function () { timer = null; if (cur !== me) return; if (me === steps.length - 1) submitBtn.click(); else show(me + 1, 1); }, 220);
      });
    });
    backBtn.addEventListener("click", function () { show(cur - 1, -1); });
    show(0);

    /* 系統：「さらに詳しく」で細かい項目を開く。細かい項目を選ぶと親の系統も選ばれる */
    [].forEach.call(quiz.querySelectorAll(".grp"), function (g) {
      var main = g.querySelector('input[name="group"]');
      var more = g.querySelector(".grp-more");
      var subs = g.querySelector(".grp-subs");
      more.addEventListener("click", function () {
        var open = subs.hidden;
        subs.hidden = !open;
        more.setAttribute("aria-expanded", open ? "true" : "false");
        more.textContent = open ? more.getAttribute("data-less") : more.getAttribute("data-more");
        g.classList.toggle("is-open", open);
      });
      // 詳しい項目を選ぶと、その下の細かい項目の段が出る
      var syncLeaves = function () {
        [].forEach.call(subs.querySelectorAll(".leaf-row"), function (row) {
          var sub = subs.querySelector('input[name="sub"][value="' + row.getAttribute("data-sub") + '"]');
          row.hidden = !(sub && sub.checked);
          if (row.hidden) [].forEach.call(row.querySelectorAll('input[name="leaf"]'), function (x) { x.checked = false; });
        });
      };
      subs.addEventListener("change", function (e) {
        if (e.target.name === "leaf" && e.target.checked) {
          var key = e.target.value.split(":").slice(0, 2).join(":");
          var sub = subs.querySelector('input[name="sub"][value="' + key + '"]');
          if (sub) sub.checked = true;
        }
        if (subs.querySelector("input:checked")) main.checked = true;
        syncLeaves();
        g.classList.toggle("is-on", main.checked);
      });
      // 作品がたくさんある段：しぼりこみ欄と「ぜんぶ見る」
      var lnorm = function (v) {
        return String(v || "").normalize("NFKC").toLowerCase()
          .replace(/[\u3041-\u3096]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); })
          .replace(/[\s・･!！?？'’"“”:：\-‐–—~〜～、。,.\/／|｜【】\[\]「」『』()（）♪☆★™=＝]/g, "");
      };
      [].forEach.call(subs.querySelectorAll(".leaf-row"), function (row) {
        var box = row.querySelector(".opts"), f = row.querySelector(".leaf-filter"), all = row.querySelector(".leaf-all"), none = row.querySelector(".leaf-none");
        if (!f) return;
        var labels = [].slice.call(box.querySelectorAll(".opt"));
        labels.forEach(function (l) { l._s = lnorm(l.querySelector("span").firstChild.textContent); });
        all.addEventListener("click", function () { box.classList.remove("is-clipped"); all.hidden = true; });
        f.addEventListener("input", function () {
          var q = lnorm(f.value), hit = 0;
          box.classList.toggle("is-filtering", !!q);
          labels.forEach(function (l) {
            var ok = !q || l._s.indexOf(q) !== -1 || l.querySelector("input").checked;
            l.classList.toggle("is-hit", !!q && ok);
            if (q && ok) hit++;
          });
          none.hidden = !q || hit > 0;
          all.hidden = !!q || !box.classList.contains("is-clipped");
        });
      });
      main.addEventListener("change", function () {
        if (!main.checked) [].forEach.call(subs.querySelectorAll("input"), function (x) { x.checked = false; });
        syncLeaves();
        g.classList.toggle("is-on", main.checked);
      });
    });

    var val = function (n) { return (quiz.querySelector('input[name="' + n + '"]:checked') || {}).value || ""; };
    var vals = function (n) { return [].map.call(quiz.querySelectorAll('input[name="' + n + '"]:checked'), function (x) { return x.value; }); };
    var GROUPS = (data.groups || []).map(function (g) {
      return { slug: g.slug, subs: g.subs.map(function (x) {
        return { slug: x.slug, leaves: (x.leaves || []).map(function (l) { return { slug: l.slug, rx: new RegExp(l.match, "i") }; }) };
      }) };
    });

    /* 診断結果の並び替え・もっと見る */
    var lastResults = [], lastMax = 1, lastAny = false, lastRelaxed = false, shown = 12, sortKey = "match";
    var moreBtn = document.getElementById("results-more");
    var SORTS = {
      match: function (a, b) { return b.s - a.s || b.it.popularity - a.it.popularity; },
      "new": function (a, b) { return (b.it.ad || "").localeCompare(a.it.ad || "") || (b.it.rl || "").localeCompare(a.it.rl || "") || b.s - a.s; },
      popular: function (a, b) { return b.it.popularity - a.it.popularity || b.s - a.s; },
      release: function (a, b) { return (a.it.rl || "").localeCompare(b.it.rl || "") || b.s - a.s; },
      cheap: function (a, b) { return a.it.price - b.it.price || b.s - a.s; }
    };
    function drawResults() {
      var list = lastResults.slice().sort(SORTS[sortKey]);
      if (!list.length) { note.textContent = M.none; grid.innerHTML = ""; moreBtn.hidden = true; return; }
      note.textContent = lastRelaxed ? M.relaxed(list.length) : M.found(list.length);
      grid.innerHTML = list.slice(0, shown).map(function (x) {
        var pct = Math.min(99, Math.round((x.s / lastMax) * 100) - (lastRelaxed ? 20 : 0));
        return cardHTML(x.it, data, lastAny ? pct : null);
      }).join("");
      moreBtn.hidden = list.length <= shown;
    }
    function setSort(k) {
      sortKey = k;
      [].forEach.call(document.querySelectorAll(".sortbar .sort"), function (b) {
        var on = b.getAttribute("data-sort") === k;
        b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      results.hidden = false;
      drawResults();
    }
    [].forEach.call(document.querySelectorAll(".sortbar .sort"), function (b) {
      b.addEventListener("click", function () { shown = 12; setSort(b.getAttribute("data-sort")); });
    });
    moreBtn.addEventListener("click", function () { shown += 12; drawResults(); });

    quiz.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!data.items) {
        loadItems().then(function () { quiz.dispatchEvent(new Event("submit", { cancelable: true })); }).catch(function () {});
        return;
      }
      var gender = val("gender"), age = val("age");
      var chosen = vals("group");
      var chosenSubs = vals("sub");
      // 系統ごとに、細かい項目を選んでいればそれだけ、選んでいなければ全部を対象にする
      var chosenLeaves = vals("leaf");
      // 条件を作る：系統だけ→その系統全部（3点）、詳しい項目→その項目（6点）、さらに細かい項目→その中の作品・キャラ（9点）
      var conds = [];
      GROUPS.forEach(function (g) {
        if (chosen.indexOf(g.slug) === -1) return;
        var picked = g.subs.filter(function (x) { return chosenSubs.indexOf(g.slug + ":" + x.slug) !== -1; });
        if (!picked.length) {
          conds.push({ w: 3, test: function (it) { return it.qs.some(function (k) { return k.indexOf(g.slug + ":") === 0; }); } });
          return;
        }
        picked.forEach(function (x) {
          var key = g.slug + ":" + x.slug;
          var leaves = x.leaves.filter(function (l) { return chosenLeaves.indexOf(key + ":" + l.slug) !== -1; });
          if (leaves.length) conds.push({ w: 9, test: function (it) { return it.qs.indexOf(key) !== -1 && leaves.some(function (l) { return l.rx.test(it.jn); }); } });
          else conds.push({ w: 6, test: function (it) { return it.qs.indexOf(key) !== -1; } });
        });
      });
      // 推しの名前（自由入力）：商品名かラインナップ名に入っていれば一番強く当てる
      var oshiEl = quiz.querySelector('input[name="oshi"]');
      var oshiQ = oshiEl ? NORM(oshiEl.value) : "";
      if (oshiQ) conds.push({ w: 12, test: function (it) { return NORM(it.jn + "｜" + it.name + "｜" + (it.on || "")).indexOf(oshiQ) !== -1; } });
      var cands = data.items.map(function (it) {
        var s = 0;
        conds.forEach(function (c) { if (c.test(it)) s += c.w; });
        return { it: it, s: s };
      }).filter(function (x) { return !conds.length || x.s > 0; });
      // 年代・性別のタグが当てはまる商品だけに絞る（0件になるときは絞らずに出す）
      var fit = function (x) {
        return (!age || x.it.qa.indexOf(age) !== -1) && (!(gender === "male" || gender === "female") || x.it.qg.indexOf(gender) !== -1);
      };
      var strict = cands.filter(fit);
      var relaxed = !strict.length && cands.length && (age || gender === "male" || gender === "female");
      var scored = (strict.length ? strict : cands).sort(function (a, b) { return b.s - a.s || b.it.popularity - a.it.popularity; });
      var max = conds.reduce(function (a, c) { return Math.max(a, c.w); }, 0) || 1;
      var anyChoice = conds.length;
      lastResults = scored; lastMax = max; lastAny = anyChoice; lastRelaxed = relaxed; shown = 12;
      setSort("match");
      results.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
    });
  }

  function cardHTML(it, data, pct) {
    var img = it.image
      ? '<img src="' + esc(/^https?:/.test(it.image) ? it.image : data.root + it.image) + '" alt="' + esc(it.name) + '" loading="lazy" width="400" height="400">'
      : '<div class="capsule" aria-hidden="true"><i></i><span>NO IMAGE</span></div>';
    return '<a class="card" href="' + data.home + "item/" + esc(it.id) + '">' +
      '<div class="thumb">' + img + "</div>" +
      '<div class="card-meta"><span>' + esc(it.genre_label) + "</span>" + (pct != null ? '<span class="match">' + M.match + " " + pct + "%</span>" : "") + "</div>" +
      '<div class="card-name">' + esc(it.name) + "</div>" +
      '<div class="card-foot"><span><b>¥' + it.price + "</b>" + (it.lineup ? " / " + M.lineup(it.lineup) : "") + "</span><span>" + esc(it.release_label) + "</span></div></a>";
  }

  /* ================= 近い順の在庫店（商品ページ） ================= */
  var stock = document.getElementById("stock");
  if (stock) {
    var listEl = document.getElementById("store-list");
    var statusEl = document.getElementById("stock-status");
    var prefSel = document.getElementById("pref");
    var geoBtn = document.getElementById("geo-btn");
    var buyBox = document.getElementById("buy");
    var stores = [];
    var here = null;
    var LABEL = M.label;
    var RANK = { in_stock: 0, few: 1, out_of_stock: 2 };
    var FAR_KM = 30;

    // まずCloudflareの在庫データベース（最新）を読み、だめならサイトに置いた在庫ファイルを読む
    var getJSON = function (u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) { if (!d) throw new Error("empty"); return d; }); };
    getJSON(stock.getAttribute("data-api"))
      .catch(function () { return getJSON(stock.getAttribute("data-src")); })
      .then(function (d) {
        stores = d.stores || [];
        var up = document.getElementById("stock-updated");
        var upTxt = EN ? d.updated_en : d.updated_ja;
        if (up && upTxt) up.textContent = M.updated(upTxt);
        var prefs = [];
        stores.forEach(function (s) { if (prefs.indexOf(s.prefecture) === -1) prefs.push(s.prefecture); });
        var prefName = {};
        stores.forEach(function (s) { prefName[s.prefecture] = EN ? s.prefecture_en : s.prefecture; });
        prefSel.innerHTML = '<option value="">' + M.allPrefs + "</option>" + prefs.map(function (p) {
          return '<option value="' + esc(p) + '">' + esc(prefName[p]) + "</option>";
        }).join("");
        render();
      })
      .catch(function () {
        statusEl.textContent = M.loadErr;
      });

    prefSel.addEventListener("change", render);

    geoBtn.addEventListener("click", function () {
      if (!navigator.geolocation) {
        statusEl.textContent = M.noGeo;
        return;
      }
      statusEl.textContent = M.locating;
      navigator.geolocation.getCurrentPosition(function (pos) {
        here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        prefSel.value = "";
        render();
      }, function () {
        statusEl.textContent = M.geoErr;
      }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
    });

    function km(a, b) {
      var R = 6371, rad = Math.PI / 180;
      var dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
      var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
      return 2 * R * Math.asin(Math.sqrt(h));
    }
    function fmt(d) { return d < 1 ? Math.round(d * 1000) + "m" : (d < 10 ? d.toFixed(1) : Math.round(d)) + "km"; }

    function render() {
      var pref = prefSel.value;
      var rows = stores.filter(function (s) { return !pref || s.prefecture === pref; }).map(function (s) {
        return { s: s, d: here ? km(here, s) : null };
      });
      rows.sort(function (a, b) {
        var ao = a.s.status === "out_of_stock", bo = b.s.status === "out_of_stock";
        if (ao !== bo) return ao ? 1 : -1;
        if (here) return a.d - b.d;
        return RANK[a.s.status] - RANK[b.s.status] || a.s.prefecture.localeCompare(b.s.prefecture, "ja");
      });
      var shown = rows.slice(0, 20);
      listEl.innerHTML = shown.map(function (r) {
        var s = r.s;
        var nm = (EN && s.name_en) || s.name;
        var ad = EN ? (s.address_en ? s.address_en + ", " + s.prefecture_en : s.address) : s.address;
        return '<li class="' + (s.status === "out_of_stock" ? "is-off" : "") + '">' +
          '<span class="s-name">' + (function () { var m = /shop_code=(S\d+)/i.exec(s.url || ""); return m && !EN ? '<a href="' + stock.getAttribute("data-api").replace(/api\/stock\/.*$/, "") + "shop/" + m[1].toLowerCase() + '">' + esc(nm) + "</a>" : esc(nm); })() + "</span>" +
          '<span class="s-addr">' + esc(ad) + (EN && s.name_en ? ' <span lang="ja">' + esc(s.name) + "</span>" : "") + "</span>" +
          '<span class="s-right">' + (r.d != null ? '<span class="s-dist">' + fmt(r.d) + "</span>" : "") +
          '<span class="pill ' + s.status + '">' + LABEL[s.status] + "</span></span></li>";
      }).join("");

      var avail = rows.filter(function (r) { return r.s.status !== "out_of_stock"; });
      var nearOk = here ? avail.some(function (r) { return r.d <= FAR_KM; }) : avail.length > 0;
      buyBox.classList.toggle("is-emph", !nearOk);

      if (!rows.length) {
        statusEl.textContent = M.empty;
      } else if (here) {
        statusEl.textContent = nearOk ? M.nearOk : M.nearNg(FAR_KM);
      } else {
        statusEl.textContent = M.count(avail.length);
      }
    }
  }

  /* ================= 入荷情報（商品ページ） ================= */
  var arr = document.getElementById("arrivals");
  if (arr && window.fetch) {
    var AI = JSON.parse(document.getElementById("arr-i18n").textContent);
    var fill = function (tpl, n) { return tpl.replace("{n}", n); };
    var st = document.getElementById("arr-status");
    var fmt = function (iso) {
      var d = new Date(iso);
      return (d.getMonth() + 1) + "/" + d.getDate() + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    };
    var lagTxt = function (h) {
      if (h < 1) return EN ? "< 1h" : "1時間以内";
      if (h < 48) return EN ? Math.ceil(h) + "h" : Math.ceil(h) + "時間";
      return EN ? (Math.round(h / 2.4) / 10) + " days" : (Math.round(h / 2.4) / 10) + "日";
    };
    fetch(arr.getAttribute("data-api")).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !d.total) { st.textContent = AI.none; return; }
      st.hidden = true;
      document.getElementById("arr-body").hidden = false;
      document.getElementById("arr-in").textContent = fill(AI.shops, d.in_count);
      document.getElementById("arr-re").textContent = fill(AI.times, d.restocks);
      document.getElementById("arr-first").textContent = fmt(d.first_seen);
      var fast = document.getElementById("arr-fast");
      if (!d.fastest.length) fast.outerHTML = '<p class="fine">' + esc(AI.none) + "</p>";
      else fast.innerHTML = d.fastest.map(function (r) {
        return '<li><span class="af-lag">' + esc(lagTxt(r.lag)) + '</span><span class="af-name">' + esc(r.name) + '<small>' + esc(r.pref) + " · " + esc(fmt(r.at)) + '</small></span><span class="pill ' + (r.in ? "in_stock" : "out_of_stock") + '">' + esc(r.in ? AI.on : AI.off) + "</span></li>";
      }).join("");
      document.getElementById("arr-prefs").innerHTML = d.prefs.sort(function (a, b) { return a.avg_days == null ? 1 : b.avg_days == null ? -1 : a.avg_days - b.avg_days; }).map(function (p) {
        return "<li><b>" + esc(p.pref) + "</b><span>" + esc(p.avg_days == null ? AI.noavg : fill(AI.avg, p.avg_days)) + "</span><small>" + esc(fill(AI.shops, p.n)) + "</small></li>";
      }).join("");
    }).catch(function () { st.textContent = AI.none; });
  }

  /* ================= ハート（人気投票） ================= */
  [].forEach.call(document.querySelectorAll(".heart[data-vote]"), function (btn) {
    var key = "gp-heart-" + btn.getAttribute("data-id") + "-" + new Date().toISOString().slice(0, 10);
    var done = false;
    try { done = localStorage.getItem(key) === "1"; } catch (e) {}
    if (done) btn.classList.add("is-on");
    btn.addEventListener("click", function () {
      if (btn.classList.contains("is-on") || btn.disabled) return;
      btn.disabled = true;
      btn.classList.add("is-on", "pop");
      var b = btn.querySelector("b");
      b.textContent = String((Number(b.textContent) || 0) + 1);
      fetch(btn.getAttribute("data-vote"), { method: "POST" }).then(function (r) { return r.json(); }).then(function (d) {
        if (d && typeof d.n === "number") b.textContent = String(d.n);
      }).catch(function () {}).then(function () {
        btn.disabled = false;
        try { localStorage.setItem(key, "1"); } catch (e) {}
      });
    });
  });

  /* ================= ★保存（マイリスト）：このブラウザの中だけに保存する ================= */
  var FAV_KEY = "gp-fav";
  var favGet = function () {
    try { var a = JSON.parse(localStorage.getItem(FAV_KEY) || "[]"); return Array.isArray(a) ? a.filter(function (x) { return typeof x === "string"; }) : []; } catch (e) { return []; }
  };
  var favSet = function (a) { try { localStorage.setItem(FAV_KEY, JSON.stringify(a.slice(0, 500))); } catch (e) {} };
  var favToggle = function (id) {
    var a = favGet(), i = a.indexOf(id);
    if (i === -1) a.unshift(id); else a.splice(i, 1);
    favSet(a);
    return i === -1;
  };
  var hdFav = document.querySelector(".hd-fav");
  var FL = {
    add: (hdFav && hdFav.getAttribute("data-add")) || "Save", del: (hdFav && hdFav.getAttribute("data-del")) || "Remove",
    save: (hdFav && hdFav.getAttribute("data-save")) || "Save", saved: (hdFav && hdFav.getAttribute("data-saved")) || "Saved"
  };
  var paintFav = function () {
    var a = favGet();
    [].forEach.call(document.querySelectorAll("[data-fav]"), function (b) {
      var on = a.indexOf(b.getAttribute("data-fav")) !== -1;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.setAttribute("aria-label", on ? FL.del : FL.add);
      b.title = on ? FL.del : FL.add;
      var s = b.querySelector("span"); if (s) s.textContent = on ? FL.saved : FL.save;
    });
    if (hdFav) { var n = hdFav.querySelector(".hd-fav-n"); if (n) { n.textContent = String(a.length); n.hidden = !a.length; } }
  };
  // 商品カードに★ボタンを足す（カードはリンクなので、★を押したときはページを移らない）
  var decorate = function () {
    [].forEach.call(document.querySelectorAll('a.card[href*="item/"]'), function (cd) {
      if (cd.querySelector(".card-fav")) return;
      var m = /item\/([a-z0-9-]+)/.exec(cd.getAttribute("href") || ""), th = cd.querySelector(".thumb");
      if (!m || !th) return;
      var b = document.createElement("button");
      b.type = "button"; b.className = "card-fav"; b.setAttribute("data-fav", m[1]);
      b.innerHTML = '<i aria-hidden="true">★</i>';
      th.appendChild(b);
    });
    paintFav();
  };
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-fav]");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var on = favToggle(b.getAttribute("data-fav"));
    paintFav();
    if (on) { b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); }
    try { document.dispatchEvent(new Event("gp-fav")); } catch (e2) {}
  }, true);
  window.addEventListener("storage", function (e) { if (e.key === FAV_KEY) { paintFav(); try { document.dispatchEvent(new Event("gp-fav")); } catch (e2) {} } });
  decorate();
  // 検索結果・診断結果など、あとから出るカードにも付ける
  if (window.MutationObserver) {
    var favQ = false;
    new MutationObserver(function () {
      if (favQ) return; favQ = true;
      (window.requestAnimationFrame || setTimeout)(function () { favQ = false; decorate(); });
    }).observe(document.querySelector("main") || document.body, { childList: true, subtree: true });
  }

  /* マイリストのページ：保存した商品を「今週発売・来週以降・発売中」に分けて出す */
  var ml = document.getElementById("mylist");
  if (ml && window.fetch) {
    var MLL = {}; try { MLL = JSON.parse(ml.getAttribute("data-l") || "{}"); } catch (e) {}
    var mlEmpty = ml.querySelector(".ml-empty");
    var mlBox = document.createElement("div"); ml.appendChild(mlBox);
    var mlIdx = null;
    var drawML = function () {
      if (!mlIdx) return;
      var ids = favGet(), list = ids.map(function (id) { return mlIdx[id]; }).filter(Boolean);
      mlEmpty.hidden = list.length > 0;
      var g = { now: [], soon: [], out: [] };
      list.forEach(function (x) { var st = relOf(x); (st.k === "now" ? g.now : st.k === "soon" ? g.soon : g.out).push({ x: x, st: st }); });
      g.soon.sort(function (a, b) { return (a.x.w || a.x.ym + "-99").localeCompare(b.x.w || b.x.ym + "-99"); });
      var d = { home: ml.getAttribute("data-home"), root: ml.getAttribute("data-root") };
      mlBox.innerHTML = ["now", "soon", "out"].filter(function (k) { return g[k].length; }).map(function (k) {
        return '<section class="section section-tight ml-group"><div class="section-head"><h2>' + esc(MLL[k] || k) + " <small>" + g[k].length + '</small></h2></div><div class="grid">' +
          g[k].map(function (o) { return cardHTML({ id: o.x.id, name: o.x.n, price: o.x.p, lineup: o.x.l, image: o.x.img, genre_label: o.x.g, release_label: o.st.t || o.x.r }, d, null); }).join("") + "</div></section>";
      }).join("");
    };
    fetch(ml.getAttribute("data-index")).then(function (r) { return r.json(); }).then(function (idx) {
      mlIdx = {}; idx.forEach(function (x) { mlIdx[x.id] = x; });
      drawML();
    }).catch(function () { mlEmpty.hidden = false; });
    document.addEventListener("gp-fav", drawML);
  }

  /* ================= 発売週のお知らせ（Web Push）。押した人だけ。★が変わったら送り先の情報も直す ================= */
  (function () {
    var PUSH_KEY = "gp-push", SIG_KEY = "gp-push-sig";
    var lsGet = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
    var lsSet = function (k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} };
    var supported = false;
    try { supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && window.isSecureContext !== false && !!window.fetch; } catch (e) {}
    var ua = navigator.userAgent || "";
    var isIOS = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    var standalone = false;
    try { standalone = navigator.standalone === true || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches); } catch (e) {}
    var b64ToBytes = function (s) {
      s = String(s).replace(/-/g, "+").replace(/_/g, "/");
      while (s.length % 4) s += "=";
      var bin = atob(s), out = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    };
    var getSub = function () {
      if (!supported) return Promise.resolve(null);
      return navigator.serviceWorker.getRegistration("/").then(function (reg) { return reg ? reg.pushManager.getSubscription() : null; }).catch(function () { return null; });
    };
    var api = function (method, body) {
      return fetch("/api/push/subscribe", { method: method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().catch(function () { return { ok: false }; }).then(function (d) { if (!r.ok || !d.ok) throw new Error(d.error || ("HTTP " + r.status)); return d; }); });
    };
    var sigOf = function (a) { return LANG + ":" + a.slice().sort().join(","); };
    var sync = function (sub) {
      var fav = favGet().slice(0, 200);
      var s = sub.toJSON ? sub.toJSON() : sub;
      return api("POST", { subscription: { endpoint: s.endpoint, keys: s.keys }, favorites: fav, lang: LANG }).then(function (d) { lsSet(SIG_KEY, sigOf(fav)); return d; });
    };
    // ★が変わったら（このページでも、ほかのタブでも）少し待ってから送り直す
    var syncT = null;
    var resync = function (force) {
      if (lsGet(PUSH_KEY) !== "1") return;
      if (!force && lsGet(SIG_KEY) === sigOf(favGet().slice(0, 200))) return;
      clearTimeout(syncT);
      syncT = setTimeout(function () {
        getSub().then(function (sub) {
          if (!sub) { lsSet(PUSH_KEY, null); lsSet(SIG_KEY, null); paintAll(); return; }
          return sync(sub);
        }).catch(function () {});
      }, 1500);
    };
    document.addEventListener("gp-fav", function () { resync(false); });

    var boxes = [].slice.call(document.querySelectorAll(".push-box"));
    var state = { on: false, busy: false };
    var paint = function (box) {
      var P = box._P, kind = box.classList.contains("push-ml") ? "ml" : "item";
      var on = box.querySelector(".push-on"), off = box.querySelector(".push-off"), ios = box.querySelector(".push-ios");
      if (!supported) {
        // iPhone・iPad の Safari（ホーム画面に追加していない）は、追加のしかただけ出す
        box.hidden = !(isIOS && !standalone);
        on.hidden = true; off.hidden = true; ios.hidden = box.hidden;
        return;
      }
      box.hidden = kind === "item" && state.on && !box._justOn;
      ios.hidden = true;
      on.hidden = state.on; off.hidden = !state.on || kind === "item";
      on.disabled = off.disabled = state.busy;
      if (kind === "ml" && state.on && !box._msgSet) showMsg(box, P.onNow);
    };
    var paintAll = function () { boxes.forEach(paint); };
    var showMsg = function (box, text) {
      var m = box.querySelector(".push-msg");
      m.textContent = text || ""; m.hidden = !text;
      box._msgSet = !!text;
    };
    boxes.forEach(function (box) {
      try { box._P = JSON.parse(box.getAttribute("data-push") || "{}"); } catch (e) { box._P = {}; }
      var P = box._P;
      box.querySelector(".push-on").addEventListener("click", function () {
        if (state.busy) return;
        var perm = "default"; try { perm = Notification.permission; } catch (e) {}
        if (perm === "denied") { showMsg(box, P.denied); return; }
        state.busy = true; paintAll(); showMsg(box, P.busy);
        // 商品ページで押したときは、その商品も★に入れておく
        var fid = box.getAttribute("data-fav-id");
        if (fid && favGet().indexOf(fid) === -1) { favToggle(fid); paintFav(); }
        var reqPerm = function () {
          try {
            return new Promise(function (res) { var p = Notification.requestPermission(res); if (p && p.then) p.then(res, function () { res("default"); }); });
          } catch (e) { return Promise.resolve("default"); }
        };
        reqPerm().then(function (p) {
          if (p !== "granted") throw new Error(p === "denied" ? "denied" : "dismissed");
          return navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(function () { return navigator.serviceWorker.ready; });
        }).then(function (reg) {
          return reg.pushManager.getSubscription().then(function (sub) {
            if (sub) return sub;
            return fetch("/api/push/key").then(function (r) { return r.json(); }).then(function (d) {
              if (!d || !d.key) throw new Error("key");
              return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(d.key) });
            });
          });
        }).then(function (sub) {
          return sync(sub).catch(function (e) { try { sub.unsubscribe(); } catch (e2) {} throw e; });
        }).then(function () {
          lsSet(PUSH_KEY, "1"); state.on = true; state.busy = false; box._justOn = true;
          paintAll(); showMsg(box, P.done);
          try { document.dispatchEvent(new Event("gp-fav")); } catch (e) {}
        }).catch(function (e) {
          state.busy = false; paintAll();
          showMsg(box, e && e.message === "denied" ? P.denied : e && e.message === "dismissed" ? "" : P.error);
        });
      });
      box.querySelector(".push-off").addEventListener("click", function () {
        if (state.busy) return;
        state.busy = true; paintAll();
        getSub().then(function (sub) {
          if (!sub) return;
          var ep = sub.endpoint;
          return api("DELETE", { endpoint: ep }).catch(function () {}).then(function () { return sub.unsubscribe(); });
        }).then(function () {
          lsSet(PUSH_KEY, null); lsSet(SIG_KEY, null);
          state.on = false; state.busy = false; paintAll(); showMsg(box, P.offDone);
        }).catch(function () { state.busy = false; paintAll(); showMsg(box, P.error); });
      });
    });
    paintAll();
    // いまお知らせを受け取っているか（ブラウザの登録を見る。登録が消えていたら印も消す）
    if (supported && (boxes.length || lsGet(PUSH_KEY) === "1")) {
      getSub().then(function (sub) {
        state.on = !!sub && lsGet(PUSH_KEY) === "1";
        if (!sub && lsGet(PUSH_KEY) === "1") { lsSet(PUSH_KEY, null); lsSet(SIG_KEY, null); }
        paintAll();
        if (state.on) resync(false);
      });
    }
  })();

  /* ================= 発売カレンダー：「この週をもっと見る」 ================= */
  [].forEach.call(document.querySelectorAll(".cal-more-btn"), function (b) {
    b.addEventListener("click", function () {
      var w = b.closest(".cal-week"); var open = w.classList.toggle("open");
      b.textContent = b.getAttribute(open ? "data-close" : "data-open");
      if (!open) w.scrollIntoView({ block: "start" });
    });
  });

  /* ================= 人気ランキング：6位以降は「もっと見る」で10件ずつ ================= */
  var rankMore = document.getElementById("rank-more");
  if (rankMore) rankMore.addEventListener("click", function () {
    var rest = document.querySelectorAll(".rank li.rank-more[hidden]");
    for (var i = 0; i < rest.length && i < 10; i++) rest[i].hidden = false;
    if (rest.length <= 10) rankMore.parentNode.hidden = true;
  });

  /* ================= 入荷速報（トップページ） ================= */
  var feed = document.getElementById("feed");
  if (feed && DATA && window.fetch) {
    var FI = JSON.parse(document.getElementById("feed-i18n").textContent);
    var D = DATA;
    var byId = {};
    fetch(feed.getAttribute("data-api")).then(function (r) { return r.ok ? r.json() : []; }).then(function (rows) {
      if (!rows || !rows.length) return null;
      return loadItems().then(function () { D.items.forEach(function (it) { byId[it.id] = it; }); return rows; });
    }).then(function (rows) {
      if (!rows) return;
      var list = (rows || []).filter(function (r) { return byId[r.item_id]; }).slice(0, 20);
      if (!list.length) return;
      document.getElementById("feed-grid").innerHTML = list.map(function (r) {
        var it = byId[r.item_id];
        var html = cardHTML(it, D, null);
        var note = (r.restocks ? FI.note.replace("{n}", r.restocks) : FI.note0).replace("{s}", r.in_count);
        var badge = '<span class="badge-feed ' + (r.last_kind === "new" ? "is-new" : "") + '">' + esc(r.last_kind === "new" ? FI.isNew : FI.back) + "</span>";
        return html.replace('<div class="thumb">', '<div class="thumb">' + badge).replace('<div class="card-foot">', '<div class="feed-note">' + esc(note) + '</div><div class="card-foot">');
      }).join("");
      feed.hidden = false;
    }).catch(function () {});
  }

  /* ================= みんなのガチャマップ ================= */
  var ago = function (iso) {
    var m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    if (m < 60) return m <= 1 ? "たった今" : m + "分前";
    var h = Math.round(m / 60); if (h < 24) return h + "時間前";
    return Math.round(h / 24) + "日前";
  };
  var whenLeaflet = function (fn) {
    if (window.L) return fn();
    var n = 0, iv = setInterval(function () { if (window.L) { clearInterval(iv); fn(); } else if (++n > 100) clearInterval(iv); }, 100);
  };
  // 広い範囲は国土地理院の淡色地図、近づくとOpenStreetMap（イオンなど建物・お店の名前が出る）に切りかえ
  var tiles = function (map) {
    var L = window.L;
    var gsi = L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", { maxZoom: 19, maxNativeZoom: 18, minZoom: 4, attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>' });
    var osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, minZoom: 4, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' });
    var NEAR = 15, cur = null;
    var pick = function () { var want = map.getZoom() >= NEAR ? osm : gsi; if (cur === want) return; if (cur) map.removeLayer(cur); want.addTo(map); cur = want; };
    map.on("zoomend", pick); map.whenReady ? map.whenReady(pick) : pick();
  };
  // 建物・お店の名前（イオンモール○○など）、地名・駅名から場所を探す
  // まずOpenStreetMapの検索、見つからなければ国土地理院の住所検索
  var geocodeGsi = function (q) {
    return fetch("https://msearch.gsi.go.jp/address-search/AddressSearch?q=" + encodeURIComponent(q)).then(function (r) { return r.json(); }).then(function (a) {
      if (!a || !a.length) return null;
      var c = a[0].geometry.coordinates; return { ll: [c[1], c[0]], title: a[0].properties.title };
    });
  };
  // 候補をいくつか返す（OpenStreetMapの検索2種類を合わせる。名前が少し違っても見つかるように）
  var geocodeList = function (q, near) {
    var c = near ? near.getCenter() : null;
    var nomi = fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=jp&accept-language=ja&q=" + encodeURIComponent(q)).then(function (r) { return r.ok ? r.json() : []; }).then(function (a) {
      return (a || []).map(function (x) { var ad = x.address || {}; var parts = (x.display_name || "").split(", "); return { ll: [Number(x.lat), Number(x.lon)], title: x.name || parts[0], area: parts.slice(1).reverse().filter(function (y) { return !/^(日本|\d{3}-\d{4})$/.test(y); }).slice(0, 3).join(""), addr: parts.slice(1).reverse().filter(function (y) { return !/^(日本|\d{3}-\d{4})$/.test(y); }).join(""), building: /mall|department_store|supermarket|retail|commercial|toys|variety_store/.test(x.type || "") }; });
    }).catch(function () { return []; });
    var pho = fetch("https://photon.komoot.io/api/?limit=6" + (c ? "&lat=" + c.lat.toFixed(4) + "&lon=" + c.lng.toFixed(4) : "") + "&q=" + encodeURIComponent(q)).then(function (r) { return r.ok ? r.json() : { features: [] }; }).then(function (a) {
      return ((a && a.features) || []).filter(function (f) { return f.properties.countrycode === "JP" && !/bus_stop|bicycle_rental|parking|platform/.test(f.properties.osm_value || ""); }).map(function (f) { var p = f.properties; return { ll: [f.geometry.coordinates[1], f.geometry.coordinates[0]], title: p.name || "", area: [p.state, p.city || p.county, p.district || p.locality].filter(Boolean).join(""), addr: [p.state, p.city || p.county, p.district || p.locality, p.street, p.housenumber].filter(Boolean).join(""), building: /mall|department_store|supermarket|retail|commercial|toys|variety_store/.test(p.osm_value || "") }; });
    }).catch(function () { return []; });
    return Promise.all([nomi, pho]).then(function (r) {
      var out = [];
      r[0].concat(r[1]).forEach(function (x) { if (!x.title) return; if (out.some(function (y) { return Math.abs(y.ll[0] - x.ll[0]) < 0.001 && Math.abs(y.ll[1] - x.ll[1]) < 0.001; })) return; out.push(x); });
      var key = NORM(q);
      out.sort(function (a, b) { return (NORM(b.title).indexOf(key) !== -1) - (NORM(a.title).indexOf(key) !== -1); });
      return out.slice(0, 6);
    });
  };
  // ピンの位置から住所（都道府県＋市区町村＋町名・丁目）を作る：国土地理院の住所変換
  var muniReady = null;
  var loadMuni = function () {
    if (muniReady) return muniReady;
    muniReady = new Promise(function (ok) {
      if (window.GSI && window.GSI.MUNI_ARRAY) return ok(window.GSI.MUNI_ARRAY);
      window.GSI = window.GSI || {};
      var sc = document.createElement("script"); sc.src = "https://maps.gsi.go.jp/js/muni.js";
      sc.onload = function () { ok((window.GSI && window.GSI.MUNI_ARRAY) || {}); }; sc.onerror = function () { ok({}); };
      document.head.appendChild(sc);
    });
    return muniReady;
  };
  var addrAt = function (lat, lng) {
    return Promise.all([loadMuni(), fetch("https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=" + lat + "&lon=" + lng).then(function (r) { return r.json(); })]).then(function (r) {
      var x = r[1] && r[1].results; if (!x) return "";
      var row = null, M = r[0];
      for (var k in M) if (Number(k) === Number(x.muniCd)) { row = M[k]; break; }
      if (!row) return "";
      var p = String(row).split(",");
      return (p[1] || "") + String(p[3] || "").replace(/[\s　]/g, "") + (x.lv01Nm && x.lv01Nm !== "－" ? x.lv01Nm : "");
    }).catch(function () { return ""; });
  };
  var geocode = function (q, near) {
    return geocodeList(q, near).then(function (a) { return a.length ? a[0] : geocodeGsi(q); }).catch(function () { return geocodeGsi(q); });
  };
  var post = function (url, body) {
    return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function (r) { return r.json().then(function (d) { d._status = r.status; return d; }); });
  };

  var mapEl = document.getElementById("map");
  if (mapEl && !document.getElementById("shop")) whenLeaflet(function () {
    var L = window.L, root = mapEl.getAttribute("data-root");
    var map = L.map(mapEl, { preferCanvas: true, zoomControl: true }).setView([36.3, 137.8], 5);
    tiles(map);
    var markers = {}, list = [];
    var popup = function (s) {
      return '<b>' + esc(s[1]) + '</b><br><span style="color:#6b7194">' + esc(s[2] || "") + (s[5] ? "・みんなが追加" : "") + '</span><br><a href="' + root + 'shop/' + esc(s[0]) + '">お店のページ（在庫・報告）→</a>';
    };
    var add = function (s) {
      var m = L.circleMarker([s[3], s[4]], { radius: 7, weight: 2, color: "#fff", fillColor: s[5] ? (s[6] === "gacha" ? "#8b5cf6" : "#2ccfa6") : "#ff4f7b", fillOpacity: 0.95 }).addTo(map).bindPopup(popup(s));
      markers[s[0]] = m; list.push(s);
    };
    var load = function (u) { return fetch(u).then(function (r) { if (!r.ok) throw 0; return r.json(); }); };
    load(mapEl.getAttribute("data-shops")).catch(function () { return load(mapEl.getAttribute("data-fallback")); }).then(function (rows) {
      rows.forEach(add);
      var h = decodeURIComponent(location.hash.slice(1));
      if (h && markers[h]) { map.setView(markers[h].getLatLng(), 16); markers[h].openPopup(); }
    });
    document.getElementById("map-geo").addEventListener("click", function () {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(function (p) {
        map.setView([p.coords.latitude, p.coords.longitude], 14);
        if (p.coords.accuracy > 1000) window.L.circle([p.coords.latitude, p.coords.longitude], { radius: p.coords.accuracy, color: "#3aa0ff", weight: 1, fillOpacity: 0.06 }).addTo(map).bindTooltip("このあたり（誤差 約" + Math.round(p.coords.accuracy / 1000) + "km）", { permanent: true }).openTooltip();
      }, function () {}, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    });
    var q = document.getElementById("map-q");
    q.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      e.preventDefault();
      var v = NORM(q.value); if (!v) return;
      var hits = list.filter(function (s) { return NORM(s[1] + (s[2] || "")).indexOf(v) !== -1; });
      if (!hits.length) { geocode(q.value.trim(), map.getBounds()).then(function (g) { if (g) map.setView(g.ll, g.building ? 17 : 15); }).catch(function () {}); return; }
      if (hits.length === 1) { map.setView([hits[0][3], hits[0][4]], 16); markers[hits[0][0]].openPopup(); }
      else map.fitBounds(L.latLngBounds(hits.map(function (s) { return [s[3], s[4]]; })), { maxZoom: 15, padding: [30, 30] });
    });
    /* ---- ガチャ活：近いお店を効率よく回る順番を作る ---- */
    var K = document.getElementById("katsu");
    if (K) (function () {
      var routeLayer = L.layerGroup().addTo(map), shopItems = null, itemIdx = null, plan = "count", dest = null, picking = false, destLayer = L.layerGroup().addTo(map);
      var kmsg = document.getElementById("k-msg"), $ = function (id) { return document.getElementById(id); };
      var hav = function (a, b) {
        var R = 6371, t = Math.PI / 180, dLa = (b[0] - a[0]) * t, dLo = (b[1] - a[1]) * t;
        var x = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a[0] * t) * Math.cos(b[0] * t) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
        return 2 * R * Math.asin(Math.sqrt(x));
      };
      var SPEED = { walking: 4.5, bicycling: 12, transit: 18, driving: 25 }, DETOUR = 1.3; // 道のり＝まっすぐの距離×1.3 の目安
      var minsOf = function (km, mode) { return km * DETOUR / SPEED[mode] * 60; };
      // 作り方の切り替え
      [].forEach.call(K.querySelectorAll("[data-plan]"), function (b) {
        b.addEventListener("click", function () {
          plan = b.getAttribute("data-plan");
          [].forEach.call(K.querySelectorAll("[data-plan]"), function (x) { x.classList.toggle("is-on", x === b); });
          [].forEach.call(K.querySelectorAll("[data-for]"), function (el) { el.hidden = el.getAttribute("data-for").split(" ").indexOf(plan) === -1; });
        });
      });
      fetch(K.getAttribute("data-search")).then(function (r) { return r.json(); }).then(function (idx) {
        itemIdx = idx;
        $("k-items").innerHTML = idx.slice(0, 400).map(function (x) { return '<option value="' + esc(x.n) + '">'; }).join("");
      }).catch(function () {});
      var fillShops = function () { $("k-shops").innerHTML = list.slice(0, 1500).map(function (s) { return '<option value="' + esc(s[1]) + '">'; }).join(""); };
      setTimeout(fillShops, 1500);
      var setDest = function (ll, label) {
        dest = ll; destLayer.clearLayers();
        L.circleMarker(ll, { radius: 9, weight: 3, color: "#fff", fillColor: "#8b5cf6", fillOpacity: 1 }).addTo(destLayer).bindTooltip("目的地", { permanent: true, direction: "top" });
        $("k-dest-note").textContent = "目的地：" + (label || "地図でえらんだ場所");
      };
      $("k-dest").addEventListener("change", function () {
        var v = NORM($("k-dest").value); if (!v) return;
        var hit = list.filter(function (s) { return NORM(s[1]) === v; })[0] || list.filter(function (s) { return NORM(s[1]).indexOf(v) !== -1; })[0];
        if (hit) setDest([hit[3], hit[4]], hit[1]); // 地図は動かさない（「地図の真ん中から作る」の出発点が変わらないように）
      });
      $("k-pick").addEventListener("click", function () { picking = true; kmsg.textContent = "地図の目的地をタップしてください。"; mapEl.scrollIntoView({ behavior: "smooth", block: "center" }); });
      map.on("click", function (e) { if (!picking) return; picking = false; setDest([e.latlng.lat, e.latlng.lng]); kmsg.textContent = "目的地を決めました。"; });
      var loadItems = function () {
        if (shopItems) return Promise.resolve(shopItems);
        return fetch(K.getAttribute("data-items")).then(function (r) { return r.json(); }).then(function (d) { shopItems = d; return d; });
      };
      var MAXS = 15;
      var excluded = {}, lastStart = null, noteAfter = "";
      // ルートのお店ごとの☆・流れるコメントと、その場で☆・コメントする欄
      var drawRev = function (el, v) {
        var st = v.n ? '<span class="stars-v" style="--v:' + v.avg + '"></span><b>' + Number(v.avg).toFixed(1) + "</b><small>（" + v.n + "人）</small>" : '<small class="k-rev-none">まだ評価はありません</small>';
        var cm = v.comments || [];
        var tk = cm.length ? '<div class="k-tick"><div class="k-tick-in">' + cm.map(function (c) { return "<span>💬 " + esc(c.body) + "</span>"; }).join("") + "</div></div>" : '<small class="k-rev-none">コメントはまだありません</small>';
        var sid2 = el.getAttribute("data-sid"), mine = 0; try { mine = Number(localStorage.getItem("rate:" + sid2)) || 0; } catch (e) {}
        el.innerHTML = '<div class="k-rev-stars">' + st + '<button type="button" class="k-rv-open" aria-expanded="false">☆・コメントする</button></div>' + tk +
          '<div class="k-rv-form" hidden><div class="rate-pick rate-pick-sm">' + [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" data-v="' + n + '" class="' + (n <= mine ? "on" : "") + '" aria-label="' + n + 'つ星">★</button>'; }).join("") +
          '</div><textarea maxlength="140" rows="2" placeholder="お店のようす（台数・場所・品ぞろえなど）140文字まで"></textarea><div class="map-add-btns"><button type="button" class="btn btn-gold k-rv-send">送る</button><span class="fine k-rv-msg" role="status"></span></div></div>';
        var tin = el.querySelector(".k-tick-in"); if (tin) tin.style.animationDuration = Math.max(12, cm.reduce(function (a, c) { return a + c.body.length; }, 0) * 0.35) + "s";
      };
      var refreshRev = function (el) { var id = el.getAttribute("data-sid"); fetch(root + "api/shopsummary?ids=" + id + "&t=" + Date.now()).then(function (r) { return r.ok ? r.json() : {}; }).then(function (sm) { drawRev(el, sm[id] || {}); }).catch(function () {}); };
      $("k-list").addEventListener("click", function (e) {
        var t = e.target, el = t.closest && t.closest(".k-rev"); if (!el) return;
        var f = el.querySelector(".k-rv-form"), sid2 = el.getAttribute("data-sid"), msg2 = el.querySelector(".k-rv-msg");
        if (t.closest(".k-rv-open")) { f.hidden = !f.hidden; t.closest(".k-rv-open").setAttribute("aria-expanded", String(!f.hidden)); return; }
        var sb = t.closest(".rate-pick button");
        if (sb) { var v = Number(sb.getAttribute("data-v")); f.setAttribute("data-v", v); [].forEach.call(f.querySelectorAll(".rate-pick button"), function (b) { b.classList.toggle("on", Number(b.getAttribute("data-v")) <= v); }); return; }
        if (t.closest(".k-rv-send")) {
          var stars = Number(f.getAttribute("data-v")) || 0, body = f.querySelector("textarea").value.trim();
          if (!stars && body.length < 2) { msg2.textContent = "☆をえらぶか、コメントを書いてください。"; return; }
          msg2.textContent = "送っています…";
          var jobs = [];
          if (stars) jobs.push(post(root + "api/rate", { shop: sid2, stars: stars }).then(function (d) { if (!d.ok) throw new Error(d.error); try { localStorage.setItem("rate:" + sid2, stars); } catch (e2) {} }));
          if (body.length >= 2) jobs.push(post(root + "api/comment", { shop: sid2, body: body }).then(function (d) { if (!d.ok) throw new Error(d.error); }));
          Promise.all(jobs).then(function () { refreshRev(el); }).catch(function (er) {
            var c = er && er.message;
            msg2.textContent = c === "ng" ? "使えない言葉が入っています。書き方を変えてください。" : c === "limit" ? "今日はこれ以上送れません。また明日お願いします。" : c === "dup" ? "同じコメントはもう送っています。" : c === "length" ? "コメントは2〜140文字で書いてください。" : "送れませんでした。時間をおいてもう一度お試しください。";
          });
        }
      });
      var build = function (start, keep) {
        if (!keep) excluded = {};
        lastStart = start;
        var mode = $("k-mode").value, want = NORM($("k-item").value);
        var back = plan !== "dest" && $("k-back").checked;
        if (plan === "dest" && !dest) { kmsg.textContent = "目的地を決めてください（お店の名前を入れるか、地図をタップ）。"; return; }
        var end = plan === "dest" ? dest : back ? start : null;
        var n = plan === "count" ? Number($("k-n").value) : MAXS;
        var budget = plan === "time" ? Number($("k-time").value) : Infinity;
        var stay = plan === "time" ? Number($("k-stay").value) : 0;
        var detour = plan === "dest" ? Number($("k-detour").value) : Infinity;
        // 探す範囲：移動の速さと時間から
        var reach = plan === "time" ? SPEED[mode] * (budget / 60) / DETOUR / (back ? 2 : 1) : ({ walking: 3, bicycling: 7, transit: 10, driving: 20 })[mode] || 5;
        kmsg.textContent = "ルートを作っています…";
        (want ? loadItems() : Promise.resolve(null)).then(function (si) {
          var cand = list;
          if (want && si) {
            var hitIds = (itemIdx || []).filter(function (x) { return NORM(x.n).indexOf(want) !== -1; }).map(function (x) { return x.id; });
            var wantIx = {}; si.items.forEach(function (id, i) { if (hitIds.indexOf(id) !== -1) wantIx[i] = 1; });
            cand = list.filter(function (s) { return (si.shops[s[0]] || []).some(function (i) { return wantIx[i]; }); });
            if (!cand.length) { kmsg.textContent = "そのガチャの取扱があるお店が見つかりませんでした（公式の取扱店だけで探しています）。名前を短くしてみてください。"; return; }
          }
          var direct = end ? hav(start, end) : 0;
          cand = cand.filter(function (s) { return !excluded[s[0]]; });
          var all0 = cand.map(function (s) { return { s: s, p: [s[3], s[4]], d: hav(start, [s[3], s[4]]) }; });
          cand = all0.filter(function (x) {
            if (plan === "dest") { var extra = x.d + hav(x.p, end) - direct; return minsOf(extra, mode) <= detour; }
            return x.d <= reach;
          });
          // 「お店の数」で近くに足りないときは、少し遠いお店（近い範囲の4倍まで）も足す
          if (plan === "count" && cand.length < n) {
            var more = all0.filter(function (x) { return x.d > reach && x.d <= reach * 4; }).sort(function (a, b) { return a.d - b.d; }).slice(0, n - cand.length);
            if (more.length) { noteAfter = (noteAfter ? noteAfter + " " : "") + "近く（約" + reach + "km以内）には" + cand.length + "店しかないので、少し遠いお店も入れています。"; cand = cand.concat(more); }
          }
          if (!cand.length) { kmsg.textContent = plan === "dest" ? "寄り道できるお店が見つかりませんでした。寄り道の時間を長くしてみてください。" : "近くにお店が見つかりませんでした。移動を変えるか、時間を長くしてみてください。"; return; }
          cand = cand.sort(function (a, b) { return hav(start, a.p) - hav(start, b.p); }).slice(0, 60);
          // 道のり（km）と、かかる時間（分）
          var pathKm = function (r) { var p = [start].concat(r.map(function (x) { return x.p; })); if (end) p.push(end); var t = 0; for (var i = 1; i < p.length; i++) t += hav(p[i - 1], p[i]); return t; };
          var minsAll = function (r) { return minsOf(pathKm(r), mode) + stay * r.length; };
          var ok = function (r) {
            if (r.length > n || r.length > MAXS) return false;
            if (plan === "time") return minsAll(r) <= budget;
            if (plan === "dest") return minsOf(pathKm(r) - direct, mode) <= detour;
            return true;
          };
          // いちばん道のりが増えない場所に、1店ずつ差し込んでいく（入らなくなったら終わり）
          var route = [], pool = cand.slice();
          while (pool.length) {
            var best = null;
            pool.forEach(function (c, ci) {
              for (var i = 0; i <= route.length; i++) {
                if (!end && i < route.length && false) continue;
                var r2 = route.slice(0, i).concat([c], route.slice(i));
                var add = pathKm(r2) - pathKm(route);
                if (!best || add < best.add) best = { add: add, r: r2, ci: ci };
              }
            });
            if (!best || !ok(best.r)) break;
            route = best.r; pool.splice(best.ci, 1);
            if (plan === "count" && route.length >= n) break;
          }
          // 順番の入れ替えで、さらに短くする
          var improved = true, guard = 0;
          while (improved && guard++ < 60) {
            improved = false;
            for (var i = 0; i < route.length - 1; i++) for (var j = i + 1; j < route.length; j++) {
              var r2 = route.slice(0, i).concat(route.slice(i, j + 1).reverse(), route.slice(j + 1));
              if (pathKm(r2) + 1e-9 < pathKm(route)) { route = r2; improved = true; }
            }
          }
          if (!route.length) { kmsg.textContent = plan === "time" ? "その時間では回れるお店がありませんでした。時間を長くしてみてください。" : "回れるお店が見つかりませんでした。"; return; }
          // 地図に描く
          routeLayer.clearLayers();
          var line = [start].concat(route.map(function (x) { return x.p; })); if (end) line.push(end);
          L.polyline(line, { color: "#3aa0ff", weight: 4, opacity: 0.85, dashArray: "8 8" }).addTo(routeLayer);
          L.circleMarker(start, { radius: 8, weight: 3, color: "#fff", fillColor: "#3aa0ff", fillOpacity: 1 }).addTo(routeLayer).bindTooltip("出発", { permanent: true, direction: "top" });
          route.forEach(function (x, i) {
            L.marker(x.p, { icon: L.divIcon({ className: "k-pin", html: "<b>" + (i + 1) + "</b>", iconSize: [28, 28], iconAnchor: [14, 14] }) }).addTo(routeLayer).bindPopup(popup(x.s));
          });
          map.fitBounds(L.latLngBounds(line), { padding: [40, 40], maxZoom: 16 });
          var km = pathKm(route) * DETOUR, mv = Math.round(minsOf(pathKm(route), mode)), st2 = (plan === "time" ? stay : 10) * route.length;
          $("k-sum").textContent = plan === "dest"
            ? "目的地までに" + route.length + "店に寄れます：道のり約" + km.toFixed(1) + "km・移動 約" + mv + "分（まっすぐ行くより約" + Math.round(minsOf(pathKm(route) - direct, mode)) + "分多いだけ）"
            : plan === "time"
              ? $("k-time").selectedOptions[0].textContent + "で" + route.length + "店回れます：移動 約" + mv + "分＋お店で " + st2 + "分＝約" + (mv + st2) + "分（道のり約" + km.toFixed(1) + "km）"
              : route.length + "店を回るルート：道のり約" + km.toFixed(1) + "km・移動の目安 約" + mv + "分（お店で1店10分見ると合計 約" + (mv + st2) + "分）";
          var p0 = start;
          $("k-list").innerHTML = route.map(function (x, i) {
            var d = hav(p0, x.p) * DETOUR; p0 = x.p;
            return '<li><b>' + (i + 1) + '. <a href="' + root + "shop/" + esc(x.s[0]) + '">' + esc(x.s[1]) + "</a></b><small>前の場所から約" + (d < 1 ? Math.round(d * 1000) + "m" : d.toFixed(1) + "km") + "・" + Math.max(1, Math.round(minsOf(hav(i ? route[i - 1].p : start, x.p), mode))) + "分</small>" +
              '<span class="k-acts"><button type="button" class="k-pop" data-sid="' + esc(x.s[0]) + '" aria-expanded="false">▾ この店に在庫のある人気ガチャを見る</button><button type="button" class="k-del" data-sid="' + esc(x.s[0]) + '">✕ この店を外す</button></span><div class="k-pop-box" hidden></div><div class="k-rev" data-sid="' + esc(x.s[0]) + '"></div></li>';
          }).join("") + (end && plan === "dest" ? '<li><b>🏁 目的地</b></li>' : "");
          // Googleマップは経由地が9か所までなので、10店をこえるときは2つに分ける
          var ll = function (p) { return p[0].toFixed(6) + "," + p[1].toFixed(6); };
          var seq = [start].concat(route.map(function (x) { return x.p; })); if (end) seq.push(end);
          var links = [], from = 0;
          while (from < seq.length - 1) {
            var to = Math.min(seq.length - 1, from + 10);
            var mid = seq.slice(from + 1, to).map(ll);
            links.push({ a: from, b: to, href: "https://www.google.com/maps/dir/?api=1&origin=" + ll(seq[from]) + "&destination=" + ll(seq[to]) + (mid.length ? "&waypoints=" + encodeURIComponent(mid.join("|")) : "") + "&travelmode=" + mode });
            from = to;
          }
          $("k-gmaps").innerHTML = links.map(function (l, i) {
            var lab = links.length === 1 ? "Googleマップでナビを開く" : "Googleマップでナビ（" + (i === 0 ? "出発" : l.a + "店目") + "→" + (l.b > route.length ? "目的地" : l.b + "店目") + "）";
            return '<a class="btn' + (i === 0 ? " btn-gold" : "") + '" target="_blank" rel="noopener" href="' + esc(l.href) + '">' + lab + "</a>";
          }).join("");
          // 各お店の☆評価と新しいコメント
          var ids = route.map(function (x) { return x.s[0]; });
          fetch(root + "api/shopsummary?ids=" + ids.join(",")).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }).then(function (sm) {
            [].forEach.call(document.querySelectorAll("#k-list .k-rev"), function (el) { drawRev(el, sm[el.getAttribute("data-sid")] || {}); });
          });
          var wantRaw = $("k-item").value.trim();
          if (wantRaw) { var fw = aff(wantRaw + " ガチャ コンプ"); $("k-sum").innerHTML = esc($("k-sum").textContent) + '<span class="k-aff k-aff-big">「' + esc(wantRaw) + '」が見つからなかったら通販でも：<a href="' + esc(fw.a) + '" target="_blank" rel="sponsored noopener">Amazonで探す</a><a href="' + esc(fw.r) + '" target="_blank" rel="sponsored noopener">楽天で探す</a><i class="pr">PR</i></span>'; }
          var nEx = Object.keys(excluded).length;
          $("k-ex").innerHTML = nEx ? "外したお店：" + nEx + '店　<button type="button" class="k-pop" id="k-ex-reset">外したお店を元に戻す</button>' : "";
          $("k-result").hidden = false;
          kmsg.textContent = (noteAfter ? noteAfter + " " : "") + (route.length >= MAXS && plan !== "count" ? "回るお店は15店までにしています。" : plan === "count" && route.length < n ? "近くのお店が" + route.length + "店だったので、" + route.length + "店で作りました。" : ""); noteAfter = "";
          $("k-result").scrollIntoView({ behavior: "smooth", block: "nearest" });
        }).catch(function () { kmsg.textContent = "ルートを作れませんでした。時間をおいてもう一度お試しください。"; });
      };
      // ルートのお店ごとに「在庫のある人気ガチャ」を開く・閉じる
      var quizItems = null;
      var AMZ = K.getAttribute("data-amz"), RAK = K.getAttribute("data-rak");
      var aff = function (q) {
        var rs = "https://search.rakuten.co.jp/search/mall/" + encodeURIComponent(q) + "/";
        return { a: "https://www.amazon.co.jp/s?k=" + encodeURIComponent(q) + (AMZ ? "&tag=" + encodeURIComponent(AMZ) : ""), r: RAK ? "https://hb.afl.rakuten.co.jp/hgc/" + RAK + "/?pc=" + encodeURIComponent(rs) + "&m=" + encodeURIComponent(rs) : rs };
      };
      var loadQuiz = function () {
        if (quizItems) return Promise.resolve(quizItems);
        return fetch(K.getAttribute("data-quiz")).then(function (r) { return r.json(); }).then(function (a) { quizItems = {}; a.forEach(function (it) { quizItems[it.id] = it; }); return quizItems; });
      };
      $("k-list").addEventListener("click", function (e) {
        var del = e.target.closest && e.target.closest(".k-del");
        if (del) { excluded[del.getAttribute("data-sid")] = 1; noteAfter = "そのお店を外して、ルートを作り直しました。"; build(lastStart, true); return; }
        var b = e.target.closest && e.target.closest(".k-pop"); if (!b) return;
        var box = b.nextElementSibling, open = b.getAttribute("aria-expanded") === "true";
        if (open) { box.hidden = true; b.setAttribute("aria-expanded", "false"); b.textContent = "▾ この店に在庫のある人気ガチャを見る"; return; }
        b.setAttribute("aria-expanded", "true"); b.textContent = "▴ 閉じる"; box.hidden = false;
        if (box.getAttribute("data-done")) return;
        box.innerHTML = '<p class="fine">読み込み中…</p>';
        Promise.all([loadItems(), loadQuiz()]).then(function (r) {
          var si = r[0], qi = r[1], sid = b.getAttribute("data-sid");
          var ids = (si.shops[sid] || []).map(function (i) { return si.items[i]; }).filter(function (id) { return qi[id]; });
          ids.sort(function (a, b2) { return (qi[b2].popularity || 0) - (qi[a].popularity || 0) || (qi[b2].ad > qi[a].ad ? 1 : -1); });
          box.innerHTML = ids.length ? '<ol class="k-pop-list">' + ids.slice(0, 10).map(function (id) {
            var it = qi[id];
            var f = aff(it.jn + " ガチャ コンプ");
            return '<li><a href="' + root + "item/" + esc(id) + '">' + (it.image ? '<img src="' + root + esc(it.image) + '" alt="" loading="lazy" width="40" height="40">' : "") + "<span>" + esc(it.name) + "</span><em>¥" + it.price + "</em></a>" +
              '<span class="k-aff">売り切れなら通販で：<a href="' + esc(f.a) + '" target="_blank" rel="sponsored noopener">Amazon</a><a href="' + esc(f.r) + '" target="_blank" rel="sponsored noopener">楽天</a><i class="pr">PR</i></span></li>';
          }).join("") + "</ol>" + (ids.length > 10 ? '<p class="fine">ほか' + (ids.length - 10) + '種。<a href="' + root + "shop/" + esc(sid) + '">お店のページで全部見る→</a></p>' : "") + '<p class="fine">バンダイ公式「ガシャポンどこ？」で取扱のあるガチャです（通信機能のあるマシンのみ）。</p>'
            : '<p class="fine">公式の取扱情報がまだないお店です。<a href="' + root + "shop/" + esc(sid) + '">お店のページ</a>で、みんなの在庫報告を見られます。</p>';
          box.setAttribute("data-done", "1");
        }).catch(function () { box.innerHTML = '<p class="fine">読み込めませんでした。</p>'; });
      });

      $("k-go").addEventListener("click", function () {
        if (!navigator.geolocation) { kmsg.textContent = "この端末では現在地が使えません。「地図の真ん中から作る」をお使いください。"; return; }
        kmsg.textContent = "現在地を調べています…（位置はこの端末の中だけで使います）";
        navigator.geolocation.getCurrentPosition(function (p) {
          build([p.coords.latitude, p.coords.longitude]);
          // パソコンなどGPSがない端末では、ネットの接続先から大まかに決まるので、何kmもずれることがある
          if (p.coords.accuracy > 1000) setTimeout(function () { kmsg.textContent = "⚠ 現在地の精度が低いようです（誤差 約" + Math.round(p.coords.accuracy / 1000) + "km）。パソコンだと、ネットの接続先の場所（大きな駅の近くなど）になることがあります。ずれていたら、上の欄に「新宿駅」「渋谷」のように出発する場所を入れて「この場所から作る」を押してください。"; }, 50);
        }, function () { kmsg.textContent = "現在地がわかりませんでした。地図を動かして「地図の真ん中から作る」をお試しください。"; }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
      });
      $("k-here").addEventListener("click", function () { var c = map.getCenter(); build([c.lat, c.lng]); });
      var startByName = function () {
        var q = $("k-start").value.trim(); if (!q) { kmsg.textContent = "出発する場所を入れてください。"; return; }
        kmsg.textContent = "場所を探しています…";
        geocode(q).then(function (g) { if (!g) { kmsg.textContent = "その場所が見つかりませんでした。駅名や市町村名で試してください。"; return; } build(g.ll); }).catch(function () { kmsg.textContent = "場所を探せませんでした。時間をおいてもう一度お試しください。"; });
      };
      $("k-start-go").addEventListener("click", startByName);
      $("k-start").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); startByName(); } });
      $("k-ex").addEventListener("click", function (e) { if (e.target.id === "k-ex-reset" && lastStart) { excluded = {}; build(lastStart, true); } });
      $("k-clear").addEventListener("click", function () { routeLayer.clearLayers(); $("k-result").hidden = true; kmsg.textContent = ""; });
    })();

    // お店を追加
    var box = document.getElementById("map-add-box"), msg = document.getElementById("add-msg");
    document.getElementById("map-add").addEventListener("click", function () {
      box.hidden = false; mapEl.classList.add("is-adding");
      if (map.getZoom() < 15) msg.textContent = "地図を拡大して、お店の場所に＋を合わせてください。";
      box.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    var placeGo = function () {
      var q2 = document.getElementById("add-place").value.trim(); if (!q2) { msg.textContent = "建物やお店の名前を入れてください（例：イオンモール和泉府中）。"; return; }
      var pc = document.getElementById("add-place-c"); pc.innerHTML = ""; msg.textContent = "探しています…";
      geocodeList(q2, map.getBounds()).then(function (a) {
        if (!a.length) { msg.textContent = "見つかりませんでした。「イオン 和泉府中」のように短く分けるか、住所や駅名で試してください。"; return; }
        msg.textContent = "当てはまる場所をえらんでください（ちがう場所しか出ないときは「イオン 和泉府中」のように、名前を分けて探すと見つかりやすいです）。";
        pc.innerHTML = a.map(function (g, i) { return '<button type="button" class="sort" data-i="' + i + '"><b>' + esc(g.title) + "</b> <small>" + esc(g.area || "") + "</small></button>"; }).join("");
        pc.onclick = function (e) {
          var bt = e.target.closest && e.target.closest("button"); if (!bt) return;
          var g = a[Number(bt.getAttribute("data-i"))]; map.setView(g.ll, 18); pc.innerHTML = "";
          var ad = document.getElementById("add-addr");
          if (!ad.value.trim() || ad.getAttribute("data-auto") === ad.value) addrAt(g.ll[0], g.ll[1]).then(function (a) { if (a && (!ad.value.trim() || ad.getAttribute("data-auto") === ad.value)) { ad.value = a; ad.setAttribute("data-auto", a); } });
          msg.textContent = "「" + g.title + "」に移動しました。建物の中のお店の場所に＋を合わせて追加してください。";
        };
      }).catch(function () { msg.textContent = "探せませんでした。時間をおいてもう一度お試しください。"; });
    };
    document.getElementById("add-place-go").addEventListener("click", placeGo);
    document.getElementById("add-place").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); placeGo(); } });
    document.getElementById("add-cancel").addEventListener("click", function () { box.hidden = true; mapEl.classList.remove("is-adding"); msg.textContent = ""; });
    document.getElementById("add-send").addEventListener("click", function () {
      var name = document.getElementById("add-name").value.trim();
      if (name.length < 2) { msg.textContent = "お店の名前を入れてください。"; return; }
      if (map.getZoom() < 15) { msg.textContent = "場所がずれないよう、もっと地図を拡大してから追加してください。"; return; }
      var c = map.getCenter();
      msg.textContent = "送っています…";
      var adEl = document.getElementById("add-addr"), typed = adEl.value.trim();
      var auto = !typed || adEl.getAttribute("data-auto") === adEl.value;
      (auto ? addrAt(c.lat, c.lng) : Promise.resolve(typed)).then(function (address) {
      if (!address) address = auto ? "" : typed;
      return post(root + "api/shops", { name: name, address: address, kind: document.getElementById("add-kind").value, memo: document.getElementById("add-memo").value.trim(), lat: c.lat, lng: c.lng }).then(function (d) {
        if (d.ok) {
          add([d.id, name, "", c.lat, c.lng, 1]); markers[d.id].openPopup();
          msg.textContent = "追加しました！ありがとうございます。お店のページは数時間後にできます。";
          document.getElementById("add-name").value = ""; adEl.value = ""; adEl.removeAttribute("data-auto"); document.getElementById("add-memo").value = "";
          mapEl.classList.remove("is-adding");
        } else msg.textContent = d.error === "ng" ? "使えない言葉が入っています。書き方を変えてください。" : d.error === "dup" ? "このお店はもう地図にあります。" : d.error === "limit" ? "今日追加できる数を超えました。また明日お願いします。" : "追加できませんでした。名前と場所を確かめてください。";
      });
      }).catch(function () { msg.textContent = "送れませんでした。時間をおいてもう一度お試しください。"; });
    });
  });

  // 抽選情報：受付中・開始前の表示と、終わったものを隠す、都道府県でしぼる
  var lotList = document.getElementById("lot-list");
  if (lotList) {
    var jstNow = function () { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16); };
    var paintLot = function () {
      var n = jstNow(), soon = new Date(Date.now() + 9 * 3600e3 + 24 * 3600e3).toISOString().slice(0, 16);
      [].forEach.call(lotList.querySelectorAll(".lot"), function (li) {
        var st = li.getAttribute("data-start"), en = li.getAttribute("data-end"), lab = li.querySelector(".lot-state");
        if (en < n) { li.classList.add("is-over"); lab.textContent = "受付終了"; return; }
        if (st > n) { lab.textContent = "開始前"; lab.className = "lot-state is-before"; }
        else if (en <= soon) { lab.textContent = "まもなく締切"; lab.className = "lot-state is-soon"; }
        else { lab.textContent = "受付中"; lab.className = "lot-state is-open"; }
      });
      lotGroups();
    };
    // 商品ごとのカード：見えるお店がひとつもなければカードごと隠す
    var lotGroups = function () {
      [].forEach.call(lotList.querySelectorAll(".lot-group"), function (g) {
        var vis = [].some.call(g.querySelectorAll(".lot"), function (li) { return !li.hidden && !li.classList.contains("is-over"); });
        g.hidden = !vis;
      });
    };
    paintLot(); setInterval(paintLot, 60000);
    var lf = document.getElementById("lot-filter");
    if (lf) lf.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("button"); if (!b) return;
      [].forEach.call(lf.querySelectorAll("button"), function (x) { x.classList.toggle("is-on", x === b); });
      var p = b.getAttribute("data-pref");
      [].forEach.call(lotList.querySelectorAll(".lot"), function (li) { li.hidden = !!p && li.getAttribute("data-pref") !== p; });
      lotGroups();
    });
  }

  // ☆評価の高いお店：都道府県でしぼる（最新の順位に入れかえ）
  var topEl = document.getElementById("top-shops");
  if (topEl) (function () {
    var R = topEl.getAttribute("data-root"), sel = document.getElementById("ts-pref"), all = [];
    try { all = JSON.parse(topEl.getAttribute("data-init")) || []; } catch (e) {}
    var drawTop = function () {
      var p = sel.value, a = all.filter(function (x) { return !p || x.pref === p; }).slice(0, 30);
      topEl.innerHTML = a.length ? a.map(function (x, i) {
        return '<li><span class="ts-rank">' + (i + 1) + '</span><a href="' + R + "shop/" + esc(x.id) + '"><b>' + esc(x.name) + "</b><span>" + esc(x.pref || "") + '</span></a><span class="shop-stars"><span class="stars-v" style="--v:' + x.avg + '"></span><b class="stars-n">' + Number(x.avg).toFixed(1) + "</b><small>（" + x.n + "）</small></span></li>";
      }).join("") : '<li class="fine">' + (p ? p + "のお店には" : "") + 'まだ評価がありません。行ったことのあるお店のページで☆をつけてみてください。</li>';
    };
    var h = decodeURIComponent(location.hash.slice(1)), saved = ""; try { saved = localStorage.getItem("ts-pref") || ""; } catch (e) {}
    var init = h || saved; if (init && [].some.call(sel.options, function (o) { return o.value === init; })) sel.value = init;
    sel.addEventListener("change", function () { try { localStorage.setItem("ts-pref", sel.value); } catch (e) {} history.replaceState(null, "", sel.value ? "#" + encodeURIComponent(sel.value) : location.pathname); drawTop(); });
    drawTop();
    fetch(topEl.getAttribute("data-api")).then(function (r) { return r.ok ? r.json() : null; }).then(function (a) { if (a && a.length) { all = a; drawTop(); } }).catch(function () {});
  })();

  var shopEl = document.getElementById("shop");
  if (shopEl) {
    var sid = shopEl.getAttribute("data-id");
    var lat = Number(shopEl.getAttribute("data-lat")), lng = Number(shopEl.getAttribute("data-lng"));
    var shopMap = null, shopPin = null, liveLL = null;
    whenLeaflet(function () {
      var L = window.L, m = L.map("shop-map", { scrollWheelZoom: false }).setView([lat, lng], 17);
      tiles(m); shopMap = m;
      if (liveLL) m.setView(liveLL, 17);
      shopPin = L.circleMarker(liveLL || [lat, lng], { radius: 9, weight: 3, color: "#fff", fillColor: "#ff4f7b", fillOpacity: 1 }).addTo(m);
    });
    // ピンの位置を直す（だれでも）
    (function () {
      var st = document.getElementById("mv-start"); if (!st) return;
      var box = document.getElementById("mv-box"), mm = document.getElementById("mv-msg"), me = document.getElementById("shop-map");
      var stop = function () { box.hidden = true; st.hidden = false; me.classList.remove("is-adding"); if (shopMap) shopMap.scrollWheelZoom.disable(); };
      st.addEventListener("click", function () {
        if (!shopMap) return; box.hidden = false; st.hidden = true; mm.textContent = "";
        me.classList.add("is-adding"); shopMap.scrollWheelZoom.enable(); shopMap.setView(shopPin.getLatLng(), 18);
      });
      document.getElementById("mv-cancel").addEventListener("click", function () { stop(); if (shopPin) shopMap.setView(shopPin.getLatLng(), 17); });
      document.getElementById("mv-save").addEventListener("click", function () {
        var c = shopMap.getCenter(); mm.textContent = "送っています…";
        post(shopEl.getAttribute("data-root") + "api/move", { shop: sid, lat: c.lat, lng: c.lng }).then(function (d) {
          if (d.ok) { shopPin.setLatLng([d.lat, d.lng]); stop(); mm.textContent = d.same ? "位置は変わっていません。" : "ピンの位置を直しました！ありがとうございます。地図やガチャ活にもすぐ反映されます。"; return; }
          mm.textContent = d.error === "official" ? "公式のお店のピンは動かせません。" : d.error === "far" ? "1回に動かせるのは1kmまでです。少しずつ動かすか、正しい場所を確かめてください。" : d.error === "again" ? "このお店のピンは今日はもう直しています。また明日お願いします。" : d.error === "limit" ? "今日直せる回数をこえました。また明日お願いします。" : "直せませんでした。時間をおいてもう一度お試しください。";
        }).catch(function () { mm.textContent = "送れませんでした。時間をおいてもう一度お試しください。"; });
      });
    })();
    var known = [];
    try { known = JSON.parse(document.getElementById("shop-items").textContent); } catch (e) {}
    var listEl2 = document.getElementById("rep-list"), msgEl = document.getElementById("rep-msg");
    var MAC = { "~10": "10台くらい", "~50": "50台くらい", "~100": "100台くらい", "100+": "100台以上" };
    var draw = function (d) {
      var reps = (d && d.reports) || [];
      // ガチャごとに一番新しい報告をまとめる
      var byItem = {}, order = [];
      reps.forEach(function (r) {
        if (r.kind !== "in" && r.kind !== "out") return;
        var key = r.item_id || r.item_name;
        var name = r.item_name || (known.filter(function (k) { return k[0] === r.item_id; })[0] || [null, r.item_id])[1];
        if (!byItem[key]) { byItem[key] = { name: name, id: r.item_id, last: r, inN: 0, outN: 0 }; order.push(key); }
        byItem[key][r.kind === "in" ? "inN" : "outN"]++;
      });
      listEl2.innerHTML = order.length ? order.slice(0, 40).map(function (k) {
        var x = byItem[k], st = x.last.kind === "in";
        var name = x.id ? '<a href="' + shopEl.getAttribute("data-root") + 'item/' + esc(x.id) + '">' + esc(x.name) + "</a>" : esc(x.name);
        return '<li><span class="pill ' + (st ? "in_stock" : "out_of_stock") + '">' + (st ? "あった" : "なかった") + "</span><b>" + name + "</b><small>" + ago(x.last.created_at) + "（あった" + x.inN + "・なかった" + x.outN + "）</small></li>";
      }).join("") : '<li class="fine">まだ報告はありません。お店で見たガチャを教えてください。</li>';
      var mac = {}; reps.forEach(function (r) { if (r.kind === "machines") mac[r.value] = (mac[r.value] || 0) + 1; });
      var best = Object.keys(mac).sort(function (a, b) { return mac[b] - mac[a]; })[0];
      if (best) document.getElementById("st-mac").textContent = MAC[best];
      var closed = reps.filter(function (r) { return r.kind === "closed"; }).length, wrong = reps.filter(function (r) { return r.kind === "wrong"; }).length;
      var w = document.getElementById("shop-warn");
      if (closed || wrong) { w.hidden = false; w.textContent = "⚠ " + (closed ? "閉店していたという報告が" + closed + "件" : "") + (closed && wrong ? "、" : "") + (wrong ? "ガチャがないという報告が" + wrong + "件" : "") + "あります。"; }
      if (d && d.official) document.getElementById("st-off").textContent = d.official.filter(function (o) { return o.in; }).length + "種";
      var n30 = reps.filter(function (r) { return Date.now() - Date.parse(r.created_at) < 30 * 864e5; }).length;
      document.getElementById("st-rep").textContent = n30 + "件";
    };
    var comList = document.getElementById("com-list"), comMsg = document.getElementById("com-msg"), comBody = document.getElementById("com-body");
    var drawComments = function (d) {
      var cs = (d && d.comments) || [];
      comList.innerHTML = cs.length ? cs.map(function (c) {
        return '<li><p>' + esc(c.body).replace(/\n/g, "<br>") + '</p><small>' + ago(c.created_at) + ' ・ <button type="button" class="com-flag" data-id="' + c.id + '">通報</button></small></li>';
      }).join("") : '<li class="fine">まだコメントはありません。</li>';
    };
    comBody.addEventListener("input", function () { document.getElementById("com-count").textContent = comBody.value.length + "/140"; });
    document.getElementById("com-send").addEventListener("click", function () {
      var v = comBody.value.trim();
      if (v.length < 2) { comMsg.textContent = "コメントを入れてください。"; return; }
      comMsg.textContent = "送っています…";
      post(shopEl.getAttribute("data-comment"), { shop: sid, body: v }).then(function (d) {
        comMsg.textContent = d.ok ? "コメントしました。ありがとうございます！" : d.error === "ng" ? "使えない言葉（悪口・個人情報・宣伝・URLなど）が入っています。書き方を変えてください。" : d.error === "limit" ? "今日コメントできる数を超えました。" : d.error === "dup" ? "同じコメントはもう送られています。" : "コメントできませんでした。";
        if (d.ok) { comBody.value = ""; reload(); }
      }).catch(function () { comMsg.textContent = "送れませんでした。時間をおいてもう一度お試しください。"; });
    });
    comList.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest(".com-flag"); if (!b) return;
      if (!window.confirm("このコメントを通報しますか？（3人から通報されると見えなくなります）")) return;
      post(shopEl.getAttribute("data-comment"), { flag: Number(b.getAttribute("data-id")) }).then(function () { b.textContent = "通報しました"; b.disabled = true; }).catch(function () {});
    });
    var $ = function (id) { return document.getElementById(id); };
    var drawRate = function (r) {
      if (!$("rate-avg")) return;
      $("rate-avg").style.setProperty("--v", r ? r.avg : 0);
      $("rate-num").textContent = r ? r.avg.toFixed(1) : "—";
      $("rate-n").textContent = r ? "（" + r.n + "人の評価）" : "まだ評価はありません";
    };
    var myRate = 0; try { myRate = Number(localStorage.getItem("rate:" + sid)) || 0; } catch (e) {}
    var paintPick = function (v) { [].forEach.call(document.querySelectorAll("#rate-pick button"), function (b) { b.classList.toggle("on", Number(b.getAttribute("data-v")) <= v); }); };
    paintPick(myRate);
    if ($("rate-pick")) $("rate-pick").addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("button"); if (!b) return;
      var v = Number(b.getAttribute("data-v")); paintPick(v); $("rate-msg").textContent = "送信中…";
      post(shopEl.getAttribute("data-root") + "api/rate", { shop: sid, stars: v }).then(function (d) {
        if (!d.ok) throw new Error(d.error || "x");
        myRate = v; try { localStorage.setItem("rate:" + sid, v); } catch (e2) {}
        drawRate({ avg: d.avg, n: d.n }); $("rate-msg").textContent = "☆" + v + "で評価しました。ありがとうございます！";
      }).catch(function (er) { $("rate-msg").textContent = er && er.message === "limit" ? "今日はこれ以上評価できません" : "送れませんでした。時間をおいてもう一度お試しください"; paintPick(myRate); });
    });
    var reload = function () { return fetch(shopEl.getAttribute("data-api") + "?t=" + Date.now()).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { draw(d); drawComments(d); drawRate(d && d.rating); if (d && d.shop && d.shop.lat && (!document.getElementById("mv-box") || document.getElementById("mv-box").hidden)) { liveLL = [d.shop.lat, d.shop.lng]; if (shopPin) { shopPin.setLatLng(liveLL); shopMap.setView(liveLL, 17); } } }).catch(function () { draw(null); drawComments(null); }); };
    reload();
    [].forEach.call(document.querySelectorAll("#report-box [data-kind]"), function (b) {
      b.addEventListener("click", function () {
        var kind = b.getAttribute("data-kind"), body = { shop: sid, kind: kind };
        if (kind === "in" || kind === "out") {
          var v = document.getElementById("rep-item").value.trim();
          if (!v) { msgEl.textContent = "ガチャの名前を入れてください（候補から選べます）。"; return; }
          var hit = known.filter(function (k) { return k[1] === v; })[0];
          if (hit) body.item_id = hit[0]; else body.item_name = v;
        }
        if (kind === "machines") body.value = b.getAttribute("data-value");
        if ((kind === "closed" || kind === "wrong") && !window.confirm("このお店について「" + b.textContent + "」と報告しますか？")) return;
        msgEl.textContent = "送っています…";
        post(shopEl.getAttribute("data-report"), body).then(function (d) {
          msgEl.textContent = d.ok ? (d.dup ? "同じ報告は少し時間をあけてからお願いします。" : "報告しました。ありがとうございます！") : d.error === "limit" ? "今日報告できる数を超えました。" : "報告できませんでした。";
          if (d.ok) { document.getElementById("rep-item").value = ""; reload(); }
        }).catch(function () { msgEl.textContent = "送れませんでした。時間をおいてもう一度お試しください。"; });
      });
    });
  }
})();
