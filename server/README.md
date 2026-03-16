# 在线同步服务端（房间码）

这是一个最小 WebSocket 同步服务端：为房间保存 A/B 作答与提交状态，并广播给同房间的客户端。

## 本地运行

在 `server/` 目录打开终端执行：

```bash
npm install
npm start
```

默认端口：`8787`

健康检查：`/health`

## 部署

你可以把 `server/` 单独部署到任何支持 Node 的平台（Render/Fly/Railway 等）。

环境变量：

- `PORT`：平台会自动提供
- `CORS_ORIGIN`：允许的前端域名（可先用 `*`，更安全做法是填你的 GitHub Pages 域名）

部署完成后你会拿到一个 `wss://...` 或 `https://...` 的地址，前端把它作为同步地址即可。

