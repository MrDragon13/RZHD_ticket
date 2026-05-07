// HTTP: fetchApi, postJson, getJson — в ./api-client.js (грузится в index.html перед этим файлом).

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Ввод в поле текста и «Отправить» открывает журнал с этой точной строкой (без учёта регистра). */
const PATH_DEBUG_TRIGGER = "logloglog";
/** Новый ключ: дефолт РЖД для первого визита; старый path-theme-v1 игнорируется (миграция без переноса «неона»). */
const THEME_STORAGE_KEY = "path-theme-v2-default-rzd";
const PATH_LOG_CAP = 600;
const pathClientLogs = [];

/**
 * Размер отрисовки QR на демо-билете (px). Исходно 220; при росте полезной нагрузки
 * крупная матрица читается лучше. Верхняя граница по макету — до ~×2 (440); 300 — компромисс.
 */
const TICKET_QR_RENDER_PX = 300;

/** Обрезка по лимиту байт UTF-8 (для кириллицы длина строки ≠ размер в байтах). */
function utf8ByteSlice(str, maxBytes) {
  const enc = new TextEncoder();
  const buf = enc.encode(str);
  if (buf.length <= maxBytes) return str;
  let cut = maxBytes;
  while (cut > 0 && (buf[cut] & 0xc0) === 0x80) cut--;
  return new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(0, cut));
}

function pathFormatLogArg(a) {
  if (a instanceof Error) return a.stack || a.message;
  if (typeof a === "object" && a !== null) {
    try {
      return JSON.stringify(a);
    } catch {
      return String(a);
    }
  }
  return String(a);
}

function pathLogAppend(level, args) {
  const ts = new Date().toISOString();
  const body = Array.from(args).map(pathFormatLogArg).join(" ");
  const line = `[${ts}] [${level}] ${body}`;
  pathClientLogs.push(line);
  if (pathClientLogs.length > PATH_LOG_CAP) {
    pathClientLogs.splice(0, pathClientLogs.length - PATH_LOG_CAP);
  }
}

(function installPathConsoleCapture() {
  const methods = ["log", "info", "warn", "error", "debug"];
  for (const m of methods) {
    const orig = console[m].bind(console);
    console[m] = (...args) => {
      try {
        pathLogAppend(m.toUpperCase(), args);
      } catch {
        /* ignore */
      }
      orig(...args);
    };
  }
  pathLogAppend("INFO", ["Путь: захват консольных сообщений включён"]);
})();

