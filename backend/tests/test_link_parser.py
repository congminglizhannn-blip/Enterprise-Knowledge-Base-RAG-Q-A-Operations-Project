from app.services.parser.link import extract_feishu_token, extract_html_text, extract_html_title, extract_text_from_docx_block, is_feishu_url, rows_to_text


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
    assert "【Sheet1】" in text
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
