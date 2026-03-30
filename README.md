# Sick and tired of filling the VTU Diary manually?

Same.

This extension is built to take the repetitive, annoying part of the VTU Internship Diary workflow off your hands. Instead of picking the date, opening the form, typing summaries, adding skills, and dealing with duplicate-entry pages over and over again, you prepare your entries once and let the extension run the loop.

## What This Extension Does

`VTU Internship Diary Automator` is a Chrome Extension (Manifest V3) that:

- reads internship diary entries from `data.json` or imported JSON
- validates the data before a run
- selects the internship and date on Page 1
- fills the mandatory diary form on Page 2
- saves each entry sequentially
- skips existing dates by default
- supports an optional overwrite mode for existing entries
- stores progress locally so the run can continue across redirects and reloads

## Best Way To Use It

The cleanest workflow is:

1. Ask GPT to generate diary entries in the exact format shown below
2. Open the extension popup
3. Use `Data Input`
4. Paste the JSON or upload a `.json` / `.txt` file
5. Let the extension auto-clean, auto-validate, and auto-activate it
6. Click `Start Automation`

If you prefer files, you can still edit [data.json](d:/Automise/data.json) directly and run from that.

## Input Sources

### Option 1: `data.json`

Edit [data.json](d:/Automise/data.json) directly inside the extension folder.

### Option 2: Popup `Data Input`

Paste GPT output into the popup or upload a `.json` / `.txt` file.

Important:

- imported data does **not** overwrite [data.json](d:/Automise/data.json)
- imported data is stored inside extension storage
- it remains active until you click `Use data.json`
- pasted GPT text is auto-cleaned before validation when possible

## Required JSON Format

Use this structure:

```json
[
  {
    "date": "2026-01-26",
    "workSummary": "Studied the internship project requirements, reviewed the current implementation, and planned the tasks for the next development milestone.",
    "learningOutcomes": "Learned how requirement analysis and task planning improve execution clarity and reduce rework during project development.",
    "hours": 3,
    "skills": ["Machine learning"]
  }
]
```

## Field Rules

- `date`: required, format `YYYY-MM-DD`
- `workSummary`: required
- `learningOutcomes`: required
- `hours`: optional, defaults to `3`
- `skills`: optional, defaults to `["Machine learning"]`

Multiple skills are supported as long as each value exists in the VTU skill list.

## GPT Prompt For JSON Output

Use this prompt if you want GPT to return ready-to-paste JSON:

```text
Generate VTU internship diary entries in strict JSON array format.

Return only valid JSON.
Do not wrap the answer in markdown.
Do not add explanations.

Use this exact schema for every object:
{
  "date": "YYYY-MM-DD",
  "workSummary": "string",
  "learningOutcomes": "string",
  "hours": 3,
  "skills": ["Machine learning"]
}

Rules:
- workSummary must sound like realistic internship work done that day
- learningOutcomes must be short, practical, and relevant
- date must always be in YYYY-MM-DD format
- use only allowed VTU skill labels from the provided skill list
- if unsure, use "Machine learning"
- return a JSON array only
```

## GPT Prompt For Plain Text File Output

If someone wants to save GPT output into a `.txt` file and upload that into the extension, use this:

```text
Generate VTU internship diary entries and return only valid raw JSON text.

Important:
- output must be plain JSON text only
- no markdown
- no triple backticks
- no heading
- no explanation

Schema:
[
  {
    "date": "YYYY-MM-DD",
    "workSummary": "string",
    "learningOutcomes": "string",
    "hours": 3,
    "skills": ["Machine learning"]
  }
]

Rules:
- use realistic internship language
- keep learningOutcomes concise
- use only skills from the allowed VTU skill list
- if uncertain, use "Machine learning"
```

Because the extension accepts `.txt` files, users can paste that JSON into a text file and upload it directly.

## Popup Controls

The popup is the launcher and status surface for the extension:

