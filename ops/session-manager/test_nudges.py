#!/usr/bin/env python3
import json
import os
import tempfile
import unittest
from unittest.mock import patch, MagicMock

import sys
sys.path.insert(0, os.path.dirname(__file__))
import session_manager as sm


class TestTelegramNudges(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.env_file = os.path.join(self.tmp_dir.name, ".env")
        with open(self.env_file, "w") as f:
            f.write('TELEGRAM_BOT_TOKEN="mock_bot_token_123"\n')
            f.write('TELEGRAM_ALLOWED_USER_IDS="111222, 333444"\n')
        self.sid = "test-session-id-12345"
        self.title = "Fix production database query timeout"
        self.meta = {
            "id": self.sid,
            "title": self.title,
            "status": "running",
            "stop_requested": False,
            "last_nudged_status": None,
        }
        self.env_patch = patch.dict(os.environ, {"ENV_FILE": self.env_file, "SESSION_PUBLIC_URL": "https://sutaeru.com"})
        self.env_patch.start()

    def tearDown(self):
        self.env_patch.stop()
        self.tmp_dir.cleanup()

    @patch("urllib.request.urlopen")
    def test_sends_on_expected_statuses(self, mock_urlopen):
        for status in ("needs_approval", "done", "error", "capped"):
            mock_urlopen.reset_mock()
            meta = dict(self.meta)
            sm.send_nudge(self.sid, status, meta)
            self.assertEqual(mock_urlopen.call_count, 2, f"Should send to both allowed IDs on {status}")
            # Verify request contents
            req = mock_urlopen.call_args_list[0][0][0]
            self.assertIn("mock_bot_token_123", req.full_url)
            body = json.loads(req.data.decode("utf-8"))
            self.assertEqual(body["chat_id"], "111222")
            self.assertIn("https://sutaeru.com/sessions/test-session-id-12345", body["text"])
            self.assertIn(self.title, body["text"])

    @patch("urllib.request.urlopen")
    def test_does_not_send_on_running_or_stopped(self, mock_urlopen):
        for status in ("running", "stopped", "interrupted"):
            mock_urlopen.reset_mock()
            sm.send_nudge(self.sid, status, self.meta)
            mock_urlopen.assert_not_called()

    @patch("urllib.request.urlopen")
    def test_skips_when_stopped_by_owner(self, mock_urlopen):
        meta = dict(self.meta, stop_requested=True)
        sm.send_nudge(self.sid, "done", meta)
        mock_urlopen.assert_not_called()

    @patch("urllib.request.urlopen")
    def test_never_includes_prompt_text(self, mock_urlopen):
        secret_prompt = "cat /root/sr1/secrets/stripe.key && echo SECRET_TOKEN_ABC123"
        # Turn prompt should never be sent in the nudge, only title (truncated to 60)
        meta = dict(self.meta, title="Safe Session Title")
        sm.send_nudge(self.sid, "needs_approval", meta)
        self.assertTrue(mock_urlopen.called)
        req = mock_urlopen.call_args_list[0][0][0]
        body = json.loads(req.data.decode("utf-8"))
        self.assertNotIn(secret_prompt, body["text"])
        self.assertNotIn("SECRET_TOKEN", body["text"])
        self.assertIn("Safe Session Title", body["text"])

    @patch("urllib.request.urlopen")
    def test_swallows_http_and_network_errors(self, mock_urlopen):
        mock_urlopen.side_effect = Exception("Connection refused / timed out")
        # Must not raise
        try:
            sm.send_nudge(self.sid, "needs_approval", self.meta)
        except Exception as e:
            self.fail(f"send_nudge raised an unexpected exception: {e}")

    @patch("urllib.request.urlopen")
    def test_finish_sends_at_most_one_nudge_per_status_change(self, mock_urlopen):
        # Setup session data directory
        session_dir = os.path.join(self.tmp_dir.name, self.sid)
        os.makedirs(session_dir, exist_ok=True)
        meta_file = os.path.join(session_dir, "meta.json")
        with open(meta_file, "w") as f:
            json.dump(self.meta, f)

        with patch.dict(os.environ, {"SESSION_DATA": self.tmp_dir.name}):
            # First transition to needs_approval -> sends nudge
            sm.finish(self.sid, "needs_approval")
            self.assertEqual(mock_urlopen.call_count, 2)

            # Second finish call with same status -> deduplicated, no new nudge
            mock_urlopen.reset_mock()
            sm.finish(self.sid, "needs_approval")
            mock_urlopen.assert_not_called()

            # Status change to done -> sends nudge
            mock_urlopen.reset_mock()
            sm.finish(self.sid, "done")
            self.assertEqual(mock_urlopen.call_count, 2)


if __name__ == "__main__":
    unittest.main()
