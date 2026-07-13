content = open('/home/ubuntu/nexthub/docker-compose.yml').read()

# 1. Add face_biometric_models volume
old_vol = '  tigerbeetle_data:'
new_vol = '  tigerbeetle_data:\n  face_biometric_models:'
if old_vol in content:
    content = content.replace(old_vol, new_vol)
    print("volume added")
else:
    print("ERROR: volume pattern not found")

# 2. Add face-biometric service before the nexthub app service
# The nexthub service is the last service (line 262)
old_svc = '  nexthub:\n    build:\n      context: .\n      dockerfile: Dockerfile'
new_svc = '''  face-biometric:
    build:
      context: ./services/face-biometric
      dockerfile: Dockerfile
    restart: unless-stopped
    ports:
      - "8220:8220"
    environment:
      REDIS_URL: redis://redis:6379
      KAFKA_BROKERS: kafka:9092
      INSIGHTFACE_MODEL: buffalo_l
      FACE_VERIFY_THRESHOLD: "0.40"
      LIVENESS_THRESHOLD: "0.60"
      QUALITY_MIN_SCORE: "0.50"
      LIVENESS_MODEL_PATH: /app/models/silent_face_anti_spoof.onnx
      PORT: "8220"
    volumes:
      - face_biometric_models:/app/models
    depends_on:
      redis:
        condition: service_healthy
      kafka:
        condition: service_healthy
    networks: [nexthub]
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:8220/health"]
      interval: 15s
      timeout: 10s
      retries: 5
      start_period: 60s

  nexthub:
    build:
      context: .
      dockerfile: Dockerfile'''
if old_svc in content:
    content = content.replace(old_svc, new_svc)
    print("service added")
else:
    print("ERROR: service pattern not found")
    # show last 200 chars
    print(repr(content[-400:]))

open('/home/ubuntu/nexthub/docker-compose.yml', 'w').write(content)
print("docker-compose.yml saved")
