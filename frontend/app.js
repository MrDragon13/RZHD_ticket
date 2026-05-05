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
    textInputReveal: "Текст",
    textInputHide: "Скрыть",
    textInputAriaShow: "Показать текстовый ввод",
    textInputAriaHide: "Скрыть текстовый ввод",
    history: "История диалога",
    understood: "Я понял запрос",
    route: "Маршрут",
    fact: "AI Fact",
    options: "Рекомендованные поезда",
    checkout: "Оформить демо-билет",
    checkoutBusy: "Оформление…",
    checkoutFinalizing: "Отправка на сервер и получение билета…",
    checkoutError:
      "Не удалось выдать демо-билет. Проверьте соединение и нажмите кнопку ещё раз.",
    demoFlow: ["Проверка маршрута", "Подготовка выбора мест", "Загрузка схемы вагона", "Готово"],
    seatPickerTitle: "Выбор вагона и мест",
    seatPickerHint:
      "Места сгруппированы по купе: в кубике четыре места (два ряда по паре нижний/верхний). В СВ — купе из двух мест в ряд. Число мест на вагон соответствует типичной вместимости. Можно выбрать несколько.",
    seatPickerSelected: "Выбрано мест",
    seatPickerTotal: "Сумма",
    seatPickerConfirm: "Подтвердить выбор",
    seatPickerCarriage: "Вагон",
    selectedTrainHeading: "Выбранный поезд",
    carClassPlatzkart: "Плацкарт",
    carClassCoupe: "Купе",
    carClassSV: "СВ",
    compartmentFemale: "Женское купе",
    compartmentMale: "Мужское купе",
    compartmentMixed: "Смешанное купе",
    compartmentChildren: "Детское",
    compartmentFamily: "Семейное",
    compartmentUnknown: "",
    wagonServices: "Услуги вагона",
    addSignsLabel: "Код РЖД",
    berthShort: {
      lower: "Н",
      upper: "В",
      side_lower: "Бн",
      side_upper: "Бв",
    },
    demoTicket: "ДЕМО-БИЛЕТ",
    restart: "Начать заново",
    newSession: "Новый запрос",
    noSpeech: "Распознавание речи недоступно в этом браузере. Используйте текстовое поле.",
    fallbackError: "Сервер недоступен. Показываю демо-сценарий интерфейса.",
    clarifyHint: "Я дождусь уточнения и только потом подберу варианты.",
    userRole: "Вы",
    assistantRole: "Путь",
    stages: {
      initial: ["Казань утром", "Подешевле", "Хочу выспаться", "Без пересадок", "С ребенком"],
      searching: ["Покажи купе", "А есть быстрее?", "Самый дешевый", "Можно с животными?", "Женское купе"],
      results: ["Почему этот поезд?", "Покажи нижние места", "Есть ресторан?", "Выбрать лучший", "Начать заново"],
      checkout: ["Повтори билет", "Начать заново"],
      seatPicker: ["Начать заново"],
      ticket: ["Повтори билет", "Начать заново"],
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
    textInputReveal: "Text",
    textInputHide: "Hide",
    textInputAriaShow: "Show text input",
    textInputAriaHide: "Hide text input",
    history: "Dialog history",
    understood: "Request understood",
    route: "Route",
    fact: "AI Fact",
    options: "Recommended trains",
    checkout: "Create demo ticket",
    checkoutBusy: "Processing…",
    checkoutFinalizing: "Sending request and receiving your ticket…",
    checkoutError: "Could not issue the demo ticket. Check your connection and tap the button again.",
    demoFlow: ["Checking route", "Preparing seat selection", "Loading car layout", "Done"],
    seatPickerTitle: "Choose car and seats",
    seatPickerHint:
      "Seats are grouped into compartments: each cube is four berths (two columns of lower/upper). SV compartments show two berths side by side. Car capacity follows typical layouts. Multiple seats allowed.",
    seatPickerSelected: "Seats selected",
    seatPickerTotal: "Total",
    seatPickerConfirm: "Confirm selection",
    seatPickerCarriage: "Car",
    selectedTrainHeading: "Selected train",
    carClassPlatzkart: "Platzkart",
    carClassCoupe: "Coupe",
    carClassSV: "SV",
    compartmentFemale: "Female coupe",
    compartmentMale: "Male coupe",
    compartmentMixed: "Mixed coupe",
    compartmentChildren: "Children",
    compartmentFamily: "Family",
    compartmentUnknown: "",
    wagonServices: "Car services",
    addSignsLabel: "RZD code",
    berthShort: {
      lower: "L",
      upper: "U",
      side_lower: "SL",
      side_upper: "SU",
    },
    demoTicket: "DEMO TICKET",
    restart: "Start over",
    newSession: "New request",
    noSpeech: "Speech recognition is not available in this browser. Use the text field.",
    fallbackError: "Server is unavailable. Showing interface demo scenario.",
    clarifyHint: "I will wait for clarification before searching options.",
    userRole: "You",
    assistantRole: "Path",
    stages: {
      initial: ["Kazan morning", "Cheaper", "I want to sleep", "Direct only", "With a child"],
      searching: ["Show coupe", "Any faster?", "Lowest price", "Pets allowed?", "Female compartment"],
      results: ["Why this train?", "Show lower berths", "Restaurant car?", "Choose best", "Start over"],
      checkout: ["Repeat ticket", "Start over"],
      seatPicker: ["Start over"],
      ticket: ["Repeat ticket", "Start over"],
    },
  },
};

