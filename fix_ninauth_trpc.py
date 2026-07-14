content = open('/home/ubuntu/nexthub/server/routers/nexthubIdentityDirectory.ts').read()

ninauth_procedures = '''
  // ─── NINAuth / NIMC Integration Procedures ─────────────────────────────────

  /**
   * Flow 1a: Generate NINAuth OIDC authorization URL with PKCE.
   * The citizen is redirected to this URL to consent on the NINAuth mobile app.
   */
  ninAuthInit: protectedProcedure
    .input(z.object({
      scopes:   z.array(z.string()).optional().default(["openid", "profile", "nin"]),
      nonce:    z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const state        = randomBytes(32).toString("hex");
      const codeVerifier = randomBytes(64).toString("base64url");
      const sessionId    = crypto.randomUUID();

      // Persist session for CSRF and PKCE validation
      await db.insert(ninAuthConsentSessions).values({
        id:           sessionId,
        state,
        codeVerifier,
        nonce:        input.nonce,
        scopes:       input.scopes,
        status:       "pending",
        expiresAt:    new Date(Date.now() + 10 * 60 * 1000), // 10 min
      });

      const result = await ninAuthInitViaMiddleware(state, codeVerifier, input.scopes, input.nonce);
      if (!result) throw new TRPCError({ code: "BAD_GATEWAY", message: "NINAuth service unavailable" });

      return { sessionId, state, authorizationUrl: result.authorization_url };
    }),

  /**
   * Flow 1b: Exchange NINAuth authorization code for tokens and store verified claims.
   */
  ninAuthCallback: protectedProcedure
    .input(z.object({
      code:  z.string(),
      state: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Look up the pending session
      const [session] = await db
        .select()
        .from(ninAuthConsentSessions)
        .where(and(
          eq(ninAuthConsentSessions.state, input.state),
          eq(ninAuthConsentSessions.status, "pending"),
        ))
        .limit(1);

      if (!session) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired NINAuth state" });

      const result = await ninAuthCallbackViaMiddleware(input.code, session.codeVerifier, input.state);
      if (!result) throw new TRPCError({ code: "BAD_GATEWAY", message: "NINAuth token exchange failed" });

      const claims = result.nin_claims as Record<string, string>;
      const ninHash = createHash("sha256").update(String(claims.sub ?? "")).digest("hex");

      // Store verified identity (zero-knowledge: NIN is hashed)
      const identityId = crypto.randomUUID();
      await db.insert(ninAuthVerifiedIdentities).values({
        id:          identityId,
        ninHash,
        firstName:   claims.given_name,
        lastName:    claims.family_name,
        middleName:  claims.middle_name,
        dateOfBirth: claims.birthdate,
        gender:      claims.gender,
        phoneHash:   claims.phone_number ? createHash("sha256").update(claims.phone_number).digest("hex") : undefined,
        emailHash:   claims.email ? createHash("sha256").update(claims.email).digest("hex") : undefined,
        accessToken: result.access_token,
        idToken:     result.id_token,
        tokenExpiresAt: new Date(Date.now() + result.expires_in * 1000),
        userId:      ctx.session?.user?.id,
        sessionId:   session.id,
      });

      // Mark session completed
      await db.update(ninAuthConsentSessions)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(ninAuthConsentSessions.id, session.id));

      await publishKafkaEvent(
        NEXTHUB_KAFKA_TOPICS.NINAUTH_CONSENT,
        { event: "NINAUTH_CONSENT_GRANTED", ninHash, identityId },
        identityId,
      );

      return { identityId, ninHash, verified: true };
    }),

  /**
   * Flow 2: Direct NIN verification (operator KYC).
   * Submits NIN + name to NIMC and receives field-level match results.
   */
  verifyNIN: hubOperatorProcedure
    .input(z.object({
      nin:         z.string().length(11),
      firstName:   z.string(),
      lastName:    z.string(),
      dateOfBirth: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await verifyNINViaMiddleware(
        input.nin, input.firstName, input.lastName, input.dateOfBirth
      );
      if (!result) throw new TRPCError({ code: "BAD_GATEWAY", message: "NIN verification service unavailable" });

      const logId = crypto.randomUUID();
      const ninPrefix = input.nin.slice(0, 4) + "*******";
      await db.insert(ninVerificationLogs).values({
        id:           logId,
        ninPrefix,
        verified:     result.verified,
        matchType:    result.match_type,
        fieldResults: result.field_results,
      });

      await publishKafkaEvent(
        NEXTHUB_KAFKA_TOPICS.NINAUTH_KYC,
        { event: "NIN_KYC_VERIFIED", ninPrefix, verified: result.verified, matchType: result.match_type },
        logId,
      );

      return result;
    }),

  /**
   * Flow 3: Face + NIN biometric match.
   * Fetches the NIN-enrolled photo from NIMC and runs ArcFace 1:1 + liveness.
   */
  ninFaceMatch: protectedProcedure
    .input(z.object({
      nin:          z.string().length(11),
      liveImageB64: z.string().min(100),
      context:      z.enum(["government", "payment", "border", "event"]).default("government"),
      accessToken:  z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await ninFaceMatchViaMiddleware(
        input.nin, input.liveImageB64, input.context, input.accessToken
      );
      if (!result) throw new TRPCError({ code: "BAD_GATEWAY", message: "NIN face match service unavailable" });

      const logId = crypto.randomUUID();
      const ninPrefix = input.nin.slice(0, 4) + "*******";
      await db.insert(ninFaceMatchLogs).values({
        id:             logId,
        ninPrefix,
        verified:       result.verified,
        similarity:     result.similarity,
        livenessPassed: result.liveness_passed,
        livenessScore:  result.liveness_score,
        matchType:      result.match_type,
        context:        input.context,
        assertionJwtId: result.assertion_jwt ? createHash("sha256").update(result.assertion_jwt).digest("hex").slice(0, 16) : undefined,
        userId:         ctx.session?.user?.id,
      });

      await publishKafkaEvent(
        NEXTHUB_KAFKA_TOPICS.NINAUTH_FACE_MATCH,
        { event: "NINAUTH_FACE_MATCH", ninPrefix, verified: result.verified, context: input.context },
        logId,
      );

      return result;
    }),

  /**
   * Flow 4: Verify a W3C Verifiable Credential JWT issued by NINAuth.
   */
  verifyNINVC: protectedProcedure
    .input(z.object({
      vcJwt: z.string().min(50),
    }))
    .mutation(async ({ input }) => {
      const result = await verifyNINVCViaMiddleware(input.vcJwt);
      if (!result) throw new TRPCError({ code: "BAD_GATEWAY", message: "VC verification service unavailable" });

      const logId = crypto.randomUUID();
      const subjectNinHash = result.subject_nin
        ? createHash("sha256").update(result.subject_nin).digest("hex")
        : undefined;

      await db.insert(ninVCVerificationLogs).values({
        id:             logId,
        vcId:           input.vcJwt.slice(0, 32),
        issuer:         result.issuer,
        subjectNinHash,
        valid:          result.valid,
        claims:         result.claims,
        error:          result.error,
      });

      await publishKafkaEvent(
        NEXTHUB_KAFKA_TOPICS.NINAUTH_VC_VERIFIED,
        { event: "NINAUTH_VC_VERIFIED", valid: result.valid, issuer: result.issuer },
        logId,
      );

      return result;
    }),

  /** List NINAuth consent sessions for the current user. */
  listNINAuthSessions: protectedProcedure
    .query(async ({ ctx }) => {
      return db
        .select()
        .from(ninAuthConsentSessions)
        .where(eq(ninAuthConsentSessions.userId, ctx.session?.user?.id ?? ""))
        .orderBy(desc(ninAuthConsentSessions.createdAt))
        .limit(20);
    }),

  /** List NIN face-match logs (Hub Operator only). */
  listNINFaceMatchLogs: hubOperatorProcedure
    .input(z.object({
      context:  z.string().optional(),
      limit:    z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ input }) => {
      const q = db.select().from(ninFaceMatchLogs).orderBy(desc(ninFaceMatchLogs.requestedAt)).limit(input.limit);
      return q;
    }),
'''

# Find the closing of the router and insert before it
old = '    }),\n});'
new = f'    }}),\n{ninauth_procedures}\n}});'

if old in content:
    content = content.replace(old, new, 1)  # replace last occurrence
    open('/home/ubuntu/nexthub/server/routers/nexthubIdentityDirectory.ts', 'w').write(content)
    print("OK: NINAuth tRPC procedures appended")
else:
    print("ERROR: closing pattern not found")
    print(repr(content[-200:]))
