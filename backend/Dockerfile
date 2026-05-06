# Лёгкий образ приложения: без моделей Vosk/Piper и без ffmpeg (речь — в сервисе speech).
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8000

ENV SPEECH_STT_ENGINE=legacy
ENV SPEECH_TTS_ENGINE=piper

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
