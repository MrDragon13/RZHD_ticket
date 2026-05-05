// Backend URL можно переопределить через window.PATH_API_BASE_URL.
// По умолчанию используем относительный адрес: Caddy и nginx проксируют /api
// во внутренний backend-контейнер, а ключ DeepSeek остается только на сервере.
const API_BASE_URL = window.PATH_API_BASE_URL || "";

// Все пользовательские надписи вынесены в словарь, чтобы выбранный на первом
// экране язык проходил сквозь весь интерфейс, голосовые реплики и демо-билет.
const i18n = {
  ru: {
    title: "ПУТЬ",
    subtitle: "Интеллектуальный терминал РЖД",
    startPrompt: "Коснитесь сферы и скажите, куда вы хотите поехать",
    assistantReady: "Добро пожаловать. Куда направимся?",
    listen: "Слушать",
    textPlaceholder: "Например: хочу приехать в Казань к началу рабочего дня 6 мая и выспаться",
    send: "Отправить",
    history: "История диалога",
    understood: "Я понял запрос",
    route: "Маршрут",
    fact: "AI Fact",
    options: "Рекомендованные поезда",
    checkout: "Оформить демо-билет",
    demoFlow: ["Проверка маршрута", "Резервирование демонстрационного места", "Формирование QR-билета", "Готово"],
    demoTicket: "ДЕМО-БИЛЕТ",
    restart: "Начать заново",
    newSession: "Новый запрос",
    noSpeech: "Распознавание речи недоступно в этом браузере. Используйте текстовое поле.",
    fallbackError: "Сервер недоступен. Показываю демо-сценарий интерфейса.",
    userRole: "Вы",
    assistantRole: "Путь",
    stages: {
      initial: ["Казань утром", "Подешевле", "Хочу выспаться", "Без пересадок", "С ребенком"],
      searching: ["Покажи купе", "А есть быстрее?", "Самый дешевый", "Можно с животными?", "Женское купе"],
      results: ["Почему этот поезд?", "Покажи нижние места", "Есть ресторан?", "Выбрать лучший", "Начать заново"],
      checkout: ["Повтори билет", "Начать заново"],
    },
  },
  en: {
    title: "PATH",
    subtitle: "Smart Railway Terminal",
    startPrompt: "Touch the sphere and say where you want to go",
    assistantReady: "Welcome. Where are we heading?",
    listen: "Listen",
    textPlaceholder: "Example: I want to arrive in Kazan before the workday starts on May 6 and sleep",
    send: "Send",
    history: "Dialog history",
    understood: "Request understood",
    route: "Route",
    fact: "AI Fact",
    options: "Recommended trains",
    checkout: "Create demo ticket",
    demoFlow: ["Checking route", "Reserving demo seat", "Generating QR ticket", "Done"],
    demoTicket: "DEMO TICKET",
    restart: "Start over",
    newSession: "New request",
    noSpeech: "Speech recognition is not available in this browser. Use the text field.",
    fallbackError: "Server is unavailable. Showing interface demo scenario.",
    userRole: "You",
    assistantRole: "Path",
    stages: {
      initial: ["Kazan morning", "Cheaper", "I want to sleep", "Direct only", "With a child"],
      searching: ["Show coupe", "Any faster?", "Lowest price", "Pets allowed?", "Female compartment"],
      results: ["Why this train?", "Show lower berths", "Restaurant car?", "Choose best", "Start over"],
      checkout: ["Repeat ticket", "Start over"],
    },
  },
};

