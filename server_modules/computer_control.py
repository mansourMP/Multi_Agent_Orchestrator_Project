from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


_CLIPBOARD_FALLBACK_TEXT = ""


def _coerce_region(region: Any) -> Optional[Tuple[int, int, int, int]]:
    if region is None:
        return None
    if isinstance(region, dict):
        try:
            x = int(region.get("x"))
            y = int(region.get("y"))
            width = int(region.get("width"))
            height = int(region.get("height"))
            return (x, y, width, height)
        except Exception:
            return None
    if isinstance(region, (list, tuple)) and len(region) == 4:
        try:
            return tuple(int(value) for value in region)  # type: ignore[return-value]
        except Exception:
            return None
    return None


def _import_pyautogui():
    import pyautogui  # type: ignore[import-not-found]

    pyautogui.FAILSAFE = True
    pyautogui.PAUSE = 0.05
    return pyautogui


def _import_pyperclip():
    import pyperclip  # type: ignore[import-not-found]

    return pyperclip


def _import_psutil():
    import psutil  # type: ignore[import-not-found]

    return psutil


def _import_pytesseract():
    import pytesseract  # type: ignore[import-not-found]

    return pytesseract


def _capture_screenshot_image(region: Any = None):
    pyautogui = _import_pyautogui()
    normalized_region = _coerce_region(region)
    return pyautogui.screenshot(region=normalized_region)


def _applescript_string(value: Any) -> str:
    raw = str(value or "")
    return raw.replace("\\", "\\\\").replace('"', '\\"')


def _clipboard_read_fallback() -> str:
    if sys.platform == "darwin":
        completed = subprocess.run(
            ["pbpaste"],
            capture_output=True,
            text=True,
            check=False,
        )
        if completed.returncode != 0:
            raise RuntimeError(str(completed.stderr or completed.stdout or "Clipboard read failed.").strip())
        return str(completed.stdout or "")
    raise RuntimeError("Clipboard read fallback is only implemented for macOS.")


def _clipboard_write_fallback(text: str) -> None:
    if sys.platform == "darwin":
        completed = subprocess.run(
            ["pbcopy"],
            input=str(text or ""),
            capture_output=True,
            text=True,
            check=False,
        )
        if completed.returncode != 0:
            raise RuntimeError(str(completed.stderr or completed.stdout or "Clipboard write failed.").strip())
        return
    raise RuntimeError("Clipboard write fallback is only implemented for macOS.")


def screen_ocr(region: Any = None) -> str:
    pytesseract = _import_pytesseract()
    if not shutil.which("tesseract"):
        raise RuntimeError("tesseract is not installed on this machine.")
    image = _capture_screenshot_image(region=region)
    text = str(pytesseract.image_to_string(image) or "").strip()
    return text


def mouse_click(x: Any, y: Any) -> str:
    pyautogui = _import_pyautogui()
    click_x = int(x)
    click_y = int(y)
    pyautogui.click(x=click_x, y=click_y)
    return f"Clicked at ({click_x}, {click_y})."


def click_element_by_text(text: str) -> str:
    target = str(text or "").strip()
    if not target:
        raise RuntimeError("Text is required.")
    pytesseract = _import_pytesseract()
    if not shutil.which("tesseract"):
        raise RuntimeError("tesseract is not installed on this machine.")
    image = _capture_screenshot_image()
    data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)
    if not isinstance(data, dict):
        raise RuntimeError("OCR output was invalid.")
    matches: List[Tuple[int, int]] = []
    texts = data.get("text") if isinstance(data.get("text"), list) else []
    lefts = data.get("left") if isinstance(data.get("left"), list) else []
    tops = data.get("top") if isinstance(data.get("top"), list) else []
    widths = data.get("width") if isinstance(data.get("width"), list) else []
    heights = data.get("height") if isinstance(data.get("height"), list) else []
    normalized_target = target.lower()
    for index, raw_text in enumerate(texts):
        candidate = str(raw_text or "").strip()
        if not candidate:
            continue
        normalized_candidate = candidate.lower()
        if normalized_target not in normalized_candidate and normalized_candidate not in normalized_target:
            continue
        try:
            center_x = int(lefts[index]) + int(widths[index]) // 2
            center_y = int(tops[index]) + int(heights[index]) // 2
        except Exception:
            continue
        matches.append((center_x, center_y))
    if not matches:
        raise RuntimeError(f"Could not find visible text matching '{target}'.")
    click_x, click_y = matches[0]
    return mouse_click(click_x, click_y)


def keyboard_type(text: str) -> str:
    payload = str(text or "")
    if not payload:
        raise RuntimeError("Text is required.")
    pyautogui = _import_pyautogui()
    pyautogui.write(payload, interval=0.01)
    return f"Typed {len(payload)} characters."


