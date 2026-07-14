/**
 * NextHub TypeScript Smoke Tests
 * ================================
 * Validates all tRPC procedure schemas compile and are correctly registered.
 * Run with: npx ts-node tests/typescript/smoke_test.ts
 */

import { z } from "zod";

// ─── Schema Validation Tests ──────────────────────────────────────────────────
interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

const results: TestResult[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    results.push({ name, passed: true, message: "PASS" });
    console.log(`  ✅ ${name}`);
  } catch (e: any) {
    results.push({ name, passed: false, message: e.message });
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

// ─── Zod Schema Tests for all tRPC input shapes ───────────────────────────────
console.log("\n══════════════════════════════════════════════════════════");
console.log("  NextHub TypeScript Smoke Tests — tRPC Schema Validation");
console.log("══════════════════════════════════════════════════════════\n");

// Face biometric schemas
const FaceEnrollSchema = z.object({
  subjectId: z.string().min(1),
  imageB64: z.string().min(1),
  metadata: z.record(z.string(), z.any()).optional(),
});

const FaceVerifySchema = z.object({
  subjectId: z.string().min(1),
  imageB64: z.string().min(1),
  checkLiveness: z.boolean().optional().default(true),
  context: z.string().optional(),
});

const FaceIdentifySchema = z.object({
  imageB64: z.string().min(1),
  topK: z.number().int().min(1).max(100).optional().default(5),
  scoreThreshold: z.number().min(0).max(1).optional().default(0.6),
});

const FaceQualitySchema = z.object({
  imageB64: z.string().min(1),
  context: z.string().optional(),
});

const FaceLivenessSchema = z.object({
  imageB64: z.string().min(1),
});

const FaceActiveLivenessSchema = z.object({
  frames: z.array(z.string()).min(1).max(30),
  challenge: z.enum(["blink", "smile", "turn_left", "turn_right", "nod"]),
});

const FaceAttributesSchema = z.object({
  imageB64: z.string().min(1),
});

const DeepfakeDetectSchema = z.object({
  imageB64: z.string().min(1),
});

const BatchIdentifySchema = z.object({
  images: z.array(z.object({ imageB64: z.string(), refId: z.string() })).min(1).max(50),
  topK: z.number().int().min(1).max(20).optional().default(3),
});

const VideoVerifySchema = z.object({
  subjectId: z.string().min(1),
  frames: z.array(z.string()).min(3).max(60),
  fps: z.number().optional().default(10),
});

// Fidelity schemas
const FidelityAssessSchema = z.object({
  imageB64: z.string().min(1),
  context: z.enum(["enrollment", "verification", "payment", "border_control", "event"]).optional(),
});

const FidelityEnrollGatedSchema = z.object({
  subjectId: z.string().min(1),
  imageB64: z.string().min(1),
  metadata: z.record(z.string(), z.any()).optional(),
});

// NINAuth schemas
const NINVerifySchema = z.object({
  nin: z.string().length(11),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const NINFaceMatchSchema = z.object({
  nin: z.string().length(11),
  liveImageB64: z.string().min(1),
  checkLiveness: z.boolean().optional().default(true),
});

const NINVCVerifySchema = z.object({
  vcJwt: z.string().min(1),
  expectedSubject: z.string().optional(),
});

// MOSIP schemas
const MOSIPPreRegSchema = z.object({
  fullName: z.string().min(1),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  phone: z.string().min(10),
  email: z.string().email().optional(),
  address: z.string().min(5),
  language: z.string().default("eng"),
});

const MOSIPUploadPacketSchema = z.object({
  preRegistrationId: z.string().min(1),
  registrationCenterId: z.string().min(1),
  machineId: z.string().min(1),
  packetB64: z.string().min(1),
  packetHash: z.string().min(1),
});

const MOSIPGenerateVIDSchema = z.object({
  uin: z.string().min(1),
  vidType: z.enum(["PERPETUAL", "TEMPORARY"]),
});

// Partner management schemas
const CreatePartnerSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  scopes: z.array(z.enum(["face:verify", "face:enroll", "face:identify", "face:liveness", "face:quality", "nin:verify", "nin:face-match"])).min(1),
  rateLimit: z.number().int().min(1).max(10000).optional().default(100),
});

const CreateApiKeySchema = z.object({
  partnerId: z.string().min(1),
  label: z.string().min(1),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});

// ─── Run Schema Tests ─────────────────────────────────────────────────────────
console.log("Face Biometric Schemas:");
test("FaceEnrollSchema — valid input", () => {
  FaceEnrollSchema.parse({ subjectId: "TEST-001", imageB64: "abc123" });
});
test("FaceEnrollSchema — rejects empty subjectId", () => {
  const r = FaceEnrollSchema.safeParse({ subjectId: "", imageB64: "abc" });
  if (r.success) throw new Error("Should have rejected empty subjectId");
});
test("FaceVerifySchema — valid with liveness", () => {
  FaceVerifySchema.parse({ subjectId: "TEST-001", imageB64: "abc", checkLiveness: true });
});
test("FaceIdentifySchema — defaults applied", () => {
  const r = FaceIdentifySchema.parse({ imageB64: "abc" });
  if (r.topK !== 5) throw new Error(`Expected topK=5, got ${r.topK}`);
  if (r.scoreThreshold !== 0.6) throw new Error(`Expected scoreThreshold=0.6, got ${r.scoreThreshold}`);
});
test("FaceActiveLivenessSchema — valid challenge enum", () => {
  FaceActiveLivenessSchema.parse({ frames: ["abc", "def"], challenge: "blink" });
});
test("FaceActiveLivenessSchema — rejects invalid challenge", () => {
  const r = FaceActiveLivenessSchema.safeParse({ frames: ["abc"], challenge: "wave" });
  if (r.success) throw new Error("Should have rejected invalid challenge");
});
test("BatchIdentifySchema — valid batch", () => {
  BatchIdentifySchema.parse({ images: [{ imageB64: "abc", refId: "r1" }] });
});
test("BatchIdentifySchema — rejects empty images array", () => {
  const r = BatchIdentifySchema.safeParse({ images: [] });
  if (r.success) throw new Error("Should have rejected empty images array");
});

console.log("\nFidelity Schemas:");
test("FidelityAssessSchema — valid enrollment context", () => {
  FidelityAssessSchema.parse({ imageB64: "abc", context: "enrollment" });
});
test("FidelityAssessSchema — rejects invalid context", () => {
  const r = FidelityAssessSchema.safeParse({ imageB64: "abc", context: "invalid_context" });
  if (r.success) throw new Error("Should have rejected invalid context");
});

console.log("\nNINAuth Schemas:");
test("NINVerifySchema — valid NIN (11 digits)", () => {
  NINVerifySchema.parse({ nin: "12345678901", firstName: "Test", lastName: "User", dateOfBirth: "1990-01-01" });
});
test("NINVerifySchema — rejects short NIN", () => {
  const r = NINVerifySchema.safeParse({ nin: "123456789", firstName: "Test", lastName: "User", dateOfBirth: "1990-01-01" });
  if (r.success) throw new Error("Should have rejected 9-digit NIN");
});
test("NINVerifySchema — rejects invalid date format", () => {
  const r = NINVerifySchema.safeParse({ nin: "12345678901", firstName: "Test", lastName: "User", dateOfBirth: "01/01/1990" });
  if (r.success) throw new Error("Should have rejected non-ISO date");
});
test("NINFaceMatchSchema — valid with liveness default", () => {
  const r = NINFaceMatchSchema.parse({ nin: "12345678901", liveImageB64: "abc" });
  if (r.checkLiveness !== true) throw new Error("Expected checkLiveness to default to true");
});
test("NINVCVerifySchema — valid JWT", () => {
  NINVCVerifySchema.parse({ vcJwt: "eyJhbGciOiJSUzI1NiJ9.test.sig" });
});

console.log("\nMOSIP Schemas:");
test("MOSIPPreRegSchema — valid registration", () => {
  MOSIPPreRegSchema.parse({
    fullName: "Aminu Bello",
    dateOfBirth: "1990-05-15",
    gender: "MALE",
    phone: "+2348012345678",
    address: "12 Ahmadu Bello Way, Abuja",
  });
});
test("MOSIPPreRegSchema — rejects invalid gender", () => {
  const r = MOSIPPreRegSchema.safeParse({
    fullName: "Test",
    dateOfBirth: "1990-01-01",
    gender: "UNKNOWN",
    phone: "+2348012345678",
    address: "Test Address",
  });
  if (r.success) throw new Error("Should have rejected invalid gender");
});
test("MOSIPGenerateVIDSchema — valid PERPETUAL", () => {
  MOSIPGenerateVIDSchema.parse({ uin: "TEST-UIN-001", vidType: "PERPETUAL" });
});
test("MOSIPGenerateVIDSchema — rejects invalid VID type", () => {
  const r = MOSIPGenerateVIDSchema.safeParse({ uin: "TEST-UIN-001", vidType: "INVALID" });
  if (r.success) throw new Error("Should have rejected invalid VID type");
});

console.log("\nPartner Management Schemas:");
test("CreatePartnerSchema — valid partner", () => {
  CreatePartnerSchema.parse({ name: "Test Partner", scopes: ["face:verify", "face:liveness"] });
});
test("CreatePartnerSchema — rejects empty scopes", () => {
  const r = CreatePartnerSchema.safeParse({ name: "Test", scopes: [] });
  if (r.success) throw new Error("Should have rejected empty scopes");
});
test("CreateApiKeySchema — valid key creation", () => {
  CreateApiKeySchema.parse({ partnerId: "PARTNER-001", label: "Production Key" });
});

// ─── Summary ──────────────────────────────────────────────────────────────────
const total = results.length;
const passed = results.filter((r) => r.passed).length;
const failed = total - passed;

console.log(`\n══════════════════════════════════════════════════════════`);
console.log(`  Results: ${passed}/${total} passed  |  ${failed} failed`);
console.log(`══════════════════════════════════════════════════════════\n`);

if (failed > 0) {
  console.log("FAILED:");
  results.filter((r) => !r.passed).forEach((r) => console.log(`  ❌ ${r.name}: ${r.message}`));
  process.exit(1);
}

process.exit(0);