- `Validate`: checks the active source before you run anything
- `Data Input`: opens or hides the import drawer
- `Start Automation` / `Stop Automation`: starts or stops the VTU flow
- `Hide Panel` / `Show Panel`: controls the floating in-page panel on the VTU tab
- `Reset`: resets run progress and status, but does not delete imported JSON or change overwrite mode

Inside the data drawer:

- Paste JSON or upload a `.json` / `.txt` file
- `Use data.json`: switches back to the file in the extension folder
- `Overwrite Existing: On/Off`: bypasses skip mode and continues into the edit form, with confirmation before enabling

## Auto Validation

When you paste JSON or upload a `.json` / `.txt` file:

- the extension validates it automatically
- you can still press `Validate` manually before starting
- the extension tries to clean GPT-style pasted text automatically
- invalid skill labels are caught early
- missing fields are caught early
- malformed JSON is caught early
- valid imported data becomes the active source automatically

## Quick Test Matrix

Run these before trusting a long batch:

- `data.json` source, all new dates
- imported JSON source, all new dates
- mixed existing + new dates with overwrite `Off`
- mixed existing + new dates with overwrite `On`
- one invalid skill label
- one malformed JSON / GPT response with extra prose
- slow-tab check: switch away mid-run and confirm the extension pauses cleanly, then resumes when you return
- notification check: block browser notifications and confirm the run still finishes and updates status in the UI

What to capture if something fails:

- the current date shown in the popup or pinned panel
- whether the source is `Imported JSON` or `data.json`
- the current phase
- the last 10-20 `[VTU Automator]` console lines

## Existing Entry Behavior

### Default mode

If VTU opens an existing diary entry:

1. the extension treats it as already present
2. it clicks `Cancel`
3. returns to the diary entries list
4. clicks `Create`
5. continues with the next item

### Overwrite mode

If `Overwrite Existing` is enabled:

- the extension will not skip existing entries
- instead it continues into the edit form
- this mode requires explicit confirmation when turned on

## Current Automation Loop

The extension handles this sequence:

1. Open VTU diary page
2. Select internship
3. Pick the date
4. Click `Continue`
5. Fill Work Summary
6. Fill Hours
7. Fill Learnings / Outcomes
8. Select one or more skills
9. Click `Save`
10. Move to the next entry

## Allowed VTU Skill Labels

Use these exact labels for best results.

<details>
<summary>Open the full VTU skill list</summary>

```json
[
  "3D PRINTING CONCEPTS, DESIGN AND PRINTING",
  "Accounting",
  "Adobe Illustrator",
  "Adobe Indesign",
  "Adobe Photoshop",
  "Android Studio",
  "Angular",
  "AWS",
  "Azure",
  "BIM CONCEPTS WITH MEP AND PRODUCT DESIGN",
  "BIM FOR ARCHITECTURE",
  "BIM FOR CONSTRUCTION",
  "BIM FOR HIGHWAY ENGINEERING",
  "BIM FOR STRUCTURES",
  "Business Management",
  "Business operations and Strategy",
  "C++",
  "CakePHP",
  "Canva",
  "Cassandra",
  "Circuit Design",
  "Cloud access control",
  "CodeIgniter",
  "computer vision",
  "CSS",
  "D3.js",
  "Data encryption",
  "Data modeling",
  "Data visualization",
  "Database design",
  "Design with FPGA",
  "DevOps",
  "DHCP",
  "Digital Design",
  "Docker",
  "Economics",
  "Embedded Systems",
  "entrepreneurship",
  "Figma",
  "FilamentPHP",
  "Finance",
  "Firewall configuration",
  "Flutter",
  "Game design",
  "Game development",
  "Game engine",
  "Git",
  "Godot",
  "Google Cloud",
  "HTML",
  "Human Resource Management",
  "IaaS",
  "Indexing",
  "Intelligent Machines",
  "INTERIOR AND EXTERIOR DESIGN",
  "Inventory Management",
  "IoT",
  "Java",
  "JavaScript",
  "Keras",
  "Kotlin",
  "Kubernetes",
  "LAN",
  "Laravel",
  "Layout Design",
  "Machine learning",
  "Macro economics",
  "Management Information System",
  "Manufacturing",
  "Market Theory",
  "Marketing",
  "Matplotlib",
  "Micro economics",
  "MongoDB",
  "MySQL",
  "Natural language processing",
  "Network architecture",
  "Node.js",
  "NoSQL",
  "Numpy",
  "Objective-C",
  "Operations Management",
  "PaaS",
  "Pandas",
  "PHP",
  "Physical Design",
  "Planning & Control systems",
  "PostgreSQL",
  "Power BI",
  "PRODUCT DESIGN & 3D PRINTING",
  "PRODUCT DESIGN & MANUFACTURING",
  "Python",
  "PyTorch",
  "React",
  "React.js",
  "Risk management",
  "Ruby on Rails",
  "SaaS",
  "Sales & Marketing",
  "scikit-learn",
  "Seaborn",
  "SEO",
  "SQL",
  "Statistical analysis",
  "Statistics",
  "Swift",
  "Tableau",
  "TCP/IP",
  "TensorFlow",
  "TypeScript",
  "UI/UX",
  "UX design",
  "Verification & Validations",
  "VLSI Design",
  "VPNs",
  "Vue.js",
  "WAN",
  "WordPress",
  "Xamarin",
  "Xcode"
]
```

