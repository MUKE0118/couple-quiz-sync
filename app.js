(() => {
  const STORAGE_KEY = "couple-quiz:v1";
  const SYNC_CFG_KEY = "couple-quiz:sync:v1";

  /** @typedef {{ a?: Record<string,string>, b?: Record<string,string>, submittedA?: boolean, submittedB?: boolean, nicknameA?: string, nicknameB?: string }} State */

  const qs = (sel) => document.querySelector(sel);

  const el = {
    syncUrl: qs("#syncUrl"),
    roomCode: qs("#roomCode"),
    btnCreateRoom: qs("#btnCreateRoom"),
    btnJoinRoom: qs("#btnJoinRoom"),
    roleBadge: qs("#roleBadge"),
    connBadge: qs("#connBadge"),
    btnReset: qs("#btnReset"),
    btnPersonA: qs("#btnPersonA"),
    btnPersonB: qs("#btnPersonB"),
    nicknameA: qs("#nicknameA"),
    nicknameB: qs("#nicknameB"),
    statusLabelA: qs("#statusLabelA"),
    statusLabelB: qs("#statusLabelB"),
    statusA: qs("#statusA"),
    statusB: qs("#statusB"),
    progressFill: qs("#progressFill"),
    progressText: qs("#progressText"),
    questionHost: qs("#questionHost"),
    btnPrev: qs("#btnPrev"),
    btnNext: qs("#btnNext"),
    qIndexText: qs("#qIndexText"),
    btnSubmit: qs("#btnSubmit"),
    submitHint: qs("#submitHint"),
    resultCard: qs("#resultCard"),
    matchCount: qs("#matchCount"),
    totalCount: qs("#totalCount"),
    matchRate: qs("#matchRate"),
    matchList: qs("#matchList"),
    diffList: qs("#diffList"),
    dimensionGrid: qs("#dimensionGrid"),
    adviceHost: qs("#adviceHost"),
    charHostA: qs("#charHostA"),
    charHostB: qs("#charHostB"),
    btnShareImage: qs("#btnShareImage"),
    reportPreviewWrap: qs("#reportPreviewWrap"),
    reportPreviewImg: qs("#reportPreviewImg"),
    btnDownloadReport: qs("#btnDownloadReport"),
    btnViewAllAnimals: qs("#btnViewAllAnimals"),
    animalModal: qs("#animalModal"),
    animalModalList: qs("#animalModalList"),
    animalModalClose: qs("#animalModalClose"),
    animalModalBackdrop: qs("#animalModalBackdrop"),
  };
  let currentReportUrl = null;

  const questions = Array.isArray(window.QUESTIONS) ? window.QUESTIONS : [];
  const dimensions = Array.isArray(window.DIMENSIONS) ? window.DIMENSIONS : [];
  if (questions.length === 0) {
    el.questionHost.innerHTML = `<div class="question__title">题库为空</div><div class="question__desc">请在 questions.js 里添加题目。</div>`;
    el.btnPrev.disabled = true;
    el.btnNext.disabled = true;
    el.btnSubmit.disabled = true;
    return;
  }

  /** @type {"a"|"b"} */
  let currentPerson = "a";
  let currentIndex = 0;

  // Sync runtime
  /** @type {WebSocket | null} */
  let ws = null;
  let room = null;
  /** @type {"a"|"b"|"spectator"|null} */
  let myRole = null;
  /** @type {State | null} */
  let remoteState = null;
  let isConnected = false;
  let lastSentAt = 0;

  /** @returns {State} */
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { a: {}, b: {}, submittedA: false, submittedB: false, nicknameA: "", nicknameB: "" };
      const parsed = JSON.parse(raw);
      const nick = (v) => (typeof v === "string" ? String(v).trim().slice(0, 20) : "");
      return {
        a: parsed?.a && typeof parsed.a === "object" ? parsed.a : {},
        b: parsed?.b && typeof parsed.b === "object" ? parsed.b : {},
        submittedA: Boolean(parsed?.submittedA),
        submittedB: Boolean(parsed?.submittedB),
        nicknameA: nick(parsed?.nicknameA),
        nicknameB: nick(parsed?.nicknameB),
      };
    } catch {
      return { a: {}, b: {}, submittedA: false, submittedB: false, nicknameA: "", nicknameB: "" };
    }
  }

  /** @param {State} s */
  function saveState(s) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }

  function loadSyncCfg() {
    try {
      const raw = localStorage.getItem(SYNC_CFG_KEY);
      if (!raw) return { url: "", room: "" };
      const p = JSON.parse(raw);
      return { url: typeof p?.url === "string" ? p.url : "", room: typeof p?.room === "string" ? p.room : "" };
    } catch {
      return { url: "", room: "" };
    }
  }

  function saveSyncCfg(cfg) {
    localStorage.setItem(SYNC_CFG_KEY, JSON.stringify(cfg));
  }

  function activeState() {
    const s = remoteState || loadState();
    if (!s) return s;
    if (remoteState && (myRole === "a" || myRole === "b")) {
      const local = loadState();
      const mine = myRole === "a" ? "a" : "b";
      s[mine] = { ...(local[mine] || {}), ...(s[mine] || {}) };
    }
    return s;
  }

  function setConnBadge(ok, text) {
    if (!el.connBadge) return;
    el.connBadge.textContent = text;
    el.connBadge.className = `badge ${ok ? "badge--ok" : "badge--muted"}`;
  }

  function setRoleBadge(role) {
    if (!el.roleBadge) return;
    if (!role) {
      el.roleBadge.textContent = "未加入";
      el.roleBadge.className = "badge badge--muted";
      return;
    }
    if (role === "spectator") {
      el.roleBadge.textContent = "旁观";
      el.roleBadge.className = "badge badge--muted";
      return;
    }
    el.roleBadge.textContent = role.toUpperCase();
    el.roleBadge.className = "badge badge--ok";
  }

  function normalizeRoom(code) {
    return String(code || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 8);
  }

  function makeRoomCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
    return out;
  }

  function toWsUrl(input) {
    const v = String(input || "").trim();
    if (!v) return "";
    if (v.startsWith("ws://") || v.startsWith("wss://")) return v;
    if (v.startsWith("https://")) return v.replace("https://", "wss://");
    if (v.startsWith("http://")) return v.replace("http://", "ws://");
    return v;
  }

  function wsSend(obj) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(obj));
  }

  function connectAndJoin() {
    const url = toWsUrl(el.syncUrl?.value || "");
    const roomCode = normalizeRoom(el.roomCode?.value || "");
    if (!url || !roomCode) {
      alert("请先填写同步服务地址 + 房间码。");
      return;
    }

    saveSyncCfg({ url, room: roomCode });
    room = roomCode;
    remoteState = null;
    myRole = null;
    setRoleBadge(null);
    setConnBadge(false, "连接中…");

    try {
      if (ws) ws.close();
    } catch {}

    ws = new WebSocket(url);
    ws.addEventListener("open", () => {
      isConnected = true;
      setConnBadge(true, "已连接");
      // Ask server to assign role automatically. If user currently viewing A/B, prefer that.
      wsSend({ type: "join", room: roomCode, preferredRole: currentPerson });
    });

    ws.addEventListener("message", (ev) => {
      let msg = null;
      try {
        msg = JSON.parse(String(ev.data || ""));
      } catch {}
      if (!msg || typeof msg !== "object") return;

      function ensureStateShape(s) {
        if (!s) return s;
        s.a = s.a && typeof s.a === "object" ? s.a : {};
        s.b = s.b && typeof s.b === "object" ? s.b : {};
        return s;
      }

      if (msg.type === "joined") {
        myRole = msg.role || null;
        setRoleBadge(myRole);
        const incoming = msg.state || null;
        if (incoming && (myRole === "a" || myRole === "b")) {
          const local = loadState();
          const mine = myRole === "a" ? "a" : "b";
          incoming[mine] = { ...(incoming[mine] || {}), ...(local[mine] || {}) };
        }
        remoteState = ensureStateShape(incoming || { a: {}, b: {}, submittedA: false, submittedB: false });
        if (myRole === "a" || myRole === "b") setPerson(myRole);
        render();
        return;
      }

      if (msg.type === "state") {
        const incoming = msg.state || null;
        if (incoming && (myRole === "a" || myRole === "b")) {
          const mine = myRole === "a" ? "a" : "b";
          incoming[mine] = { ...(incoming[mine] || {}), ...(remoteState?.[mine] || {}) };
        }
        remoteState = ensureStateShape(incoming || { a: {}, b: {} });
        render();
        return;
      }
    });

    ws.addEventListener("close", () => {
      isConnected = false;
      setConnBadge(false, "离线");
      setRoleBadge(myRole);
    });

    ws.addEventListener("error", () => {
      setConnBadge(false, "错误");
    });
  }

  function maybeSyncPatch(patch) {
    if (!room || !ws || ws.readyState !== WebSocket.OPEN) return;
    if (myRole !== "a" && myRole !== "b") return;

    const isSubmitOnly = patch && typeof patch.submitted === "boolean" && !patch.answers;
    if (!isSubmitOnly) {
      const t = Date.now();
      if (t - lastSentAt < 80) return;
      lastSentAt = t;
    }
    wsSend({ type: "update", patch });
  }

  function getAnswersFor(person, state) {
    if (!state) return {};
    const ans = person === "a" ? state.a : state.b;
    return ans && typeof ans === "object" ? ans : {};
  }

  /** @param {State} state */
  function displayName(person, state) {
    if (!state) return person === "a" ? "A" : "B";
    const name = person === "a" ? (state.nicknameA || "").trim() : (state.nicknameB || "").trim();
    return name || (person === "a" ? "A" : "B");
  }

  function setSubmitted(person, state, value) {
    if (person === "a") state.submittedA = value;
    else state.submittedB = value;
  }

  function isSubmitted(person, state) {
    return person === "a" ? Boolean(state.submittedA) : Boolean(state.submittedB);
  }

  function setPerson(person) {
    currentPerson = person;
    el.btnPersonA.classList.toggle("pill--active", person === "a");
    el.btnPersonB.classList.toggle("pill--active", person === "b");
    el.btnPersonA.setAttribute("aria-selected", person === "a" ? "true" : "false");
    el.btnPersonB.setAttribute("aria-selected", person === "b" ? "true" : "false");
    render();
  }

  function clampIndex() {
    currentIndex = Math.max(0, Math.min(currentIndex, questions.length - 1));
  }

  function setIndex(nextIndex) {
    currentIndex = nextIndex;
    clampIndex();
    render();
  }

  function optionLabel(question, optionId) {
    const opt = question.options.find((o) => o.id === optionId);
    return opt ? opt.label : "(未选择)";
  }

  function computeMatches(state) {
    const a = state.a || {};
    const b = state.b || {};

    /** @type {{question: any, a: string, b: string}[]} */
    const matches = [];
    /** @type {{question: any, a: string, b: string}[]} */
    const diffs = [];

    for (const q of questions) {
      const av = a[q.id] ?? "";
      const bv = b[q.id] ?? "";
      if (av && bv && av === bv) matches.push({ question: q, a: av, b: bv });
      else diffs.push({ question: q, a: av, b: bv });
    }

    return { matches, diffs };
  }

  function computeDimensionStats(state) {
    const a = state.a || {};
    const b = state.b || {};

    /** @type {Record<string, {dimId: string, name: string, total: number, matched: number, unanswered: number, questions: any[]}>} */
    const byDim = {};

    const dimName = (id) => dimensions.find((d) => d.id === id)?.name || id || "未分类";

    for (const q of questions) {
      const d = q.dim || "misc";
      if (!byDim[d]) byDim[d] = { dimId: d, name: dimName(d), total: 0, matched: 0, unanswered: 0, questions: [] };
      byDim[d].total += 1;
      byDim[d].questions.push(q);

      const av = a[q.id] ?? "";
      const bv = b[q.id] ?? "";
      if (!av || !bv) byDim[d].unanswered += 1;
      else if (av === bv) byDim[d].matched += 1;
    }

    const list = Object.values(byDim).map((x) => ({
      ...x,
      rate: x.total === 0 ? 0 : Math.round((x.matched / x.total) * 100),
    }));

    list.sort((p, q) => q.rate - p.rate);
    return list;
  }

  function canSubmit(person, state) {
    const answers = getAnswersFor(person, state);
    const total = questions.length;
    const done = questions.reduce((acc, q) => acc + (answers[q.id] ? 1 : 0), 0);
    return done >= total;
  }

  function answerCount(person, state) {
    const answers = getAnswersFor(person, state);
    return questions.reduce((acc, q) => acc + (answers?.[q.id] ? 1 : 0), 0);
  }

  function renderStatus(state) {
    const total = questions.length;
    const countA = answerCount("a", state);
    const countB = answerCount("b", state);
    const aOk = Boolean(state.submittedA);
    const bOk = Boolean(state.submittedB);
    if (el.statusLabelA) el.statusLabelA.textContent = displayName("a", state) + " 进度";
    if (el.statusLabelB) el.statusLabelB.textContent = displayName("b", state) + " 进度";
    el.statusA.textContent = `${countA}/${total} 题 · ${aOk ? "已提交" : "未提交"}`;
    el.statusB.textContent = `${countB}/${total} 题 · ${bOk ? "已提交" : "未提交"}`;
    el.statusA.className = `badge ${aOk ? "badge--ok" : "badge--muted"}`;
    el.statusB.className = `badge ${bOk ? "badge--ok" : "badge--muted"}`;
  }

  function renderProgress(state) {
    const answers = getAnswersFor(currentPerson, state);
    const done = questions.reduce((acc, q) => acc + (answers?.[q.id] ? 1 : 0), 0);
    const total = questions.length;
    const pct = Math.round((done / total) * 100);
    el.progressFill.style.width = `${pct}%`;
    el.progressText.textContent = `${done} / ${total}`;
  }

  function renderQuestion(state) {
    clampIndex();
    const q = questions[currentIndex];
    const answers = getAnswersFor(currentPerson, state);
    const selected = answers?.[q.id] ?? "";
    const isViewOnly = Boolean(remoteState && myRole !== currentPerson);

    const optionsHtml = q.options
      .map((opt) => {
        const checked = opt.id === selected ? "checked" : "";
        const inputId = `${currentPerson}-${q.id}-${opt.id}`;
        const disabled = isViewOnly ? " disabled" : "";
        return `
          <label class="option ${isViewOnly ? "option--disabled" : ""}" for="${inputId}">
            <input type="radio" name="${currentPerson}-${q.id}" id="${inputId}" value="${opt.id}" ${checked}${disabled} />
            <div class="option__label">${escapeHtml(opt.label)}</div>
          </label>
        `;
      })
      .join("");

    el.questionHost.innerHTML = `
      <div class="question__title">${escapeHtml(q.title)}</div>
      ${q.desc ? `<div class="question__desc">${escapeHtml(q.desc)}</div>` : ""}
      <div class="options">${optionsHtml}</div>
      ${isViewOnly ? `<p class="question__viewOnly">当前为对方视角，仅可查看进度，由对方本人作答。</p>` : ""}
    `;

    el.questionHost.querySelectorAll('input[type="radio"]').forEach((input) => {
      input.addEventListener("change", (e) => {
        const value = e.target?.value;
        if (!value) return;
        // 联机时只允许编辑自己的答案，避免误改对方
        if (remoteState && myRole !== currentPerson) return;
        const s = activeState();
        if (!s) return;
        if (currentPerson === "a") {
          if (!s.a || typeof s.a !== "object") s.a = {};
        } else {
          if (!s.b || typeof s.b !== "object") s.b = {};
        }
        const a = getAnswersFor(currentPerson, s);
        a[q.id] = value;
        saveState(s);
        if (remoteState && myRole === currentPerson) {
          maybeSyncPatch({ answers: { [q.id]: value } });
        }
        render();
      });
    });

    el.btnPrev.disabled = currentIndex === 0;
    const nextDisabled = currentIndex === questions.length - 1 || !selected;
    el.btnNext.disabled = nextDisabled;
    el.btnNext.title = nextDisabled && !selected ? "请先选择本题答案" : "";
    el.qIndexText.textContent = `${currentIndex + 1} / ${questions.length}`;

    const s2 = activeState();
    const total = questions.length;
    const done = answerCount(currentPerson, s2);
    const canSubmitNow = done >= total;
    const isOwnTab = !remoteState || myRole === currentPerson;
    const submitEnabled = isOwnTab && canSubmitNow;
    el.btnSubmit.disabled = !submitEnabled;
    el.btnSubmit.textContent = `提交 ${displayName(currentPerson, s2)} 的答案`;

    const submitted = isSubmitted(currentPerson, s2);
    if (remoteState && myRole !== currentPerson) {
      el.submitHint.textContent = "当前为对方视角，请切换回自己的身份（A 或 B）后再提交。";
    } else {
      el.submitHint.textContent = submitted
        ? "已提交。若你修改了答案，再次提交会覆盖之前的提交。"
        : submitEnabled
          ? "全部题已作答，可以提交。提交后仍可修改：重新提交会覆盖。"
          : "请先把所有题都选完，本人才可以提交。";
    }
  }

  function renderResults(state) {
    const ready = Boolean(state.submittedA) && Boolean(state.submittedB);
    el.resultCard.classList.toggle("card--hidden", !ready);
    if (!ready) return;

    const { matches, diffs } = computeMatches(state);
    const total = questions.length;
    const rate = total === 0 ? 0 : Math.round((matches.length / total) * 100);

    el.matchCount.textContent = `${matches.length}`;
    el.totalCount.textContent = `${total}`;
    el.matchRate.textContent = `${rate}%`;

    renderDimensionAnalysis(state);
    renderAdvice(state);
    renderCharacters(state);

    const nameA = displayName("a", state);
    const nameB = displayName("b", state);
    el.matchList.innerHTML =
      matches.length === 0
        ? `<div class="hint">暂时没有完全一致的题（也没关系，可以看看不一致的点）。</div>`
        : matches.map((x) => renderItem(x.question, x.a, x.b, true, nameA, nameB)).join("");

    el.diffList.innerHTML =
      diffs.length === 0
        ? `<div class="hint">全部一致。你们很同步。</div>`
        : diffs.map((x) => renderItem(x.question, x.a, x.b, false, nameA, nameB)).join("");

    if (el.btnShareImage) {
      el.btnShareImage.onclick = async () => {
        const blob = await drawReportImage(state);
        if (!blob) return;
        if (currentReportUrl) URL.revokeObjectURL(currentReportUrl);
        currentReportUrl = URL.createObjectURL(blob);
        const safe = (s) => String(s).replace(/[/\\:*?"<>|]/g, "_").slice(0, 20) || "report";
        const filename = `情侣契合度报告-${safe(nameA)}-${safe(nameB)}-${matches.length}-${total}.png`;
        if (el.reportPreviewImg) {
          el.reportPreviewImg.src = currentReportUrl;
          el.reportPreviewImg.style.display = "block";
        }
        if (el.reportPreviewWrap) el.reportPreviewWrap.classList.remove("card--hidden");
        if (el.btnDownloadReport) {
          el.btnDownloadReport.href = currentReportUrl;
          el.btnDownloadReport.download = filename;
          el.btnDownloadReport.style.display = "inline-flex";
        }
        const a = document.createElement("a");
        a.href = currentReportUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      };
    }
  }

  function drawReportImage(state) {
    const { matches } = computeMatches(state);
    const total = questions.length;
    const rate = total === 0 ? 0 : Math.round((matches.length / total) * 100);
    const stats = computeDimensionStats(state);
    const animalA = buildAnimalCard(state.a || {});
    const animalB = buildAnimalCard(state.b || {});
    const nameA = displayName("a", state);
    const nameB = displayName("b", state);

    const W = 560;
    const H = 920;
    const scale = 2;
    const pad = 44;
    const canvas = document.createElement("canvas");
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.scale(scale, scale);

    const bg = "#fafafa";
    const cardBg = "#ffffff";
    const text = "#1d1d1f";
    const textSec = "#6e6e73";
    const textTri = "#86868b";
    const line = "rgba(0,0,0,0.06)";
    const font = "PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif";

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = cardBg;
    roundRect(ctx, 32, 32, W - 64, H - 64, 24);
    ctx.fill();
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    ctx.stroke();

    let y = 72;
    ctx.fillStyle = textTri;
    ctx.font = `400 12px ${font}`;
    ctx.fillText("契合度报告", pad, y);
    y += 28;
    ctx.fillStyle = text;
    ctx.font = `600 24px ${font}`;
    ctx.fillText("情侣契合度测试", pad, y);
    y += 52;

    ctx.fillStyle = text;
    ctx.font = `600 48px ${font}`;
    const rateStr = rate + "%";
    const rateW = ctx.measureText(rateStr).width;
    ctx.fillText(rateStr, (W - rateW) / 2, y);
    y += 44;
    ctx.fillStyle = textSec;
    ctx.font = `400 14px ${font}`;
    ctx.fillText(`一致 ${matches.length} / ${total} 题`, (W - ctx.measureText(`一致 ${matches.length} / ${total} 题`).width) / 2, y);
    y += 48;

    ctx.strokeStyle = line;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(W - pad, y);
    ctx.stroke();
    y += 36;

    ctx.fillStyle = textTri;
    ctx.font = `500 11px ${font}`;
    ctx.fillText("维度", pad, y);
    y += 24;
    for (let i = 0; i < Math.min(stats.length, 6); i++) {
      const d = stats[i];
      const pct = Math.max(0, Math.min(100, d.rate));
      ctx.fillStyle = text;
      ctx.font = `400 13px ${font}`;
      ctx.fillText(d.name, pad, y + 12);
      ctx.fillStyle = textSec;
      ctx.font = `400 12px ${font}`;
      ctx.fillText(pct + "%", W - pad - 32, y + 12);
      const barW = W - pad * 2 - 44;
      ctx.fillStyle = line;
      ctx.fillRect(pad, y + 18, barW, 4);
      ctx.fillStyle = text;
      ctx.fillRect(pad, y + 18, (barW * pct) / 100, 4);
      y += 36;
    }
    y += 28;

    ctx.fillStyle = textTri;
    ctx.font = `500 11px ${font}`;
    ctx.fillText("动物人格", pad, y);
    y += 28;
    ctx.font = `400 40px ${font}`;
    ctx.fillText(animalA.emoji, pad, y + 32);
    ctx.fillStyle = text;
    ctx.font = `600 15px ${font}`;
    ctx.fillText(nameA + " · " + animalA.name, pad + 52, y + 20);
    ctx.fillStyle = textSec;
    ctx.font = `400 12px ${font}`;
    ctx.fillText(animalA.desc, pad + 52, y + 40);
    y += 80;
    ctx.font = `400 40px ${font}`;
    ctx.fillText(animalB.emoji, pad, y + 32);
    ctx.fillStyle = text;
    ctx.font = `600 15px ${font}`;
    ctx.fillText(nameB + " · " + animalB.name, pad + 52, y + 20);
    ctx.fillStyle = textSec;
    ctx.font = `400 12px ${font}`;
    ctx.fillText(animalB.desc, pad + 52, y + 40);
    y += 56;

    ctx.fillStyle = textTri;
    ctx.font = `400 10px ${font}`;
    ctx.fillText("情侣契合度测试 · 本地生成", pad, H - 48);

    function roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob || null), "image/png", 1);
    }).then((blob) => blob);
  }

  function renderCharacters(state) {
    if (!el.charHostA || !el.charHostB) return;
    const a = state.a || {};
    const b = state.b || {};
    const nameA = displayName("a", state);
    const nameB = displayName("b", state);

    const animalA = buildAnimalCard(a);
    const animalB = buildAnimalCard(b);

    const tagA = el.resultCard?.querySelector(".charGrid .animalCard:nth-child(1) .animalCard__tag");
    const tagB = el.resultCard?.querySelector(".charGrid .animalCard:nth-child(2) .animalCard__tag");
    if (tagA) tagA.textContent = nameA;
    if (tagB) tagB.textContent = nameB;

    el.charHostA.innerHTML = `
      <div class="animalCard__emoji" role="img" aria-label="${escapeHtml(animalA.name)}">${escapeHtml(animalA.emoji)}</div>
      <div class="animalCard__text">
        <div class="animalCard__name">${escapeHtml(animalA.name)}</div>
        <div class="animalCard__desc">${escapeHtml(animalA.desc)}</div>
      </div>
    `;
    el.charHostB.innerHTML = `
      <div class="animalCard__emoji" role="img" aria-label="${escapeHtml(animalB.name)}">${escapeHtml(animalB.emoji)}</div>
      <div class="animalCard__text">
        <div class="animalCard__name">${escapeHtml(animalB.name)}</div>
        <div class="animalCard__desc">${escapeHtml(animalB.desc)}</div>
      </div>
    `;
    el.charHostA.setAttribute("aria-label", nameA + " 的动物人格");
    el.charHostB.setAttribute("aria-label", nameB + " 的动物人格");
  }

  const ANIMALS = [
    { emoji: "🦊", name: "狐狸", desc: "敏锐、有边界感，重视默契与信任。" },
    { emoji: "🐱", name: "猫", desc: "独立又黏人，需要安全与尊重。" },
    { emoji: "🦅", name: "鹰", desc: "目标清晰，需要空间与共同方向。" },
    { emoji: "🐬", name: "海豚", desc: "善于沟通与共情，喜欢陪伴与协作。" },
    { emoji: "🦌", name: "鹿", desc: "温和敏感，重视稳定与承诺。" },
    { emoji: "🐺", name: "狼", desc: "忠诚、有领地感，重视默契与分工。" },
    { emoji: "🐰", name: "兔子", desc: "柔软细腻，需要被倾听与保护。" },
    { emoji: "🦉", name: "猫头鹰", desc: "理性冷静，喜欢深度对话与规划。" },
    { emoji: "🐻", name: "熊", desc: "踏实可靠，用行动表达关心。" },
    { emoji: "🦋", name: "蝴蝶", desc: "浪漫随性，重视感觉与仪式感。" },
    { emoji: "🐘", name: "象", desc: "长情记仇，重视承诺与公平。" },
    { emoji: "🐧", name: "企鹅", desc: "专一顾家，重视陪伴与共同目标。" },
  ];

  /** 维度顺序，用于 tie-break 与次维度选择 */
  const DIM_ORDER = ["signal", "boundary", "conflict", "money", "future", "intimacy", "life"];

  /**
   * 每个主维度对应若干动物（索引）；用「次维度」在顺序中的位置取模，选出其一。
   * 逻辑：你的作答在哪个维度上最突出（主维度），再结合第二突出的维度（次维度）决定具体动物。
   */
  const PRIMARY_DIM_TO_ANIMALS = {
    signal: [3, 7],       // 沟通信号 → 海豚 / 猫头鹰
    boundary: [0, 5],     // 边界与自由 → 狐狸 / 狼
    conflict: [4, 7],     // 冲突修复 → 鹿 / 猫头鹰
    money: [8, 10],       // 金钱与风险 → 熊 / 象
    future: [2, 11],      // 未来与承诺 → 鹰 / 企鹅
    intimacy: [6, 9, 3],  // 亲密与表达 → 兔子 / 蝴蝶 / 海豚
    life: [1, 8],         // 生活节奏 → 猫 / 熊
  };

  /** 根据作答计算各维度的「强度」：同一维度下每题选中的选项序号之和（选项越靠后数值越大） */
  function computeDimensionScoresForAnimal(answers) {
    const scores = {};
    DIM_ORDER.forEach((d) => { scores[d] = 0; });
    for (const q of questions) {
      const dim = q.dim || "signal";
      const optId = answers[q.id];
      if (optId == null) continue;
      const idx = q.options.findIndex((o) => o.id === optId);
      if (idx >= 0) scores[dim] = (scores[dim] || 0) + idx;
    }
    return scores;
  }

  /** 按维度得分降序排列维度 id（得分相同按 DIM_ORDER 顺序） */
  function getDominantDimensionIds(scores) {
    return DIM_ORDER.slice().sort((a, b) => {
      const sa = scores[a] ?? 0;
      const sb = scores[b] ?? 0;
      if (sb !== sa) return sb - sa;
      return DIM_ORDER.indexOf(a) - DIM_ORDER.indexOf(b);
    });
  }

  /**
   * 由作答组合得到动物：先算各维度强度 → 主维度 + 次维度 → 查表得到唯一动物。
   */
  function buildAnimalCard(answers) {
    const scores = computeDimensionScoresForAnimal(answers || {});
    const [primary, secondary] = getDominantDimensionIds(scores);
    const list = PRIMARY_DIM_TO_ANIMALS[primary];
    if (!list || list.length === 0) {
      const fallback = ANIMALS[0];
      return { emoji: fallback.emoji, name: fallback.name, desc: fallback.desc };
    }
    const secondaryRank = DIM_ORDER.indexOf(secondary);
    const idx = list[secondaryRank % list.length];
    const animal = ANIMALS[idx];
    return { emoji: animal.emoji, name: animal.name, desc: animal.desc };
  }

  function renderAnimalModalList() {
    if (!el.animalModalList) return;
    el.animalModalList.innerHTML = ANIMALS.map(
      (a) => `
        <article class="animalModalCard">
          <div class="animalModalCard__emoji" role="img" aria-label="${escapeHtml(a.name)}">${escapeHtml(a.emoji)}</div>
          <div class="animalModalCard__text">
            <div class="animalModalCard__name">${escapeHtml(a.name)}</div>
            <div class="animalModalCard__desc">${escapeHtml(a.desc)}</div>
          </div>
        </article>
      `,
    ).join("");
  }

  function openAnimalModal() {
    renderAnimalModalList();
    if (el.animalModal) {
      el.animalModal.classList.add("modal--open");
      el.animalModal.setAttribute("aria-hidden", "false");
    }
  }

  function closeAnimalModal() {
    if (el.animalModal) {
      el.animalModal.classList.remove("modal--open");
      el.animalModal.setAttribute("aria-hidden", "true");
    }
  }

  function renderDimensionAnalysis(state) {
    if (!el.dimensionGrid) return;
    const stats = computeDimensionStats(state);
    if (stats.length === 0) {
      el.dimensionGrid.innerHTML = `<div class="hint">暂无维度数据。</div>`;
      return;
    }

    el.dimensionGrid.innerHTML = stats
      .map((d) => {
        const pct = Math.max(0, Math.min(100, d.rate));
        return `
          <div class="dim">
            <div class="dim__top">
              <div class="dim__name">${escapeHtml(d.name)}</div>
              <div class="dim__score">${pct}% · ${d.matched}/${d.total}</div>
            </div>
            <div class="dim__bar"><div class="dim__fill" style="width:${pct}%"></div></div>
          </div>
        `;
      })
      .join("");
  }

  function renderAdvice(state) {
    if (!el.adviceHost) return;
    const stats = computeDimensionStats(state);
    const { diffs } = computeMatches(state);

    const lowest = [...stats].sort((a, b) => a.rate - b.rate).slice(0, 2);
    const highest = [...stats].sort((a, b) => b.rate - a.rate).slice(0, 1);

    const tips = [];

    if (highest[0]) {
      tips.push({
        title: `你们的强项：${highest[0].name}`,
        body:
          `这个维度一致率较高（${highest[0].rate}%）。建议把这里当作“安全基地”：当其他维度起冲突时，先回到你们最擅长的相处方式，再谈问题。`,
      });
    }

    for (const d of lowest) {
      tips.push(adviceForDimension(d, diffs));
    }

    tips.push({
      title: "一条万能协议（3 分钟可落地）",
      body:
        `约定一个“安全词”与流程：\n` +
        `- 安全词：例如“暂停/断电/回到基地”。\n` +
        `- 流程：先说感受（1 句话）→ 说需要（1 句话）→ 给选择（2 选 1）。\n` +
        `例：我现在有点紧绷，我需要你先听我说完。你想现在听 5 分钟，还是 30 分钟后再聊？`,
    });

    el.adviceHost.innerHTML = tips
      .filter(Boolean)
      .map(
        (t) => `
          <div class="adviceItem">
            <div class="adviceItem__title">${escapeHtml(t.title)}</div>
            <div class="adviceItem__body">${escapeHtml(t.body).replaceAll("\n", "<br/>")}</div>
          </div>
        `,
      )
      .join("");
  }

  function adviceForDimension(dimStat, diffs) {
    const dimId = dimStat.dimId;
    const name = dimStat.name;
    const relatedDiffs = diffs.filter((x) => (x.question?.dim || "misc") === dimId);
    const count = relatedDiffs.length;

    const base = {
      signal: {
        title: `需要对齐：${name}（${dimStat.rate}%）`,
        body:
          `你们在“信号”上可能用的是不同协议（暗示 vs 直说、回复节奏期待不同）。\n` +
          `建议：\n` +
          `- 约定 2 条可执行规则：① 忙时回“我在忙，X 点回”；② 情绪来时用“我需要…”开头。\n` +
          `- 做一次“信号表”对齐：我表达关心的方式是___，我希望被关心的方式是___。\n` +
          (count ? `- 本次不一致题数：${count}（优先把这些题聊一遍就会明显改善）` : ""),
      },
      boundary: {
        title: `需要对齐：${name}（${dimStat.rate}%）`,
        body:
          `边界不一致通常不是“不爱”，而是“安全感来源不同”（有人靠透明，有人靠自由）。\n` +
          `建议：\n` +
          `- 写下 3 条边界：可以做/不可以做/做之前要先说。\n` +
          `- 把“隐私”拆成两部分：不被审查（自由）与不被隐瞒（透明）。分别给出你们能接受的最低标准。\n` +
          (count ? `- 本次不一致题数：${count}` : ""),
      },
      conflict: {
        title: `需要对齐：${name}（${dimStat.rate}%）`,
        body:
          `冲突不是问题本身，修复速度才决定伤口深浅。\n` +
          `建议：\n` +
          `- 约定“冷静窗口”：如果需要冷静，就说“我需要 X 分钟，X 分钟后我会回来”。\n` +
          `- 冲突后做 1 次复盘：触发点是什么？我真正害怕的是什么？下次的可执行动作是什么？\n` +
          (count ? `- 本次不一致题数：${count}` : ""),
      },
      money: {
        title: `需要对齐：${name}（${dimStat.rate}%）`,
        body:
          `钱的争执常常伪装成“性格不合”，实则是“风险偏好 + 安全感需求”不同。\n` +
          `建议：\n` +
          `- 定一个“讨论阈值”（例如 500/1000/3000）：超过就提前同步。\n` +
          `- 把钱分三格：共同账（固定开销）/自由账（各自支配）/未来账（共同目标）。\n` +
          (count ? `- 本次不一致题数：${count}` : ""),
      },
      future: {
        title: `需要对齐：${name}（${dimStat.rate}%）`,
        body:
          `未来感差异会让一个人觉得“不确定”，另一个觉得“被控制”。\n` +
          `建议：\n` +
          `- 用“方向 + 复审时间”替代死时间表：我们大方向是___，在___月再复审一次。\n` +
          `- 讨论“承诺的形状”：对你而言，承诺更像身份/行动/时间/选择中的哪一个？\n` +
          (count ? `- 本次不一致题数：${count}` : ""),
      },
      intimacy: {
        title: `需要对齐：${name}（${dimStat.rate}%）`,
        body:
          `亲密不一致常见于“表达渠道不同”（你在做我却没收到）。\n` +
          `建议：\n` +
          `- 互相指定一个“最能收到爱”的动作（可量化）：每周一次约会/每天一个拥抱/睡前 10 分钟聊天。\n` +
          `- 公开/私密的偏好不同也没关系：用“对内稳定 + 对外自选”来解决。\n` +
          (count ? `- 本次不一致题数：${count}` : ""),
      },
      life: {
        title: `需要对齐：${name}（${dimStat.rate}%）`,
        body:
          `节奏不一致会在小事上消耗：一个追求规律，一个追求自由。\n` +
          `建议：\n` +
          `- 采用“双轨日历”：固定轨（必须做的）+ 随性轨（可临时变）。\n` +
          `- 每周 15 分钟“同步会”：下周各自最忙的一天是哪天？需要对方怎么配合？\n` +
          (count ? `- 本次不一致题数：${count}` : ""),
      },
    };

    const fallback = {
      title: `需要对齐：${name}（${dimStat.rate}%）`,
      body:
        `这个维度一致率较低，建议把“不一致的题”逐题聊一遍：每题只回答两句话——我为什么选这个？我希望对方怎么做？`,
    };

    return base[dimId] || fallback;
  }

  function renderItem(question, a, b, ok, nameA, nameB) {
    const na = nameA || "A";
    const nb = nameB || "B";
    const aLabel = a ? optionLabel(question, a) : "（" + na + " 未作答）";
    const bLabel = b ? optionLabel(question, b) : "（" + nb + " 未作答）";
    return `
      <div class="item">
        <div class="item__q">${escapeHtml(question.title)}</div>
        <div class="item__a">
          <span class="tag ${ok ? "tag--ok" : "tag--diff"}">${escapeHtml(na)}：${escapeHtml(aLabel)}</span>
          <span class="tag ${ok ? "tag--ok" : "tag--diff"}">${escapeHtml(nb)}：${escapeHtml(bLabel)}</span>
        </div>
      </div>
    `;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function render() {
    const state = activeState();
    if (el.nicknameA) el.nicknameA.value = (state.nicknameA ?? "") || "";
    if (el.nicknameB) el.nicknameB.value = (state.nicknameB ?? "") || "";
    renderStatus(state);
    renderProgress(state);
    renderQuestion(state);
    renderResults(state);
  }

  // Events
  el.btnPersonA.addEventListener("click", () => setPerson("a"));
  el.btnPersonB.addEventListener("click", () => setPerson("b"));

  function applyNickname(person, value) {
    const state = activeState();
    const v = String(value || "").trim().slice(0, 20);
    if (person === "a") state.nicknameA = v;
    else state.nicknameB = v;
    if (!remoteState) saveState(state);
    else if (myRole === person) maybeSyncPatch(person === "a" ? { nicknameA: v } : { nicknameB: v });
    render();
  }
  if (el.nicknameA) {
    el.nicknameA.addEventListener("input", () => applyNickname("a", el.nicknameA.value));
    el.nicknameA.addEventListener("blur", () => applyNickname("a", el.nicknameA.value));
  }
  if (el.nicknameB) {
    el.nicknameB.addEventListener("input", () => applyNickname("b", el.nicknameB.value));
    el.nicknameB.addEventListener("blur", () => applyNickname("b", el.nicknameB.value));
  }

  el.btnPrev.addEventListener("click", () => setIndex(currentIndex - 1));
  el.btnNext.addEventListener("click", () => {
    const state = activeState();
    const q = questions[currentIndex];
    if (!q) return;
    const answers = getAnswersFor(currentPerson, state);
    const selected = answers?.[q.id] ?? "";
    if (!selected) {
      el.btnNext.setAttribute("title", "请先选择本题答案");
      return;
    }
    if (currentIndex < questions.length - 1) setIndex(currentIndex + 1);
  });

  el.btnSubmit.addEventListener("click", () => {
    const state = activeState();
    if (!state) return;
    const total = questions.length;
    const done = answerCount(currentPerson, state);
    if (done < total) {
      alert("请先把所有题都选完，再提交。（当前已答 " + done + "/" + total + " 题）");
      return;
    }
    setSubmitted(currentPerson, state, true);
    saveState(state);
    if (remoteState && (myRole === "a" || myRole === "b")) {
      const myAnswers = getAnswersFor(currentPerson, state) || {};
      wsSend({
        type: "update",
        patch: { answers: { ...myAnswers }, submitted: true },
      });
    }
    render();

    const other = currentPerson === "a" ? "b" : "a";
    const otherSubmitted = isSubmitted(other, state);
    const curName = displayName(currentPerson, state);
    const otherName = displayName(other, state);
    if (!otherSubmitted) {
      alert(`已提交 ${curName} 的答案。现在切换到 ${otherName} 继续作答。`);
      setPerson(other);
      setIndex(0);
    } else {
      alert("两个人都已提交，可以查看结果了。");
      const resultCardTop = el.resultCard.getBoundingClientRect().top + window.scrollY - 12;
      window.scrollTo({ top: Math.max(0, resultCardTop), behavior: "smooth" });
    }
  });

  el.btnReset.addEventListener("click", () => {
    const ok = confirm("确定要重置吗？这会清空 A/B 的所有作答与提交状态。");
    if (!ok) return;
    if (remoteState && ws && ws.readyState === WebSocket.OPEN && room) {
      wsSend({ type: "reset" });
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    currentPerson = "a";
    currentIndex = 0;
    render();
  });

  // Init
  el.progressText.textContent = `0 / ${questions.length}`;
  const cfg = loadSyncCfg();
  if (el.syncUrl) el.syncUrl.value = cfg.url || "";
  if (el.roomCode) el.roomCode.value = cfg.room || "";
  setConnBadge(false, "离线");
  setRoleBadge(null);

  if (el.btnCreateRoom) {
    el.btnCreateRoom.addEventListener("click", () => {
      const code = makeRoomCode();
      if (el.roomCode) el.roomCode.value = code;
      saveSyncCfg({ url: toWsUrl(el.syncUrl?.value || cfg.url || ""), room: code });
    });
  }
  if (el.btnJoinRoom) el.btnJoinRoom.addEventListener("click", connectAndJoin);

  document.body.addEventListener("click", (e) => {
    if (e.target.closest("#btnViewAllAnimals")) {
      e.preventDefault();
      openAnimalModal();
    }
  });
  if (el.animalModalClose) el.animalModalClose.addEventListener("click", closeAnimalModal);
  if (el.animalModalBackdrop) el.animalModalBackdrop.addEventListener("click", closeAnimalModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && el.animalModal?.classList.contains("modal--open")) closeAnimalModal();
  });

  render();
})();

