#!/usr/bin/env python3
import json
import os
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(__file__))
import session_manager as sm


class TestFullMode(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.sid = "test-full-session-12345"
        self.session_dir = os.path.join(self.tmp_dir.name, self.sid)
        os.makedirs(self.session_dir, exist_ok=True)
        self.env_patch = patch.dict(os.environ, {"SESSION_DATA": self.tmp_dir.name})
        self.env_patch.start()

    def tearDown(self):
        self.env_patch.stop()
        self.tmp_dir.cleanup()

    def test_full_mode_configuration(self):
        self.assertIn("full", sm.MODES)
        self.assertEqual(sm.MODES["full"], ["--permission-mode", "bypassPermissions"])

    def test_build_cmd_full_mode_keeps_deny_rules(self):
        meta = {
            "mode": "full",
            "budget_usd": 3.0,
            "approved_tools": [],
            "add_dirs": [],
        }
        cmd = sm.build_cmd(meta, "hello", {}, None)
        self.assertIn("--permission-mode", cmd)
        self.assertIn("bypassPermissions", cmd)
        self.assertNotIn("--allowedTools", cmd)
        self.assertIn("--disallowedTools", cmd)
        disallowed_idx = cmd.index("--disallowedTools") + 1
        disallowed_str = cmd[disallowed_idx]
        self.assertIn("Read(//root/sr1/.env)", disallowed_str)
        self.assertIn("Read(//root/.ssh/**)", disallowed_str)
        self.assertIn("Bash(rm -rf /*)", disallowed_str)

    @patch("session_manager.start_turn")
    def test_create_full_mode_has_no_default_spend_cap(self, mock_start_turn):
        body = {
            "prompt": "Full mode task",
            "mode": "full",
            "cwd": "/root/sr1",
        }
        meta = sm.create(body)
        self.assertEqual(meta["mode"], "full")
        self.assertEqual(meta["budget_usd"], 0.0)

    def test_full_mode_timeout_after_30_minutes(self):
        meta = {
            "id": self.sid,
            "title": "Full session",
            "cwd": "/root/sr1",
            "mode": "full",
            "status": "running",
            "created": time.time() - 1801,  # 30 minutes and 1 second ago
            "updated": time.time(),
            "spent_usd": 0.0,
            "budget_usd": 3.0,
        }
        with open(os.path.join(self.session_dir, "meta.json"), "w") as f:
            json.dump(meta, f)

        sm.run_turn(self.sid, "Do something")

        # Verify session marked as error and emitted timeout
        updated_meta = sm.read_meta(self.sid)
        self.assertEqual(updated_meta["status"], "error")

        events = sm.read_events(self.sid, 0)
        timeout_evs = [e for e in events if "timed out after 30 minutes" in str(e.get("text", ""))]
        self.assertTrue(len(timeout_evs) > 0, "Should emit timeout error event")


if __name__ == "__main__":
    unittest.main()
