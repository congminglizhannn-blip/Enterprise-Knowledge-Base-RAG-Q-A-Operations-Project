from app.services.parser.link import extract_feishu_token, extract_html_text, extract_html_title, extract_text_from_docx_block, is_feishu_url, render_feishu_docx_blocks, rows_to_text


def test_extract_html_text_removes_scripts_and_styles() -> None:
    html = """
    <html>
      <head><style>.x { color: red; }</style></head>
      <body>
        <h1>制度流程</h1>
        <script>window.secret = 1</script>
        <p>提交申请后进入部门审批。</p>
      </body>
    </html>
    """

    text = extract_html_text(html)

    assert "制度流程" in text
    assert "提交申请后进入部门审批" in text
    assert "window.secret" not in text
    assert "color: red" not in text


def test_extract_html_title() -> None:
    assert extract_html_title("<html><head><title>知识库流程文档</title></head><body></body></html>") == "知识库流程文档"
    assert extract_html_title("<html><body>no title</body></html>") is None


def test_feishu_url_detection_and_token_extraction() -> None:
    assert is_feishu_url("https://example.feishu.cn/docx/AbCdEf123")
    assert extract_feishu_token("https://example.feishu.cn/docx/AbCdEf123?from=from_copylink") == ("docx", "AbCdEf123")
    assert extract_feishu_token("https://example.feishu.cn/wiki/WiKiToken123") == ("wiki", "WiKiToken123")
    assert extract_feishu_token("https://example.feishu.cn/sheets/SheetToken123?sheet=abc") == ("sheet", "SheetToken123")
    assert extract_feishu_token("https://example.feishu.cn/base/BaseToken123?table=tbl") == ("bitable", "BaseToken123")


def test_rows_to_text_keeps_table_cells() -> None:
    text = rows_to_text("排班表", [("Sheet1", [["姓名", "班次"], ["张三", "早班"], ["李四", "晚班"]])])

    assert "排班表" in text
    assert "## Sheet1" in text
    assert "姓名 | 班次" in text
    assert "张三 | 早班" in text


def test_extract_text_from_docx_block_keeps_table_cell_text() -> None:
    block = {
        "block_id": "blkxxxxxxxx",
        "table_cell": {
            "elements": [
                {"text_run": {"content": "住宿标准（一线城市）"}},
                {"text_run": {"content": "400元/晚"}},
            ],
        },
    }

    text = extract_text_from_docx_block(block)

    assert "住宿标准（一线城市）" in text
    assert "400元/晚" in text
    assert "blkxxxxxxxx" not in text


def test_docx_block_text_ignores_style_metadata() -> None:
    block = {
        "block_type": 4,
        "heading1": {
            "elements": [{"text_run": {"content": "目的"}}],
            "style": {"align": 1, "foldable": False},
        },
    }

    text = extract_text_from_docx_block(block)

    assert text == "目的"


def test_docx_table_blocks_render_as_markdown_rows() -> None:
    cells = ["cell1", "cell2", "cell3", "cell4"]
    blocks = [{
        "block_id": "table1",
        "table": {"property": {"row_size": 2, "column_size": 2}, "cells": cells},
    }]
    for cell_id, content in zip(cells, ["角色", "职责", "业务部门", "发起付款申请"], strict=True):
        blocks.append({
            "block_id": cell_id,
            "parent_id": "table1",
            "table_cell": {"elements": [{"text_run": {"content": content}}]},
        })

    markdown = render_feishu_docx_blocks(blocks)

    assert "| 角色 | 职责 |" in markdown
    assert "| --- | --- |" in markdown
    assert "| 业务部门 | 发起付款申请 |" in markdown
    assert markdown.count("角色") == 1


def test_docx_embedded_sheet_block_reads_values_by_split_token(monkeypatch) -> None:
    from app.services.parser import link

    captured = {}

    def fake_request(client, path, tenant_token, **kwargs):
        captured.update(path=path, tenant=tenant_token, params=kwargs.get("params"))
        return {"valueRange": {"values": [["步骤", "责任人"], ["合同/订单", "业务/采购"]]}}

    monkeypatch.setattr(link, "request_feishu_api", fake_request)
    markdown = link.render_feishu_docx_blocks(
        [{"block_id": "sheet-block", "block_type": 30, "sheet": {"token": "spreadsheetToken_sheetId"}}],
        client=object(),
        tenant_token="tenant-token",
    )

    assert captured["path"] == "/sheets/v2/spreadsheets/spreadsheetToken/values/sheetId"
    assert captured["tenant"] == "tenant-token"
    assert "| 步骤 | 责任人 |" in markdown
    assert "| 合同/订单 | 业务/采购 |" in markdown


def test_docx_table_fetches_missing_cell_children(monkeypatch) -> None:
    from app.services.parser import link

    calls = []

    def fake_paginated(client, path, tenant_token, **kwargs):
        calls.append(path)
        if path.endswith("/blocks"):
            return [{"block_id": "table1", "table": {"cells": ["c1", "c2", "c3", "c4"], "property": {"row_size": 2, "column_size": 2}}}]
        return [
            {"block_id": "c1", "parent_id": "table1", "table_cell": {"elements": [{"text_run": {"content": "角色"}}]}},
            {"block_id": "c2", "parent_id": "table1", "table_cell": {"elements": [{"text_run": {"content": "职责"}}]}},
            {"block_id": "c3", "parent_id": "table1", "table_cell": {"elements": [{"text_run": {"content": "业务部门"}}]}},
            {"block_id": "c4", "parent_id": "table1", "table_cell": {"elements": [{"text_run": {"content": "发起申请"}}]}},
        ]

    monkeypatch.setattr(link, "request_feishu_api_paginated", fake_paginated)
    markdown = link.parse_feishu_docx_blocks(object(), "tenant", "document")

    assert any(path.endswith("/blocks/table1/children") for path in calls)
    assert "| 业务部门 | 发起申请 |" in markdown


def test_docx_embedded_bitable_reads_fields_and_records(monkeypatch) -> None:
    from app.services.parser import link

    calls = []

    def fake_paginated(client, path, tenant_token, **kwargs):
        calls.append(path)
        if path.endswith("/fields"):
            return [{"field_name": "角色"}, {"field_name": "职责"}]
        return [{"fields": {"角色": "财务", "职责": "审核付款"}}]

    monkeypatch.setattr(link, "request_feishu_api_paginated", fake_paginated)
    markdown = link.parse_feishu_embedded_bitable(object(), "tenant", "appToken_tableId")

    assert calls == [
        "/bitable/v1/apps/appToken/tables/tableId/fields",
        "/bitable/v1/apps/appToken/tables/tableId/records",
    ]
    assert "| 角色 | 职责 |" in markdown
    assert "| 财务 | 审核付款 |" in markdown