// Условные координаты для вау-карты. Геометрия не претендует на точную ГИС,
// но визуально меняет направление, масштаб и остановки под выбранный маршрут.
const routeVisuals = {
  "Казань": {
    destination: { x: 790, y: 115, labelX: 730, labelY: 95 },
    line: "M125 350 C260 255 390 280 535 210 S700 155 790 115",
    stops: ["Канаш", "Зеленый Дол"],
  },
  "Kazan": {
    destination: { x: 790, y: 115, labelX: 730, labelY: 95 },
    line: "M125 350 C260 255 390 280 535 210 S700 155 790 115",
    stops: ["Kanash", "Zeleny Dol"],
  },
  "Санкт-Петербург": {
    destination: { x: 430, y: 80, labelX: 335, labelY: 62 },
    line: "M125 350 C190 235 265 150 430 80",
    stops: ["Тверь", "Бологое"],
  },
  "Saint Petersburg": {
    destination: { x: 430, y: 80, labelX: 335, labelY: 62 },
    line: "M125 350 C190 235 265 150 430 80",
    stops: ["Tver", "Bologoye"],
  },
  "Сочи": {
    destination: { x: 710, y: 455, labelX: 670, labelY: 488 },
    line: "M125 350 C260 420 420 480 560 430 S650 385 710 455",
    stops: ["Ростов-на-Дону", "Краснодар"],
  },
  "Sochi": {
    destination: { x: 710, y: 455, labelX: 670, labelY: 488 },
    line: "M125 350 C260 420 420 480 560 430 S650 385 710 455",
    stops: ["Rostov-on-Don", "Krasnodar"],
  },
  default: {
    destination: { x: 790, y: 115, labelX: 730, labelY: 95 },
    line: "M125 350 C260 255 390 280 535 210 S700 155 790 115",
    stops: ["Канаш", "Зеленый Дол"],
  },
};

const amenityLabels = {
  ru: {
    conditioner: "кондиционер",
    restaurant: "вагон-ресторан",
    pets_allowed: "можно с животными",
    female_compartment: "женское купе",
    usb: "USB",
    quiet_car: "тихий вагон",
    luggage: "багаж",
    wifi_demo: "Wi-Fi demo",
    business_class: "бизнес-класс",
    no_pets: "без животных",
    shower: "душ",
    family_car: "семейный вагон",
  },
  en: {
    conditioner: "air conditioning",
    restaurant: "restaurant car",
    pets_allowed: "pets allowed",
    female_compartment: "female compartment",
    usb: "USB",
    quiet_car: "quiet car",
    luggage: "luggage",
    wifi_demo: "Wi-Fi demo",
    business_class: "business class",
    no_pets: "no pets",
    shower: "shower",
    family_car: "family car",
  },
};

let language = "ru";
let state = {};
let intent = null;
let trains = [];
let recommendations = [];
let selectedTrain = null;
let demoTicket = null;
let dialogMessages = [];
let uiStage = "initial";

const screens = {
  language: document.querySelector("#language-screen"),
  terminal: document.querySelector("#terminal-screen"),
};
const assistantText = document.querySelector("#assistant-text");
const userInput = document.querySelector("#user-input");
const languageBadge = document.querySelector("#language-badge");
const transcript = document.querySelector("#transcript");
const intentPanel = document.querySelector("#intent-panel");
const trainsPanel = document.querySelector("#trains-panel");
const checkoutPanel = document.querySelector("#checkout-panel");
const ticketPanel = document.querySelector("#ticket-panel");
const routeLine = document.querySelector("#route-line");
const routePulse = document.querySelector("#route-pulse");
const dialogHistory = document.querySelector("#dialog-history");
const newSessionButton = document.querySelector("#new-session-button");

document.querySelectorAll("[data-language]").forEach((button) => {
  button.addEventListener("click", () => setLanguage(button.dataset.language));
});
document.querySelector("#send-button").addEventListener("click", () => handleUserText(userInput.value));
document.querySelector("#orb-button").addEventListener("click", startVoiceRecognition);
document.querySelector("#restart-button").addEventListener("click", () => resetScenario(true));
newSessionButton.addEventListener("click", () => resetScenario(true));
userInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    handleUserText(userInput.value);
  }
});

// Чипы меняются в зависимости от стадии сценария: старт, поиск, результаты,
// оформление. Неактуальные подсказки исчезают, чтобы экран не выглядел шумным.
document.querySelector("#chips").addEventListener("click", (event) => {
  if (!event.target.matches("button")) return;
  const action = event.target.dataset.action;
  if (action === "restart") {
    resetScenario(true);
    return;
  }
  if (action === "choose-best" && trains.length) {
    selectTrain(getSortedTrains()[0]);
    return;
  }
  if (action === "repeat-ticket" && demoTicket) {
    speak(language === "ru" ? "Демо-билет уже готов на экране." : "The demo ticket is already on screen.");
    return;
  }
  handleUserText(event.target.textContent);
});