</details>

## Installation

1. Open `chrome://extensions/`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Select [d:/Automise](d:/Automise)

## File Map

- [manifest.json](d:/Automise/manifest.json): extension manifest
- [content.js](d:/Automise/content.js): main automation logic
- [utils.js](d:/Automise/utils.js): retry, wait, delay, selector helpers
- [storage.js](d:/Automise/storage.js): extension state
- [popup.html](d:/Automise/popup.html): popup UI
- [popup.js](d:/Automise/popup.js): popup actions
- [background.js](d:/Automise/background.js): completion notifications
- [skills.js](d:/Automise/skills.js): built-in VTU skill list for popup validation
- [data.json](d:/Automise/data.json): file-based entry source

## Review Notes

After reviewing the codebase, the main risks I found are:

1. Chrome tab throttling is still the biggest real-world reliability risk.
   DOM-heavy automations with custom date pickers and dropdowns are much more reliable when the VTU tab stays active.

2. The portal’s internship selector and page transitions are the shakiest parts of the flow.
   I already added retry logic and a reload recovery path, but this is still the area most likely to fail if VTU renders slowly or inconsistently.

3. Existing-entry handling has the most branching.
   Default skip mode, overwrite mode, list-page recovery, and edit-page recovery all work, but this is the part most worth stress-testing with mixed datasets.

4. Browser noise can still confuse debugging.
   Some console errors come from Chrome extensions or the VTU page itself, not from this extension. Focus on logs prefixed with `[VTU Automator]`.

## Recommended Bug Testing

If you want to pressure-test the extension, try these:

- a run where every date already exists
- a run where none of the dates exist
- a mixed run with both existing and new dates
- multiple skills per entry
- imported JSON instead of `data.json`
- overwrite mode on
- overwrite mode off
- one intentionally invalid skill
- one malformed JSON payload
- one slow-network run

## Troubleshooting

### The pinned panel is missing

The pinned panel only appears on `https://vtu.internyet.in/*`, not on `chrome://extensions`.

### Did imported JSON overwrite `data.json`?

No. Imported data stays inside extension storage until you switch back to [data.json](d:/Automise/data.json).

### What if the network is slow?

The extension waits for:

- supported page detection
- element rendering
- date picker readiness
- list-page readiness
- save completion

If the portal becomes too unstable, the run should stop safely instead of blindly continuing.

### Why do I still see random console errors?

Look specifically for:

```text
[VTU Automator]
```

Errors like injected scripts, other extension code, or site-internal warnings are often unrelated.

## Practical Advice

- reload the extension after code updates
- refresh the VTU tab once after reloading
- keep the VTU tab active for the most reliable runs
- avoid clicking the form during automation
- prefer exact skill labels
- test overwrite mode carefully
