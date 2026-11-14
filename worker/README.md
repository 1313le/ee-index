# EE-INDEX AI Worker

这是 EE-INDEX 的公共 AI 代理，部署在 Cloudflare Workers。GitHub Pages 只能托管静态文件，不能运行这个代理，所以需要单独部署。

## 1. 准备

- Node.js 18+
- Cloudflare 账号
- 一个支持 OpenAI 兼容接口的 AI Key。推荐硅基流动（聊天 + 语音转写都能用）：
  - `AI_BASE_URL=https://api.siliconflow.cn/v1`
  - 聊天模型示例：`deepseek-ai/DeepSeek-V3`
  - 语音模型示例：`FunAudioLLM/SenseVoiceSmall`

## 2. 登录 Cloudflare

```bash
npx wrangler login
```

## 3. 创建限流 KV

```bash
npx wrangler kv namespace create RATE_LIMIT
```

把返回的 `id` 填进 `wrangler.toml` 的 `[[kv_namespaces]]`。

## 4. 设置密钥

不要把 Key 写进 `wrangler.toml` 或前端。

```bash
npx wrangler secret put AI_API_KEY
```

如果语音转写用另一个服务商，再设置：

```bash
npx wrangler secret put STT_API_KEY
```

并在 `wrangler.toml` 或 Cloudflare 控制台里设置 `STT_BASE_URL`。

## 5. 修改允许来源

在 `wrangler.toml` 中把：

```toml
ALLOWED_ORIGINS = "https://YOURNAME.github.io"
```

改成你的 GitHub Pages 地址。如果绑定自定义域名，也一起加上，用逗号分隔：

```toml
ALLOWED_ORIGINS = "https://YOURNAME.github.io,https://your-domain.com"
```

本地调试可以保留：

```toml
ALLOW_LOCAL = "true"
```

正式上线建议改成 `"false"`。

## 6. 部署

```bash
npx wrangler deploy
```

你会得到一个类似下面的地址：

```text
https://ee-index-ai.YOUR-SUBDOMAIN.workers.dev
```

前端使用的 Base URL 要加 `/v1`：

```text
https://ee-index-ai.YOUR-SUBDOMAIN.workers.dev/v1
```

## 7. 验证

```bash
curl https://ee-index-ai.YOUR-SUBDOMAIN.workers.dev/health

curl -H "Origin: https://YOURNAME.github.io" \
  https://ee-index-ai.YOUR-SUBDOMAIN.workers.dev/v1/models
```

如果 `/health` 显示 `"kv": true`，说明限流绑定成功。

## 8. 回填前端

在发布目录的 `index.html` 里找到：

```html
<meta name="ee-ai-base" content="">
```

改成：

```html
<meta name="ee-ai-base" content="https://ee-index-ai.YOUR-SUBDOMAIN.workers.dev/v1">
```

如果你改的是源码 `head2.html`，改完后重新构建 `electronics-index.html`，再复制到发布目录。

可选：

```html
<meta name="ee-ai-model" content="deepseek-ai/DeepSeek-V3">
<meta name="ee-ai-stt" content="FunAudioLLM/SenseVoiceSmall">
```

## 安全说明

- `AI_API_KEY` 只存在 Worker Secret，不进入浏览器。
- Worker 固定上游地址，不接受客户端传入的 Base URL，避免 SSRF。
- 已限制消息数、输出 token、请求体大小和音频大小。
- 已用 KV 做每 IP 每分钟/每天限流。公开站点仍建议在 Cloudflare 控制台再加 WAF / 速率限制规则。
- 如果被刷量，先在 Cloudflare 控制台停用 Worker 或降低 `RATE_PER_DAY`。
- 公共 AI 会产生真实 API 费用，请设置服务商预算告警。
- 公开运营还需要隐私政策、内容合规和（如在中国大陆绑定域名）ICP 备案。
