FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    unzip \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Компактная русская модель Vosk (~45 MB)
ENV VOSK_MODEL_PATH=/models/vosk/vosk-model-small-ru-0.22
RUN mkdir -p /models/vosk && \
    wget -q https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip -O /tmp/vosk.zip && \
    unzip -q /tmp/vosk.zip -d /models/vosk && \
    rm /tmp/vosk.zip

# Piper CLI + лёгкие голоса RU/EN (CPU)
ENV PIPER_BINARY=/usr/local/bin/piper
ENV PIPER_VOICE_RU=/models/piper/ru_RU-irina-low.onnx
ENV PIPER_VOICE_EN=/models/piper/en_US-lessac-low.onnx

RUN wget -q https://github.com/rhasspy/piper/releases/download/v1.2.0/piper_linux_x86_64.tar.gz -O /tmp/piper.tgz && \
    tar -xzf /tmp/piper.tgz -C /tmp && \
    if [ -x /tmp/piper/piper ]; then mv /tmp/piper/piper /usr/local/bin/piper; \
    elif [ -x /tmp/piper ]; then mv /tmp/piper /usr/local/bin/piper; \
    else mv "$(find /tmp -maxdepth 3 -type f -name piper -executable | head -1)" /usr/local/bin/piper; fi && \
    chmod +x /usr/local/bin/piper && \
    rm -rf /tmp/piper /tmp/piper.tgz

RUN mkdir -p /models/piper && \
    wget -q "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/irina/low/ru_RU-irina-low.onnx" -O /models/piper/ru_RU-irina-low.onnx && \
    wget -q "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/irina/low/ru_RU-irina-low.onnx.json" -O /models/piper/ru_RU-irina-low.onnx.json && \
    wget -q "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/low/en_US-lessac-low.onnx" -O /models/piper/en_US-lessac-low.onnx && \
    wget -q "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/low/en_US-lessac-low.onnx.json" -O /models/piper/en_US-lessac-low.onnx.json

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8000

# По умолчанию серверный лёгкий STT/TTS; legacy = Web Speech API в браузере (отдельные флаги).
ENV SPEECH_STT_ENGINE=vosk
ENV SPEECH_TTS_ENGINE=piper

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
