# EE-INDEX 98 发布包

这是一个单页硬件工程资源索引，界面还原早期 Windows 98 桌面：壁纸、桌面快捷方式、任务栏（开始菜单 / 快速启动 / 托盘时钟）与资源管理器窗口，窗口内提供目录树、四视图、排序、多选、右键菜单、后退/前进/向上与键盘快捷键。前端是纯静态文件，可发布到 GitHub Pages；公共 AI 代理与可选的个人文件库同步服务分别部署到 Cloudflare Workers。

桌面首页提供时钟日期、资源统计、岗位路径、项目分级、快捷计算器与数据手册直达入口；“显示桌面”可在 1101px 以上宽度切换到概览桌面。资源列表默认按“名称 / 来源 / 许可 / 语言”四列展示，四列都可点击排序，来源列显示品牌名并在悬停时给出完整域名。

站内收录 375 条资源：78 条官方软件 / EDA 入口、16 个在线工程工具（含 Polar SI9000e、嘉立创阻抗计算器、PCBWay、Rogers、Sierra Circuits、Murata、KEMET、TI 等），以及 36 份常用元器件数据手册（电阻、电容、电感/磁珠、二极管、三极管/MOSFET、电源管理、模拟/运放、MCU/逻辑、传感器、连接器/保护）为原厂公开 PDF 的自托管镜像，可直接站内预览与下载。前端另内置 6 个本地计算器：阻抗/线宽（IPC-2141）、载流/线宽（IPC-2221）、过孔/走线、分压/RC/LED/LDO、BOM 核对、单位换算。

前端内置“我的文件”：拖拽上传、最多 5 级分类、批量操作、回收站、ZIP 导入导出、AI 自动归档与复古音效/动效。文件默认只保存在浏览器本地。

## 目录

```text
publish/
├─ index.html          # 前端主文件
├─ privacy.html        # 隐私与免责声明
├─ datasheets/         # 36 份自托管元器件数据手册（按子类分目录）+ README.md 清单
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

`datasheets/` 必须与 `index.html` 同级部署；前端用 `datasheets/<子类>/<文件名>.pdf` 相对路径做站内预览，缺少该目录时预览和下载会 404。

## 一、发布到 GitHub Pages

### 方式 A：网页上传（最简单）

1. 在 GitHub 新建一个仓库，例如 `ee-index`。
2. 把本目录中的 `index.html`、`privacy.html`、`.nojekyll`、`datasheets/` 上传到仓库根目录。
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
git add index.html privacy.html .nojekyll README.md datasheets
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

## 二、数据手册与版权

- 36 份 PDF 来自 Vishay、onsemi、TI、ST、Microchip、Espressif、Bosch、ADI/Maxim、Bourns、Diodes、AOS、Winbond、JST 等原厂公开下载页，逐份校验过 `%PDF-` 文件头、页数与文本内容。
- 清单、子类、料号、页数、官方来源与本地文件名见 `datasheets/README.md`。
- 本站仅做学习用途的镜像托管，未修改 PDF 内容，版权归各原厂所有。若原厂或权利方要求下架，删除 `datasheets/` 中对应文件，并同步删除 `index.html` 内 `EE_EXTRA_DATASHEETS` 中对应条目即可。
- 新增数据手册时，把 PDF 放到 `datasheets/<子类>/`，在 `ee-index/src/data/extra-datasheets.js` 增加条目，再运行 `node ee-index/build.mjs`；构建会校验文件存在、PDF 文件头、单文件 ≤6 MB、总体积 ≤60 MB 和页数。
- GitHub Pages 对单文件 100 MB、仓库 1 GB 有软限制；当前 36 份约 45 MB，正常推送即可。

## 三、部署公共 AI 代理

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

## 四、部署个人文件库同步服务（可选，匿名设备码）

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

## 五、发布前检查

- [ ] GitHub Pages 能正常打开 `index.html`
- [ ] `privacy.html` 可访问
- [ ] 资源库显示 375 条资源；软件获取 / 工程工具 / 数据手册分类分别显示 27 / 16 / 36 条
- [ ] 列表四列可排序；来源列显示品牌名与完整域名提示
- [ ] 桌面首页显示 375 条资源、8 条岗位路径、30 个项目与 6 个计算器快捷入口
- [ ] 数据手册详情可打开，PDF 在站内预览，下载按钮可用
- [ ] 目录树、四视图、排序、多选、右键菜单、后退/前进/向上与快捷键正常
- [ ] 桌面快捷方式双击可打开对应视图；标题栏最小化后可从任务栏还原；窄屏（≤1100px）自动收起桌面外壳
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

- 前端已包含 375 条资源、16 个在线工程工具、6 个本地计算器与 36 份自托管数据手册，发布包可直接部署到 GitHub Pages。
- AI Worker 与同步 Worker 代码已准备好，但尚未部署；公共 AI 与云端同步需要 Cloudflare 账号。
- 实际部署 Cloudflare Worker 需要：

1. 你的 Cloudflare 登录；
2. 一个可用的 AI API Key（通过 `wrangler secret put` 设置，不要发到聊天里）。

完成部署后，把 AI Worker URL 填进 `ee-ai-base` 即可上线公共 AI；同步服务按第四节部署后，把地址填进前端“云端”面板即可。
