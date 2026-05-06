from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from datetime import date, timedelta
from typing import Any

import httpx

from app.models import CarriageDetail, TrainOption, TripIntent


def _dedupe_preserve(items: list[str], *, limit: int, max_len: int) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in items:
        text = str(raw).strip()
        if not text:
            continue
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(text[:max_len])
        if len(out) >= limit:
            break
    return out


def _compact_stops_for_llm(stops: list[str], *, limit: int = 14) -> list[str]:
    """Уникальные остановки по порядку следования, без повторов подряд."""

    out: list[str] = []
    seen: set[str] = set()
    prev_cf: str | None = None
    for raw in stops:
        text = str(raw).strip()
        if not text:
            continue
        cf = text.casefold()
        if cf == prev_cf:
            continue
        prev_cf = cf
        if cf in seen:
            continue
        seen.add(cf)
        out.append(text[:48])
        if len(out) >= limit:
            break
    return out


def _services_tuple(services: list[str]) -> tuple[str, ...]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in services:
        text = str(raw).strip()
        if not text:
            continue
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(text[:72])
        if len(out) >= 10:
            break
    return tuple(out)


def _compact_carriage_groups(details: list[CarriageDetail], *, max_groups: int = 12) -> list[dict[str, Any]]:
    """Группирует вагоны с одинаковым типом/полом/набором услуг — короче, чем N почти одинаковых объектов."""

    grouped: dict[tuple[Any, ...], dict[str, Any]] = {}
    for d in details:
        key = (
            (d.type_label or "").strip(),
            d.compartment_kind,
            _services_tuple(list(d.services_short or [])),
        )
        if key not in grouped:
            grouped[key] = {
                "count": 0,
                "numbers": [],
                "type": key[0] or "—",
                "compartment_kind": key[1],
                "services": list(key[2]),
            }
        g = grouped[key]
        g["count"] += 1
        num = str(d.number).strip()
        if num and len(g["numbers"]) < 4:
            g["numbers"].append(num[:12])

    rows = sorted(grouped.values(), key=lambda x: -x["count"])
    return rows[:max_groups]


