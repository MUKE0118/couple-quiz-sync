// 题库可直接编辑：title/desc/options/维度。
// 匹配规则：同一题选项 id 完全一致才算“一致”。

window.DIMENSIONS = [
  { id: "signal", name: "沟通信号" },
  { id: "boundary", name: "边界与自由" },
  { id: "conflict", name: "冲突修复" },
  { id: "money", name: "金钱与风险" },
  { id: "future", name: "未来与承诺" },
  { id: "intimacy", name: "亲密与表达" },
  { id: "life", name: "生活节奏" },
];

window.QUESTIONS = [
  {
    id: "q1",
    dim: "life",
    title: "你更愿意把“电量”花在？",
    desc: "选一个最接近你真实偏好的。",
    options: [
      { id: "quiet", label: "安静续航：宅着、慢慢恢复能量" },
      { id: "date", label: "双人副本：约会、吃喝、电影、散步" },
      { id: "wander", label: "城市漫游：探店/看展/临时起意" },
      { id: "social", label: "社交充电：朋友局/聚会/热闹" },
    ],
  },
  {
    id: "q2",
    dim: "signal",
    title: "当你说“没事”，更接近哪一种“没事”？",
    options: [
      { id: "really_ok", label: "真的没事：情绪已过" },
      { id: "need_ask", label: "想被问：希望对方多追问一点" },
      { id: "need_time", label: "需要时间：现在不想解释" },
      { id: "test", label: "在试探：想看对方在不在乎" },
    ],
  },
  {
    id: "q1b",
    dim: "signal",
    title: "当你说话时，你更像在？",
    desc: "这是关于表达的“形状”，不是对错。",
    options: [
      { id: "describe", label: "描述事实：把发生的事说清楚" },
      { id: "reveal", label: "暴露感受：把心里那层说出来" },
      { id: "request", label: "提出需要：告诉对方你要什么" },
      { id: "protect", label: "自我保护：尽量不让自己显得脆弱" },
    ],
  },
  {
    id: "q3",
    dim: "conflict",
    title: "冲突像警报响起时，你更习惯的处理方式是？",
    options: [
      { id: "talk_now", label: "立刻拆弹：当下聊清楚" },
      { id: "cool_down", label: "先断电：冷静后再沟通" },
      { id: "text", label: "切到文字：用消息更能表达" },
      { id: "avoid", label: "先躲开：不想把话说重" },
    ],
  },
  {
    id: "q4",
    dim: "intimacy",
    title: "你更容易把“被爱”识别为？",
    desc: "同一句“我爱你”，每个人的接收器不一样。",
    options: [
      { id: "words", label: "言语肯定：夸、说爱、表达欣赏" },
      { id: "time", label: "陪伴：一起做事、一起度过时间" },
      { id: "help", label: "行动：分担、帮忙、把事做了" },
      { id: "touch", label: "触碰：拥抱、牵手、贴近" },
      { id: "gift", label: "仪式：礼物/惊喜/被记得" },
    ],
  },
  {
    id: "q5",
    dim: "boundary",
    title: "你心里舒适的“各自空间”，更像？",
    options: [
      { id: "high", label: "高黏度：大多数时间想在一起" },
      { id: "mid_high", label: "亲密但不缠：每天联系、常见面" },
      { id: "mid", label: "稳定连接：各忙各的，也要保持联系" },
      { id: "low", label: "需要自由：不必天天聊/天天见" },
    ],
  },
  {
    id: "q6",
    dim: "signal",
    title: "你对“消息回复”更像哪条规则？",
    options: [
      { id: "must", label: "默认尽快：忙也说明一下" },
      { id: "soon", label: "不必秒回，但希望当天能接住" },
      { id: "ok", label: "节奏随缘：看到再回也行" },
      { id: "pressure", label: "讨厌压力：越催越想消失" },
    ],
  },
  {
    id: "q7",
    dim: "money",
    title: "你对金钱更像哪种“操作系统”？",
    options: [
      { id: "plan", label: "规划型：预算/储蓄优先" },
      { id: "balance", label: "平衡型：体验和储蓄都要" },
      { id: "enjoy", label: "体验型：该花就花，先活在当下" },
      { id: "frugal", label: "节俭型：能省则省，安全感更重要" },
    ],
  },
  {
    id: "q8",
    dim: "money",
    title: "面对“大额消费/投资”，你更倾向？",
    options: [
      { id: "discuss_all", label: "必须提前讨论并达成一致" },
      { id: "threshold", label: "设阈值：超过某金额才需要同步" },
      { id: "separate", label: "各自支配：互不干预" },
      { id: "avoid", label: "尽量少谈：谈钱伤感情" },
    ],
  },
  {
    id: "q9",
    dim: "future",
    title: "你希望这段关系的“路线图”更像？",
    options: [
      { id: "clear", label: "明确节点：一步步推进（同居/见家长/…）" },
      { id: "direction", label: "有方向即可：不必写死时间表" },
      { id: "present", label: "活在当下：先把今天过好" },
      { id: "uncertain", label: "不确定：不想被承诺困住" },
    ],
  },
  {
    id: "q10",
    dim: "conflict",
    title: "当你受伤时，你更需要对方先做什么？",
    options: [
      { id: "apologize", label: "先道歉（不争对错）" },
      { id: "explain", label: "先解释（把误会澄清）" },
      { id: "comfort", label: "先安抚（拥抱/陪着）" },
      { id: "space", label: "先给空间（别逼我说话）" },
    ],
  },
  {
    id: "q11",
    dim: "boundary",
    title: "你更能接受的“透明度”是？",
    desc: "把它理解成：信息共享与隐私边界的比例。",
    options: [
      { id: "full", label: "高透明：愿意互相了解大部分细节" },
      { id: "reasonable", label: "合理透明：重要的事同步即可" },
      { id: "private", label: "保留隐私：不想被审查" },
      { id: "separate", label: "完全各自：不需要解释太多" },
    ],
  },
  {
    id: "q12",
    dim: "life",
    title: "你更喜欢的生活节奏是？",
    options: [
      { id: "routine", label: "规律：稳定作息、可预期安排" },
      { id: "flex", label: "弹性：有计划但允许变化" },
      { id: "spont", label: "随性：灵感来了就出发" },
      { id: "chaos", label: "混沌也行：不太想被安排" },
    ],
  },
  {
    id: "q13",
    dim: "intimacy",
    title: "对“公开/秀恩爱”，你更像？",
    options: [
      { id: "open", label: "愿意公开表达：让我世界知道你很重要" },
      { id: "some", label: "适度即可：不反感但不高频" },
      { id: "private", label: "偏私密：我们知道就够了" },
      { id: "avoid", label: "尽量不公开：不想被关注" },
    ],
  },
  {
    id: "q14",
    dim: "signal",
    title: "当你需要关心时，你更可能怎么“发信号”？",
    options: [
      { id: "say_direct", label: "直接说：我需要你" },
      { id: "hint", label: "暗示：希望对方能读懂" },
      { id: "act", label: "用行为：变粘/变冷/变忙" },
      { id: "silence", label: "沉默：不想麻烦任何人" },
    ],
  },
  {
    id: "q15",
    dim: "future",
    title: "如果未来出现“异地/压力/变动”，你更想怎么共同扛？",
    options: [
      { id: "plan", label: "做方案：分工、时间表、可执行计划" },
      { id: "support", label: "先稳情绪：彼此支持，再慢慢想办法" },
      { id: "adapt", label: "边走边调整：不要过度规划" },
      { id: "avoid", label: "不想谈太远：走一步看一步" },
    ],
  },
  {
    id: "q16",
    dim: "conflict",
    title: "你更认可的“修复方式”是？",
    options: [
      { id: "review", label: "复盘：说清触发点、下次怎么做" },
      { id: "ritual", label: "仪式：抱抱/吃顿饭，把它翻篇" },
      { id: "rule", label: "立规则：约定底线和沟通流程" },
      { id: "forget", label: "别提了：时间会抹平一切" },
    ],
  },
  {
    id: "q17",
    dim: "intimacy",
    title: "你对亲密的“起伏”更能接受哪种？",
    options: [
      { id: "steady", label: "更想稳定：波动太大让我不安" },
      { id: "season", label: "像季节：忙时淡一些也正常" },
      { id: "spark", label: "要火花：太平淡会窒息" },
      { id: "unknown", label: "看情况：说不清，取决于人和状态" },
    ],
  },
  {
    id: "q18",
    dim: "boundary",
    title: "你能接受对方和异性（或可能暧昧对象）的边界更像？",
    options: [
      { id: "strict", label: "严格：明确保持距离" },
      { id: "clear", label: "清晰：可以来往但要透明" },
      { id: "trust", label: "信任：不需要太多限制" },
      { id: "depends", label: "视情况：看对方态度和具体对象" },
    ],
  },
  {
    id: "q19",
    dim: "life",
    title: "旅行像一场任务，你更像哪种队友？",
    options: [
      { id: "plan_all", label: "指挥官：计划详细，按表执行" },
      { id: "half", label: "半自由：大方向定好，细节随机" },
      { id: "free", label: "浪客：走到哪玩到哪" },
      { id: "stay", label: "据点派：不太爱跑，喜欢舒适待着" },
    ],
  },
  {
    id: "q20",
    dim: "future",
    title: "如果要给关系一个“承诺的形状”，你更认同？",
    options: [
      { id: "label", label: "明确身份：名分/承诺让我安心" },
      { id: "action", label: "行动胜过名分：做到了就算承诺" },
      { id: "freedom", label: "承诺要留白：不想被框住" },
      { id: "evolve", label: "随时间生长：不急着定义" },
    ],
  },
];

