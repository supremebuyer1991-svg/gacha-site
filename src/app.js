/* ガチャサイト 画面の動き（診断・近い順の在庫店）。ビルド時に assets/app.js にコピーされる */
(function () {
  "use strict";

  var langMeta = document.querySelector('meta[name="site-lang"]');
  var LANG = langMeta ? langMeta.content : "ja";
  var EN = LANG === "en";
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
      nextBtn.hidden = true;
      submitBtn.hidden = cur !== steps.length - 1;
    }
    steps.forEach(function (f) {
      if (!f.hasAttribute("data-auto")) return;
      // 選んだら次へ。戻ってきて同じ答えをもう一度押したときも進む（そのときは「change」が起きないので「click」で見る）
      var timer = null;
      f.addEventListener("click", function (e) {
        if (!e.target.matches || !e.target.matches('input[type="radio"]')) return;
        var me = steps.indexOf(f);
        if (timer || me !== cur) return;
        timer = setTimeout(function () { timer = null; if (cur === me) show(me + 1, 1); }, 220);
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
          '<span class="s-name">' + (function () { var m = /shop_code=(S\d+)/i.exec(s.url || ""); return m && !EN ? '<a href="' + stock.getAttribute("data-api").replace(/api\/stock\/.*$/, "") + "shop/" + m[1].toLowerCase() + '.html">' + esc(nm) + "</a>" : esc(nm); })() + "</span>" +
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
      var list = (rows || []).filter(function (r) { return byId[r.item_id]; }).slice(0, 8);
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
  var tiles = function (map) {
    window.L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", { maxZoom: 18, minZoom: 4, attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>' }).addTo(map);
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
      return '<b>' + esc(s[1]) + '</b><br><span style="color:#6b7194">' + esc(s[2] || "") + (s[5] ? "・みんなが追加" : "") + '</span><br><a href="' + root + 'shop/' + esc(s[0]) + '.html">お店のページ（在庫・報告）→</a>';
    };
    var add = function (s) {
      var m = L.circleMarker([s[3], s[4]], { radius: 7, weight: 2, color: "#fff", fillColor: s[5] ? "#2ccfa6" : "#ff4f7b", fillOpacity: 0.95 }).addTo(map).bindPopup(popup(s));
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
      navigator.geolocation.getCurrentPosition(function (p) { map.setView([p.coords.latitude, p.coords.longitude], 14); }, function () {}, { enableHighAccuracy: false, timeout: 8000 });
    });
    var q = document.getElementById("map-q");
    q.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      e.preventDefault();
      var v = NORM(q.value); if (!v) return;
      var hits = list.filter(function (s) { return NORM(s[1] + (s[2] || "")).indexOf(v) !== -1; });
      if (!hits.length) return;
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
      var SPEED = { walking: 4.5, transit: 18, driving: 25 }, DETOUR = 1.3; // 道のり＝まっすぐの距離×1.3 の目安
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
        if (hit) { setDest([hit[3], hit[4]], hit[1]); map.setView([hit[3], hit[4]], 14); }
      });
      $("k-pick").addEventListener("click", function () { picking = true; kmsg.textContent = "地図の目的地をタップしてください。"; mapEl.scrollIntoView({ behavior: "smooth", block: "center" }); });
      map.on("click", function (e) { if (!picking) return; picking = false; setDest([e.latlng.lat, e.latlng.lng]); kmsg.textContent = "目的地を決めました。"; });
      var loadItems = function () {
        if (shopItems) return Promise.resolve(shopItems);
        return fetch(K.getAttribute("data-items")).then(function (r) { return r.json(); }).then(function (d) { shopItems = d; return d; });
      };
      var MAXS = 9; // Googleマップの経由地の上限にあわせる
      var build = function (start) {
        var mode = $("k-mode").value, want = NORM($("k-item").value);
        var back = plan !== "dest" && $("k-back").checked;
        if (plan === "dest" && !dest) { kmsg.textContent = "目的地を決めてください（お店の名前を入れるか、地図をタップ）。"; return; }
        var end = plan === "dest" ? dest : back ? start : null;
        var n = plan === "count" ? Number($("k-n").value) : MAXS;
        var budget = plan === "time" ? Number($("k-time").value) : Infinity;
        var stay = plan === "time" ? Number($("k-stay").value) : 0;
        var detour = plan === "dest" ? Number($("k-detour").value) : Infinity;
        // 探す範囲：移動の速さと時間から
        var reach = plan === "time" ? SPEED[mode] * (budget / 60) / DETOUR / (back ? 2 : 1) : mode === "walking" ? 3 : mode === "transit" ? 10 : 20;
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
          cand = cand.map(function (s) { return { s: s, p: [s[3], s[4]] }; }).filter(function (x) {
            if (plan === "dest") { var extra = hav(start, x.p) + hav(x.p, end) - direct; return minsOf(extra, mode) <= detour; }
            return hav(start, x.p) <= reach;
          });
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
            return '<li><b>' + (i + 1) + '. <a href="' + root + "shop/" + esc(x.s[0]) + '.html">' + esc(x.s[1]) + "</a></b><small>前の場所から約" + (d < 1 ? Math.round(d * 1000) + "m" : d.toFixed(1) + "km") + "・" + Math.max(1, Math.round(minsOf(hav(i ? route[i - 1].p : start, x.p), mode))) + "分</small></li>";
          }).join("") + (end && plan === "dest" ? '<li><b>🏁 目的地</b></li>' : "");
          var ll = function (p) { return p[0].toFixed(6) + "," + p[1].toFixed(6); };
          var gEnd = end || route[route.length - 1].p;
          var wps = (end ? route : route.slice(0, -1)).map(function (x) { return ll(x.p); });
          $("k-gmap").href = "https://www.google.com/maps/dir/?api=1&origin=" + ll(start) + "&destination=" + ll(gEnd) + (wps.length ? "&waypoints=" + encodeURIComponent(wps.join("|")) : "") + "&travelmode=" + mode;
          $("k-result").hidden = false;
          kmsg.textContent = route.length >= MAXS && plan !== "count" ? "Googleマップで一度に案内できる9店までにしています。" : plan === "count" && route.length < n ? "近くのお店が" + route.length + "店だったので、" + route.length + "店で作りました。" : "";
          $("k-result").scrollIntoView({ behavior: "smooth", block: "nearest" });
        }).catch(function () { kmsg.textContent = "ルートを作れませんでした。時間をおいてもう一度お試しください。"; });
      };
      $("k-go").addEventListener("click", function () {
        if (!navigator.geolocation) { kmsg.textContent = "この端末では現在地が使えません。「地図の真ん中から作る」をお使いください。"; return; }
        kmsg.textContent = "現在地を調べています…（位置はこの端末の中だけで使います）";
        navigator.geolocation.getCurrentPosition(function (p) { build([p.coords.latitude, p.coords.longitude]); }, function () { kmsg.textContent = "現在地がわかりませんでした。地図を動かして「地図の真ん中から作る」をお試しください。"; }, { enableHighAccuracy: true, timeout: 10000 });
      });
      $("k-here").addEventListener("click", function () { var c = map.getCenter(); build([c.lat, c.lng]); });
      $("k-clear").addEventListener("click", function () { routeLayer.clearLayers(); $("k-result").hidden = true; kmsg.textContent = ""; });
    })();

    // お店を追加
    var box = document.getElementById("map-add-box"), msg = document.getElementById("add-msg");
    document.getElementById("map-add").addEventListener("click", function () {
      box.hidden = false; mapEl.classList.add("is-adding");
      if (map.getZoom() < 15) msg.textContent = "地図を拡大して、お店の場所に＋を合わせてください。";
      box.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    document.getElementById("add-cancel").addEventListener("click", function () { box.hidden = true; mapEl.classList.remove("is-adding"); msg.textContent = ""; });
    document.getElementById("add-send").addEventListener("click", function () {
      var name = document.getElementById("add-name").value.trim();
      if (name.length < 2) { msg.textContent = "お店の名前を入れてください。"; return; }
      if (map.getZoom() < 15) { msg.textContent = "場所がずれないよう、もっと地図を拡大してから追加してください。"; return; }
      var c = map.getCenter();
      msg.textContent = "送っています…";
      post(root + "api/shops", { name: name, address: document.getElementById("add-addr").value.trim(), lat: c.lat, lng: c.lng }).then(function (d) {
        if (d.ok) {
          add([d.id, name, "", c.lat, c.lng, 1]); markers[d.id].openPopup();
          msg.textContent = "追加しました！ありがとうございます。お店のページは数時間後にできます。";
          document.getElementById("add-name").value = ""; document.getElementById("add-addr").value = "";
          mapEl.classList.remove("is-adding");
        } else msg.textContent = d.error === "dup" ? "このお店はもう地図にあります。" : d.error === "limit" ? "今日追加できる数を超えました。また明日お願いします。" : "追加できませんでした。名前と場所を確かめてください。";
      }).catch(function () { msg.textContent = "送れませんでした。時間をおいてもう一度お試しください。"; });
    });
  });

  var shopEl = document.getElementById("shop");
  if (shopEl) {
    var sid = shopEl.getAttribute("data-id");
    var lat = Number(shopEl.getAttribute("data-lat")), lng = Number(shopEl.getAttribute("data-lng"));
    whenLeaflet(function () {
      var L = window.L, m = L.map("shop-map", { scrollWheelZoom: false }).setView([lat, lng], 16);
      tiles(m);
      L.circleMarker([lat, lng], { radius: 9, weight: 3, color: "#fff", fillColor: "#ff4f7b", fillOpacity: 1 }).addTo(m);
    });
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
        var name = x.id ? '<a href="' + shopEl.getAttribute("data-root") + 'item/' + esc(x.id) + '.html">' + esc(x.name) + "</a>" : esc(x.name);
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
    var reload = function () { return fetch(shopEl.getAttribute("data-api") + "?t=" + Date.now()).then(function (r) { return r.ok ? r.json() : null; }).then(draw).catch(function () { draw(null); }); };
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