// Все пользовательские надписи вынесены в словарь, чтобы выбранный на первом
// экране язык проходил сквозь весь интерфейс, голосовые реплики и демо-билет.
const i18n = {
  ru: {
    title: "ПУТЬ",
    subtitle: "Интеллектуальный терминал РЖД",
    startPrompt:
      "Коснитесь сферы и скажите: откуда едете, куда и когда (дату или период можно уточнить голосом)",
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
    checkoutPreparingTitle: "Готовим выбор мест…",
    checkoutPreparingHintLive:
      "Загружаем данные вагонов с сервера — обычно несколько секунд. Пожалуйста, подождите.",
    checkoutPreparingHintDemo: "Формируем демо-схему рассадки…",
    checkoutPrepareError:
      "Не удалось подготовить выбор мест. Проверьте соединение и нажмите «Оформить демо-билет» ещё раз.",
    checkoutError:
      "Не удалось выдать демо-билет. Проверьте соединение и нажмите кнопку ещё раз.",
    demoFlow: ["Проверка маршрута", "Подготовка выбора мест", "Загрузка схемы вагона", "Готово"],
    seatPickerTitle: "Выбор вагона и мест",
    seatPickerHint:
      "Плацкарт: 9 открытых купе (1–36) и боковые места у окна (37–54). В купе снизу нечётные, сверху чётные. Можно выбрать несколько мест.",
    seatPickerSelected: "Выбрано мест",
    seatPickerTotal: "Сумма",
    seatPickerConfirm: "Подтвердить выбор",
    seatPickerCarriage: "Вагон",
    seatPickerZoneOpen: "Открытая часть вагона (места 1–36)",
    seatPickerZoneSide: "Боковые места у окна (места 37–54)",
    seatPickerKindFromSeatRows:
      "Подсветка по строкам seats РЖД: отмечены отдельные отсеки, где удалось сопоставить номер купе и пол.",
    seatPickerKindFemaleSingleFallback: "Розовая подсветка — женское купе.",
    seatPickerKindMaleSingleFallback: "Голубая подсветка — мужское купе.",
    seatPickerKindMixed: "Сиреневая подсветка — смешанное купе.",
    seatPickerKindChildren: "Жёлтая подсветка — детское купе.",
    seatPickerKindFamily: "Зелёная подсветка — семейное купе.",
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
    wagonFeatures: "Особенности вагона",
    ticketAllFeatures: "Особенности",
    ticketCompartmentFeatures: "Особенности купе",
    ticketSeatFeatures: "Особенности места",
    addSignsLabel: "Код РЖД",
    berthShort: {
      lower: "Н",
      upper: "В",
      side_lower: "Бн",
      side_upper: "Бв",
    },
    demoTicket: "ДЕМО-БИЛЕТ",
    ticketThanks: "Спасибо, что разделили Путь вместе с нами.",
    restart: "Начать заново",
    newSession: "Новый запрос",
    helpSupport: "Помощь",
    supportChatTitle: "Техподдержка",
    supportChatClose: "Закрыть",
    supportChatDisclaimer:
      "Демонстрация: это имитация чата. Ответы генерирует ИИ (DeepSeek), это не реальная служба поддержки РЖД.",
    supportChatPlaceholder: "Опишите проблему или задайте вопрос…",
    supportChatSend: "Отправить",
    supportChatClear: "Очистить",
    supportChatClearAria: "Очистить текст в поле ввода без отправки сообщения",
    supportChatMicAria: "Голосовой ввод сообщения",
    supportChatTyping: "Оператор отвечает…",
    supportChatError: "Не удалось получить ответ. Проверьте соединение и попробуйте снова.",
    supportChatAgentRole: "Техподдержка",
    compareTrains: "Сравнить",
    comparePickSecond:
      "Режим сравнения: выберите на списке второй поезд — я покажу разницу по времени, цене и комфорту.",
    compareCancelled: "Сравнение отменено. Можно снова выбрать поезд в списке.",
    compareSameTrain: "Выберите другой поезд — не тот же, что уже отмечен для сравнения.",
    compareLoading: "Готовим сравнение…",
    compareLoadingHint: "Загружаем расписание и состав поездов — затем ИИ сформирует текст сравнения.",
    compareClose: "Закрыть",
    compareCheckoutTrain: "Оформить поезд {num}",
    compareError: "Не удалось получить сравнение. Попробуйте ещё раз или закройте окно.",
    paymentDemoTitle: "Оплата (демо)",
    paymentDemoSubtitle: "Деньги не списываются — имитация эквайринга для киоска.",
    paymentAmountLabel: "К оплате",
    paymentCardLabel: "Карта",
    paymentExpiryLabel: "Срок",
    paymentConnecting: "Подключение к эквайеру…",
    paymentAutofill: "Данные карты подставлены автоматически…",
    paymentProcessing: "Обработка платежа…",
    paymentSuccess: "Оплата прошла успешно",
    paymentIssuingTicket: "Формируем демо-билет…",
    noSpeech:
      "В этом браузере нет встроенного распознавания речи. Воспользуйтесь кнопкой «Текст» и полем ввода.",
    speechMicDenied:
      "Нужен доступ к микрофону — разрешите его в настройках браузера для этого сайта.",
    speechMicCapture: "Микрофон не найден или недоступен. Проверьте устройство или введите текст.",
    speechNetworkError: "Сеть не позволила завершить распознавание. Попробуйте ещё раз или введите текст.",
    speechRecognitionGlitch: "Распознавание не сработало. Повторите или используйте текстовое поле.",
    fallbackError: "Сервер недоступен. Показываю демо-сценарий интерфейса.",
    searchTicketError:
      "Не удалось загрузить поезда с сайта РЖД. Проверьте соединение или попробуйте позже.",
    routeFactUnavailable: "Факт о маршруте временно недоступен.",
    routeFactLoading: "Подбираем факт о маршруте…",
    bannerDemo:
      "Показаны демонстрационные данные расписания (не актуальная выдача РЖД в реальном времени).",
    bannerLive: "Расписание и наличие мест — по данным поиска РЖД.",
    bannerOffline: "Не удалось связаться с сервером. Проверьте сеть и обновите страницу.",
    languageAmbientBadge: "Случайный маршрут",
    clarifyHint: "Я дождусь уточнения и только потом подберу варианты.",
    logModalCopy: "Копировать всё",
    logModalCopied: "Скопировано",
    logModalTitle: "Журнал консоли",
    logModalClose: "Закрыть",
    logModalClear: "Очистить",
    logModalEmpty: "(Записей пока нет)",
    themeToggleAria: "Переключить тему оформления: неон или корпоративная палитра РЖД",
    themeNeonShort: "Неон",
    themeRzdShort: "РЖД",
    authTitle: "Вход",
    authSubtitle:
      "Укажите номер телефона для подтверждения — это демонстрация, данные не сохраняются на сервере.",
    authPhoneLabel: "Мобильный телефон",
    authPhoneKeyboardAria: "Цифры номера телефона",
    authClear: "Очистить",
    authContinue: "Продолжить",
    authOtpSending: "Отправляем код…",
    authOtpSent: "Код отправлен на ваш номер.",
    authOtpLabel: "Код из SMS",
    authOtpHint: "Код подставится автоматически через несколько секунд.",
    authOtpKeyboardAria: "Цифры кода из SMS",
    authLogin: "Войти",
    authVkeyErase: "Стереть",
    sessionUserLabel: "Пассажир",
    sessionLogout: "Выход",
    idleLogoutWarning:
      "Нет действий около двух минут — если не коснётесь экрана в течение примерно десяти секунд, произойдёт выход и возврат к выбору языка.",
    ticketPassenger: "Пассажир",
    ticketPassengerDoc: "Документ",
    ticketPassengerPhone: "Телефон",
    assistantRole: "Путь",
    userRole: "Пассажир",
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
    startPrompt:
      "Touch the sphere and say where you're leaving from, where you're going, and when (you can refine the date by voice)",
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
    checkoutPreparingTitle: "Preparing seat selection…",
    checkoutPreparingHintLive:
      "Loading carriage data from the server — this usually takes a few seconds. Please wait.",
    checkoutPreparingHintDemo: "Building the demo seating layout…",
    checkoutPrepareError:
      "Could not prepare seat selection. Check your connection and tap «Create demo ticket» again.",
    checkoutError: "Could not issue the demo ticket. Check your connection and tap the button again.",
    demoFlow: ["Checking route", "Preparing seat selection", "Loading car layout", "Done"],
    seatPickerTitle: "Choose car and seats",
    seatPickerHint:
      "Platzkart: nine open bays (1–36) and side berths by the window (37–54). Odd lower, even upper in each bay. Multiple seats allowed.",
    seatPickerSelected: "Seats selected",
    seatPickerTotal: "Total",
    seatPickerConfirm: "Confirm selection",
    seatPickerCarriage: "Car",
    seatPickerZoneOpen: "Open section (seats 1–36)",
    seatPickerZoneSide: "Side berths by the window (seats 37–54)",
    seatPickerKindFromSeatRows:
      "RZD seat rows: compartments highlighted where coupe index and gender could be matched.",
    seatPickerKindFemaleSingleFallback: "Pink highlight: female compartment.",
    seatPickerKindMaleSingleFallback: "Blue highlight: male compartment.",
    seatPickerKindMixed: "Violet highlight: mixed compartment.",
    seatPickerKindChildren: "Yellow highlight: children compartment.",
    seatPickerKindFamily: "Green highlight: family compartment.",
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
    wagonFeatures: "Carriage features",
    ticketAllFeatures: "Features",
    ticketCompartmentFeatures: "Compartment",
    ticketSeatFeatures: "Seat details",
    addSignsLabel: "RZD code",
    berthShort: {
      lower: "L",
      upper: "U",
      side_lower: "SL",
      side_upper: "SU",
    },
    demoTicket: "DEMO TICKET",
    ticketThanks: "Thank you for sharing the Path with us.",
    restart: "Start over",
    newSession: "New request",
    helpSupport: "Help",
    supportChatTitle: "Support chat",
    supportChatClose: "Close",
    supportChatDisclaimer:
      "Demo: this chat is simulated. Replies are generated by AI (DeepSeek), not real RZD support.",
    supportChatPlaceholder: "Describe an issue or ask a question…",
    supportChatSend: "Send",
    supportChatClear: "Clear",
    supportChatClearAria: "Clear the message field without sending",
    supportChatMicAria: "Voice input",
    supportChatTyping: "Support is typing…",
    supportChatError: "Could not get a reply. Check your connection and try again.",
    supportChatAgentRole: "Support",
    compareTrains: "Compare",
    comparePickSecond:
      "Compare mode: tap another train in the list — I will summarize time, price, and comfort.",
    compareCancelled: "Comparison cancelled. You can pick a train from the list again.",
    compareSameTrain: "Pick a different train — not the one already marked for comparison.",
    compareLoading: "Preparing comparison…",
    compareLoadingHint:
      "Loading schedules and train composition — then the AI will draft the comparison text.",
    compareClose: "Close",
    compareCheckoutTrain: "Checkout train {num}",
    compareError: "Could not load comparison. Try again or close this panel.",
    paymentDemoTitle: "Payment (demo)",
    paymentDemoSubtitle: "No real charge — simulated acquiring for the kiosk.",
    paymentAmountLabel: "Amount due",
    paymentCardLabel: "Card",
    paymentExpiryLabel: "Expires",
    paymentConnecting: "Connecting to payment gateway…",
    paymentAutofill: "Card details filled in automatically…",
    paymentProcessing: "Processing payment…",
    paymentSuccess: "Payment approved",
    paymentIssuingTicket: "Issuing your demo ticket…",
    noSpeech:
      "This browser has no built-in speech recognition. Use the Text button and type your request.",
    speechMicDenied: "Microphone access is blocked — allow it in the browser settings for this site.",
    speechMicCapture: "No microphone found or it is unavailable. Check the device or type your request.",
    speechNetworkError: "Network issue interrupted recognition. Try again or use text input.",
    speechRecognitionGlitch: "Recognition failed. Try again or use the text field.",
    fallbackError: "Server is unavailable. Showing interface demo scenario.",
    searchTicketError:
      "Could not load trains from RZD. Check your connection or try again later.",
    routeFactUnavailable: "Route fact is temporarily unavailable.",
    routeFactLoading: "Finding a route fact…",
    bannerDemo: "Showing demo schedule data (not live RZD inventory).",
    bannerLive: "Schedule and availability from RZD search.",
    bannerOffline: "Cannot reach the server. Check the network and refresh the page.",
    languageAmbientBadge: "Random route",
    clarifyHint: "I will wait for clarification before searching options.",
    logModalCopy: "Copy all",
    logModalCopied: "Copied",
    logModalTitle: "Console log",
    logModalClose: "Close",
    logModalClear: "Clear",
    logModalEmpty: "(No entries yet)",
    themeToggleAria: "Switch color theme: neon or RZD corporate palette",
    themeNeonShort: "Neon",
    themeRzdShort: "RZD",
    authTitle: "Sign in",
    authSubtitle:
      "Enter your mobile phone number to continue — this is a demo; nothing is stored on the server.",
    authPhoneLabel: "Mobile phone",
    authPhoneKeyboardAria: "Phone number keypad",
    authClear: "Clear",
    authContinue: "Continue",
    authOtpSending: "Sending code…",
    authOtpSent: "Code sent to your number.",
    authOtpLabel: "SMS code",
    authOtpHint: "The code will appear automatically in a few seconds.",
    authOtpKeyboardAria: "SMS code keypad",
    authLogin: "Sign in",
    authVkeyErase: "Erase",
    sessionUserLabel: "Passenger",
    sessionLogout: "Sign out",
    idleLogoutWarning:
      "No activity for about two minutes — unless you touch the screen within about ten seconds, you will be signed out and returned to the language screen.",
    ticketPassenger: "Passenger",
    ticketPassengerDoc: "ID",
    ticketPassengerPhone: "Phone",
    assistantRole: "Path",
    userRole: "Passenger",
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

/** Города для фоновой анимации на экране выбора языка. */
const INTRO_AMBIENT_CITIES_RU = [
  "Москва",
  "Санкт-Петербург",
  "Казань",
  "Нижний Новгород",
  "Екатеринбург",
  "Новосибирск",
  "Красноярск",
  "Иркутск",
  "Сочи",
  "Ростов-на-Дону",
  "Краснодар",
  "Самара",
  "Уфа",
  "Челябинск",
  "Омск",
  "Воронеж",
  "Липецк",
  "Тверь",
  "Ярославль",
  "Владимир",
  "Тула",
  "Рязань",
  "Волгоград",
  "Астрахань",
  "Пермь",
  "Ульяновск",
  "Пенза",
  "Хабаровск",
  "Владивосток",
];

const INTRO_AMBIENT_CITIES_EN = [
  "Moscow",
  "Saint Petersburg",
  "Kazan",
  "Nizhny Novgorod",
  "Yekaterinburg",
  "Novosibirsk",
  "Krasnoyarsk",
  "Irkutsk",
  "Sochi",
  "Rostov-on-Don",
  "Krasnodar",
  "Samara",
  "Ufa",
  "Chelyabinsk",
  "Omsk",
  "Voronezh",
  "Lipetsk",
  "Tver",
  "Yaroslavl",
  "Vladimir",
  "Tula",
  "Ryazan",
  "Volgograd",
  "Astrakhan",
  "Perm",
  "Ulyanovsk",
  "Penza",
  "Khabarovsk",
  "Vladivostok",
];

/** Максимум промежуточных точек на SVG-карте маршрута (пары #stop-dot-a…e + #stop-label-a…e в index.html). */
const ROUTE_MAP_MAX_INTERMEDIATE_STOPS = 5;
/** Интервал между появлением точек по направлению от отправления к прибытию (мс). */
const ROUTE_STOP_STAGGER_MS = 510;

/**
 * Равномерно выбирает до maxCount названий из упорядоченного сегмента (не подряд с начала):
 * доли 1/(k+1), 2/(k+1), … k/(k+1) по индексам списка.
 */
function sampleIntermediateStopsEvenly(segmentStops, maxCount) {
  const arr = segmentStops.map((s) => String(s).trim()).filter(Boolean);
  const k = Math.min(Math.max(1, maxCount), arr.length);
  if (!arr.length) return [];
  if (arr.length <= k) return arr.slice();
  const picked = new Set();
  const out = [];
  for (let i = 0; i < k; i += 1) {
    const t = (i + 1) / (k + 1);
    let idx = Math.round(t * (arr.length - 1));
    idx = Math.max(0, Math.min(arr.length - 1, idx));
    let guard = 0;
    while (picked.has(idx) && guard < arr.length) {
      idx = (idx + 1) % arr.length;
      guard += 1;
    }
    picked.add(idx);
    out.push(arr[idx]);
  }
  return out;
}
/** Нормализация названия станции для сравнения с полями intent / поезда. */
function normalizeStationName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

/** Грубое сопоставление названий станций в разных форматах РЖД («Липецк» / «Липецк пасс»). */
function stationMatches(stationName, userHint) {
  const stripNoise = (s) =>
    normalizeStationName(s)
      .replace(/\./g, "")
      .replace(/\s+(пасс|пассажирский|главн|главный|центр)\s*$/i, "")
      .trim();

  const collapseAbbrev = (s) =>
    s
      .replace(/\b([а-яa-z])\.\s*/gi, "$1")
      .replace(/\s+/g, " ")
      .trim();

  const a = collapseAbbrev(stripNoise(stationName));
  const b = collapseAbbrev(stripNoise(userHint));
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  const tokenHit = (big, small) => {
    const tokens = big.split(/\s+/).filter((t) => t.length >= 3);
    return tokens.some((t) => small.length >= 4 && (t.includes(small) || small.includes(t)));
  };
  if (b.length >= 4 && tokenHit(a, b)) return true;
  if (a.length >= 4 && tokenHit(b, a)) return true;

  const wa = a.split(/\s+/).filter(Boolean);
  const wb = b.split(/\s+/).filter(Boolean);
  const la = wa.length ? wa[wa.length - 1] : "";
  const lb = wb.length ? wb[wb.length - 1] : "";
  if (la.length >= 4 && lb.length >= 4 && (la.includes(lb) || lb.includes(la))) return true;
  return false;
}

/** Положение точки отправления по умолчанию (совпадает с разметкой до динамической линии). */
const DEFAULT_ROUTE_ORIGIN = { x: 125, y: 350, labelX: 82, labelY: 386 };

/** Кэш органической линии маршрута: пересчитываем только при смене пары городов. */
let dynamicRouteCache = { key: "", geom: null };

function hashRoutePairKey(normOrigin, normDest) {
  const s = `${normOrigin}\u241f${normDest}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
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

/**
 * Кубическая Безье между «районом» отправления и прибытия; две контрольные точки — у краёв поля карты.
 * Детерминировано от пары городов (одинаковый маршрут в рамках сессии).
 */
function buildOrganicRouteGeometry(normOrigin, normDest) {
  const rnd = mulberry32(hashRoutePairKey(normOrigin, normDest));
  const rx = (a, b) => a + rnd() * (b - a);

  const ox = rx(68, 178);
  const oy = rx(288, 452);
  const dx = rx(672, 872);
  const dy = rx(64, 248);

  const roll = rnd();
  let cp1x;
  let cp1y;
  let cp2x;
  let cp2y;
  if (roll < 0.34) {
    cp1x = rx(36, 240);
    cp1y = rx(40, 220);
    cp2x = rx(540, 884);
    cp2y = rx(96, 420);
  } else if (roll < 0.67) {
    cp1x = rx(48, 280);
    cp1y = rx(300, 508);
    cp2x = rx(500, 872);
    cp2y = rx(48, 240);
  } else {
    cp1x = rx(180, 480);
    cp1y = rx(36, 180);
    cp2x = rx(400, 780);
    cp2y = rx(260, 504);
  }

  const q = (n) => n.toFixed(1);
  const line = `M${q(ox)} ${q(oy)} C${q(cp1x)} ${q(cp1y)} ${q(cp2x)} ${q(cp2y)} ${q(dx)} ${q(dy)}`;

  return {
    line,
    origin: {
      x: ox,
      y: oy,
      labelX: ox - 44,
      labelY: oy + 38,
    },
    destination: {
      x: dx,
      y: dy,
      labelX: dx - 58,
      labelY: dy - 22,
    },
  };
}

function getDynamicRouteGeometry(originRaw, destRaw) {
  const o = String(originRaw || "").trim();
  const d = String(destRaw || "").trim();
  if (!o || !d) return null;
  const no = normalizeStationName(o);
  const nd = normalizeStationName(d);
  if (!no || !nd || no === nd) return null;

  const key = `${no}\u241f${nd}`;
  if (dynamicRouteCache.key === key && dynamicRouteCache.geom) {
    return dynamicRouteCache.geom;
  }
  const geom = buildOrganicRouteGeometry(no, nd);
  dynamicRouteCache = { key, geom };
  return geom;
}

/** Шаблон из routeVisuals + при наличии пары городов — уникальная линия между ними. */
function buildRouteVisualBase(destinationKey) {
  const template = findRouteVisual(destinationKey);
  const dyn = getDynamicRouteGeometry(intent?.origin, intent?.destination);
  if (!dyn) {
    return { ...template, origin: null };
  }
  return {
    ...template,
    line: dyn.line,
    origin: dyn.origin,
    destination: dyn.destination,
    stops: [],
  };
}

/**
 * Доля длины пути SVG до конечной точки сегмента пользователя на полном маршруте поезда.
 * Приоритет: поле route_segment с бэкенда (эвристика + DeepSeek).
 *
 * Важно: декоративная линия на карте уже идёт от intent.origin к intent.destination.
 * Если билет на том же участке, что и поиск (station из выдачи РЖД совпадает с запросом),
 * обрезать линию по «доле полного пути поезда» нельзя — иначе для поезда с длинным
 * следованием доля окажется маленькой и все точки съедут к началу.
 */
function segmentEndpointFraction(train) {
  const userFrom = intent?.origin;
  const userTo = intent?.destination;
  if (!userFrom || !userTo) return null;

  const ticketMatchesSearch =
    stationMatches(train?.departure_station, userFrom) &&
    stationMatches(train?.arrival_station, userTo);
  if (ticketMatchesSearch) {
    return 1;
  }

  const rf = train?.route_segment?.endpoint_fraction;
  if (rf != null && Number.isFinite(Number(rf))) {
    return Number(rf);
  }

  const raw = Array.isArray(train?.stops)
    ? train.stops.map((s) => String(s).trim()).filter(Boolean)
    : [];

  if (raw.length >= 2) {
    let iFrom = raw.findIndex((name) => stationMatches(name, userFrom));
    let iTo = raw.findIndex((name) => stationMatches(name, userTo));
    if (iFrom < 0 && stationMatches(train?.departure_station, userFrom)) {
      iFrom = raw.findIndex((name) => stationMatches(name, train?.departure_station));
    }
    if (iTo < 0 && stationMatches(train?.arrival_station, userTo)) {
      iTo = raw.findIndex((name) => stationMatches(name, train?.arrival_station));
    }
    if (iFrom >= 0 && iTo >= 0 && iFrom !== iTo) {
      const idxEnd = iFrom < iTo ? iTo : iFrom;
      return (idxEnd + 1) / (raw.length + 1);
    }
  }

  return null;
}

/**
 * Промежуточные остановки между станциями запроса (порядок следования поезда).
 * Приоритет: route_segment.intermediate_stops с бэкенда.
 */
function intermediateStopDisplayNames(train) {
  const rs = train?.route_segment;
  if (rs && Array.isArray(rs.intermediate_stops) && rs.intermediate_stops.length > 0) {
    const full = rs.intermediate_stops.map((s) => String(s).trim()).filter(Boolean);
    return sampleIntermediateStopsEvenly(full, ROUTE_MAP_MAX_INTERMEDIATE_STOPS);
  }

  const raw = Array.isArray(train?.stops)
    ? train.stops.map((s) => String(s).trim()).filter(Boolean)
    : [];
  const userFrom = intent?.origin;
  const userTo = intent?.destination;
  if (!raw.length || !userFrom || !userTo) return [];

  let iFrom = raw.findIndex((name) => stationMatches(name, userFrom));
  let iTo = raw.findIndex((name) => stationMatches(name, userTo));
  if (iFrom < 0 && stationMatches(train?.departure_station, userFrom)) {
    iFrom = raw.findIndex((name) => stationMatches(name, train?.departure_station));
  }
  if (iTo < 0 && stationMatches(train?.arrival_station, userTo)) {
    iTo = raw.findIndex((name) => stationMatches(name, train?.arrival_station));
  }

  let segment = [];
  if (iFrom >= 0 && iTo >= 0 && iFrom !== iTo) {
    const lo = Math.min(iFrom, iTo);
    const hi = Math.max(iFrom, iTo);
    segment = raw.slice(lo + 1, hi);
    if (iFrom > iTo) {
      segment = segment.slice().reverse();
    }
  }

  if (
    !segment.length &&
    stationMatches(train?.departure_station, userFrom) &&
    stationMatches(train?.arrival_station, userTo)
  ) {
    const ia = raw.findIndex((name) => stationMatches(name, train.departure_station));
    const ib = raw.findIndex((name) => stationMatches(name, train.arrival_station));
    if (ia >= 0 && ib >= 0 && ia !== ib) {
      const lo = Math.min(ia, ib);
      const hi = Math.max(ia, ib);
      segment = raw.slice(lo + 1, hi);
      if (ia > ib) {
        segment = segment.slice().reverse();
      }
    }
  }

  return sampleIntermediateStopsEvenly(segment, ROUTE_MAP_MAX_INTERMEDIATE_STOPS);
}

/**
 * Точки остановок на линии маршрута.
 * Раньше брали долю длины дуги — у кривой Безье большая часть длины часто «спрятана» в первых сегментах,
 * из‑за этого все точки оказывались у начала. Сейчас: равномерно по отрезку между началом и концом
 * видимого сегмента (хорда), затем ближайшая точка на том же участке контура path (проекция на линию).
 */
function stopMarkersAlongPath(pathD, names, segmentFraction) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathD);
  const totalLen = path.getTotalLength();
  if (!Number.isFinite(totalLen) || totalLen <= 0) return null;

  let visibleLen = totalLen;
  if (segmentFraction != null && Number.isFinite(segmentFraction)) {
    const f = Math.min(1, Math.max(0.08, segmentFraction));
    visibleLen = f * totalLen;
  }

  const n = names.length;
  if (!n) return null;

  const pStart = path.getPointAtLength(0);
  const pEnd = path.getPointAtLength(visibleLen);

  /** Ищем ближайший к (qx,qy) контур на участке [0, visibleLen]. */
  function nearestOnPathSegment(qx, qy) {
    const steps = 72;
    let bestX = pStart.x;
    let bestY = pStart.y;
    let bestD = Infinity;
    for (let k = 0; k <= steps; k += 1) {
      const s = (k / steps) * visibleLen;
      const p = path.getPointAtLength(s);
      const d = (p.x - qx) ** 2 + (p.y - qy) ** 2;
      if (d < bestD) {
        bestD = d;
        bestX = p.x;
        bestY = p.y;
      }
    }
    return { x: bestX, y: bestY };
  }

  const markers = [];
  for (let i = 0; i < n; i += 1) {
    const u = (i + 1) / (n + 1);
    const tx = pStart.x + u * (pEnd.x - pStart.x);
    const ty = pStart.y + u * (pEnd.y - pStart.y);
    const pt = nearestOnPathSegment(tx, ty);
    markers.push({ name: names[i], x: pt.x, y: pt.y });
  }
  return markers;
}

/** Объединяет шаблон маршрута по направлению с реальными остановками выбранного поезда. */
function mergeRouteVisualForTrain(destinationKey, train) {
  const base = buildRouteVisualBase(destinationKey);
  if (!train) return { ...base, routeClip: null };

  const pathProbe = document.createElementNS("http://www.w3.org/2000/svg", "path");
  pathProbe.setAttribute("d", base.line);
  const totalLen = pathProbe.getTotalLength();

  const frac = segmentEndpointFraction(train);
  let dest = {
    x: base.destination.x,
    y: base.destination.y,
    labelX: base.destination.labelX,
    labelY: base.destination.labelY,
  };
  let routeClip = null;

  if (frac != null && Number.isFinite(totalLen) && totalLen > 0) {
    const fClip = Math.min(1, Math.max(0.08, frac));
    const visibleLen = fClip * totalLen;
    const pt = pathProbe.getPointAtLength(visibleLen);
    dest = {
      x: pt.x,
      y: pt.y,
      labelX: pt.x - 58,
      labelY: pt.y - 22,
    };
    routeClip = { totalLen, visibleLen };
  }

  const names = intermediateStopDisplayNames(train);
  if (window.localStorage?.getItem("PATH_DEBUG_VERBOSE") === "1") {
    try {
      console.debug("[path route-map]", train?.train_number, {
        intent_from: intent?.origin,
        intent_to: intent?.destination,
        route_segment: train?.route_segment,
        frac,
        marker_names: names,
        stops_len: train?.stops?.length,
      });
    } catch {
      /* ignore */
    }
  }

  const placed = names.length > 0 ? stopMarkersAlongPath(base.line, names, frac) : null;

  if (!placed) {
    return { ...base, destination: dest, stops: [], routeClip };
  }
  const stops = placed.slice(0, ROUTE_MAP_MAX_INTERMEDIATE_STOPS);
  return { ...base, destination: dest, stops, routeClip };
}

function trainForRouteMap() {
  if (selectedTrain) return selectedTrain;
  if (!trains.length) return null;
  if (recommendations.length) return getTrainsForUi()[0] || trains[0];
  return trains[0];
}

/** Шаблон линии на карте по городу назначения из запроса пользователя (не терминус поезда). */
function routeMapDestinationKey() {
  return String(intent?.destination || "").trim();
}

/** Отмена WAAPI-анимаций обводки (иначе «застывает» при смене пути). */
function cancelSvgFlowAnimations(el) {
  if (!el || typeof el.getAnimations !== "function") return;
  try {
    for (const a of el.getAnimations()) {
      a.cancel();
    }
  } catch {
    /* ignore */
  }
}

/** Световой «поток» по линии маршрута (поверх базовой обводки). */
function syncRouteFlowOverlay(flowEl, pathD) {
  if (!flowEl || !pathD) return;
  cancelSvgFlowAnimations(flowEl);
  try {
    flowEl.setAttribute("d", pathD);
    flowEl.style.opacity = "";
    flowEl.classList.remove("route-line-flow-active", "route-line-flow--css-only");
    void flowEl.getBoundingClientRect();
    try {
      const rawLen = flowEl.getTotalLength();
      const pathLen = Number.isFinite(rawLen) && rawLen > 8 ? rawLen : 1100;
      // Сумма dash+gap = длине пути — один светлый сегмент пробегает всю кривую.
      const headLen = Math.round(
        Math.min(Math.max(pathLen * 0.11, 26), Math.min(150, pathLen * 0.42)),
      );
      const gapLen = Math.max(pathLen - headLen, 1);
      flowEl.style.strokeDasharray = `${headLen} ${gapLen}`;
      /* Инлайн stroke-dashoffset ломает анимацию на SVG в WebKit — только removeProperty + WAAPI/CSS. */
      flowEl.style.removeProperty("stroke-dashoffset");

      const durMs = Math.min(16000, Math.max(5500, (pathLen / 72) * 1000));

      flowEl.classList.add("route-line-flow-active");
      flowEl.classList.remove("route-line-flow--css-only");

      if (typeof flowEl.animate === "function") {
        flowEl.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: -pathLen }], {
          duration: durMs,
          iterations: Infinity,
          easing: "linear",
        });
      } else {
        flowEl.style.setProperty("--route-flow-period", String(pathLen));
        flowEl.style.setProperty("--route-flow-duration", `${durMs / 1000}s`);
        flowEl.classList.add("route-line-flow--css-only");
      }
    } catch {
      flowEl.style.strokeDasharray = "48 952";
      flowEl.style.removeProperty("stroke-dashoffset");
      flowEl.classList.add("route-line-flow-active");
      flowEl.classList.remove("route-line-flow--css-only");
      const fallbackLen = 1000;
      if (typeof flowEl.animate === "function") {
        flowEl.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: -fallbackLen }], {
          duration: 9000,
          iterations: Infinity,
          easing: "linear",
        });
      } else {
        flowEl.style.setProperty("--route-flow-period", String(fallbackLen));
        flowEl.style.setProperty("--route-flow-duration", "9s");
        flowEl.classList.add("route-line-flow--css-only");
      }
    }
  } catch (e) {
    try {
      console.warn("[route-flow]", e);
    } catch {
      /* ignore */
    }
    flowEl.classList.remove("route-line-flow-active", "route-line-flow--css-only");
  }
}

function applyRouteGeometry(visual, labelOverride) {
  if (!routeLine || !visual?.line) return;
  routeLine.classList.remove("route-line-active");
  routeLineFlow?.classList.remove("route-line-flow-active");
  routeLineFlow?.classList.remove("route-line-flow--css-only");
  routeLine.setAttribute("d", visual.line);

  const routeReduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasClip =
    visual.routeClip && Number.isFinite(visual.routeClip.totalLen) && visual.routeClip.totalLen > 0;

  if (hasClip) {
    const L = visual.routeClip.totalLen;
    const v = Math.min(L, Math.max(0, visual.routeClip.visibleLen));
    routeLine.style.strokeDasharray = String(L);
    routeLine.style.strokeDashoffset = String(L - v);
  } else if (routeReduced) {
    routeLine.style.strokeDasharray = "none";
    routeLine.style.strokeDashoffset = "0";
  } else {
    const probe = document.createElementNS("http://www.w3.org/2000/svg", "path");
    probe.setAttribute("d", visual.line);
    const rawLen = probe.getTotalLength();
    const len = Number.isFinite(rawLen) && rawLen > 4 ? rawLen : 1200;
    routeLine.style.strokeDasharray = String(len);
    routeLine.style.strokeDashoffset = String(len);
  }

  void routeLine.getBoundingClientRect();
  if (!hasClip && !routeReduced) {
    routeLine.classList.add("route-line-active");
  }
  routePulse?.classList.add("route-pulse-active");
  const flowReduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!flowReduced && routeLineFlow) {
    syncRouteFlowOverlay(routeLineFlow, visual.line);
  } else if (routeLineFlow) {
    cancelSvgFlowAnimations(routeLineFlow);
    routeLineFlow.setAttribute("d", visual.line);
    routeLineFlow.classList.remove("route-line-flow-active", "route-line-flow--css-only");
    routeLineFlow.style.strokeDasharray = "none";
    routeLineFlow.style.opacity = "0.22";
  }
  updateMapGeometry(visual, labelOverride);
}

function updateRouteMapForSelectedTrain() {
  if (!intent && !trainForRouteMap()) return;
  const train = trainForRouteMap();
  const visual = mergeRouteVisualForTrain(routeMapDestinationKey(), train);
  const originText =
    String(intent?.origin || "").trim() || (language === "ru" ? "Москва" : "Moscow");
  const destText =
    String(intent?.destination || "").trim() || (language === "ru" ? "Казань" : "Kazan");
  applyRouteGeometry(visual, { origin: originText, destination: destText });

  const metaOrigin = String(intent?.origin || "").trim();
  const metaDest = String(intent?.destination || "").trim();
  const kmDur = routeDistanceLabel();
  let metaText = formatRoutePair(metaOrigin, metaDest);
  if (kmDur) metaText += ` · ${kmDur}`;
  document.querySelector("#route-meta").textContent = metaText;
}

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

/** Особенности по полю features в demo_trains (если amenities пуст — например live РЖД). */
const featureLabels = {
  ru: {
    night: "ночной поезд",
    sleep: "удобен для сна",
    direct: "без пересадок",
    balanced: "сбалансированный вариант",
    comfort: "повышенный комфорт",
    cheap: "экономичный вариант",
    fast: "скоростной поезд",
    morning: "утренний поезд",
    long: "длительный маршрут",
    resort: "курортное направление",
  },
  en: {
    night: "overnight",
    sleep: "good for rest",
    direct: "direct",
    balanced: "balanced option",
    comfort: "extra comfort",
    cheap: "budget-friendly",
    fast: "express-style",
    morning: "morning departure",
    long: "long-distance",
    resort: "resort route",
  },
};

/** Локализация класса обслуживания на билете (backend отдаёт русские подписи). */
function travelClassForTicket(tc) {
  const raw = String(tc ?? "").trim();
  if (language === "ru") return raw;
  const map = {
    Купе: "Coupe",
    СВ: "SV",
    Плацкарт: "Platzkart",
  };
  return map[raw] || raw;
}

/** Число условных отсеков на схеме — как при подсветке купе (для сопоставления с метаданными РЖД). */
function compartmentCountFromSeatList(seats) {
  if (!seats.length) return 1;
  let maxCi = 0;
  seats.forEach((s) => {
    const ci = Number(s.compartmentIndex ?? 0);
    if (ci > maxCi) maxCi = ci;
  });
  return maxCi + 1;
}

/**
 * Пол купе/тип отсека для выбранного места: hints из seats[] РЖД или эвристика вагона.
 */
function compartmentKindEnumAtSeat(train, car, compartmentIndex, compartmentCount) {
  const det = carriageDetailForTab(train, car);
  if (!det) return null;
  const hints = det.compartment_seat_hints;
  if (Array.isArray(hints) && hints.length > 0) {
    const row = hints.find((h) => Number(h.compartment_index) === Number(compartmentIndex));
    if (row && row.kind && row.kind !== "unknown") return row.kind;
  }
  const wk = det.compartment_kind;
  if (wk === "mixed") return "mixed";
  if (!wk || wk === "unknown") return null;
  if (wk === "female") {
    const pick = deterministicFallbackCompartmentIndex(train, car, "female-coupe", compartmentCount);
    return pick === compartmentIndex ? "female" : null;
  }
  if (wk === "male") {
    const pick = deterministicFallbackCompartmentIndex(train, car, "male-coupe", compartmentCount);
    return pick === compartmentIndex ? "male" : null;
  }
  if (wk === "children") {
    const pick = deterministicFallbackCompartmentIndex(train, car, "children-coupe", compartmentCount);
    return pick === compartmentIndex ? "children" : null;
  }
  if (wk === "family") {
    const pick = deterministicFallbackCompartmentIndex(train, car, "family-coupe", compartmentCount);
    return pick === compartmentIndex ? "family" : null;
  }
  return null;
}

function berthKindTicketDetailLabel(kind) {
  const ru = language === "ru";
  const m = {
    lower: ru ? "нижняя полка" : "lower berth",
    upper: ru ? "верхняя полка" : "upper berth",
    side_lower: ru ? "боковая нижняя полка" : "side lower berth",
    side_upper: ru ? "боковая верхняя полка" : "side upper berth",
  };
  return m[kind] || String(kind || "");
}

function platzZoneTicketLabel(zone) {
  if (zone === "side") return language === "ru" ? "боковая зона" : "side bay";
  if (zone === "open") return language === "ru" ? "основной зал" : "main hall";
  return "";
}

function ticketCarCodesForLookup(carField) {
  const raw = String(carField || "").trim();
  if (!raw) return [];
  return raw.split("+").map((s) => s.trim()).filter(Boolean);
}

/**
 * РЖД иногда кладёт в услуги внутренние slug / бренды — на билете это выглядит как «мусор».
 * Оставляем человекочитаемые строки; сложные slug с несколькими подчёркиваниями не показываем.
 */
function normalizeCarriageServiceChip(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const und = (s.match(/_/g) || []).length;
  if (und >= 2) return null;
  if (/^фпк$/i.test(s) || /^fpk$/i.test(s)) return null;
  if (und === 1) {
    const parts = s.split("_").map((p) => p.trim()).filter(Boolean);
    if (parts.length !== 2) return null;
    const [a, b] = parts;
    if (a.length <= 4 && b.length <= 4 && /^[a-zа-яё]+$/i.test(a + b)) return null;
    const spaced = `${a} ${b}`.replace(/\s+/g, " ");
    return spaced
      .split(/\s+/)
      .map((w) => (w.length ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ""))
      .join(" ")
      .trim();
  }
  return s;
}

/**
 * Единый список подписей для билета: удобства поезда, теги маршрута, услуги вагона (РЖД),
 * тип купе/полка/зона по выбранным местам — без дублей, в одном порядке для чипов.
 */
function collectUnifiedTicketFeatureLabels(train, ticketCarField, ticketRow) {
  if (!train) return [];
  const copy = i18n[language];
  const labels = [];
  const seen = new Set();
  const add = (text) => {
    const t = String(text || "").trim();
    if (!t) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    labels.push(t);
  };

  const berthOnTicket = String(ticketRow?.berth_type || "").trim().toLowerCase();

  for (const item of train.amenities || []) {
    add(amenityLabels[language][item] || item);
  }
  for (const f of train.features || []) {
    add(featureLabels[language][f] || f);
  }

  for (const cc of ticketCarCodesForLookup(ticketCarField)) {
    const det = carriageDetailForTab(train, cc);
    if (!det) continue;
    for (const svc of det.services_short || []) {
      const n = normalizeCarriageServiceChip(svc);
      if (n) add(n);
    }
    if (det.service_summary) {
      const n = normalizeCarriageServiceChip(det.service_summary);
      if (n) add(n);
    }
  }

  if (selectedSeatKeys.size) {
    for (const car of demoCarriages) {
      const seats = demoSeatLayouts.get(car) || [];
      const compartmentCount = compartmentCountFromSeatList(seats);
      for (const seat of seats) {
        if (!selectedSeatKeys.has(seat.id)) continue;
        const ci = seat.compartmentIndex ?? 0;
        const ck = compartmentKindEnumAtSeat(train, car, ci, compartmentCount);
        if (ck) {
          const lab = compartmentKindLabel(ck);
          if (lab && lab !== copy.compartmentUnknown) add(lab);
        }
        if (seat.berth_kind) {
          const bl = berthKindTicketDetailLabel(seat.berth_kind);
          if (bl && bl.trim().toLowerCase() !== berthOnTicket) add(bl);
        }
        if (seat.zone) add(platzZoneTicketLabel(seat.zone));
      }
    }
  }

  return labels;
}

function ticketUnifiedFeaturesHtml(train, ticketCarField, ticketRow) {
  const list = collectUnifiedTicketFeatureLabels(train, ticketCarField, ticketRow);
  if (!list.length) return "";
  const copy = i18n[language];
  const chips = list.map((s) => `<span class="amenity">${escapeHtml(s)}</span>`).join("");
  return `<div class="ticket-features-block"><p class="ticket-wagon-features-title">${escapeHtml(copy.ticketAllFeatures)}</p><div class="amenity-row ticket-features-unified">${chips}</div></div>`;
}

let language = "ru";

/** Пара городов для экрана и озвучки: RU «А в Б», EN «A to B» (без «стрелки» для TTS). */
function formatRoutePair(origin, destination, lang = language) {
  const o = String(origin ?? "").trim();
  const d = String(destination ?? "").trim();
  if (o && d) return lang === "ru" ? `${o} в ${d}` : `${o} to ${d}`;
  if (o) return o;
  if (d) return d;
  return "—";
}
let state = {};
let intent = null;
let trains = [];
let recommendations = [];
let selectedTrain = null;
/** @type {null | "pickingSecond"} */
let compareMode = null;
let compareFirstId = null;
let compareModalOpen = false;
/** @type {AbortController | null} */
let comparePrefetchAbort = null;
/** @type {ResizeObserver | null} */
let compareLeftColumnResizeObserver = null;
/** Источник выдачи поездов: demo JSON или live-cache (отложенный basicRoute). */
let ticketSearchSource = "demo";
/** Уже догружен полный маршрут (POST /api/train-route-stops) для карты. */
let routeStopsLoadedIds = new Set();
/** Таймеры поочерёдного показа промежуточных точек (отменяются при новой отрисовке карты). */
let routeStopRevealTimeouts = [];
let demoTicket = null;
let checkoutAnimating = false;
let issuingTicket = false;
let demoCarriages = [];
let activeCarriageIndex = 0;
/** @type {Map<string, "platzkart" | "coupe" | "sv">} */
let demoCarriageClassByCar = new Map();

/**
 * Данные РЖД (слой 5764 и поиск): задуманы как полный вагон и полки; на практике ответ часто
 * неполный. Концепция: пока счётчики выглядят как целый вагон — они в приоритете; иначе схема
 * строится по эталонной раскладке класса, а фрагмент свободных мест применяется только в его
 * пределах (остальное на схеме — занято). Пороги согласованы с backend `aggregate_from_carriages_payload`.
 * Подробно: docs/RZD_LAYOUT_POLICY.md
 */
const RZD_TRUST_BERTH_TOTALS_PLATZ_MIN = 36;
const RZD_TRUST_BERTH_TOTALS_PLATZ_MAX = 81;
const RZD_TRUST_BERTH_TOTALS_COUPE_MIN = 16;
const RZD_TRUST_BERTH_TOTALS_SV_MIN = 12;
const RZD_TRUST_TRAIN_CAP_PLATZ_MIN = 36;
const RZD_TRUST_TRAIN_CAP_COUPE_MIN = 16;
const RZD_TRUST_TRAIN_CAP_SV_MIN = 12;
const RZD_TRUST_TRAIN_CAP_DOUBLE_COUPE_MIN = 16;

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
  // SV и люкс проверяем до «купе»: у РЖД часто бывает «Купе СВ» / «спальный вагон».
  if (
    t.includes("люкс") ||
    t.includes("спальный") ||
    (t.includes("св") && !t.includes("плац"))
  ) {
    return "sv";
  }
  if (t.includes("плац") || t.includes("общ")) return "platzkart";
  if (t.includes("куп") || t.includes("сидяч")) return "coupe";
  return null;
}

/** Боковые полки почти всегда означают плацкарт (даже если в typeLoc нет слова «плац»). */
function inferCarClassFromBerthTotals(detail) {
  const tt = detail?.berth_totals;
  if (!tt) return null;
  const side = (tt.side_lower || 0) + (tt.side_upper || 0);
  if (side >= 4) return "platzkart";
  return null;
}

function carriageDetailLooksLikeDoubleDeck(detail) {
  const t = String(detail?.type_label || "").toLowerCase();
  return (
    t.includes("двухэтаж") ||
    t.includes("двухъэтаж") ||
    t.includes("2 этаж") ||
    t.includes("2-этаж") ||
    t.includes("двух ярус")
  );
}

/** Совпадает с логикой buildSeatPickerModel для двухэтажного купе. */
function carriageIsDoubleDeckCoupeLayout(train, car) {
  const cls = carriageClassKey(car);
  if (cls !== "coupe") return false;
  const fallbackCap = carriageCapacityForClass(train, cls);
  const capacity = carriageCapacityFromRzd(train, car, cls, fallbackCap);
  const det = carriageDetailForTab(train, car);
  return capacity >= 8 && (train.coupe_double_deck || carriageDetailLooksLikeDoubleDeck(det));
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

/** Сумма мест по полкам из ответа РЖД для конкретного вагона (если есть). */
function berthTotalsSum(detail) {
  const t = detail?.berth_totals;
  if (!t) return 0;
  return (t.lower || 0) + (t.upper || 0) + (t.side_lower || 0) + (t.side_upper || 0);
}

/**
 * Доверять ли сумме berth_totals из РЖД как описанию **целого** вагона (для подстановки вместимости).
 * Ниже порога считаем ответ фрагментом и используем эталонную вместимость класса.
 */
function berthTotalsLookLikeWholeCarriage(cls, sum, _detail) {
  if (sum < 4) return false;
  if (cls === "platzkart") {
    return sum >= RZD_TRUST_BERTH_TOTALS_PLATZ_MIN && sum <= RZD_TRUST_BERTH_TOTALS_PLATZ_MAX;
  }
  if (cls === "coupe") {
    return sum >= RZD_TRUST_BERTH_TOTALS_COUPE_MIN;
  }
  if (cls === "sv") {
    return sum >= RZD_TRUST_BERTH_TOTALS_SV_MIN;
  }
  return sum >= 4;
}

/**
 * Вместимость для отрисовки: если суммы полок РЖД выглядят целостно — используем их;
 * иначе эталон по классу (`fallbackCapacity` из `carriageCapacityForClass`).
 */
function carriageCapacityFromRzd(train, carCode, cls, fallbackCapacity) {
  const det = carriageDetailForTab(train, carCode);
  const sum = berthTotalsSum(det);
  if (berthTotalsLookLikeWholeCarriage(cls, sum, det)) return Math.min(sum, 72);
  return fallbackCapacity;
}

function parseSeatOrdinal(displayNum) {
  const n = parseInt(String(displayNum), 10);
  return Number.isFinite(n) ? n : 0;
}

function carriageClassFromTrain(train, carCode) {
  const det = carriageDetailForTab(train, carCode);
  const mapped = det && mapTypeLabelToCarClass(det.type_label);
  if (mapped) return mapped;
  const fromBerths = det && inferCarClassFromBerthTotals(det);
  if (fromBerths) return fromBerths;
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

function cubeToneClassFromKind(kind) {
  if (kind === "female") return "compartment-cube--female";
  if (kind === "male") return "compartment-cube--male";
  if (kind === "mixed") return "compartment-cube--mixed";
  if (kind === "children") return "compartment-cube--children";
  if (kind === "family") return "compartment-cube--family";
  return "";
}

function deterministicFallbackCompartmentIndex(train, car, salt, compartmentCount) {
  if (!compartmentCount || compartmentCount <= 0) return 0;
  const seed = hashSeed(`${train?.id || ""}|${String(car)}|${salt}`);
  const rng = mulberry32(seed);
  return Math.floor(rng() * compartmentCount);
}

/**
 * Подсветка одного блока купе: сначала compartment_seat_hints из разбора seats[] на бэкенде;
 * иначе для вагона с «жен/муж/дет/сем» без отсеков — один детерминированно выбранный отсек.
 */
function compartmentToneClassForCube(train, car, compartmentIndex, compartmentCount) {
  const det = train && car ? carriageDetailForTab(train, car) : null;
  if (!det) return "";
  const hints = det.compartment_seat_hints;
  if (Array.isArray(hints) && hints.length > 0) {
    const row = hints.find((h) => Number(h.compartment_index) === Number(compartmentIndex));
    if (row && row.kind && row.kind !== "unknown") {
      return cubeToneClassFromKind(row.kind);
    }
    return "";
  }
  const wk = det.compartment_kind;
  if (wk === "female") {
    const pick = deterministicFallbackCompartmentIndex(train, car, "female-coupe", compartmentCount);
    return pick === compartmentIndex ? "compartment-cube--female" : "";
  }
  if (wk === "male") {
    const pick = deterministicFallbackCompartmentIndex(train, car, "male-coupe", compartmentCount);
    return pick === compartmentIndex ? "compartment-cube--male" : "";
  }
  if (wk === "children") {
    const pick = deterministicFallbackCompartmentIndex(train, car, "children-coupe", compartmentCount);
    return pick === compartmentIndex ? "compartment-cube--children" : "";
  }
  if (wk === "family") {
    const pick = deterministicFallbackCompartmentIndex(train, car, "family-coupe", compartmentCount);
    return pick === compartmentIndex ? "compartment-cube--family" : "";
  }
  if (wk === "mixed") {
    const pick = deterministicFallbackCompartmentIndex(train, car, "mixed-coupe", compartmentCount);
    return pick === compartmentIndex ? "compartment-cube--mixed" : "";
  }
  return "";
}

function seatPickerCompartmentKindHint(train, car) {
  const det = train && car ? carriageDetailForTab(train, car) : null;
  if (!det) return "";
  const copy = i18n[language];
  const hints = det.compartment_seat_hints;
  if (Array.isArray(hints) && hints.length > 0) {
    return copy.seatPickerKindFromSeatRows;
  }
  switch (det.compartment_kind) {
    case "female":
      return copy.seatPickerKindFemaleSingleFallback;
    case "male":
      return copy.seatPickerKindMaleSingleFallback;
    case "mixed":
      return copy.seatPickerKindMixed;
    case "children":
      return copy.seatPickerKindChildren;
    case "family":
      return copy.seatPickerKindFamily;
    default:
      return "";
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
let lastSuccessfulSearchKey = null;
let lastSelectedTrainId = null;

/** Уведомление за GLOBAL_IDLE_WARN_BEFORE_MS до возврата на экран языка */
const GLOBAL_IDLE_MS = 120_000;
const GLOBAL_IDLE_WARN_BEFORE_MS = 10_000;

/** Должны быть объявлены до первого вызова startLanguageScreenAmbient() (иначе TDZ). */
let languageAmbientTimer = null;
let languageAmbientAbort = null;
/** Таймеры бездействия: предупреждение и выход на экран языка */
let globalIdleWarningTimer = null;
let globalIdleLogoutTimer = null;
/** Абсолютное время logout (Date.now() + оставшиеся мс); паузится при запросах к API */
let idleLogoutDeadline = null;
/** Вложенность пауз (несколько параллельных fetch) */
let idlePauseDepth = 0;
/** Оставшееся время сессии при входе в паузу */
let idleRemainingMsAfterPause = GLOBAL_IDLE_MS;
/** После выбора языка отслеживаем активность до возврата на старт */
let sessionIdleTrackingActive = false;

const passengerDemoProfile = {
  ru: { fullName: "Иван Иванович Иванов", document: "4510 123456" },
  en: { fullName: "Ivan Ivanovich Ivanov", document: "4510 123456" },
};

const sessionPassenger = {
  isAuthenticated: false,
  fullName: "",
  phoneDisplay: "",
  document: "",
};

let authPhoneDigits = [];

const screens = {
  language: document.querySelector("#language-screen"),
  auth: document.querySelector("#auth-screen"),
  terminal: document.querySelector("#terminal-screen"),
};
const assistantText = document.querySelector("#assistant-text");
const userInput = document.querySelector("#user-input");
const languageBadge = document.querySelector("#language-badge");
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
const checkoutSeatConfirmWrap = document.querySelector("#checkout-seat-confirm-wrap");
const checkoutButton = document.querySelector("#checkout-button");
const checkoutLoadingEl = document.querySelector("#checkout-loading");
const compareTrainsStartBtn = document.querySelector("#compare-trains-start");
const compareTrainsCancelBar = document.querySelector("#compare-trains-cancel-bar");
const compareTrainsModal = document.querySelector("#compare-trains-modal");
const compareTrainsSheetEl = document.querySelector("#compare-trains-sheet");
const compareTrainsBackdrop = document.querySelector("#compare-trains-backdrop");
const compareTrainsCloseBtn = document.querySelector("#compare-trains-close");
const compareSlotA = document.querySelector("#compare-slot-a");
const compareSlotB = document.querySelector("#compare-slot-b");
const compareTrainsLoadingOverlayEl = document.querySelector("#compare-trains-loading-overlay");
const compareTrainsLoadingTitle = document.querySelector("#compare-trains-loading-title");
const compareTrainsLoadingHint = document.querySelector("#compare-trains-loading-hint");
const compareTrainsTextEl = document.querySelector("#compare-trains-text");
const compareTrainsHeadingEl = document.querySelector("#compare-trains-heading");
const compareCheckoutABtn = document.querySelector("#compare-checkout-a");
const compareCheckoutBBtn = document.querySelector("#compare-checkout-b");
const demoPaymentModal = document.querySelector("#demo-payment-modal");
const confirmSeatsButton = document.querySelector("#confirm-seats-button");
const wagonMetaPanel = document.querySelector("#wagon-meta-panel");
const orbButton = document.querySelector("#orb-button");
const routeLine = document.querySelector("#route-line");
const routeLineFlow = document.querySelector("#route-line-flow");
const routePulse = document.querySelector("#route-pulse");
const dialogHistory = document.querySelector("#dialog-history");
const newSessionButton = document.querySelector("#new-session-button");
const helpSupportButton = document.querySelector("#help-support-button");
const supportChatModal = document.querySelector("#support-chat-modal");
const supportChatBackdrop = document.querySelector("#support-chat-backdrop");
const supportChatClose = document.querySelector("#support-chat-close");
const supportChatTitleEl = document.querySelector("#support-chat-title");
const supportChatDisclaimerEl = document.querySelector("#support-chat-disclaimer");
const supportChatMessagesEl = document.querySelector("#support-chat-messages");
const supportChatInput = document.querySelector("#support-chat-input");
const supportChatSend = document.querySelector("#support-chat-send");
const supportChatMic = document.querySelector("#support-chat-mic");
const supportChatClearBtn = document.querySelector("#support-chat-clear");
const textInputPanel = document.querySelector("#text-input-panel");
const textInputToggle = document.querySelector("#text-input-toggle");

const sessionUserStrip = document.querySelector("#session-user-strip");
const sessionUserLabelEl = document.querySelector("#session-user-label");
const sessionUserNameEl = document.querySelector("#session-user-name");
const sessionLogoutButton = document.querySelector("#session-logout-button");
const sessionIdleWarningEl = document.querySelector("#session-idle-warning");
const topbarA11yWrap = document.querySelector("#topbar-a11y-wrap");
const a11yVisionToggle = document.querySelector("#a11y-vision-toggle");

const authScreen = document.querySelector("#auth-screen");
const authStepPhone = document.querySelector("#auth-step-phone");
const authStepOtp = document.querySelector("#auth-step-otp");
const authPhoneDisplay = document.querySelector("#auth-phone-display");
const authVkeyboardPhone = document.querySelector("#auth-vkeyboard-phone");
const authVkeyboardOtp = document.querySelector("#auth-vkeyboard-otp");
const authPhoneClearBtn = document.querySelector("#auth-phone-clear");
const authPhoneContinueBtn = document.querySelector("#auth-phone-continue");
const authOtpMessage = document.querySelector("#auth-otp-message");
const authOtpInput = document.querySelector("#auth-otp-input");
const authOtpDoneBtn = document.querySelector("#auth-otp-done");
const authPanelTitle = document.querySelector("#auth-panel-title");
const authPanelSubtitle = document.querySelector("#auth-panel-subtitle");

const terminalStatusStrip = document.querySelector("#terminal-status-strip");
const dataSourceBanner = document.querySelector("#data-source-banner");
const backendHealthBanner = document.querySelector("#backend-health-banner");

/** История имитации чата поддержки (сбрасывается при возврате на экран языка). */
let supportChatTurns = [];
let supportRecognition = null;
let supportChatSending = false;

/** Блокировка двойных отправок диалога / поиска */
let uiInteractionLocked = false;

/** Максимум символов в одном сообщении пользователя (paste / злоупотребление) */
const MAX_USER_MESSAGE_CHARS = 4000;

/** Отмена цепочки dialog → search при новом запросе или сбросе сценария */
let dialogAbortController = null;

function takeDialogAbortSignal() {
  if (dialogAbortController) {
    try {
      dialogAbortController.abort();
    } catch {
      /* ignore */
    }
  }
  dialogAbortController = new AbortController();
  return dialogAbortController.signal;
}

function abortDialogRequests() {
  if (dialogAbortController) {
    try {
      dialogAbortController.abort();
    } catch {
      /* ignore */
    }
    dialogAbortController = null;
  }
}

/** Двойной клик по языку до завершения перехода экрана */
let languageScreenBusy = false;

/** Гонки при быстром переключении карточек поездов */
let selectTrainSeq = 0;

/** Одна активная сессия распознавания речи для сферы */
let orbRecognition = null;

const SCREEN_MOTION_MS = 340;
const WORKSPACE_MOTION_MS = 300;

function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function waitTransitionEnd(el, fallbackMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timeoutId);
      resolve();
    };
    const timeoutId = setTimeout(finish, fallbackMs);
    el.addEventListener(
      "transitionend",
      (ev) => {
        if (ev.target === el) finish();
      },
      { once: true },
    );
  });
}

function clearGlobalIdleTimers() {
  if (globalIdleWarningTimer) {
    clearTimeout(globalIdleWarningTimer);
    globalIdleWarningTimer = null;
  }
  if (globalIdleLogoutTimer) {
    clearTimeout(globalIdleLogoutTimer);
    globalIdleLogoutTimer = null;
  }
}

function hideIdleWarning() {
  sessionIdleWarningEl?.classList.add("hidden");
  if (sessionIdleWarningEl) sessionIdleWarningEl.textContent = "";
}

function showIdleWarning() {
  if (!sessionIdleWarningEl || !sessionIdleTrackingActive) return;
  sessionIdleWarningEl.textContent = i18n[language].idleLogoutWarning;
  sessionIdleWarningEl.classList.remove("hidden");
}

function scheduleIdleFromDeadline() {
  clearGlobalIdleTimers();
  if (!sessionIdleTrackingActive || idlePauseDepth > 0) return;
  const now = Date.now();
  if (idleLogoutDeadline == null) {
    idleLogoutDeadline = now + GLOBAL_IDLE_MS;
  }
  const msLogout = Math.max(0, idleLogoutDeadline - now);
  const warnAt = idleLogoutDeadline - GLOBAL_IDLE_WARN_BEFORE_MS;
  const msWarn = Math.max(0, warnAt - now);

  if (msLogout <= 0) {
    hideIdleWarning();
    void performIdleLogout();
    return;
  }
  globalIdleWarningTimer = setTimeout(() => {
    globalIdleWarningTimer = null;
    showIdleWarning();
  }, msWarn);
  globalIdleLogoutTimer = setTimeout(() => {
    globalIdleLogoutTimer = null;
    hideIdleWarning();
    void performIdleLogout();
  }, msLogout);
}

/** Начало ожидания ответа backend — «замораживаем» отсчёт бездействия. */
function beginIdlePause() {
  if (!sessionIdleTrackingActive) return;
  idlePauseDepth += 1;
  if (idlePauseDepth === 1) {
    idleRemainingMsAfterPause =
      idleLogoutDeadline != null ? Math.max(0, idleLogoutDeadline - Date.now()) : GLOBAL_IDLE_MS;
    clearGlobalIdleTimers();
  }
}

/** Конец запроса — возобновляем отсчёт с сохранённым остатком времени. */
function endIdlePause() {
  idlePauseDepth -= 1;
  if (idlePauseDepth < 0) idlePauseDepth = 0;
  if (idlePauseDepth !== 0 || !sessionIdleTrackingActive) return;
  idleLogoutDeadline = Date.now() + idleRemainingMsAfterPause;
  scheduleIdleFromDeadline();
}

function touchGlobalIdle(ev) {
  if (!sessionIdleTrackingActive) return;
  if (ev?.target?.closest?.("#session-logout-button")) return;
  hideIdleWarning();
  idleLogoutDeadline = Date.now() + GLOBAL_IDLE_MS;
  idleRemainingMsAfterPause = GLOBAL_IDLE_MS;
  scheduleIdleFromDeadline();
}

async function performIdleLogout() {
  await returnToLanguageIdleScreen();
}

function formatPhoneMaskDisplay(digits) {
  const d = digits.slice(0, 10);
  const g = (i) => (i < d.length ? d[i] : "_");
  return `+7 (${g(0)}${g(1)}${g(2)}) ${g(3)}${g(4)}${g(5)}-${g(6)}${g(7)}-${g(8)}${g(9)}`;
}

function updateAuthPhoneChrome() {
  if (authPhoneDisplay) authPhoneDisplay.textContent = formatPhoneMaskDisplay(authPhoneDigits);
  if (authPhoneContinueBtn) authPhoneContinueBtn.disabled = authPhoneDigits.length !== 10;
}

function authPhoneInputDigit(d) {
  if (authPhoneDigits.length >= 10) return;
  authPhoneDigits.push(d);
  updateAuthPhoneChrome();
  touchGlobalIdle();
}

function authPhoneBackspace() {
  authPhoneDigits.pop();
  updateAuthPhoneChrome();
  touchGlobalIdle();
}

function applyAuthScreenI18n() {
  const copy = i18n[language];
  if (authPanelTitle) authPanelTitle.textContent = copy.authTitle;
  if (authPanelSubtitle) authPanelSubtitle.textContent = copy.authSubtitle;
  const phoneLab = document.querySelector("#auth-phone-label");
  if (phoneLab) phoneLab.textContent = copy.authPhoneLabel;
  if (authVkeyboardPhone) authVkeyboardPhone.setAttribute("aria-label", copy.authPhoneKeyboardAria);
  const authOtpLabelEl = document.querySelector("#auth-otp-label");
  if (authOtpLabelEl) authOtpLabelEl.textContent = copy.authOtpLabel;
  const authOtpHintEl = document.querySelector("#auth-otp-hint");
  if (authOtpHintEl) authOtpHintEl.textContent = copy.authOtpHint;
  if (authVkeyboardOtp) authVkeyboardOtp.setAttribute("aria-label", copy.authOtpKeyboardAria);
  if (authPhoneClearBtn) authPhoneClearBtn.textContent = copy.authClear;
  if (authPhoneContinueBtn) authPhoneContinueBtn.textContent = copy.authContinue;
  if (authOtpDoneBtn) authOtpDoneBtn.textContent = copy.authLogin;
  document.querySelectorAll("[data-vkey-role=\"erase\"]").forEach((btn) => {
    btn.textContent = copy.authVkeyErase;
  });
}

function resetAuthFlow() {
  authPhoneDigits = [];
  authStepPhone?.classList.remove("hidden");
  authStepOtp?.classList.add("hidden");
  if (authOtpInput) {
    authOtpInput.value = "";
    authOtpInput.disabled = true;
  }
  updateAuthPhoneChrome();
  if (authPhoneContinueBtn) authPhoneContinueBtn.disabled = authPhoneDigits.length !== 10;
  syncOtpChrome();
}

function renderSessionUserStrip() {
  if (!sessionUserStrip || !sessionUserNameEl) return;
  if (!sessionPassenger.fullName) {
    sessionUserStrip.classList.add("hidden");
    sessionLogoutButton?.classList.add("hidden");
    return;
  }
  const copy = i18n[language];
  if (sessionUserLabelEl) sessionUserLabelEl.textContent = copy.sessionUserLabel;
  sessionUserNameEl.textContent = sessionPassenger.fullName;
  sessionUserStrip.classList.remove("hidden");
  if (sessionLogoutButton) {
    sessionLogoutButton.textContent = copy.sessionLogout;
    sessionLogoutButton.setAttribute("aria-label", copy.sessionLogout);
    sessionLogoutButton.classList.toggle("hidden", !sessionPassenger.isAuthenticated);
  }
}

/**
 * Кнопка «Слабовидящим» только на экране выбора языка; при возврате на него режим сбрасывается.
 * Включённый режим действует на весь сценарий до выхода на язык.
 */
function resetA11yVisionMode() {
  document.documentElement.removeAttribute("data-a11y-vision");
  if (a11yVisionToggle) a11yVisionToggle.setAttribute("aria-pressed", "false");
}

function syncTopbarA11yVisibility() {
  const lang = screens.language;
  const langVisible = Boolean(lang && !lang.classList.contains("hidden"));
  if (topbarA11yWrap) topbarA11yWrap.classList.toggle("hidden", !langVisible);
}

function initA11yVisionToggle() {
  if (a11yVisionToggle) {
    a11yVisionToggle.addEventListener("click", () => {
      const on = !document.documentElement.hasAttribute("data-a11y-vision");
      if (on) document.documentElement.setAttribute("data-a11y-vision", "");
      else document.documentElement.removeAttribute("data-a11y-vision");
      a11yVisionToggle.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  syncTopbarA11yVisibility();
}

function clearSessionPassenger() {
  sessionPassenger.isAuthenticated = false;
  sessionPassenger.fullName = "";
  sessionPassenger.phoneDisplay = "";
  sessionPassenger.document = "";
  authPhoneDigits = [];
  sessionUserStrip?.classList.add("hidden");
  if (sessionUserNameEl) sessionUserNameEl.textContent = "";
  sessionLogoutButton?.classList.add("hidden");
}

function authOtpInputDigit(d) {
  if (!authOtpInput || authOtpInput.disabled) return;
  const cur = (authOtpInput.value || "").replace(/\D/g, "");
  if (cur.length >= 6) return;
  authOtpInput.value = cur + d;
  syncOtpChrome();
  touchGlobalIdle();
}

function authOtpBackspace() {
  if (!authOtpInput || authOtpInput.disabled) return;
  const digits = (authOtpInput.value || "").replace(/\D/g, "");
  authOtpInput.value = digits.slice(0, -1);
  syncOtpChrome();
  touchGlobalIdle();
}

function syncOtpChrome() {
  if (!authOtpInput) return;
  const digits = (authOtpInput.value || "").replace(/\D/g, "").slice(0, 6);
  if (authOtpInput.value !== digits) authOtpInput.value = digits;
  if (authOtpDoneBtn) {
    const canSubmit = digits.length === 6 && !authOtpInput.disabled;
    authOtpDoneBtn.disabled = !canSubmit;
  }
}

function mountDigitKeyboard(host, mode) {
  if (!host) return;
  host.innerHTML = "";
  const layout = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["erase", "0", "spacer"],
  ];
  const copy = i18n[language];
  layout.forEach((row) => {
    const wrap = document.createElement("div");
    wrap.className = "vkeyboard-row";
    row.forEach((key) => {
      if (key === "spacer") {
        const sp = document.createElement("div");
        sp.className = "vkeyboard-spacer";
        sp.setAttribute("aria-hidden", "true");
        wrap.append(sp);
        return;
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vkeyboard-key";
      if (key === "erase") {
        btn.dataset.vkeyRole = "erase";
        btn.textContent = copy.authVkeyErase;
        btn.addEventListener("click", () => {
          if (mode === "phone") authPhoneBackspace();
          else authOtpBackspace();
        });
      } else {
        btn.textContent = key;
        btn.addEventListener("click", () => {
          if (mode === "phone") authPhoneInputDigit(key);
          else authOtpInputDigit(key);
        });
      }
      wrap.append(btn);
    });
    host.append(wrap);
  });
}

function buildAuthVirtualKeyboards() {
  if (!authVkeyboardPhone || !authVkeyboardOtp) return;
  if (authVkeyboardPhone.dataset.built === "1") return;
  authVkeyboardPhone.dataset.built = "1";
  authVkeyboardOtp.dataset.built = "1";
  mountDigitKeyboard(authVkeyboardPhone, "phone");
  mountDigitKeyboard(authVkeyboardOtp, "otp");
}

function buildAuthVirtualKeyboard() {
  buildAuthVirtualKeyboards();
}

async function completeAuthFlow() {
  if (sessionPassenger.isAuthenticated) return;
  if (!sessionIdleTrackingActive) return;
  const profile = passengerDemoProfile[language] || passengerDemoProfile.ru;
  const digits = authPhoneDigits.join("");
  if (digits.length !== 10) return;
  sessionPassenger.fullName = profile.fullName;
  sessionPassenger.document = profile.document;
  sessionPassenger.phoneDisplay = `+7 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`;

  await transitionAuthToTerminal();
  sessionPassenger.isAuthenticated = true;
  renderSessionUserStrip();
  resetScenario(false);
  newSessionButton?.classList.remove("hidden");
  helpSupportButton?.classList.remove("hidden");
  textInputToggle?.classList.remove("hidden");
  updateTextInputToggleLabels();
  refreshThemeToggleLabels();
  applySupportChatChrome();
  applyCheckoutLoadingTexts();
  applyCompareChrome();
  applyDemoPaymentChrome();
  assistantSay(i18n[language].assistantReady, { addToHistory: true });
  void pingBackendHealth();
  touchGlobalIdle();
}

async function runAuthOtpPhase() {
  if (authPhoneDigits.length !== 10) return;
  if (!authStepPhone || authStepPhone.classList.contains("hidden")) return;
  if (authPhoneContinueBtn) authPhoneContinueBtn.disabled = true;
  const copy = i18n[language];
  authStepPhone?.classList.add("hidden");
  authStepOtp?.classList.remove("hidden");
  if (authOtpMessage) authOtpMessage.textContent = copy.authOtpSending;
  if (authOtpInput) {
    authOtpInput.value = "";
    authOtpInput.disabled = true;
  }
  syncOtpChrome();
  touchGlobalIdle();
  await sleep(1600);
  if (!sessionIdleTrackingActive) return;
  if (authOtpMessage) authOtpMessage.textContent = copy.authOtpSent;
  await sleep(900);
  if (!sessionIdleTrackingActive) return;
  const code = String(Math.floor(100000 + Math.random() * 900000));
  if (authOtpInput) {
    authOtpInput.value = code;
    authOtpInput.disabled = false;
  }
  syncOtpChrome();
  touchGlobalIdle();
  await sleep(400);
  if (!sessionIdleTrackingActive) return;
  await completeAuthFlow();
}

async function transitionLanguageToAuth() {
  const lang = screens.language;
  const auth = screens.auth;
  const term = screens.terminal;
  if (!lang || !auth) return;
  if (term) term.classList.add("hidden");
  if (prefersReducedMotion()) {
    lang.classList.add("hidden");
    auth.classList.remove("hidden");
    syncTopbarA11yVisibility();
    return;
  }
  lang.classList.add("screen-motion-leave-out-up");
  await waitTransitionEnd(lang, SCREEN_MOTION_MS + 140);
  lang.classList.add("hidden");
  lang.classList.remove("screen-motion-leave-out-up");
  auth.classList.remove("hidden");
  auth.classList.add("screen-motion-enter-from-below");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      auth.classList.remove("screen-motion-enter-from-below");
    });
  });
  syncTopbarA11yVisibility();
}

async function transitionAuthToTerminal() {
  const auth = screens.auth;
  const term = screens.terminal;
  if (!auth || !term) return;
  if (prefersReducedMotion()) {
    auth.classList.add("hidden");
    term.classList.remove("hidden");
    syncTopbarA11yVisibility();
    return;
  }
  auth.classList.add("screen-motion-leave-out-up");
  await waitTransitionEnd(auth, SCREEN_MOTION_MS + 140);
  auth.classList.add("hidden");
  auth.classList.remove("screen-motion-leave-out-up");
  term.classList.remove("hidden");
  term.classList.add("screen-motion-enter-from-below");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      term.classList.remove("screen-motion-enter-from-below");
    });
  });
  syncTopbarA11yVisibility();
}

async function transitionAnyToLanguage() {
  const lang = screens.language;
  const term = screens.terminal;
  const auth = screens.auth;
  if (!lang || !term || !auth) return;
  const leaving = !term.classList.contains("hidden") ? term : auth;
  if (prefersReducedMotion()) {
    term.classList.add("hidden");
    auth.classList.add("hidden");
    lang.classList.remove("hidden");
    resetA11yVisionMode();
    syncTopbarA11yVisibility();
    return;
  }
  leaving.classList.add("screen-motion-leave-out-down");
  await waitTransitionEnd(leaving, SCREEN_MOTION_MS + 140);
  term.classList.add("hidden");
  auth.classList.add("hidden");
  leaving.classList.remove("screen-motion-leave-out-down");
  lang.classList.remove("hidden");
  lang.classList.add("screen-motion-enter-from-above");
  resetA11yVisionMode();
  syncTopbarA11yVisibility();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      lang.classList.remove("screen-motion-enter-from-above");
    });
  });
}

document.querySelectorAll("[data-language]").forEach((button) => {
  button.addEventListener("click", () => void setLanguage(button.dataset.language));
});
const sendBtn = document.querySelector("#send-button");
if (sendBtn && userInput) {
  sendBtn.addEventListener("click", () => handleUserText(userInput.value));
}
if (orbButton) {
  orbButton.addEventListener("click", startVoiceRecognition);
  orbButton.classList.add("orb-idle");
}
const restartBtn = document.querySelector("#restart-button");
if (restartBtn) restartBtn.addEventListener("click", () => resetScenario(true));
if (newSessionButton) newSessionButton.addEventListener("click", () => resetScenario(true));
if (checkoutButton) checkoutButton.addEventListener("click", () => createTicket());
if (confirmSeatsButton) confirmSeatsButton.addEventListener("click", () => confirmSeatSelection());
if (userInput) {
  userInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleUserText(userInput.value);
    }
  });
}

if (textInputToggle) {
  textInputToggle.addEventListener("click", () => {
    setTextInputPanelOpen(!textInputPanelOpen);
  });
}

function setTextInputPanelOpen(open) {
  if (!textInputPanel || !textInputToggle || !userInput) return;
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
  if (!textInputToggle) return;
  const copy = i18n[language];
  textInputToggle.textContent = textInputPanelOpen ? copy.textInputHide : copy.textInputReveal;
  textInputToggle.setAttribute("aria-label", textInputPanelOpen ? copy.textInputAriaHide : copy.textInputAriaShow);
}

updateTextInputToggleLabels();
applySupportChatChrome();
applyCheckoutLoadingTexts();
applyCompareChrome();
applyDemoPaymentChrome();
initThemeToggle();
initSupportChatModal();
initCompareTrainModal();
initPathLogModal();
initA11yVisionToggle();

window.pathTerminalIdleFetchBegin = beginIdlePause;
window.pathTerminalIdleFetchEnd = endIdlePause;

if (sessionLogoutButton) {
  sessionLogoutButton.addEventListener("click", () => void returnToLanguageIdleScreen());
}

if (authPhoneClearBtn) {
  authPhoneClearBtn.addEventListener("click", () => {
    resetAuthFlow();
    touchGlobalIdle();
  });
}
if (authPhoneContinueBtn) authPhoneContinueBtn.addEventListener("click", () => void runAuthOtpPhase());
if (authOtpDoneBtn) authOtpDoneBtn.addEventListener("click", () => void completeAuthFlow());
if (authOtpInput) authOtpInput.addEventListener("input", syncOtpChrome);

document.addEventListener("pointerdown", (ev) => touchGlobalIdle(ev), true);
document.addEventListener("keydown", (ev) => touchGlobalIdle(ev), true);
try {
  startLanguageScreenAmbient();
} catch (ambientBootErr) {
  console.error("[language-ambient boot]", ambientBootErr);
}

// Чипы меняются в зависимости от стадии сценария: старт, поиск, результаты,
// оформление. Неактуальные подсказки исчезают, чтобы экран не выглядел шумным.
document.querySelector("#chips")?.addEventListener("click", (event) => {
  if (!event.target.matches("button")) return;
  const action = event.target.dataset.action;
  if (uiInteractionLocked && action !== "restart") return;
  if (action === "restart") {
    resetScenario(true);
    return;
  }
  if (action === "choose-best" && trains.length) {
    void selectTrain(getTrainsForUi()[0]);
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

async function returnToLanguageIdleScreen() {
  sessionIdleTrackingActive = false;
  idleLogoutDeadline = null;
  idlePauseDepth = 0;
  clearGlobalIdleTimers();
  hideIdleWarning();
  clearSessionPassenger();
  stopAssistantSpeech();
  closeSupportChatModal();
  supportChatTurns = [];
  resetScenario(false);
  resetAuthFlow();
  newSessionButton?.classList.add("hidden");
  helpSupportButton?.classList.add("hidden");
  textInputToggle?.classList.add("hidden");
  setTextInputPanelOpen(false);
  await transitionAnyToLanguage();
  try {
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch {
    window.scrollTo(0, 0);
  }
  try {
    startLanguageScreenAmbient();
  } catch (err) {
    console.error("[language-ambient return]", err);
  }
}

async function setLanguage(nextLanguage) {
  if (languageScreenBusy) return;
  languageScreenBusy = true;
  document.querySelector(".language-actions")?.classList.add("language-actions--busy");
  try {
    stopLanguageScreenAmbient();
    language = nextLanguage;
    const copy = i18n[language];
    if (languageBadge) languageBadge.textContent = language.toUpperCase();
    document.querySelector("#terminal-title").textContent = copy.title;
    document.querySelector("#start-prompt").textContent = copy.startPrompt;
    document.querySelector("#send-button").textContent = copy.send;
    document.querySelector("#listen-label").textContent = copy.listen;
    document.querySelector("#history-title").textContent = copy.history;
    userInput.placeholder = copy.textPlaceholder;
    document.querySelector("#intent-title").textContent = copy.understood;
    document.querySelector("#route-title").textContent = copy.route;
    applyAiFactHeading(document.querySelector("#fact-title"), copy.fact);
    document.querySelector("#trains-title").textContent = copy.options;
    document.querySelector("#restart-button").textContent = copy.restart;
    newSessionButton.textContent = copy.newSession;
    document.querySelector("#seat-picker-title").textContent = copy.seatPickerTitle;
    document.querySelector("#seat-picker-hint").textContent = copy.seatPickerHint;
    if (confirmSeatsButton) confirmSeatsButton.textContent = copy.seatPickerConfirm;
    sessionIdleTrackingActive = true;
    touchGlobalIdle();
    await transitionLanguageToAuth();
    resetScenario(false);
    applyAuthScreenI18n();
    resetAuthFlow();
    buildAuthVirtualKeyboard();
    newSessionButton?.classList.add("hidden");
    helpSupportButton?.classList.add("hidden");
    textInputToggle?.classList.add("hidden");
    updateTextInputToggleLabels();
    refreshThemeToggleLabels();
    applySupportChatChrome();
    applyCheckoutLoadingTexts();
    applyCompareChrome();
    applyDemoPaymentChrome();
  } finally {
    languageScreenBusy = false;
    document.querySelector(".language-actions")?.classList.remove("language-actions--busy");
  }
}

function renderChips(stage = uiStage) {
  const chips = document.querySelector("#chips");
  if (!chips) return;
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
  let cleanText = text.trim();
  if (!cleanText) return;
  cleanText = cleanText.slice(0, MAX_USER_MESSAGE_CHARS);
  if (cleanText.toLowerCase() === PATH_DEBUG_TRIGGER) {
    if (userInput) userInput.value = "";
    openPathLogModal();
    return;
  }
  if (uiInteractionLocked) return;
  if (checkoutAnimating) return;
  lastDialogUserText = cleanText;

  if (await tryVoiceCheckoutConfirmation(cleanText)) {
    addMessage("user", cleanText);
    return;
  }

  addMessage("user", cleanText);
  await runDialog(cleanText);
}

/** Голосовое подтверждение оформления демо-билета для рекомендованного / выбранного поезда. */
function matchesVoiceCheckoutIntent(text) {
  const t = text.trim();
  const lower = t.toLowerCase();

  if (uiStage === "checkout") {
    if (language === "ru") {
      if (/^(да|давай|ок|окей|ага|угу|конечно|верно|ну\s+да)\.?$/i.test(t)) return true;
      if (/^подтверждаю\.?$/i.test(t)) return true;
    } else if (/^(yes|yeah|ok|okay|sure|go ahead|confirm)\.?$/i.test(t)) return true;
  }

  if (language === "ru") {
    if (/\bоформ(ляй|ить)\s+(демо[\s-]*)?билет/i.test(lower)) return true;
    if (/\bоформ(ление)\s+билет/i.test(lower)) return true;
    if (/подтверждаю.{0,40}(билет|оформ|демо|поезд)/i.test(lower)) return true;
    if (/(устраивает|подходит).{0,40}(оформ|берём|берем|давай|билет)/i.test(lower)) return true;
    if (/^(да|ок)[,\s]+(оформ|берём|берем|бери|давай)/i.test(lower)) return true;
    if (/рекомендованн.{0,24}(устраивает|подходит|ок|норм)/i.test(lower)) return true;
    if (/\bберу\b.{0,48}\bпоезд/i.test(lower)) return true;
    if (/\bхочу\b.{0,32}\b(билет|оформ)/i.test(lower)) return true;
    return false;
  }

  if (/\bissue\b.{0,24}\b(demo\s*)?ticket\b/i.test(lower)) return true;
  if (/\bbook\b.{0,24}\b(the\s*)?ticket\b/i.test(lower)) return true;
  if (/go ahead.{0,32}(with\s*)?(the\s*)?(booking|ticket)/i.test(lower)) return true;
  if (/confirm.{0,24}(ticket|booking|purchase)/i.test(lower)) return true;
  return false;
}

async function tryVoiceCheckoutConfirmation(text) {
  if (checkoutAnimating || issuingTicket) return false;

  let wantsCheckout = matchesVoiceCheckoutIntent(text);
  if (
    !wantsCheckout &&
    (uiStage === "results" || uiStage === "checkout") &&
    (uiStage !== "results" || trains.length > 0)
  ) {
    setUiInteractionLocked(true);
    try {
      wantsCheckout = await fetchCheckoutVoiceIntentFromLlm(text);
    } finally {
      setUiInteractionLocked(false);
    }
  }
  if (!wantsCheckout) return false;

  if (uiStage === "results" && trains.length > 0) {
    const id = getTrainHighlightId();
    const train = id ? trains.find((x) => x.id === id) : null;
    if (!train) return false;
    await selectTrain(train, { suppressSelectionSpeech: true });
    await createTicket();
    return true;
  }

  if (uiStage === "checkout" && selectedTrain) {
    await createTicket();
    return true;
  }

  return false;
}

async function fetchCheckoutVoiceIntentFromLlm(text) {
  try {
    const res = await postJson("/api/checkout-voice-intent", {
      language,
      text,
      ui_stage: uiStage,
    });
    return Boolean(res.confirm_demo_checkout);
  } catch (e) {
    console.warn("checkout-voice-intent failed", e);
    return false;
  }
}

async function runDialog(text) {
  const signal = takeDialogAbortSignal();
  setUiInteractionLocked(true);
  try {
    setStage("searching");
    const response = await postJson(
      "/api/dialog",
      {
        language,
        text,
        state,
        conversation: conversationPayload(),
      },
      { signal },
    );
    if (signal.aborted) return;
    state = response.state;
    assistantSay(response.assistant_text);
    intent = normalizeIntent(state, response.assistant_text);
    renderIntent(intent);
    if (response.action === "search_tickets" && hasRequiredTripFields(intent)) {
      const fp = routeFingerprint(intent);
      if (fp && fp === lastSuccessfulSearchKey) {
        setStage(trains.length ? "results" : "initial");
      } else {
        await searchAndRecommend(signal);
      }
    } else {
      setStage("initial");
    }
  } catch (error) {
    if (error && error.name === "AbortError") return;
    console.error(error);
    runLocalDemoFallback();
  } finally {
    setUiInteractionLocked(false);
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

function routeFingerprint(data) {
  if (!data?.origin || !data?.destination || !data?.date) return null;
  return `${data.origin}|${data.destination}|${data.date}`;
}

function conversationPayload() {
  return dialogMessages.slice(-10).map((m) => ({
    role: m.role,
    text: String(m.text || "").slice(0, 2000),
  }));
}

async function searchAndRecommend(signal) {
  trainsPanel?.setAttribute("aria-busy", "true");
  renderTrainListSkeleton();
  try {
    await searchAndRecommendBody(signal);
  } finally {
    trainsPanel?.setAttribute("aria-busy", "false");
  }
}

async function searchAndRecommendBody(signal) {
  if (signal?.aborted) return;
  const searchRequest = {
    language,
    origin: intent.origin,
    destination: intent.destination,
    date: intent.date,
    arrival_time_window: intent.arrival_time_window,
    departure_time_window: intent.departure_time_window,
    preferences: intent.preferences,
    last_user_message: lastDialogUserText || null,
    rank_with_llm: Boolean(intent.rank_with_llm),
  };

  let ticketResponse;
  try {
    ticketResponse = await postJson("/api/tickets/search", searchRequest, { signal });
  } catch (error) {
    if (error && error.name === "AbortError") return;
    console.error("tickets/search failed", error);
    trains = [];
    recommendations = [];
    assistantSay(i18n[language].searchTicketError);
    renderTrains();
    setStage("initial");
    return;
  }

  if (signal.aborted) return;

  ticketSearchSource = ticketResponse.source || "demo";
  updateDataSourceBanner(ticketSearchSource);
  routeStopsLoadedIds = new Set();

  trains = ticketResponse.trains || [];
  selectedTrain = null;
  lastSelectedTrainId = null;

  let factText = "";
  try {
    const factResponse = await postJson(
      "/api/fun-fact",
      {
        language,
        origin: intent.origin,
        destination: intent.destination,
      },
      { signal },
    );
    factText = factResponse.fact;
  } catch (error) {
    if (error && error.name === "AbortError") return;
    console.error("fun-fact failed", error);
    factText = i18n[language].routeFactUnavailable;
  }
  if (signal.aborted) return;
  renderRoute(factText, { skipMapUpdate: true });

  if (!trains.length) {
    recommendations = [];
    assistantSay(
      language === "ru"
        ? "По этому направлению на выбранную дату нет поездов со свободными местами. Попробуйте другую дату или маршрут."
        : "No trains with available seats for this route and date. Try another date or route.",
    );
    renderTrains();
    setStage("results");
    lastSuccessfulSearchKey = routeFingerprint(intent);
    return;
  }

  try {
    const recommendResponse = await postRecommendWithRetries(
      {
        language,
        intent,
        trains,
        last_user_message: lastDialogUserText || null,
        conversation: conversationPayload(),
      },
      { signal },
    );
    recommendations = recommendResponse.recommendations;
    assistantSay(recommendResponse.assistant_text);
  } catch (error) {
    if (error && error.name === "AbortError") return;
    console.error("recommend failed after retries", error);
    recommendations = buildFallbackRecommendationsFromTrains(trains);
    assistantSay(localVoiceExplanationFromTrain(trains[0]));
  }
  if (signal.aborted) return;
  await refreshTopRecommendedTrainRouteLikeSelect(signal);
  renderTrains();
  setStage("results");
  await prepareRecommendedCheckoutUi();
  lastSuccessfulSearchKey = routeFingerprint(intent);
}

function timeWindowSpanMinutes(win) {
  if (!win?.start || !win?.end) return NaN;
  const parse = (raw) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(raw).trim());
    if (!m) return NaN;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  };
  let a = parse(win.start);
  let b = parse(win.end);
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  if (b <= a) b += 24 * 60;
  return b - a;
}

/**
 * Показываем окна «Отправление / Прибытие» только если в данных есть осмысленное
 * ограничение по времени (не плейсхолдер «весь день» от модели).
 */
function isMeaningfulTimeConstraint(win) {
  if (!win || win.start == null || win.end == null) return false;
  const s = String(win.start).trim();
  const e = String(win.end).trim();
  if (!s || !e) return false;
  const span = timeWindowSpanMinutes(win);
  if (Number.isNaN(span) || span <= 0) return false;
  const fullDayStarts = new Set(["00:00", "0:00"]);
  const fullDayEnds = new Set(["23:59", "24:00", "23:30"]);
  if (fullDayStarts.has(s) && fullDayEnds.has(e)) return false;
  if (span >= 21 * 60 + 30) return false;
  return true;
}

function renderIntent(data) {
  if (!intentPanel) return;
  intentPanel.classList.remove("hidden");
  const depWin = data.departure_time_window;
  const arrWin = data.arrival_time_window;
  const showDepartureWindow = isMeaningfulTimeConstraint(depWin);
  const showArrivalWindow = isMeaningfulTimeConstraint(arrWin);

  const cards = [
    `<div class="glass-card"><span>${language === "ru" ? "Откуда" : "From"}</span><strong>${data.origin || "-"}</strong></div>`,
    `<div class="glass-card"><span>${language === "ru" ? "Куда" : "To"}</span><strong>${data.destination || "-"}</strong></div>`,
    `<div class="glass-card"><span>${language === "ru" ? "Дата" : "Date"}</span><strong>${data.date || "-"}</strong></div>`,
  ];
  if (showDepartureWindow) {
    cards.push(
      `<div class="glass-card"><span>${language === "ru" ? "Отправление" : "Departure"}</span><strong>${depWin.start}-${depWin.end}</strong></div>`,
    );
  }
  if (showArrivalWindow) {
    cards.push(
      `<div class="glass-card"><span>${language === "ru" ? "Прибытие" : "Arrival"}</span><strong>${arrWin.start}-${arrWin.end}</strong></div>`,
    );
  }
  document.querySelector("#intent-grid").innerHTML = cards.join("");
}

function renderRoute(factText, options = {}) {
  const { skipMapUpdate = false } = options;
  const factEl = document.querySelector("#route-fact");
  if (factEl) factEl.textContent = factText;
  if (!skipMapUpdate) {
    updateRouteMapForSelectedTrain();
  }
}

function findRouteVisual(destination) {
  const normalized = (destination || "").toLowerCase();
  if (normalized.includes("петербург") || normalized.includes("petersburg")) return routeVisuals["Санкт-Петербург"];
  if (normalized.includes("сочи") || normalized.includes("sochi")) return routeVisuals["Сочи"];
  if (normalized.includes("каз") || normalized.includes("kazan")) return routeVisuals["Казань"];
  return routeVisuals.default;
}

function routeMapStopElements() {
  const dots = [];
  const labels = [];
  for (let i = 0; i < ROUTE_MAP_MAX_INTERMEDIATE_STOPS; i += 1) {
    const letter = String.fromCharCode(97 + i);
    dots.push(document.querySelector(`#stop-dot-${letter}`));
    labels.push(document.querySelector(`#stop-label-${letter}`));
  }
  return { dots, labels };
}

function clearRouteStopRevealTimers() {
  routeStopRevealTimeouts.forEach((id) => clearTimeout(id));
  routeStopRevealTimeouts = [];
}

function updateMapGeometry(visual, labelOverride) {
  const destPt = visual?.destination ?? routeVisuals.default.destination;
  if (!destPt) return;
  const originText =
    labelOverride?.origin ??
    intent?.origin ??
    (language === "ru" ? "Москва" : "Moscow");
  const destText =
    labelOverride?.destination ??
    intent?.destination ??
    (language === "ru" ? "Казань" : "Kazan");
  const destinationDot = document.querySelector("#destination-dot");
  const originDot = document.querySelector("#origin-dot");
  const originLabel = document.querySelector("#origin-label");
  const destinationLabel = document.querySelector("#destination-label");
  const oVis = visual.origin || DEFAULT_ROUTE_ORIGIN;
  if (originDot) {
    originDot.setAttribute("cx", String(oVis.x));
    originDot.setAttribute("cy", String(oVis.y));
  }
  const { dots: stopDots, labels: stopLabels } = routeMapStopElements();
  [destinationDot, routePulse].forEach((dot) => {
    if (!dot) return;
    dot.setAttribute("cx", String(destPt.x));
    dot.setAttribute("cy", String(destPt.y));
  });
  if (originLabel) {
    originLabel.textContent = originText;
    originLabel.setAttribute("x", String(oVis.labelX ?? oVis.x - 43));
    originLabel.setAttribute("y", String(oVis.labelY ?? oVis.y + 36));
  }
  if (destinationLabel) {
    destinationLabel.textContent = destText;
    destinationLabel.setAttribute("x", String(destPt.labelX));
    destinationLabel.setAttribute("y", String(destPt.labelY));
  }

  const stopsList = visual.stops || [];
  clearRouteStopRevealTimers();

  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wantStagger = stopsList.some(Boolean) && !reducedMotion;

  if (!wantStagger) {
    stopDots.forEach((dot, index) => updateStopPoint(dot, stopLabels[index], stopsList[index]));
    return;
  }

  stopDots.forEach((dot, index) => {
    const stop = stopsList[index];
    if (!stop) {
      updateStopPoint(dot, stopLabels[index], null);
      return;
    }
    dot.setAttribute("cx", String(stop.x));
    dot.setAttribute("cy", String(stop.y));
    const lab = stopLabels[index];
    lab.setAttribute("x", String(stop.x + 12));
    lab.setAttribute("y", String(stop.y - 12));
    lab.textContent = stop.name;
    dot.classList.add("hidden-map-point");
    lab.classList.add("hidden-map-point");
  });

  stopsList.forEach((stop, index) => {
    if (!stop) return;
    const tid = window.setTimeout(() => {
      const dot = stopDots[index];
      const lab = stopLabels[index];
      if (!dot || !lab) return;
      dot.classList.remove("hidden-map-point");
      lab.classList.remove("hidden-map-point");
    }, index * ROUTE_STOP_STAGGER_MS);
    routeStopRevealTimeouts.push(tid);
  });
}

function updateStopPoint(dot, label, stop) {
  if (!dot || !label) return;
  if (!stop) {
    dot.classList.add("hidden-map-point");
    label.classList.add("hidden-map-point");
    label.textContent = "";
    return;
  }
  dot.classList.remove("hidden-map-point");
  label.classList.remove("hidden-map-point");
  dot.setAttribute("cx", String(stop.x));
  dot.setAttribute("cy", String(stop.y));
  label.setAttribute("x", String(stop.x + 12));
  label.setAttribute("y", String(stop.y - 12));
  label.textContent = stop.name;
}

function pickRandomIntroRoutePair() {
  const list = language === "ru" ? INTRO_AMBIENT_CITIES_RU : INTRO_AMBIENT_CITIES_EN;
  if (!list || list.length < 2) {
    return {
      origin: language === "ru" ? "Москва" : "Moscow",
      destination: language === "ru" ? "Казань" : "Kazan",
    };
  }
  let i = Math.floor(Math.random() * list.length);
  let j = Math.floor(Math.random() * list.length);
  let guard = 0;
  while (
    (i === j || normalizeStationName(list[i]) === normalizeStationName(list[j])) &&
    guard < 100
  ) {
    j = Math.floor(Math.random() * list.length);
    guard += 1;
  }
  if (i === j) {
    j = (i + 1) % list.length;
  }
  return { origin: list[i], destination: list[j] };
}

function buildIntroRouteVisual(originRaw, destRaw) {
  const d = String(destRaw || "").trim();
  const template = findRouteVisual(d);
  const dyn = getDynamicRouteGeometry(originRaw, destRaw);
  if (!dyn) {
    return {
      ...template,
      origin: DEFAULT_ROUTE_ORIGIN,
      stops: [],
    };
  }
  return {
    ...template,
    line: dyn.line,
    origin: dyn.origin,
    destination: dyn.destination,
    stops: [],
  };
}

function updateIntroMapGeometry(visual, labelOverride) {
  const destPt = visual?.destination ?? routeVisuals.default.destination;
  if (!destPt) return;
  const originText =
    labelOverride?.origin ?? (language === "ru" ? "Москва" : "Moscow");
  const destText =
    labelOverride?.destination ?? (language === "ru" ? "Казань" : "Kazan");
  const oVis = visual.origin || DEFAULT_ROUTE_ORIGIN;
  const originDot = document.querySelector("#language-origin-dot");
  const destinationDot = document.querySelector("#language-destination-dot");
  const routePulseEl = document.querySelector("#language-route-pulse");
  const originLabel = document.querySelector("#language-origin-label");
  const destinationLabel = document.querySelector("#language-destination-label");
  if (originDot) {
    originDot.setAttribute("cx", String(oVis.x));
    originDot.setAttribute("cy", String(oVis.y));
  }
  [destinationDot, routePulseEl].forEach((dot) => {
    if (!dot) return;
    dot.setAttribute("cx", String(destPt.x));
    dot.setAttribute("cy", String(destPt.y));
  });
  if (originLabel) {
    originLabel.textContent = originText;
    originLabel.setAttribute("x", String(oVis.labelX ?? oVis.x - 43));
    originLabel.setAttribute("y", String(oVis.labelY ?? oVis.y + 36));
  }
  if (destinationLabel) {
    destinationLabel.textContent = destText;
    destinationLabel.setAttribute("x", String(destPt.labelX));
    destinationLabel.setAttribute("y", String(destPt.labelY));
  }
  for (let i = 0; i < ROUTE_MAP_MAX_INTERMEDIATE_STOPS; i += 1) {
    const letter = String.fromCharCode(97 + i);
    const dot = document.querySelector(`#language-stop-dot-${letter}`);
    const lab = document.querySelector(`#language-stop-label-${letter}`);
    updateStopPoint(dot, lab, null);
  }
}

function applyIntroRouteGeometry(visual, labelOverride) {
  if (!visual?.line) return;
  const introLine = document.querySelector("#language-route-line");
  const introPulse = document.querySelector("#language-route-pulse");
  if (!introLine) return;
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  introLine.classList.remove("route-line-active");
  introLine.setAttribute("d", visual.line);
  introLine.style.strokeDasharray = "";
  introLine.style.strokeDashoffset = "";
  if (reducedMotion) {
    introLine.style.strokeDashoffset = "0";
    introLine.style.strokeDasharray = "none";
  }
  void introLine.getBoundingClientRect();
  if (!reducedMotion) {
    introLine.classList.add("route-line-active");
  }
  if (introPulse) introPulse.classList.add("route-pulse-active");
  updateIntroMapGeometry(visual, labelOverride);
  const introFlow = document.querySelector("#language-route-line-flow");
  if (introFlow) {
    if (!reducedMotion) {
      syncRouteFlowOverlay(introFlow, visual.line);
    } else {
      cancelSvgFlowAnimations(introFlow);
      introFlow.setAttribute("d", visual.line);
      introFlow.classList.remove("route-line-flow-active", "route-line-flow--css-only");
      introFlow.style.strokeDasharray = "none";
      introFlow.style.opacity = "0.22";
    }
  }
}

async function tickLanguageScreenAmbient() {
  if (!screens.language || screens.language.classList.contains("hidden")) return;
  let origin = "";
  let destination = "";
  try {
    const pair = pickRandomIntroRoutePair();
    origin = pair.origin;
    destination = pair.destination;
    const visual = buildIntroRouteVisual(origin, destination);
    const copy = i18n[language];
    const heading = document.querySelector("#language-route-heading-label");
    const badge = document.querySelector("#language-route-ambient-badge");
    const meta = document.querySelector("#language-route-meta");
    const ft = document.querySelector("#language-fact-title");
    const factEl = document.querySelector("#language-route-fact");
    if (heading) heading.textContent = copy.route;
    if (ft) applyAiFactHeading(ft, copy.fact);
    if (badge) badge.textContent = copy.languageAmbientBadge;
    if (meta) meta.textContent = formatRoutePair(origin, destination);
    applyIntroRouteGeometry(visual, { origin, destination });
    if (factEl) factEl.textContent = copy.routeFactLoading;
  } catch (e) {
    try {
      console.error("[language-ambient]", e);
    } catch {
      /* ignore */
    }
    return;
  }
  languageAmbientAbort?.abort();
  languageAmbientAbort = new AbortController();
  const factEl = document.querySelector("#language-route-fact");
  const copy = i18n[language];
  try {
    const res = await postJson(
      "/api/fun-fact",
      { language, origin, destination },
      { signal: languageAmbientAbort.signal },
    );
    if (factEl && screens.language && !screens.language.classList.contains("hidden")) {
      factEl.textContent = res.fact;
    }
  } catch (e) {
    if (e?.name === "AbortError") return;
    if (factEl) factEl.textContent = copy.routeFactUnavailable;
  }
}

function startLanguageScreenAmbient() {
  stopLanguageScreenAmbient();
  void tickLanguageScreenAmbient();
  languageAmbientTimer = window.setInterval(() => void tickLanguageScreenAmbient(), 10000);
}

function stopLanguageScreenAmbient() {
  if (languageAmbientTimer != null) {
    window.clearInterval(languageAmbientTimer);
    languageAmbientTimer = null;
  }
  languageAmbientAbort?.abort();
  languageAmbientAbort = null;
  const introFlow = document.querySelector("#language-route-line-flow");
  if (introFlow) {
    cancelSvgFlowAnimations(introFlow);
    introFlow.classList.remove("route-line-flow-active", "route-line-flow--css-only");
  }
}

function localVoiceExplanationFromTrain(train) {
  if (!train) return "";
  if (language === "ru") {
    return (
      `Рекомендую поезд ${train.train_number}: отправление ${train.departure_time}, прибытие ${train.arrival_time}, в пути ${train.duration_label}.`
    );
  }
  return (
    `I recommend train ${train.train_number}: departs ${train.departure_time}, arrives ${train.arrival_time}, travel time ${train.duration_label}.`
  );
}

function trainTotalFreeSeats(train) {
  const d = train?.seat_details || {};
  return (
    (Number(d.lower) || 0) +
    (Number(d.upper) || 0) +
    (Number(d.side_lower) || 0) +
    (Number(d.side_upper) || 0)
  );
}

function trainCardExplanation(train, recommendation) {
  const text = (recommendation?.explanation || "").trim();
  if (text) return text;
  return localVoiceExplanationFromTrain(train);
}

function buildFallbackRecommendationsFromTrains(trainList) {
  return trainList.map((t) => ({
    train_id: t.id,
    score: 0,
    badges: [],
    explanation: localVoiceExplanationFromTrain(t),
  }));
}

function setUiInteractionLocked(locked) {
  uiInteractionLocked = locked;
  document.body.classList.toggle("ui-interaction-locked", locked);
}

function refreshTerminalStatusStrip() {
  if (!terminalStatusStrip) return;
  const showWarn = backendHealthBanner && !backendHealthBanner.classList.contains("hidden");
  const showDemo = dataSourceBanner && !dataSourceBanner.classList.contains("hidden");
  terminalStatusStrip.hidden = !showWarn && !showDemo;
}

function updateDataSourceBanner(source) {
  if (!dataSourceBanner) return;
  const copy = i18n[language];
  if (source === "demo") {
    dataSourceBanner.textContent = copy.bannerDemo;
    dataSourceBanner.classList.remove("hidden");
  } else {
    dataSourceBanner.classList.add("hidden");
    dataSourceBanner.textContent = "";
  }
  refreshTerminalStatusStrip();
}

function hideDataSourceBanner() {
  if (!dataSourceBanner) return;
  dataSourceBanner.classList.add("hidden");
  dataSourceBanner.textContent = "";
  refreshTerminalStatusStrip();
}

function showBackendOfflineBanner() {
  if (!backendHealthBanner) return;
  backendHealthBanner.textContent = i18n[language].bannerOffline;
  backendHealthBanner.classList.remove("hidden");
  refreshTerminalStatusStrip();
}

function hideBackendHealthBanner() {
  if (!backendHealthBanner) return;
  backendHealthBanner.classList.add("hidden");
  backendHealthBanner.textContent = "";
  refreshTerminalStatusStrip();
}

async function pingBackendHealth() {
  hideBackendHealthBanner();
  try {
    await getJson("/api/health", { timeoutMs: 6000, retries: 0 });
  } catch {
    showBackendOfflineBanner();
  }
}

function renderTrainListSkeleton(count = 3) {
  trainsPanel.classList.remove("hidden");
  const list = document.querySelector("#trains-list");
  if (!list) return;
  list.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i += 1) {
    const card = document.createElement("article");
    card.className = "train-card train-card-skeleton";
    card.setAttribute("aria-hidden", "true");
    card.innerHTML = `
      <div class="skeleton-line skeleton-line--wide"></div>
      <div class="skeleton-line skeleton-line--mid"></div>
      <div class="skeleton-line skeleton-line--narrow"></div>
      <div class="skeleton-line skeleton-line--narrow"></div>
    `;
    frag.append(card);
  }
  list.append(frag);
}

