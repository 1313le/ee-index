# EE-INDEX 云同步 Worker

匿名设备同步服务：Cloudflare Workers + D1（元数据）+ R2（文件）。默认关闭，只有你在站内“我的文件 → 云端”里填入部署后的地址才启用。

## 部署

```bash
npm i -g wrangler
wrangler login

# 1. 创建 D1 与 R2
wrangler d1 create eeidx-sync
wrangler r2 bucket create eeidx-files

# 2. 把 d1 create 输出的 database_id 填进 wrangler.toml
# 3. 建表
wrangler d1 execute eeidx-sync --file=schema.sql --remote

# 4. 部署
wrangler deploy
```

部署完成后会得到类似 `https://eeidx-sync.<你的子域>.workers.dev` 的地址，填进站内“云端同步”面板即可。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 连接测试，顺手注册匿名设备 |
| POST | `/api/device` | 返回设备 ID 与配额 |
| GET | `/api/sync` | 拉取分类与文件索引 |
| POST | `/api/categories` | 批量写入分类 |
| PUT | `/api/files/:id` | 上传文件（原始 body），同名冲突返回 409 |
| GET | `/api/files/:id` | 下载文件 |
| DELETE | `/api/files/:id` | 删除文件 |

所有请求都需要 `Authorization: Bearer <设备码>`。设备码由浏览器本地生成（24 字节随机数），服务端只保存 SHA-256 哈希，不记录原始 token。

## 配额

- 单文件上限 60 MB（Workers 请求体限制内的安全值）。
- 每设备 200 MB 免费额度，超限返回 413。
- 文件存 R2，元数据存 D1；删除会同时清理 R2 对象与 D1 行。

## 边界

- 不做账号体系，不做公开分享；设备码丢失即无法找回原空间。
- 不接入任何第三方 AI；AI 归档在浏览器本地完成，只有你主动点“推送”时才上传文件。
- 部署需要你自己的 Cloudflare 账号；本项目不代部署、不内置密钥。
