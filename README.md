# Channel Lab

单文件静态模型测试台，用同一提示词比较不同渠道、模型生成的 HTML 效果。

在线使用：https://moeacgx.github.io/channel-lab/

## 使用

1. 输入基础接口地址和临时令牌。
2. 选择 Chat Completions 或 Responses，填写模型名称。
3. 编辑请求体并发送；默认流式显示响应和 HTML 代码。
4. 生成完成后切换到预览，查看结果。

支持停止请求、查看原始 SSE 事件、保存和读取浏览器配置。默认提示词为鹈鹕骑自行车的 SVG 动画。

## 数据与部署

- 无后端、无依赖，直接打开 `index.html` 即可使用。
- 令牌不写入浏览器存储；请求由浏览器直接发送到用户填写的渠道。
- 配置保存在当前浏览器的 localStorage，不在设备之间同步。
- 渠道需要允许站点的跨域请求；GitHub Pages 的 HTTPS 页面应连接 HTTPS 接口。
- 生成的 HTML 在隔离 iframe 中预览，禁止访问测试台数据和联网加载资源。
- GitHub Pages 从 `main` 分支根目录发布，推送首页更新后自动重新部署。