// Условные координаты для вау-карты. Геометрия не претендует на точную ГИС,
// но визуально меняет направление, масштаб и остановки под выбранный маршрут.
const routeVisuals = {
  "Казань": {
    destination: { x: 790, y: 115, labelX: 730, labelY: 95 },
    line: "M125 350 C260 255 390 280 535 210 S700 155 790 115",
    stops: [
      { name: "Муром", x: 278, y: 276 },
      { name: "Канаш", x: 535, y: 210 },
      { name: "Зеленый Дол", x: 665, y: 158 },
    ],
  },
  "Kazan": {
    destination: { x: 790, y: 115, labelX: 730, labelY: 95 },
    line: "M125 350 C260 255 390 280 535 210 S700 155 790 115",
    stops: [
      { name: "Murom", x: 278, y: 276 },
      { name: "Kanash", x: 535, y: 210 },
      { name: "Zeleny Dol", x: 665, y: 158 },
    ],
  },
  "Санкт-Петербург": {
    destination: { x: 430, y: 80, labelX: 335, labelY: 62 },
    line: "M125 350 C190 235 265 150 430 80",
    stops: [
      { name: "Тверь", x: 220, y: 232 },
      { name: "Бологое", x: 318, y: 142 },
    ],
  },
  "Saint Petersburg": {
    destination: { x: 430, y: 80, labelX: 335, labelY: 62 },
    line: "M125 350 C190 235 265 150 430 80",
    stops: [
      { name: "Tver", x: 220, y: 232 },
      { name: "Bologoye", x: 318, y: 142 },
    ],
  },
  "Сочи": {
    destination: { x: 710, y: 455, labelX: 670, labelY: 488 },
    line: "M125 350 C260 420 420 480 560 430 S650 385 710 455",
    stops: [
      { name: "Воронеж", x: 330, y: 430 },
      { name: "Ростов-на-Дону", x: 560, y: 430 },
      { name: "Краснодар", x: 650, y: 395 },
    ],
  },
  "Sochi": {
    destination: { x: 710, y: 455, labelX: 670, labelY: 488 },
    line: "M125 350 C260 420 420 480 560 430 S650 385 710 455",
    stops: [
      { name: "Voronezh", x: 330, y: 430 },
      { name: "Rostov-on-Don", x: 560, y: 430 },
      { name: "Krasnodar", x: 650, y: 395 },
    ],
  },
  default: {
    destination: { x: 790, y: 115, labelX: 730, labelY: 95 },
    line: "M125 350 C260 255 390 280 535 210 S700 155 790 115",
    stops: [
      { name: "Канаш", x: 535, y: 210 },
      { name: "Зеленый Дол", x: 665, y: 158 },
    ],
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
let checkoutAnimating = false;
let issuingTicket = false;
let demoCarriages = [];
let activeCarriageIndex = 0;
/** @type {Map<string, "platzkart" | "coupe" | "sv">} */
let demoCarriageClassByCar = new Map();

function carriageClassKey(car) {
  return demoCarriageClassByCar.get(car) || "platzkart";
}

function carriageClassLabel(car) {
  const key = carriageClassKey(car);
  if (key === "sv") return i18n[language].carClassSV;
  if (key === "coupe") return i18n[language].carClassCoupe;
  return i18n[language].carClassPlatzkart;
}

function mapTypeLabelToCarClass(typeLabel) {
  const t = String(typeLabel || "").toLowerCase();
  if (t.includes("св") || t.includes("люкс")) return "sv";
  if (t.includes("купе") || t.includes("сидяч")) return "coupe";
  if (t.includes("плац") || t.includes("общ")) return "platzkart";
  return null;
}

function normalizeCarriageCodeKey(code) {
  const s = String(code || "").trim();
  if (/^\d+$/.test(s)) return s.padStart(2, "0");
  return s;
}

function carriageDetailForTab(train, carCode) {
  const list = train?.carriage_details;
  if (!Array.isArray(list) || !list.length) return null;
  const want = normalizeCarriageCodeKey(carCode);
  for (const d of list) {
    const raw = String(d.number ?? "");
    const base = raw.split("-")[0];
    const keys = new Set([
      normalizeCarriageCodeKey(raw),
      normalizeCarriageCodeKey(base),
      raw,
      base,
    ]);
    if (keys.has(want) || keys.has(String(carCode))) return d;
  }
  return null;
}

function carriageClassFromTrain(train, carCode) {
  const det = carriageDetailForTab(train, carCode);
  const mapped = det && mapTypeLabelToCarClass(det.type_label);
  if (mapped) return mapped;
  return demoCarClassForCarCode(carCode, train);
}

function compartmentKindLabel(kind) {
  const copy = i18n[language];
  switch (kind) {
    case "female":
      return copy.compartmentFemale;
    case "male":
      return copy.compartmentMale;
    case "mixed":
      return copy.compartmentMixed;
    case "children":
      return copy.compartmentChildren;
    case "family":
      return copy.compartmentFamily;
    default:
      return copy.compartmentUnknown || "";
  }
}

/** Показывает данные РЖД по вагону (пол купе, услуги) под вкладками выбора вагона. */
function renderWagonMetaPanel() {
  if (!wagonMetaPanel) return;
  const car = demoCarriages[activeCarriageIndex];
  const detail = selectedTrain && car ? carriageDetailForTab(selectedTrain, car) : null;
  if (!detail) {
    wagonMetaPanel.classList.add("hidden");
    wagonMetaPanel.setAttribute("aria-hidden", "true");
    wagonMetaPanel.innerHTML = "";
    return;
  }

  const kind = compartmentKindLabel(detail.compartment_kind);
  const typeLine = String(detail.type_label || "").trim();
  const summary = String(detail.service_summary || "").trim();
  const signs = detail.add_signs_raw != null ? String(detail.add_signs_raw).trim() : "";
  const services = Array.isArray(detail.services_short) ? detail.services_short : [];

  const parts = [];
  if (typeLine) {
    parts.push(`<p class="wagon-meta-type">${escapeHtml(typeLine)}</p>`);
  }
  if (kind) {
    parts.push(`<p class="wagon-meta-kind"><span class="wagon-meta-kind-badge">${escapeHtml(kind)}</span></p>`);
  }
  if (signs) {
    parts.push(
      `<p class="wagon-meta-signs"><span class="wagon-meta-sign-label">${escapeHtml(i18n[language].addSignsLabel)}</span><code>${escapeHtml(signs)}</code></p>`,
    );
  }
  if (summary) {
    parts.push(`<p class="wagon-meta-summary">${escapeHtml(summary)}</p>`);
  }
  if (services.length) {
    const chips = services
      .map((s) => `<span class="wagon-meta-chip">${escapeHtml(String(s))}</span>`)
      .join("");
    parts.push(
      `<div class="wagon-meta-services"><span class="wagon-meta-services-label">${escapeHtml(i18n[language].wagonServices)}</span><div class="wagon-meta-chip-row">${chips}</div></div>`,
    );
  }

  if (!parts.length) {
    wagonMetaPanel.classList.add("hidden");
    wagonMetaPanel.setAttribute("aria-hidden", "true");
    wagonMetaPanel.innerHTML = "";
    return;
  }

  wagonMetaPanel.innerHTML = parts.join("");
  wagonMetaPanel.classList.remove("hidden");
  wagonMetaPanel.setAttribute("aria-hidden", "false");
}

function demoCarClassForCarCode(carCode, train) {
  const n = parseInt(carCode, 10) || 1;
  const hasSv = Boolean(train?.prices?.sv);
  const hasCoupe = Boolean(train?.prices?.coupe);
  const hasPlatz = Boolean(train?.prices?.platzkart);
  if (hasSv && n === 3) return "sv";
  if (hasCoupe && n % 2 === 1) return "coupe";
  if (hasPlatz) return "platzkart";
  if (hasCoupe) return "coupe";
  return "platzkart";
}
/** @type {Map<string, Array<{ id: string, displayNum: string, berth_kind: string, occupied: boolean }>>} */
let demoSeatLayouts = new Map();
/** @type {Set<string>} */
let selectedSeatKeys = new Set();
let dialogMessages = [];
let uiStage = "initial";
let speechQueue = [];
let isSpeaking = false;
let audioContext = null;
let textInputPanelOpen = false;
let lastDialogUserText = "";
let lastSelectedTrainId = null;

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
const seatPickerPanel = document.querySelector("#seat-picker-panel");
const mapContent = document.querySelector("#map-content");
const mainWorkspace = document.querySelector("#main-workspace");
const checkoutWorkspace = document.querySelector("#checkout-workspace");
const checkoutMapHost = document.querySelector("#checkout-map-host");
const routePanel = document.querySelector("#route-panel");
const checkoutTrainSummary = document.querySelector("#checkout-train-summary");
const checkoutTrainSummaryBody = document.querySelector("#checkout-train-summary-body");
const checkoutTrainSummaryLabel = document.querySelector("#checkout-train-summary-label");
const checkoutButton = document.querySelector("#checkout-button");
const confirmSeatsButton = document.querySelector("#confirm-seats-button");
const wagonMetaPanel = document.querySelector("#wagon-meta-panel");
const orbButton = document.querySelector("#orb-button");
const routeLine = document.querySelector("#route-line");
const routePulse = document.querySelector("#route-pulse");
const dialogHistory = document.querySelector("#dialog-history");
const newSessionButton = document.querySelector("#new-session-button");
const routeState = document.querySelector("#route-state");
const textInputPanel = document.querySelector("#text-input-panel");
const textInputToggle = document.querySelector("#text-input-toggle");

document.querySelectorAll("[data-language]").forEach((button) => {
  button.addEventListener("click", () => setLanguage(button.dataset.language));
});
document.querySelector("#send-button").addEventListener("click", () => handleUserText(userInput.value));
orbButton.addEventListener("click", startVoiceRecognition);
orbButton.classList.add("orb-idle");
document.querySelector("#restart-button").addEventListener("click", () => resetScenario(true));
newSessionButton.addEventListener("click", () => resetScenario(true));
checkoutButton.addEventListener("click", () => createTicket());
confirmSeatsButton.addEventListener("click", () => confirmSeatSelection());
userInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    handleUserText(userInput.value);
  }
});

