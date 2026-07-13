content = open('/home/ubuntu/nexthub/server/routers/nexthubIdentityDirectory.ts').read()

# Remove the duplicate import block that was added twice
dup = '''\nimport {
  faceVerifyLogs, faceLivenessLogs, faceEnrollments, faceIdentifyLogs,
} from "../../drizzle/nexthub_schema";
import {
  verifyFaceViaMiddleware, checkFaceLivenessViaMiddleware,
  assessFaceQualityViaMiddleware, enrollFaceViaMiddleware,
  identifyFaceViaMiddleware, matchNameViaMiddleware,
} from "../middlewareBridge";'''

# Count occurrences
count = content.count(dup)
print(f"Found {count} occurrences of the duplicate import block")

if count == 2:
    # Remove the second occurrence only
    idx = content.find(dup)
    idx2 = content.find(dup, idx + 1)
    content = content[:idx2] + content[idx2 + len(dup):]
    print("Second occurrence removed")
elif count > 2:
    # Remove all but the first
    idx = content.find(dup)
    first_end = idx + len(dup)
    rest = content[first_end:]
    rest = rest.replace(dup, '')
    content = content[:first_end] + rest
    print("Extra occurrences removed")
else:
    print("No duplicate found — checking for partial match")
    # Try to find the duplicate without leading newline
    dup2 = '''import {
  faceVerifyLogs, faceLivenessLogs, faceEnrollments, faceIdentifyLogs,
} from "../../drizzle/nexthub_schema";
import {
  verifyFaceViaMiddleware, checkFaceLivenessViaMiddleware,
  assessFaceQualityViaMiddleware, enrollFaceViaMiddleware,
  identifyFaceViaMiddleware, matchNameViaMiddleware,
} from "../middlewareBridge";'''
    count2 = content.count(dup2)
    print(f"Without leading newline: {count2} occurrences")

open('/home/ubuntu/nexthub/server/routers/nexthubIdentityDirectory.ts', 'w').write(content)
print("file saved")
