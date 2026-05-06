from __future__ import annotations

from .deepseek_client import DeepSeekClient
from ..models import Recommendation, RecommendRequest, RecommendResponse, TrainOption, TripIntent


def _total_free_seats(train: TrainOption) -> int:
    s = train.available_seats
    return s.platzkart + s.coupe + s.sv


def _min_price(train: TrainOption) -> int:
    """Минимальная цена только по классам, где есть свободные места (данные РЖД)."""

    opts: list[int] = []
    if train.available_seats.platzkart > 0 and train.prices.platzkart is not None:
        opts.append(train.prices.platzkart)
    if train.available_seats.coupe > 0 and train.prices.coupe is not None:
        opts.append(train.prices.coupe)
    if train.available_seats.sv > 0 and train.prices.sv is not None:
        opts.append(train.prices.sv)
    return min(opts) if opts else 999_999


def _hour(time_value: str) -> int:
    """Извлекает час из строки формата HH:MM."""

    return int(time_value.split(":")[0])


def _is_inside_window(time_value: str, start: str, end: str) -> bool:
    """Проверяет попадание времени в простое внутрисуточное окно."""

    value = _hour(time_value) * 60 + int(time_value.split(":")[1])
    left = _hour(start) * 60 + int(start.split(":")[1])
    right = _hour(end) * 60 + int(end.split(":")[1])
    return left <= value <= right


def _score_train(train: TrainOption, request: RecommendRequest) -> tuple[float, list[str]]:
    """Считает локальный рейтинг поезда.

    LLM может помочь объяснить выбор, но базовая оценка намеренно считается
    детерминированно: цена, время, наличие мест и попадание в окно времени прибытия
    или отправления не должны зависеть от вероятностного ответа модели.
    """

    badges: list[str] = []
    score = 100.0
    preferences = set(request.intent.preferences)
    min_price = _min_price(train)

    # Чем дешевле и быстрее поезд, тем выше базовый балл.
    score -= min_price / 120
    score -= train.duration_minutes / 18

    if train.available_seats.coupe > 0:
        score += 8
    if train.available_seats.platzkart > 0:
        score += 4
    if "direct" in train.features:
        score += 10
        badges.append("Без пересадок" if request.language == "ru" else "Direct")

    if request.intent.arrival_time_window and _is_inside_window(
        train.arrival_time,
        request.intent.arrival_time_window.start,
        request.intent.arrival_time_window.end,
    ):
        score += 24
        badges.append("Попадает в нужное время" if request.language == "ru" else "Arrives on time")

    if request.intent.departure_time_window and _is_inside_window(
        train.departure_time,
        request.intent.departure_time_window.start,
        request.intent.departure_time_window.end,
    ):
        score += 24
        badges.append(
            "Отправление в нужное время" if request.language == "ru" else "Departs on time"
        )

    if "sleep" in preferences or "comfort" in preferences:
        if "overnight" in train.features:
            score += 18
            badges.append("Оптимальный для сна" if request.language == "ru" else "Best for sleep")
        if train.available_seats.coupe > 0:
            score += 8
            badges.append("Комфортный вариант" if request.language == "ru" else "Comfort option")

    if "cheap" in preferences or request.intent.priority == "price":
        score -= min_price / 80
        badges.append("Лучшая цена" if request.language == "ru" else "Best price")

    if request.intent.priority == "speed":
        score -= train.duration_minutes / 8
        badges.append("Самый быстрый" if request.language == "ru" else "Fastest")

    if train.prices.platzkart and train.prices.coupe:
        difference = train.prices.coupe - train.prices.platzkart
        if 0 <= difference <= 600:
            score += 12
            badges.append("Купе почти как плацкарт" if request.language == "ru" else "Coupe close to platzkart")

    # Убираем дубли, сохраняя порядок появления бейджей.
    deduplicated_badges = list(dict.fromkeys(badges))
    return score, deduplicated_badges


