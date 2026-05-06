# Тяжёлый образ: Vosk, Piper, ffmpeg — пересобирается редко, отдельно от backend.
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    unzip \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV VOSK_MODEL_PATH=/models/vosk/vosk-model-small-ru-0.22
RUN mkdir -p /models/vosk && \
    wget -q https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip -O /tmp/vosk.zip && \
    unzip -q /tmp/vosk.zip -d /models/vosk && \
    rm /tmp/vosk.zip

ENV PIPER_BINARY=/usr/local/bin/piper
ENV PIPER_VOICE_RU=/models/piper/ru_RU-irina-medium.onnx
ENV PIPER_VOICE_EN=/models/piper/en_US-lessac-low.onnx

RUN wget -q https://github.com/rhasspy/piper/releases/download/v1.2.0/piper_amd64.tar.gz -O /tmp/piper.tgz && \
    tar -xzf /tmp/piper.tgz -C /tmp && \
    P="$(find /tmp -type f -name piper -executable 2>/dev/null | head -1)" && \
    test -n "$P" && mv "$P" /usr/local/bin/piper && chmod +x /usr/local/bin/piper && \
    rm -f /tmp/piper.tgz && rm -rf /tmp/piper

RUN mkdir -p /models/piper && \
    wget -q "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/irina/medium/ru_RU-irina-medium.onnx" -O /models/piper/ru_RU-irina-medium.onnx && \
    wget -q "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/irina/medium/ru_RU-irina-medium.onnx.json" -O /models/piper/ru_RU-irina-medium.onnx.json && \
    wget -q "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/low/en_US-lessac-low.onnx" -O /models/piper/en_US-lessac-low.onnx && \
    wget -q "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/low/en_US-lessac-low.onnx.json" -O /models/piper/en_US-lessac-low.onnx.json

COPY speech-service/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Общие модули с backend (один источник правды).
COPY backend/app/services/audio_convert.py backend/app/services/vosk_stt.py backend/app/services/piper_tts.py backend/app/services/speech_config.py /app/app/services/
COPY speech-service/app/main.py /app/app/main.py
RUN touch /app/app/__init__.py /app/app/services/__init__.py

# Sidecar всегда отдаёт серверные движки; клиент смотрит на основной API /api/speech-settings.
ENV SPEECH_STT_ENGINE=vosk
ENV SPEECH_TTS_ENGINE=piper

EXPOSE 8090

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8090"]
