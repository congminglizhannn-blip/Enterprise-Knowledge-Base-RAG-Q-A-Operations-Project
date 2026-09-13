from app.services.chat_service import build_prompt, is_flow_question


def test_flow_question_adds_mermaid_rule() -> None:
    prompt = build_prompt("科技成果转化全流程怎么走？", [])

    assert is_flow_question("科技成果转化全流程怎么走？")
    assert "Mermaid 流程图代码块" in prompt
    assert "流程图节点不超过 10 个" in prompt
    assert "```mermaid" in prompt


def test_non_flow_question_does_not_force_mermaid() -> None:
    prompt = build_prompt("这份制度的适用范围是什么？", [])

    assert not is_flow_question("这份制度的适用范围是什么？")
    assert "Mermaid 流程图代码块" not in prompt
