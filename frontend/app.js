// Backend URL можно переопределить через window.PATH_API_BASE_URL.
// По умолчанию используем относительный адрес: в Docker nginx проксирует /api
// во внутренний backend-контейнер, а ключ DeepSeek остается только на сервере.
const API_BASE_URL = window.PATH_API_BASE_URL || "";

// Все пользовательские надписи вынесены в словарь, чтобы выбранный на первом
// экране язык проходил сквозь весь интерфейс, голосовые реплики и демо-билет.
const i18n = {
  ru: {
    title: "ПУТЬ",
    subtitle: "Интеллектуальный терминал РЖД",
    chooseLanguage: "Выберите язык интерфейса",
    startPrompt: "Коснитесь сферы и скажите, куда вы хотите поехать",
    assistantReady: "Добро пожаловать. Куда направимся?",
    listen: "Слушать",
    textPlaceholder: "Например: хочу приехать в Казань к началу рабочего дня 6 мая и выспаться",
    send: "Отправить",
    chips: ["Казань утром", "Подешевле", "Хочу выспаться", "Без пересадок", "Покажи купе"],
    understood: "Я понял запрос",
    route: "Маршрут",
    fact: "AI Fact",
    options: "Рекомендованные поезда",
    checkout: "Оформить демо-билет",
    demoFlow: ["Проверка маршрута", "Резервирование демонстрационного места", "Формирование QR-билета", "Готово"],
    demoTicket: "ДЕМО-БИЛЕТ",
    restart: "Начать заново",
    noSpeech: "Распознавание речи недоступно в этом браузере. Используйте текстовое поле.",
    fallbackError: "Сервер недоступен. Показываю демо-сценарий интерфейса.",
  },
  en: {
    title: "PATH",
    subtitle: "Smart Railway Terminal",
    chooseLanguage: "Select interface language",
    startPrompt: "Touch the sphere and say where you want to go",
    assistantReady: "Welcome. Where are we heading?",
    listen: "Listen",
    textPlaceholder: "Example: I want to arrive in Kazan before the workday starts on May 6 and sleep",
    send: "Send",
    chips: ["Kazan morning", "Cheaper", "I want to sleep", "Direct only", "Show coupe"],
    understood: "Request understood",
    route: "Route",
    fact: "AI Fact",
    options: "Recommended trains",
    checkout: "Create demo ticket",
    demoFlow: ["Checking route", "Reserving demo seat", "Generating QR ticket", "Done"],
    demoTicket: "DEMO TICKET",
    restart: "Start over",
    noSpeech: "Speech recognition is not available in this browser. Use the text field.",
    fallbackError: "Server is unavailable. Showing interface demo scenario.",
  },
};

let language = "ru";
let state = {};
let intent = null;
let trains = [];
let recommendations = [];
let selectedTrain = null;
let demoTicket = null;

const screens = {
  language: document.querySelector("#language-screen"),
  terminal: document.querySelector("#terminal-screen"),
};
const assistantText = document.querySelector("#assistant-text");
const userInput = document.querySelector("#user-input");
const languageBadge = document.querySelector("#language-badge");
const transcript = document.querySelector("#transcript");
const intentPanel = document.querySelector("#intent-panel");
const routePanel = document.querySelector("#route-panel");
const trainsPanel = document.querySelector("#trains-panel");
const checkoutPanel = document.querySelector("#checkout-panel");
const ticketPanel = document.querySelector("#ticket-panel");
const routeLine = document.querySelector("#route-line");
const routePulse = document.querySelector("#route-pulse");

document.querySelectorAll("[data-language]").forEach((button) => {
  button.addEventListener("click", () => setLanguage(button.dataset.language));
});
document.querySelector("#send-button").addEventListener("click", () => handleUserText(userInput.value));
document.querySelector("#orb-button").addEventListener("click", startVoiceRecognition);
document.querySelector("#restart-button").addEventListener("click", resetScenario);

// Чипы позволяют красиво уточнять запрос касанием, не открывая клавиатуру.
document.querySelector("#chips").addEventListener("click", (event) => {
  if (event.target.matches("button")) {
    handleUserText(event.target.textContent);
  }
});

