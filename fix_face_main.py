content = open('/home/ubuntu/nexthub/services/bridge/cmd/main.go').read()

# 1. Add FaceBiometric client init after mosip init
old1 = '\t// ── HTTP handlers ─────────────────────────────────────────────────────────\n\th := &handlers.Handler{'
new1 = '''\t// ── Face Biometric client ─────────────────────────────────────────────────
\tfaceBiometricCfg := facebiometric.ConfigFromEnv()
\tfaceBiometricClient := facebiometric.New(faceBiometricCfg)
\tlog.Info("face_biometric_client_configured", zap.String("url", faceBiometricCfg.BaseURL))

\t// ── HTTP handlers ─────────────────────────────────────────────────────────
\th := &handlers.Handler{'''
if old1 in content:
    content = content.replace(old1, new1)
    print("client init added")
else:
    print("ERROR: client init pattern not found")
    # show surrounding lines
    idx = content.find('HTTP handlers')
    print(repr(content[idx-5:idx+80]))

# 2. Update Handler struct to include FaceBiometric
old2 = '''\th := &handlers.Handler{
\t\tLedger:   ledgerClient,
\t\tKafka:    kafkaProducer,
\t\tPermify:  permifyClient,
\t\tKeycloak: keycloakClient,
\t\tMOSIP:    mosipClient,
\t\tLog:      log,
\t}'''
new2 = '''\th := &handlers.Handler{
\t\tLedger:        ledgerClient,
\t\tKafka:         kafkaProducer,
\t\tPermify:       permifyClient,
\t\tKeycloak:      keycloakClient,
\t\tMOSIP:         mosipClient,
\t\tFaceBiometric: faceBiometricClient,
\t\tLog:           log,
\t}'''
if old2 in content:
    content = content.replace(old2, new2)
    print("handler struct updated")
else:
    print("ERROR: handler struct pattern not found")
    idx = content.find('Handler{')
    print(repr(content[idx:idx+200]))

# 3. Add face routes before kafka/publish
old3 = '\t\t// Kafka direct\n\t\tinfra.POST("/kafka/publish",                h.KafkaPublish)'
new3 = '''\t\t// Face Biometric — next-generation facial recognition + liveness
\t\tinfra.POST("/face/verify",     h.HandleFaceVerify)
\t\tinfra.POST("/face/liveness",   h.HandleFaceLiveness)
\t\tinfra.POST("/face/quality",    h.HandleFaceQuality)
\t\tinfra.POST("/face/enroll",     h.HandleFaceEnroll)
\t\tinfra.POST("/face/identify",   h.HandleFaceIdentify)
\t\tinfra.POST("/face/name-match", h.HandleNameMatch)

\t\t// Kafka direct
\t\tinfra.POST("/kafka/publish",                h.KafkaPublish)'''
if old3 in content:
    content = content.replace(old3, new3)
    print("routes added")
else:
    print("ERROR: routes pattern not found")
    idx = content.find('kafka/publish')
    print(repr(content[idx-60:idx+60]))

open('/home/ubuntu/nexthub/services/bridge/cmd/main.go', 'w').write(content)
print("main.go saved")
