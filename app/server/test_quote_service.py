"""弹语轮换与安全过滤的离线回归测试。"""
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from . import quote_service


def _quote(quote_id, flags=None, *, slug="test", author="测试哲学家"):
    return {
        "id": quote_id,
        "slug": slug,
        "author": author,
        "text": quote_id,
        "text_kind": "literal_translation",
        "translation_reviewed": True,
        "translation_review_sha256": "0" * 64,
        "paraphrase": False,
        "content_flags": flags or [],
        "dilemma_tags": [],
    }


class QuoteServiceTest(unittest.TestCase):
    def _select(self, quotes, shown, last, *, low_mood=False, crisis=False):
        pkg = SimpleNamespace(quotes=quotes)
        tax = SimpleNamespace(self_tag_ids=set())
        with (
            patch.object(quote_service.engine, "load_package", return_value=pkg),
            patch.object(quote_service.engine, "load_taxonomy", return_value=tax),
            patch.object(quote_service.memory, "self_tag_majority", return_value=low_mood),
            patch.object(quote_service.memory, "had_crisis_since", return_value=crisis),
            patch.object(quote_service.memory, "recently_shown_quote_ids", return_value=set(shown)),
            patch.object(quote_service.memory, "last_shown_quote_id", return_value=last),
            patch.object(quote_service.memory, "recent_tag_freq", return_value={}),
            patch.object(quote_service.memory, "mark_quote_shown") as mark,
        ):
            result = quote_service.select("test-user", "test")
        return result, mark

    def test_starts_new_cycle_without_repeating_previous_quote(self):
        result, mark = self._select(
            [_quote("a"), _quote("b"), _quote("c")],
            shown={"a", "b", "c"},
            last="b",
        )

        self.assertIn(result["id"], {"a", "c"})
        mark.assert_called_once_with("test-user", f"test:{result['id']}")

    def test_new_cycle_does_not_reintroduce_blocked_content(self):
        result, _mark = self._select(
            [_quote("safe"), _quote("blocked", ["mortality"])],
            shown={"safe"},
            last="blocked",
            crisis=True,
        )

        self.assertEqual(result["id"], "safe")

    def test_rejects_editorial_or_unreviewed_popup_text(self):
        editorial = _quote("editorial")
        editorial["text_kind"] = "editorial_paraphrase"
        unreviewed = _quote("unreviewed")
        unreviewed["translation_reviewed"] = False
        paraphrase = _quote("paraphrase")
        paraphrase["paraphrase"] = True
        result, _mark = self._select([
            editorial, unreviewed, paraphrase, _quote("literal"),
        ], shown=set(), last=None)

        self.assertEqual(result["id"], "literal")
        self.assertEqual(result["text_kind"], "literal_translation")

    def test_accepts_verified_source_original_and_rejects_modified_copy(self):
        source = _quote("source")
        source.update({
            "text": "知之者不如好之者。",
            "quote": "知之者不如好之者。",
            "text_kind": "source_original",
            "source_text_verified": True,
        })
        modified = {**source, "id": "modified", "text": "懂得不如喜好。"}

        result, _mark = self._select(
            [modified, source], shown=set(), last=None
        )

        self.assertEqual(result["id"], "source")
        self.assertEqual(result["text"], result["quote"])

    def test_omitted_slug_draws_from_all_configured_philosophers(self):
        packages = {
            "alpha": SimpleNamespace(quotes=[_quote("a", slug="alpha", author="甲")]),
            # 模拟旧构建文件残留了错误的作者和 slug；运行时必须按包身份纠正。
            "beta": SimpleNamespace(quotes=[_quote("b", slug="alpha", author="甲")]),
        }
        tax = SimpleNamespace(self_tag_ids=set())
        with (
            patch.object(quote_service.config, "QUOTE_SLUGS", ("alpha", "beta")),
            patch.object(quote_service.config, "QUOTE_AUTHORS", {"alpha": "甲", "beta": "乙"}),
            patch.object(quote_service.engine, "load_package", side_effect=packages.get),
            patch.object(quote_service.engine, "load_taxonomy", return_value=tax),
            patch.object(quote_service.memory, "self_tag_majority", return_value=False),
            patch.object(quote_service.memory, "had_crisis_since", return_value=False),
            patch.object(quote_service.memory, "recently_shown_quote_ids", return_value=set()),
            patch.object(quote_service.memory, "recent_tag_freq", return_value={}),
            patch.object(quote_service.random, "choice", side_effect=lambda quotes: quotes[-1]),
            patch.object(quote_service.memory, "mark_quote_shown") as mark,
        ):
            result = quote_service.select("test-user")

        self.assertEqual(result["slug"], "beta")
        self.assertEqual(result["author"], "乙")
        mark.assert_called_once_with("test-user", "beta:b")


if __name__ == "__main__":
    unittest.main()
