FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir fastapi uvicorn sqlalchemy psycopg2-binary pandas pyarrow duckdb python-dotenv
COPY . .
EXPOSE 8082
HEALTHCHECK --interval=10s --timeout=5s --retries=3 CMD curl -sf http://localhost:8082/health || exit 1
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8082"]
