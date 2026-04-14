import unittest

from server_modules import conversation_memory_policy


class ConversationMemoryPolicyTests(unittest.TestCase):
    def test_direct_chat_profile_uses_canonical_budget(self) -> None:
        profile = conversation_memory_policy.get_memory_policy_profile(
            conversation_memory_policy.DIRECT_CHAT_PROFILE
        )

        self.assertEqual(profile.max_prompt_tokens, 8000)
        self.assertEqual(profile.preserve_last_messages, 10)
        self.assertEqual(profile.max_recent_log_days, 7)

    def test_external_channel_profile_uses_shared_channel_budget(self) -> None:
        profile = conversation_memory_policy.get_memory_policy_profile(
            conversation_memory_policy.EXTERNAL_CHANNEL_CUSTOMER_PROFILE
        )

        self.assertEqual(profile.max_prompt_tokens, 1100)
        self.assertEqual(profile.preserve_last_messages, 8)
        self.assertEqual(profile.summary_trigger_messages, 12)


if __name__ == "__main__":
    unittest.main()
