from __future__ import annotations

from unittest.mock import patch

from server_modules.computer_control import (
    list_running_apps,
    read_clipboard,
    run_applescript,
    send_notification,
    speak_text,
    write_clipboard,
)


def test_clipboard_read_write():
    with patch("server_modules.computer_control.supervisor_client.clipboard_read", return_value={"text": "original"}):
        original = read_clipboard()
    with patch("server_modules.computer_control.supervisor_client.clipboard_write", return_value={"written": True}):
        write_clipboard("empyralist-test-clipboard")
    with patch("server_modules.computer_control.supervisor_client.clipboard_read", return_value={"text": "empyralist-test-clipboard"}):
        assert read_clipboard() == "empyralist-test-clipboard"
    with patch("server_modules.computer_control.supervisor_client.clipboard_write", return_value={"written": True}):
        write_clipboard(original)


def test_applescript_returns_output():
    with patch("server_modules.computer_control.supervisor_client.run_applescript", return_value={"output": "ok"}):
        output = run_applescript('return "ok"')

    assert output == "ok"


def test_notify_does_not_crash():
    with patch("server_modules.computer_control.supervisor_client.notify", return_value={"sent": True}):
        result = send_notification("Empyralist", "done")

    assert result == "Notification sent."


def test_speak_text_does_not_crash():
    with patch("server_modules.computer_control.supervisor_client.speak", return_value={"spoken": True}):
        result = speak_text("hello")

    assert result == "Spoken aloud."


def test_list_apps_returns_list():
    with patch(
        "server_modules.computer_control.supervisor_client.list_apps",
        return_value={"windows": [{"pid": 1, "name": "Safari", "exe": "/Applications/Safari.app"}]},
    ):
        apps = list_running_apps()
    assert isinstance(apps, list)
    if apps:
        first = apps[0]
        assert isinstance(first, dict)
        assert "pid" in first
        assert "name" in first
        assert "exe" in first
