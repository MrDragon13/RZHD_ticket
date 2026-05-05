from __future__ import annotations

import json
import os
from datetime import date
from typing import Any

import httpx

from app.models import TrainOption, TripIntent


# Этот модуль изолирует все обращения к DeepSeek API. Остальная часть backend
# работает с простыми методами и не знает, где хранится ключ, какая модель
# выбрана и как именно устроен HTTP-запрос к LLM.
class DeepSeekClient:
    """Небольшой async-клиент для DeepSeek OpenAI-compatible API."""

    def __init__(self) -> None:
        self.api_key = os.getenv("DEEPSEEK_API_KEY", "")
        self.base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
        self.model = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
        self.timeout = float(os.getenv("DEEPSEEK_TIMEOUT_SECONDS", "20"))
        # Для защиты удобно фиксировать демо-дату: тогда фраза "6 мая" всегда
        # превращается в ожидаемый 2026-05-06, а не зависит от даты на VDS.
        self.current_date = os.getenv("PATH_CURRENT_DATE", date.today().isoformat())

    @property
    def enabled(self) -> bool:
        """DeepSeek включается только если ключ задан на backend."""

        return bool(self.api_key)

    async def chat_text(self, system_prompt: str, user_prompt: str) -> str:
        """Возвращает обычный текстовый ответ LLM.

        Метод используется для реплик ассистента, объяснений рекомендаций и
        AI Fact Finder. В случае ошибки вызывающий код сам решает, какой
        fallback показать пользователю.
        """

        if not self.enabled:
            raise RuntimeError("DeepSeek API key is not configured")

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.35,
        }
        headers = {"Authorization": f"Bearer {self.api_key}"}

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url.rstrip('/')}/chat/completions",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"].strip()

    async def chat_json(self, system_prompt: str, user_prompt: str) -> dict[str, Any]:
        """Запрашивает у LLM строгий JSON и аккуратно его разбирает.

        DeepSeek обычно следует инструкции, но модель все равно может добавить
        markdown-блок. Поэтому ниже есть небольшой безопасный очиститель.
        """

        text = await self.chat_text(system_prompt, user_prompt)
        return self._parse_json_payload(text)

    def _parse_json_payload(self, text: str) -> dict[str, Any]:
        """Извлекает JSON из ответа модели без выполнения произвольного кода."""

        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            if cleaned.lower().startswith("json"):
                cleaned = cleaned[4:].strip()

        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start == -1 or end == -1 or end < start:
            raise ValueError("DeepSeek response does not contain JSON object")

        return json.loads(cleaned[start : end + 1])

    async def understand_trip(self, language: str, text: str, origin_hint: str | None) -> dict[str, Any]:
        """Преобразует естественную речь пассажира в JSON-параметры поездки."""

        if not self.enabled:
            return self._fallback_understanding(language, text, origin_hint)

        system_prompt = (
            "Ты смысловой модуль билетного терминала РЖД «Путь». "
            "Верни строго JSON без markdown. Не выдумывай цены и номера поездов. "
            "Если параметр неизвестен, используй null. "
            f"Текущая дата для относительных и неполных дат: {self.current_date}. "
            "Если пользователь не назвал год, выбирай ближайшую будущую дату относительно текущей даты. "
            "preferences заполняй короткими английскими тегами: sleep, comfort, cheap, speed, direct, child, luggage. "
            "Для фразы про начало рабочего дня ставь arrival_time_window 07:00-09:00."
        )
        user_prompt = json.dumps(
            {
                "language": language,
                "current_date": self.current_date,
                "origin_hint": origin_hint,
                "user_text": text,
                "required_schema": {
                    "intent": "search_ticket",
                    "language": language,
                    "origin": "string|null",
                    "destination": "string|null",
                    "date": "YYYY-MM-DD|null",
                    "departure_time_window": {"start": "HH:MM", "end": "HH:MM"},
                    "arrival_time_window": {"start": "HH:MM", "end": "HH:MM"},
                    "preferences": ["sleep"],
                    "priority": "arrival_time|price|speed|comfort|null",
                    "transfers": "direct_preferred|null",
                    "assistant_text": "short phrase in selected language",
                },
            },
            ensure_ascii=False,
        )
        try:
            return await self.chat_json(system_prompt, user_prompt)
        except Exception:
            return self._fallback_understanding(language, text, origin_hint)

    def _fallback_understanding(self, language: str, text: str, origin_hint: str | None) -> dict[str, Any]:
        """Простой локальный разбор для демо-режима без DeepSeek API.

        Он не заменяет LLM, но позволяет показать полный сценарий на защите,
        даже если ключ не настроен или внешний API временно недоступен.
        """

        normalized = text.lower()
        destination = "Казань"
        if "петербург" in normalized or "petersburg" in normalized:
            destination = "Санкт-Петербург"
        if "сочи" in normalized or "sochi" in normalized:
            destination = "Сочи"
        if "kazan" in normalized:
            destination = "Kazan"

        preferences: list[str] = []
        if any(word in normalized for word in ["спать", "высп", "sleep", "overnight"]):
            preferences.append("sleep")
        if any(word in normalized for word in ["дешев", "cheap", "price"]):
            preferences.append("cheap")
        if any(word in normalized for word in ["быстр", "fast"]):
            preferences.append("speed")
        if any(word in normalized for word in ["купе", "comfort", "удоб"]):
            preferences.append("comfort")
        if any(word in normalized for word in ["без перес", "direct", "nonstop"]):
            preferences.append("direct")

        arrival_window = None
        if any(word in normalized for word in ["рабоч", "утром", "morning", "workday"]):
            arrival_window = {"start": "07:00", "end": "09:00"}

        assistant_text = (
            f"Понял. Ищу подходящие поезда в город {destination}."
            if language == "ru"
            else f"Understood. I will look for suitable trains to {destination}."
        )

        return {
            "intent": "search_ticket",
            "language": language,
            "origin": origin_hint or ("Москва" if language == "ru" else "Moscow"),
            "destination": destination,
            "date": "2026-05-06" if ("6" in normalized or "шест" in normalized or "may 6" in normalized) else None,
            "departure_time_window": None,
            "arrival_time_window": arrival_window,
            "preferences": preferences,
            "priority": "price" if "cheap" in preferences else ("speed" if "speed" in preferences else "arrival_time"),
            "transfers": "direct_preferred",
            "assistant_text": assistant_text,
        }

    async def explain_recommendation(
        self,
        language: str,
        intent: TripIntent,
        train: TrainOption,
        fallback_text: str,
    ) -> str:
        """Генерирует короткую голосовую реплику о лучшем варианте.

        Если DeepSeek недоступен, метод возвращает заранее собранный fallback,
        чтобы презентационный сценарий не ломался из-за внешнего API.
        """

        if not self.enabled:
            return fallback_text

        system_prompt = (
            "Ты голосовой ассистент футуристичного терминала РЖД «Путь». "
            "Отвечай кратко, уверенно и естественно. Не придумывай новых поездов, цен или времен. "
            "Объясняй только переданный вариант."
        )
        user_prompt = json.dumps(
            {
                "language": language,
                "user_intent": intent.model_dump(),
                "recommended_train": train.model_dump(),
                "fallback_explanation": fallback_text,
                "task": "Скажи 1-2 предложения для голосового ассистента.",
            },
            ensure_ascii=False,
        )
        try:
            return await self.chat_text(system_prompt, user_prompt)
        except Exception:
            return fallback_text

    async def generate_fun_fact(self, language: str, origin: str | None, destination: str) -> tuple[str, str]:
        """Возвращает короткий факт о маршруте через LLM или локальный fallback."""

        fallback = (
            f"Интересный факт: маршрут в город {destination} помогает увидеть, как железная дорога связывает разные регионы страны."
            if language == "ru"
            else f"Fun fact: the route to {destination} shows how railways connect different regions into one travel network."
        )
        if not self.enabled:
            return fallback, "fallback"

        system_prompt = (
            "Ты AI Fact Finder для билетного терминала. Дай один короткий нейтральный факт "
            "о городе назначения или маршруте. Не выдумывай точные даты, если не уверен. "
            "Ответь одним предложением на выбранном языке."
        )
        user_prompt = json.dumps(
            {"language": language, "origin": origin, "destination": destination},
            ensure_ascii=False,
        )
        try:
            return await self.chat_text(system_prompt, user_prompt), "llm"
        except Exception:
            return fallback, "fallback"
