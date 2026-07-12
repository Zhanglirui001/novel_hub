import unittest
from datetime import date

from app.services.checkin_service import CheckinService


class CheckinServiceTests(unittest.TestCase):
    def test_can_check_in_requires_at_least_one_completed_todo(self):
        self.assertFalse(CheckinService.can_check_in(0, 0))
        self.assertFalse(CheckinService.can_check_in(2, 1))
        self.assertTrue(CheckinService.can_check_in(1, 1))
        self.assertTrue(CheckinService.can_check_in(3, 3))

    def test_current_streak_counts_consecutive_days_from_today(self):
        today = date(2026, 7, 12)
        streak = CheckinService._current_streak(
            [date(2026, 7, 12), date(2026, 7, 11), date(2026, 7, 10)],
            today,
        )
        self.assertEqual(streak, 3)

    def test_current_streak_requires_today_and_stops_at_gap(self):
        today = date(2026, 7, 12)
        self.assertEqual(CheckinService._current_streak([date(2026, 7, 11)], today), 0)
        self.assertEqual(
            CheckinService._current_streak([date(2026, 7, 12), date(2026, 7, 10)], today),
            1,
        )

    def test_current_streak_ignores_duplicate_dates(self):
        today = date(2026, 7, 12)
        streak = CheckinService._current_streak(
            [date(2026, 7, 12), date(2026, 7, 12), date(2026, 7, 11)],
            today,
        )
        self.assertEqual(streak, 2)

    def test_parse_day_and_month_require_iso_values(self):
        self.assertEqual(CheckinService._parse_day("2026-07-12"), date(2026, 7, 12))
        self.assertEqual(CheckinService._parse_month("2026-07"), date(2026, 7, 1))
        with self.assertRaises(ValueError):
            CheckinService._parse_day("2026/07/12")
        with self.assertRaises(ValueError):
            CheckinService._parse_month("July 2026")

    def test_month_end_handles_regular_and_december_months(self):
        self.assertEqual(CheckinService._month_end(date(2026, 7, 1)), date(2026, 8, 1))
        self.assertEqual(CheckinService._month_end(date(2026, 12, 1)), date(2027, 1, 1))

    def test_parse_day_and_month_require_iso_values(self):
        self.assertEqual(CheckinService._parse_day("2026-07-12"), date(2026, 7, 12))
        self.assertEqual(CheckinService._parse_month("2026-07"), date(2026, 7, 1))
        with self.assertRaises(ValueError):
            CheckinService._parse_day("2026/07/12")
        with self.assertRaises(ValueError):
            CheckinService._parse_month("July 2026")

    def test_month_end_handles_regular_and_december_months(self):
        self.assertEqual(CheckinService._month_end(date(2026, 7, 1)), date(2026, 8, 1))
        self.assertEqual(CheckinService._month_end(date(2026, 12, 1)), date(2027, 1, 1))


if __name__ == "__main__":
    unittest.main()
