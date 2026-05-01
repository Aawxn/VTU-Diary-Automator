# VTU Portal Notes

## Important Routes

- `student-diary`
  `https://vtu.internyet.in/dashboard/student/student-diary`
- `diary-entries`
  `https://vtu.internyet.in/dashboard/student/diary-entries`
- edit-existing entry
  URL contains `/edit-diary-entry/`

## Page Meanings

### `student-diary`

This is the internship/date step.

The automation must:

- select the correct internship
- select the correct diary date
- click `Continue`

### Create diary form

This is the form after `Continue`.

Mandatory fields:

- `Work Summary`
- `Hours worked`
- `Learnings / Outcomes`
- `Skills Used`

### `diary-entries`

This is the list page for existing diary entries.

It is used after save and after skipping existing entries.

### Edit-existing page

If VTU thinks a diary entry already exists for the selected date, it redirects here.

This page is used for:

- skipping existing entries
- overwrite flow when enabled

## Portal Behaviors

### Internship selector

- users may have one internship or multiple internships
- selection should be done by text, not only by first option

### Diary date

- VTU uses a custom date-picker UI
- direct input assignment may not always work
- calendar interaction is safer

### Skills

- `Skills Used` behaves like a custom React-select style combobox
- multiple skills are supported
- selection must wait for options to appear and commit

### Existing diary handling

- selecting a date can redirect directly to the edit-existing page
- this is not always an error
- it may mean the entry already exists