// Выбор языка является нулевым шагом сценария. После него все тексты,
// распознавание речи и голосовой ответ работают только на выбранном языке.
function setLanguage(nextLanguage) {
  language = nextLanguage;
  const copy = i18n[language];
  screens.language.classList.add("hidden");
  screens.terminal.classList.remove("hidden");
  languageBadge.textContent = language.toUpperCase();
  document.querySelector("#terminal-title").textContent = copy.title;
  document.querySelector("#terminal-subtitle").textContent = copy.subtitle;
  document.querySelector("#start-prompt").textContent = copy.startPrompt;
  document.querySelector("#send-button").textContent = copy.send;
  document.querySelector("#listen-label").textContent = copy.listen;
  userInput.placeholder = copy.textPlaceholder;
  document.querySelector("#intent-title").textContent = copy.understood;
  document.querySelector("#route-title").textContent = copy.route;
  document.querySelector("#fact-title").textContent = copy.fact;
  document.querySelector("#trains-title").textContent = copy.options;
  document.querySelector("#restart-button").textContent = copy.restart;
  assistantText.textContent = copy.assistantReady;
  renderChips();
  resetScenario(false);
  speak(copy.assistantReady);
}

// Быстрые чипы имитируют сенсорные уточнения пассажира без экранной клавиатуры.
function renderChips() {
  const chips = document.querySelector("#chips");
  chips.innerHTML = "";
  i18n[language].chips.forEach((label) => {
    const button = document.createElement("button");
    button.className = "chip";
    button.textContent = label;
    chips.append(button);
  });
}

// Единая точка входа для текста: сюда попадает и ручной ввод, и распознанная речь.
async function handleUserText(text) {
  const cleanText = text.trim();
  if (!cleanText) return;
  userInput.value = "";
  transcript.textContent = cleanText;
  await runDialog(cleanText);
}

// Отправляем реплику в backend-диалог. Backend возвращает новое состояние,
// которое frontend сразу превращает в визуальные панели терминала.
async function runDialog(text) {
  try {
    const response = await postJson("/api/dialog", { language, text, state });
    state = response.state;
    assistantSay(response.assistant_text);
    intent = normalizeIntent(state, response.assistant_text);
    renderIntent(intent);
    if (response.action === "search_tickets" && intent.destination) {
      await searchAndRecommend();
    }
  } catch (error) {
    console.error(error);
    runLocalDemoFallback();
  }
}

// Backend хранит состояние гибко, поэтому frontend нормализует его до формы,
// удобной для поиска билетов и отображения карточек "как я понял запрос".
function normalizeIntent(rawState, assistant_text) {
  return {
    intent: rawState.intent || "search_ticket",
    language,
    origin: rawState.origin || (language === "ru" ? "Москва" : "Moscow"),
    destination: rawState.destination || (language === "ru" ? "Казань" : "Kazan"),
    date: rawState.date || "2026-05-06",
    departure_time_window: rawState.departure_time_window || null,
    arrival_time_window: rawState.arrival_time_window || { start: "07:00", end: "09:00" },
    preferences: rawState.preferences || ["sleep", "comfort"],
    priority: rawState.priority || "arrival_time",
    transfers: rawState.transfers || "direct_preferred",
    assistant_text,
  };
}

// Поиск билетов и факт запускаются параллельно, чтобы экран быстрее оживал:
// карта получает AI Fact, а затем рекомендации добавляют смысловой выбор.
async function searchAndRecommend() {
  const searchRequest = {
    language,
    origin: intent.origin,
    destination: intent.destination,
    date: intent.date,
    arrival_time_window: intent.arrival_time_window,
    departure_time_window: intent.departure_time_window,
    preferences: intent.preferences,
  };
  const [ticketResponse, factResponse] = await Promise.all([
    postJson("/api/tickets/search", searchRequest),
    postJson("/api/fun-fact", {
      language,
      origin: intent.origin,
      destination: intent.destination,
    }),
  ]);
  trains = ticketResponse.trains;
  renderRoute(factResponse.fact);
  const recommendResponse = await postJson("/api/recommend", { language, intent, trains });
  recommendations = recommendResponse.recommendations;
  assistantSay(recommendResponse.assistant_text);
  renderTrains();
}

