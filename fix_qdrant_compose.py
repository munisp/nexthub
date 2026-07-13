"""
Add Qdrant vector database service and qdrant_data volume to docker-compose.yml.
Also update face-biometric service to depend on qdrant and pass QDRANT_URL env var.
"""
content = open('/home/ubuntu/nexthub/docker-compose.yml').read()

# 1. Add qdrant_data volume
old_volumes = """  face_biometric_models:"""
new_volumes = """  face_biometric_models:
  qdrant_data:"""
assert old_volumes in content, "ERROR: face_biometric_models volume not found"
content = content.replace(old_volumes, new_volumes, 1)
print("qdrant_data volume added")

# 2. Add Qdrant service after face-biometric service (before nexthub service)
old_nexthub = """  nexthub:
    build:
      context: .
      dockerfile: Dockerfile"""
new_qdrant_and_nexthub = """  qdrant:
    image: qdrant/qdrant:v1.9.4
    restart: unless-stopped
    networks: [nexthub]
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant_data:/qdrant/storage
    environment:
      QDRANT__SERVICE__GRPC_PORT: "6334"
      QDRANT__SERVICE__HTTP_PORT: "6333"
      QDRANT__LOG_LEVEL: INFO
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:6333/healthz"]
      interval: 15s
      timeout: 10s
      retries: 5
      start_period: 20s

  nexthub:
    build:
      context: .
      dockerfile: Dockerfile"""
assert old_nexthub in content, "ERROR: nexthub service anchor not found"
content = content.replace(old_nexthub, new_qdrant_and_nexthub, 1)
print("Qdrant service added")

# 3. Add QDRANT_URL env var to face-biometric service
old_face_env = """      LIVENESS_MODEL_PATH: /app/models/silent_face_anti_spoof.onnx
      PORT: "8220" """
new_face_env = """      LIVENESS_MODEL_PATH: /app/models/silent_face_anti_spoof.onnx
      QDRANT_URL: http://qdrant:6333
      QDRANT_COLLECTION: face_embeddings
      JWT_PRIVATE_KEY_PATH: /app/models/jwt_private.pem
      JWT_PUBLIC_KEY_PATH: /app/models/jwt_public.pem
      JWT_ISSUER: nexthub-face-biometric
      PORT: "8220" """
if old_face_env in content:
    content = content.replace(old_face_env, new_face_env, 1)
    print("QDRANT_URL env var added to face-biometric")
else:
    # Try without trailing space
    old_face_env2 = """      LIVENESS_MODEL_PATH: /app/models/silent_face_anti_spoof.onnx
      PORT: "8220\""""
    new_face_env2 = """      LIVENESS_MODEL_PATH: /app/models/silent_face_anti_spoof.onnx
      QDRANT_URL: http://qdrant:6333
      QDRANT_COLLECTION: face_embeddings
      JWT_PRIVATE_KEY_PATH: /app/models/jwt_private.pem
      JWT_PUBLIC_KEY_PATH: /app/models/jwt_public.pem
      JWT_ISSUER: nexthub-face-biometric
      PORT: "8220\""""
    if old_face_env2 in content:
        content = content.replace(old_face_env2, new_face_env2, 1)
        print("QDRANT_URL env var added to face-biometric (variant 2)")
    else:
        print("WARNING: Could not find face-biometric PORT env var pattern — manual check needed")

# 4. Add qdrant dependency to face-biometric service
old_face_depends = """    depends_on:
      redis:
        condition: service_healthy
      kafka:
        condition: service_healthy
    networks: [nexthub]
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:8220/health"]"""
new_face_depends = """    depends_on:
      redis:
        condition: service_healthy
      kafka:
        condition: service_healthy
      qdrant:
        condition: service_healthy
    networks: [nexthub]
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:8220/health"]"""
if old_face_depends in content:
    content = content.replace(old_face_depends, new_face_depends, 1)
    print("qdrant dependency added to face-biometric")
else:
    print("WARNING: face-biometric depends_on pattern not found")

# 5. Add qdrant dependency to nexthub service
old_nexthub_depends = """      face-biometric:
        condition: service_healthy
    environment:
      DATABASE_URL:"""
new_nexthub_depends = """      face-biometric:
        condition: service_healthy
      qdrant:
        condition: service_healthy
    environment:
      DATABASE_URL:"""
if old_nexthub_depends in content:
    content = content.replace(old_nexthub_depends, new_nexthub_depends, 1)
    print("qdrant dependency added to nexthub")
else:
    print("WARNING: nexthub depends_on pattern not found")

# 6. Add QDRANT_URL to nexthub service environment
old_nexthub_env = """      FACE_BIOMETRIC_URL: http://face-biometric:8220
    ports:"""
new_nexthub_env = """      FACE_BIOMETRIC_URL: http://face-biometric:8220
      QDRANT_URL: http://qdrant:6333
    ports:"""
if old_nexthub_env in content:
    content = content.replace(old_nexthub_env, new_nexthub_env, 1)
    print("QDRANT_URL added to nexthub service")
else:
    print("WARNING: nexthub FACE_BIOMETRIC_URL env pattern not found")

open('/home/ubuntu/nexthub/docker-compose.yml', 'w').write(content)
print("docker-compose.yml saved")
