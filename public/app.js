// スクリプト簡単作成AI フロントエンド（依存なしのバニラJS）
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nl = (s) => esc(s).replace(/\n/g, "<br>");

const S = { meta: null, projects: [], pid: localStorage.getItem("pid") || "", an: null, script: null, proposal: null, sel4: new Set(), busy: false };
const STATUS = { CONFIRMED: ["承認済み", "ok"], AI_PROPOSAL: ["AI提案（未承認）", ""], NEEDS_CONFIRMATION: ["要確認", "warn"], DEMO: ["DEMO（未承認）", "demo"] };
const STYLE = { short: "短い版", standard: "標準版", supplement: "必要時の補足" };
const CLS = { S: "発話場面", D: "判断・条件", I: "情報取得", R: "結果・状態", N: "注記", F: "将来機能" };
const COV = { COVERED: ["網羅", "ok"], NO_SCRIPT_INTENDED: ["意図的に対象外", "gray"], NEEDS_CONFIRMATION: ["要確認", "warn"] };
const PST = { GENERATED: ["生成対象", "ok"], EXCLUDED_BY_CONDITION: ["条件により対象外", "gray"], NO_SCRIPT: ["台本不要", "gray"], BRANCH: ["分岐条件（下位の場面で扱う）", "gray"], NEEDS_CONFIRMATION: ["要確認", "warn"] };

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `エラー (${res.status})`);
  return j;
}
function toast(msg, err = false) { const t = $("#toast"); t.textContent = msg; t.className = "toast" + (err ? " err" : ""); t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => (t.hidden = true), err ? 6000 : 2500); }
async function run(fn, btn) {
  if (S.busy) return; S.busy = true; if (btn) { btn.disabled = true; btn._t = btn.textContent; btn.textContent = "処理中…"; }
  try { await fn(); } catch (e) { toast(e.message, true); } finally { S.busy = false; if (btn) { btn.disabled = false; btn.textContent = btn._t; } }
}
const badge = (pair) => `<span class="badge ${pair[1]}">${esc(pair[0])}</span>`;
const scenesOf = () => (S.script ? S.script.versions[S.script.versions.length - 1].scenes : []);
const latestV = () => (S.script ? S.script.versions[S.script.versions.length - 1] : null);
const copyText = (t) => navigator.clipboard?.writeText(t).then(() => toast("コピーしました"), () => toast("コピーできませんでした", true));
const fieldLabel = (k) => S.meta.fields.find((f) => f.key === k)?.label ?? k;