function setLanguage(nextLanguage) {
  language = nextLanguage;
  const copy = i18n[language];
  screens.language.classList.add("hidden");
  screens.terminal.classList.remove("hidden");
  newSessionButton.classList.remove("hidden");
  languageBadge.textContent = language.toUpperCase();
  document.querySelector("#terminal-title").textContent = copy.title;
  document.querySelector("#terminal-subtitle").textContent = copy.subtitle;
  document.querySelector("#start-prompt").textContent = copy.startPrompt;
  document.querySelector("#send-button").textContent = copy.send;
  document.querySelector("#listen-label").textContent = copy.listen;
  document.querySelector("#history-title").textContent = copy.history;
  userInput.placeholder = copy.textPlaceholder;
  document.querySelector("#intent-title").textContent = copy.understood;
  document.querySelector("#route-title").textContent = copy.route;
  document.querySelector("#fact-title").textContent = copy.fact;
  document.querySelector("#trains-title").textContent = copy.options;
  document.querySelector("#restart-button").textContent = copy.restart;
  newSessionButton.textContent = copy.newSession;
  resetScenario(false);
  assistantSay(copy.assistantReady, { addToHistory: true });
}

function renderChips(stage = uiStage) {
  const chips = document.querySelector("#chips");
  chips.innerHTML = "";
  const labels = i18n[language].stages[stage] || [];
  chips.classList.toggle("hidden", labels.length === 0);
  labels.forEach((label) => {
    const button = document.createElement("button");
    button.className = "chip";
    button.textContent = label;
    if (/начать|start/i.test(label)) button.dataset.action = "restart";
    if (/выбрать лучший|choose best/i.test(label)) button.dataset.action = "choose-best";
    if (/повтори|repeat/i.test(label)) button.dataset.action = "repeat-ticket";
    chips.append(button);
  });
}

function setStage(nextStage) {
  uiStage = nextStage;
  renderChips();
}

async function handleUserText(text) {
  const cleanText = text.trim();
  if (!cleanText) return;
  // Очищаем поле только после фиксации текста в истории: пользователь видит,
  // что именно распознал микрофон или что он отправил вручную.
  transcript.textContent = cleanText;
  addMessage("user", cleanText);
  await runDialog(cleanText);
}

