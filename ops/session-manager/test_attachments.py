#!/usr/bin/env python3
import base64
import os
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(__file__))
import session_manager as sm


class TestAttachmentSanitizer(unittest.TestCase):
    def test_strips_directory_paths(self):
        # Path traversal attempts
        self.assertEqual(sm.sanitize_filename("/etc/passwd"), "passwd")
        self.assertEqual(sm.sanitize_filename("../../etc/shadow"), "shadow")
        self.assertEqual(sm.sanitize_filename("..\\..\\windows\\system32.dll"), "system32.dll")
        self.assertEqual(sm.sanitize_filename("../../../root/.ssh/id_rsa"), "id_rsa")

    def test_allows_only_safe_characters(self):
        # Only [A-Za-z0-9._ -] allowed
        self.assertEqual(sm.sanitize_filename("bad;rm -rf;file.txt"), "bad_rm -rf_file.txt")
        self.assertEqual(sm.sanitize_filename("test$(whoami).png"), "test__whoami_.png")
        self.assertEqual(sm.sanitize_filename("foo*bar?baz.md"), "foo_bar_baz.md")

    def test_handles_empty_dots_and_spaces(self):
        self.assertEqual(sm.sanitize_filename(".."), "file")
        self.assertEqual(sm.sanitize_filename("."), "file")
        self.assertEqual(sm.sanitize_filename("..."), "file")
        self.assertEqual(sm.sanitize_filename("   "), "file")
        self.assertEqual(sm.sanitize_filename(None), "file")

    def test_deduplicates_filenames(self):
        existing = {"note.txt", "note_1.txt"}
        self.assertEqual(sm.sanitize_filename("note.txt", existing), "note_2.txt")
        self.assertEqual(sm.sanitize_filename("other.txt", existing), "other.txt")


class TestSaveAttachments(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.sid = "test-attach-session-12345"
        self.session_dir = os.path.join(self.tmp_dir.name, self.sid)
        os.makedirs(self.session_dir, exist_ok=True)
        self.env_patch = patch.dict(os.environ, {"SESSION_DATA": self.tmp_dir.name})
        self.env_patch.start()

    def tearDown(self):
        self.env_patch.stop()
        self.tmp_dir.cleanup()

    def test_saves_valid_attachments(self):
        content = b"console.log('hello world');"
        data_url = "data:text/plain;base64," + base64.b64encode(content).decode()
        attachments = [
            {"filename": "test.js", "dataUrl": data_url},
            {"filename": "test.js", "dataUrl": data_url},
        ]
        saved = sm.save_attachments(self.sid, attachments)
        self.assertEqual(saved, ["test.js", "test_1.js"])

        uploads_dir = os.path.join(self.session_dir, "uploads")
        self.assertTrue(os.path.isdir(uploads_dir))
        self.assertTrue(os.path.isfile(os.path.join(uploads_dir, "test.js")))
        self.assertTrue(os.path.isfile(os.path.join(uploads_dir, "test_1.js")))
        with open(os.path.join(uploads_dir, "test.js"), "rb") as f:
            self.assertEqual(f.read(), content)

    def test_rejects_file_over_10mb(self):
        oversized = b"x" * (10 * 1024 * 1024 + 1)
        data_url = "data:application/octet-stream;base64," + base64.b64encode(oversized).decode()
        with self.assertRaises(ValueError) as ctx:
            sm.save_attachments(self.sid, [{"filename": "big.bin", "dataUrl": data_url}])
        self.assertIn("10 MB", str(ctx.exception))

    def test_rejects_total_over_20mb(self):
        six_mb = b"y" * (6 * 1024 * 1024)
        b64 = "data:application/octet-stream;base64," + base64.b64encode(six_mb).decode()
        # 4 files of 6 MB = 24 MB (> 20 MB)
        attachments = [{"filename": f"f{i}.bin", "dataUrl": b64} for i in range(4)]
        with self.assertRaises(ValueError) as ctx:
            sm.save_attachments(self.sid, attachments)
        self.assertIn("20 MB", str(ctx.exception))

    def test_escaped_filename_never_leaves_uploads_dir(self):
        content = b"malicious content"
        data_url = "data:text/plain;base64," + base64.b64encode(content).decode()
        # Attempt to write outside uploads
        saved = sm.save_attachments(self.sid, [{"filename": "../../escaped.txt", "dataUrl": data_url}])
        self.assertEqual(saved, ["escaped.txt"])
        uploads_dir = os.path.join(self.session_dir, "uploads")
        self.assertTrue(os.path.isfile(os.path.join(uploads_dir, "escaped.txt")))
        self.assertFalse(os.path.exists(os.path.join(self.session_dir, "escaped.txt")))
        self.assertFalse(os.path.exists(os.path.join(self.tmp_dir.name, "escaped.txt")))


if __name__ == "__main__":
    unittest.main()
