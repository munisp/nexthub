content = open('/home/ubuntu/nexthub/server/routers/nexthubIdentityDirectory.ts').read()

# 1. Add schema imports for face tables
old_import = 'import { dictAliases, identityLookups, biometricVerifications } from "../../drizzle/national_switch_schema";'
new_import = '''import { dictAliases, identityLookups, biometricVerifications } from "../../drizzle/national_switch_schema";
import {
  faceVerifyLogs, faceLivenessLogs, faceEnrollments, faceIdentifyLogs,
} from "../../drizzle/nexthub_schema";
import {
  verifyFaceViaMiddleware, checkFaceLivenessViaMiddleware,
  assessFaceQualityViaMiddleware, enrollFaceViaMiddleware,
  identifyFaceViaMiddleware, matchNameViaMiddleware,
} from "../middlewareBridge";'''
if old_import in content:
    content = content.replace(old_import, new_import)
    print("imports added")
else:
    print("ERROR: import pattern not found")

# 2. Add face-biometric procedures before the closing });
old_close = '      return result;\n    }),\n\n});'
new_close = '''      return result;
    }),

  // ─── Face Biometric ────────────────────────────────────────────────────────

  /** 1:1 face verification using ArcFace cosine similarity + optional liveness */
  faceVerify: protectedProcedure
    .input(z.object({
      probe_image_b64:     z.string().min(100),
      reference_image_b64: z.string().min(100),
      subject_id:          z.string().optional(),
      require_liveness:    z.boolean().default(true),
      require_quality:     z.boolean().default(true),
      min_quality_score:   z.number().min(0).max(1).default(0.50),
    }))
    .mutation(async ({ input }) => {
      const result = await verifyFaceViaMiddleware(input);
      if (!result) throw new Error("Face biometric service unavailable");
      await db.insert(faceVerifyLogs).values({
        subjectId:      input.subject_id ?? null,
        verified:       result.verified,
        similarity:     result.similarity,
        distance:       result.distance,
        threshold:      result.threshold,
        livenessPassed: result.liveness_passed ?? null,
        livenessScore:  result.liveness_score ?? null,
        qualityPassed:  result.quality_passed ?? null,
        qualityScore:   result.quality_metrics?.overall_score ?? null,
        faceCountProbe: result.face_count_probe,
        faceCountRef:   result.face_count_ref,
        imageHashProbe: result.image_hash_probe,
        processingMs:   result.processing_ms,
        cached:         result.cached,
      });
      return result;
    }),

  /** Passive liveness / anti-spoofing detection (Silent-Face ONNX model) */
  faceLiveness: protectedProcedure
    .input(z.object({
      image_b64:  z.string().min(100),
      subject_id: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await checkFaceLivenessViaMiddleware(input);
      if (!result) throw new Error("Face biometric service unavailable");
      await db.insert(faceLivenessLogs).values({
        subjectId:     input.subject_id ?? null,
        isLive:        result.is_live,
        spoofScore:    result.spoof_score,
        livenessScore: result.liveness_score,
        attackType:    result.attack_type ?? null,
        faceDetected:  result.face_detected,
        imageHash:     result.image_hash,
        processingMs:  result.processing_ms,
        cached:        result.cached,
      });
      return result;
    }),

  /** ISO 19794-5 face quality assessment */
  faceQuality: protectedProcedure
    .input(z.object({
      image_b64:  z.string().min(100),
      subject_id: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await assessFaceQualityViaMiddleware(input);
      if (!result) throw new Error("Face biometric service unavailable");
      return result;
    }),

  /** Enroll a face embedding for a subject (stores 512-d ArcFace vector in Redis) */
  faceEnroll: hubOperatorProcedure
    .input(z.object({
      image_b64:        z.string().min(100),
      subject_id:       z.string().min(1),
      require_liveness: z.boolean().default(true),
      require_quality:  z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const result = await enrollFaceViaMiddleware(input);
      if (!result) throw new Error("Face biometric service unavailable");
      if (result.enrolled) {
        await db.insert(faceEnrollments)
          .values({
            subjectId:      result.subject_id,
            embeddingDim:   result.embedding_dim,
            livenessPassed: result.liveness_passed ?? null,
            qualityPassed:  result.quality_passed ?? null,
            isActive:       true,
          })
          .onConflictDoUpdate({
            target: faceEnrollments.subjectId,
            set: {
              embeddingDim:   result.embedding_dim,
              livenessPassed: result.liveness_passed ?? null,
              qualityPassed:  result.quality_passed ?? null,
              isActive:       true,
              updatedAt:      new Date(),
            },
          });
      }
      return result;
    }),

  /** 1:N face identification against a set of enrolled subjects */
  faceIdentify: protectedProcedure
    .input(z.object({
      probe_image_b64:  z.string().min(100),
      candidate_ids:    z.array(z.string()).min(1).max(1000),
      require_liveness: z.boolean().default(true),
      top_k:            z.number().int().min(1).max(20).default(5),
    }))
    .mutation(async ({ input }) => {
      const result = await identifyFaceViaMiddleware(input);
      if (!result) throw new Error("Face biometric service unavailable");
      await db.insert(faceIdentifyLogs).values({
        identified:     result.identified,
        topMatchId:     result.top_match_id ?? null,
        topSimilarity:  result.top_similarity,
        candidateCount: input.candidate_ids.length,
        probeLiveness:  result.probe_liveness ?? null,
        processingMs:   result.processing_ms,
      });
      return result;
    }),

  /** Jaro-Winkler name match score (replaces old substring heuristic) */
  nameMatch: protectedProcedure
    .input(z.object({
      expected_first: z.string().optional(),
      expected_last:  z.string().optional(),
      actual_first:   z.string().optional(),
      actual_last:    z.string().optional(),
      expected_full:  z.string().optional(),
      actual_full:    z.string().optional(),
    }))
    .query(async ({ input }) => {
      const result = await matchNameViaMiddleware(input);
      if (!result) throw new Error("Face biometric service unavailable");
      return result;
    }),
});'''
if old_close in content:
    content = content.replace(old_close, new_close)
    print("tRPC procedures added")
else:
    print("ERROR: closing pattern not found")
    print(repr(content[-200:]))

open('/home/ubuntu/nexthub/server/routers/nexthubIdentityDirectory.ts', 'w').write(content)
print("file saved")