// Карточки понимания запроса показывают пассажиру, что именно извлекла система.
function renderIntent(data) {
  intentPanel.classList.remove("hidden");
  const windowText = data.arrival_time_window
    ? `${data.arrival_time_window.start}–${data.arrival_time_window.end}`
    : "—";
  document.querySelector("#intent-grid").innerHTML = `
    <div class="glass-card"><span>${language === "ru" ? "Откуда" : "From"}</span><strong>${data.origin || "—"}</strong></div>
    <div class="glass-card"><span>${language === "ru" ? "Куда" : "To"}</span><strong>${data.destination || "—"}</strong></div>
    <div class="glass-card"><span>${language === "ru" ? "Дата" : "Date"}</span><strong>${data.date || "—"}</strong></div>
    <div class="glass-card"><span>${language === "ru" ? "Прибытие" : "Arrival"}</span><strong>${windowText}</strong></div>
  `;
}

// Живая карта — главный вау-элемент: маршрут рисуется неоновой линией, а факт
// превращает ожидание ответа в часть презентационного сценария.
function renderRoute(factText) {
  routeLine.classList.add("route-line-active");
  routePulse.classList.add("route-pulse-active");
  document.querySelector("#route-meta").textContent = `${intent.origin} → ${intent.destination}`;
  updateRouteLabels();
  document.querySelector("#route-fact").textContent = factText;
}

// Подписи на демо-карте меняются под выбранный маршрут, даже если геометрия
// линии остается условной и презентационной.
function updateRouteLabels() {
  document.querySelector("#origin-label").textContent = intent.origin || (language === "ru" ? "Москва" : "Moscow");
  document.querySelector("#destination-label").textContent = intent.destination || (language === "ru" ? "Казань" : "Kazan");
}

// Карточки поездов намеренно крупные: вся карточка является touch-зоной выбора.
function renderTrains() {
  trainsPanel.classList.remove("hidden");
  const list = document.querySelector("#trains-list");
  list.innerHTML = "";
  const recommendationsById = new Map(recommendations.map((item) => [item.train_id, item]));
  trains
    .slice()
    .sort((a, b) => (recommendationsById.get(b.id)?.score || 0) - (recommendationsById.get(a.id)?.score || 0))
    .forEach((train, index) => {
      const recommendation = recommendationsById.get(train.id);
      const card = document.createElement("article");
      card.className = `train-card ${index === 0 ? "train-card-best" : ""}`;
      card.innerHTML = `
        <div class="train-card-header">
          <span class="train-number">${train.train_number}</span>
          <span class="badge">${recommendation?.badges?.[0] || (language === "ru" ? "Лучший выбор" : "Best choice")}</span>
        </div>
        <div class="timeline">
          <strong>${train.departure_time}</strong>
          <span></span>
          <strong>${train.arrival_time}</strong>
        </div>
        <p>${train.departure_station} → ${train.arrival_station}</p>
        <p>${train.duration_label} · ${train.route_distance_km} км</p>
        <p class="reason">${recommendation?.explanation || ""}</p>
        <div class="price-row">
          <span>${language === "ru" ? "Купе" : "Coupe"}: ${formatPrice(train.prices.coupe)}</span>
          <span>${language === "ru" ? "Плацкарт" : "Platzkart"}: ${formatPrice(train.prices.platzkart)}</span>
        </div>
      `;
      card.addEventListener("click", () => selectTrain(train));
      list.append(card);
    });
}

// Выбор поезда пока не бронирует место, а только подготавливает demo checkout.
function selectTrain(train) {
  selectedTrain = train;
  checkoutPanel.classList.remove("hidden");
  const button = document.querySelector("#checkout-button");
  button.textContent = i18n[language].checkout;
  button.onclick = createTicket;
  checkoutPanel.scrollIntoView({ behavior: "smooth", block: "center" });
}

// Demo Checkout Module показывает полный путь до билета без оплаты и персональных данных.
async function createTicket() {
  const steps = document.querySelector("#checkout-steps");
  steps.innerHTML = "";
  for (const step of i18n[language].demoFlow) {
    const item = document.createElement("div");
    item.className = "checkout-step";
    item.textContent = step;
    steps.append(item);
    await wait(260);
    item.classList.add("checkout-step-done");
  }
  demoTicket = await postJson("/api/checkout/demo", { language, train: selectedTrain });
  renderTicket();
}