def run_applescript(script: str) -> str:
    if sys.platform != "darwin":
        raise RuntimeError("AppleScript is only available on macOS.")
    payload = str(script or "").strip()
    if not payload:
        raise RuntimeError("AppleScript is required.")
    completed = subprocess.run(
        ["osascript", "-e", payload],
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(str(completed.stderr or completed.stdout or "AppleScript failed.").strip())
    return str(completed.stdout or "").strip()


def read_clipboard() -> str:
    global _CLIPBOARD_FALLBACK_TEXT
    try:
        text = str(_import_pyperclip().paste() or "")
        if text:
            _CLIPBOARD_FALLBACK_TEXT = text
        return text
    except Exception:
        try:
            text = _clipboard_read_fallback()
            _CLIPBOARD_FALLBACK_TEXT = text
            return text
        except Exception:
            return _CLIPBOARD_FALLBACK_TEXT


def write_clipboard(text: str) -> str:
    global _CLIPBOARD_FALLBACK_TEXT
    payload = str(text or "")
    _CLIPBOARD_FALLBACK_TEXT = payload
    try:
        _import_pyperclip().copy(payload)
    except Exception:
        try:
            _clipboard_write_fallback(payload)
        except Exception:
            pass
    return "Clipboard updated."


def send_notification(title: str, message: str) -> str:
    resolved_title = str(title or "").strip() or "Empyralist"
    resolved_message = str(message or "").strip() or "Task completed."
    if sys.platform == "darwin":
        script = (
            f'display notification "{_applescript_string(resolved_message)}" '
            f'with title "{_applescript_string(resolved_title)}"'
        )
        subprocess.run(["osascript", "-e", script], capture_output=True, text=True, check=False)
        return "Notification sent."
    if shutil.which("notify-send"):
        subprocess.run(["notify-send", resolved_title, resolved_message], capture_output=True, text=True, check=False)
        return "Notification sent."
    raise RuntimeError("System notifications are not supported on this machine.")


def speak_text(text: str, voice: Optional[str] = None) -> str:
    payload = str(text or "").strip()
    if not payload:
        raise RuntimeError("Text is required.")
    selected_voice = str(voice or "").strip()
    if sys.platform == "darwin":
        command = ["say"]
        if selected_voice:
            command.extend(["-v", selected_voice])
        command.append(payload)
        subprocess.run(command, capture_output=True, text=True, check=False)
        return "Spoken aloud."
    if shutil.which("espeak"):
        command = ["espeak"]
        if selected_voice:
            command.extend(["-v", selected_voice])
        command.append(payload)
        subprocess.run(command, capture_output=True, text=True, check=False)
        return "Spoken aloud."
    raise RuntimeError("System text-to-speech is not supported on this machine.")


def list_running_apps() -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    try:
        psutil = _import_psutil()
        iterator = psutil.process_iter(attrs=["pid", "name", "exe"])
    except Exception:
        iterator = []
    try:
        for process in iterator:
            try:
                info = process.info if isinstance(process.info, dict) else {}
                items.append(
                    {
                        "pid": int(info.get("pid") or 0),
                        "name": str(info.get("name") or "").strip(),
                        "exe": str(info.get("exe") or "").strip(),
                    }
                )
            except Exception:
                continue
    except PermissionError:
        items = []
    if not items:
        try:
            completed = subprocess.run(
                ["ps", "-ax", "-o", "pid=,comm="],
                capture_output=True,
                text=True,
                check=False,
            )
            if completed.returncode == 0:
                for line in str(completed.stdout or "").splitlines():
                    stripped = line.strip()
                    if not stripped:
                        continue
                    parts = stripped.split(None, 1)
                    if not parts:
                        continue
                    pid = int(parts[0]) if parts[0].isdigit() else 0
                    command = parts[1].strip() if len(parts) > 1 else ""
                    name = Path(command).name if command else ""
                    items.append({"pid": pid, "name": name, "exe": command})
        except Exception:
            pass
    items.sort(key=lambda item: (str(item.get("name") or "").lower(), int(item.get("pid") or 0)))
    return items


def launch_app(name_or_path: str) -> str:
    target = str(name_or_path or "").strip()
    if not target:
        raise RuntimeError("App name or path is required.")
    if sys.platform == "darwin":
        if Path(target).expanduser().exists():
            subprocess.Popen(["open", str(Path(target).expanduser())])
        else:
            subprocess.Popen(["open", "-a", target])
        return f"Launched {target}."
    if os.name == "nt":
        os.startfile(target)  # type: ignore[attr-defined]
        return f"Launched {target}."
    subprocess.Popen([target])
    return f"Launched {target}."