async function runDialog(text) {
  try {
    setStage("searching");
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
  setStage("results");
}

function renderIntent(data) {
  intentPanel.classList.remove("hidden");
  const windowText = data.arrival_time_window
    ? `${data.arrival_time_window.start}-${data.arrival_time_window.end}`
    : "-";
  document.querySelector("#intent-grid").innerHTML = `
    <div class="glass-card"><span>${language === "ru" ? "Откуда" : "From"}</span><strong>${data.origin || "-"}</strong></div>
    <div class="glass-card"><span>${language === "ru" ? "Куда" : "To"}</span><strong>${data.destination || "-"}</strong></div>
    <div class="glass-card"><span>${language === "ru" ? "Дата" : "Date"}</span><strong>${data.date || "-"}</strong></div>
    <div class="glass-card"><span>${language === "ru" ? "Прибытие" : "Arrival"}</span><strong>${windowText}</strong></div>
  `;
}

function renderRoute(factText) {
  const visual = findRouteVisual(intent.destination);
  routeLine.classList.remove("route-line-active");
  routeLine.setAttribute("d", visual.line);
  // Перезапускаем CSS-анимацию отрисовки маршрута при каждом новом направлении.
  void routeLine.getBoundingClientRect();
  routeLine.classList.add("route-line-active");
  routePulse.classList.add("route-pulse-active");
  updateMapGeometry(visual);
  document.querySelector("#route-meta").textContent = `${intent.origin} -> ${intent.destination} · ${routeDistanceLabel()}`;
  document.querySelector("#route-fact").textContent = factText;
}

function findRouteVisual(destination) {
  const normalized = (destination || "").toLowerCase();
  if (normalized.includes("петербург") || normalized.includes("petersburg")) return routeVisuals["Санкт-Петербург"];
  if (normalized.includes("сочи") || normalized.includes("sochi")) return routeVisuals["Сочи"];
  if (normalized.includes("каз") || normalized.includes("kazan")) return routeVisuals["Казань"];
  return routeVisuals.default;
}

function updateMapGeometry(visual) {
  const destinationDot = document.querySelector("#destination-dot");
  const originLabel = document.querySelector("#origin-label");
  const destinationLabel = document.querySelector("#destination-label");
  const stopA = document.querySelector("#stop-label-a");
  const stopB = document.querySelector("#stop-label-b");
  [destinationDot, routePulse].forEach((dot) => {
    if (!dot) return;
    dot.setAttribute("cx", visual.destination.x);
    dot.setAttribute("cy", visual.destination.y);
  });
  if (originLabel) originLabel.textContent = intent.origin || (language === "ru" ? "Москва" : "Moscow");
  if (destinationLabel) {
    destinationLabel.textContent = intent.destination || (language === "ru" ? "Казань" : "Kazan");
    destinationLabel.setAttribute("x", visual.destination.labelX);
    destinationLabel.setAttribute("y", visual.destination.labelY);
  }
  if (stopA) stopA.textContent = visual.stops[0] || "";
  if (stopB) stopB.textContent = visual.stops[1] || "";
}

function routeDistanceLabel() {
  const distance = trains[0]?.route_distance_km;
  const duration = trains[0]?.duration_label;
  if (!distance || !duration) return "";
  return `${distance} ${language === "ru" ? "км" : "km"} · ${duration}`;
}

function renderTrains() {
  trainsPanel.classList.remove("hidden");
  const list = document.querySelector("#trains-list");
  list.innerHTML = "";
  getSortedTrains().forEach((train, index) => {
    const recommendation = recommendationFor(train.id);
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
      <p>${train.departure_station} -> ${train.arrival_station}</p>
      <p>${train.duration_label} · ${train.route_distance_km} ${language === "ru" ? "км" : "km"}</p>
      <p class="reason">${recommendation?.explanation || ""}</p>
      <div class="seat-grid">
        <span>${language === "ru" ? "Нижние" : "Lower"}: ${train.seat_details?.lower ?? 0}</span>
        <span>${language === "ru" ? "Верхние" : "Upper"}: ${train.seat_details?.upper ?? 0}</span>
        <span>${language === "ru" ? "Боковые ниж." : "Side lower"}: ${train.seat_details?.side_lower ?? 0}</span>
        <span>${language === "ru" ? "Боковые верх." : "Side upper"}: ${train.seat_details?.side_upper ?? 0}</span>
      </div>
      <div class="amenity-row">${renderAmenityBadges(train.amenities)}</div>
      <div class="price-row">
        <span>${language === "ru" ? "Купе" : "Coupe"}: ${formatPrice(train.prices.coupe)}</span>
        <span>${language === "ru" ? "Плацкарт" : "Platzkart"}: ${formatPrice(train.prices.platzkart)}</span>
      </div>
    `;
    card.addEventListener("click", () => selectTrain(train));
    list.append(card);
  });
}

function recommendationFor(trainId) {
  return recommendations.find((item) => item.train_id === trainId);
}

function getSortedTrains() {
  const recommendationsById = new Map(recommendations.map((item) => [item.train_id, item]));
  return trains
    .slice()
    .sort((a, b) => (recommendationsById.get(b.id)?.score || 0) - (recommendationsById.get(a.id)?.score || 0));
}

function renderAmenityBadges(amenities = []) {
  return amenities
    .slice(0, 5)
    .map((item) => `<span class="amenity">${amenityLabels[language][item] || item}</span>`)
    .join("");
}

function selectTrain(train) {
  selectedTrain = train;
  checkoutPanel.classList.remove("hidden");
  const button = document.querySelector("#checkout-button");
  button.textContent = i18n[language].checkout;
  button.onclick = createTicket;
  const phrase =
    language === "ru"
      ? `Выбран поезд ${train.train_number}. Доступны нижние места: ${train.seat_details?.lower ?? 0}.`
      : `Train ${train.train_number} selected. Lower berths available: ${train.seat_details?.lower ?? 0}.`;
  assistantSay(phrase);
  setStage("checkout");
  checkoutPanel.scrollIntoView({ behavior: "smooth", block: "center" });
}

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

function renderTicket() {
  ticketPanel.classList.remove("hidden");
  document.querySelector("#ticket-title").textContent = i18n[language].demoTicket;
  const amenities = selectedTrain ? renderAmenityBadges(selectedTrain.amenities) : "";
  document.querySelector("#ticket-body").innerHTML = `
    <strong>${demoTicket.route}</strong>
    <span>${language === "ru" ? "Поезд" : "Train"}: ${demoTicket.train_number}</span>
    <span>${language === "ru" ? "Отправление" : "Departure"}: ${demoTicket.departure}</span>
    <span>${language === "ru" ? "Прибытие" : "Arrival"}: ${demoTicket.arrival}</span>
    <span>${language === "ru" ? "Вагон" : "Car"}: ${demoTicket.car}</span>
    <span>${language === "ru" ? "Место" : "Seat"}: ${demoTicket.seat}</span>
    <span>${language === "ru" ? "Полка" : "Berth"}: ${demoTicket.berth_type}</span>
    <span>${demoTicket.travel_class}</span>
    <div class="amenity-row">${amenities}</div>
    <small>${demoTicket.disclaimer}</small>
  `;
  document.querySelector("#qr-payload").textContent = demoTicket.ticket_id;
  assistantSay(language === "ru" ? "Демонстрационный билет готов." : "Your demo ticket is ready.");
}

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
  recognition.onresult = (event) => {
    const spokenText = event.results[0][0].transcript;
    // Голосовой ввод сначала появляется в поле: пассажир видит, что понял
    // браузерный STT, и только затем фраза отправляется ассистенту.
    userInput.value = spokenText;
    handleUserText(spokenText);
  };
  recognition.onerror = () => assistantSay(i18n[language].noSpeech);
  recognition.onend = () => document.querySelector("#orb-button").classList.remove("orb-listening");
  recognition.start();
}

function assistantSay(text, options = {}) {
  assistantText.textContent = text;
  if (options.addToHistory !== false) {
    addMessage("assistant", text);
  }
  speak(text);
}

function addMessage(role, text) {
  dialogMessages.push({ role, text });
  dialogMessages = dialogMessages.slice(-8);
  renderHistory();
}

function renderHistory() {
  dialogHistory.innerHTML = "";
  dialogMessages.forEach((message) => {
    const item = document.createElement("div");
    item.className = `message message-${message.role}`;
    item.innerHTML = `
      <span>${message.role === "user" ? i18n[language].userRole : i18n[language].assistantRole}</span>
      <p>${escapeHtml(message.text)}</p>
    `;
    dialogHistory.append(item);
  });
  dialogHistory.scrollTop = dialogHistory.scrollHeight;
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language === "ru" ? "ru-RU" : "en-US";
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
}

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

function formatPrice(price) {
  if (!price) return "-";
  return `${price.toLocaleString(language === "ru" ? "ru-RU" : "en-US")} ₽`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function runLocalDemoFallback() {
  assistantSay(i18n[language].fallbackError);
  intent = normalizeIntent({}, i18n[language].fallbackError);
  renderIntent(intent);
  trains = [];
  renderRoute(
    language === "ru"
      ? "Интересный факт: Казань стоит на пересечении культур и исторически была важным транспортным направлением Поволжья."
      : "Fun fact: Kazan sits at a cultural crossroads and has long been an important Volga region destination.",
  );
  setStage("initial");
}

function resetScenario(announce = true) {
  state = {};
  intent = null;
  trains = [];
  recommendations = [];
  selectedTrain = null;
  demoTicket = null;
  dialogMessages = [];
  userInput.value = "";
  transcript.textContent = "";
  assistantText.textContent = i18n[language].assistantReady;
  [intentPanel, trainsPanel, checkoutPanel, ticketPanel].forEach((panel) => panel.classList.add("hidden"));
  document.querySelector("#route-meta").textContent =
    language === "ru" ? "Москва -> Казань" : "Moscow -> Kazan";
  document.querySelector("#route-fact").textContent =
    language === "ru"
      ? "Факт о маршруте появится после поиска билетов."
      : "A route fact will appear after ticket search.";
  routeLine.classList.remove("route-line-active");
  routePulse.classList.remove("route-pulse-active");
  updateMapGeometry(routeVisuals.default);
  setStage("initial");
  renderHistory();
  if (announce) {
    assistantSay(i18n[language].assistantReady);
  }
}
