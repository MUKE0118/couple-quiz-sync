# 情侣契合度测试（静态网页）

这是一套纯前端静态网页：两个人分别作答同一套题，提交后显示一致题数、维度分析，并为 A/B 生成可下载的赛博角色卡（SVG）。

## 文件说明

- `index.html`：主页面
- `styles.css`：样式
- `questions.js`：题库（可改题目）
- `app.js`：交互逻辑（本地存储/分析/角色卡生成）

## 在线分享（GitHub Pages）

### 1) 新建 GitHub 仓库

1. 打开 GitHub（`https://github.com/`），登录后点右上角 **New** 新建仓库
2. 仓库名随意（例如 `couple-quiz`）
3. 选择 **Public**（想私密也行，但私密仓库的 Pages 可能需要付费/权限）
4. 点 **Create repository**

### 2) 上传文件

在仓库页面点击 **Add file → Upload files**，把下面这些文件拖进去上传：

- `index.html`
- `styles.css`
- `questions.js`
- `app.js`
- `README.md`（可选）

然后点击 **Commit changes**。

### 3) 开启 GitHub Pages

1. 进入仓库 **Settings**
2. 左侧找到 **Pages**
3. **Build and deployment** → **Source** 选 `Deploy from a branch`
4. **Branch** 选 `main`，目录选 `/ (root)`
5. 保存后等 10～60 秒，页面会给出一个链接（例如 `https://你的用户名.github.io/仓库名/`）

把这个链接发给朋友即可。

## 注意

- 这是静态网页：**每个人的作答默认只保存在自己浏览器本机**（localStorage）。
- 本项目已支持“房间码 + 在线同步”，但需要你部署 `server/`（WebSocket 服务端），并在网页里填入你的同步服务地址。

## 异地同步（房间码 + 在线同步）

### 1) 一键部署同步服务端（Render，最简单）

我已经给仓库加好了 Render 的一键部署配置（`render.yaml`）。

按下面做（不需要懂代码）：

1. 打开这个按钮（会跳到 Render）：`https://render.com/deploy?repo=https://github.com/MUKE0118/couple-quiz-sync`
2. 用 GitHub 登录 Render（第一次会让你点授权）
3. 点击 Deploy，等待部署完成
4. 部署完成后，Render 会给你一个地址，长这样：`https://xxxx.onrender.com`

然后网页里填（非常关键）：

- **同步服务地址**：把 Render 的 `https://xxxx.onrender.com` 改成 **`wss://xxxx.onrender.com`**
- **房间码**：随便生成一个（两个人一样就行）

### 2) 本地先跑起来测试（可选）

`server/` 是 WebSocket 服务端。你也可以先在自己电脑跑通：

```bash
cd server
npm install
npm start
```

然后网页里填：

- 同步服务地址：`ws://127.0.0.1:8787`
- 房间码：随便生成一个

### 3) 线上使用（异地联机）

两个人打开同一个网页，填同一个同步地址 + 同一个房间码，就会实时同步作答与提交。

