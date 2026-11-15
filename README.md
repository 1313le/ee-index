# EE-INDEX 98 发布包

这是一个单页硬件工程资源索引。前端是纯静态文件，可发布到 GitHub Pages；公共 AI 代理与可选的个人文件库同步服务分别部署到 Cloudflare Workers。

前端内置“我的文件”：拖拽上传、最多 5 级分类、批量操作、回收站、ZIP 导入导出、AI 自动归档与复古音效/动效。文件默认只保存在浏览器本地。

## 目录

```text
publish/
├─ index.html          # 前端主文件
├─ privacy.html        # 隐私与免责声明
├─ .nojekyll           # GitHub Pages 需要，避免 Jekyll 处理
├─ README.md
├─ worker/
│  ├─ worker.js        # Cloudflare Worker AI 代理
│  ├─ wrangler.toml    # Worker 配置
│  └─ README.md        # Worker 部署步骤
└─ sync-worker/        # 个人文件库同步服务（可选）
   ├─ src/index.js     # Worker：D1 + R2
   ├─ schema.sql       # D1 表结构
   ├─ wrangler.toml    # D1 / R2 绑定
   └─ README.md        # 部署步骤
```

## 一、发布到 GitHub Pages

### 方式 A：网页上传（最简单）

1. 在 GitHub 新建一个仓库，例如 `ee-index`。
2. 把本目录中的 `index.html`、`privacy.html`、`.nojekyll` 上传到仓库根目录。
3. 进入仓库 **Settings → Pages**。
4. Source 选择 **Deploy from a branch**，Branch 选 `main`，目录选 `/ (root)`，保存。
5. 等待 1–2 分钟，访问：

```text
https://你的用户名.github.io/ee-index/
```

如果是用户主页仓库（仓库名 `你的用户名.github.io`），地址是：

```text
https://你的用户名.github.io/
```

### 方式 B：命令行

```bash
cd publish
git init
git add index.html privacy.html .nojekyll README.md
git commit -m "Publish EE-INDEX 98"
git branch -M main
git remote add origin https://github.com/你的用户名/ee-index.git
git push -u origin main
```

然后到 **Settings → Pages** 选择 `main` / root。

### 自定义域名

- 在 Pages 设置里绑定域名，并在 DNS 添加 CNAME。
- 开启 HTTPS。
- 如果使用中国大陆服务器/域名，需要 ICP 备案；GitHub Pages 本身在海外。

## 二、部署公共 AI 代理

GitHub Pages 不能运行后端，所以 AI 代理需要 Cloudflare Workers。详细步骤见 `worker/README.md`。

最短流程：

```bash
cd worker
npx wrangler login
npx wrangler kv namespace create RATE_LIMIT
# 把返回的 id 填进 wrangler.toml
npx wrangler secret put AI_API_KEY
# 修改 wrangler.toml 里的 ALLOWED_ORIGINS
npx wrangler deploy
```

部署后会得到：

```text
https://ee-index-ai.你的子域.workers.dev
```

回到前端 `index.html`，找到：

```html
<meta name="ee-ai-base" content="">
```

改成：

```html
<meta name="ee-ai-base" content="https://ee-index-ai.你的子域.workers.dev/v1">
```

提交并等待 GitHub Pages 更新。首次打开会自动使用「EE-INDEX 公共 AI」，不需要用户填 Key。

## 三、部署个人文件库同步服务（可选，匿名设备码）

不部署也可以使用完整的本地个人文件库；只有需要跨设备同步时才部署。

```bash
cd sync-worker
npx wrangler login
npx wrangler d1 create eeidx-sync
# 把返回的 database_id 填进 wrangler.toml
npx wrangler d1 execute eeidx-sync --remote --file=schema.sql
npx wrangler r2 bucket create eeidx-files
npx wrangler deploy
```

部署后得到 `https://eeidx-sync.<你的子域>.workers.dev`。回到前端 → 我的文件 → 云端，填入该地址，点“连接测试”即可。免费额度：每设备 200 MB、单文件 60 MB，超出返回 413/507。

- 设备身份是 24 字节随机令牌，浏览器本地生成，请求用 `Authorization: Bearer` 发送；服务端只保存 SHA-256 哈希。
- 文件内容存 R2，元数据存 D1；冲突时返回 409，不会静默覆盖较新的版本。
- 同步是手动触发的：只有点击“推送到云端”才会上传。

## 四、发布前检查

- [ ] GitHub Pages 能正常打开 `index.html`
- [ ] `privacy.html` 可访问
- [ ] Worker `/health` 返回 `kv: true`
- [ ] Worker `/v1/models` 带正确 Origin 返回模型列表
- [ ] 前端 AI 能返回推荐资源
- [ ] 语音转写可用（如果配置了 `STT_MODEL`）
- [ ] “我的文件”可上传、分类、回收站还原、ZIP 导入导出
- [ ] 音效开关可用；`prefers-reduced-motion` 时出现恢复动效提示
- [ ] 如部署同步服务：`/api/health` 返回 `ok`，连接测试与推送成功
- [ ] `ALLOWED_ORIGINS` 包含 GitHub Pages 域名
- [ ] `ALLOW_LOCAL` 正式环境改为 `false`
- [ ] 已设置 API 预算告警和 Cloudflare 限流
- [ ] 已阅读隐私/免责声明，公开运营者已处理备案与合规

## 安全与成本

- 绝对不要把 API Key 写进 `index.html` 或提交到 GitHub。
- Worker 的 Key 只保存在 Cloudflare Secret。
- 公共代理会产生真实 API 费用，务必使用 KV 限流 + 服务商预算告警。
- 当前 Worker 已限制请求大小、消息数量、输出 token、音频大小和每 IP 频率；公开站点仍建议在 Cloudflare 控制台追加 WAF / 速率限制规则。
- 如果使用中国大陆域名/服务器，请自行处理 ICP 备案；GitHub Pages 和 Cloudflare 的访问速度/可用性需自行评估。

## 当前状态

前端发布包、AI Worker 和同步 Worker 代码已经准备好。实际推送 GitHub 和部署 Cloudflare Worker 需要：

1. 你的 GitHub 登录/仓库；
2. 你的 Cloudflare 登录；
3. 一个可用的 AI API Key（通过 `wrangler secret put` 设置，不要发到聊天里）。

完成这三项后，把 AI Worker URL 填进 `ee-ai-base` 即可上线公共 AI；同步服务按第三节部署后，把地址填进前端“云端”面板即可。
