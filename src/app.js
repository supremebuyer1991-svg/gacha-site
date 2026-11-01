/* ガチャサイト 画面の動き（診断・近い順の在庫店）。ビルド時に assets/app.js にコピーされる */
(function () {
  "use strict";

  var langMeta = document.querySelector('meta[name="site-lang"]');
  var LANG = langMeta ? langMeta.content : "ja";
  var EN = LANG === "en";
  var M = EN ? {
    none: "No matches. Try adding more groups or clearing the detailed picks.",
    found: function (n) { return n + " matches, best first."; },
    next: "Next", skip: "No preference",
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
    found: function (n) { return n + "件が見つかりました。相性の高い順に表示しています。"; },
    next: "次へ", skip: "こだわらない",
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
      subs.addEventListener("change", function () {
        if (subs.querySelector("input:checked")) main.checked = true;
        g.classList.toggle("is-on", main.checked);
      });
      main.addEventListener("change", function () {
        if (!main.checked) [].forEach.call(subs.querySelectorAll("input"), function (x) { x.checked = false; });
        g.classList.toggle("is-on", main.checked);
      });
    });

    var val = function (n) { return (quiz.querySelector('input[name="' + n + '"]:checked') || {}).value || ""; };
    var vals = function (n) { return [].map.call(quiz.querySelectorAll('input[name="' + n + '"]:checked'), function (x) { return x.value; }); };
    var GROUPS = (data.groups || []).map(function (g) {
      return { slug: g.slug, subs: g.subs.map(function (x) { return { slug: x.slug, rx: new RegExp(x.match, "i") }; }) };
    });
    var RX = {
      female: /サンリオ|キティ|マイメロ|クロミ|ポチャッコ|シナモ|ちいかわ|ディズニー|プリキュア|チャーム|アクセサリー|ポーチ|リング|コスメ|パウダー|ミラー|バッグ|ぬいぐるみ/,
      male: /ガンダム|ゴジラ|ライダー|ウルトラ|ドラゴンボール|ONE PIECE|ワンピ|HG|ロボ|メカ|怪獣|クローズ|WORST|STAR WARS|MARVEL|野球|HOT WHEELS/,
      "10": /ちいかわ|ホロライブ|すとぷり|NCT|aespa|RIIZE|SKZOO|アイドル|ハイキュー|フリーレン|チェンソー|めじるし/,
      "20": /ちいかわ|ホロライブ|すとぷり|NCT|aespa|RIIZE|SKZOO|アイドル|ハイキュー|フリーレン|チェンソー|ジョジョ|ポケモン|ポケットモンスター/,
      "30": /たまごっち|おジャ魔女|カードキャプター|ケロロ|デジモン|ポケットモンスター|ハム太郎|ジュエルペット|きらりん|ナルミヤ|メゾピアノ|ドラゴンボール|ONE PIECE|ワンピ/,
      "40": /ガンダム|ドラゴンボール|ウルトラ|ライダー|マクロス|ジョジョ|銀魂|いちご100|PEANUTS|パワーパフ|ケアベア|グレムリン|ミニチュア/,
      "50": /昭和|レトロ|ゴジラ|ウルトラ|仮面ライダー|ドラえもん|ちびまる子|サンリオ|ミニチュア|模型|骨格|図鑑/
    };

    quiz.addEventListener("submit", function (e) {
      e.preventDefault();
      var gender = val("gender"), age = val("age");
      var chosen = vals("group");
      var chosenSubs = vals("sub");
      // 系統ごとに、細かい項目を選んでいればそれだけ、選んでいなければ全部を対象にする
      var targets = GROUPS.filter(function (g) { return chosen.indexOf(g.slug) !== -1; }).map(function (g) {
        var picked = g.subs.filter(function (x) { return chosenSubs.indexOf(g.slug + ":" + x.slug) !== -1; });
        return picked.length ? picked : g.subs;
      });

      var scored = data.items.map(function (it) {
        var s = 0;
        targets.forEach(function (subs) {
          var hit = subs.filter(function (x) { return x.rx.test(it.jn); }).length;
          if (hit) s += 3 + Math.min(hit - 1, 2) * 0.5;
        });
        if (targets.length && !s) return { it: it, s: 0 };
        if (RX[gender] && RX[gender].test(it.jn)) s += 1.5;
        if (RX[age] && RX[age].test(it.jn)) s += 1.5;
        if (age === "50" && it.genre === "retro") s += 1;
        return { it: it, s: s };
      }).filter(function (x) {
        return x.s > 0 || (!targets.length && !RX[gender] && !RX[age]);
      }).sort(function (a, b) { return b.s - a.s || b.it.popularity - a.it.popularity; });

      var personal = (RX[gender] ? 1.5 : 0) + (RX[age] ? 1.5 : 0);
      var max = (targets.length ? 4 : 0) + personal || 1;
      var anyChoice = targets.length || personal;
      var top = scored.slice(0, 8);
      results.hidden = false;
      if (!top.length) {
        note.textContent = M.none;
        grid.innerHTML = "";
      } else {
        note.textContent = M.found(scored.length);
        grid.innerHTML = top.map(function (x) {
          var pct = Math.min(99, Math.round((x.s / max) * 100));
          return cardHTML(x.it, data, anyChoice ? pct : null);
        }).join("");
      }
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

    fetch(stock.getAttribute("data-src"))
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
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