async function postRecommendWithRetries(payload, options = {}) {
  const timeoutMs = options.timeoutMs ?? 240000;
  const retries = options.retries ?? 2;
  const signal = options.signal;
  return fetchApi("/api/recommend", {
    method: "POST",
    body: payload,
    timeoutMs,
    retries,
    signal,
  });
}

/** Панель оформления — сразу под выбранной карточкой (не внизу всего скролла). */
function detachCheckoutPanelFromTrainList() {
  const list = document.querySelector("#trains-list");
  const panel = checkoutPanel;
  if (!list || !panel) return;
  if (panel.parentElement === list) {
    list.insertAdjacentElement("afterend", panel);
  }
}

function syncCheckoutPanelPlacement() {
  const list = document.querySelector("#trains-list");
  const panel = checkoutPanel;
  if (!list || !panel || !trainsPanel) return;
  if (panel.classList.contains("hidden") || !selectedTrain) {
    if (panel.parentElement === list) {
      list.insertAdjacentElement("afterend", panel);
    }
    return;
  }
  const card = list.querySelector(`.train-card[data-train-id="${selectedTrain.id}"]`);
  if (card) {
    card.insertAdjacentElement("afterend", panel);
  } else if (panel.parentElement === list) {
    list.insertAdjacentElement("afterend", panel);
  }
}

