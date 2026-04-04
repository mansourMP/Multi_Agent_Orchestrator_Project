import tempfile
import unittest
from pathlib import Path

from server_modules import no_provider_service


def _compact_text(value):
    import re

    return re.sub(r"\s+", " ", str(value or "").strip()).lower()


def _extract_first_path_reference(value: str) -> str:
    import re

    match = re.search(r"([A-Za-z0-9_./-]+\.[A-Za-z0-9_./-]+)", str(value or ""))
    return str(match.group(1) or "").strip() if match else ""


def _extract_first_url(value: str) -> str:
    import re

    match = re.search(r"https?://[^\s)]+", str(value or ""))
    return str(match.group(0) or "").strip() if match else ""


def _safe_positive_int(value, default: int) -> int:
    try:
        parsed = int(str(value or "").strip())
    except Exception:
        return default
    return parsed if parsed > 0 else default


class NoProviderServiceTests(unittest.TestCase):
    def test_extract_shell_command_supports_short_run_prefix(self) -> None:
        command = no_provider_service.extract_shell_command(
            "Run: echo hello world",
            compact_text=_compact_text,
            extract_first_url=_extract_first_url,
        )
        self.assertEqual(command, "echo hello world")

    def test_extract_web_query_supports_search_prompt(self) -> None:
        query = no_provider_service.extract_web_query("Search for today's top AI news headline")
        self.assertEqual(query, "today's top AI news headline")

    def test_parse_http_tool_output_returns_json_payload(self) -> None:
        parsed = no_provider_service.parse_http_tool_output('HTTP 200\n\n{"origin":"203.0.113.9"}')
        self.assertEqual(parsed, {"origin": "203.0.113.9"})

    def test_count_definitions_in_file_handles_function_and_class_counts(self) -> None:
        with tempfile.TemporaryDirectory(prefix="no-provider-service-file-") as tmpdir:
            root = Path(tmpdir)
            source_path = root / "example.py"
            source_path.write_text(
                "def alpha():\n    return 1\n\nclass Example:\n    pass\n",
                encoding="utf-8",
            )

            reply = no_provider_service.count_definitions_in_file(
                f"Read {source_path} and count functions and classes",
                compact_text=_compact_text,
                extract_first_path_reference=_extract_first_path_reference,
                resolve_local_path=Path,
            )

        self.assertIn("1 functions", str(reply))
        self.assertIn("1 classes", str(reply))

    def test_count_functions_and_write_summary_writes_output_file(self) -> None:
        with tempfile.TemporaryDirectory(prefix="no-provider-service-summary-") as tmpdir:
            root = Path(tmpdir)
            source_dir = root / "src"
            source_dir.mkdir(parents=True, exist_ok=True)
            output_path = root / "summary.txt"
            (source_dir / "a.py").write_text("def a():\n    return 1\n", encoding="utf-8")
            (source_dir / "b.py").write_text("async def b():\n    return 2\n", encoding="utf-8")

            reply = no_provider_service.count_functions_and_write_summary(
                f"Read all .py files in {source_dir} and count functions, write a summary to {output_path}",
                compact_text=_compact_text,
                resolve_local_path=Path,
            )

            written = output_path.read_text(encoding="utf-8")

        self.assertIn("Counted 2 functions", str(reply))
        self.assertIn("Functions found: 2", written)

    def test_list_directory_respects_first_n(self) -> None:
        with tempfile.TemporaryDirectory(prefix="no-provider-service-list-") as tmpdir:
            root = Path(tmpdir)
            (root / "alpha.txt").write_text("a", encoding="utf-8")
            (root / "beta.txt").write_text("b", encoding="utf-8")
            (root / "gamma.txt").write_text("c", encoding="utf-8")

            result = no_provider_service.list_directory(
                f"List the first 2 files in {root}",
                safe_positive_int=_safe_positive_int,
                resolve_local_path=Path,
            )

        self.assertEqual(result["limit"], 2)
        self.assertEqual(result["listing"], "alpha.txt\nbeta.txt")

    def test_looks_like_directory_listing_request_is_syntactic_only(self) -> None:
        self.assertTrue(
            no_provider_service.looks_like_directory_listing_request("List the first 2 files in /tmp/does-not-need-to-exist")
        )
        self.assertFalse(no_provider_service.looks_like_directory_listing_request("Explain the tradeoffs between SQLite and Postgres"))


if __name__ == "__main__":
    unittest.main()