textInputToggle.addEventListener("click", () => {
  setTextInputPanelOpen(!textInputPanelOpen);
});

function setTextInputPanelOpen(open) {
  textInputPanelOpen = open;
  textInputPanel.classList.toggle("hidden", !open);
  textInputToggle.setAttribute("aria-expanded", open ? "true" : "false");
  const copy = i18n[language];
  textInputToggle.textContent = open ? copy.textInputHide : copy.textInputReveal;
  textInputToggle.setAttribute("aria-label", open ? copy.textInputAriaHide : copy.textInputAriaShow);
  if (open) {
    userInput.focus();
  }
}

function updateTextInputToggleLabels() {
  const copy = i18n[language];
  textInputToggle.textContent = textInputPanelOpen ? copy.textInputHide : copy.textInputReveal;
  textInputToggle.setAttribute("aria-label", textInputPanelOpen ? copy.textInputAriaHide : copy.textInputAriaShow);
}

updateTextInputToggleLabels();

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
    if (uiStage === "ticket") {
      ticketPanel.scrollIntoView({ behavior: "smooth", block: "center" });
      enqueueSpeech(language === "ru" ? "Билет на экране слева." : "Your ticket is on the left screen.");
    } else {
      enqueueSpeech(language === "ru" ? "Демо-билет уже готов на экране." : "The demo ticket is already on screen.");
    }
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
  document.querySelector("#seat-picker-title").textContent = copy.seatPickerTitle;
  document.querySelector("#seat-picker-hint").textContent = copy.seatPickerHint;
  confirmSeatsButton.textContent = copy.seatPickerConfirm;
  resetScenario(false);
  updateTextInputToggleLabels();
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
  if (nextStage === "initial") setOrbMode("idle");
  if (nextStage === "searching") setOrbMode("thinking");
  if (nextStage === "results") setOrbMode("speaking");
  if (nextStage === "checkout" || nextStage === "seatPicker" || nextStage === "ticket") setOrbMode("idle");
}

