"""Юнит-тесты вспомогательных функций демо-чекаута (без HTTP)."""

from app.services.checkout import _berth_label, _normalize_car, _parse_seat


def test_normalize_car_digit_padding():
    assert _normalize_car("5", "09") == "05"
    assert _normalize_car("12", "01") == "12"


def test_normalize_car_fallback():
    assert _normalize_car("", "03") == "03"
    assert _normalize_car(None, "07") == "07"


def test_parse_seat_extracts_digits():
    assert _parse_seat("Место 12А") == "012"
    assert _parse_seat("042") == "042"


def test_parse_seat_no_digits_returns_trimmed():
    assert _parse_seat("ABC") == "ABC"


def test_berth_label_ru_en():
    assert _berth_label("upper", "ru") == "верхняя полка"
    assert _berth_label("upper", "en") == "upper berth"