# Этот модуль изолирует все обращения к DeepSeek API. Остальная часть backend
# работает с простыми методами и не знает, где хранится ключ, какая модель
# выбрана и как именно устроен HTTP-запрос к LLM.
class DeepSeekClient:
    """Небольшой async-клиент для DeepSeek OpenAI-compatible API."""

    def __init__(self) -> None:
        self.api_key = os.getenv("DEEPSEEK_API_KEY", "")
        self.base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
        self.model = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
        self.timeout = float(os.getenv("DEEPSEEK_TIMEOUT_SECONDS", "90"))
        self.explain_timeout = float(os.getenv("DEEPSEEK_EXPLAIN_TIMEOUT_SECONDS", str(max(self.timeout, 120.0))))
        # Для защиты удобно фиксировать демо-дату: тогда фраза "6 мая" всегда
        # превращается в ожидаемый 2026-05-06, а не зависит от даты на VDS.
        self.current_date = os.getenv("PATH_CURRENT_DATE", date.today().isoformat())

    @property
    def enabled(self) -> bool:
        """DeepSeek включается только если ключ задан на backend."""

        return bool(self.api_key)

    async def chat_text(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        timeout_seconds: float | None = None,
        temperature: float = 0.35,
    ) -> str:
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
            "temperature": temperature,
        }
        headers = {"Authorization": f"Bearer {self.api_key}"}

        total = timeout_seconds if timeout_seconds is not None else self.timeout
        total = max(5.0, total)
        connect_cap = min(45.0, total)
        timeout_cfg = httpx.Timeout(total, connect=connect_cap)

        async with httpx.AsyncClient(timeout=timeout_cfg) as client:
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

    async def polish_assistant_reply(
        self,
        language: str,
        draft_text: str,
        *,
        prior_messages: list[tuple[str, str]],
        scene: str,
    ) -> str | None:
        """Перефразирует шаблонную реплику с учётом диалога; при сбое возвращает None."""

        if not self.enabled:
            return None
        flag = os.getenv("DEEPSEEK_POLISH_ENABLED", "1").strip().lower()
        if flag in ("0", "false", "no", "off"):
            return None
        text = (draft_text or "").strip()
        if not text:
            return None
        timeout = float(os.getenv("DEEPSEEK_POLISH_TIMEOUT_SECONDS", "45"))
        lang_name = "русском" if language == "ru" else "English"
        system_prompt = (
            "Ты редактор реплик голосового ассистента терминала РЖД «Путь». "
            f"Перепиши черновик в одну естественную речевую фразу на {lang_name} (1–3 коротких предложения). "
            "Сохрани все факты из черновика: города, даты, время отправления/прибытия, цены в рублях, номера поездов, числа мест — без искажений и без дополнительных предположений. "
            "Если в черновике чего-то нет, не придумывай. "
            "Смотри prior_dialog: не повторяй дословно одни и те же вступления и шаблоны, если ассистент уже их говорил; "
            "отвечай по-человечески, как в чате с агентом, без лишних повторных сводок маршрута. "
            "Верни ТОЛЬКО текст реплики, без кавычек, без списков и без пояснений."
        )
        user_payload = json.dumps(
            {
                "scene": scene,
                "prior_dialog": [
                    {"role": r, "text": (t or "")[:1200]}
                    for r, t in prior_messages[-12:]
                    if (t or "").strip()
                ],
                "draft_reply": text,
            },
            ensure_ascii=False,
        )
        try:
            out = await self.chat_text(
                system_prompt,
                user_payload,
                timeout_seconds=max(5.0, timeout),
                temperature=0.55,
            )
        except Exception as exc:
            logging.warning("polish_assistant_reply failed: %s", exc)
            return None
        cleaned = out.strip().strip('"').strip("'")
        if len(cleaned) < 4:
            return None
        return cleaned

    def _base_date(self) -> date:
        try:
            return date.fromisoformat(str(self.current_date)[:10])
        except ValueError:
            return date.today()

    def _parse_relative_travel_date(self, text: str) -> str | None:
        """Дата YYYY-MM-DD для «сегодня/завтра/послезавтра» относительно current_date."""

        n = text.lower()
        base = self._base_date()
        if re.search(r"(?<![а-яa-z])послезавтра(?![а-яa-z])", n, re.I):
            return (base + timedelta(days=2)).isoformat()
        if re.search(r"(?<![а-яa-z])завтра(?![а-яa-z])", n, re.I) or re.search(
            r"\b(tomorrow|tmrw)\b",
            n,
            re.I,
        ):
            return (base + timedelta(days=1)).isoformat()
        if re.search(r"(?<![а-яa-z])сегодня(?![а-яa-z])", n, re.I) or re.search(r"\btoday\b", n, re.I):
            return base.isoformat()
        return None

    def _strip_trailing_date_words_ru(self, fragment: str) -> str:
        s = fragment.strip()
        s = re.split(
            r"\s+(?=(?:завтра|послезавтра|сегодня|на\s+завтра|на\s+сегодня)(?:\s|$))",
            s,
            maxsplit=1,
            flags=re.I,
        )[0]
        return s.strip().rstrip(",.")

    def _canonical_city_ru(self, fragment: str) -> str | None:
        """Грубое приведение к именительному падежу для городов РФ по подстроке."""

        f = fragment.strip().lower()
        f = re.sub(r"[^\w\s\-]", "", f)
        f = re.sub(r"\s+", " ", f).strip()
        if not f:
            return None
        aliases = (
            ("воронеж", "Воронеж"),
            ("липецк", "Липецк"),
            ("москв", "Москва"),
            ("казан", "Казань"),
            ("петербург", "Санкт-Петербург"),
            ("сочи", "Сочи"),
            ("нижний новгород", "Нижний Новгород"),
            ("екатеринбург", "Екатеринбург"),
            ("новосибирск", "Новосибирск"),
            ("самар", "Самара"),
            ("ростов", "Ростов-на-Дону"),
            ("краснодар", "Краснодар"),
            ("калининград", "Калининград"),
            ("мурманск", "Мурманск"),
            ("архангельск", "Архангельск"),
            ("тул", "Тула"),
            ("рязан", "Рязань"),
            ("туапсе", "Туапсе"),
            ("адлер", "Адлер"),
            ("анап", "Анапа"),
        )
        for key, name in aliases:
            if key in f:
                return name
        if len(f) >= 2:
            return fragment.strip()[:48].strip()
        return None

    def _extract_iz_v_cities(self, text: str) -> tuple[str | None, str | None]:
        t = text.strip()
        m = re.search(r"(?i)из\s+(.+?)\s+в\s+(.+)", t)
        if not m:
            return None, None
        a = self._strip_trailing_date_words_ru(m.group(1))
        b = self._strip_trailing_date_words_ru(m.group(2))
        o = self._canonical_city_ru(a)
        d = self._canonical_city_ru(b)
        return o, d

    def _extract_from_to_en(self, text: str) -> tuple[str | None, str | None]:
        m = re.search(r"(?i)\bfrom\s+(.+?)\s+to\s+(.+)", text.strip())
        if not m:
            return None, None
        a = m.group(1).strip().rstrip(",")
        b = m.group(2).strip()
        b = re.split(r"\s+(?=(?:tomorrow|today|the\s+day)\b)", b, maxsplit=1, flags=re.I)[0].strip()
        if len(a) >= 2 and len(b) >= 2:
            return a[:48], b[:48]
        return None, None

    def _merge_route_heuristics(
        self,
        language: str,
        text: str,
        origin_hint: str | None,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Дополняет ответ LLM/fallback: «из А в Б завтра», from/to, относительные даты."""

        out = dict(payload)
        o_ru, d_ru = self._extract_iz_v_cities(text)
        o_en, d_en = self._extract_from_to_en(text)
        o, d = o_ru or o_en, d_ru or d_en
        if o and not out.get("origin"):
            out["origin"] = o
        if d and not out.get("destination"):
            out["destination"] = d
        dt = self._parse_relative_travel_date(text)
        if dt and not out.get("date"):
            out["date"] = dt
        if not out.get("origin") and origin_hint:
            out["origin"] = origin_hint
        return out

    async def understand_trip(
        self,
        language: str,
        text: str,
        origin_hint: str | None,
        *,
        prior_messages: list[tuple[str, str]] | None = None,
    ) -> dict[str, Any]:
        """Преобразует естественную речь пассажира в JSON-параметры поездки."""

        if not self.enabled:
            base = self._fallback_understanding(language, text, origin_hint)
            return self._merge_route_heuristics(language, text, origin_hint, base)

        system_prompt = (
            "Ты смысловой модуль билетного терминала РЖД «Путь». "
            "Верни строго JSON без markdown. Не выдумывай цены и номера поездов. "
            "Если параметр неизвестен, используй null. "
            f"Текущая дата для относительных и неполных дат: {self.current_date}. "
            "Если пользователь не назвал год, выбирай ближайшую будущую дату относительно текущей даты. "
            "Если передан prior_dialog, учитывай контекст: при уточняющих вопросах по уже известному маршруту "
            "(еда в поезде, скорость, удобство, дополнительные услуги) заполняй assistant_text ответом именно на этот вопрос, "
            "без повторного полного подтверждения маршрута, если это уже звучало у ассистента. "
            "preferences заполняй короткими английскими тегами: sleep, comfort, cheap, speed, direct, child, luggage. "
            "Временные окна: departure_time_window — когда пассажир хочет УЕХАТЬ/ОТПРАВИТЬСЯ "
            "(рус.: уехать, выехать, отправление, сесть на поезд; англ.: leave, depart, morning outbound). "
            "arrival_time_window — когда хочет ПРИЕХАТЬ/ПРИБЫТЬ "
            "(рус.: приехать, прибытие; англ.: arrive, arrival). "
            "Не ставь оба окна, если пользователь явно указал только одно направление во времени; второе оставь null. "
            "«Утром» без уточнения: если речь об отправлении из города отправления — только departure_time_window 06:00-11:00; "
            "если о прибытии в пункт назначения — только arrival_time_window 06:00-11:00. "
            "Фраза про начало рабочего дня / к началу работы: arrival_time_window 07:00-09:00 (если это про время прибытия). "
            "Примеры: «из Москвы в Казань завтра» → origin Москва, destination Казань, date завтра; "
            "«Нужен билет из Санкт-Петербурга во Владивосток 12 июня» — заполни три поля города и даты. "
            "Формат JSON (пример значений; подставь свои или null): "
            '{"intent":"search_ticket","language":"ru","origin":"Москва","destination":"Казань","date":"2026-05-06",'
            '"departure_time_window":null,"arrival_time_window":{"start":"07:00","end":"09:00"},'
            '"preferences":["sleep"],"priority":"arrival_time","transfers":"direct_preferred",'
            '"assistant_text":"Краткая реплика на языке language","rank_with_llm":false}. '
            "departure_time_window и arrival_time_window — только объект с полями start и end (строки HH:MM) или null; "
            "не используй одну строку для всего окна."
        )
        base_obj: dict[str, Any] = {
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
                "departure_time_window": 'null или {"start":"HH:MM","end":"HH:MM"} — только объект, не строка',
                "arrival_time_window": 'null или {"start":"HH:MM","end":"HH:MM"} — только объект, не строка',
                "preferences": ["sleep"],
                "priority": "arrival_time|price|speed|comfort|null",
                "transfers": "direct_preferred|null",
                "assistant_text": "short phrase in selected language",
                "rank_with_llm": "boolean — true если запрос не сводится к обычным тегам preferences/priority (например поезд с животными, медицинское сопровождение, необычное время, сложные условия). Иначе false.",
            },
        }
        pm = prior_messages or []
        if pm:
            base_obj["prior_dialog"] = [
                {"role": r, "text": (t or "")[:1200]}
                for r, t in pm[-10:]
                if (t or "").strip()
            ]
        user_prompt = json.dumps(base_obj, ensure_ascii=False)
        try:
            parsed = await self.chat_json(system_prompt, user_prompt)
        except Exception:
            parsed = self._fallback_understanding(language, text, origin_hint)
        return self._merge_route_heuristics(language, text, origin_hint, parsed)

    def _fallback_understanding(self, language: str, text: str, origin_hint: str | None) -> dict[str, Any]:
        """Простой локальный разбор для демо-режима без DeepSeek API.

        Он не заменяет LLM, но позволяет показать полный сценарий на защите,
        даже если ключ не настроен или внешний API временно недоступен.
        """

        normalized = text.lower()
        destination = None
        if "казан" in normalized or "kazan" in normalized:
            destination = "Казань" if language == "ru" else "Kazan"
        if "петербург" in normalized or "petersburg" in normalized:
            destination = "Санкт-Петербург"
        if "сочи" in normalized or "sochi" in normalized:
            destination = "Сочи"
        if "воронеж" in normalized or "voronezh" in normalized:
            destination = "Воронеж" if language == "ru" else "Voronezh"

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

        departure_window = None
        arrival_window = None

        departure_cues = (
            "уехать",
            "уезжа",
            "выехать",
            "выезд",
            "отправлен",
            "отправиться",
            "отъезд",
            "сесть на поезд",
            "leave ",
            " depart",
            "departure",
            "leave in the",
        )
        arrival_cues = (
            "приехать",
            "приезжа",
            "прибыти",
            "прибыт",
            "arrive",
            "arrival",
            "get there",
        )
        wants_departure_time = any(c in normalized for c in departure_cues)
        wants_arrival_time = any(c in normalized for c in arrival_cues)

        morning_hint = any(w in normalized for w in ("утром", "утро ", " утро", "morning"))
        workday_arrival = any(w in normalized for w in ("рабоч", "workday", "начал работ", "work day"))

        if morning_hint:
            if wants_departure_time and not wants_arrival_time:
                departure_window = {"start": "06:00", "end": "11:00"}
            elif wants_arrival_time and not wants_departure_time:
                arrival_window = (
                    {"start": "07:00", "end": "09:00"}
                    if workday_arrival
                    else {"start": "06:00", "end": "11:00"}
                )
            elif wants_departure_time and wants_arrival_time:
                departure_window = {"start": "06:00", "end": "11:00"}
                arrival_window = {"start": "06:00", "end": "11:00"}
            else:
                # «Казань утром» без глагола — по умолчанию время прибытия (как раньше).
                arrival_window = (
                    {"start": "07:00", "end": "09:00"}
                    if workday_arrival
                    else {"start": "06:00", "end": "11:00"}
                )

        if not departure_window and not arrival_window and workday_arrival:
            arrival_window = {"start": "07:00", "end": "09:00"}

        trip_date = self._parse_relative_travel_date(text)
        if trip_date is None and ("6" in normalized or "шест" in normalized or "may 6" in normalized):
            trip_date = "2026-05-06"

        assistant_text = (
            (
                f"Понял. Ищу подходящие поезда в город {destination}."
                if destination
                else "Уточните, пожалуйста, город назначения и дату поездки."
            )
            if language == "ru"
            else (
                f"Understood. I will look for suitable trains to {destination}."
                if destination
                else "Please clarify the destination city and travel date."
            )
        )

        return {
            "intent": "search_ticket",
            "language": language,
            "origin": origin_hint or ("Москва" if language == "ru" else "Moscow"),
            "destination": destination,
            "date": trip_date,
            "departure_time_window": departure_window,
            "arrival_time_window": arrival_window,
            "preferences": preferences,
            "priority": (
                "price"
                if "cheap" in preferences
                else ("speed" if departure_window or "speed" in preferences else "arrival_time")
            ),
            "transfers": "direct_preferred",
            "assistant_text": assistant_text,
            "rank_with_llm": False,
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
        compact_train = train.model_dump(exclude={"carriage_details", "carriage_notes", "stops"})
        compact_train["stops_sample"] = _compact_stops_for_llm(list(train.stops))
        compact_train["carriage_notes_unique"] = _dedupe_preserve(
            list(train.carriage_notes),
            limit=8,
            max_len=160,
        )
        compact_train["wagons_by_type"] = _compact_carriage_groups(list(train.carriage_details))

        user_prompt = json.dumps(
            {
                "language": language,
                "user_intent": intent.model_dump(),
                "recommended_train": compact_train,
                "fallback_explanation": fallback_text,
                "task": "Скажи 1-2 предложения для голосового ассистента.",
            },
            ensure_ascii=False,
        )
        last_err: BaseException | None = None
        for attempt in range(3):
            try:
                return await self.chat_text(
                    system_prompt,
                    user_prompt,
                    timeout_seconds=self.explain_timeout,
                )
            except Exception as exc:
                last_err = exc
                logging.warning(
                    "explain_recommendation DeepSeek attempt %s failed: %s",
                    attempt + 1,
                    exc,
                )
                if attempt < 2:
                    await asyncio.sleep(1.2 * (attempt + 1))
        logging.warning("explain_recommendation exhausted retries: %s", last_err)
        return fallback_text

    async def rank_train_order(
        self,
        language: str,
        intent: TripIntent,
        trains: list[TrainOption],
        user_hint: str | None,
    ) -> list[str] | None:
        """Возвращает упорядоченный список id поездов от лучшего к худшему.

        Используется только для нестандартных запросов. При ошибке — None.
        """

        if not self.enabled or not trains:
            return None

        compact = [
            {
                "id": t.id,
                "train_number": t.train_number,
                "departure_time": t.departure_time,
                "arrival_time": t.arrival_time,
                "duration_minutes": t.duration_minutes,
                "features": t.features,
                "amenities": t.amenities,
                "prices": t.prices.model_dump(),
            }
            for t in trains
        ]
        system_prompt = (
            "Ты эксперт по подбору поездов для терминала РЖД «Путь». "
            "Пользовательский запрос может быть нестандартным (животные, здоровье, время, комфорт и т.д.). "
            "Упорядочь ТОЛЬКО переданные поезда по уместности под запрос. "
            "Не добавляй поезда. Не выдумывай цены и расписание — используй только поля из списка. "
            "Верни строго JSON без markdown: {\"ordered_train_ids\": [\"id1\", \"id2\", ...]} — все id из входного списка, каждый ровно один раз."
        )
        user_prompt = json.dumps(
            {
                "language": language,
                "user_intent": intent.model_dump(),
                "last_user_message": user_hint,
                "trains": compact,
            },
            ensure_ascii=False,
        )
        try:
            data = await self.chat_json(system_prompt, user_prompt)
            ordered = data.get("ordered_train_ids")
            if not isinstance(ordered, list):
                return None
            valid_ids = {t.id for t in trains}
            picked = [str(x) for x in ordered if str(x) in valid_ids]
            if len(picked) != len(trains) or set(picked) != valid_ids:
                return None
            return picked
        except Exception:
            return None

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
