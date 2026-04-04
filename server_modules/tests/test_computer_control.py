from __future__ import annotations

import subprocess
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
    try:
        original = read_clipboard()
    except Exception:
        original = None

    try:
        write_clipboard("empyralist-test-clipboard")
        assert read_clipboard() == "empyralist-test-clipboard"
    finally:
        if original is not None:
            write_clipboard(original)


def test_applescript_returns_output():
    completed = subprocess.CompletedProcess(
        args=["osascript", "-e", 'return "ok"'],
        returncode=0,
        stdout="ok\n",
        stderr="",
    )
    with patch("server_modules.computer_control.sys.platform", "darwin"):
        with patch("server_modules.computer_control.subprocess.run", return_value=completed) as run_mock:
            output = run_applescript('return "ok"')

    assert output == "ok"
    run_mock.assert_called_once()


def test_notify_does_not_crash():
    completed = subprocess.CompletedProcess(
        args=["osascript", "-e", 'display notification "done" with title "Empyralist"'],
        returncode=0,
        stdout="",
        stderr="",
    )
    with patch("server_modules.computer_control.sys.platform", "darwin"):
        with patch("server_modules.computer_control.subprocess.run", return_value=completed) as run_mock:
            result = send_notification("Empyralist", "done")

    assert result == "Notification sent."
    run_mock.assert_called_once()


def test_speak_text_does_not_crash():
    completed = subprocess.CompletedProcess(
        args=["say", "hello"],
        returncode=0,
        stdout="",
        stderr="",
    )
    with patch("server_modules.computer_control.sys.platform", "darwin"):
        with patch("server_modules.computer_control.subprocess.run", return_value=completed) as run_mock:
            result = speak_text("hello")

    assert result == "Spoken aloud."
    run_mock.assert_called_once()


def test_list_apps_returns_list():
    apps = list_running_apps()
    assert isinstance(apps, list)
    if apps:
        first = apps[0]
        assert isinstance(first, dict)
        assert "pid" in first
        assert "name" in first
        assert "exe" in first
