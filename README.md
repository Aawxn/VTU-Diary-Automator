# VTU Internship Diary Automator

Stop repeating the same VTU diary flow by hand.

This extension automates the VTU Internship Diary portal for students who already know what they want to submit and just want the browser to do the repetitive part safely.

It validates your entries, handles the VTU `student-diary` and `diary-entries` flow, skips existing diary dates by default, supports overwrite mode when you explicitly allow it, and keeps progress in local storage so the run can recover across redirects and reloads.

## Download

- Repository: [VTU-Diary-Automator](https://github.com/Aawxn/VTU-Diary-Automator)
- Direct download: [Download Release Package](https://github.com/Aawxn/VTU-Diary-Automator/releases/download/1.0.1-beta/Automise.rar)

## Before You Start

These are required:

1. Stay logged in to VTU
2. Open the main `student-diary` page before starting:
   `https://vtu.internyet.in/dashboard/student/student-diary`
3. Keep the VTU tab active for the most reliable run

Useful VTU routes:

- `student-diary`
  `https://vtu.internyet.in/dashboard/student/student-diary`
- `diary-entries`
  `https://vtu.internyet.in/dashboard/student/diary-entries`

## What It Does

`VTU Internship Diary Automator` is a Manifest V3 browser extension that:

- reads entries from `data.json` or imported JSON
- validates dates, required fields, and skills before running
- selects the internship and date on `student-diary`
- fills the required diary form after `Continue`
- saves entries one by one
- skips existing diary dates by default
- supports `Overwrite Existing` with confirmation
- stores progress locally
- shows status in both the popup and the pinned in-page control panel

## Installation In Chrome

Chrome does not offer a free normal public install path outside the Chrome Web Store, so the manual developer-mode flow is:

1. Open `chrome://extensions/`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Extract the ZIP if needed
5. Select the extracted extension folder: [d:/Automise](d:/Automise)
6. Pin the extension from the browser toolbar if you want quick access

Latest release package:

- [https://github.com/Aawxn/VTU-Diary-Automator/releases/download/1.0.1-beta/Automise.rar](https://github.com/Aawxn/VTU-Diary-Automator/releases/download/1.0.1-beta/Automise.rar)

After every code update:

1. Reload the extension in `chrome://extensions`
2. Refresh the VTU tab once

## Easier Launch For Friends

If you do not want the usual `chrome://extensions` + `Load unpacked` flow, there is a simpler option:

1. Download and extract the release package
2. Open the extracted folder
3. Double-click [launch-vtu-automator.bat](d:/Automise/launch-vtu-automator.bat)
4. It will open Edge or Chrome with:
   - the extension loaded from this folder
   - a separate local browser profile just for VTU Automator
   - the VTU `student-diary` page opened directly

What this launcher does:

- skips the manual developer-mode install steps every time
- keeps the extension isolated in its own browser profile
- opens the correct VTU start page automatically

Important:

- this is the easiest no-store option, but it is still not a real store install
- users must keep the extracted folder on their PC
- if the folder is moved or deleted, the launcher will stop working
- users still need to log in to VTU in that launcher browser profile

If the launcher cannot find Edge or Chrome, it will stop and show an error.

## Basic Workflow

The easiest workflow is:

1. Log in to VTU
2. Open `https://vtu.internyet.in/dashboard/student/student-diary`
3. Ask ChatGPT to generate internship diary entries in the required JSON format
4. Open the extension popup
5. Use `Data Input`
6. Paste the JSON or upload a `.json` / `.txt` file
7. Click `Validate`
8. Click `Start Automation`

If you prefer file-based input, you can edit [data.json](d:/Automise/data.json) directly and run from that instead.

If you launch with [launch-vtu-automator.bat](d:/Automise/launch-vtu-automator.bat), it will open the correct VTU start page automatically.

## Data Sources

The extension supports two sources:

### `data.json`

Edit [data.json](d:/Automise/data.json) directly.

### Imported JSON

Paste JSON into the popup drawer or upload a `.json` / `.txt` file.

Important:

- imported JSON does **not** overwrite [data.json](d:/Automise/data.json)
- imported JSON is stored in extension storage
- it stays active until you switch back using `Use data.json`

## Required JSON Format

Use this exact structure:

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

Multiple skills are supported, but every skill must match a valid VTU skill label.

## ChatGPT Prompt

Use this prompt when you want ChatGPT to generate entries for this extension.

```text
Generate VTU internship diary entries for the VTU Internship Diary Automator extension.

Return only valid JSON.
Do not use markdown.
Do not add explanations.
Do not add headings.
Do not wrap the response in code fences.

Output schema:
[
  {
    "date": "YYYY-MM-DD",
    "workSummary": "string",
    "learningOutcomes": "string",
    "hours": 3,
    "skills": ["Exact VTU skill label"]
  }
]

Rules:
- workSummary should sound like realistic internship work done that day
- learningOutcomes should be concise, practical, and relevant
- date must be in YYYY-MM-DD format
- hours should normally be 3 unless explicitly changed
- use only exact skill labels from the allowed VTU skill list below
- if uncertain, choose the closest valid skill label instead of inventing a new one
- return a JSON array only

Allowed VTU skill list:
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

## Popup Buttons

### Main popup

- `Validate`
  Validates the active source before a run.

- `Data Input`
  Opens or hides the import drawer.

- `Start Automation` / `Stop Automation`
  Starts or stops the VTU automation on the active VTU tab.

- `Show Panel` / `Hide Panel`
  Shows or hides the floating in-page control panel on the VTU site.

- `Reset`
  Resets current run progress and stops automation.

What `Reset` does:

- resets run index to `0`
- resets status/progress
- stops automation

What `Reset` does **not** do:

- does not overwrite [data.json](d:/Automise/data.json)
- does not delete imported JSON
- does not silently disable overwrite mode

### Data drawer

- paste JSON directly into the textarea
- upload a `.json` or `.txt` file
- `Use data.json`
  Switches back to file-based data
- `Overwrite Existing: On/Off`
  Enables editing existing diary entries instead of skipping them

## Floating Panel Buttons

The pinned panel is the in-page controller shown on the VTU website itself.

- `Validate`
  Validates the current active source

- `Start Automation` / `Stop Automation`
  Starts or stops the run

- `Reset`
  Resets run progress

- `-`
  Collapses the panel

- `x`
  Hides the panel

- drag handle
  Lets you move the panel around the page

## Existing Entry Behavior

### Default mode

If VTU opens an already existing diary entry:

1. the extension treats it as already present
2. clicks `Cancel`
3. returns to `diary-entries`
4. clicks `Create`
5. continues with the next item

### Overwrite mode

If `Overwrite Existing` is enabled:

- the extension does not skip the existing entry
- it continues into the edit form instead
- the toggle asks for confirmation before enabling

## How The Automation Works

For each entry:

1. start on `student-diary`
2. select internship
3. set the date
4. click `Continue`
5. fill work summary
6. fill hours
7. fill learning outcomes
8. select skills
9. click `Save`
10. move to the next entry

## Debugging

If something goes wrong, debug in this order.

### 1. Reload cleanly

1. Open `chrome://extensions/`
2. Click `Reload` on the extension
3. Refresh the VTU tab once

### 2. Open the VTU page console

1. Go to the VTU tab
2. Make sure you are on `student-diary` or `diary-entries`
3. Press `F12`
4. Open `Console`
5. Filter for:

```text
[VTU Automator]
```

Ignore most unrelated browser/site noise unless it clearly references this extension.

### 3. Check the current UI state

Capture:

- current date shown in the popup or pinned panel
- current phase
- active source: `Imported JSON` or `data.json`
- overwrite state: `On` or `Off`

### 4. Use this bug test matrix

- `data.json` source, all new dates
- imported JSON source, all new dates
- mixed existing + new dates with overwrite `Off`
- mixed existing + new dates with overwrite `On`
- one invalid skill label
- one malformed JSON / GPT response with extra prose
- tab hidden mid-run
- slow network
- notifications blocked

### 5. What to send when reporting a failure

Send:

- the dataset source you used
- whether overwrite mode was on
- the last 10-20 `[VTU Automator]` console lines
- a screenshot of the current VTU page if possible

## Troubleshooting

### The pinned panel is missing

It only appears on:

```text
https://vtu.internyet.in/*
```

It will not appear on `chrome://extensions`, and automation should be started from the main `student-diary` page.

### Imported JSON did not overwrite `data.json`

That is expected.

Imported JSON stays in extension storage until you click `Use data.json`.

### Why does the extension care about the active tab?

VTU uses custom date pickers and dropdowns. Browser tab throttling can make those controls unreliable in the background. The extension now pauses more safely when the VTU tab is hidden, but keeping the tab active is still best.

### What if the network is slow?

The extension uses waits, retries, DOM checks, and recovery reloads. Slow pages should usually still work unless the portal becomes too inconsistent or exceeds timeout limits.

## File Map

- [manifest.json](d:/Automise/manifest.json): extension manifest
- [content.js](d:/Automise/content.js): main VTU automation logic
- [utils.js](d:/Automise/utils.js): wait/retry/delay helpers
- [storage.js](d:/Automise/storage.js): local extension state
- [popup.html](d:/Automise/popup.html): popup UI
- [popup.js](d:/Automise/popup.js): popup behavior
- [background.js](d:/Automise/background.js): completion notifications
- [skills.js](d:/Automise/skills.js): built-in VTU skill list
- [data.json](d:/Automise/data.json): file-based data source

## Practical Advice

- validate before long runs
- prefer exact skill labels
- test overwrite mode carefully
- keep the VTU tab active for the most reliable results
- do not click around the VTU form while automation is running