// Финальный экран выводит демонстрационный билет и предупреждение о недействительности.
function renderTicket() {
  ticketPanel.classList.remove("hidden");
  document.querySelector("#ticket-title").textContent = i18n[language].demoTicket;
  document.querySelector("#ticket-body").innerHTML = `
    <strong>${demoTicket.route}</strong>
    <span>${language === "ru" ? "Поезд" : "Train"}: ${demoTicket.train_number}</span>
    <span>${language === "ru" ? "Отправление" : "Departure"}: ${demoTicket.departure}</span>
    <span>${language === "ru" ? "Прибытие" : "Arrival"}: ${demoTicket.arrival}</span>
    <span>${language === "ru" ? "Вагон" : "Car"}: ${demoTicket.car}</span>
    <span>${language === "ru" ? "Место" : "Seat"}: ${demoTicket.seat}</span>
    <span>${demoTicket.travel_class}</span>
    <small>${demoTicket.disclaimer}</small>
  `;
  document.querySelector("#qr-payload").textContent = demoTicket.ticket_id;
  speak(language === "ru" ? "Демонстрационный билет готов." : "Your demo ticket is ready.");
}

// Web Speech API используется как быстрый браузерный STT для прототипа терминала.
function startVoiceRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    assistantSay(i18n[language].noSpeech);
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = language === "ru" ? "ru-RU" : "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  document.querySelector("#orb-button").classList.add("orb-listening");
  recognition.onresult = (event) => handleUserText(event.results[0][0].transcript);
  recognition.onerror = () => assistantSay(i18n[language].noSpeech);
  recognition.onend = () => document.querySelector("#orb-button").classList.remove("orb-listening");
  recognition.start();
}

// Любая реплика ассистента одновременно отображается на экране и озвучивается.
function assistantSay(text) {
  assistantText.textContent = text;
  speak(text);
}

// SpeechSynthesis дает двусторонний голосовой диалог без отдельного TTS-сервиса.
function speak(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language === "ru" ? "ru-RU" : "en-US";
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
}

// Небольшая обертка над fetch держит обмен с backend в одном формате JSON.
async function postJson(path, payload) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`API error ${response.status}`);
  }
  return response.json();
}

// Цены форматируются локально, чтобы карточки выглядели естественно на RU/EN экране.
function formatPrice(price) {
  if (!price) return "—";
  return `${price.toLocaleString(language === "ru" ? "ru-RU" : "en-US")} ₽`;
}

// Мини-пауза нужна только для презентационной анимации demo checkout.
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Если backend недоступен, интерфейс все равно показывает базовую карту и смысл
// концепта. Полный checkout требует backend, потому что билет формируется сервером.
function runLocalDemoFallback() {
  assistantSay(i18n[language].fallbackError);
  intent = normalizeIntent({}, i18n[language].fallbackError);
  renderIntent(intent);
  renderRoute(
    language === "ru"
      ? "Интересный факт: Казань стоит на пересечении культур и исторически была важным транспортным направлением Поволжья."
      : "Fun fact: Kazan sits at a cultural crossroads and has long been an important Volga region destination.",
  );
}

// Сброс очищает пользовательский путь, но оставляет карту на экране: терминал
// должен выглядеть эффектно еще до первого запроса.
function resetScenario(announce = true) {
  state = {};
  intent = null;
  trains = [];
  recommendations = [];
  selectedTrain = null;
  demoTicket = null;
  transcript.textContent = "";
  assistantText.textContent = i18n[language].assistantReady;
  [intentPanel, trainsPanel, checkoutPanel, ticketPanel].forEach((panel) => panel.classList.add("hidden"));
  document.querySelector("#route-meta").textContent =
    language === "ru" ? "Москва → Казань" : "Moscow → Kazan";
  document.querySelector("#route-fact").textContent =
    language === "ru"
      ? "Факт о маршруте появится после поиска билетов."
      : "A route fact will appear after ticket search.";
  routeLine.classList.remove("route-line-active");
  routePulse.classList.remove("route-pulse-active");
  if (announce) {
    speak(i18n[language].assistantReady);
  }
}
