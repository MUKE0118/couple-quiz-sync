// 题库可直接编辑：title/desc/options/维度。
// 匹配规则：同一题选项 id 完全一致才算“一致”。
//
// 题目分类（共 35 题）：
//   第  1- 6 题  生活与默契契合（节奏、周末、家务 + 一天喜好、下雨天、周末早晨）
//   第  7-13 题  沟通与边界契合（没事/说话/回复/发信号/随便 + 空间、透明度）
//   第 14-20 题  亲密与冲突契合（被爱/公开/起伏/同步/被惦记 + 冲突处理、受伤时、修复方式）
//   第 21-27 题  金钱与未来契合（金钱观、大额、礼物 + 路线图、异地、承诺形状、见家长）
//   第 28-35 题  边界·节奏·默契综合（异性边界、手机、圈子 + 修复翻篇 + 旅行、节奏 + 喝什么、睡前）

window.DIMENSIONS = [
  { id: "signal", name: "沟通信号" },
  { id: "boundary", name: "边界与自由" },
  { id: "conflict", name: "冲突修复" },
  { id: "money", name: "金钱与风险" },
  { id: "future", name: "未来与承诺" },
  { id: "intimacy", name: "亲密与表达" },
  { id: "life", name: "生活节奏" },
  { id: "sync", name: "默契问答" },
];

window.QUESTIONS = [
  // ---- 第 1-6 题：生活与默契契合 ----
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
    id: "q23",
    dim: "life",
    title: "周末更想怎么过？",
    options: [
      { id: "plan", label: "提前安排好：有期待才踏实" },
      { id: "half", label: "有个大方向，细节随缘" },
      { id: "wake", label: "睡醒再说：完全看心情" },
      { id: "alone", label: "留足独处时间：周末要回血" },
    ],
  },
  {
    id: "q30",
    dim: "life",
    title: "家务/琐事你更倾向？",
    options: [
      { id: "split", label: "明确分工：谁负责什么说清楚" },
      { id: "together", label: "一起做：边做边聊" },
      { id: "flex", label: "谁有空谁做：不刻意分" },
      { id: "one", label: "一人主导、一人搭把手" },
    ],
  },
  {
    id: "q31",
    dim: "sync",
    title: "一天里你最喜欢什么时候？",
    options: [
      { id: "morning", label: "早晨：清醒、有干劲" },
      { id: "noon", label: "午后：阳光正好" },
      { id: "dusk", label: "傍晚：下班后的松弛" },
      { id: "night", label: "深夜：安静、属于自己" },
    ],
  },
  {
    id: "q32",
    dim: "sync",
    title: "下雨天更想做什么？",
    options: [
      { id: "home", label: "宅家：窝着看剧/看书" },
      { id: "sleep", label: "睡觉：最好睡到自然醒" },
      { id: "out", label: "出门：撑伞散步/踩水" },
      { id: "tea", label: "约人喝茶/咖啡" },
    ],
  },
  // ---- 第 7-13 题：沟通与边界契合 ----
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
    id: "q24",
    dim: "signal",
    title: "当对方说“随便/都行”，你更可能？",
    options: [
      { id: "decide", label: "我来定：给几个选项或直接选" },
      { id: "ask", label: "再问一次：想听真实想法" },
      { id: "annoyed", label: "有点烦：希望对方能拿主意" },
      { id: "relax", label: "真的随便：我也可以选" },
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
  // ---- 第 14-20 题：亲密与冲突契合 ----
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
    id: "q21",
    dim: "intimacy",
    title: "你更看重关系里的哪种“同步”？",
    options: [
      { id: "emotion", label: "情绪同步：能接住彼此的高潮低谷" },
      { id: "time", label: "时间同步：节奏一致、常在一起" },
      { id: "value", label: "价值观同步：大事上想法一致" },
      { id: "space", label: "不必强求同步：各自舒服就好" },
    ],
  },
  {
    id: "q28",
    dim: "intimacy",
    title: "日常生活中，哪类小事最让你觉得被惦记？",
    options: [
      { id: "remember", label: "记得我说过的话、提过的事" },
      { id: "help", label: "主动分担、顺手帮我做了" },
      { id: "time", label: "抽时间专门陪我" },
      { id: "surprise", label: "小礼物或惊喜" },
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
  // ---- 第 21-27 题：金钱与未来契合 ----
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
    id: "q26",
    dim: "money",
    title: "礼物/红包你更看重？",
    options: [
      { id: "thought", label: "心意：有没有花心思" },
      { id: "amount", label: "分量：金额代表重视程度" },
      { id: "same", label: "对等：彼此付出差不多" },
      { id: "none", label: "不太在意：不送也行" },
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
  {
    id: "q27",
    dim: "future",
    title: "对“见家长/谈婚论嫁”的时间感，你更接近？",
    options: [
      { id: "early", label: "稳定了就尽早：给彼此交代" },
      { id: "ready", label: "等两人都准备好再说" },
      { id: "slow", label: "不着急：关系好比形式重要" },
      { id: "avoid", label: "能晚则晚：压力大" },
    ],
  },
  // ---- 第 28-35 题：边界·节奏·默契综合 ----
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
    id: "q22",
    dim: "boundary",
    title: "对方查看你手机/社交账号，你的第一反应更接近？",
    options: [
      { id: "ok", label: "可以：我没什么要藏的" },
      { id: "ask", label: "先问原因：需要理由再决定" },
      { id: "uncomfortable", label: "不舒服：觉得被审查" },
      { id: "no", label: "不接受：那是我的隐私" },
    ],
  },
  {
    id: "q29",
    dim: "boundary",
    title: "你能接受伴侣有“不和你分享”的圈子或爱好吗？",
    options: [
      { id: "yes", label: "完全可以：每个人都需要自己的空间" },
      { id: "some", label: "部分可以：大致知道就行" },
      { id: "uncomfortable", label: "会有点不舒服：希望多数事能分享" },
      { id: "no", label: "不太能：希望彼此透明" },
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
    id: "q25",
    dim: "conflict",
    title: "吵完架后，你更需要什么才能“翻篇”？",
    options: [
      { id: "apology", label: "明确道歉或和好动作" },
      { id: "talk", label: "聊清楚原因和感受" },
      { id: "time", label: "各自冷静一段时间" },
      { id: "normal", label: "像平时一样相处，自然过去" },
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
    id: "q33",
    dim: "sync",
    title: "周末早晨醒来第一件事更常是？",
    options: [
      { id: "phone", label: "看手机" },
      { id: "sleep_more", label: "再睡一会儿" },
      { id: "eat", label: "起来弄吃的" },
      { id: "partner", label: "找对方/等对方醒" },
    ],
  },
  {
    id: "q34",
    dim: "sync",
    title: "喝东西你更常选？",
    options: [
      { id: "coffee", label: "咖啡" },
      { id: "tea", label: "茶" },
      { id: "milk_tea", label: "奶茶/果茶" },
      { id: "water", label: "白水/苏打" },
    ],
  },
  {
    id: "q35",
    dim: "sync",
    title: "睡前你更常？",
    options: [
      { id: "phone", label: "看手机" },
      { id: "read", label: "看书或听播客/音乐" },
      { id: "chat", label: "和对方聊几句" },
      { id: "sleep", label: "直接睡" },
    ],
  },
];

