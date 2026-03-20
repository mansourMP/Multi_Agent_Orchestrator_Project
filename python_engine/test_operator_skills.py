import os
import shutil
import subprocess
import tempfile
import unittest

from operator_skills import OperatorSkillRegistry


class TestOperatorSkills(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        with open(os.path.join(self.root, "alpha.txt"), "w", encoding="utf-8") as f:
            f.write("alpha\n")
        os.makedirs(os.path.join(self.root, "dir1"), exist_ok=True)
        self.skills = OperatorSkillRegistry()

    def tearDown(self):
        self.tmp.cleanup()

    def test_pwd_skill(self):
        out = self.skills.execute("pwd", root=self.root, timeout_seconds=5.0, max_output_chars=1000)
        self.assertTrue(out["handled"])
        result = out["result"]
        self.assertEqual(result["skill"], "fs.pwd")
        self.assertEqual(result["status"], "done")
        self.assertIn(self.root, result["stdout_excerpt"])

    def test_ls_skill(self):
        out = self.skills.execute("ls", root=self.root, timeout_seconds=5.0, max_output_chars=1000)
        self.assertTrue(out["handled"])
        result = out["result"]
        self.assertEqual(result["skill"], "fs.ls")
        self.assertEqual(result["status"], "done")
        self.assertIn("alpha.txt", result["stdout_excerpt"])
        self.assertIn("dir1/", result["stdout_excerpt"])

    def test_ls_escape_blocked(self):
        out = self.skills.execute("ls ../", root=self.root, timeout_seconds=5.0, max_output_chars=1000)
        self.assertTrue(out["handled"])
        result = out["result"]
        self.assertEqual(result["status"], "blocked")
        self.assertIn("path escapes operator root", result.get("one_line_summary", ""))

    def test_unknown_is_unhandled(self):
        out = self.skills.execute("echo hello", root=self.root, timeout_seconds=5.0, max_output_chars=1000)
        self.assertFalse(out["handled"])
        self.assertEqual(out["reason"], "unsupported skill command")

    def test_git_status_skill_when_git_available(self):
        if shutil.which("git") is None:
            self.skipTest("git not available")
        subprocess.run(["git", "init"], cwd=self.root, check=True, capture_output=True, text=True)
        out = self.skills.execute("git status --short", root=self.root, timeout_seconds=10.0, max_output_chars=2000)
        self.assertTrue(out["handled"])
        result = out["result"]
        self.assertEqual(result["skill"], "git.status")
        self.assertIn(result["status"], {"done", "failed"})


if __name__ == "__main__":
    unittest.main()

