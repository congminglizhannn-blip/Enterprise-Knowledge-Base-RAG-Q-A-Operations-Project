from app.services.parser.link import extract_feishu_token, extract_html_text, is_feishu_url


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


def test_feishu_url_detection_and_token_extraction() -> None:
    assert is_feishu_url("https://example.feishu.cn/docx/AbCdEf123")
    assert extract_feishu_token("https://example.feishu.cn/docx/AbCdEf123?from=from_copylink") == ("docx", "AbCdEf123")
    assert extract_feishu_token("https://example.feishu.cn/wiki/WiKiToken123") == ("wiki", "WiKiToken123")
