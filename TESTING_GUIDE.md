# VTU Diary Bot - Testing Guide

## Quick Start Testing

### 1. Build the Executable

```batch
cd VTU-Diary-Automator\bot
build_exe.bat
```

The executable will be created at: `dist\VTU-Diary-Bot.exe`

---

## Test Scenarios

### Test 1: Slow Page Loading (Issue #1 & #2)

**Objective**: Verify bot doesn't enter reload loops on slow connections.

**Steps**:
1. Launch the bot executable
2. Load your diary data
3. Click "Run Bot"
4. Observe the login process

**Expected Behavior**:
- ✅ Bot waits for page to fully load before detecting page type
- ✅ No repeated reloads of the same page
- ✅ Login completes successfully even on slow connections
- ✅ Student diary page loads without loops

**Logs to Watch For**:
```
[HH:MM:SS] Opening VTU portal [url=...]
[HH:MM:SS] Waiting for page [expected=student-diary, diary-entries, form, edit-entry | timeout_ms=300000]
[HH:MM:SS] Page detected [page_type=student-diary | url=... | attempts=1]
```

---

### Test 2: Correct Date Selection (Issue #3)

**Objective**: Verify date picker selects the exact date from JSON.

**Test Data**: Create entries for different months
```json
[
  {"date": "2026-01-15", "workSummary": "...", "learningOutcomes": "...", "hours": 3},
  {"date": "2026-02-20", "workSummary": "...", "learningOutcomes": "...", "hours": 3},
  {"date": "2026-03-10", "workSummary": "...", "learningOutcomes": "...", "hours": 3}
]
```

**Steps**:
1. Load the test data
2. Run the bot
3. Watch the date selection process in the browser
4. Verify each entry is created on the correct date

**Expected Behavior**:
- ✅ January 15 entry is created on January 15 (not February 15)
- ✅ February 20 entry is created on February 20 (not March 20)
- ✅ March 10 entry is created on March 10 (not April 10)

**Logs to Watch For**:
```
[HH:MM:SS] Selecting date [iso_date=2026-01-15]
[HH:MM:SS] Date picker indexing [scheme=zero-based | month_input=1 | month_value=0 | year=2026 | day=15]
```

**Manual Verification**:
- After bot completes, log into VTU portal manually
- Check "Internship Diary Entries" page
- Verify all dates match your JSON exactly

---

### Test 3: Session Timeout Recovery (Issue #4)

**Objective**: Verify bot detects and recovers from session timeouts.

**Note**: This is harder to test as it requires the portal to kick you out. You can:

**Option A - Natural Testing**:
1. Run bot with many entries (20+)
2. Let it run for extended period
3. If session timeout occurs, observe recovery

**Option B - Simulated Testing**:
1. Run bot with a few entries
2. During execution, manually log out in another browser tab
3. Observe if bot detects and waits for re-auth

**Expected Behavior**:
- ✅ Bot detects session timeout
- ✅ Bot logs: "Session timeout detected"
- ✅ Bot waits for automatic re-authentication
- ✅ Bot logs: "Re-authentication detected, waiting for stabilization..."
- ✅ Bot continues processing entries after recovery
- ✅ No entries are skipped or lost

**Logs to Watch For**:
```
[HH:MM:SS] Session timeout detected before upload
[HH:MM:SS] Waiting for automatic re-authentication...
[HH:MM:SS] Re-authentication detected, waiting for stabilization...
[HH:MM:SS] Session re-authenticated successfully
[HH:MM:SS] Applying exponential backoff: 5s
```

---

### Test 4: Backward Compatibility

**Objective**: Verify existing configs and data work without modification.

**Steps**:
1. Use your existing `config.json` (no changes needed)
2. Use your existing `data.json` (no changes needed)
3. Run the bot
4. Verify everything works as before

**Expected Behavior**:
- ✅ No config changes required
- ✅ No data format changes required
- ✅ All existing features work
- ✅ UI wrapper works unchanged

---

## Automated Verification

Run the automated tests:

```batch
cd VTU-Diary-Automator\bot
.venv\Scripts\python.exe test_fixes.py
```