function routeDistanceLabel() {
  const train = trainForRouteMap();
  const distance = train?.route_distance_km;
  const duration = train?.duration_label;
  if (!distance || !duration) return "";
  return `${distance} ${language === "ru" ? "км" : "km"} · ${duration}`;
}

function renderTrains() {
  trainsPanel.classList.remove("hidden");
  detachCheckoutPanelFromTrainList();
  const list = document.querySelector("#trains-list");
  list.innerHTML = "";
  const highlightId = getTrainHighlightId();
  const frag = document.createDocumentFragment();
  const uiTrains = getTrainsForUi();
  const topPickId = recommendations[0]?.train_id || uiTrains[0]?.id || null;
  uiTrains.forEach((train) => {
    const recommendation = recommendationFor(train.id);
    const card = document.createElement("article");
    card.dataset.trainId = train.id;
    card.className = `train-card ${train.id === highlightId ? "train-card-best" : ""}`;
    const apiBadge = recommendation?.badges?.[0];
    const hasApiBadge = apiBadge != null && String(apiBadge).trim() !== "";
    const badgeLabel = hasApiBadge
      ? String(apiBadge)
      : train.id === topPickId
        ? language === "ru"
          ? "Лучший выбор"
          : "Best choice"
        : language === "ru"
          ? "Вариант"
          : "Option";
    card.innerHTML = `
      <div class="train-card-header">
        <span class="train-number">${train.train_number}</span>
        <span class="badge">${escapeHtml(badgeLabel)}</span>
      </div>
      <div class="timeline">
        <strong>${train.departure_time}</strong>
        <span></span>
        <strong>${train.arrival_time}</strong>
      </div>
      <p>${escapeHtml(formatRoutePair(train.departure_station, train.arrival_station))}</p>
      <p>${train.duration_label} · ${train.route_distance_km} ${language === "ru" ? "км" : "km"}</p>
      <p class="reason">${escapeHtml(trainCardExplanation(train, recommendation))}</p>
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
    if (compareMode === "pickingSecond") {
      card.classList.toggle("train-card--compare-first", train.id === compareFirstId);
      card.classList.toggle("train-card--compare-pick", train.id !== compareFirstId);
    }
    card.addEventListener("click", () => void handleTrainCardActivate(train));
    frag.append(card);
  });
  list.append(frag);
  if (uiTrains.length === 0) {
    selectedTrain = null;
    checkoutPanel.classList.add("hidden");
  }
  syncCheckoutPanelPlacement();
  updateRouteMapForSelectedTrain();
  updateCompareTrainChrome();
}

/** Сразу после поиска: рекомендованный поезд считается выбранным — «Оформить» под его карточкой без клика. Этап UI остаётся results. */
async function prepareRecommendedCheckoutUi() {
  const top = getTrainsForUi()[0];
  if (!top) {
    selectedTrain = null;
    checkoutPanel.classList.add("hidden");
    syncCheckoutPanelPlacement();
    return;
  }
  selectedTrain = top;
  lastSelectedTrainId = top.id;
  checkoutPanel.classList.remove("hidden");
  if (!checkoutAnimating && !issuingTicket) {
    checkoutButton.textContent = i18n[language].checkout;
    checkoutButton.disabled = false;
  }
  syncCheckoutPanelPlacement();
  updateTrainCardHighlight();
  await fetchTrainRouteStopsIfNeeded(top);
  updateRouteMapForSelectedTrain();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrollRecommendedTrainCardIntoView();
    });
  });
  updateCompareTrainChrome();
}

/** Прокрутка только контейнера `.control-panel-scroll`, чтобы карточка оказалась у верхней границы области под закреплённым assistant-core (scrollIntoView часто трогает неверного предка). */
function scrollRecommendedTrainCardIntoView() {
  const card = document.querySelector("#trains-list .train-card-best");
  const scrollRoot = document.querySelector(".control-panel-scroll");
  if (!card || !scrollRoot) return;
  const behavior = prefersReducedMotion() ? "auto" : "smooth";
  const align = () => {
    const c = document.querySelector("#trains-list .train-card-best");
    const root = document.querySelector(".control-panel-scroll");
    if (!c || !root) return;
    const cardRect = c.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const deltaTop = cardRect.top - rootRect.top;
    const nextTop = Math.max(0, root.scrollTop + deltaTop - 4);
    root.scrollTo({ top: nextTop, behavior });
  };
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      align();
    });
  });
}

function recommendationFor(trainId) {
  return recommendations.find((item) => item.train_id === trainId);
}

function mergeTrainRouteData(trainId, stops, route_segment) {
  const idx = trains.findIndex((t) => t.id === trainId);
  if (idx < 0) return;
  const prev = trains[idx];
  trains[idx] = { ...prev, stops, route_segment };
  if (selectedTrain && selectedTrain.id === trainId) {
    selectedTrain = trains[idx];
  }
}

/** Дата date0 для basicRoute (dd.mm.yyyy): с бэкенда или из id rzd-<номер>-YYYYMMDDHHMM-<idx>. */
function departureDateRzdFromTrain(train) {
  if (train?.departure_date_rzd) return train.departure_date_rzd;
  const id = train?.id || "";
  const parts = id.split("-");
  if (parts.length < 4) return null;
  const mid = parts[parts.length - 2];
  if (!mid || mid.length < 8) return null;
  const ymd = mid.slice(0, 8);
  if (!/^\d{8}$/.test(ymd)) return null;
  return `${ymd.slice(6, 8)}.${ymd.slice(4, 6)}.${ymd.slice(0, 4)}`;
}

/** Слой 5764 (вагоны, услуги: кондиционер, биотуалет и т.д.) — при live-cache догружается по запросу. */
async function fetchTrainCarriageDetailsIfNeeded(train, options = {}) {
  const { signal } = options;
  if (!train || ticketSearchSource !== "live-cache") return train;
  if (Array.isArray(train.carriage_details) && train.carriage_details.length > 0) return train;
  try {
    const res = await postJson(
      "/api/train-carriage-details",
      {
        language,
        origin: intent.origin,
        destination: intent.destination,
        train,
      },
      { signal },
    );
    const u = res.train;
    const idx = trains.findIndex((t) => t.id === u.id);
    if (idx >= 0) trains[idx] = u;
    if (selectedTrain && selectedTrain.id === u.id) {
      selectedTrain = u;
    }
    return u;
  } catch (err) {
    console.error("train-carriage-details failed", err);
    return train;
  }
}

async function fetchTrainRouteStops(train, signal) {
  if (!train || ticketSearchSource !== "live-cache") return train;
  if (routeStopsLoadedIds.has(train.id)) return train;
  const seg = train.route_segment?.intermediate_stops;
  const nStops = Array.isArray(train.stops) ? train.stops.length : 0;
  /** Поиск может отдать эвристический сегмент без полного basicRoute — пока мало станций в stops, догружаем. */
  const hasRichStopList = nStops >= 5;
  if (Array.isArray(seg) && seg.length > 0 && hasRichStopList) {
    routeStopsLoadedIds.add(train.id);
    return train;
  }
  try {
    const res = await postJson(
      "/api/train-route-stops",
      {
        language,
        origin: intent.origin,
        destination: intent.destination,
        train_id: train.id,
        train_number: train.train_number,
        departure_date_rzd: departureDateRzdFromTrain(train),
        departure_station: train.departure_station,
        arrival_station: train.arrival_station,
        route_terminal_from: train.origin,
        route_terminal_to: train.destination,
        fallback_stops: train.stops || [],
      },
      { signal },
    );
    mergeTrainRouteData(res.train_id, res.stops, res.route_segment);
    routeStopsLoadedIds.add(train.id);
    return trains.find((t) => t.id === train.id) || train;
  } catch (err) {
    if (err && err.name === "AbortError") return train;
    console.error("train-route-stops failed", err);
    if (String(err?.message || err).includes("404")) {
      console.warn(
        "[route map] POST /api/train-route-stops вернул 404 — на сервере старый backend. Промежуточные точки должны приходить из ответа поиска (RZD_ROUTE_STOPS_ON_SEARCH) после деплоя.",
      );
    }
    return train;
  }
}

async function fetchTrainRouteStopsIfNeeded(train, signal) {
  if (!train || ticketSearchSource !== "live-cache") return;
  if (routeStopsLoadedIds.has(train.id)) return;
  await fetchTrainRouteStops(train, signal);
}

/** Перед сравнением: basicRoute + список вагонов 5764 (как перед выбором мест), параллельно. */
async function prefetchTrainDataForCompare(train, signal) {
  if (!train) return;
  await Promise.all([
    (async () => {
      await fetchTrainRouteStopsIfNeeded(train, signal);
    })(),
    (async () => {
      await fetchTrainCarriageDetailsIfNeeded(train, { signal });
    })(),
  ]);
}

/**
 * После рекомендаций обновить маршрут для топ-поезда так же, как при выборе карточки
 * (без озвучки и без перехода в checkout): тот же поезд, что подсвечен как лучший.
 */
async function refreshTopRecommendedTrainRouteLikeSelect(signal) {
  const hid = getTrainHighlightId();
  const top = hid ? trains.find((t) => t.id === hid) : getTrainsForUi()[0];
  if (!top) return;
  await fetchTrainRouteStopsIfNeeded(top, signal);
  if (signal?.aborted) return;
  updateRouteMapForSelectedTrain();
}

function getSortedTrains() {
  const recommendationsById = new Map(recommendations.map((item) => [item.train_id, item]));
  return trains.slice().sort((a, b) => {
    const scoreA = recommendationsById.get(a.id)?.score || 0;
    const scoreB = recommendationsById.get(b.id)?.score || 0;
    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }
    const seatsA = trainTotalFreeSeats(a);
    const seatsB = trainTotalFreeSeats(b);
    const zeroA = seatsA <= 0 ? 1 : 0;
    const zeroB = seatsB <= 0 ? 1 : 0;
    if (zeroA !== zeroB) {
      return zeroA - zeroB;
    }
    return seatsB - seatsA;
  });
}

/** Карточки и подсветка: скрываем поезда без свободных мест, если есть хотя бы один с местами. */
function getTrainsForUi() {
  const sorted = getSortedTrains();
  const withSeats = sorted.filter((t) => trainTotalFreeSeats(t) > 0);
  return withSeats.length ? withSeats : sorted;
}

function getTrainHighlightId() {
  const sorted = getTrainsForUi();
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

async function selectTrain(train, options = {}) {
  selectTrainSeq += 1;
  const flight = selectTrainSeq;
  const suppressSelectionSpeech = Boolean(options.suppressSelectionSpeech);
  stopAssistantSpeech();
  selectedTrain = train;
  checkoutPanel.classList.remove("hidden");
  syncCheckoutPanelPlacement();
  if (!checkoutAnimating && !issuingTicket) {
    checkoutButton.textContent = i18n[language].checkout;
    checkoutButton.disabled = false;
  }
  const sameAsBefore = lastSelectedTrainId === train.id;
  lastSelectedTrainId = train.id;
  if (!sameAsBefore && !suppressSelectionSpeech) {
    const phrase =
      language === "ru"
        ? `Выбран поезд ${train.train_number}. Доступны нижние места: ${train.seat_details?.lower ?? 0}.`
        : `Train ${train.train_number} selected. Lower berths available: ${train.seat_details?.lower ?? 0}.`;
    assistantSay(phrase);
  }
  setStage("checkout");
  await fetchTrainRouteStopsIfNeeded(train);
  if (flight !== selectTrainSeq) return;
  updateTrainCardHighlight();
  updateRouteMapForSelectedTrain();
  const scrollBehavior = prefersReducedMotion() ? "auto" : "smooth";
  checkoutPanel.scrollIntoView({ behavior: scrollBehavior, block: "nearest" });
  updateCompareTrainChrome();
}

function applyCheckoutLoadingTexts() {
  const titleEl = document.querySelector("#checkout-loading-title");
  const hintEl = document.querySelector("#checkout-loading-hint");
  const copy = i18n[language];
  if (titleEl) titleEl.textContent = copy.checkoutPreparingTitle;
  if (hintEl) {
    hintEl.textContent =
      ticketSearchSource === "live-cache" ? copy.checkoutPreparingHintLive : copy.checkoutPreparingHintDemo;
  }
}

function applyCompareChrome() {
  const copy = i18n[language];
  if (compareTrainsHeadingEl) {
    const rest = language === "ru" ? "Сравнение поездов" : "Train comparison";
    compareTrainsHeadingEl.innerHTML = "";
    const ai = document.createElement("span");
    ai.className = "ai-brand";
    ai.textContent = "AI";
    compareTrainsHeadingEl.appendChild(ai);
    compareTrainsHeadingEl.appendChild(document.createTextNode(" "));
    const labelSpan = document.createElement("span");
    labelSpan.className = "compare-trains-heading-rest";
    labelSpan.textContent = rest;
    compareTrainsHeadingEl.appendChild(labelSpan);
  }
  if (compareTrainsLoadingTitle) compareTrainsLoadingTitle.textContent = copy.compareLoading;
  if (compareTrainsLoadingHint) compareTrainsLoadingHint.textContent = copy.compareLoadingHint;
  if (compareTrainsCloseBtn) compareTrainsCloseBtn.textContent = copy.compareClose;
  if (compareTrainsStartBtn) compareTrainsStartBtn.textContent = copy.compareTrains;
  if (compareTrainsCancelBar)
    compareTrainsCancelBar.textContent = language === "ru" ? "Отменить сравнение" : "Cancel comparison";
}

function updateCompareTrainChrome() {
  const baseEligible =
    Boolean(selectedTrain) &&
    !checkoutAnimating &&
    !issuingTicket &&
    !compareModalOpen &&
    (uiStage === "results" || uiStage === "checkout");
  const showStart = baseEligible && compareMode !== "pickingSecond";
  const showCancelBar = compareMode === "pickingSecond";
  if (compareTrainsStartBtn) {
    compareTrainsStartBtn.classList.toggle("hidden", !showStart);
    compareTrainsStartBtn.disabled = !showStart;
  }
  if (compareTrainsCancelBar) {
    compareTrainsCancelBar.classList.toggle("hidden", !showCancelBar);
  }
  if (checkoutButton) {
    checkoutButton.classList.toggle("hidden", compareMode === "pickingSecond");
  }
}

function truncateForSpeech(text, max = 1700) {
  const t = String(text || "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function getCompareTrainsLayoutEl() {
  return document.querySelector(".compare-trains-layout");
}

function syncCompareModalHeights() {
  const layout = getCompareTrainsLayoutEl();
  const left = document.querySelector(".compare-trains-cards-col");
  if (!layout || !left) return;
  if (compareTrainsModal?.classList.contains("hidden")) {
    layout.style.removeProperty("--compare-left-h");
    return;
  }
  try {
    if (window.matchMedia("(max-width: 900px)").matches) {
      layout.style.removeProperty("--compare-left-h");
      return;
    }
  } catch {
    /* ignore */
  }
  const h = left.getBoundingClientRect().height;
  const overlay = compareTrainsLoadingOverlayEl;
  if (overlay && !overlay.classList.contains("hidden")) {
    layout.style.removeProperty("--compare-left-h");
    return;
  }
  if (h > 0) {
    layout.style.setProperty("--compare-left-h", `${Math.round(h)}px`);
  }
}

function scheduleSyncCompareModalHeights() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      syncCompareModalHeights();
    });
  });
}

function renderCompareMiniCard(train, labelKind) {
  const ru = language === "ru";
  const lbl =
    labelKind === "a" ? (ru ? "Поезд A" : "Train A") : ru ? "Поезд B" : "Train B";
  return `
    <div class="compare-mini-card">
      <span class="compare-mini-label">${escapeHtml(lbl)}</span>
      <strong>${escapeHtml(train.train_number)}</strong>
      <div class="compare-mini-meta">
        ${escapeHtml(formatRoutePair(train.departure_station, train.arrival_station))}<br />
        ${escapeHtml(train.departure_time)} – ${escapeHtml(train.arrival_time)} · ${escapeHtml(train.duration_label)}<br />
        ${ru ? "Плацкарт" : "Platz"}: ${formatPrice(train.prices.platzkart)} · ${ru ? "Купе" : "Coupe"}: ${formatPrice(
          train.prices.coupe,
        )}
      </div>
    </div>
  `;
}

function openCompareModalLoading() {
  compareModalOpen = true;
  document.body.style.overflow = "hidden";
  compareTrainsModal?.classList.remove("hidden");
  compareTrainsModal?.setAttribute("aria-hidden", "false");
  const layout = getCompareTrainsLayoutEl();
  layout?.style.removeProperty("--compare-left-h");
  layout?.classList.add("compare-trains-layout--loading");
  compareTrainsSheetEl?.classList.add("compare-trains-sheet--loading");
  compareTrainsLoadingOverlayEl?.classList.remove("hidden");
  compareTrainsLoadingOverlayEl?.setAttribute("aria-hidden", "false");
  if (compareTrainsTextEl) compareTrainsTextEl.textContent = "";
  compareCheckoutABtn?.classList.add("hidden");
  compareCheckoutBBtn?.classList.add("hidden");
  updateCompareTrainChrome();
}

function closeCompareModal() {
  if (!compareTrainsModal) return;
  compareTrainsModal.classList.add("hidden");
  compareTrainsModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  compareModalOpen = false;
  compareTrainsLoadingOverlayEl?.classList.add("hidden");
  compareTrainsLoadingOverlayEl?.setAttribute("aria-hidden", "true");
  getCompareTrainsLayoutEl()?.classList.remove("compare-trains-layout--loading");
  compareTrainsSheetEl?.classList.remove("compare-trains-sheet--loading");
  getCompareTrainsLayoutEl()?.style.removeProperty("--compare-left-h");
  updateCompareTrainChrome();
}

function fillCompareModal(trainA, trainB, text) {
  if (compareSlotA) compareSlotA.innerHTML = renderCompareMiniCard(trainA, "a");
  if (compareSlotB) compareSlotB.innerHTML = renderCompareMiniCard(trainB, "b");
  renderCompareTrainsRichText(compareTrainsTextEl, text || "");
  compareTrainsLoadingOverlayEl?.classList.add("hidden");
  compareTrainsLoadingOverlayEl?.setAttribute("aria-hidden", "true");
  getCompareTrainsLayoutEl()?.classList.remove("compare-trains-layout--loading");
  compareTrainsSheetEl?.classList.remove("compare-trains-sheet--loading");
  const copy = i18n[language];
  if (compareCheckoutABtn) {
    compareCheckoutABtn.textContent = copy.compareCheckoutTrain.replace("{num}", trainA.train_number);
    compareCheckoutABtn.dataset.trainId = trainA.id;
    compareCheckoutABtn.classList.remove("hidden");
  }
  if (compareCheckoutBBtn) {
    compareCheckoutBBtn.textContent = copy.compareCheckoutTrain.replace("{num}", trainB.train_number);
    compareCheckoutBBtn.dataset.trainId = trainB.id;
    compareCheckoutBBtn.classList.remove("hidden");
  }
  scheduleSyncCompareModalHeights();
}

function cancelTrainCompareFlow(options = {}) {
  const { silent = false, skipRender = false } = options;
  comparePrefetchAbort?.abort();
  comparePrefetchAbort = null;
  compareMode = null;
  compareFirstId = null;
  closeCompareModal();
  if (!silent) {
    assistantSay(i18n[language].compareCancelled);
  }
  if (!skipRender) {
    renderTrains();
  }
  updateCompareTrainChrome();
}

function startTrainCompare() {
  if (!selectedTrain || compareMode === "pickingSecond" || checkoutAnimating || issuingTicket) return;
  stopAssistantSpeech();
  compareMode = "pickingSecond";
  compareFirstId = selectedTrain.id;
  comparePrefetchAbort?.abort();
  comparePrefetchAbort = new AbortController();
  void prefetchTrainDataForCompare(selectedTrain, comparePrefetchAbort.signal);
  assistantSay(i18n[language].comparePickSecond);
  updateCompareTrainChrome();
  renderTrains();
}

async function finalizeTrainCompare(secondTrain) {
  if (!compareFirstId || secondTrain.id === compareFirstId) {
    assistantSay(i18n[language].compareSameTrain);
    return;
  }
  comparePrefetchAbort?.abort();
  comparePrefetchAbort = new AbortController();
  const sig = comparePrefetchAbort.signal;
  compareMode = null;
  openCompareModalLoading();
  applyCompareChrome();
  try {
    let trainA = trains.find((t) => t.id === compareFirstId);
    let trainB = trains.find((t) => t.id === secondTrain.id);
    if (!trainA || !trainB) {
      assistantSay(i18n[language].compareError);
      cancelTrainCompareFlow({ silent: true });
      return;
    }
    await Promise.all([prefetchTrainDataForCompare(trainA, sig), prefetchTrainDataForCompare(trainB, sig)]);
    if (sig.aborted) {
      closeCompareModal();
      return;
    }
    trainA = trains.find((t) => t.id === compareFirstId) || trainA;
    trainB = trains.find((t) => t.id === secondTrain.id) || trainB;
    const res = await postJson(
      "/api/compare-trains",
      {
        language,
        train_a: trainA,
        train_b: trainB,
      },
      { signal: sig },
    );
    if (sig.aborted) {
      closeCompareModal();
      return;
    }
    fillCompareModal(trainA, trainB, res.comparison_text);
    assistantSay(truncateForSpeech(res.comparison_text));
  } catch (e) {
    if (e && e.name === "AbortError") return;
    console.error("compare-trains failed", e);
    assistantSay(i18n[language].compareError);
    cancelTrainCompareFlow({ silent: true });
  }
}

async function completeCompareCheckout(trainId) {
  const tr = trains.find((t) => t.id === trainId);
  if (!tr) return;
  cancelTrainCompareFlow({ silent: true });
  await selectTrain(tr, { suppressSelectionSpeech: true });
  await createTicket();
}

async function handleTrainCardActivate(train) {
  if (compareMode === "pickingSecond") {
    await finalizeTrainCompare(train);
    return;
  }
  await selectTrain(train);
}

async function createTicket() {
  if (checkoutAnimating || issuingTicket || uiInteractionLocked || !selectedTrain) return;
  cancelTrainCompareFlow({ silent: true });
  setUiInteractionLocked(true);
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
      await sleep(260);
      item.classList.add("checkout-step-done");
    }
    steps.innerHTML = "";
    applyCheckoutLoadingTexts();
    checkoutLoadingEl?.classList.remove("hidden");
    checkoutButton.classList.add("hidden");
    checkoutPanel.setAttribute("aria-busy", "true");
    setOrbMode("thinking");

    let t = selectedTrain;
    if (ticketSearchSource === "live-cache") {
      t = await fetchTrainCarriageDetailsIfNeeded(selectedTrain);
      selectedTrain = t;
    }
    buildSeatPickerModel(selectedTrain);

    checkoutLoadingEl?.classList.add("hidden");
    checkoutButton.classList.remove("hidden");
    checkoutPanel.removeAttribute("aria-busy");
    checkoutPanel.classList.add("hidden");
    syncCheckoutPanelPlacement();

    await showSeatPicker();
  } catch (err) {
    try {
      console.error("[createTicket]", err);
    } catch {
      /* ignore */
    }
    const copy = i18n[language];
    checkoutLoadingEl?.classList.add("hidden");
    checkoutButton.classList.remove("hidden");
    checkoutPanel.removeAttribute("aria-busy");
    checkoutPanel.classList.remove("hidden");
    syncCheckoutPanelPlacement();
    assistantSay(copy.checkoutPrepareError);
  } finally {
    checkoutAnimating = false;
    checkoutButton.disabled = false;
    checkoutButton.textContent = i18n[language].checkout;
    setUiInteractionLocked(false);
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

/**
 * Эталонная вместимость для схемы + метаданные поезда с РЖД: доверяем числу мест только если оно
 * выше порога «не фрагмент» (см. docs/RZD_LAYOUT_POLICY.md); иначе типичные значения класса.
 */
function carriageCapacityForClass(train, cls) {
  const t = train || {};
  if (cls === "sv") {
    const n = Number(t.sv_carriage_seats);
    if (Number.isFinite(n) && n >= RZD_TRUST_TRAIN_CAP_SV_MIN) return Math.min(Math.max(Math.round(n), 2), 24);
    return 18;
  }
  if (cls === "coupe") {
    if (t.coupe_double_deck) {
      const n = Number(t.coupe_double_deck_seats);
      if (Number.isFinite(n) && n >= RZD_TRUST_TRAIN_CAP_DOUBLE_COUPE_MIN)
        return Math.min(Math.max(Math.round(n), 4), 72);
      return 64;
    }
    const n = Number(t.coupe_carriage_seats);
    if (Number.isFinite(n) && n >= RZD_TRUST_TRAIN_CAP_COUPE_MIN) return Math.min(Math.max(Math.round(n), 4), 40);
    return 36;
  }
  const n = Number(t.platzkart_carriage_seats);
  if (Number.isFinite(n) && n >= RZD_TRUST_TRAIN_CAP_PLATZ_MIN) return Math.min(Math.max(Math.round(n), 4), 72);
  return 54;
}

/** Генерирует места для одного «этажа» вагона (непрерывная нумерация с seatNum). Возвращает { seats, nextNum }. */
function buildBerthSeatSpan(car, capacity, startSeatNum, deckIndex, compartmentIndexOffset) {
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
        occupied: false,
      });
      seats.push({
        id: `${car}-${String(upperNum).padStart(2, "0")}-upper`,
        displayNum: String(upperNum).padStart(2, "0"),
        berth_kind: "upper",
        compartmentIndex: compIdx,
        pairIndex: pairSlot,
        deckIndex,
        occupied: false,
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
      occupied: false,
    });
    seats.push({
      id: `${car}-${String(upperNum).padStart(2, "0")}-upper`,
      displayNum: String(upperNum).padStart(2, "0"),
      berth_kind: "upper",
      compartmentIndex: comp,
      pairIndex: 0,
      deckIndex,
      occupied: false,
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
      occupied: false,
    });
    seats.push({
      id: `${car}-${String(upper1).padStart(2, "0")}-upper`,
      displayNum: String(upper1).padStart(2, "0"),
      berth_kind: "upper",
      compartmentIndex: comp,
      pairIndex: 0,
      deckIndex,
      occupied: false,
    });
    seats.push({
      id: `${car}-${String(lower2).padStart(2, "0")}-lower`,
      displayNum: String(lower2).padStart(2, "0"),
      berth_kind: "lower",
      compartmentIndex: comp,
      pairIndex: 1,
      deckIndex,
      occupied: false,
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

/** Подсчёт мест на схеме по типам полок (для стыковки с суммами РЖД). */
function countBerthsByKind(seats) {
  const o = { lower: 0, upper: 0, side_lower: 0, side_upper: 0 };
  seats.forEach((s) => {
    const k = s.berth_kind;
    if (o[k] !== undefined) o[k] += 1;
  });
  return o;
}

/**
 * Сшивка счётчиков РЖД с полной схемой мест: при неполных суммах полок расширяем totals до раскладки,
 * свободные места только в пределах явного фрагмента РЖД — остальные на схеме считаем занятыми.
 * Политика: docs/RZD_LAYOUT_POLICY.md
 */
function mergedCarriageDetailForLayout(train, car, seats) {
  const d = carriageDetailForTab(train, car);
  if (!d) return null;
  const layout = countBerthsByKind(seats);
  const layoutSum =
    layout.lower + layout.upper + layout.side_lower + layout.side_upper;
  const tt = d.berth_totals;
  const ttSum = tt
    ? (tt.lower || 0) + (tt.upper || 0) + (tt.side_lower || 0) + (tt.side_upper || 0)
    : 0;

  const expandTotals = !tt || ttSum < layoutSum;
  let totalsOut = tt;
  if (expandTotals) {
    totalsOut = {
      lower: layout.lower,
      upper: layout.upper,
      side_lower: layout.side_lower,
      side_upper: layout.side_upper,
    };
  }

  let availOut = d.berth_available;
  if (expandTotals) {
    if (d.berth_available) {
      availOut = berthAvailableMergedForPartialLayout(layout, tt, d.berth_available);
    } else if (tt && ttSum > 0 && ttSum < layoutSum) {
      availOut = { lower: 0, upper: 0, side_lower: 0, side_upper: 0 };
    }
  }

  return { ...d, berth_totals: totalsOut, berth_available: availOut };
}

/** При неполном фрагменте РЖД: свободных мест не больше, чем передано в av; по недостающим категориям — 0 (всё продано). */
function berthAvailableMergedForPartialLayout(layout, ttRzd, avRzd) {
  const num = (x) => {
    const n = Number(x);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  };
  const kinds = ["lower", "upper", "side_lower", "side_upper"];
  const out = { lower: 0, upper: 0, side_lower: 0, side_upper: 0 };
  for (const k of kinds) {
    const cap = layout[k] ?? 0;
    const tFrag = num(ttRzd?.[k]);
    const freeFrag = num(avRzd?.[k]);
    if (cap <= 0) continue;
    if (tFrag <= 0) {
      out[k] = 0;
      continue;
    }
    out[k] = Math.min(freeFrag, tFrag, cap);
  }
  return out;
}

/** Детерминированная занятость: приоритет счётчикам РЖД; иначе демо-RNG только без слоя 5764. */
function finalizeSeatOccupancy(seats, detail, rng, train) {
  if (
    detail &&
    detail.berth_available &&
    detail.berth_totals &&
    applyOccupancyFromRzd(detail, seats)
  ) {
    return;
  }
  const hasCarriageLayer = Array.isArray(train?.carriage_details) && train.carriage_details.length > 0;
  if (hasCarriageLayer) {
    seats.forEach((s) => {
      s.occupied = true;
    });
    return;
  }
  seats.forEach((s) => {
    s.occupied = rng() > 0.42;
  });
}

/**
 * Распределяет занятые места по категориям полок так, чтобы число свободных совпало с РЖД.
 * @returns true если применили данные РЖД
 */
function applyOccupancyFromRzd(detail, seats) {
  const av = detail.berth_available;
  const tt = detail.berth_totals;
  if (!av || !tt) return false;
  const num = (x) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : 0;
  };
  const kinds = ["lower", "upper", "side_lower", "side_upper"];
  let any = false;
  const occ = {};
  for (const k of kinds) {
    const t = num(tt[k]);
    let f = num(av[k]);
    if (t <= 0) {
      occ[k] = 0;
      continue;
    }
    any = true;
    f = Math.min(f, t);
    occ[k] = Math.max(0, t - f);
  }
  if (!any) return false;
  const byKind = { lower: [], upper: [], side_lower: [], side_upper: [] };
  seats.forEach((s) => {
    const arr = byKind[s.berth_kind];
    if (arr) arr.push(s);
  });
  for (const k of kinds) {
    const list = byKind[k].sort((a, b) => parseSeatOrdinal(a.displayNum) - parseSeatOrdinal(b.displayNum));
    let n = occ[k] ?? 0;
    n = Math.min(n, list.length);
    for (let i = 0; i < list.length; i += 1) {
      list[i].occupied = i < n;
    }
  }
  return true;
}

/** Классическая схема плацкарта 54 места: 9×4 в открытой части (1–36), боковые у окна (37–54). */
function buildPlatzkart54Seats(car) {
  const seats = [];
  for (let comp = 0; comp < 9; comp += 1) {
    const base = comp * 8 + 1;
    for (let pairSlot = 0; pairSlot < 2; pairSlot += 1) {
      const lowerNum = base + pairSlot * 2;
      const upperNum = lowerNum + 1;
      seats.push({
        id: `${car}-${String(lowerNum).padStart(2, "0")}-lower`,
        displayNum: String(lowerNum).padStart(2, "0"),
        berth_kind: "lower",
        compartmentIndex: comp,
        pairIndex: pairSlot,
        deckIndex: 0,
        zone: "open",
        occupied: false,
      });
      seats.push({
        id: `${car}-${String(upperNum).padStart(2, "0")}-upper`,
        displayNum: String(upperNum).padStart(2, "0"),
        berth_kind: "upper",
        compartmentIndex: comp,
        pairIndex: pairSlot,
        deckIndex: 0,
        zone: "open",
        occupied: false,
      });
    }
  }
  for (let i = 0; i < 9; i += 1) {
    const compIdx = 9 + i;
    const upperNum = 38 + i * 2;
    const lowerNum = 37 + i * 2;
    seats.push({
      id: `${car}-${String(upperNum).padStart(2, "0")}-side_upper`,
      displayNum: String(upperNum).padStart(2, "0"),
      berth_kind: "side_upper",
      compartmentIndex: compIdx,
      pairIndex: 0,
      deckIndex: 0,
      zone: "side",
      occupied: false,
    });
    seats.push({
      id: `${car}-${String(lowerNum).padStart(2, "0")}-side_lower`,
      displayNum: String(lowerNum).padStart(2, "0"),
      berth_kind: "side_lower",
      compartmentIndex: compIdx,
      pairIndex: 0,
      deckIndex: 0,
      zone: "side",
      occupied: false,
    });
  }
  return seats;
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
    const fallbackCap = carriageCapacityForClass(train, cls);
    const capacity = carriageCapacityFromRzd(train, car, cls, fallbackCap);
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
          occupied: false,
        });
        seatNum += 1;
        seats.push({
          id: `${car}-${String(seatNum).padStart(2, "0")}-upper`,
          displayNum: String(seatNum).padStart(2, "0"),
          berth_kind: "upper",
          compartmentIndex: comp,
          pairIndex: 0,
          deckIndex: 0,
          occupied: false,
        });
        seatNum += 1;
      }
      seats = attachSeatPrices(train, car, cls, seats);
      finalizeSeatOccupancy(seats, mergedCarriageDetailForLayout(train, car, seats), rng, train);
      layouts.set(car, seats);
      return;
    }

    if (carriageIsDoubleDeckCoupeLayout(train, car)) {
      const perDeck = Math.floor(capacity / 2);
      const d1 = buildBerthSeatSpan(car, perDeck, 1, 0, 0);
      const off = compartmentCountForCapacity(perDeck);
      const d2 = buildBerthSeatSpan(car, perDeck, d1.nextNum, 1, off);
      seats = attachSeatPrices(train, car, cls, [...d1.seats, ...d2.seats]);
      finalizeSeatOccupancy(seats, mergedCarriageDetailForLayout(train, car, seats), rng, train);
      layouts.set(car, seats);
      return;
    }

    if (cls === "platzkart") {
      seats = attachSeatPrices(train, car, cls, buildPlatzkart54Seats(car));
      finalizeSeatOccupancy(seats, mergedCarriageDetailForLayout(train, car, seats), rng, train);
      layouts.set(car, seats);
      return;
    }

    const span = buildBerthSeatSpan(car, capacity, 1, 0, 0);
    seats = attachSeatPrices(train, car, cls, span.seats);
    finalizeSeatOccupancy(seats, mergedCarriageDetailForLayout(train, car, seats), rng, train);
    layouts.set(car, seats);
  });
  demoSeatLayouts = layouts;
}

function createSeatButton(car, seat) {
  const btn = document.createElement("button");
  btn.type = "button";
  let vertClass = "seat-cell-lower";
  if (seat.berth_kind === "upper") vertClass = "seat-cell-upper";
  else if (seat.berth_kind === "side_upper") vertClass = "seat-cell-side-upper";
  else if (seat.berth_kind === "side_lower") vertClass = "seat-cell-side-lower";
  btn.className = `seat-cell ${vertClass}`;
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
    <p class="checkout-train-route">${escapeHtml(formatRoutePair(train.departure_station, train.arrival_station))}</p>
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

function setCheckoutSeatConfirmBarVisible(visible) {
  checkoutSeatConfirmWrap?.classList.toggle("hidden", !visible);
}

async function enterCheckoutWorkspaceMode() {
  if (!checkoutWorkspace || !mainWorkspace || !checkoutMapHost || !mapContent || !routePanel) return;
  if (prefersReducedMotion()) {
    mainWorkspace.classList.add("hidden");
    checkoutWorkspace.classList.remove("hidden");
    if (mapContent.parentElement !== checkoutMapHost) checkoutMapHost.append(mapContent);
    return;
  }
  mainWorkspace.classList.add("workspace-motion-leave");
  await waitTransitionEnd(mainWorkspace, WORKSPACE_MOTION_MS + 130);
  mainWorkspace.classList.add("hidden");
  mainWorkspace.classList.remove("workspace-motion-leave");
  if (mapContent.parentElement !== checkoutMapHost) checkoutMapHost.append(mapContent);
  checkoutWorkspace.classList.remove("hidden");
  checkoutWorkspace.classList.add("workspace-motion-enter");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => checkoutWorkspace.classList.remove("workspace-motion-enter"));
  });
}

function exitCheckoutWorkspaceMode() {
  if (!checkoutWorkspace || !mainWorkspace || !mapContent || !routePanel) return;
  seatPickerPanel.classList.add("hidden");
  ticketPanel.classList.add("hidden");
  hideCheckoutTrainSummary();
  setCheckoutSeatConfirmBarVisible(false);
  checkoutWorkspace.classList.add("hidden");
  mainWorkspace.classList.remove("hidden");
  if (mapContent.parentElement !== routePanel) {
    routePanel.prepend(mapContent);
  }
}

async function showSeatPicker() {
  ticketPanel.classList.add("hidden");
  await enterCheckoutWorkspaceMode();
  if (selectedTrain) renderCheckoutTrainSummary(selectedTrain);
  seatPickerPanel.classList.remove("hidden");
  if (!prefersReducedMotion()) {
    seatPickerPanel.classList.add("seat-picker-motion-enter");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => seatPickerPanel.classList.remove("seat-picker-motion-enter"));
    });
  }
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
  setCheckoutSeatConfirmBarVisible(true);
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

function appendStandardCoupeCube(grid, car, compSeats, train, compartmentCount) {
  const byPair = new Map();
  compSeats.forEach((seat) => {
    const pi = seat.pairIndex ?? 0;
    if (!byPair.has(pi)) byPair.set(pi, {});
    const slot = byPair.get(pi);
    if (seat.berth_kind === "upper") slot.upper = seat;
    else slot.lower = seat;
  });
  const pairIndices = [...byPair.keys()].sort((a, b) => a - b);
  const ci = compSeats[0]?.compartmentIndex ?? 0;
  const tone = compartmentToneClassForCube(train, car, ci, compartmentCount);
  const cube = document.createElement("div");
  cube.className = ["compartment-cube", tone].filter(Boolean).join(" ");
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
  const kindHintText = seatPickerCompartmentKindHint(selectedTrain, car);
  if (kindHintText) {
    const hint = document.createElement("p");
    hint.className = "seat-grid-kind-hint";
    hint.textContent = kindHintText;
    grid.append(hint);
  }
  const seats = demoSeatLayouts.get(car) || [];
  const byCompartment = new Map();
  seats.forEach((seat) => {
    const ci = seat.compartmentIndex ?? 0;
    if (!byCompartment.has(ci)) byCompartment.set(ci, []);
    byCompartment.get(ci).push(seat);
  });
  const cls = carriageClassKey(car);
  const compIndices = [...byCompartment.keys()].sort((a, b) => a - b);
  const compartmentCount = compIndices.length ? Math.max(...compIndices) + 1 : 1;
  const isPlatzkartClassic =
    cls === "platzkart" && seats.some((s) => s.zone === "open") && seats.some((s) => s.zone === "side");
  if (isPlatzkartClassic) {
    const openSeats = seats.filter((s) => s.zone === "open");
    const sideSeats = seats.filter((s) => s.zone === "side");
    const openByComp = new Map();
    openSeats.forEach((seat) => {
      const ci = seat.compartmentIndex ?? 0;
      if (!openByComp.has(ci)) openByComp.set(ci, []);
      openByComp.get(ci).push(seat);
    });
    const secOpen = document.createElement("div");
    secOpen.className = "platz-zone platz-zone--open";
    const lo = document.createElement("p");
    lo.className = "platz-zone-label";
    lo.textContent = i18n[language].seatPickerZoneOpen;
    secOpen.append(lo);
    const openFlex = document.createElement("div");
    openFlex.className = "car-platz-open-cubes";
    for (let compIdx = 0; compIdx < 9; compIdx += 1) {
      appendStandardCoupeCube(openFlex, car, openByComp.get(compIdx) || [], selectedTrain, 9);
    }
    secOpen.append(openFlex);
    grid.append(secOpen);

    const secSide = document.createElement("div");
    secSide.className = "platz-zone platz-zone--side";
    const ls = document.createElement("p");
    ls.className = "platz-zone-label";
    ls.textContent = i18n[language].seatPickerZoneSide;
    secSide.append(ls);
    const bySideComp = new Map();
    sideSeats.forEach((seat) => {
      const ci = seat.compartmentIndex ?? 9;
      if (!bySideComp.has(ci)) bySideComp.set(ci, []);
      bySideComp.get(ci).push(seat);
    });
    for (let compIdx = 9; compIdx <= 17; compIdx += 1) {
      const pair = bySideComp.get(compIdx) || [];
      const upper = pair.find((s) => s.berth_kind === "side_upper");
      const lower = pair.find((s) => s.berth_kind === "side_lower");
      const row = document.createElement("div");
      row.className = "car-side-bay-row";
      const colU = document.createElement("div");
      colU.className = "car-side-col car-side-col--upper";
      const colL = document.createElement("div");
      colL.className = "car-side-col car-side-col--lower";
      if (upper) colU.append(createSeatButton(car, upper));
      if (lower) colL.append(createSeatButton(car, lower));
      row.append(colU, colL);
      secSide.append(row);
    }
    grid.append(secSide);
    return;
  }
  const isDoubleCoupe = carriageIsDoubleDeckCoupeLayout(selectedTrain, car);
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
        appendStandardCoupeCube(flex0, car, byCompartment.get(compIdx) || [], selectedTrain, compartmentCount);
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
        appendStandardCoupeCube(flex1, car, byCompartment.get(compIdx) || [], selectedTrain, compartmentCount);
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
      const tone = compartmentToneClassForCube(selectedTrain, car, compIdx, compartmentCount);
      cube.className = ["compartment-cube", "compartment-cube--sv", tone].filter(Boolean).join(" ");
      [...compSeats]
        .sort((a, b) => parseInt(a.displayNum, 10) - parseInt(b.displayNum, 10))
        .forEach((seat) => {
          cube.append(createSeatButton(car, seat));
        });
      grid.append(cube);
      return;
    }
    appendStandardCoupeCube(grid, car, compSeats, selectedTrain, compartmentCount);
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

function applyDemoPaymentChrome() {
  const copy = i18n[language];
  const heading = document.getElementById("demo-payment-heading");
  const sub = document.getElementById("demo-payment-subtitle");
  const amtLabel = document.getElementById("demo-payment-amount-label");
  const cardLab = document.getElementById("demo-payment-card-label");
  const expLab = document.getElementById("demo-payment-expiry-label");
  if (heading) heading.textContent = copy.paymentDemoTitle;
  if (sub) sub.textContent = copy.paymentDemoSubtitle;
  if (amtLabel) amtLabel.textContent = copy.paymentAmountLabel;
  if (cardLab) cardLab.textContent = copy.paymentCardLabel;
  if (expLab) expLab.textContent = copy.paymentExpiryLabel;
}

function openDemoPaymentModal(totalRub) {
  applyDemoPaymentChrome();
  const val = document.getElementById("demo-payment-amount-value");
  if (val) val.textContent = formatPrice(totalRub);
  const statusEl = document.getElementById("demo-payment-status");
  if (statusEl) statusEl.textContent = "";
  const tail = document.getElementById("demo-payment-card-tail");
  if (tail) {
    tail.textContent = "";
    tail.setAttribute("aria-hidden", "true");
  }
  const exp = document.getElementById("demo-payment-expiry");
  if (exp) exp.textContent = "—";
  const bar = document.getElementById("demo-payment-progress-bar");
  if (bar) {
    bar.classList.remove("demo-payment-progress-bar--full");
  }
  const chk = document.getElementById("demo-payment-check");
  if (chk) chk.classList.add("hidden");
  demoPaymentModal?.classList.remove("hidden");
  demoPaymentModal?.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeDemoPaymentModal() {
  demoPaymentModal?.classList.add("hidden");
  demoPaymentModal?.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

async function runDemoPaymentAnimation() {
  const copy = i18n[language];
  /** Удерживаем экран оплаты заметно дольше (≈×3 к базовым паузам); при reduced-motion короче. */
  const pace = prefersReducedMotion() ? 0.38 : 3;
  const statusEl = document.getElementById("demo-payment-status");
  const tail = document.getElementById("demo-payment-card-tail");
  const exp = document.getElementById("demo-payment-expiry");
  const bar = document.getElementById("demo-payment-progress-bar");
  const chk = document.getElementById("demo-payment-check");

  const setStatus = (t) => {
    if (statusEl) statusEl.textContent = t;
  };

  setStatus(copy.paymentConnecting);
  await sleep(Math.round(380 * pace));

  setStatus(copy.paymentAutofill);
  if (tail) {
    tail.textContent = "4242";
    tail.setAttribute("aria-hidden", "false");
  }
  await sleep(Math.round(420 * pace));
  if (exp) exp.textContent = "12/30";

  setStatus(copy.paymentProcessing);
  await sleep(Math.round(280 * pace));
  if (bar) {
    void bar.offsetWidth;
    bar.classList.add("demo-payment-progress-bar--full");
  }
  await sleep(Math.round((prefersReducedMotion() ? 200 : 920) * pace));

  setStatus(copy.paymentSuccess);
  if (chk) chk.classList.remove("hidden");
  await sleep(Math.round(520 * pace));
}

async function confirmSeatSelection() {
  const seatsPayload = seatPayloadFromSelection();
  if (!seatsPayload.length || issuingTicket || uiInteractionLocked || !selectedTrain) return;
  setUiInteractionLocked(true);
  issuingTicket = true;
  confirmSeatsButton.disabled = true;
  beginIdlePause();
  try {
    const totalRub = selectedSeatsOrderTotalRub();
    openDemoPaymentModal(totalRub);
    await runDemoPaymentAnimation();
    const copy = i18n[language];
    const statusEl = document.getElementById("demo-payment-status");
    if (statusEl) statusEl.textContent = copy.paymentIssuingTicket;
    demoTicket = await postJson("/api/checkout/demo", {
      language,
      train: selectedTrain,
      selected_seats: seatsPayload,
      passenger_full_name: sessionPassenger.fullName || undefined,
      passenger_phone: sessionPassenger.phoneDisplay || undefined,
      passenger_document: sessionPassenger.document || undefined,
    });
    seatPickerPanel.classList.add("hidden");
    renderTicket();
  } catch {
    assistantSay(i18n[language].checkoutError);
  } finally {
    closeDemoPaymentModal();
    endIdlePause();
    issuingTicket = false;
    confirmSeatsButton.disabled = selectedSeatKeys.size === 0;
    updateSeatPickerChrome();
    setUiInteractionLocked(false);
  }
}

/**
 * Текст для QR (Byte mode, UTF-8). Режимы Numeric/Alphanumeric в QR не содержат кириллицу;
 * компактные строки помещаются в матрицу с EC-M/L. На экране билета остаётся полная развёрнутая вёрстка.
 */
function buildDemoTicketQrPayload() {
  const copy = i18n[language];
  const d = demoTicket;
  if (!d) return "";
  const thanks = copy.ticketThanks;
  const ru = language === "ru";
  const lines = [
    `${copy.demoTicket} · ${d.ticket_id}`,
    d.route,
    `${d.train_number} · ${d.departure}–${d.arrival}`,
    `${ru ? "Ваг" : "Car"} ${d.car} · ${ru ? "Место" : "Seat"} ${d.seat}`,
    `${d.berth_type} · ${travelClassForTicket(d.travel_class)}`,
  ];
  if (d.passenger_full_name) {
    lines.push(`${ru ? "Пассажир" : "Passenger"}: ${d.passenger_full_name}`);
  }
  if (d.passenger_document) {
    lines.push(`${ru ? "Документ" : "ID"}: ${d.passenger_document}`);
  }
  if (d.passenger_phone) {
    lines.push(`${ru ? "Телефон" : "Phone"}: ${d.passenger_phone}`);
  }
  lines.push(thanks);
  return lines.join("\n");
}

function qrColorsFromTheme() {
  const cs = getComputedStyle(document.documentElement);
  const colorDark = (cs.getPropertyValue("--qr-dark") || "#071018").trim();
  const colorLight = (cs.getPropertyValue("--qr-light") || "#ffffff").trim();
  return { colorDark, colorLight };
}

function renderTicketQrCanvas(payloadText) {
  const wrap = document.querySelector("#ticket-qr-wrap");
  const thanksEl = document.querySelector("#ticket-thanks");
  if (!wrap || !thanksEl) return;
  thanksEl.textContent = i18n[language].ticketThanks;

  const textFallback = (text) => {
    wrap.innerHTML = "";
    wrap.textContent = text.slice(0, 480);
  };

  const QR = window.QRCode;
  if (typeof QR === "undefined" || !String(payloadText || "").trim()) {
    if (payloadText) textFallback(payloadText);
    return;
  }

  const baseOpts = {
    width: TICKET_QR_RENDER_PX,
    height: TICKET_QR_RENDER_PX,
    ...qrColorsFromTheme(),
  };

  /** ticket_id уже вида PATH-… — не добавляем второй префикс PATH: */
  function qrMinimalIdPayload() {
    const raw = demoTicket && typeof demoTicket.ticket_id === "string" ? demoTicket.ticket_id.trim() : "";
    if (raw) return raw;
    return "PATH-unknown";
  }

  /**
   * Цепочка попыток: полный компактный текст, затем усечение по UTF-8 байтам (лимит QR Ver.40 ~2953 B в Byte),
   * в конце только ticket_id. Менять «тип» QR на Numeric нельзя — без кириллицы.
   */
  function buildQrAttempts(fullText) {
    const t = String(fullText);
    const out = [];
    const seen = new Set();
    const addBothEc = (text) => {
      const s = String(text);
      if (!s.trim() || seen.has(s)) return;
      seen.add(s);
      out.push({ text: s, ec: QR.CorrectLevel.M });
      out.push({ text: s, ec: QR.CorrectLevel.L });
    };
    addBothEc(t);
    for (const maxB of [2880, 2400, 1800, 1200, 600]) {
      addBothEc(utf8ByteSlice(t, maxB));
    }
    const minId = qrMinimalIdPayload();
    if (!seen.has(minId)) {
      out.push({ text: minId, ec: QR.CorrectLevel.M });
      out.push({ text: minId, ec: QR.CorrectLevel.L });
    }
    return out;
  }

  const attempts = buildQrAttempts(payloadText);

  /** qrcode.js кладёт и canvas, и img; оба с display:block дают два QR в ряд — оставляем только canvas. */
  function dropQrRasterDuplicate(wrapEl) {
    wrapEl.querySelectorAll("img").forEach((el) => el.remove());
  }

  const findQrNode = () => wrap.querySelector("canvas, img, table, svg");

  const polishQrDom = () => {
    dropQrRasterDuplicate(wrap);
    const node = findQrNode();
    if (!node) return false;
    const tag = node.tagName;
    if (tag === "CANVAS") {
      node.setAttribute("aria-hidden", "true");
      node.style.display = "block";
    } else if (tag === "IMG") {
      node.alt = "";
      node.style.display = "block";
    }
    if (tag === "CANVAS" || tag === "IMG" || tag === "SVG") {
      node.style.margin = "0 auto";
      node.style.maxWidth = "100%";
      node.style.height = "auto";
    }
    wrap.setAttribute("aria-hidden", "false");
    return true;
  };

  let drew = false;
  for (const { text, ec } of attempts) {
    try {
      wrap.innerHTML = "";
      new QR(wrap, { ...baseOpts, text, correctLevel: ec });
      dropQrRasterDuplicate(wrap);
      if (findQrNode()) {
        drew = true;
        break;
      }
    } catch {
      /* следующая длина или уровень коррекции */
    }
  }

  if (!drew || !polishQrDom()) {
    textFallback(payloadText);
    return;
  }

  // makeImage может снова добавить img асинхронно — убрать дубликат после тика.
  requestAnimationFrame(() => {
    dropQrRasterDuplicate(wrap);
    polishQrDom();
  });
  setTimeout(() => {
    dropQrRasterDuplicate(wrap);
    polishQrDom();
  }, 80);
}

function playTicketConfirmCelebration() {
  if (prefersReducedMotion()) return;
  const ticket = document.querySelector("#ticket-panel .ticket");
  if (!ticket) return;
  ticket.classList.remove("ticket--celebrate");
  void ticket.offsetWidth;
  ticket.classList.add("ticket--celebrate");
  setTimeout(() => ticket.classList.remove("ticket--celebrate"), 900);
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 783.99;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.055, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.11);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
    ctx.close();
  } catch {
    /* ignore */
  }
}

function renderTicket() {
  setCheckoutSeatConfirmBarVisible(false);
  seatPickerPanel.classList.add("hidden");
  mapContent.classList.remove("hidden");
  ticketPanel.classList.remove("hidden");
  setStage("ticket");
  const copy = i18n[language];
  document.querySelector("#ticket-title").textContent = copy.demoTicket;
  const featuresBlock = ticketUnifiedFeaturesHtml(selectedTrain, demoTicket?.car, demoTicket);
  const pf = demoTicket?.passenger_full_name || "";
  const pp = demoTicket?.passenger_phone || "";
  const pd = demoTicket?.passenger_document || "";
  const passBlock =
    pf || pp || pd
      ? `<div class="ticket-passenger-block">
    ${pf ? `<span><strong>${copy.ticketPassenger}:</strong> ${pf}</span>` : ""}
    ${pd ? `<span><strong>${copy.ticketPassengerDoc}:</strong> ${pd}</span>` : ""}
    ${pp ? `<span><strong>${copy.ticketPassengerPhone}:</strong> ${pp}</span>` : ""}
  </div>`
      : "";
  document.querySelector("#ticket-body").innerHTML = `
    <strong>${demoTicket.route}</strong>
    <span>${language === "ru" ? "Поезд" : "Train"}: ${demoTicket.train_number}</span>
    <span>${language === "ru" ? "Отправление" : "Departure"}: ${demoTicket.departure}</span>
    <span>${language === "ru" ? "Прибытие" : "Arrival"}: ${demoTicket.arrival}</span>
    <span>${language === "ru" ? "Вагон" : "Car"}: ${demoTicket.car}</span>
    <span>${language === "ru" ? "Место" : "Seat"}: ${demoTicket.seat}</span>
    <span>${language === "ru" ? "Полка" : "Berth"}: ${demoTicket.berth_type}</span>
    <span>${travelClassForTicket(demoTicket.travel_class)}</span>
    ${passBlock}
    ${featuresBlock}
    <small>${demoTicket.disclaimer}</small>
  `;
  renderTicketQrCanvas(buildDemoTicketQrPayload());
  playTicketConfirmCelebration();
  assistantSay(language === "ru" ? "Демонстрационный билет готов." : "Your demo ticket is ready.");
  document.querySelector("#checkout-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
  touchGlobalIdle();
}

function stopAssistantSpeech() {
  speechQueue.length = 0;
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  isSpeaking = false;
}

function startVoiceRecognition() {
  stopAssistantSpeech();
  playOrbTapSound();
  if (orbRecognition) {
    try {
      orbRecognition.abort();
    } catch {
      /* ignore */
    }
    orbRecognition = null;
  }
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
  recognition.onerror = (event) => {
    orbRecognition = null;
    const code = event && event.error ? String(event.error) : "";
    // Тишина или отмена — не путаем с «нет распознавания в браузере».
    if (code === "no-speech" || code === "aborted") {
      return;
    }
    if (code === "not-allowed") {
      assistantSay(i18n[language].speechMicDenied);
      return;
    }
    if (code === "audio-capture") {
      assistantSay(i18n[language].speechMicCapture);
      return;
    }
    if (code === "network") {
      assistantSay(i18n[language].speechNetworkError);
      return;
    }
    assistantSay(i18n[language].speechRecognitionGlitch);
  };
  recognition.onend = () => {
    orbRecognition = null;
    if (uiStage !== "searching") setOrbMode("idle");
  };
  orbRecognition = recognition;
  recognition.start();
}

function assistantSay(text, options = {}) {
  if (assistantText) assistantText.textContent = text;
  setOrbMode("speaking");
  if (options.addToHistory !== false) {
    addMessage("assistant", text);
  }
  enqueueSpeech(text);
}

function setOrbMode(mode) {
  if (!orbButton) return;
  orbButton.classList.remove("orb-idle", "orb-listening", "orb-thinking", "orb-speaking");
  orbButton.classList.add(`orb-${mode}`);
}

function addMessage(role, text) {
  dialogMessages.push({ role, text });
  dialogMessages = dialogMessages.slice(-8);
  renderHistory();
}

function renderHistory() {
  if (!dialogHistory) return;
  dialogHistory.innerHTML = "";
  const frag = document.createDocumentFragment();
  dialogMessages.forEach((message) => {
    const item = document.createElement("div");
    item.className = `message message-${message.role}`;
    item.innerHTML = `
      <span>${message.role === "user" ? i18n[language].userRole : i18n[language].assistantRole}</span>
      <p>${escapeHtml(message.text)}</p>
    `;
    frag.append(item);
  });
  dialogHistory.append(frag);
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
    if (
      uiStage === "initial" ||
      uiStage === "results" ||
      uiStage === "checkout" ||
      uiStage === "seatPicker" ||
      uiStage === "ticket"
    )
      setOrbMode("idle");
    return;
  }
  isSpeaking = true;
  speak(speechQueue.shift());
}

function speak(text) {
  if (!("speechSynthesis" in window)) {
    speakNext();
    return;
  }
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

function formatPrice(price) {
  if (price === null || price === undefined) return "-";
  return `${Number(price).toLocaleString(language === "ru" ? "ru-RU" : "en-US")} ₽`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** Заголовки вида «AI Fact»: красные «AI», остальное обычным текстом (copy только из i18n). */
function applyAiFactHeading(el, labelFromI18n) {
  if (!el) return;
  const raw = String(labelFromI18n ?? "").trim();
  if (/^AI(\s|$)/i.test(raw)) {
    const rest = raw.slice(2).replace(/^\s+/, "");
    el.innerHTML = "";
    const ai = document.createElement("span");
    ai.className = "ai-brand";
    ai.textContent = "AI";
    el.appendChild(ai);
    if (rest) el.appendChild(document.createTextNode(` ${rest}`));
  } else {
    el.textContent = raw;
  }
}

/** Текст сравнения из LLM: экранируем, подсвечиваем отдельные «AI», переводы строк в &lt;br&gt;. */
function renderCompareTrainsRichText(el, raw) {
  if (!el) return;
  const t = String(raw ?? "");
  let html = escapeHtml(t).replaceAll("\n", "<br />");
  html = html.replace(/\bAI\b/g, '<span class="ai-brand">AI</span>');
  el.innerHTML = html;
}

function applySupportChatChrome() {
  const copy = i18n[language];
  if (supportChatTitleEl) supportChatTitleEl.textContent = copy.supportChatTitle;
  if (supportChatDisclaimerEl) supportChatDisclaimerEl.textContent = copy.supportChatDisclaimer;
  if (supportChatSend) supportChatSend.textContent = copy.supportChatSend;
  if (supportChatClose) supportChatClose.textContent = copy.supportChatClose;
  if (supportChatMic) supportChatMic.setAttribute("aria-label", copy.supportChatMicAria);
  if (supportChatClearBtn) {
    supportChatClearBtn.textContent = copy.supportChatClear;
    supportChatClearBtn.setAttribute("aria-label", copy.supportChatClearAria);
  }
  if (supportChatInput) supportChatInput.placeholder = copy.supportChatPlaceholder;
  if (helpSupportButton) helpSupportButton.textContent = copy.helpSupport;
  updateSupportChatClearButton();
}

function updateSupportChatClearButton() {
  if (!supportChatClearBtn || !supportChatInput) return;
  const hasDraft = supportChatInput.value.length > 0;
  supportChatClearBtn.disabled = supportChatSending || !hasDraft;
}

function clearSupportChatDraft() {
  if (!supportChatInput || supportChatSending) return;
  const copy = i18n[language];
  supportChatInput.value = "";
  supportChatInput.placeholder = copy.supportChatPlaceholder;
  updateSupportChatClearButton();
  supportChatInput.focus();
}

function stopSupportVoiceRecognition() {
  if (supportRecognition) {
    try {
      supportRecognition.abort();
    } catch {
      /* ignore */
    }
    supportRecognition = null;
  }
  supportChatMic?.classList.remove("support-chat-mic-btn--listening");
}

function closeSupportChatModal() {
  stopSupportVoiceRecognition();
  if (!supportChatModal) return;
  supportChatModal.classList.add("hidden");
  supportChatModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function openSupportChatModal() {
  if (!supportChatModal) return;
  applySupportChatChrome();
  supportChatModal.classList.remove("hidden");
  supportChatModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  renderSupportChatMessages();
  supportChatInput?.focus();
}

function renderSupportChatMessages() {
  if (!supportChatMessagesEl) return;
  const copy = i18n[language];
  supportChatMessagesEl.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const turn of supportChatTurns) {
    const row = document.createElement("div");
    const roleLabel = turn.role === "user" ? copy.userRole : copy.supportChatAgentRole;
    row.className = `support-chat-bubble support-chat-bubble--${turn.role}`;
    row.innerHTML = `
      <span class="support-chat-bubble-role">${escapeHtml(roleLabel)}</span>
      <p>${escapeHtml(turn.text)}</p>
    `;
    frag.append(row);
  }
  supportChatMessagesEl.append(frag);
  supportChatMessagesEl.scrollTop = supportChatMessagesEl.scrollHeight;
}

function appendSupportTypingRow() {
  if (!supportChatMessagesEl) return null;
  const copy = i18n[language];
  const row = document.createElement("div");
  row.className = "support-chat-bubble support-chat-bubble--assistant support-chat-bubble--typing";
  row.innerHTML = `
    <span class="support-chat-bubble-role">${escapeHtml(copy.supportChatAgentRole)}</span>
    <p>${escapeHtml(copy.supportChatTyping)}</p>
  `;
  supportChatMessagesEl.append(row);
  supportChatMessagesEl.scrollTop = supportChatMessagesEl.scrollHeight;
  return row;
}

function removeSupportTypingRow(el) {
  try {
    el?.remove();
  } catch {
    /* ignore */
  }
}

async function sendSupportChatMessage() {
  if (!supportChatInput || !supportChatSend || supportChatSending) return;
  const copy = i18n[language];
  const text = supportChatInput.value.trim();
  if (!text) return;
  supportChatSending = true;
  supportChatSend.disabled = true;
  updateSupportChatClearButton();
  supportChatInput.value = "";
  supportChatTurns.push({ role: "user", text });
  renderSupportChatMessages();
  const typingRow = appendSupportTypingRow();
  try {
    const prior = supportChatTurns.slice(0, -1).slice(-10).map(({ role, text: t }) => ({ role, text: t }));
    const res = await postJson("/api/support-chat", {
      language,
      message: text,
      conversation: prior,
    });
    removeSupportTypingRow(typingRow);
    supportChatTurns.push({ role: "assistant", text: res.reply || copy.supportChatError });
  } catch {
    removeSupportTypingRow(typingRow);
    supportChatTurns.push({ role: "assistant", text: copy.supportChatError });
  }
  renderSupportChatMessages();
  supportChatSending = false;
  supportChatSend.disabled = false;
  updateSupportChatClearButton();
  supportChatInput.focus();
}

function startSupportVoiceRecognition() {
  stopSupportVoiceRecognition();
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const copy = i18n[language];
  if (!SpeechRecognition) {
    if (supportChatInput) supportChatInput.placeholder = copy.noSpeech;
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = language === "ru" ? "ru-RU" : "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  supportChatMic?.classList.add("support-chat-mic-btn--listening");
  recognition.onresult = (event) => {
    const spoken = event.results[0][0].transcript;
    if (supportChatInput) {
      const cur = supportChatInput.value.trim();
      supportChatInput.value = cur ? `${cur} ${spoken}` : spoken;
      updateSupportChatClearButton();
    }
  };
  recognition.onerror = (event) => {
    supportRecognition = null;
    supportChatMic?.classList.remove("support-chat-mic-btn--listening");
    const code = event && event.error ? String(event.error) : "";
    if (code === "no-speech" || code === "aborted") return;
    if (supportChatInput) supportChatInput.placeholder = copy.speechRecognitionGlitch;
  };
  recognition.onend = () => {
    supportRecognition = null;
    supportChatMic?.classList.remove("support-chat-mic-btn--listening");
  };
  supportRecognition = recognition;
  try {
    recognition.start();
  } catch {
    supportRecognition = null;
    supportChatMic?.classList.remove("support-chat-mic-btn--listening");
  }
}

function initSupportChatModal() {
  helpSupportButton?.addEventListener("click", () => openSupportChatModal());
  supportChatClose?.addEventListener("click", () => closeSupportChatModal());
  supportChatBackdrop?.addEventListener("click", () => closeSupportChatModal());
  supportChatSend?.addEventListener("click", () => void sendSupportChatMessage());
  supportChatClearBtn?.addEventListener("click", () => clearSupportChatDraft());
  supportChatMic?.addEventListener("click", () => startSupportVoiceRecognition());
  supportChatInput?.addEventListener("input", () => updateSupportChatClearButton());
  supportChatInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendSupportChatMessage();
    }
  });
}

function openPathLogModal() {
  const modal = document.getElementById("path-log-modal");
  const pre = document.getElementById("path-log-modal-content");
  const title = document.getElementById("path-log-modal-title");
  if (!modal || !pre) return;
  const labels = i18n[language];
  if (title) title.textContent = labels.logModalTitle;
  const copyLogBtn = document.getElementById("path-log-copy");
  const clearBtn = document.getElementById("path-log-clear");
  const closeBtn = document.getElementById("path-log-close");
  if (copyLogBtn) copyLogBtn.textContent = labels.logModalCopy;
  if (clearBtn) clearBtn.textContent = labels.logModalClear;
  if (closeBtn) closeBtn.textContent = labels.logModalClose;
  pre.textContent = pathClientLogs.length ? pathClientLogs.join("\n") : labels.logModalEmpty;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  pre.focus();
}

async function copyPathLogsToClipboard() {
  const text = pathClientLogs.length ? pathClientLogs.join("\n") : "";
  const copyBtn = document.getElementById("path-log-copy");
  const labels = i18n[language];
  try {
    await navigator.clipboard.writeText(text || labels.logModalEmpty);
    if (copyBtn) {
      copyBtn.textContent = labels.logModalCopied;
      setTimeout(() => {
        if (copyBtn) copyBtn.textContent = labels.logModalCopy;
      }, 1800);
    }
  } catch (err) {
    pathLogAppend("WARN", ["clipboard:", String(err)]);
    if (copyBtn) copyBtn.textContent = labels.logModalCopy;
  }
}

function closePathLogModal() {
  const modal = document.getElementById("path-log-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function clearPathClientLogs() {
  pathClientLogs.length = 0;
  pathLogAppend("INFO", ["Путь: журнал очищен"]);
}

function initCompareTrainModal() {
  compareTrainsBackdrop?.addEventListener("click", () => cancelTrainCompareFlow({ silent: false }));
  compareTrainsCloseBtn?.addEventListener("click", () => cancelTrainCompareFlow({ silent: false }));
  compareTrainsStartBtn?.addEventListener("click", () => startTrainCompare());
  compareTrainsCancelBar?.addEventListener("click", () => cancelTrainCompareFlow({ silent: false }));
  compareCheckoutABtn?.addEventListener("click", () => {
    const id = compareCheckoutABtn?.dataset?.trainId;
    if (id) void completeCompareCheckout(id);
  });
  compareCheckoutBBtn?.addEventListener("click", () => {
    const id = compareCheckoutBBtn?.dataset?.trainId;
    if (id) void completeCompareCheckout(id);
  });
  const leftCol = document.querySelector(".compare-trains-cards-col");
  if (leftCol && typeof ResizeObserver !== "undefined") {
    compareLeftColumnResizeObserver = new ResizeObserver(() => {
      if (!compareTrainsModal?.classList.contains("hidden")) {
        syncCompareModalHeights();
      }
    });
    compareLeftColumnResizeObserver.observe(leftCol);
  }
  window.addEventListener("resize", () => {
    if (!compareTrainsModal?.classList.contains("hidden")) {
      scheduleSyncCompareModalHeights();
    }
  });
}

function initPathLogModal() {
  const modal = document.getElementById("path-log-modal");
  const backdrop = document.getElementById("path-log-modal-backdrop");
  const closeBtn = document.getElementById("path-log-close");
  const clearBtn = document.getElementById("path-log-clear");
  const copyLogBtn = document.getElementById("path-log-copy");
  if (backdrop) backdrop.addEventListener("click", closePathLogModal);
  if (closeBtn) closeBtn.addEventListener("click", closePathLogModal);
  if (copyLogBtn) copyLogBtn.addEventListener("click", () => void copyPathLogsToClipboard());
  if (clearBtn)
    clearBtn.addEventListener("click", () => {
      clearPathClientLogs();
      openPathLogModal();
    });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const payModal = document.getElementById("demo-payment-modal");
    if (payModal && !payModal.classList.contains("hidden")) {
      e.preventDefault();
      return;
    }
    const compareModal = document.getElementById("compare-trains-modal");
    if (compareModal && !compareModal.classList.contains("hidden")) {
      cancelTrainCompareFlow({ silent: false });
      return;
    }
    const supportModal = document.getElementById("support-chat-modal");
    if (supportModal && !supportModal.classList.contains("hidden")) {
      closeSupportChatModal();
      return;
    }
    if (modal && !modal.classList.contains("hidden")) {
      closePathLogModal();
    }
  });
}

function initThemeToggle() {
  const html = document.documentElement;
  let stored = null;
  try {
    stored = localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    stored = null;
  }
  if (stored !== "neon" && stored !== "rzd") stored = "rzd";
  html.dataset.theme = stored;

  const btn = document.getElementById("theme-toggle");
  if (!btn) return;

  const syncActiveClass = () => {
    btn.classList.toggle("theme-toggle--rzd-active", html.dataset.theme === "rzd");
    btn.setAttribute("aria-pressed", html.dataset.theme === "rzd" ? "true" : "false");
  };

  btn.addEventListener("click", () => {
    html.dataset.theme = html.dataset.theme === "rzd" ? "neon" : "rzd";
    try {
      localStorage.setItem(THEME_STORAGE_KEY, html.dataset.theme);
    } catch {
      /* private mode */
    }
    syncActiveClass();
    refreshThemeToggleLabels();
    if (demoTicket) renderTicketQrCanvas(buildDemoTicketQrPayload());
  });

  syncActiveClass();
  refreshThemeToggleLabels();
}

function refreshThemeToggleLabels() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  const copy = i18n[language];
  btn.setAttribute("aria-label", copy.themeToggleAria);
  const neonEl = btn.querySelector(".theme-toggle__neon");
  const rzdEl = btn.querySelector(".theme-toggle__rzd");
  if (neonEl) neonEl.textContent = copy.themeNeonShort;
  if (rzdEl) rzdEl.textContent = copy.themeRzdShort;
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
  abortDialogRequests();
  cancelTrainCompareFlow({ silent: true, skipRender: true });
  state = {};
  intent = null;
  trains = [];
  recommendations = [];
  selectedTrain = null;
  demoTicket = null;
  checkoutAnimating = false;
  issuingTicket = false;
  ticketSearchSource = "demo";
  routeStopsLoadedIds = new Set();
  clearRouteStopRevealTimers();
  demoCarriages = [];
  activeCarriageIndex = 0;
  demoSeatLayouts = new Map();
  demoCarriageClassByCar = new Map();
  selectedSeatKeys = new Set();
  lastSelectedTrainId = null;
  lastDialogUserText = "";
  lastSuccessfulSearchKey = null;
  dialogMessages = [];
  selectTrainSeq = 0;
  speechQueue = [];
  isSpeaking = false;
  dynamicRouteCache = { key: "", geom: null };
  setUiInteractionLocked(false);
  hideDataSourceBanner();
  hideBackendHealthBanner();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  if (userInput) userInput.value = "";
  if (assistantText) assistantText.textContent = i18n[language].assistantReady;
  [intentPanel, trainsPanel, checkoutPanel, seatPickerPanel, ticketPanel].forEach((panel) =>
    panel?.classList.add("hidden"),
  );
  syncCheckoutPanelPlacement();
  hideCheckoutTrainSummary();
  exitCheckoutWorkspaceMode();
  mapContent?.classList.remove("hidden");
  const checkoutSteps = document.querySelector("#checkout-steps");
  if (checkoutSteps) checkoutSteps.innerHTML = "";
  checkoutLoadingEl?.classList.add("hidden");
  checkoutButton?.classList.remove("hidden");
  const routeMeta = document.querySelector("#route-meta");
  const routeFactEl = document.querySelector("#route-fact");
  if (routeMeta)
    routeMeta.textContent = formatRoutePair(
      language === "ru" ? "Москва" : "Moscow",
      language === "ru" ? "Казань" : "Kazan",
    );
  if (routeFactEl)
    routeFactEl.textContent =
      language === "ru"
        ? "Факт о маршруте появится после поиска билетов."
        : "A route fact will appear after ticket search.";
  const defaultVisual = mergeRouteVisualForTrain("", null);
  applyRouteGeometry(defaultVisual, {
    origin: language === "ru" ? "Москва" : "Moscow",
    destination: language === "ru" ? "Казань" : "Kazan",
  });
  setTextInputPanelOpen(false);
  setStage("initial");
  renderHistory();
  closePathLogModal();
  if (announce) {
    assistantSay(i18n[language].assistantReady, { addToHistory: false });
  }
}
