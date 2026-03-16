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
    eggWrap: qs("#eggWrap"),
    eggCanvas: qs("#eggCanvas"),
  };
  let currentReportUrl = null;
  let eggAnimationId = null;
  /** 已为该结果展示过彩蛋则不再重复（同一次「一起看答案」只播一次）；重置后清空。 */
  let lastEggResultKey = null;

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

  /** 彩蛋：一致率 100% 放烟花，0% 爆炸。*/
  function runEggEffect(kind) {
    const wrap = el.eggWrap;
    const canvas = el.eggCanvas;
    if (!wrap || !canvas) return;
    if (eggAnimationId) cancelAnimationFrame(eggAnimationId);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0;
    function resize() {
      w = canvas.offsetWidth || window.innerWidth;
      h = canvas.offsetHeight || window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
    }
    resize();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const colors = ["#ff6b6b", "#ffd93d", "#6bcb77", "#4d96ff", "#c44dff", "#ff9f43"];
    const now = () => Date.now();

    if (kind === "fireworks") {
      const rockets = [];
      const particles = [];
      let lastRocket = 0;
      const start = now();
      const DURATION = 4200;

      function addRocket() {
        rockets.push({
          x: Math.random() * w * 0.6 + w * 0.2,
          y: h + 20,
          vx: (Math.random() - 0.5) * 2,
          vy: -12 - Math.random() * 6,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }

      function burst(x, y, color) {
        const n = 28 + Math.floor(Math.random() * 12);
        for (let i = 0; i < n; i++) {
          const a = (Math.PI * 2 * i) / n + Math.random();
          const v = 4 + Math.random() * 6;
          particles.push({
            x, y, color,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v - 2,
            life: 1,
            decay: 0.018 + Math.random() * 0.01,
          });
        }
      }

      function tick() {
        const t = now() - start;
        if (t > DURATION) {
          wrap.classList.remove("egg-wrap--on");
          wrap.setAttribute("aria-hidden", "true");
          return;
        }
        if (t - lastRocket > 380 && t < 3200) {
          lastRocket = t;
          addRocket();
        }
        ctx.fillStyle = "rgba(0,0,0,0.08)";
        ctx.fillRect(0, 0, w, h);

        for (let i = rockets.length - 1; i >= 0; i--) {
          const r = rockets[i];
          r.x += r.vx;
          r.y += r.vy;
          r.vy += 0.22;
          ctx.fillStyle = r.color;
          ctx.beginPath();
          ctx.arc(r.x, r.y, 2, 0, Math.PI * 2);
          ctx.fill();
          if (r.vy > 0) {
            burst(r.x, r.y, r.color);
            rockets.splice(i, 1);
          }
        }

        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.08;
          p.life -= p.decay;
          if (p.life <= 0) { particles.splice(i, 1); continue; }
          ctx.globalAlpha = p.life;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }

        eggAnimationId = requestAnimationFrame(tick);
      }
      wrap.classList.add("egg-wrap--on");
      wrap.setAttribute("aria-hidden", "false");
      addRocket();
      tick();
    } else if (kind === "explosion") {
      const particles = [];
      const start = now();
      const DURATION = 2600;
      const cx = w / 2;
      const cy = h / 2;
      const n = 80 + Math.floor(Math.random() * 40);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 6 + Math.random() * 14;
        particles.push({
          x: cx,
          y: cy,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          life: 1,
          decay: 0.025 + Math.random() * 0.02,
          color: i < n / 2 ? "#ff6b6b" : colors[Math.floor(Math.random() * colors.length)],
          size: 1.5 + Math.random() * 2,
        });
      }
      let flash = 1;

      function tick() {
        const t = now() - start;
        if (t > DURATION) {
          wrap.classList.remove("egg-wrap--on");
          wrap.setAttribute("aria-hidden", "true");
          return;
        }
        ctx.fillStyle = "rgba(0,0,0,0.12)";
        ctx.fillRect(0, 0, w, h);
        if (flash > 0) {
          ctx.globalAlpha = flash;
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, w, h);
          ctx.globalAlpha = 1;
          flash -= 0.15;
        }
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.98;
          p.vy *= 0.98;
          p.life -= p.decay;
          if (p.life <= 0) { particles.splice(i, 1); continue; }
          ctx.globalAlpha = p.life;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        eggAnimationId = requestAnimationFrame(tick);
      }
      wrap.classList.add("egg-wrap--on");
      wrap.setAttribute("aria-hidden", "false");
      tick();
    }
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

    if (total > 0 && (rate === 100 || rate === 0)) {
      const eggKey = `${rate}-${matches.length}`;
      if (eggKey !== lastEggResultKey) {
        lastEggResultKey = eggKey;
        runEggEffect(rate === 100 ? "fireworks" : "explosion");
      }
    }

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
    let animalA = buildAnimalCard(state.a || {});
    let animalB = buildAnimalCard(state.b || {});
    const resolved = ensureDifferentAnimalsIfLowSimilarity(animalA, animalB, rate);
    animalA = resolved.animalA;
    animalB = resolved.animalB;
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

    const { matches } = computeMatches(state);
    const total = questions.length;
    const matchRate = total === 0 ? 0 : Math.round((matches.length / total) * 100);
    let animalA = buildAnimalCard(a);
    let animalB = buildAnimalCard(b);
    const resolved = ensureDifferentAnimalsIfLowSimilarity(animalA, animalB, matchRate);
    animalA = resolved.animalA;
    animalB = resolved.animalB;

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
    { emoji: "🦩", name: "火烈鸟", desc: "注重仪式与美感，需要被看见。" },
    { emoji: "🐿️", name: "松鼠", desc: "爱囤积安全感，习惯提前准备。" },
    { emoji: "🦝", name: "浣熊", desc: "好奇灵活，喜欢探索与尝试。" },
    { emoji: "🐴", name: "马", desc: "向往自由与奔跑，需要空间与信任。" },
    { emoji: "🦈", name: "鲨鱼", desc: "目标感强，直来直去，不喜拖沓。" },
    { emoji: "🐑", name: "羊", desc: "温和合群，重视归属与陪伴。" },
    { emoji: "🦂", name: "蝎子", desc: "外冷内热，重视忠诚与深度联结。" },
    { emoji: "🐸", name: "青蛙", desc: "适应力强，能随环境调整节奏。" },
    { emoji: "🦀", name: "螃蟹", desc: "外壳坚硬、内心柔软，需要时间打开。" },
    { emoji: "🐢", name: "龟", desc: "慢热长情，重视稳定与持久。" },
    { emoji: "🦫", name: "河狸", desc: "务实建设型，喜欢一起完成目标。" },
    { emoji: "🐤", name: "雏鸟", desc: "依赖与独立并存，正在成长。" },
    { emoji: "🦥", name: "树懒", desc: "节奏慢，享受当下，不喜催促。" },
    { emoji: "🐲", name: "龙", desc: "有主见、有魄力，需要被尊重。" },
    { emoji: "🦄", name: "独角兽", desc: "独特自我，相信特别与唯一。" },
    { emoji: "🐙", name: "章鱼", desc: "多线并行，灵活应变，需要理解。" },
    { emoji: "🦜", name: "鹦鹉", desc: "爱表达、重互动，喜欢被回应。" },
    { emoji: "🐍", name: "蛇", desc: "敏锐直觉，边界清晰，不喜越界。" },
  ];

  /** 维度顺序，用于 tie-break 与次维度选择 */
  const DIM_ORDER = ["signal", "boundary", "conflict", "money", "future", "intimacy", "life", "sync"];

  /**
   * 主维度 → 动物索引（0–29）。动物与维度语义一致，由作答的「维度强度」决定：
   * - 每题选项有序号，同一维度下序号相加 = 该维度强度；
   * - 强度最高的维度 = 主维度，次高 = 次维度；
   * - 主维度确定动物池，次维度在池内取模选出一只。
   */
  const PRIMARY_DIM_TO_ANIMALS = {
    signal: [3, 7, 27, 28],       // 沟通信号 → 海豚/猫头鹰/章鱼/鹦鹉（表达、共情、理性、互动）
    boundary: [0, 5, 15, 20, 29], // 边界与自由 → 狐狸/狼/马/螃蟹/蛇（边界感、领地、空间、外壳、不越界）
    conflict: [4, 7, 18, 25],     // 冲突修复 → 鹿/猫头鹰/蝎子/龙（温和、理性、深度联结、被尊重）
    money: [8, 10, 13, 22],       // 金钱与风险 → 熊/象/松鼠/河狸（踏实、公平、囤积安全感、务实建设）
    future: [2, 11, 16, 23, 26],  // 未来与承诺 → 鹰/企鹅/鲨鱼/雏鸟/独角兽（目标、共同目标、直进、成长、唯一）
    intimacy: [6, 9, 12, 17, 1],  // 亲密与表达 → 兔子/蝴蝶/火烈鸟/羊/猫（被倾听、仪式、被看见、归属、安全尊重）
    life: [1, 14, 19, 21, 24],    // 生活节奏 → 猫/浣熊/青蛙/龟/树懒（独立黏人、灵活、适应、慢热持久、享受当下）
    sync: [1, 9, 14, 17, 24],     // 默契问答 → 猫/蝴蝶/浣熊/羊/树懒（偏好、小确幸、生活默契）
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
   * 由作答组合得到动物：先算各维度强度 → 主维度 + 次维度 → 查表得到唯一动物。返回带 index 便于「相似度<90% 则两人不同动物」规则。
   */
  function buildAnimalCard(answers) {
    const scores = computeDimensionScoresForAnimal(answers || {});
    const [primary, secondary] = getDominantDimensionIds(scores);
    const list = PRIMARY_DIM_TO_ANIMALS[primary];
    if (!list || list.length === 0) {
      const fallback = ANIMALS[0];
      return { emoji: fallback.emoji, name: fallback.name, desc: fallback.desc, index: 0 };
    }
    const secondaryRank = DIM_ORDER.indexOf(secondary);
    const idx = list[secondaryRank % list.length];
    const animal = ANIMALS[idx];
    return { emoji: animal.emoji, name: animal.name, desc: animal.desc, index: idx };
  }

  /** 相似度（一致题数/总题数）< 90% 时两人不能是同一种动物，将 B 换为不同动物。 */
  function ensureDifferentAnimalsIfLowSimilarity(animalA, animalB, matchRate) {
    if (matchRate >= 90) return { animalA, animalB };
    if (animalA.index !== animalB.index) return { animalA, animalB };
    const n = ANIMALS.length;
    let newIdx = (animalB.index + 1) % n;
    while (newIdx === animalA.index && n > 1) newIdx = (newIdx + 1) % n;
    const b = ANIMALS[newIdx];
    const animalBNew = { emoji: b.emoji, name: b.name, desc: b.desc, index: newIdx };
    return { animalA, animalB: animalBNew };
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

  /** 按整体一致率分段，返回较长的结果分析文案（有意义、分情况）。*/
  function getOverallAnalysis(matchRate, total, matchCount) {
    const r = matchRate;
    if (total === 0) {
      return { title: "整体结果", body: "暂无作答数据，完成答题并提交后可查看分析。" };
    }
    if (r === 100) {
      return {
        title: "整体结果：全部一致",
        body:
          `你们在全部 ${total} 道题上的选择完全一致（${matchCount}/${total}）。\n\n` +
          `这说明在测试所覆盖的维度里，你们的偏好和习惯高度重合，沟通与边界上的默认设置也很接近。这种“天然同步”可以成为关系的稳定器，但也要留意：完全一致有时会让人忽略对方其实也有不同需求，只是还没表现出来。建议偶尔主动问一句“这件事你真的 OK 吗？”给彼此留一点表达差异的空间。\n\n` +
          `可以把这份结果当作“我们的共同点地图”，在以后遇到分歧时提醒彼此：我们在大方向上是一致的，眼前的分歧更需要一起找办法，而不是归因于“性格不合”。`,
      };
    }
    if (r >= 80) {
      return {
        title: "整体结果：高度一致",
        body:
          `你们有 ${matchCount}/${total} 题一致，整体一致率 ${r}%。\n\n` +
          `在多数维度上你们的取向比较接近，只有少数题目存在差异。这些差异往往集中在某几个方面（例如沟通方式、对隐私的期待、对未来的节奏感等），而不是全面对立。建议把不一致的题目当作“需要对齐的少数规则”，而不是“合不来的证据”。\n\n` +
          `可以优先选一两道不一致的题，坐下来各说两句话：我为什么选这个？我希望你怎样配合？多数情况下，把隐性的期待说清楚，就能明显减少日后的摩擦。`,
      };
    }
    if (r >= 60) {
      return {
        title: "整体结果：较一致",
        body:
          `你们有 ${matchCount}/${total} 题一致，整体一致率 ${r}%。\n\n` +
          `大约六成以上的选择相同，说明你们在不少重要维度上有共识，同时也有清晰可见的差异点。这种组合很常见：既有“我们很像”的安心感，也有“这里我们不一样”的成长空间。关键不是消除差异，而是为差异定规则——比如在哪些事上必须达成一致，在哪些事上可以各做各的。\n\n` +
          `建议先看维度分析里“一致率偏低”的那几块，挑出其中最容易引发实际冲突的（例如金钱、边界、冲突后的修复方式），先定 2～3 条可执行的小约定，再慢慢扩展到其他维度。`,
      };
    }
    if (r >= 40) {
      return {
        title: "整体结果：部分一致",
        body:
          `你们有 ${matchCount}/${total} 题一致，整体一致率 ${r}%。\n\n` +
          `大约一半左右的选择相同，说明你们在一些方面很合拍，在另一些方面则明显不同。这种程度的分歧不需要上升到“合不合适”，但值得认真对待：差异多且未对齐时，容易在生活里反复踩到同一种雷。建议把结果页里“不一致的题”当作待办清单，不必一次聊完，可以每次约会或每周留 15 分钟，专门聊 2～3 道题。\n\n` +
          `重点不是说服对方改选，而是搞清：我选这个背后的需求是什么？你选那个背后的担心是什么？找到需求与担心之后，再一起想“我们能不能约定一个两人都能接受的折中”。`,
      };
    }
    if (r >= 20) {
      return {
        title: "整体结果：差异较多",
        body:
          `你们有 ${matchCount}/${total} 题一致，整体一致率 ${r}%。\n\n` +
          `多数题目上的选择不同，说明你们在生活习惯、沟通方式、边界和未来期待等方面有较多差异。这不一定代表不合适，但意味着若要长期相处，需要更多主动沟通和规则约定，否则很容易因为“默认设置不同”而反复争吵。建议不要一次解决所有题，先选 3～5 道“最容易引发实际冲突”的题（例如回复节奏、金钱、见家长节奏、吵架后怎么和好），逐题聊清：我为什么选这个？你希望我怎么做？\n\n` +
          `可以约定一个固定时间（如每周一次）“对齐会”，只聊这些不一致的点，避免在情绪上来时翻旧账。`,
      };
    }
    if (r >= 1) {
      return {
        title: "整体结果：差异较大",
        body:
          `你们只有 ${matchCount}/${total} 题一致，整体一致率 ${r}%。\n\n` +
          `在测试覆盖的维度里，你们的重合度较低，很多题目的选择都不同。这可能源于成长环境、性格或过往经历的不同，本身不代表不能在一起，但意味着日常相处中“默认一致”的部分会少，更多需要靠说清楚、定规则来避免误会和积怨。建议把这份结果当作“差异地图”：先接受“我们就是有很多地方不一样”，再从中挑出最影响感情和生活的几项（通常是沟通信号、边界、冲突修复、金钱），逐一做“需求—规则”的对齐。\n\n` +
          `若双方都愿意为差异定规则而不是硬改对方，这种组合也可以走得稳；若一方长期觉得“你应该和我一样”，关系会更容易累。`,
      };
    }
    return {
      title: "整体结果：全部不一致",
      body:
        `你们在 ${total} 道题上的选择没有一题完全一致（0/${total}）。\n\n` +
        `这说明在测试所覆盖的维度里，你们的偏好和习惯几乎都不重合。这种情况较少见，但不必然代表“不合适”——有时恰恰是互补型关系。关键取决于两点：一是双方是否愿意把差异摊开来说、并约定可执行的规则，而不是指望对方自动变成自己；二是是否能把“不一致”当作需要一起解决的问题，而不是“你不爱/你不懂我”的证据。\n\n` +
        `建议从维度分析里选 1～2 个你们最在意的维度（如沟通、边界、冲突），先就那几道题做一次深度聊：我选这个是因为___，我希望你___。先不求一致，只求听懂对方，再谈能不能有一个两人都能接受的中间方案。`,
    };
  }

  function renderAdvice(state) {
    if (!el.adviceHost) return;
    const stats = computeDimensionStats(state);
    const { matches, diffs } = computeMatches(state);
    const total = questions.length;
    const matchRate = total === 0 ? 0 : Math.round((matches.length / total) * 100);
    const matchCount = matches.length;

    const lowest = [...stats].sort((a, b) => a.rate - b.rate).slice(0, 2);
    const highest = [...stats].sort((a, b) => b.rate - a.rate).slice(0, 1);

    const tips = [];

    tips.push(getOverallAnalysis(matchRate, total, matchCount));

    if (highest[0] && highest[0].rate >= 50) {
      tips.push({
        title: `你们的强项：${highest[0].name}`,
        body:
          `在「${highest[0].name}」这个维度上，你们的一致率是 ${highest[0].rate}%（${highest[0].matched}/${highest[0].total} 题一致），属于相对更合拍的一块。建议把这里当作“安全基地”：当其他维度起冲突或情绪上来时，可以先回到你们在这块已经形成的默契，再谈有分歧的部分，避免全面否定关系。`,
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
    const rate = dimStat.rate;
    const relatedDiffs = diffs.filter((x) => (x.question?.dim || "misc") === dimId);
    const count = relatedDiffs.length;
    const isZero = rate === 0;
    const rateNote = isZero
      ? "本题型下你们目前没有一题选择一致，差异最大，最值得先聊。"
      : `本维度一致率 ${rate}%（${dimStat.matched}/${dimStat.total} 题一致），以下建议供你们对齐差异时参考。`;

    const base = {
      signal: {
        title: `需要对齐：${name}（${rate}%）`,
        body:
          rateNote + "\n\n" +
          `沟通信号不一致，往往是一方在“暗示”、一方在“等直说”，或对回复速度、是否要说“没事”期待不同。建议先做一次“信号表”对齐：我表达关心/需要的方式是___，我希望你回应我的方式是___；忙的时候我会___，希望你___。再约定 2 条可执行规则：① 忙时至少回一句“我在忙，X 点回”；② 有情绪时用“我需要…”开头，对方用“我听到了”接住。\n\n` +
          (count ? `本维度不一致题数：${count}，优先把这些题逐题聊一遍会明显改善。` : ""),
      },
      boundary: {
        title: `需要对齐：${name}（${rate}%）`,
        body:
          rateNote + "\n\n" +
          `边界差异通常来自安全感来源不同：有人靠“透明、事事可知”安心，有人靠“有自己空间、不被审查”安心。建议把“隐私”拆成两块谈：① 不被审查（手机、社交账号、行踪）——各自能接受的最低线是什么？② 不被隐瞒（大事、和谁在一起）——哪些事必须提前说？再写下 3 条边界：可以做 / 不可以做 / 做之前要先说，写完后交换看，只改自己能接受的。\n\n` +
          (count ? `本维度不一致题数：${count}。` : ""),
      },
      conflict: {
        title: `需要对齐：${name}（${rate}%）`,
        body:
          rateNote + "\n\n" +
          `冲突本身不致命，致命的是修复方式不对：一个想立刻谈清楚，一个想先冷静，就容易二次受伤。建议约定一个“冷静窗口”规则：需要冷静的人说“我需要 X 分钟，X 分钟后我会回来”，到点必须回来继续；不要用沉默惩罚对方。每次吵完做一次简短复盘：触发点是什么？我真正怕的是什么？下次我们可以怎么做（一句可执行的动作）？\n\n` +
          (count ? `本维度不一致题数：${count}。` : ""),
      },
      money: {
        title: `需要对齐：${name}（${rate}%）`,
        body:
          rateNote + "\n\n" +
          `金钱分歧常被误读成“性格不合”，本质多是风险偏好和安全感不同。建议先定一个“讨论阈值”：单笔或单月超过多少就必须提前跟对方说（例如 500/1000/3000，按你们收入定）。再把钱分成三格谈：共同账（房租、日常固定开销）、自由账（各自可随意支配的额度）、未来账（储蓄或共同目标），三块比例和用途达成一致即可，不必完全混在一起。\n\n` +
          (count ? `本维度不一致题数：${count}。` : ""),
      },
      future: {
        title: `需要对齐：${name}（${rate}%）`,
        body:
          rateNote + "\n\n" +
          `对未来的期待不同，容易让一方觉得“没保障”，另一方觉得“被逼婚/被控制”。建议用“方向 + 复审时间”代替死时间表：我们大方向是___（同居/结婚/见家长等），在___月再一起复审一次进度，不逼对方立刻承诺。再聊清楚“承诺”对你来说更像什么：是身份（名分）、行动（做到了就算）、还是时间（再相处一段时间再说）？\n\n` +
          (count ? `本维度不一致题数：${count}。` : ""),
      },
      intimacy: {
        title: `需要对齐：${name}（${rate}%）`,
        body:
          rateNote + "\n\n" +
          `亲密感差异多半是“表达渠道”和“接收渠道”错位：你在用行动表达，对方在等言语；你在要陪伴，对方在给空间。建议互相指定一个“最能收到爱”的可量化动作（例如每周一次约会、每天一个拥抱、睡前 10 分钟聊天），写下来执行。公开/秀恩爱的程度不同也没关系，可以约定“对内稳定、对外自选”——两人之间怎么表达由你们定，发不发朋友圈各自决定。\n\n` +
          (count ? `本维度不一致题数：${count}。` : ""),
      },
      life: {
        title: `需要对齐：${name}（${rate}%）`,
        body:
          rateNote + "\n\n" +
          `生活节奏不一致会在小事上消耗：一个喜欢规律可预期，一个喜欢随性即兴；一个周末想宅，一个想出门。建议用“双轨日历”：固定轨（必须一起或必须提前说的）+ 随性轨（可临时变、可单独行动）。每周留 15 分钟“同步会”：下周各自最忙的是哪天？需要对方怎么配合？家务/琐事谁有空谁做，还是分工，先达成一个两人都能接受的规则。\n\n` +
          (count ? `本维度不一致题数：${count}。` : ""),
      },
      sync: {
        title: `生活默契：${name}（${rate}%）`,
        body:
          (isZero
            ? "本题型下你们在一天喜好、下雨天、周末早晨、喝什么、睡前等生活偏好上目前没有一题一致，说明日常小习惯差异较大。"
            : `本维度一致率 ${rate}%，反映你们在生活小偏好上的重合度。`) + "\n\n" +
          `默契题不一致很正常，不必强行“对齐”，更适合当轻松话题：一起聊聊为什么选这个，说不定能发现对方的小习惯，以后点菜、选电影时更顺手。本维度不一致题数：${count}（可当闲聊素材）。`,
      },
    };

    const fallback = {
      title: `需要对齐：${name}（${rate}%）`,
      body:
        (isZero ? "本题型下你们目前没有一题选择一致。" : `本维度一致率 ${rate}%。`) +
        `建议把本维度“不一致的题”逐题聊一遍：每题各说两句话——我为什么选这个？我希望对方怎么做？先听懂再谈能不能折中。` +
        (count ? ` 不一致题数：${count}。` : ""),
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

  function doSubmit() {
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
  }
  el.btnSubmit.addEventListener("click", doSubmit);

  el.btnReset.addEventListener("click", () => {
    const ok = confirm("确定要重置吗？这会清空 A/B 的所有作答与提交状态。");
    if (!ok) return;
    lastEggResultKey = null;
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

  function handleOpenAllAnimals(e) {
    e.preventDefault();
    e.stopPropagation();
    openAnimalModal();
  }
  document.body.addEventListener("click", (e) => {
    if (e.target.closest("#btnViewAllAnimals")) handleOpenAllAnimals(e);
  });
  document.body.addEventListener("touchend", (e) => {
    if (e.target.closest("#btnViewAllAnimals")) {
      handleOpenAllAnimals(e);
      if (e.cancelable) e.preventDefault();
    }
  }, { passive: false });
  if (el.animalModalClose) {
    el.animalModalClose.addEventListener("click", closeAnimalModal);
    el.animalModalClose.addEventListener("touchend", (e) => { e.preventDefault(); closeAnimalModal(); }, { passive: false });
  }
  if (el.animalModalBackdrop) {
    el.animalModalBackdrop.addEventListener("click", closeAnimalModal);
    el.animalModalBackdrop.addEventListener("touchend", (e) => { if (e.cancelable) e.preventDefault(); closeAnimalModal(); }, { passive: false });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && el.animalModal?.classList.contains("modal--open")) closeAnimalModal();
  });

  render();
})();