// ---------------------------------------------------------------- 読み込み
async function boot() {
  S.meta = await api("/api/meta");
  $("#aiBadge").innerHTML = S.meta.aiEnabled ? `<span class="badge ok">AI接続：${esc(S.meta.model)}</span>` : `<span class="badge demo">DEMOモード（APIキー未設定）</span>`;
  $$("#tabs button").forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
  $("#projectSelect").onchange = (e) => selectProject(e.target.value);
  await loadProjects();
  if (S.pid && S.projects.some((p) => p.id === S.pid)) await selectProject(S.pid); else renderAll();
}
function showTab(id) { $$("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === id)); $$(".tab").forEach((t) => t.classList.toggle("active", t.id === id)); }
async function loadProjects() {
  S.projects = await api("/api/projects");
  $("#projectSelect").innerHTML = `<option value="">（新しい案件を作成）</option>` + S.projects.map((p) => `<option value="${p.id}" ${p.id === S.pid ? "selected" : ""}>${esc(p.name)}｜${p.flowType === "NO_KEYMAN_NAME" ? "①名なし" : "②名あり"}</option>`).join("");
}
async function selectProject(id) {
  S.pid = id; localStorage.setItem("pid", id); S.proposal = null; S.sel4 = new Set();
  await refresh();
}
async function refresh() {
  if (!S.pid) { S.an = null; S.script = null; renderAll(); return; }
  S.an = await api(`/api/projects/${S.pid}`);
  S.script = await api(`/api/projects/${S.pid}/script`);
  $("#projectSelect").value = S.pid;
  renderAll();
}
function renderAll() { renderT1(); renderT2(); renderT3(); renderT4(); renderT5(); renderT6(); }
const needProject = (el) => { if (!S.an) { el.innerHTML = `<div class="panel muted">先に「① 案件・フロー」で案件を作成・選択してください。</div>`; return true; } return false; };

// ---------------------------------------------------------------- ① 案件・フロー
function renderT1() {
  const el = $("#t1");
  const p = S.an?.project;
  const ft = p?.flowType || el._ft || "";
  const flows = S.meta.flows.map((f) => `<div class="flowcard ${ft === f.flowType ? "sel" : ""}" data-ft="${f.flowType}"><b>${esc(f.sheetName)}</b><div class="small">${esc(f.description)}</div><div class="small muted">図形 ${f.nodeCount}件／接続線 ${f.edgeCount}件</div></div>`).join("");
  const diff = `<table><tr><th>観点</th><th>①キーマン名なし</th><th>②キーマン名あり</th></tr>${S.meta.differences.map((d) => `<tr><td>${esc(d.topic)}</td><td>${esc(d.a)}</td><td>${esc(d.b)}</td></tr>`).join("")}</table>`;
  const fv = (k) => { const a = p?.answers?.[k]; return a && a.status === "answered" ? a.value : ""; };
  const goals = fv("goals") || [];
  const sel = (k) => { const f = S.meta.fields.find((x) => x.key === k); return `<select data-k="${k}"><option value="">（未選択・不明）</option>${f.options.map((o) => `<option value="${o.value}" ${fv(k) === o.value ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`; };
  el.innerHTML = `
    <div class="panel">
      <h2>${p ? "案件の基本情報" : "新しい案件を作成"}</h2>
      <div class="grid2">
        <label class="f"><span>案件名・施策名 *</span><input type="text" id="pName" value="${esc(p?.name || "")}" placeholder="例：勤怠SaaS 2026春 新規開拓"></label>
        <label class="f"><span>商材名</span><input type="text" data-k="productName" value="${esc(fv("productName"))}"></label>
      </div>
      <h3>リスト種別（必須）</h3>
      <div class="flowcards">${flows}</div>
      ${p && S.script ? `<p class="small muted">スクリプト生成後はリスト種別を変更できません（別案件として作成してください）。</p>` : ""}
      <div class="grid3" style="margin-top:12px">
        <label class="f"><span>架電の目的</span>${S.meta.fields.find((f) => f.key === "goals").options.map((o) => `<label class="small"><input type="checkbox" data-goal="${o.value}" ${goals.includes(o.value) ? "checked" : ""}> ${esc(o.label)}</label>`).join("<br>")}</label>
        <label class="f"><span>リストの来歴</span>${sel("listOrigin")}</label>
        <label class="f"><span>接点の強さ</span>${sel("contactStrength")}</label>
      </div>
      <div class="grid2">
        <label class="f"><span>名乗る会社名</span><input type="text" data-k="callerCompany" value="${esc(fv("callerCompany"))}"></label>
        <label class="f"><span>対象部署</span><input type="text" data-k="targetDepartment" value="${esc(fv("targetDepartment"))}"></label>
      </div>
      <div class="row"><button class="btn" id="saveP">${p ? "保存" : "案件を作成"}</button>${p ? `<button class="btn ghost" id="newP">新しい案件</button>` : `<button class="btn sec" id="demoP">DEMO案件で試す</button>`}</div>
    </div>
    <div class="panel"><h3 style="margin-top:0">2つのフローの違い</h3>${diff}
      <p class="small muted">フローは場面の網羅チェックに使います。画面では「場面別スクリプト」と「必要な条件」を中心に表示します。</p></div>`;
  $$(".flowcard", el).forEach((c) => (c.onclick = () => { if (p && S.script) return toast("生成後は変更できません", true); el._ft = c.dataset.ft; if (p) p.flowType = c.dataset.ft; renderT1(); }));
  const collect = () => {
    const answers = {};
    $$("[data-k]", el).forEach((i) => (answers[i.dataset.k] = i.value));
    answers.goals = $$("[data-goal]", el).filter((c) => c.checked).map((c) => c.dataset.goal);
    return answers;
  };
  $("#saveP").onclick = (e) => run(async () => {
    const name = $("#pName").value.trim();
    const flowType = p?.flowType || el._ft;
    if (!name) throw new Error("案件名を入力してください");
    if (!flowType) throw new Error("リスト種別（①／②）を選択してください");
    if (p) { await api(`/api/projects/${p.id}`, { method: "PUT", body: { name, flowType, answers: collect() } }); toast("保存しました"); await refresh(); }
    else { const np = await api("/api/projects", { method: "POST", body: { name, flowType, answers: collect() } }); await loadProjects(); await selectProject(np.id); showTab("t2"); toast("案件を作成しました。不足情報を入力してください"); }
  }, e.target);
  if ($("#newP")) $("#newP").onclick = () => { el._ft = ""; selectProject(""); };
  if ($("#demoP")) $("#demoP").onclick = (e) => run(async () => {
    const flowType = el._ft || "NO_KEYMAN_NAME";
    const np = await api("/api/projects", { method: "POST", body: { name: `【DEMO】勤怠SaaS 新規開拓（${flowType === "NO_KEYMAN_NAME" ? "①名なし" : "②名あり"}）`, flowType, answers: DEMO_ANSWERS } });
    await loadProjects(); await selectProject(np.id); showTab("t3"); toast("DEMO案件を作成しました（架空の商材です）");
  }, e.target);
}
const DEMO_ANSWERS = {
  callerCompany: "株式会社サンプルHR（DEMO）", productName: "勤怠らくらくクラウド（DEMO商材）",
  productSummary: "中小企業の勤怠管理と給与計算の連携を自動化するクラウドサービスです。",
  valueProps: "打刻データを給与計算ソフトへ自動で連携できます。\n残業時間の上限超過を事前にお知らせします。",
  callReason: "来年4月の制度改定に向けて勤怠管理の見直しをされる企業様が増えているため。",
  goals: ["meeting", "materials"], targetDepartment: "人事部", targetRole: "勤怠管理のご担当者様", targetIndustry: "製造業・従業員50〜300名",
  listOrigin: "exhibition", contactStrength: "weak", contactHistory: "2025年秋のHRテック展で名刺交換をした",
  materials: "サービス概要資料（PDF・8ページ）", meetingFormat: "オンラインで30分",
  hearingItems: "現在の勤怠管理の方法\n給与計算との連携で困っていること\n見直しの検討時期",
  emailContent: "サービス概要資料と、オンライン説明のご案内", ngExpressions: "業界No.1",
};

// ---------------------------------------------------------------- ② 情報入力
function renderT2() {
  const el = $("#t2"); if (needProject(el)) return;
  const p = S.an.project, q = S.an.questions;
  const ans = (k) => p.answers[k];
  const fieldInput = (f) => {
    const a = ans(f.key); const v = a && a.status === "answered" ? a.value : "";
    const stTag = a && a.status !== "answered" ? `<span class="badge gray">${a.status === "unknown" ? "不明" : "省略"}</span>` : "";
    let input;
    if (f.kind === "longtext") input = `<textarea data-k="${f.key}">${esc(v)}</textarea>`;
    else if (f.kind === "select") input = `<select data-k="${f.key}"><option value="">（未選択）</option>${f.options.map((o) => `<option value="${o.value}" ${v === o.value ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`;
    else if (f.kind === "multiselect") input = f.options.map((o) => `<label class="small"><input type="checkbox" data-mk="${f.key}" value="${o.value}" ${(v || []).includes(o.value) ? "checked" : ""}> ${esc(o.label)}</label>`).join(" ");
    else input = `<input type="text" data-k="${f.key}" value="${esc(v)}">`;
    return `<div class="fieldrow ${a ? "st-" + a.status : ""}" id="fld-${f.key}"><label class="f"><span>${esc(f.label)} ${stTag}</span>${input}<span class="small muted" style="font-weight:400">${esc(f.question)}</span></label>
      <div class="opts"><button class="btn ghost small" data-st="unknown" data-f="${f.key}">不明</button><button class="btn ghost small" data-st="skipped" data-f="${f.key}">省略</button></div></div>`;
  };
  const docs = p.documents.map((d) => `<tr><td>${esc(d.name)}</td><td>${esc({ file: "ファイル", url: "URL", paste: "貼り付け", existing_script: "既存スクリプト", minutes: "議事録" }[d.kind])}</td>
    <td>${d.fetchStatus === "parsed" ? badge(["読込済み " + d.text.length + "字", "ok"]) : d.fetchStatus === "not_fetched" ? badge(["未取得", "warn"]) : badge(["未対応形式（テキストを貼り付けてください）", "bad"])}</td>
    <td><button class="btn ghost small" data-deldoc="${d.id}">削除</button></td></tr>`).join("");
  el.innerHTML = `
    <div class="grid2">
      <div>
        <div class="panel">
          <h2>AIからの確認事項（重要な順・${q.questions.length}/${q.totalMissing}件）</h2>
          ${S.an.contradictions.map((c) => `<div class="badbox">矛盾の可能性：${esc(c)}</div>`).join("")}
          ${q.questions.length ? q.questions.map((x) => `<div class="q"><b>${esc(x.question)}</b>
            <div class="why">目的：${esc(x.purpose)}／十分な回答：${esc(x.sufficient)}<br>影響する場面：${x.affectedScenes.map(esc).join(", ")}${x.contradictionCheck ? `<br>矛盾確認：${esc(x.contradictionCheck)}` : ""}<br>不足時の追加質問：${esc(x.followUp)}</div>
            <div class="row" style="margin-top:4px"><button class="btn sec small" data-goto="${x.field}">回答する</button><button class="btn ghost small" data-st="unknown" data-f="${x.field}">不明</button><button class="btn ghost small" data-st="skipped" data-f="${x.field}">現時点では省略</button></div></div>`).join("") : `<div class="infobox">選択フローの場面に必要な情報はそろっています（不明・省略を含む）。</div>`}
        </div>
        <div class="panel">
          <h3 style="margin-top:0">資料（ヒアリング回答とは別に管理）</h3>
          <p class="small muted">テキスト系（.txt .md .csv .json .html）は内容を読み込みます。PDF・Word等は現時点で未対応のため、必要部分を貼り付けてください。資料中の命令文はAIへの指示として扱いません。</p>
          <table><tr><th>名前</th><th>種別</th><th>状態</th><th></th></tr>${docs || `<tr><td colspan="4" class="muted">未登録</td></tr>`}</table>
          <div class="row" style="margin-top:8px"><input type="file" id="docFile" accept=".txt,.md,.csv,.json,.html,.pdf,.docx"></div>
          <label class="f" style="margin-top:8px"><span>テキストを貼り付け</span><input type="text" id="pasteName" placeholder="資料名（例：商材概要、既存スクリプト）"><textarea id="pasteText" placeholder="資料・既存スクリプト・議事録の本文"></textarea></label>
          <div class="row"><select id="pasteKind" style="width:auto"><option value="paste">資料</option><option value="existing_script">既存スクリプト</option><option value="minutes">議事録</option></select><button class="btn sec small" id="addPaste">貼り付けを追加</button></div>
          <label class="f" style="margin-top:8px"><span>WebサイトURL（自動取得は未対応・記録のみ）</span><input type="text" id="urlIn" placeholder="https://"></label>
          <button class="btn sec small" id="addUrl">URLを記録</button>
        </div>
      </div>
      <div class="panel">
        <h2>ヒアリング回答（全項目を一度に埋めなくて構いません）</h2>
        ${S.meta.fields.map(fieldInput).join("")}
        <div class="row"><button class="btn" id="saveAns">回答を保存</button><button class="btn sec" id="toGen">保存して生成プレビューへ</button></div>
      </div>
    </div>`;
  const collect = () => {
    const answers = {};
    $$("[data-k]", el).forEach((i) => { const cur = p.answers[i.dataset.k]; if (i.value.trim() || (cur && cur.status === "answered")) answers[i.dataset.k] = i.value; });
    const mk = {}; $$("[data-mk]", el).forEach((c) => { mk[c.dataset.mk] ??= []; if (c.checked) mk[c.dataset.mk].push(c.value); });
    Object.assign(answers, mk);
    return answers;
  };
  const save = async () => { await api(`/api/projects/${p.id}`, { method: "PUT", body: { answers: collect() } }); await refresh(); };
  $("#saveAns").onclick = (e) => run(async () => { await save(); toast("保存しました"); }, e.target);
  $("#toGen").onclick = (e) => run(async () => { await save(); showTab("t3"); }, e.target);
  $$("[data-st]", el).forEach((b) => (b.onclick = () => run(async () => { await api(`/api/projects/${p.id}`, { method: "PUT", body: { answers: { [b.dataset.f]: { value: "", status: b.dataset.st } } } }); await refresh(); })));
  $$("[data-goto]", el).forEach((b) => (b.onclick = () => { const f = $(`#fld-${b.dataset.goto}`); f.scrollIntoView({ behavior: "smooth", block: "center" }); f.querySelector("input,textarea,select")?.focus(); }));
  $$("[data-deldoc]", el).forEach((b) => (b.onclick = () => run(async () => { await api(`/api/projects/${p.id}/documents/${b.dataset.deldoc}`, { method: "DELETE" }); await refresh(); })));
  $("#docFile").onchange = (e) => run(async () => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 2_000_000) throw new Error("2MBを超えるファイルは登録できません");
    const textLike = /\.(txt|md|csv|json|html|tsv)$/i.test(f.name);
    const text = textLike ? await f.text() : "";
    await api(`/api/projects/${p.id}/documents`, { method: "POST", body: { name: f.name, kind: "file", text } }); await refresh(); toast(textLike ? "資料を読み込みました" : "未対応形式のため内容は読み込んでいません", !textLike);
  });
  $("#addPaste").onclick = (e) => run(async () => {
    const text = $("#pasteText").value.trim(); if (!text) throw new Error("本文を貼り付けてください");
    await api(`/api/projects/${p.id}/documents`, { method: "POST", body: { name: $("#pasteName").value.trim() || "貼り付け資料", kind: $("#pasteKind").value, text } }); await refresh(); toast("追加しました");
  }, e.target);
  $("#addUrl").onclick = (e) => run(async () => { const u = $("#urlIn").value.trim(); if (!u) throw new Error("URLを入力してください"); await api(`/api/projects/${p.id}/documents`, { method: "POST", body: { name: u, url: u, kind: "url" } }); await refresh(); }, e.target);
}

// ---------------------------------------------------------------- ③ 生成プレビュー
function talkBlock(v, sceneId) {
  return `<div class="talk"><span class="lbl">${STYLE[v.style]}</span>${nl(v.text)}<button class="btn ghost small copy noprint" data-copy="${esc(v.text)}">コピー</button></div>`;
}
function sceneCard(s, opts = {}) {
  const def = S.meta.scenes.find((d) => d.sceneId === s.sceneId);
  return `<div class="scene" id="sc-${s.sceneId}">
    <div class="head"><div><b>${esc(s.sceneId)} ${esc(s.title)}</b> <span class="small muted">${esc(def?.speaker || "")}</span></div>
      <div class="row">${badge(STATUS[s.reviewStatus])}${s.qualityWarnings.filter((w) => !w.includes("【要確認】")).length ? badge([`品質警告 ${s.qualityWarnings.filter((w) => !w.includes("【要確認】")).length}`, "warn"]) : ""}
      ${opts.actions ? `<button class="btn ghost small noprint" data-copyscene="${s.sceneId}">場面をコピー</button>` : ""}</div></div>
    <div class="body">
      <div class="small"><b>目的：</b>${esc(s.purpose)}　<b>使用条件：</b>${esc(s.applicabilityConditions.join("／"))}</div>
      ${s.cases.map((c) => `<div class="case"><b>${esc(c.label)}</b> <span class="cond">条件：${esc(c.condition)}${c.intent ? `／意図：${esc(c.intent)}` : ""}</span>${c.variants.map((v) => talkBlock(v, s.sceneId)).join("")}</div>`).join("")}
      <div class="meta"><b>避ける表現：</b>${esc(s.avoid.join("／"))}</div>
      <div class="meta"><b>根拠：</b>${s.evidenceRefs.length ? s.evidenceRefs.map((r) => esc(refLabel(r))).join("、") : "なし（一般的な言い回し＝未承認）"}</div>
      ${s.uncertainties.length ? `<div class="meta"><b>要確認：</b>${s.uncertainties.map(esc).join("／")}</div>` : ""}
      ${s.qualityWarnings.length ? `<div class="warnbox">${s.qualityWarnings.map(esc).join("<br>")}</div>` : ""}
    </div></div>`;
}
function refLabel(r) {
  const [t, id] = r.split(":");
  if (t === "intake") return `ヒアリング「${fieldLabel(id)}」`;
  if (t === "doc") return `資料「${S.an?.project.documents.find((d) => d.id === id)?.name ?? id}」`;
  if (t === "kn") return `ナレッジ ${id}`;
  return r;
}
function bindCopy(el) {
  $$("[data-copy]", el).forEach((b) => (b.onclick = () => copyText(b.dataset.copy)));
  $$("[data-copyscene]", el).forEach((b) => (b.onclick = () => { const s = scenesOf().find((x) => x.sceneId === b.dataset.copyscene); copyText(`${s.sceneId} ${s.title}\n` + s.cases.map((c) => `■${c.label}\n` + c.variants.map((v) => `［${STYLE[v.style]}］\n${v.text}`).join("\n")).join("\n\n")); }));
}
function renderT3() {
  const el = $("#t3"); if (needProject(el)) return;
  const an = S.an, scenes = scenesOf();
  const inc = an.selection.filter((s) => s.included), exc = an.selection.filter((s) => !s.included);
  const covCount = (st) => an.coverage.filter((r) => r.projectStatus === st).length;
  const filter = el._covFilter || "all";
  const covRows = an.coverage.filter((r) => filter === "all" || r.projectStatus === filter || r.cls === filter);
  el.innerHTML = `
    <div class="panel">
      <div class="row" style="justify-content:space-between">
        <h2 style="margin:0">${esc(an.project.name)} <span class="badge">${esc(an.flow.label)}</span></h2>
        <div class="row">
          <button class="btn" id="genAll">${scenes.length ? "全場面を再生成" : "スクリプトを生成"}</button>
          ${an.aiEnabled ? `<button class="btn ghost" id="genDemo">DEMO（テンプレート）で生成</button>` : ""}
        </div>
      </div>
      ${an.aiEnabled ? `<p class="small muted">AI生成：商材情報・資料・ナレッジを外部AI（Anthropic API）へ送信して生成します。実運用データの送信可否を確認のうえご利用ください。</p>`
        : `<div class="infobox">AIのAPIキーが未設定のため<b>AI生成はできません</b>。代わりに入力値を差し込む<b>DEMOテンプレート</b>で生成します（承認済みノウハウではありません）。</div>`}
      ${an.impact.length ? `<div class="badbox">生成後に案件条件が変わりました。影響する場面：${an.impact.map((i) => `<b>${esc(i.sceneId)}</b>（${esc(i.changedFields.join("・"))}）`).join("、")} <button class="btn small" id="regenImpact">影響場面だけ再生成</button></div>` : ""}
      ${an.questions.totalMissing ? `<div class="infobox">未入力の確認事項が ${an.questions.totalMissing} 件あります。未入力箇所は【要確認】として残ります。 <button class="btn sec small" data-tab-go="t2">情報入力へ</button></div>` : ""}
      <div class="grid2">
        <div><h3>生成対象の発話場面（${inc.length}）</h3><table><tr><th>場面</th><th>状態</th><th>不足入力</th></tr>
          ${inc.map((s) => `<tr><td><a href="#sc-${s.sceneId}">${esc(s.sceneId)}</a> ${esc(s.title)}</td><td>${s.generated ? badge(["生成済み", "ok"]) : badge(["未生成", "gray"])}</td><td class="small">${esc(s.missingInputs.join("、")) || "—"}</td></tr>`).join("")}</table></div>
        <div><h3>対象外の場面（${exc.length}）</h3><table><tr><th>場面</th><th>理由</th></tr>${exc.map((s) => `<tr><td>${esc(s.sceneId)} ${esc(s.title)}</td><td class="small">${esc(s.reason)}</td></tr>`).join("")}</table>
          <h3>フロー間の移行条件</h3>${an.transitions.map((t) => `<div class="small">→ ②キーマン名ありリスト：${esc(t.condition)} ${badge(COV[t.status])}<br><span class="muted">${esc(t.note)}</span></div>`).join("")}
        </div>
      </div>
    </div>
    <div id="sceneCards">${scenes.length ? scenes.map((s) => sceneCard(s, { actions: true })).join("") : `<div class="panel muted">まだ生成されていません。「スクリプトを生成」を押してください。</div>`}</div>
    <div class="panel">
      <h3 style="margin-top:0">フロー網羅チェック（${esc(an.flow.label)}・全${an.coverage.length}図形）</h3>
      <div class="row small" style="margin-bottom:6px">
        ${[["all", "すべて"], ["GENERATED", `生成対象 ${covCount("GENERATED")}`], ["NO_SCRIPT", `台本不要 ${covCount("NO_SCRIPT")}`], ["EXCLUDED_BY_CONDITION", `条件で対象外 ${covCount("EXCLUDED_BY_CONDITION")}`], ["NEEDS_CONFIRMATION", `要確認 ${covCount("NEEDS_CONFIRMATION")}`], ["S", "S"], ["D", "D"], ["I", "I"], ["R", "R"]].map(([k, l]) => `<button class="btn ${filter === k ? "" : "ghost"} small" data-cov="${k}">${esc(l)}</button>`).join("")}
      </div>
      <div style="max-height:520px;overflow:auto"><table><tr><th>図形ID</th><th>ラベル</th><th>分類</th><th>前の状況</th><th>関連場面</th><th>網羅</th><th>この案件</th><th>扱い・理由</th></tr>
        ${covRows.map((r) => `<tr><td>${esc(r.shapeId)}</td><td>${nl(r.label)}</td><td><span class="cls">${r.cls}</span> <span class="small muted">${CLS[r.cls]}</span></td><td class="small">${nl(r.parentLabel)}</td>
          <td>${r.scenes.map((s) => `<a href="#sc-${s}">${s}</a>`).join(" ") || "—"}</td><td>${badge(COV[r.coverage])}</td><td>${badge(PST[r.projectStatus])}</td><td class="small">${esc(r.note)}</td></tr>`).join("")}</table></div>
    </div>`;
  const generate = (body, btn) => run(async () => {
    const r = await api(`/api/projects/${S.pid}/generate`, { method: "POST", body });
    await refresh();
    if (r.errors.length) toast(`一部の場面で生成に失敗：${r.errors.map((e) => e.sceneId + " " + e.message).join(" / ")}`, true);
    else toast(r.mode === "ai" ? "AIで生成しました（AI提案・未承認）" : "DEMOテンプレートで生成しました");
  }, btn);
  $("#genAll").onclick = (e) => generate({}, e.target);
  if ($("#genDemo")) $("#genDemo").onclick = (e) => generate({ mode: "demo" }, e.target);
  if ($("#regenImpact")) $("#regenImpact").onclick = (e) => generate({ sceneIds: an.impact.map((i) => i.sceneId) }, e.target);
  $$("[data-cov]", el).forEach((b) => (b.onclick = () => { el._covFilter = b.dataset.cov; renderT3(); }));
  $$("[data-tab-go]", el).forEach((b) => (b.onclick = () => showTab(b.dataset.tabGo)));
  bindCopy(el);
}

// ---------------------------------------------------------------- ④ 修正
function renderDiff(segs) { return segs.map((d) => (d.op === "eq" ? esc(d.text) : d.op === "add" ? `<ins>${esc(d.text)}</ins>` : `<del>${esc(d.text)}</del>`)).join(""); }
function renderT4() {
  const el = $("#t4"); if (needProject(el)) return;
  const scenes = scenesOf();
  if (!scenes.length) { el.innerHTML = `<div class="panel muted">先に「③ 生成プレビュー」でスクリプトを生成してください。</div>`; return; }
  if (!S.sel4.size) S.sel4.add(scenes[0].sceneId);
  const pr = S.proposal;
  const focus = scenes.find((s) => S.sel4.has(s.sceneId));
  const examples = ["受付の第一声を20字程度短く", "名ありの指名取次だけ、もう少し丁寧に", "拒否対応を弱めて（押しすぎない）", "商談打診の言い回しを2案目として補足に追加", "全体的に「〜させていただく」を減らす"];
  el.innerHTML = `
    <div class="layout4">
      <div class="panel sticky-side scenelist">
        <h3 style="margin-top:0">修正する場面</h3>
        <div class="row small"><button class="btn ghost small" id="selAll">すべて</button><button class="btn ghost small" id="selNone">解除</button></div>
        ${scenes.map((s) => `<label><input type="checkbox" data-s4="${s.sceneId}" ${S.sel4.has(s.sceneId) ? "checked" : ""}> ${esc(s.sceneId)} ${esc(s.title)} ${s.reviewStatus === "CONFIRMED" ? "✓" : ""}</label>`).join("")}
      </div>
      <div>
        <div class="panel">
          <h2>自然言語で修正指示</h2>
          <p class="small muted">対象：${[...S.sel4].map(esc).join(", ") || "（未選択）"}。AIは修正箇所だけを提案します。採用するまでスクリプトは変わりません。${S.an.aiEnabled ? "" : "<br><b>DEMOモード</b>：『短く』『丁寧に／弱めに』のみ規則ベースで処理します。"}</p>
          <textarea id="instr" placeholder="例：受付の第一声を20字程度短く"></textarea>
          <div class="chips small">${examples.map((x) => `<button class="btn ghost small" data-ex="${esc(x)}">${esc(x)}</button>`).join("")}</div>
          <div class="row" style="margin-top:8px"><button class="btn" id="propose">修正案を作成</button></div>
        </div>
        ${pr ? `<div class="panel"><h3 style="margin-top:0">修正提案：「${esc(pr.instruction)}」 ${badge(pr.generatedBy === "ai" ? ["AI提案", ""] : ["DEMO規則", "demo"])}</h3>
          ${pr.impactNotes.map((n) => `<div class="infobox">${esc(n)}</div>`).join("")}
          ${pr.changes.length ? `<p class="small">変更される場面：${[...new Set(pr.changes.map((c) => c.sceneId))].map(esc).join(", ")}（それ以外の場面は変更されません）</p>` + pr.changes.map((c, i) => `<div class="q"><label><input type="checkbox" data-chg="${i}" checked> <b>${esc(c.sceneId)}</b> ／ ${esc(scenes.find((s) => s.sceneId === c.sceneId)?.cases.find((x) => x.caseId === c.caseId)?.label ?? c.caseId)} ／ ${STYLE[c.style]}</label>
            <div class="diff">${renderDiff(pr.diffs[i])}</div><div class="small muted">理由：${esc(c.reason)}</div></div>`).join("") + `<div class="row"><button class="btn" id="applyP">選択した変更を採用（新しい版を作成）</button><button class="btn ghost" id="rejectP">破棄</button></div>` : `<p class="muted">変更案はありません。</p>`}
        </div>` : ""}
        ${focus ? `<div class="panel"><h3 style="margin-top:0">手編集・承認：${esc(focus.sceneId)} ${esc(focus.title)}</h3>
          <div class="row" style="margin-bottom:8px">${badge(STATUS[focus.reviewStatus])}
            <button class="btn sec small" data-status="CONFIRMED">この場面を承認</button><button class="btn ghost small" data-status="NEEDS_CONFIRMATION">要確認に戻す</button></div>
          ${focus.cases.map((c) => `<div class="case"><b>${esc(c.label)}</b> <span class="cond">${esc(c.condition)}</span>
            ${["short", "standard", "supplement"].map((st) => { const v = c.variants.find((x) => x.style === st); return `<label class="f"><span class="small">${STYLE[st]}</span><textarea data-edit="${c.caseId}|${st}">${esc(v?.text ?? "")}</textarea></label>`; }).join("")}</div>`).join("")}
          <button class="btn" id="saveEdit">手編集を保存（新しい版）</button>
          ${focus.qualityWarnings.length ? `<div class="warnbox">${focus.qualityWarnings.map(esc).join("<br>")}</div>` : ""}
        </div>` : ""}
      </div>
    </div>`;
  $$("[data-s4]", el).forEach((c) => (c.onchange = () => { c.checked ? S.sel4.add(c.dataset.s4) : S.sel4.delete(c.dataset.s4); renderT4(); }));
  $("#selAll").onclick = () => { scenes.forEach((s) => S.sel4.add(s.sceneId)); renderT4(); };
  $("#selNone").onclick = () => { S.sel4.clear(); renderT4(); };
  $$("[data-ex]", el).forEach((b) => (b.onclick = () => ($("#instr").value = b.dataset.ex)));
  $("#propose").onclick = (e) => run(async () => {
    const instruction = $("#instr").value.trim(); if (!instruction) throw new Error("修正指示を入力してください");
    if (!S.sel4.size) throw new Error("修正する場面を選択してください");
    S.proposal = await api(`/api/scripts/${S.script.id}/revisions`, { method: "POST", body: { instruction, sceneIds: [...S.sel4] } });
    renderT4();
  }, e.target);
  if ($("#applyP")) $("#applyP").onclick = (e) => run(async () => {
    const indexes = $$("[data-chg]", el).filter((c) => c.checked).map((c) => Number(c.dataset.chg));
    if (!indexes.length) throw new Error("採用する変更を選択してください");
    await api(`/api/revisions/${pr.id}/apply`, { method: "POST", body: { indexes } }); S.proposal = null; await refresh(); toast("採用しました（新しい版を作成）");
  }, e.target);
  if ($("#rejectP")) $("#rejectP").onclick = () => run(async () => { await api(`/api/revisions/${pr.id}/reject`, { method: "POST" }); S.proposal = null; renderT4(); });
  $$("[data-status]", el).forEach((b) => (b.onclick = () => run(async () => { await api(`/api/scripts/${S.script.id}/scenes/${focus.sceneId}/status`, { method: "POST", body: { status: b.dataset.status } }); await refresh(); toast("承認状態を更新しました"); })));
  if ($("#saveEdit")) $("#saveEdit").onclick = (e) => run(async () => {
    let n = 0;
    for (const t of $$("[data-edit]", el)) {
      const [caseId, style] = t.dataset.edit.split("|");
      const cur = focus.cases.find((c) => c.caseId === caseId)?.variants.find((v) => v.style === style)?.text ?? "";
      if (t.value !== cur && (t.value.trim() || cur)) { S.script = await api(`/api/scripts/${S.script.id}/scenes/${focus.sceneId}`, { method: "PUT", body: { caseId, style, text: t.value } }); n++; }
    }
    await refresh(); toast(n ? `${n}箇所を保存しました` : "変更はありません");
  }, e.target);
}

// ---------------------------------------------------------------- ⑤ 完成版・履歴・出力
function renderT5() {
  const el = $("#t5"); if (needProject(el)) return;
  if (!S.script) { el.innerHTML = `<div class="panel muted">まだスクリプトがありません。</div>`; return; }
  const vs = [...S.script.versions].reverse();
  const view = el._view ?? latestV().version;
  const v = S.script.versions.find((x) => x.version === view) || latestV();
  const approved = v.scenes.filter((s) => s.reviewStatus === "CONFIRMED").length;
  el.innerHTML = `
    <div class="panel noprint">
      <h2>版の履歴</h2>
      <div style="max-height:260px;overflow:auto"><table><tr><th>版</th><th>日時</th><th>改訂理由</th><th>変更場面</th><th></th></tr>
      ${vs.map((x) => `<tr><td>v${x.version} ${x.approved ? badge(["承認版", "ok"]) : ""}</td><td class="small">${esc(new Date(x.createdAt).toLocaleString("ja-JP"))}</td><td class="small">${esc(x.reason)}</td><td class="small">${esc(x.changedScenes.join(", "))}</td>
        <td class="row"><button class="btn ghost small" data-view="${x.version}">表示</button>${x.version !== latestV().version ? `<button class="btn ghost small" data-revert="${x.version}">この版に戻す</button>` : ""}${!x.approved ? `<button class="btn sec small" data-approve="${x.version}">承認版にする</button>` : ""}</td></tr>`).join("")}</table></div>
      <div class="row" style="margin-top:8px">比較：<select id="cmpA" style="width:auto">${vs.map((x) => `<option value="${x.version}" ${x.version === Math.max(1, latestV().version - 1) ? "selected" : ""}>v${x.version}</option>`).join("")}</select> → <select id="cmpB" style="width:auto">${vs.map((x) => `<option value="${x.version}">v${x.version}</option>`).join("")}</select><button class="btn ghost small" id="cmp">差分を表示</button></div>
      <div id="cmpOut"></div>
    </div>
    <div class="panel">
      <div class="row noprint" style="justify-content:space-between"><h2 style="margin:0">v${v.version} ${esc(S.an.project.name)}｜${esc(S.an.flow.label)}</h2>
        <div class="row"><a class="btn sec" style="text-decoration:none" href="/api/scripts/${S.script.id}/export.md?version=${v.version}">Markdownで出力</a><button class="btn ghost" onclick="window.print()">印刷</button></div></div>
      <p class="small muted">承認済みの場面：${approved}/${v.scenes.length}。〔 〕は架電時に差し込む変数、【要確認】は未確定の情報です。</p>
      ${v.scenes.map((s) => sceneCard(s, { actions: true })).join("")}
      <h3>追加確認事項</h3><ul class="small">${S.script.openQuestions.map((q) => `<li>${esc(q)}</li>`).join("") || "<li>なし</li>"}</ul>
    </div>`;
  $$("[data-view]", el).forEach((b) => (b.onclick = () => { el._view = Number(b.dataset.view); renderT5(); }));
  $$("[data-revert]", el).forEach((b) => (b.onclick = () => run(async () => { await api(`/api/scripts/${S.script.id}/revert`, { method: "POST", body: { version: Number(b.dataset.revert) } }); el._view = undefined; await refresh(); toast("元に戻しました（新しい版として保存）"); })));
  $$("[data-approve]", el).forEach((b) => (b.onclick = () => run(async () => { await api(`/api/scripts/${S.script.id}/approve`, { method: "POST", body: { version: Number(b.dataset.approve) } }); await refresh(); toast("承認版にしました"); })));
  $("#cmp").onclick = () => run(async () => {
    const r = await api(`/api/scripts/${S.script.id}/compare?a=${$("#cmpA").value}&b=${$("#cmpB").value}`);
    $("#cmpOut").innerHTML = r.length ? r.map((d) => `<div class="q"><b>${esc(d.sceneId)}</b> / ${esc(d.caseId)} / ${STYLE[d.style]}<div class="diff">${renderDiff(d.diff)}</div></div>`).join("") : `<p class="muted">差分はありません。</p>`;
  });
  bindCopy(el);
}

// ---------------------------------------------------------------- ナレッジ
async function renderT6() {
  const el = $("#t6");
  const list = await api("/api/knowledge").catch(() => []);
  const edit = el._edit ? list.find((k) => k.id === el._edit) : null;
  el.innerHTML = `
    <div class="panel"><h2>ナレッジ（原則→理由→適用条件→例外→具体トーク）</h2>
      <p class="small muted">生成AIは CONFIRMED（承認済み）を優先し、NEEDS_CONFIRMATION は参考に留めます。初期登録分は指示書・コールフローから読み取ったガードレールであり、<b>承認済みノウハウではありません</b>。AIの提案がナレッジ原本へ自動で書き込まれることはありません。</p>
      <table><tr><th>場面</th><th>原則</th><th>出典</th><th>状態</th><th></th></tr>
      ${list.map((k) => `<tr><td>${esc(k.sceneIds.join(", "))}</td><td>${esc(k.principle)}<div class="small muted">理由：${esc(k.reason)}／条件：${esc(k.conditions)}${k.exceptions ? "／例外：" + esc(k.exceptions) : ""}${k.exampleTalk ? "<br>具体トーク：" + esc(k.exampleTalk) : ""}</div></td><td class="small">${esc(k.source)}</td><td>${badge(STATUS[k.status])}</td><td><button class="btn ghost small" data-kedit="${k.id}">編集</button></td></tr>`).join("")}</table>
    </div>
    <div class="panel"><h3 style="margin-top:0">${edit ? "ナレッジを編集" : "ナレッジを追加"}</h3>
      <div class="grid2">
        <label class="f"><span>対象場面（カンマ区切り：S01,S09 等）</span><input type="text" id="kS" value="${esc(edit?.sceneIds.join(",") || "")}"></label>
        <label class="f"><span>状態</span><select id="kSt">${["NEEDS_CONFIRMATION", "CONFIRMED"].map((s) => `<option value="${s}" ${edit?.status === s ? "selected" : ""}>${STATUS[s][0]}</option>`).join("")}</select></label>
      </div>
      ${[["kP", "原則 *", "principle"], ["kR", "理由", "reason"], ["kC", "適用条件", "conditions"], ["kE", "例外", "exceptions"], ["kT", "具体トーク", "exampleTalk"], ["kSrc", "出典（誰が・いつ承認したか）", "source"]].map(([id, l, k]) => `<label class="f"><span>${l}</span><textarea id="${id}">${esc(edit?.[k] || "")}</textarea></label>`).join("")}
      <div class="row"><button class="btn" id="kSave">保存</button>${edit ? `<button class="btn ghost" id="kCancel">キャンセル</button>` : ""}</div>
    </div>`;
  $$("[data-kedit]", el).forEach((b) => (b.onclick = () => { el._edit = b.dataset.kedit; renderT6(); }));
  if ($("#kCancel")) $("#kCancel").onclick = () => { el._edit = null; renderT6(); };
  $("#kSave").onclick = (e) => run(async () => {
    await api("/api/knowledge", { method: "POST", body: { id: edit?.id, sceneIds: $("#kS").value.split(",").map((s) => s.trim()).filter(Boolean), status: $("#kSt").value, principle: $("#kP").value, reason: $("#kR").value, conditions: $("#kC").value, exceptions: $("#kE").value, exampleTalk: $("#kT").value, source: $("#kSrc").value } });
    el._edit = null; await renderT6(); toast("保存しました");
  }, e.target);
}

boot().catch((e) => toast(e.message, true));
