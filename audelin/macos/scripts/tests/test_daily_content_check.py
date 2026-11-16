import importlib.util
import json
import os
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("daily_content_check", os.path.join(HERE, "..", "daily-content-check.py"))
dcc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dcc)

GOOD = """## Что продолжить
- Регресс, agreed. [00:01:40]

## Кто что делает
- Андрей: сборки, suggested. Задача 1776: owner unclear.

## Блокеры и планируемые решения
- Тестировщики молчат: fix unclear.

## Запланированные встречи
- Встречи не обсуждались.
"""


class CheckTests(unittest.TestCase):
    def rows(self, notes, **expect):
        return [row for row, _ in dcc.check("call", notes, expect)]

    def test_good_notes_pass(self):
        self.assertEqual(self.rows(GOOD, owner_unclear=True, fix_unclear=True), [])

    def test_missing_heading_is_s1(self):
        self.assertEqual(self.rows(GOOD.replace("## Запланированные встречи", "## Встречи")), ["S-1"])

    def test_mixed_language_headings_are_s1(self):
        self.assertEqual(self.rows(GOOD.replace("## Что продолжить", "## What to continue")), ["S-1"])

    def test_no_labels_is_s2(self):
        self.assertIn("S-2", self.rows(GOOD.replace("agreed", "").replace("suggested", "")))

    def test_missing_owner_unclear_is_s3(self):
        self.assertEqual(self.rows(GOOD.replace("owner unclear", "Игорь"), owner_unclear=True), ["S-3"])

    def test_missing_fix_unclear_is_s4(self):
        self.assertEqual(self.rows(GOOD.replace("fix unclear", "ждём"), fix_unclear=True), ["S-4"])

    def test_translated_labels_count(self):
        notes = GOOD.replace("owner unclear", "ответственный не ясен").replace("fix unclear", "решение неясно")
        self.assertEqual(self.rows(notes, owner_unclear=True, fix_unclear=True), [])

    def test_joint_russian_label_counts(self):
        notes = GOOD.replace("owner unclear", "").replace("fix unclear", "владелец и решение неясны")
        self.assertEqual(self.rows(notes, owner_unclear=True, fix_unclear=True), [])

    def test_russian_paraphrases_count(self):
        notes = GOOD.replace("agreed", "договорились").replace("suggested", "").replace("owner unclear", "владелец не назван").replace("fix unclear", "решение не названо")
        self.assertEqual(self.rows(notes, owner_unclear=True, fix_unclear=True), [])
        self.assertEqual(self.rows(GOOD.replace("owner unclear", "владелец unclear"), owner_unclear=True), [])
        notes = GOOD.replace("owner unclear", "кто именно будет собирать, неясно")
        self.assertEqual(self.rows(notes, owner_unclear=True), [])

    def test_no_blockers_needs_not_discussed(self):
        notes = GOOD.replace("- Тестировщики молчат: fix unclear.", "- Прочие блокеры не обсуждались.")
        self.assertEqual(self.rows(notes, no_blockers=True), [])
        notes = GOOD.replace("- Тестировщики молчат: fix unclear.", "- Андрей заболел.")
        self.assertEqual(self.rows(notes, no_blockers=True), ["S-5"])

    def test_not_discussed_elsewhere_does_not_count_for_blockers(self):
        notes = GOOD.replace("- Тестировщики молчат: fix unclear.", "- Андрей заболел.")
        self.assertEqual(self.rows(notes, no_blockers=True), ["S-5"])

    def test_bare_none_is_s5(self):
        self.assertEqual(self.rows(GOOD.replace("- Встречи не обсуждались.", "- Нет.")), ["S-5"])
        self.assertEqual(self.rows(GOOD.replace("- Встречи не обсуждались.", "None")), ["S-5"])


class RunTests(unittest.TestCase):
    def test_reports_call_and_row(self):
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "call-1.daily.sonnet.md"), "w", encoding="utf-8") as f:
                f.write(GOOD.replace("fix unclear", "ждём"))
            expect = os.path.join(d, "expect.json")
            with open(expect, "w", encoding="utf-8") as f:
                json.dump({"call-1": {"fix_unclear": True}, "call-2": {}}, f)
            report = os.path.join(d, "report.md")
            self.assertEqual(dcc.main([expect, d, "--report", report]), 1)
            with open(report, encoding="utf-8") as f:
                text = f.read()
            self.assertIn("| call-1 | S-4 |", text)
            self.assertIn("| call-2 | S-1 | no notes were made |", text)

    def test_all_pass(self):
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "call-1.daily.sonnet.md"), "w", encoding="utf-8") as f:
                f.write(GOOD)
            expect = os.path.join(d, "expect.json")
            with open(expect, "w", encoding="utf-8") as f:
                json.dump({"call-1": {"owner_unclear": True, "fix_unclear": True}}, f)
            self.assertEqual(dcc.main([expect, d]), 0)


if __name__ == "__main__":
    unittest.main()
