# resources —— 学习资料静态资源目录

页面：`/resources`（秋功 · 学习资料），由 `app/public/resources/manifest.json` 驱动，
文件本体放在本目录内（建议按课程建子文件夹，如 `resources/高等数学/…`）。

## 上架一份资料（3 步）

1. 把文件放入本目录（建议：`resources/<课程名>/<文件名>`）；
2. 在 `manifest.json` 对应课程分组（`groups`）的 `items` 里新增一条：
   ```json
   { "id": "唯一ID", "name": "显示名称.pdf", "description": "说明/年份等",
     "type": "pdf|txt|doc|zip|…", "file": "resources/高等数学/xxx.pdf" }
   ```
   没有对应分组就新增一个 `{ "id": "…", "name": "课程名", "items": […] }`；
3. 运行 `node scripts/sync-resources.mjs`：
   - 自动生成 `files.json`（页面据此展示真实文件大小、校验文件是否存在）；
   - 报告「manifest 引用了但磁盘缺失」「磁盘存在但未登记」两类问题。

> 本目录的 `manifest.json` / `files.json` / `README.txt` 不会被扫描进文件清单；
> `demo/` 为占位演示资料，正式上架后删除该文件夹及 manifest 中对应分组即可。

## 数据字段约定

- `updatedAt`：资料更新时间（YYYY-MM-DD），展示于页面头部；
- `notice`：页面顶部提示文案；
- `type`：文件类型标签（pdf/txt/doc/docx/xls/xlsx/ppt/zip/rar/…，未知类型显示「文件」）；
- 条目可不填 `size`（由 `files.json` 自动带出）；`file` 为相对站点根路径。