def _heuristic_wants_llm_rank(intent: TripIntent, last_message: str | None) -> bool:
    """Эвристика: нестандартный запрос без явного флага от модели понимания."""

    if intent.rank_with_llm:
        return True
    text = (last_message or "").strip().lower()
    if len(text) < 12:
        return False
    hints = (
        "животн",
        "питомц",
        "собак",
        "кошк",
        "провоз",
        "коляск",
        "инвалид",
        "медицин",
        "аллерг",
        "беремен",
        "младенц",
        "малыш",
        "грудн",
        "пандус",
        "сопровожд",
        "групп",
        "корпорат",
        "pets",
        "animal",
        "wheelchair",
        "medical",
        "baby",
        "infant",
        "allergy",
        "group booking",
    )
    return any(h in text for h in hints)


async def recommend_trains(
    request: RecommendRequest,
    deepseek_client: DeepSeekClient,
) -> RecommendResponse:
    """Ранжирует поезда и формирует краткое объяснение для голосового ассистента."""

    eligible = [t for t in request.trains if _total_free_seats(t) > 0]
    pool = eligible if eligible else []

    ranked: list[tuple[TrainOption, float, list[str]]] = []
    for train in pool:
        score, badges = _score_train(train, request)
        ranked.append((train, score, badges))

    ranked.sort(key=lambda item: item[1], reverse=True)

    use_llm_order = deepseek_client.enabled and (
        request.intent.rank_with_llm or _heuristic_wants_llm_rank(request.intent, request.last_user_message)
    )
    llm_ids = None
    if use_llm_order and len(pool) > 1:
        llm_ids = await deepseek_client.rank_train_order(
            request.language,
            request.intent,
            pool,
            request.last_user_message,
        )

    if llm_ids:
        by_id = {t.id: (t, sc, bd) for t, sc, bd in ranked}
        reordered: list[tuple[TrainOption, float, list[str]]] = []
        for tid in llm_ids:
            if tid in by_id:
                reordered.append(by_id[tid])
        ranked = reordered if len(reordered) == len(ranked) else ranked

    recommendations = [
        Recommendation(
            train_id=train.id,
            score=round(score, 2),
            badges=badges[:3] or (["Лучший выбор"] if request.language == "ru" else ["Best choice"]),
            explanation=_fallback_explanation(train, badges, request.language),
        )
        for train, score, badges in ranked
    ]

    if not recommendations:
        empty_text = (
            "По выбранным параметрам нет поездов со свободными местами. Измените дату или маршрут."
            if request.language == "ru"
            else "No trains with available seats for this search. Try another date or route."
        )
        return RecommendResponse(recommendations=[], assistant_text=empty_text)

    assistant_text = await deepseek_client.explain_recommendation(
        request.language,
        request.intent,
        ranked[0][0],
        recommendations[0].explanation,
    )
    return RecommendResponse(recommendations=recommendations, assistant_text=assistant_text)


def _fallback_explanation(train: TrainOption, badges: list[str], language: str) -> str:
    """Создает объяснение без LLM, если DeepSeek недоступен или отключен."""

    price_hint = ""
    try:
        coup = train.prices.coupe if train.prices else None
        pl = train.prices.platzkart if train.prices else None
        nums = [float(p) for p in (coup, pl) if p is not None]
        if nums:
            mn = min(nums)
            price_hint = (
                f" Цены от ~{mn:.0f} ₽ (плацкарт/купе)." if language != "en" else f" From ~{mn:.0f} ₽ (platzkart/coupe)."
            )
    except Exception:
        price_hint = ""

    if language == "en":
        return (
            f"Train {train.train_number} is a strong option: it departs at "
            f"{train.departure_time}, arrives at {train.arrival_time}, and offers "
            f"{', '.join(badges[:2]).lower() if badges else 'a balanced route'}."
            f"{price_hint}"
        )
    return (
        f"Поезд {train.train_number} хорошо подходит: отправление в {train.departure_time}, "
        f"прибытие в {train.arrival_time}, ключевые преимущества — "
        f"{', '.join(badges[:2]).lower() if badges else 'сбалансированный маршрут'}."
        f"{price_hint}"
    )
