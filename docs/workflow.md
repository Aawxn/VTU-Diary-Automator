# Shared Workflow

## Normal Create Flow

1. Start on `student-diary`
2. Select internship
3. Select date
4. Click `Continue`
5. Fill the diary form
6. Click `Save`
7. Continue with the next entry

## Existing Entry Flow

When the selected date already exists:

1. VTU redirects to the edit-existing page
2. If overwrite is off:
   - treat it as already done
   - skip that date
   - return to `diary-entries`
   - continue to the next entry
3. If overwrite is on:
   - continue into the edit form
   - update the entry

## Reliability Notes

- the extension is more reliable when the VTU tab stays active
- custom widgets like the date-picker and skills dropdown need careful waits
- slow redirects should be handled with retries, not blind sleeps
- internship selection should prefer exact or near text match over first option

## Shared Runtime Principles

- validate entries before starting a run
- keep failures isolated to the current entry where possible
- continue with the next entry after a recoverable failure
- log each major step clearly
