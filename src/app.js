/* ガチャサイト 画面の動き（診断・近い順の在庫店）。ビルド時に assets/app.js にコピーされる */
(function () {
  "use strict";

  var langMeta = document.querySelector('meta[name="site-lang"]');
  var LANG = langMeta ? langMeta.content : "ja";
  var EN = LANG === "en";
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

  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

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
    var render = function () {
      var q = sInput.value.trim();
      if (!q || !sIndex) { sPop.hidden = true; return; }
      var hits = find(q);
      sPop.innerHTML = hits.length
        ? hits.slice(0, 8).map(function (x) {
            return '<a class="sp-item" href="' + home + "item/" + esc(x.id) + '.html">' + thumbHTML(x) + '<span class="sp-name">' + esc(x.n) + '</span><span class="sp-price">¥' + x.p + "</span></a>";
          }).join("") + (hits.length > 8 ? '<button class="sp-all" type="submit">' + esc(M.searchAll(hits.length)) + "</button>" : "")
        : '<p class="sp-none">' + esc(M.searchNone) + "</p>";
      sPop.hidden = false;
    };
    sInput.addEventListener("focus", load);
    sInput.addEventListener("input", function () { load().then(render); });
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

  /* ================= 診断（トップページ） ================= */
  var quiz = document.getElementById("quiz");
  if (quiz) {
    var data = JSON.parse(document.getElementById("items-data").textContent);
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
      nextBtn.hidden = true;
      submitBtn.hidden = cur !== steps.length - 1;
    }
    steps.forEach(function (f) {
      if (!f.hasAttribute("data-auto")) return;
      f.addEventListener("change", function () { setTimeout(function () { show(cur + 1, 1); }, 220); });
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
          if (row.hidden) [].forEach.call(row.querySelectorAll("input"), function (x) { x.checked = false; });
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
    return '<a class="card" href="' + data.home + "item/" + esc(it.id) + '.html">' +
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
          '<span class="s-name">' + esc(nm) + "</span>" +
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
})();
