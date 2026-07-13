content = open('/home/ubuntu/nexthub/services/bridge/cmd/main.go').read()

# 1. Add database/sql and redis imports
old_imports = '''\t"github.com/munisp/nexthub/bridge/internal/config"
\t"github.com/munisp/nexthub/bridge/internal/handlers"
\t"github.com/munisp/nexthub/bridge/internal/kafka"
\t"github.com/munisp/nexthub/bridge/internal/keycloak"
\t"github.com/munisp/nexthub/bridge/internal/ledger"
\tbMiddleware "github.com/munisp/nexthub/bridge/internal/middleware"
\t"github.com/munisp/nexthub/bridge/internal/facebiometric"
\t"github.com/munisp/nexthub/bridge/internal/mosip"
\t"github.com/munisp/nexthub/bridge/internal/permify"
\ttemporalWorker "github.com/munisp/nexthub/bridge/internal/temporal"
)'''

new_imports = '''\t"database/sql"
\t_ "github.com/lib/pq"
\t"github.com/redis/go-redis/v9"
\t"github.com/munisp/nexthub/bridge/internal/config"
\t"github.com/munisp/nexthub/bridge/internal/handlers"
\t"github.com/munisp/nexthub/bridge/internal/kafka"
\t"github.com/munisp/nexthub/bridge/internal/keycloak"
\t"github.com/munisp/nexthub/bridge/internal/ledger"
\tbMiddleware "github.com/munisp/nexthub/bridge/internal/middleware"
\t"github.com/munisp/nexthub/bridge/internal/facebiometric"
\t"github.com/munisp/nexthub/bridge/internal/mosip"
\t"github.com/munisp/nexthub/bridge/internal/permify"
\ttemporalWorker "github.com/munisp/nexthub/bridge/internal/temporal"
)'''

if old_imports in content:
    content = content.replace(old_imports, new_imports)
    print("imports updated")
else:
    print("ERROR: import pattern not found")

# 2. Add DB and Redis initialization after face biometric client init
old_face = '''\t// ── Face Biometric client ─────────────────────────────────────────────────
\tfaceBiometricCfg := facebiometric.ConfigFromEnv()
\tfaceBiometricClient := facebiometric.New(faceBiometricCfg)
\tlog.Info("face_biometric_client_configured", zap.String("url", faceBiometricCfg.BaseURL))'''

new_face = '''\t// ── Face Biometric client ─────────────────────────────────────────────────
\tfaceBiometricCfg := facebiometric.ConfigFromEnv()
\tfaceBiometricClient := facebiometric.New(faceBiometricCfg)
\tlog.Info("face_biometric_client_configured", zap.String("url", faceBiometricCfg.BaseURL))
\t// ── PostgreSQL (for partner API key lookups) ──────────────────────────────
\tpartnerDB, dbErr := sql.Open("postgres", cfg.DatabaseURL)
\tif dbErr != nil {
\t\tlog.Warn("partner_db_open_failed", zap.Error(dbErr))
\t\tpartnerDB = nil
\t}
\t// ── Redis (for partner key caching + rate limiting) ───────────────────────
\tredisOpts, redisErr := redis.ParseURL(cfg.RedisAddr)
\tvar partnerRedis *redis.Client
\tif redisErr != nil {
\t\tlog.Warn("partner_redis_parse_failed", zap.Error(redisErr))
\t} else {
\t\tpartnerRedis = redis.NewClient(redisOpts)
\t}'''

if old_face in content:
    content = content.replace(old_face, new_face)
    print("DB/Redis init added")
else:
    print("ERROR: face biometric pattern not found")

# 3. Add Partner API routes after the existing face biometric routes
old_face_routes = '''\t\t// Face Biometric — next-generation facial recognition + liveness
\t\tinfra.POST("/face/verify",     h.HandleFaceVerify)
\t\tinfra.POST("/face/liveness",   h.HandleFaceLiveness)
\t\tinfra.POST("/face/quality",    h.HandleFaceQuality)
\t\tinfra.POST("/face/enroll",     h.HandleFaceEnroll)
\t\tinfra.POST("/face/identify",   h.HandleFaceIdentify)
\t\tinfra.POST("/face/name-match", h.HandleNameMatch)'''

new_face_routes = '''\t\t// Face Biometric — next-generation facial recognition + liveness
\t\tinfra.POST("/face/verify",     h.HandleFaceVerify)
\t\tinfra.POST("/face/liveness",   h.HandleFaceLiveness)
\t\tinfra.POST("/face/quality",    h.HandleFaceQuality)
\t\tinfra.POST("/face/enroll",     h.HandleFaceEnroll)
\t\tinfra.POST("/face/identify",   h.HandleFaceIdentify)
\t\tinfra.POST("/face/name-match", h.HandleNameMatch)
\t}
\t// ── Partner Public API (X-API-Key auth + per-key rate limiting) ──────────
\t// Third-party apps, cameras, and integrators use this route group.
\t// Authentication: X-API-Key: nhfb_<key>  or  Authorization: Bearer nhfb_<key>
\tif partnerDB != nil && partnerRedis != nil {
\t\tpartnerAuth := bMiddleware.PartnerAuth(partnerDB, partnerRedis)
\t\tpartner := r.Group("/partner/v1")
\t\tpartner.Use(partnerAuth)
\t\t{
\t\t\t// Connectivity check
\t\t\tpartner.GET("/face/ping", h.PartnerPing)
\t\t\t// Face verification (1:1) — scope: face:verify
\t\t\tpartner.POST("/face/verify",
\t\t\t\tbMiddleware.RequireScope("face:verify"),
\t\t\t\th.PartnerFaceVerify)
\t\t\t// Liveness / anti-spoofing — scope: face:liveness
\t\t\tpartner.POST("/face/liveness",
\t\t\t\tbMiddleware.RequireScope("face:liveness"),
\t\t\t\th.PartnerFaceLiveness)
\t\t\t// Quality assessment — scope: face:quality
\t\t\tpartner.POST("/face/quality",
\t\t\t\tbMiddleware.RequireScope("face:quality"),
\t\t\t\th.PartnerFaceQuality)
\t\t\t// Enrollment — scope: face:enroll
\t\t\tpartner.POST("/face/enroll",
\t\t\t\tbMiddleware.RequireScope("face:enroll"),
\t\t\t\th.PartnerFaceEnroll)
\t\t\t// 1:N Identification — scope: face:identify
\t\t\tpartner.POST("/face/identify",
\t\t\t\tbMiddleware.RequireScope("face:identify"),
\t\t\t\th.PartnerFaceIdentify)
\t\t}
\t} else {
\t\tlog.Warn("partner_api_disabled", zap.String("reason", "DB or Redis unavailable"))
\t}
\t// ── (re-open infra group for remaining routes) ────────────────────────────
\tinfra2 := r.Group("/v1", bMiddleware.InternalKeyAuth(cfg.InternalKey))
\t_ = infra2 // placeholder — add future internal routes here
\t{'''

if old_face_routes in content:
    content = content.replace(old_face_routes, new_face_routes)
    print("partner routes added")
else:
    print("ERROR: face routes pattern not found")
    # show the section
    idx = content.find('face/name-match')
    print(repr(content[max(0,idx-200):idx+200]))

open('/home/ubuntu/nexthub/services/bridge/cmd/main.go', 'w').write(content)
print("main.go saved")
