# Channel Lab

通过 Cloudflare Worker 转发请求的模型测试台，用同一提示词比较不同渠道、模型生成的 HTML 效果。

在线使用：https://channel-lab.muabl.workers.dev/

GitHub Pages 入口：https://moeacgx.github.io/channel-lab/ （调用同一个 Worker 代理）

## 使用

1. 输入基础接口地址和临时令牌。
2. 选择 Chat Completions 或 Responses，填写模型名称。
3. 编辑请求体并发送；默认流式显示响应和 HTML 代码。
4. 生成完成后切换到预览，查看结果。

支持停止请求、查看原始 SSE 事件、保存和读取浏览器配置。默认提示词为鹈鹕骑自行车的 SVG 动画。

## 数据与部署

- 页面、样式与交互放在 `index.html`，`worker.js` 同时托管页面并提供 `/api/proxy`。
- 浏览器将请求发送给 Worker，Worker 携带临时令牌访问所填渠道。令牌不写入浏览器或服务端存储，应用不记录请求日志。
- Worker 直接透传上游响应流，不等待完整内容，不跟随上游重定向。
- 配置保存在当前浏览器的 localStorage，不在设备之间同步。
- 渠道无需开放浏览器跨域，需提供 HTTPS 公网域名；不同站点的浏览器配置独立，首次打开 Worker 网址需重新填写配置。
- 生成的 HTML 在隔离 iframe 中预览，禁止访问测试台数据和联网加载资源。
- GitHub Pages 从 `main` 分支根目录发布，推送首页更新后自动重新部署。Worker 需按下述命令单独发布。

## Worker 部署

使用 Wrangler 登录 Cloudflare，或在进程环境中提供 `CLOUDFLARE_API_TOKEN`，执行：

```sh
wrangler deploy
```

`wrangler.jsonc` 配置 Worker 名称、账号及允许访问的网页来源。更换账号或域名时同步修改页面中的 `WORKER_ORIGIN`。Cloudflare 凭据不应写入源码。

代理只开放聊天补全和 Responses 路径，请求体上限 1 MiB，拒绝 IP 字面地址、常见内网域名后缀与非 HTTPS 地址。Origin 限制用于浏览器跨域控制，不是用户身份认证；使用者自行提供上游令牌。`null` 来源允许直接打开本地 HTML。域名检查不包含 DNS 最终解析地址验证。
