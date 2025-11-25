# Rollback Instructions

## Current State (Before UI Changes)
**Commit Hash:** `0b3e74e393fbca75cbbb41bff09878aa384aef5e`
**Branch:** `main`

## What Changed
Added CPU and Memory usage visualization to decoder nodes (GMSK, GFSK, LORA, AFSK, FSK, BPSK) in the performance dialog UI.

**Modified Files:**
- `frontend/src/components/performance/flow-node.jsx`

**Changes:**
1. Decoder nodes now display CPU and memory bars (like FFT processor)
2. Changed from 2-column to 5-column grid layout (Input | CPU/MEM | Output)
3. Node width increased from 280px to 380px for decoders

## How to Rollback

### Option 1: Tag the current state (RECOMMENDED - Do this before committing)
```bash
# Create a tag at current commit
git tag pre-decoder-metrics-ui

# Later, if you need to rollback:
git reset --hard pre-decoder-metrics-ui
git push --force origin main  # Only if needed on remote
```

### Option 2: Use the commit hash directly
```bash
# Rollback to the commit before changes
git reset --hard 0b3e74e393fbca75cbbb41bff09878aa384aef5e

# If you need to update remote (use with caution)
git push --force origin main
```

### Option 3: Revert (safer for shared branches)
```bash
# Find the commit hash of the bad commit
git log --oneline

# Revert it (creates a new commit that undoes changes)
git revert <bad-commit-hash>
git push origin main
```

### Option 4: Create a backup branch
```bash
# Before committing, create a backup branch
git branch backup-before-decoder-metrics

# Later, if needed:
git reset --hard backup-before-decoder-metrics
```

## Verification After Rollback
```bash
# Check you're at the right commit
git log -1 --oneline

# Verify the file state
git diff HEAD frontend/src/components/performance/flow-node.jsx

# Should show no differences if at correct state
```

## Deployment Rollback
If the changes are already deployed to production:

1. **Immediate:** Rollback using one of the methods above
2. **Build:** Rebuild the frontend
   ```bash
   cd frontend
   npm run build
   ```
3. **Deploy:** Redeploy the application
4. **Verify:** Check the performance dialog shows decoders without CPU/MEM bars

## Notes
- The backend decoder processes still report CPU/MEM stats; this only affects the UI display
- Rolling back only affects the frontend visualization, not the data collection
- Safe to rollback at any time without affecting decoder functionality
