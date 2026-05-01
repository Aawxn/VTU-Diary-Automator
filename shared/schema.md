# Shared Diary Entry Schema

This is the shared data contract for both:

- the browser extension
- the Python Playwright bot

Canonical shared file:

- `shared/data.json`

Extension runtime mirror:

- `extension/data.json`

## Supported Shapes

### 1. Plain array

```json
[
  {
    "date": "2026-01-26",
    "workSummary": "Worked on the internship dashboard flow.",
    "learningOutcomes": "Learned how to validate diary automation reliably.",
    "hours": 3,
    "skills": ["Machine learning"]
  }
]
```

### 2. One internship for the whole file

```json
{
  "internship": "Bharat Unnati AI Fellowship",
  "entries": [
    {
      "date": "2026-01-26",
      "workSummary": "Worked on the internship dashboard flow.",
      "learningOutcomes": "Learned how to validate diary automation reliably.",
      "hours": 3,
      "skills": ["Machine learning"]
    }
  ]
}
```

### 3. Internship per entry

```json
[
  {
    "internship": "Bharat Unnati AI Fellowship",
    "date": "2026-01-26",
    "workSummary": "Worked on the internship dashboard flow.",
    "learningOutcomes": "Learned how to validate diary automation reliably.",
    "hours": 3,
    "skills": ["Machine learning"]
  }
]
```

## Normalized Field Aliases

Work summary:

- `workSummary`
- `work_summary`
- `work`

Learning outcomes:

- `learningOutcomes`
- `learning_outcomes`
- `learning`

Internship:

- `internship`
- `internshipName`
- `internship_name`

## Defaults

- `hours`: `3`
- `skills`: `["Machine learning"]`

## Rules

- `date` is required and must be `YYYY-MM-DD`
- `workSummary` is required
- `learningOutcomes` is required
- `internship` is optional when only one VTU internship exists
- `internship` is recommended when multiple internships exist
- multiple skills are allowed
- skills should match VTU skill labels
