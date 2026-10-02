# API 参考

## 查看文档解析原文

`GET /api/documents/{document_id}/source`

需要登录，并按知识库访问权限校验。返回文档最近一次成功解析后保存的规范化 Markdown 原文：

```json
{
  "document_id": "<document-id>",
  "format": "markdown",
  "content": "# 文档标题\n\n| 列 1 | 列 2 |\n| --- | --- |\n| 值 1 | 值 2 |"
}
```

尚未解析或历史文档还没有保存原文时返回 404；重新解析后生成 Markdown。飞书新版文档中的格式化表格按单元格子块读取，嵌入电子表格按 `spreadsheet_token` 与 `sheet_id` 读取，嵌入多维表格按 `app_token` 与 `table_id` 读取；三类表格统一序列化为 Markdown 表格。图片以 `feishu://` 图片资源标识记录。
