(() => {
  const STORAGE_KEY = "couple-quiz:v1";
  const SYNC_CFG_KEY = "couple-quiz:sync:v1";

  /** @typedef {{ a?: Record<string,string>, b?: Record<string,string>, submittedA?: boolean, submittedB?: boolean }} State */

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
    btnDownloadA: qs("#btnDownloadA"),
    btnDownloadB: qs("#btnDownloadB"),
  };

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
      if (!raw) return { a: {}, b: {}, submittedA: false, submittedB: false };
      const parsed = JSON.parse(raw);
      return {
        a: parsed?.a && typeof parsed.a === "object" ? parsed.a : {},
        b: parsed?.b && typeof parsed.b === "object" ? parsed.b : {},
        submittedA: Boolean(parsed?.submittedA),
        submittedB: Boolean(parsed?.submittedB),
      };
    } catch {
      return { a: {}, b: {}, submittedA: false, submittedB: false };
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
    return remoteState || loadState();
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

      if (msg.type === "joined") {
        myRole = msg.role || null;
        setRoleBadge(myRole);
        remoteState = msg.state || null;
        if (myRole === "a" || myRole === "b") setPerson(myRole);
        render();
        return;
      }

      if (msg.type === "state") {
        remoteState = msg.state || null;
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

    // Throttle a bit to avoid spamming.
    const t = Date.now();
    if (t - lastSentAt < 80) return;
    lastSentAt = t;
    wsSend({ type: "update", patch });
  }

  function getAnswersFor(person, state) {
    return person === "a" ? state.a : state.b;
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
    return questions.every((q) => Boolean(answers?.[q.id]));
  }

  function renderStatus(state) {
    const aOk = Boolean(state.submittedA);
    const bOk = Boolean(state.submittedB);

    el.statusA.textContent = aOk ? "[x] 已提交" : "[ ] 未提交";
    el.statusB.textContent = bOk ? "[x] 已提交" : "[ ] 未提交";
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

    const optionsHtml = q.options
      .map((opt) => {
        const checked = opt.id === selected ? "checked" : "";
        const inputId = `${currentPerson}-${q.id}-${opt.id}`;
        return `
          <label class="option" for="${inputId}">
            <input type="radio" name="${currentPerson}-${q.id}" id="${inputId}" value="${opt.id}" ${checked} />
            <div class="option__label">${escapeHtml(opt.label)}</div>
          </label>
        `;
      })
      .join("");

    el.questionHost.innerHTML = `
      <div class="question__title">${escapeHtml(q.title)}</div>
      ${q.desc ? `<div class="question__desc">${escapeHtml(q.desc)}</div>` : ""}
      <div class="options">${optionsHtml}</div>
    `;

    el.questionHost.querySelectorAll('input[type="radio"]').forEach((input) => {
      input.addEventListener("change", (e) => {
        const value = e.target?.value;
        if (!value) return;
        const s = activeState();
        const a = getAnswersFor(currentPerson, s);
        a[q.id] = value;
        if (!remoteState) saveState(s);
        else if (myRole === currentPerson) {
          maybeSyncPatch({ answers: { [q.id]: value } });
        }
        render();
      });
    });

    el.btnPrev.disabled = currentIndex === 0;
    el.btnNext.disabled = currentIndex === questions.length - 1;
    el.qIndexText.textContent = `${currentIndex + 1} / ${questions.length}`;

    const s2 = loadState();
    const submitEnabled = canSubmit(currentPerson, s2);
    el.btnSubmit.disabled = !submitEnabled;
    el.btnSubmit.textContent = `提交 ${currentPerson.toUpperCase()} 的答案`;

    const submitted = isSubmitted(currentPerson, s2);
    el.submitHint.textContent = submitted
      ? "已提交。若你修改了答案，再次提交会覆盖之前的提交。"
      : submitEnabled
        ? "全部题已作答，可以提交。提交后仍可修改：重新提交会覆盖。"
        : "请先把所有题都选完，本人才可以提交。";
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

    el.matchList.innerHTML =
      matches.length === 0
        ? `<div class="hint">暂时没有完全一致的题（也没关系，可以看看不一致的点）。</div>`
        : matches.map((x) => renderItem(x.question, x.a, x.b, true)).join("");

    el.diffList.innerHTML =
      diffs.length === 0
        ? `<div class="hint">全部一致。你们很同步。</div>`
        : diffs.map((x) => renderItem(x.question, x.a, x.b, false)).join("");
  }

  function renderCharacters(state) {
    if (!el.charHostA || !el.charHostB) return;
    const a = state.a || {};
    const b = state.b || {};

    const aCard = buildCharacterCard("A", a, state);
    const bCard = buildCharacterCard("B", b, state);

    el.charHostA.innerHTML = aCard.svg;
    el.charHostB.innerHTML = bCard.svg;

    if (el.btnDownloadA) el.btnDownloadA.onclick = () => downloadSvg(aCard.svg, `${aCard.fileBase}.svg`);
    if (el.btnDownloadB) el.btnDownloadB.onclick = () => downloadSvg(bCard.svg, `${bCard.fileBase}.svg`);
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

  function buildCharacterCard(label, answers, state) {
    const seed = seedFromAnswers(answers);
    const palette = paletteFromSeed(seed);
    const codename = makeCodename(seed);
    const archetype = pickFrom(seed, [
      "Netrunner",
      "Synth Diplomat",
      "Chrome Analyst",
      "Ghost Operator",
      "Signal Weaver",
      "Neon Architect",
      "Protocol Breaker",
      "Quiet Blade",
    ]);

    const traits = pickTraits(answers, seed);
    const signature = buildSignature(label, answers, state);
    const svg = makeCharacterSvg({ label, codename, archetype, traits, signature, palette, seed });
    return { svg, fileBase: `cyber-role-${label}-${codename.replaceAll(" ", "-")}` };
  }

  function buildSignature(label, answers, state) {
    const otherAnswers = label === "A" ? state.b || {} : state.a || {};
    const byDim = {};

    for (const q of questions) {
      const d = q.dim || "misc";
      if (!byDim[d]) byDim[d] = { total: 0, match: 0 };
      byDim[d].total += 1;
      const av = answers[q.id] ?? "";
      const ov = otherAnswers[q.id] ?? "";
      if (av && ov && av === ov) byDim[d].match += 1;
    }

    const dimName = (id) => dimensions.find((x) => x.id === id)?.name || id;
    const list = Object.entries(byDim).map(([k, v]) => ({
      id: k,
      name: dimName(k),
      rate: v.total ? Math.round((v.match / v.total) * 100) : 0,
    }));
    list.sort((a, b) => a.rate - b.rate);
    const low = list.slice(0, 2).map((x) => x.name).filter(Boolean);
    const high = [...list].sort((a, b) => b.rate - a.rate).slice(0, 1).map((x) => x.name).filter(Boolean);
    return { high: high[0] || "", low };
  }

  function seedFromAnswers(answers) {
    const keys = Object.keys(answers || {}).sort();
    const joined = keys.map((k) => `${k}:${answers[k]}`).join("|");
    return fnv1a(joined || "empty");
  }

  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function pickFrom(seed, arr) {
    if (!arr.length) return "";
    return arr[seed % arr.length];
  }

  function paletteFromSeed(seed) {
    const base = [
      ["#58E6FF", "#B38BFF", "#FF4FD8"],
      ["#7CF7FF", "#46FF9B", "#B38BFF"],
      ["#FF4FD8", "#58E6FF", "#FFD36E"],
      ["#B38BFF", "#58E6FF", "#46FF9B"],
    ];
    const p = base[seed % base.length];
    return { a: p[0], b: p[1], c: p[2] };
  }

  function makeCodename(seed) {
    const left = pickFrom(seed, ["NULL", "ECHO", "VANTA", "MIRROR", "VECTOR", "SABLE", "ION", "SPECTRA", "ORBIT"]);
    const right = (seed % 0xffff).toString(16).toUpperCase().padStart(4, "0");
    return `${left}-${right}`;
  }

  function pickTraits(answers, seed) {
    const map = {
      talk_now: ["低延迟沟通", "快速拆解", "直球"],
      cool_down: ["先冷却再对话", "情绪管理", "延迟决策"],
      text: ["文字表达更强", "结构化输出", "缓冲沟通"],
      avoid: ["回避升级冲突", "先保全关系", "谨慎"],

      words: ["语言表达", "肯定回路", "共鸣"],
      time: ["陪伴驱动", "共同行动", "同频"],
      help: ["行动主义", "解决问题", "可靠"],
      touch: ["触感亲密", "身体语言", "贴近"],
      gift: ["仪式感", "记忆点", "惊喜"],

      must: ["高响应期待", "稳定在线", "可追踪"],
      soon: ["有节奏的连接", "及时接住", "不极端"],
      ok: ["低压连接", "松弛", "自洽"],
      pressure: ["反控制", "抗催促", "边界敏感"],

      plan: ["规划型", "风险控制", "可预期"],
      balance: ["平衡派", "灵活调参", "现实主义"],
      enjoy: ["体验优先", "即时满足", "冒险一点"],
      frugal: ["节制", "长期主义", "安全感优先"],

      full: ["高透明", "信息共享", "安全感靠确认"],
      reasonable: ["合理透明", "关键同步", "边界清晰"],
      private: ["隐私边界", "自我空间", "不被审查"],
      separate: ["强独立", "自洽", "不爱解释"],

      describe: ["事实导向", "清晰叙述", "可验证"],
      reveal: ["情绪可见", "真诚暴露", "高信任"],
      request: ["需要表达", "可协商", "目标明确"],
      protect: ["自我保护", "谨慎暴露", "慢热"],
    };

    const bag = [];
    for (const k of Object.keys(answers || {})) {
      const v = answers[k];
      const t = map[v];
      if (t) bag.push(...t);
    }
    const uniq = [...new Set(bag)];
    if (uniq.length >= 3) {
      const start = seed % uniq.length;
      return [uniq[start], uniq[(start + 1) % uniq.length], uniq[(start + 2) % uniq.length]];
    }
    return [
      pickFrom(seed, ["高敏感", "高稳定", "高自由", "高投入", "低噪声"]),
      pickFrom(seed >>> 3, ["直觉型", "结构型", "体验型", "规划型"]),
      pickFrom(seed >>> 7, ["慢热", "快热", "反脆弱", "高共情"]),
    ];
  }

  function makeCharacterSvg({ label, codename, archetype, traits, signature, palette, seed }) {
    const w = 820;
    const h = 460;
    const gradId = `grad${seed}`;
    const glowId = `glow${seed}`;
    const grainId = `grain${seed}`;
    const clipId = `clip${seed}`;

    const hi = signature?.high ? `优势维度：${signature.high}` : "";
    const lo = signature?.low?.length ? `风险维度：${signature.low.join(" / ")}` : "";

    return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%" role="img" aria-label="角色卡 ${label}">
  <defs>
    <linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${palette.a}" stop-opacity=".14"/>
      <stop offset=".55" stop-color="${palette.b}" stop-opacity=".12"/>
      <stop offset="1" stop-color="${palette.c}" stop-opacity=".10"/>
    </linearGradient>
    <filter id="${glowId}">
      <feGaussianBlur stdDeviation="7" result="b"/>
      <feMerge>
        <feMergeNode in="b"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="${grainId}">
      <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix type="matrix" values="
        1 0 0 0 0
        0 1 0 0 0
        0 0 1 0 0
        0 0 0 .05 0"/>
    </filter>
    <clipPath id="${clipId}">
      <rect x="16" y="16" width="${w - 32}" height="${h - 32}" rx="22"/>
    </clipPath>
  </defs>

  <g clip-path="url(#${clipId})">
    <rect x="16" y="16" width="${w - 32}" height="${h - 32}" rx="22" fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.11)"/>
    <rect x="16" y="16" width="${w - 32}" height="${h - 32}" rx="22" fill="url(#${gradId})"/>
    <rect x="16" y="16" width="${w - 32}" height="${h - 32}" rx="22" filter="url(#${grainId})" opacity=".7"/>

    <path d="M44 92 Q44 44 92 44 L728 44 Q776 44 776 92 L776 368 Q776 416 728 416 L92 416 Q44 416 44 368 Z"
          fill="none" stroke="rgba(255,255,255,.10)"/>
    <path d="M52 100 Q52 52 100 52 L320 52"
          fill="none" stroke="${palette.a}" stroke-opacity=".34" filter="url(#${glowId})"/>
    <path d="M768 334 L768 360 Q768 408 720 408 L640 408"
          fill="none" stroke="${palette.c}" stroke-opacity=".28" filter="url(#${glowId})"/>

    <g filter="url(#${glowId})">
      <path d="M548 330 C520 290, 512 268, 520 236 C534 190, 566 164, 606 160 C646 164, 678 190, 692 236 C700 268, 692 290, 664 330"
            fill="rgba(0,0,0,.26)" stroke="rgba(255,255,255,.10)"/>
      <path d="M586 148 C566 128, 566 103, 586 87 C606 71, 635 72, 651 94 C667 116, 662 140, 642 152"
            fill="rgba(0,0,0,.30)" stroke="rgba(255,255,255,.10)"/>
      <path d="M574 118 L660 110" stroke="${palette.a}" stroke-opacity=".40" stroke-width="3"/>
      <path d="M574 128 L660 120" stroke="${palette.c}" stroke-opacity=".30" stroke-width="2"/>
      <path d="M548 252 C590 238, 634 238, 676 252" stroke="${palette.b}" stroke-opacity=".32" stroke-width="2"/>
      <circle cx="606" cy="246" r="4" fill="${palette.a}" fill-opacity=".50"/>
      <circle cx="626" cy="248" r="3" fill="${palette.c}" fill-opacity=".45"/>
      <circle cx="586" cy="248" r="3" fill="${palette.b}" fill-opacity=".42"/>
    </g>

    <g font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace">
      <text x="56" y="90" fill="rgba(255,255,255,.70)" font-size="12">SUBJECT</text>
      <text x="56" y="120" fill="rgba(255,255,255,.92)" font-size="22" font-weight="800">${escapeXml(codename)}</text>
      <text x="56" y="148" fill="rgba(255,255,255,.70)" font-size="12">ARCHETYPE</text>
      <text x="56" y="170" fill="rgba(255,255,255,.86)" font-size="14" font-weight="700">${escapeXml(archetype)}</text>

      <text x="56" y="214" fill="rgba(255,255,255,.70)" font-size="12">TRAITS</text>
      <text x="56" y="238" fill="rgba(255,255,255,.84)" font-size="13">${escapeXml(traits[0] || "")}</text>
      <text x="56" y="262" fill="rgba(255,255,255,.84)" font-size="13">${escapeXml(traits[1] || "")}</text>
      <text x="56" y="286" fill="rgba(255,255,255,.84)" font-size="13">${escapeXml(traits[2] || "")}</text>

      <text x="56" y="334" fill="rgba(255,255,255,.70)" font-size="12">COUPLE-SYNC</text>
      <text x="56" y="358" fill="rgba(255,255,255,.80)" font-size="12">${escapeXml(hi)}</text>
      <text x="56" y="380" fill="rgba(255,255,255,.66)" font-size="12">${escapeXml(lo)}</text>
    </g>

    <g font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace">
      <text x="${w - 56}" y="${h - 44}" text-anchor="end" fill="rgba(255,255,255,.52)" font-size="11">ID ${seed.toString(16).toUpperCase().padStart(8, "0")}</text>
      <text x="${w - 56}" y="${h - 24}" text-anchor="end" fill="rgba(255,255,255,.72)" font-size="11">${escapeXml(`ROLE ${label}`)}</text>
    </g>
  </g>
</svg>
    `.trim();
  }

  function escapeXml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function downloadSvg(svgString, filename) {
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function renderItem(question, a, b, ok) {
    const aLabel = a ? optionLabel(question, a) : "（A 未作答）";
    const bLabel = b ? optionLabel(question, b) : "（B 未作答）";
    return `
      <div class="item">
        <div class="item__q">${escapeHtml(question.title)}</div>
        <div class="item__a">
          <span class="tag ${ok ? "tag--ok" : "tag--diff"}">A：${escapeHtml(aLabel)}</span>
          <span class="tag ${ok ? "tag--ok" : "tag--diff"}">B：${escapeHtml(bLabel)}</span>
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
    renderStatus(state);
    renderProgress(state);
    renderQuestion(state);
    renderResults(state);
  }

  // Events
  el.btnPersonA.addEventListener("click", () => setPerson("a"));
  el.btnPersonB.addEventListener("click", () => setPerson("b"));

  el.btnPrev.addEventListener("click", () => setIndex(currentIndex - 1));
  el.btnNext.addEventListener("click", () => setIndex(currentIndex + 1));

  el.btnSubmit.addEventListener("click", () => {
    const state = activeState();
    if (!canSubmit(currentPerson, state)) {
      alert("请先把所有题都选完，再提交。");
      return;
    }
    setSubmitted(currentPerson, state, true);
    if (!remoteState) saveState(state);
    else {
      maybeSyncPatch({ submitted: true });
    }
    render();

    const other = currentPerson === "a" ? "b" : "a";
    const otherSubmitted = isSubmitted(other, state);
    if (!otherSubmitted) {
      alert(`已提交 ${currentPerson.toUpperCase()} 的答案。现在切换到 ${other.toUpperCase()} 继续作答。`);
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
  render();
})();