async function handleUserText(text) {
  const cleanText = text.trim();
  if (!cleanText) return;
  lastDialogUserText = cleanText;
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
    if (response.action === "search_tickets" && hasRequiredTripFields(intent)) {
      await searchAndRecommend();
    } else {
      setStage("initial");
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
    origin: rawState.origin || null,
    destination: rawState.destination || null,
    date: rawState.date || null,
    departure_time_window: rawState.departure_time_window || null,
    arrival_time_window: rawState.arrival_time_window || null,
    preferences: rawState.preferences || ["sleep", "comfort"],
    priority: rawState.priority || "arrival_time",
    transfers: rawState.transfers || "direct_preferred",
    rank_with_llm: Boolean(rawState.rank_with_llm),
    assistant_text,
  };
}

function hasRequiredTripFields(data) {
  // Поиск запускается только когда ассистент уже получил все обязательные
  // параметры. Если он спросил уточнение, интерфейс ждет следующую реплику.
  return Boolean(data.origin && data.destination && data.date);
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
  trains = ticketResponse.trains.filter((t) => {
    const s = t.available_seats || {};
    return (s.platzkart || 0) + (s.coupe || 0) + (s.sv || 0) > 0;
  });
  renderRoute(factResponse.fact);
  const recommendResponse = await postJson("/api/recommend", {
    language,
    intent,
    trains,
    last_user_message: lastDialogUserText || null,
  });
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
  const stopDots = [
    document.querySelector("#stop-dot-a"),
    document.querySelector("#stop-dot-b"),
    document.querySelector("#stop-dot-c"),
  ];
  const stopLabels = [
    document.querySelector("#stop-label-a"),
    document.querySelector("#stop-label-b"),
    document.querySelector("#stop-label-c"),
  ];
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
  stopDots.forEach((dot, index) => updateStopPoint(dot, stopLabels[index], visual.stops[index]));
}

