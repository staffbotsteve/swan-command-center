FROM python:3.12-slim

WORKDIR /app

# Install dependencies first for better layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app
COPY app.py .

# Cookies are mounted at /secrets/cookies.txt via Fly secrets.
ENV COOKIES_PATH=/secrets/cookies.txt

# Fly.io maps internal_port=8080 in fly.toml -> exposed via HTTPS
EXPOSE 8080

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
