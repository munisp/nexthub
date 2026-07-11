"""
Fix all TypeScript errors from the latest compilation pass.
"""
import re

# ── 1. db.ts: pool → _pool (the geofence fix used 'pool' but var is '_pool') ──
with open('/home/ubuntu/nexthub/server/db.ts', 'r') as f:
    content = f.read()

# Replace standalone `pool.query` with `_pool.query` only in geofence functions
# The pattern is: after the null check we added, the variable is _pool
content = content.replace(
    'if (!_pool) throw new Error("Database pool unavailable");\n  await _pool.query(\n',
    'if (!_pool) throw new Error("Database pool unavailable");\n  await _pool.query(\n'
)
# Fix any remaining raw `pool` references that should be `_pool`
content = re.sub(r'\bpool\.query\b', '_pool!.query', content)
content = re.sub(r'\bpool\.end\(\)', '', content)

with open('/home/ubuntu/nexthub/server/db.ts', 'w') as f:
    f.write(content)
print("Fixed db.ts pool references")

# ── 2. integrationApi.ts: NQR endpoints were appended outside the router scope ──
with open('/home/ubuntu/nexthub/server/integrationApi.ts', 'r') as f:
    content = f.read()

# Remove the appended block that was placed outside the router scope
bad_block_start = '\n// ─── NQR Webhook (NIBSS pushes payment notifications here) ────────────────────'
bad_block_end = 'export default router'

if bad_block_start in content and bad_block_end in content:
    # Find the position of the bad block
    start_idx = content.rfind(bad_block_start)
    end_idx = content.rfind(bad_block_end)
    
    if start_idx < end_idx:
        # Extract the NQR endpoints code (between bad_block_start and bad_block_end)
        nqr_code = content[start_idx:end_idx]
        
        # Remove from its current position
        content = content[:start_idx] + content[end_idx:]
        
        # Find the correct insertion point — just before the last route in the router
        # Insert before `export default router`
        content = content.replace(
            'export default router',
            nqr_code + 'export default router'
        )
        # But now we need to make sure these are inside the router scope
        # Actually the issue is they reference `router` which is in scope
        # The real problem is they were appended AFTER `export default router`
        # Let me check the actual structure

print("Checked integrationApi.ts NQR block placement")

# Check if the NQR endpoints are now before export default router
with open('/home/ubuntu/nexthub/server/integrationApi.ts', 'r') as f:
    content = f.read()

lines = content.split('\n')
export_line = next((i for i, l in enumerate(lines) if 'export default router' in l), -1)
nqr_line = next((i for i, l in enumerate(lines) if 'NQR Webhook' in l), -1)
print(f"  export default router at line {export_line}, NQR block at line {nqr_line}")

# ── 3. nqrService.ts: null vs undefined and sweepExpiredNqrTransactions args ──
with open('/home/ubuntu/nexthub/server/nibss/nqrService.ts', 'r') as f:
    content = f.read()

# Fix null → undefined for optional fields
content = content.replace(
    'paidAmountKobo: paidAmountKobo | null',
    'paidAmountKobo?: number'
)
# Fix the null coalescing for the return value
content = re.sub(
    r'paidAmountKobo: ([a-zA-Z_]+)\s*\|\s*null,',
    lambda m: f'paidAmountKobo: {m.group(1)} ?? undefined,',
    content
)
content = re.sub(
    r'nibssSessionId: ([a-zA-Z_]+)\s*\|\s*null,',
    lambda m: f'nibssSessionId: {m.group(1)} ?? undefined,',
    content
)

# Fix sweepExpiredNqrTransactions — it takes 0 args, called with 1 arg in backgroundJobs
# Actually the error says "Expected 1 arguments, but got 2" — check the function signature
# Find the function definition
match = re.search(r'export async function sweepExpiredNqrTransactions\((.*?)\)', content)
if match:
    print(f"  sweepExpiredNqrTransactions signature: ({match.group(1)})")

with open('/home/ubuntu/nexthub/server/nibss/nqrService.ts', 'w') as f:
    f.write(content)
print("Fixed nqrService.ts null/undefined issues")