function updateStopPoint(dot, label, stop) {
  if (!dot || !label) return;
  if (!stop) {
    dot.classList.add("hidden-map-point");
    label.textContent = "";
    return;
  }
  dot.classList.remove("hidden-map-point");
  dot.setAttribute("cx", stop.x);
  dot.setAttribute("cy", stop.y);
  label.setAttribute("x", stop.x + 12);
  label.setAttribute("y", stop.y - 12);
  label.textContent = stop.name;
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
  const highlightId = getTrainHighlightId();
  getSortedTrains().forEach((train) => {
    const recommendation = recommendationFor(train.id);
    const card = document.createElement("article");
    card.dataset.trainId = train.id;
    card.className = `train-card ${train.id === highlightId ? "train-card-best" : ""}`;
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

function getTrainHighlightId() {
  const sorted = getSortedTrains();
  if (!sorted.length) return null;
  if (selectedTrain && sorted.some((t) => t.id === selectedTrain.id)) {
    return selectedTrain.id;
  }
  return sorted[0].id;
}

function updateTrainCardHighlight() {
  const list = document.querySelector("#trains-list");
  if (!list) return;
  const highlightId = getTrainHighlightId();
  list.querySelectorAll(".train-card").forEach((card) => {
    card.classList.toggle("train-card-best", highlightId !== null && card.dataset.trainId === highlightId);
  });
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
  if (!checkoutAnimating && !issuingTicket) {
    checkoutButton.textContent = i18n[language].checkout;
    checkoutButton.disabled = false;
  }
  const sameAsBefore = lastSelectedTrainId === train.id;
  lastSelectedTrainId = train.id;
  if (!sameAsBefore) {
    const phrase =
      language === "ru"
        ? `Выбран поезд ${train.train_number}. Доступны нижние места: ${train.seat_details?.lower ?? 0}.`
        : `Train ${train.train_number} selected. Lower berths available: ${train.seat_details?.lower ?? 0}.`;
    assistantSay(phrase);
  }
  setStage("checkout");
  updateTrainCardHighlight();
  checkoutPanel.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function createTicket() {
  if (checkoutAnimating || issuingTicket || !selectedTrain) return;
  checkoutAnimating = true;
  checkoutButton.disabled = true;
  checkoutButton.textContent = i18n[language].checkoutBusy;
  const steps = document.querySelector("#checkout-steps");
  steps.innerHTML = "";
  try {
    for (const step of i18n[language].demoFlow) {
      const item = document.createElement("div");
      item.className = "checkout-step";
      item.textContent = step;
      steps.append(item);
      await wait(260);
      item.classList.add("checkout-step-done");
    }
    checkoutPanel.classList.add("hidden");
    steps.innerHTML = "";
    buildSeatPickerModel(selectedTrain);
    showSeatPicker();
  } finally {
    checkoutAnimating = false;
    checkoutButton.disabled = false;
    checkoutButton.textContent = i18n[language].checkout;
  }
}

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function priceForSeatBerth(train, berthKind) {
  const sp = train?.seat_prices;
  if (sp) {
    if (berthKind === "lower" && sp.lower != null) return sp.lower;
    if (berthKind === "upper" && sp.upper != null) return sp.upper;
    if (berthKind === "side_lower" && sp.side_lower != null) return sp.side_lower;
    if (berthKind === "side_upper" && sp.side_upper != null) return sp.side_upper;
  }
  return null;
}

function priceForCarriageClass(train, classKey) {
  if (!train?.prices) return 0;
  if (classKey === "sv" && train.prices.sv) return train.prices.sv;
  if (classKey === "coupe" && train.prices.coupe) return train.prices.coupe;
  if (train.prices.platzkart) return train.prices.platzkart;
  if (train.prices.coupe) return train.prices.coupe;
  if (train.prices.sv) return train.prices.sv;
  return 0;
}

function unitPriceForSeat(train, carCode, seat) {
  if (seat?.price_rub != null && seat.price_rub > 0) return seat.price_rub;
  const pb = priceForSeatBerth(train, seat.berth_kind);
  if (pb != null && pb > 0) return pb;
  return priceForCarriageClass(train, carriageClassKey(carCode));
}

function selectedSeatsOrderTotalRub() {
  if (!selectedTrain) return 0;
  let sum = 0;
  for (const car of demoCarriages) {
    const seats = demoSeatLayouts.get(car) || [];
    seats.forEach((seat) => {
      if (!selectedSeatKeys.has(seat.id)) return;
      sum += unitPriceForSeat(selectedTrain, car, seat);
    });
  }
  return sum;
}

/** Типичная вместимость одного вагона для демо-схемы (данные с бэкенда или запасные значения). */
function carriageCapacityForClass(train, cls) {
  const t = train || {};
  if (cls === "sv") {
    const n = Number(t.sv_carriage_seats);
    if (Number.isFinite(n) && n >= 2) return Math.min(Math.max(Math.round(n), 2), 24);
    return 18;
  }
  if (cls === "coupe") {
    if (t.coupe_double_deck) {
      const n = Number(t.coupe_double_deck_seats);
      if (Number.isFinite(n) && n >= 4) return Math.min(Math.max(Math.round(n), 4), 72);
      return 64;
    }
    const n = Number(t.coupe_carriage_seats);
    if (Number.isFinite(n) && n >= 4) return Math.min(Math.max(Math.round(n), 4), 40);
    return 36;
  }
  const n = Number(t.platzkart_carriage_seats);
  if (Number.isFinite(n) && n >= 4) return Math.min(Math.max(Math.round(n), 4), 72);
  return 54;
}

/** Генерирует места для одного «этажа» вагона (непрерывная нумерация с seatNum). Возвращает { seats, nextNum }. */
function buildBerthSeatSpan(car, capacity, startSeatNum, deckIndex, rng, compartmentIndexOffset) {
  const seats = [];
  if (capacity <= 0) return { seats, nextNum: startSeatNum };
  let seatNum = startSeatNum;
  const fullCompartments = Math.floor(capacity / 4);
  const remainder = capacity % 4;
  for (let comp = 0; comp < fullCompartments; comp += 1) {
    const compIdx = compartmentIndexOffset + comp;
    for (let pairSlot = 0; pairSlot < 2; pairSlot += 1) {
      const lowerNum = seatNum;
      const upperNum = seatNum + 1;
      seatNum += 2;
      seats.push({
        id: `${car}-${String(lowerNum).padStart(2, "0")}-lower`,
        displayNum: String(lowerNum).padStart(2, "0"),
        berth_kind: "lower",
        compartmentIndex: compIdx,
        pairIndex: pairSlot,
        deckIndex,
        occupied: rng() > 0.42,
      });
      seats.push({
        id: `${car}-${String(upperNum).padStart(2, "0")}-upper`,
        displayNum: String(upperNum).padStart(2, "0"),
        berth_kind: "upper",
        compartmentIndex: compIdx,
        pairIndex: pairSlot,
        deckIndex,
        occupied: rng() > 0.42,
      });
    }
  }
  if (remainder === 2) {
    const comp = compartmentIndexOffset + fullCompartments;
    const lowerNum = seatNum;
    const upperNum = seatNum + 1;
    seats.push({
      id: `${car}-${String(lowerNum).padStart(2, "0")}-lower`,
      displayNum: String(lowerNum).padStart(2, "0"),
      berth_kind: "lower",
      compartmentIndex: comp,
      pairIndex: 0,
      deckIndex,
      occupied: rng() > 0.42,
    });
    seats.push({
      id: `${car}-${String(upperNum).padStart(2, "0")}-upper`,
      displayNum: String(upperNum).padStart(2, "0"),
      berth_kind: "upper",
      compartmentIndex: comp,
      pairIndex: 0,
      deckIndex,
      occupied: rng() > 0.42,
    });
  } else if (remainder === 3) {
    const comp = compartmentIndexOffset + fullCompartments;
    const lower1 = seatNum;
    const upper1 = seatNum + 1;
    const lower2 = seatNum + 2;
    seatNum += 3;
    seats.push({
      id: `${car}-${String(lower1).padStart(2, "0")}-lower`,
      displayNum: String(lower1).padStart(2, "0"),
      berth_kind: "lower",
      compartmentIndex: comp,
      pairIndex: 0,
      deckIndex,
      occupied: rng() > 0.42,
    });
    seats.push({
      id: `${car}-${String(upper1).padStart(2, "0")}-upper`,
      displayNum: String(upper1).padStart(2, "0"),
      berth_kind: "upper",
      compartmentIndex: comp,
      pairIndex: 0,
      deckIndex,
      occupied: rng() > 0.42,
    });
    seats.push({
      id: `${car}-${String(lower2).padStart(2, "0")}-lower`,
      displayNum: String(lower2).padStart(2, "0"),
      berth_kind: "lower",
      compartmentIndex: comp,
      pairIndex: 1,
      deckIndex,
      occupied: rng() > 0.42,
    });
  }
  return { seats, nextNum: seatNum };
}

function attachSeatPrices(train, carCode, cls, seats) {
  const sp = train?.seat_prices;
  if (!sp) return seats;
  return seats.map((seat) => {
    let rub = null;
    if (seat.berth_kind === "lower") rub = sp.lower;
    else if (seat.berth_kind === "upper") rub = sp.upper;
    else if (seat.berth_kind === "side_lower") rub = sp.side_lower;
    else if (seat.berth_kind === "side_upper") rub = sp.side_upper;
    if (rub == null || rub <= 0) return seat;
    return { ...seat, price_rub: rub };
  });
}

function compartmentCountForCapacity(capacity) {
  const fc = Math.floor(capacity / 4);
  const r = capacity % 4;
  return fc + (r === 2 || r === 3 ? 1 : 0);
}

function buildSeatPickerModel(train) {
  const layouts = new Map();
  const rng = mulberry32(hashSeed(train.id || train.train_number || "train"));
  const rawList =
    Array.isArray(train.carriage_details) && train.carriage_details.length > 0
      ? train.carriage_details.map((d) => String(d.number))
      : Array.from({ length: 8 }, (_, i) => String(i + 1).padStart(2, "0"));
  demoCarriages = rawList;
  demoCarriageClassByCar = new Map();
  rawList.forEach((car) => {
    demoCarriageClassByCar.set(car, carriageClassFromTrain(train, car));
  });
  activeCarriageIndex = 0;
  selectedSeatKeys = new Set();

  rawList.forEach((car) => {
    const cls = carriageClassKey(car);
    const capacity = carriageCapacityForClass(train, cls);
    let seats = [];

    if (cls === "sv") {
      const compartments = Math.floor(capacity / 2);
      let seatNum = 1;
      for (let comp = 0; comp < compartments; comp += 1) {
        seats.push({
          id: `${car}-${String(seatNum).padStart(2, "0")}-lower`,
          displayNum: String(seatNum).padStart(2, "0"),
          berth_kind: "lower",
          compartmentIndex: comp,
          pairIndex: 0,
          deckIndex: 0,
          occupied: rng() > 0.42,
        });
        seatNum += 1;
        seats.push({
          id: `${car}-${String(seatNum).padStart(2, "0")}-upper`,
          displayNum: String(seatNum).padStart(2, "0"),
          berth_kind: "upper",
          compartmentIndex: comp,
          pairIndex: 0,
          deckIndex: 0,
          occupied: rng() > 0.42,
        });
        seatNum += 1;
      }
      seats = attachSeatPrices(train, car, cls, seats);
      layouts.set(car, seats);
      return;
    }

    if (cls === "coupe" && train.coupe_double_deck && capacity >= 8) {
      const perDeck = Math.floor(capacity / 2);
      const d1 = buildBerthSeatSpan(car, perDeck, 1, 0, rng, 0);
      const off = compartmentCountForCapacity(perDeck);
      const d2 = buildBerthSeatSpan(car, perDeck, d1.nextNum, 1, rng, off);
      seats = attachSeatPrices(train, car, cls, [...d1.seats, ...d2.seats]);
      layouts.set(car, seats);
      return;
    }

    const span = buildBerthSeatSpan(car, capacity, 1, 0, rng, 0);
    seats = attachSeatPrices(train, car, cls, span.seats);
    layouts.set(car, seats);
  });
  demoSeatLayouts = layouts;
}

function createSeatButton(car, seat) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `seat-cell ${seat.berth_kind === "upper" ? "seat-cell-upper" : "seat-cell-lower"}`;
  btn.dataset.seatId = seat.id;
  const short = i18n[language].berthShort[seat.berth_kind] || "";
  btn.innerHTML = `<span class="seat-num">${seat.displayNum}</span><span class="seat-berth">${short}</span>`;
  if (seat.occupied) {
    btn.classList.add("seat-occupied");
    btn.disabled = true;
  } else if (selectedSeatKeys.has(seat.id)) {
    btn.classList.add("seat-selected");
  }
  btn.addEventListener("click", () => toggleSeatSelection(car, seat));
  return btn;
}

function renderCheckoutTrainSummary(train) {
  if (!checkoutTrainSummary || !checkoutTrainSummaryBody || !checkoutTrainSummaryLabel) return;
  checkoutTrainSummaryLabel.textContent = i18n[language].selectedTrainHeading;
  const recommendation = recommendationFor(train.id);
  checkoutTrainSummaryBody.innerHTML = `
    <div class="checkout-train-row checkout-train-main">
      <span class="checkout-train-num">${train.train_number}</span>
      <span class="checkout-train-badge">${recommendation?.badges?.[0] || (language === "ru" ? "Выбор" : "Pick")}</span>
    </div>
    <div class="checkout-train-times">
      <strong>${train.departure_time}</strong>
      <span class="checkout-train-dash"></span>
      <strong>${train.arrival_time}</strong>
    </div>
    <p class="checkout-train-route">${train.departure_station} → ${train.arrival_station}</p>
    <p class="checkout-train-meta">${train.duration_label} · ${train.route_distance_km} ${language === "ru" ? "км" : "km"}</p>
    ${recommendation?.explanation ? `<p class="checkout-train-reason">${escapeHtml(recommendation.explanation)}</p>` : ""}
    <div class="checkout-train-amenities">${renderAmenityBadges(train.amenities)}</div>
    <div class="checkout-train-prices">
      <span>${language === "ru" ? "Купе" : "Coupe"}: ${formatPrice(train.prices.coupe)}</span>
      <span>${language === "ru" ? "Плацкарт" : "Platzkart"}: ${formatPrice(train.prices.platzkart)}</span>
    </div>
  `;
  checkoutTrainSummary.classList.remove("hidden");
  checkoutTrainSummary.setAttribute("aria-hidden", "false");
}

function hideCheckoutTrainSummary() {
  if (!checkoutTrainSummary) return;
  checkoutTrainSummary.classList.add("hidden");
  checkoutTrainSummary.setAttribute("aria-hidden", "true");
}

function enterCheckoutWorkspaceMode() {
  if (!checkoutWorkspace || !mainWorkspace || !checkoutMapHost || !mapContent || !routePanel) return;
  mainWorkspace.classList.add("hidden");
  checkoutWorkspace.classList.remove("hidden");
  if (mapContent.parentElement !== checkoutMapHost) {
    checkoutMapHost.append(mapContent);
  }
}

function exitCheckoutWorkspaceMode() {
  if (!checkoutWorkspace || !mainWorkspace || !mapContent || !routePanel) return;
  seatPickerPanel.classList.add("hidden");
  hideCheckoutTrainSummary();
  checkoutWorkspace.classList.add("hidden");
  mainWorkspace.classList.remove("hidden");
  if (mapContent.parentElement !== routePanel) {
    routePanel.insertBefore(mapContent, ticketPanel);
  }
}

function showSeatPicker() {
  ticketPanel.classList.add("hidden");
  enterCheckoutWorkspaceMode();
  if (selectedTrain) renderCheckoutTrainSummary(selectedTrain);
  seatPickerPanel.classList.remove("hidden");
  document.querySelector("#seat-picker-title").textContent = i18n[language].seatPickerTitle;
  document.querySelector("#seat-picker-hint").textContent = i18n[language].seatPickerHint;
  confirmSeatsButton.textContent = i18n[language].seatPickerConfirm;
  renderCarriageTabs();
  renderSeatGrid();
  updateSeatPickerChrome();
  setStage("seatPicker");
  assistantSay(
    language === "ru"
      ? "Выберите вагон и места на схеме. Можно указать несколько мест."
      : "Choose a car and seats on the layout. Multiple seats are allowed.",
  );
  document.querySelector("#checkout-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderCarriageTabs() {
  const host = document.querySelector("#carriage-tabs");
  host.innerHTML = "";
  demoCarriages.forEach((car, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `carriage-tab ${index === activeCarriageIndex ? "carriage-tab-active" : ""}`;
    btn.dataset.carriageIndex = String(index);
    btn.innerHTML = `<span class="carriage-tab-num">${i18n[language].seatPickerCarriage} ${car}</span><span class="carriage-tab-class">${escapeHtml(carriageClassLabel(car))}</span>`;
    btn.addEventListener("click", () => {
      activeCarriageIndex = index;
      renderCarriageTabs();
      renderSeatGrid();
      updateSeatPickerChrome();
    });
    host.append(btn);
  });
}

function appendStandardCoupeCube(grid, car, compSeats) {
  const byPair = new Map();
  compSeats.forEach((seat) => {
    const pi = seat.pairIndex ?? 0;
    if (!byPair.has(pi)) byPair.set(pi, {});
    const slot = byPair.get(pi);
    if (seat.berth_kind === "upper") slot.upper = seat;
    else slot.lower = seat;
  });
  const pairIndices = [...byPair.keys()].sort((a, b) => a - b);
  const cube = document.createElement("div");
  cube.className = "compartment-cube";
  pairIndices.forEach((pairIdx) => {
    const slot = byPair.get(pairIdx);
    const col = document.createElement("div");
    col.className = "seat-column";
    [slot.upper, slot.lower].forEach((seat) => {
      if (!seat) return;
      col.append(createSeatButton(car, seat));
    });
    cube.append(col);
  });
  grid.append(cube);
}

function renderSeatGrid() {
  renderWagonMetaPanel();
  const grid = document.querySelector("#seat-grid");
  grid.innerHTML = "";
  const car = demoCarriages[activeCarriageIndex];
  const classLine = document.createElement("p");
  classLine.className = "seat-grid-class-line";
  classLine.textContent = `${carriageClassLabel(car)} · ${i18n[language].seatPickerCarriage} ${car}`;
  grid.append(classLine);
  const seats = demoSeatLayouts.get(car) || [];
  const byCompartment = new Map();
  seats.forEach((seat) => {
    const ci = seat.compartmentIndex ?? 0;
    if (!byCompartment.has(ci)) byCompartment.set(ci, []);
    byCompartment.get(ci).push(seat);
  });
  const cls = carriageClassKey(car);
  const compIndices = [...byCompartment.keys()].sort((a, b) => a - b);
  const isDoubleCoupe = cls === "coupe" && selectedTrain?.coupe_double_deck;
  if (isDoubleCoupe) {
    const d0 = compIndices.filter((i) => (byCompartment.get(i) || []).some((s) => s.deckIndex === 0));
    const d1 = compIndices.filter((i) => (byCompartment.get(i) || []).some((s) => s.deckIndex === 1));
    if (d0.length) {
      const row0 = document.createElement("div");
      row0.className = "car-deck-row";
      const l0 = document.createElement("p");
      l0.className = "car-deck-label";
      l0.textContent = language === "ru" ? "1 этаж" : "1st deck";
      row0.append(l0);
      const flex0 = document.createElement("div");
      flex0.className = "car-deck-cubes";
      d0.forEach((compIdx) => {
        appendStandardCoupeCube(flex0, car, byCompartment.get(compIdx) || []);
      });
      row0.append(flex0);
      grid.append(row0);
    }
    if (d1.length) {
      const row1 = document.createElement("div");
      row1.className = "car-deck-row";
      const l1 = document.createElement("p");
      l1.className = "car-deck-label";
      l1.textContent = language === "ru" ? "2 этаж" : "2nd deck";
      row1.append(l1);
      const flex1 = document.createElement("div");
      flex1.className = "car-deck-cubes";
      d1.forEach((compIdx) => {
        appendStandardCoupeCube(flex1, car, byCompartment.get(compIdx) || []);
      });
      row1.append(flex1);
      grid.append(row1);
    }
    return;
  }
  compIndices.forEach((compIdx) => {
    const compSeats = byCompartment.get(compIdx) || [];
    if (cls === "sv") {
      const cube = document.createElement("div");
      cube.className = "compartment-cube compartment-cube--sv";
      [...compSeats]
        .sort((a, b) => parseInt(a.displayNum, 10) - parseInt(b.displayNum, 10))
        .forEach((seat) => {
          cube.append(createSeatButton(car, seat));
        });
      grid.append(cube);
      return;
    }
    appendStandardCoupeCube(grid, car, compSeats);
  });
}

function toggleSeatSelection(car, seat) {
  if (seat.occupied) return;
  const key = seat.id;
  if (selectedSeatKeys.has(key)) {
    selectedSeatKeys.delete(key);
  } else if (selectedSeatKeys.size >= 8) {
    assistantSay(language === "ru" ? "Не более восьми мест в одном заказе." : "Up to eight seats per order.");
    return;
  } else {
    selectedSeatKeys.add(key);
  }
  renderSeatGrid();
  updateSeatPickerChrome();
}

function seatPayloadFromSelection() {
  const selected = [];
  for (const car of demoCarriages) {
    const seats = demoSeatLayouts.get(car) || [];
    seats.forEach((seat) => {
      if (!selectedSeatKeys.has(seat.id)) return;
      selected.push({
        carriage: car,
        seat_number: seat.displayNum,
        berth_kind: seat.berth_kind,
      });
    });
  }
  selected.sort((a, b) => `${a.carriage}-${a.seat_number}`.localeCompare(`${b.carriage}-${b.seat_number}`));
  return selected;
}

function updateSeatPickerChrome() {
  const n = selectedSeatKeys.size;
  const label = i18n[language].seatPickerSelected;
  document.querySelector("#seat-picker-count").textContent =
    language === "ru" ? `${label}: ${n}` : `${label}: ${n}`;
  const total = selectedSeatsOrderTotalRub();
  const totalEl = document.querySelector("#seat-picker-total");
  if (totalEl) {
    totalEl.textContent = `${i18n[language].seatPickerTotal}: ${n === 0 ? "—" : formatPrice(total)}`;
  }
  confirmSeatsButton.disabled = n === 0 || issuingTicket;
}

async function confirmSeatSelection() {
  const seatsPayload = seatPayloadFromSelection();
  if (!seatsPayload.length || issuingTicket || !selectedTrain) return;
  issuingTicket = true;
  confirmSeatsButton.disabled = true;
  try {
    demoTicket = await postJson("/api/checkout/demo", {
      language,
      train: selectedTrain,
      selected_seats: seatsPayload,
    });
    seatPickerPanel.classList.add("hidden");
    renderTicket();
  } catch {
    assistantSay(i18n[language].checkoutError);
  } finally {
    issuingTicket = false;
    confirmSeatsButton.disabled = selectedSeatKeys.size === 0;
    updateSeatPickerChrome();
  }
}

function renderTicket() {
  exitCheckoutWorkspaceMode();
  seatPickerPanel.classList.add("hidden");
  mapContent.classList.add("hidden");
  ticketPanel.classList.remove("hidden");
  setStage("ticket");
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
  ticketPanel.scrollIntoView({ behavior: "smooth", block: "center" });
}

function startVoiceRecognition() {
  playOrbTapSound();
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    assistantSay(i18n[language].noSpeech);
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = language === "ru" ? "ru-RU" : "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  setOrbMode("listening");
  recognition.onresult = (event) => {
    const spokenText = event.results[0][0].transcript;
    // Голосовой ввод сначала появляется в поле: пассажир видит, что понял
    // браузерный STT, и только затем фраза отправляется ассистенту.
    userInput.value = spokenText;
    handleUserText(spokenText);
  };
  recognition.onerror = () => assistantSay(i18n[language].noSpeech);
  recognition.onend = () => {
    if (uiStage !== "searching") setOrbMode("idle");
  };
  recognition.start();
}

function assistantSay(text, options = {}) {
  assistantText.textContent = text;
  setOrbMode("speaking");
  if (options.addToHistory !== false) {
    addMessage("assistant", text);
  }
  enqueueSpeech(text);
}

function setOrbMode(mode) {
  orbButton.classList.remove("orb-idle", "orb-listening", "orb-thinking", "orb-speaking");
  orbButton.classList.add(`orb-${mode}`);
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

function enqueueSpeech(text) {
  speechQueue.push(text);
  if (!isSpeaking) {
    speakNext();
  }
}

function speakNext() {
  if (!speechQueue.length) {
    isSpeaking = false;
    if (uiStage === "initial" || uiStage === "checkout" || uiStage === "seatPicker" || uiStage === "ticket")
      setOrbMode("idle");
    return;
  }
  isSpeaking = true;
  speak(speechQueue.shift());
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language === "ru" ? "ru-RU" : "en-US";
  utterance.rate = 0.95;
  utterance.onend = () => {
    speakNext();
  };
  utterance.onerror = () => speakNext();
  window.speechSynthesis.speak(utterance);
}

function playOrbTapSound() {
  // Короткий мягкий сигнал подтверждает касание сферы, но не мешает речи.
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  audioContext ||= new AudioContext();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(620, audioContext.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(920, audioContext.currentTime + 0.11);
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.035, audioContext.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.16);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.17);
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
  if (price === null || price === undefined) return "-";
  return `${Number(price).toLocaleString(language === "ru" ? "ru-RU" : "en-US")} ₽`;
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
  intent = normalizeIntent(
    {
      origin: language === "ru" ? "Москва" : "Moscow",
      destination: language === "ru" ? "Казань" : "Kazan",
      date: "2026-05-06",
      arrival_time_window: { start: "07:00", end: "09:00" },
    },
    i18n[language].fallbackError,
  );
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
  checkoutAnimating = false;
  issuingTicket = false;
  demoCarriages = [];
  activeCarriageIndex = 0;
  demoSeatLayouts = new Map();
  demoCarriageClassByCar = new Map();
  selectedSeatKeys = new Set();
  lastSelectedTrainId = null;
  lastDialogUserText = "";
  dialogMessages = [];
  speechQueue = [];
  isSpeaking = false;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  userInput.value = "";
  transcript.textContent = "";
  assistantText.textContent = i18n[language].assistantReady;
  [intentPanel, trainsPanel, checkoutPanel, seatPickerPanel, ticketPanel].forEach((panel) =>
    panel.classList.add("hidden"),
  );
  hideCheckoutTrainSummary();
  exitCheckoutWorkspaceMode();
  mapContent.classList.remove("hidden");
  document.querySelector("#checkout-steps").innerHTML = "";
  document.querySelector("#route-meta").textContent =
    language === "ru" ? "Москва -> Казань" : "Moscow -> Kazan";
  document.querySelector("#route-fact").textContent =
    language === "ru"
      ? "Факт о маршруте появится после поиска билетов."
      : "A route fact will appear after ticket search.";
  routeLine.classList.remove("route-line-active");
  routePulse.classList.remove("route-pulse-active");
  updateMapGeometry(routeVisuals.default);
  setTextInputPanelOpen(false);
  setStage("initial");
  renderHistory();
  if (announce) {
    assistantSay(i18n[language].assistantReady, { addToHistory: false });
  }
}