**Expected Output**:
```
============================================================
VTU Bot Stability Fixes - Verification Tests
============================================================
Testing config loading...
✓ Config loading works

Testing data loading...
✓ Data loading works (3 entries)

Testing session state...
✓ Session state tracking initialized

Testing new functions...
  ✓ log_with_context exists
  ✓ wait_for_page_stable exists
  ✓ wait_for_network_idle exists
  ✓ detect_session_state exists
  ✓ is_logged_in exists
  ✓ wait_for_reauth exists

Testing backward compatibility...
✓ Function signatures preserved

============================================================
Results: 5/5 tests passed
✓ All tests passed! The fixes are ready for testing.
============================================================
```

---

## Troubleshooting

### Issue: Bot still reloads pages
**Check**:
- Look for "Page stability timeout" in logs
- Verify network connection is stable
- Try increasing timeout in config (if needed)

### Issue: Wrong dates still selected
**Check**:
- Look for "Date picker indexing" log entry
- Verify the `scheme` detected (should be "zero-based" or "one-based")
- Check if `month_value` is correct for the scheme
- Report the log output if issue persists

### Issue: Session timeout not detected
**Check**:
- Verify you're actually getting kicked out (check browser)
- Look for "Session timeout detected" in logs
- Check if portal is doing automatic re-authentication

### Issue: Entries are missing
**Check**:
- Look for "pending retry" in logs
- Check if any entries show "failed" status
- Verify session timeout recovery worked
- Check final summary: "X saved, Y skipped, Z failed"

---

## Log Analysis

### Good Login Flow
```
[HH:MM:SS] Opening VTU portal [url=https://vtu.internyet.in/dashboard/student/student-diary]
[HH:MM:SS] Already logged in
```

### Manual Login Flow
```
[HH:MM:SS] Opening VTU portal [url=...]
[HH:MM:SS] Manual login required. Complete VTU login in the opened browser window.
[HH:MM:SS] Waiting for page [expected=student-diary, diary-entries, form, edit-entry | timeout_ms=300000]
[HH:MM:SS] Page detected [page_type=student-diary | url=... | attempts=1]
[HH:MM:SS] Login detected. Continuing automation.
```

### Successful Entry Upload
```
[HH:MM:SS] Uploading entry [date=2026-01-15]
[HH:MM:SS] Waiting for page [expected=student-diary | timeout_ms=25000]
[HH:MM:SS] Page detected [page_type=student-diary | url=... | attempts=1]
[HH:MM:SS] Selecting internship: [auto-detect if only one option]
[HH:MM:SS] Selecting date [iso_date=2026-01-15]
[HH:MM:SS] Date picker indexing [scheme=zero-based | month_input=1 | month_value=0 | year=2026 | day=15]
[HH:MM:SS] Found day button with data-day='1/15/2026'
[HH:MM:SS] Filling form for 2026-01-15
[HH:MM:SS] Selecting skill: Machine Learning
[HH:MM:SS] 2026-01-15 -> saved
```

### Session Timeout Recovery
```
[HH:MM:SS] Uploading entry [date=2026-01-20]
[HH:MM:SS] Session timeout detected before upload
[HH:MM:SS] Waiting for automatic re-authentication...
[HH:MM:SS] Re-authentication detected, waiting for stabilization...
[HH:MM:SS] Session re-authenticated successfully
[HH:MM:SS] Applying exponential backoff: 5s
[HH:MM:SS] Uploading entry [date=2026-01-20]
[HH:MM:SS] 2026-01-20 -> saved
```

---

## Success Criteria

Before considering testing complete, verify:

- [ ] Bot completes login without reload loops
- [ ] All dates are selected correctly (check VTU portal manually)
- [ ] Session timeout is detected and recovered (if it occurs)
- [ ] No entries are missing or skipped
- [ ] Bot works on slow network connections
- [ ] Existing configs and data work without changes
- [ ] UI wrapper works correctly
- [ ] Executable runs without errors

---

## Reporting Issues

If you find any issues, please provide:

1. **Full log output** from the bot
2. **Your data.json** (sample entries that failed)
3. **Your config.json** (remove sensitive info)
4. **Description** of what went wrong
5. **Expected vs Actual** behavior
6. **Screenshots** if applicable

---

**Happy Testing!** 🚀
