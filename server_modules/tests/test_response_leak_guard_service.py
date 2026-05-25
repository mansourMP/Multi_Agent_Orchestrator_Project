from server_modules import response_leak_guard_service


def test_guard_model_response_redacts_secret_tokens() -> None:
    result = response_leak_guard_service.guard_model_response("Use Bearer abcdef1234567890 and sk-testsecret123")

    assert result.redacted is True
    assert "Bearer [redacted]" in result.text
    assert "[redacted-secret]" in result.text
    assert "secret_pattern" in result.findings


def test_guard_model_response_marks_red_private_context() -> None:
    result = response_leak_guard_service.guard_model_response("Sensitivity: RED\nRAW_MEMORY: customer private note")

    assert result.redacted is True
    assert "red_sensitivity_label" in result.findings
    assert "private_memory_marker" in result.findings
    assert "RAW_MEMORY" not in result.text


def test_guard_model_response_removes_internal_tool_markup() -> None:
    result = response_leak_guard_service.guard_model_response(
        "Let me check.\n<||DSML||tool_calls><||DSML||invoke name=\"bash\">secret command</||DSML||invoke>"
    )

    assert result.redacted is True
    assert "internal_tool_markup" in result.findings
    assert result.text == "Let me check."
    assert "DSML" not in result.text
