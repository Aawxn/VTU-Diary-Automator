import difflib
import json
import os
import sys
import threading
import time
from pathlib import Path

from playwright.sync_api import sync_playwright


def get_root_dir():
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[1]


def _get_appdata_dir() -> Path:
    """Per-user data folder: %APPDATA%\VTU-Diary-Bot\ (Windows) or ~/.VTU-Diary-Bot/"""
    base = Path(os.environ.get("APPDATA") or Path.home() / "AppData" / "Roaming")
    d = base / "VTU-Diary-Bot"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _resolve_shared_path(filename: str) -> Path:
    """Resolve a read-only bundled file from the shared/ folder.

    --onefile: all bundled files live in sys._MEIPASS (temp extract dir).
    Dev mode: shared/ lives at repo root.
    """
    if getattr(sys, "frozen", False):
        meipass = Path(getattr(sys, "_MEIPASS", str(get_root_dir())))
        return meipass / "shared" / filename
    return Path(__file__).resolve().parents[1] / "shared" / filename


_DEFAULT_CONFIG = {
    "targetInternship": "",
    "diaryUrl": "https://vtu.internyet.in/dashboard/student/student-diary",
    "defaultHours": 3,
    "headless": False,
    "slowMo": 200,
    "overwriteExisting": False,
    "browserChannel": "chrome",
}

ROOT_DIR = get_root_dir()
SHARED_DATA_PATH = _resolve_shared_path("data.json")
SHARED_SKILLS_PATH = _resolve_shared_path("skills.json")
# Frozen: config lives in %APPDATA% so one-file users never need to edit files.
# Dev: config lives next to main.py in bot/.
CONFIG_PATH = (_get_appdata_dir() / "config.json") if getattr(sys, "frozen", False) else (Path(__file__).resolve().parent / "config.json")

DEFAULTS = {
    "hours": "3",
    "skills": ["Machine learning"],
}

SKILL_ALIASES = {
    "ml": "machine learning",
    "machinelearning": "machine learning",
    "nlp": "natural language processing",
    "uiux": "ui/ux",
    "ux": "ux design",
    "cv": "computer vision",
    "js": "javascript",
    "ts": "typescript",
}

LOG_SINK = None
STOP_EVENT = threading.Event()


class BotStopped(Exception):
    pass


def set_log_sink(sink):
    global LOG_SINK
    LOG_SINK = sink


def request_stop():
    STOP_EVENT.set()


def clear_stop_request():
    STOP_EVENT.clear()


def ensure_not_stopped():
    if STOP_EVENT.is_set():
        raise BotStopped("Stop requested")


def log(message: str) -> None:
    timestamp = time.strftime("%H:%M:%S")
    line = f"[{timestamp}] {message}"
    print(line)
    if LOG_SINK:
        try:
            LOG_SINK(line)
        except Exception:
            pass


def load_json(path: Path):
    with path.open("r", encoding="utf-8-sig") as file:
        return json.load(file)


def load_allowed_skills():
    if SHARED_SKILLS_PATH.exists():
        skills = load_json(SHARED_SKILLS_PATH)
    else:
        skills = []
    normalized_map = {normalize_skill(skill): skill for skill in skills}
    return skills, normalized_map


def get_entries_payload_meta(payload):
    if isinstance(payload, list):
        default_internship = ""
        if payload:
            first = payload[0] or {}
            default_internship = (
                first.get("internship")
                or first.get("internshipName")
                or first.get("internship_name")
                or ""
            )
        return payload, default_internship

    if isinstance(payload, dict):
        entries = payload.get("entries") if "entries" in payload else payload.get("data")
        if isinstance(entries, list):
            return (
                entries,
                payload.get("internship")
                or payload.get("internshipName")
                or payload.get("internship_name")
                or "",
            )

    raise ValueError("shared/data.json must be an array or an object with an entries array")


def normalize_skill(skill: str) -> str:
    value = " ".join(str(skill or "").strip().lower().split())
    compact = "".join(character for character in value if character.isalnum() or character in "+.#/&")
    return SKILL_ALIASES.get(compact, value)


def normalize_text(value: str) -> str:
    return " ".join(str(value or "").strip().lower().split())


def canonicalize_skill(skill: str, allowed_map: dict[str, str]) -> str:
    normalized = normalize_skill(skill)
    if normalized in allowed_map:
        return allowed_map[normalized]

    suggestions = difflib.get_close_matches(normalized, list(allowed_map.keys()), n=1, cutoff=0.65)
    if suggestions:
        raise ValueError(f'Skill "{skill}" is not in the VTU list. Did you mean "{allowed_map[suggestions[0]]}"?')

    raise ValueError(f'Skill "{skill}" is not in the VTU list.')


def normalize_entries(payload, config: dict):
    _, allowed_map = load_allowed_skills()
    entries, default_internship = get_entries_payload_meta(payload)
    normalized_entries = []

    for index, entry in enumerate(entries, start=1):
        work_summary = entry.get("workSummary") or entry.get("work_summary") or entry.get("work")
        learning_outcomes = (
            entry.get("learningOutcomes")
            or entry.get("learning_outcomes")
            or entry.get("learning")
        )
        internship = (
            entry.get("internship")
            or entry.get("internshipName")
            or entry.get("internship_name")
            or default_internship
            or config.get("targetInternship", "")
        )
        requested_skills = (
            entry.get("skills")
            if isinstance(entry.get("skills"), list) and entry.get("skills")
            else DEFAULTS["skills"]
        )

        if not entry.get("date"):
            raise ValueError(f"Entry {index} is missing date")
        if not work_summary:
            raise ValueError(f"Entry {index} is missing workSummary")
        if not learning_outcomes:
            raise ValueError(f"Entry {index} is missing learningOutcomes")

        normalized_entries.append(
            {
                "date": str(entry["date"]),
                "workSummary": str(work_summary),
                "learningOutcomes": str(learning_outcomes),
                "hours": str(entry.get("hours", config.get("defaultHours", DEFAULTS["hours"]))),
                "skills": [canonicalize_skill(skill, allowed_map) for skill in requested_skills],
                "internship": str(internship).strip(),
            }
        )

    return normalized_entries


def load_entries(config: dict):
    payload = load_json(SHARED_DATA_PATH)
    return normalize_entries(payload, config)


def load_config():
    if not CONFIG_PATH.exists():
        if getattr(sys, "frozen", False):
            # First run: write defaults to %APPDATA% so users have a real file
            CONFIG_PATH.write_text(json.dumps(_DEFAULT_CONFIG, indent=2), encoding="utf-8")
            return dict(_DEFAULT_CONFIG)
        raise FileNotFoundError(f"Missing config file: {CONFIG_PATH}")
    config = load_json(CONFIG_PATH)
    for key, value in _DEFAULT_CONFIG.items():
        config.setdefault(key, value)
    return config


def retry(description, fn, attempts=3, delay=1.0):
    last_error = None
    for attempt in range(1, attempts + 1):
        ensure_not_stopped()
        try:
            return fn()
        except BotStopped:
            raise
        except Exception as error:
            last_error = error
            log(f"{description} failed ({attempt}/{attempts}): {error}")
            if attempt < attempts:
                deadline = time.time() + delay
                while time.time() < deadline:
                    ensure_not_stopped()
                    time.sleep(0.1)
    raise last_error


def detect_page(page):
    url = (page.url or "").lower()

    def heading_contains(text):
        try:
            return page.locator("h1, h2").filter(has_text=text).count() > 0
        except Exception:
            return False

    def selector_exists(selector):
        try:
            return page.locator(selector).count() > 0
        except Exception:
            return False

    if "/edit-diary-entry/" in url:
        return "edit-entry"

    if "/dashboard/student/diary-entries" in url:
        return "diary-entries"

    if "/dashboard/student/create-diary-entry" in url:
        return "form"

    if "/dashboard/student/student-diary" in url:
        if heading_contains("Create Internship Diary Entry") or selector_exists("textarea#description"):
            return "form"
        return "student-diary"

    if heading_contains("Edit Internship Diary Entry"):
        return "edit-entry"

    if heading_contains("Create Internship Diary Entry") or selector_exists("textarea#description"):
        return "form"

    if heading_contains("Internship Diary Entries") and (
        selector_exists("a[href*='/dashboard/student/student-diary']")
        or selector_exists("table")
    ):
        return "diary-entries"

    if heading_contains("Internship Diary") and (
        heading_contains("Select Internship & Date")
        or selector_exists("select[name*='intern' i], select[id*='intern' i], [role='combobox']")
    ):
        return "student-diary"

    if heading_contains("Select Internship & Date") or selector_exists(
        "select[name*='intern' i], select[id*='intern' i], input[placeholder*='Pick a Date' i]"
    ):
        return "student-diary"

    return "unknown"


def wait_for_page(page, expected_pages, timeout=15000):
    deadline = time.time() + (timeout / 1000)
    expected = set(expected_pages)
    last_seen = "unknown"
    last_url = ""
    while time.time() < deadline:
        ensure_not_stopped()
        last_url = page.url
        last_seen = detect_page(page)
        if last_seen in expected:
            return last_seen
        page.wait_for_timeout(250)
    raise TimeoutError(
        f"Timed out waiting for pages: {', '.join(expected_pages)} (last_seen={last_seen}, url={last_url})"
    )


def click_by_text(page, labels):
    for label in labels:
        button = page.get_by_role("button", name=label, exact=False)
        if button.count():
            button.first.click()
            return True
        link = page.get_by_role("link", name=label, exact=False)
        if link.count():
            link.first.click()
            return True
    return False


def click_cancel_action(page):
    if click_by_text(page, ["Cancel"]):
        return True

    fallback = find_first_locator(
        page,
        [
            "a[href*='/dashboard/student/diary-entries']",
            "button:has-text('Cancel')",
            "a:has-text('Cancel')",
        ],
    )
    if fallback:
        fallback.scroll_into_view_if_needed()
        fallback.click()
        return True

    return False


def find_first_locator(page, selectors):
    for selector in selectors:
        locator = page.locator(selector).first
        try:
            if locator.count():
                return locator
        except Exception:
            continue
    return None


def find_by_labels(page, labels):
    for label in labels:
        locator = page.get_by_label(label, exact=False).first
        try:
            if locator.count():
                return locator
        except Exception:
            continue
    return None


def set_control_value(locator, value):
    locator.scroll_into_view_if_needed()
    locator.click()
    locator.fill(str(value))
    locator.dispatch_event("input")
    locator.dispatch_event("change")
    locator.blur()


def selected_skill_labels(page):
    try:
        labels = page.locator(
            ".react-select__multi-value__label, [class*='multi-value__label']"
        ).all_inner_texts()
        return [normalize_skill(label) for label in labels if label.strip()]
    except Exception:
        return []


def is_skill_already_selected(page, skill):
    return normalize_skill(skill) in selected_skill_labels(page)


def wait_for_skill_commit(page, skill, previous_count=0, timeout=1800):
    target = normalize_skill(skill)
    deadline = time.time() + (timeout / 1000)
    while time.time() < deadline:
        ensure_not_stopped()
        labels = selected_skill_labels(page)
        if target in labels and len(labels) >= previous_count + 1:
            return True
        page.wait_for_timeout(120)
    return False


def build_preview_text(entries, config, source_label=None):
    internships = sorted({entry["internship"] for entry in entries if entry["internship"]})
    first_date = entries[0]["date"] if entries else "-"
    last_date = entries[-1]["date"] if entries else "-"
    source = source_label or str(SHARED_DATA_PATH.relative_to(ROOT_DIR))

    lines = [
        "=== VTU Bot Preview ===",
        f"Source file      : {source}",
        f"Total entries    : {len(entries)}",
        f"Date range       : {first_date} -> {last_date}",
        f"Overwrite mode   : {'ON' if config.get('overwriteExisting') else 'OFF'}",
        f"Config internship: {config.get('targetInternship') or '(not set)'}",
        "Internships used : "
        + (", ".join(internships) if internships else "(will require VTU to have only one internship option)"),
        "",
    ]
    for entry in entries:
        skill_preview = ", ".join(entry["skills"][:3])
        if len(entry["skills"]) > 3:
            skill_preview += f" (+{len(entry['skills']) - 3} more)"
        lines.append(
            f"- {entry['date']} | internship={entry['internship'] or '(unset)'} | hours={entry['hours']} | skills={skill_preview}"
        )
    return "\n".join(lines)


def print_preview(entries, config):
    print()
    print(build_preview_text(entries, config))
    print()


def confirm_run(entries, config):
    print_preview(entries, config)
    answer = input("Proceed with automation? [y/N]: ").strip().lower()
    if answer not in {"y", "yes"}:
        log("Run cancelled before automation started")
        return False
    return True


def login(page, config):
    diary_url = config["diaryUrl"]

    log("Opening VTU portal")
    page.goto(diary_url, wait_until="domcontentloaded")
    page.wait_for_timeout(1200)

    if detect_page(page) in {"student-diary", "diary-entries", "form", "edit-entry"}:
        log("Already logged in")
        return

    log("Manual login required. Complete VTU login in the opened browser window.")
    wait_for_page(page, ["student-diary", "diary-entries", "form", "edit-entry"], timeout=300000)
    page.wait_for_timeout(1000)
    log("Login detected. Continuing automation.")


def get_internship_select(page):
    locator = find_first_locator(
        page,
        [
            "select[name*='intern' i]",
            "select[id*='intern' i]",
            "select[aria-label*='intern' i]",
            "select",
        ],
    )
    if not locator:
        raise RuntimeError("Internship field not found")
    locator.wait_for(timeout=10000)
    return locator


def get_internship_options(select_locator):
    options = select_locator.locator("option").all()
    valid = []
    for option in options:
        value = option.get_attribute("value")
        label = " ".join((option.inner_text() or "").split())
        text = normalize_text(label)
        if value and text and "choose" not in text and "select" not in text and not option.is_disabled():
            valid.append({"value": value, "text": text, "label": label})
    return valid


def choose_internship_option(labels, prompt_fn=input):
    print()
    print("Multiple internships detected. Choose one for entries that do not specify internship:")
    for index, label in enumerate(labels, start=1):
        print(f"{index}. {label}")

    while True:
        answer = prompt_fn("Select internship number: ").strip()
        if answer.isdigit():
            choice = int(answer)
            if 1 <= choice <= len(labels):
                return labels[choice - 1]
        print("Invalid selection. Please enter a valid number.")


def pick_internship_option(options, internship_name):
    if not options:
        return None

    if internship_name:
        target = normalize_text(internship_name)
        for option in options:
            if target in option["text"] or option["text"] in target:
                return option
        return None

    if len(options) == 1:
        return options[0]

    raise RuntimeError(
        "Multiple internship options found. Set targetInternship in bot/config.json or internship per entry in shared/data.json"
    )


def resolve_entries_internship(page, entries, config, prompt_fn=input, chooser_callback=None):
    if all(entry["internship"] for entry in entries):
        return entries

    configured = (config.get("targetInternship") or "").strip()
    if configured:
        for entry in entries:
            if not entry["internship"]:
                entry["internship"] = configured
        return entries

    log("Resolving internship choice for entries without explicit internship")
    page.goto(config["diaryUrl"], wait_until="domcontentloaded")
    page.wait_for_timeout(1200)
    wait_for_page(page, ["student-diary"], timeout=20000)

    select_locator = get_internship_select(page)
    options = get_internship_options(select_locator)
    if not options:
        raise RuntimeError("No internship options found")

    if len(options) == 1:
        selected_label = options[0]["label"]
    else:
        labels = [option["label"] for option in options]
        if chooser_callback:
            selected_label = chooser_callback(labels)
        else:
            selected_label = choose_internship_option(labels, prompt_fn=prompt_fn)
        if not selected_label:
            raise RuntimeError("Internship selection was cancelled")

    log(f"Using internship for unspecified entries: {selected_label}")
    for entry in entries:
        if not entry["internship"]:
            entry["internship"] = selected_label
    return entries


def select_internship(page, internship_name):
    log(f"Selecting internship: {internship_name or '[auto-detect if only one option]'}")
    select_locator = get_internship_select(page)
    options = get_internship_options(select_locator)
    if not options:
        raise RuntimeError("No internship options found")

    selected_option = pick_internship_option(options, internship_name)
    if not selected_option:
        raise RuntimeError(f'Internship "{internship_name}" was not found')

    select_locator.select_option(value=selected_option["value"])
    page.wait_for_timeout(250)


def select_date(page, iso_date):
    log(f"Selecting date: {iso_date}")
    trigger = find_first_locator(
        page,
        [
            "input[placeholder*='Pick a Date' i]",
            "input[id*='date' i]",
            "input[name*='date' i]",
            "[aria-haspopup='dialog']",
        ],
    )
    if not trigger:
        raise RuntimeError("Date field not found")

    trigger.click()
    page.wait_for_timeout(300)

    month_value = str(int(iso_date[5:7]))
    day_value = str(int(iso_date[8:10]))
    year_value = iso_date[:4]

    month_select = page.locator(".rdp-root select").nth(0)
    year_select = page.locator(".rdp-root select").nth(1)
    if month_select.count():
        month_select.select_option(value=month_value)
    if year_select.count():
        year_select.select_option(value=year_value)
    page.wait_for_timeout(250)

    data_day_candidates = [
        f"{int(month_value)}/{int(day_value)}/{year_value}",
        f"{month_value}/{day_value}/{year_value}",
    ]
    for candidate in data_day_candidates:
        day_button = page.locator(f".rdp-root [data-day='{candidate}']").first
        if day_button.count():
            day_button.click()
            page.wait_for_timeout(250)
            return

    exact_day = page.locator(".rdp-root button").filter(has_text=day_value)
    if exact_day.count():
        exact_day.first.click()
        page.wait_for_timeout(250)
        return

    raise RuntimeError(f"Could not select date {iso_date}")


def find_work_summary_field(page):
    return find_by_labels(page, ["Work Summary", "Description"]) or find_first_locator(
        page,
        [
            "textarea#description",
            "textarea[name='description']",
            "textarea[placeholder*='Briefly describe the work you did today' i]",
        ],
    )


def find_hours_field(page):
    return find_by_labels(page, ["Hours worked", "Hours"]) or find_first_locator(
        page,
        [
            "input[placeholder*='e.g. 6.5' i]",
            "input[name*='hour' i]",
            "input[id*='hour' i]",
            "input[type='number']",
        ],
    )


def find_learning_field(page):
    return find_by_labels(page, ["Learnings / Outcomes", "Learnings", "Outcomes"]) or find_first_locator(
        page,
        [
            "textarea[placeholder*='What did you learn or ship today' i]",
            "textarea[name*='learning' i]",
            "textarea[id*='learning' i]",
            "textarea[name*='outcome' i]",
            "textarea[id*='outcome' i]",
        ],
    )


def wait_for_form_ready(page, timeout=12000):
    deadline = time.time() + (timeout / 1000)
    while time.time() < deadline:
        ensure_not_stopped()
        page_type = detect_page(page)
        if page_type in {"form", "edit-entry"}:
            work_field = find_work_summary_field(page)
            hours_field = find_hours_field(page)
            learning_field = find_learning_field(page)
            if work_field and hours_field and learning_field:
                return page_type
        page.wait_for_timeout(250)

    raise TimeoutError(
        f"Timed out waiting for form fields to become ready (page={detect_page(page)}, url={page.url})"
    )


def get_skill_input(page):
    return find_first_locator(
        page,
        [
            "input.react-select__input",
            "input[id^='react-select-'][id$='-input']",
            ".react-select__input-container input",
            "input[role='combobox'][aria-autocomplete='list']",
        ],
    )


def find_visible_skill_option(page, skill):
    target = normalize_skill(skill)
    selector_sets = [
        ".react-select__option",
        "[id*='react-select'][id*='option']",
        "[role='option']",
    ]
    for selector in selector_sets:
        options = page.locator(selector).all()
        for option in options:
            try:
                if not option.is_visible():
                    continue
                text = normalize_skill(option.inner_text())
                if target == text or target in text or text in target:
                    return option
            except Exception:
                continue
    return None


def select_single_skill(page, skill):
    skill_input = get_skill_input(page)
    if not skill_input:
        raise RuntimeError("Skills input not found")

    if is_skill_already_selected(page, skill):
        log(f"Skill already selected: {skill}")
        return

    previous_count = len(selected_skill_labels(page))

    skill_input.wait_for(timeout=10000)
    skill_input.click()
    skill_input.fill("")
    skill_input.type(skill, delay=35)
    page.wait_for_timeout(600)

    option = find_visible_skill_option(page, skill)
    if option:
        option.click()
        try:
            skill_input.dispatch_event("input")
            skill_input.dispatch_event("change")
        except Exception:
            pass
        if wait_for_skill_commit(page, skill, previous_count=previous_count):
            page.locator("body").click(position={"x": 5, "y": 5})
            page.wait_for_timeout(200)
            return

    skill_input.press("ArrowDown")
    page.wait_for_timeout(150)
    skill_input.press("Enter")

    if not wait_for_skill_commit(page, skill, previous_count=previous_count):
        raise RuntimeError(f'Skill "{skill}" was not selected')

    page.locator("body").click(position={"x": 5, "y": 5})
    page.wait_for_timeout(200)


def select_skills(page, skills):
    if not skills:
        return

    for skill in skills:
        log(f"Selecting skill: {skill}")
        retry(f"Skill {skill}", lambda: select_single_skill(page, skill), attempts=3, delay=0.6)

    page.locator("body").click(position={"x": 5, "y": 5})
    page.wait_for_timeout(250)


def collect_form_debug(page):
    invalid_labels = []
    for locator in page.locator("[aria-invalid='true'], [data-invalid='true']").all():
        try:
            if locator.is_visible():
                invalid_labels.append(
                    locator.get_attribute("name")
                    or locator.get_attribute("id")
                    or locator.evaluate("el => el.outerHTML.slice(0, 120)")
                )
        except Exception:
            continue

    visible_messages = []
    for locator in page.locator(".text-red-500, .text-destructive, [role='alert']").all():
        try:
            if locator.is_visible():
                text = locator.inner_text().strip()
                if text:
                    visible_messages.append(text)
        except Exception:
            continue

    return {
        "invalid": invalid_labels,
        "messages": visible_messages,
        "skills": selected_skill_labels(page),
    }


def wait_for_save_enabled(page, timeout=6000):
    button = page.get_by_role("button", name="Save", exact=False).first
    button.wait_for(timeout=10000)
    deadline = time.time() + (timeout / 1000)
    while time.time() < deadline:
        ensure_not_stopped()
        try:
            if not button.is_disabled():
                return button
        except Exception:
            pass
        page.wait_for_timeout(200)

    debug = collect_form_debug(page)
    raise RuntimeError(
        f"Save button is still disabled. skills={debug['skills']} invalid={debug['invalid']} messages={debug['messages']}"
    )


def fill_form(page, entry):
    log(f"Filling form for {entry['date']}")
    work_field = find_work_summary_field(page)
    hours_field = find_hours_field(page)
    learning_field = find_learning_field(page)

    if not work_field:
        raise RuntimeError("Work Summary field not found")
    if not hours_field:
        raise RuntimeError("Hours worked field not found")
    if not learning_field:
        raise RuntimeError("Learning Outcomes field not found")

    work_field.wait_for(timeout=10000)
    hours_field.wait_for(timeout=10000)
    learning_field.wait_for(timeout=10000)

    set_control_value(work_field, entry["workSummary"])
    page.wait_for_timeout(200)
    set_control_value(hours_field, entry["hours"])
    page.wait_for_timeout(200)
    set_control_value(learning_field, entry["learningOutcomes"])
    page.wait_for_timeout(250)

    select_skills(page, entry["skills"])


def recover_page_once(page, config, reason, entry_date):
    log(f"Recovery reload for {entry_date}: {reason}")
    page.goto(config["diaryUrl"], wait_until="domcontentloaded")
    page.wait_for_timeout(1200)
    wait_for_page(page, ["student-diary"], timeout=20000)


def upload_entry(page, entry, config):
    log(f"Uploading entry for {entry['date']}")
    page.goto(config["diaryUrl"], wait_until="domcontentloaded")
    page.wait_for_timeout(1200)
    wait_for_page(page, ["student-diary"], timeout=20000)

    try:
        select_internship(page, entry.get("internship") or config.get("targetInternship", ""))
    except Exception as error:
        recover_page_once(page, config, str(error), entry["date"])
        select_internship(page, entry.get("internship") or config.get("targetInternship", ""))

    try:
        select_date(page, entry["date"])
    except Exception as error:
        recover_page_once(page, config, str(error), entry["date"])
        select_internship(page, entry.get("internship") or config.get("targetInternship", ""))
        select_date(page, entry["date"])

    if not click_by_text(page, ["Continue", "Next", "Proceed"]):
        raise RuntimeError("Continue button not found")

    try:
        next_page = wait_for_page(page, ["form", "edit-entry"], timeout=15000)
    except Exception as error:
        recover_page_once(page, config, f"Continue transition failed: {error}", entry["date"])
        raise

    if next_page == "edit-entry" and not config.get("overwriteExisting", False):
        log(f"Entry already exists for {entry['date']}; skipping")
        if not click_cancel_action(page):
            raise RuntimeError("Cancel button not found on existing-entry page")
        wait_for_page(page, ["diary-entries", "student-diary"], timeout=15000)
        return "skipped"

    wait_for_form_ready(page, timeout=12000)
    fill_form(page, entry)

    save_button = wait_for_save_enabled(page)
    save_button.click()

    result_page = wait_for_page(page, ["diary-entries", "student-diary", "form", "edit-entry"], timeout=20000)
    if result_page in {"form", "edit-entry"}:
        raise RuntimeError("Save did not advance away from the diary form")

    page.wait_for_timeout(900)
    return "saved"


def run_bot(config_override=None, entries_override=None, require_confirmation=True, prompt_fn=input, chooser_callback=None):
    config = load_config()
    if config_override:
        config.update(config_override)

    entries = entries_override if entries_override is not None else load_entries(config)
    clear_stop_request()

    log(f"Loaded {len(entries)} entries from shared/data.json")
    if require_confirmation and not confirm_run(entries, config):
        return None

    results = {"saved": 0, "skipped": 0, "failed": 0}

    with sync_playwright() as playwright:
        browser_channel = config.get("browserChannel") or None
        log(f"Launching browser: {browser_channel or 'chromium'}")
        launch_kwargs = {
            "headless": bool(config.get("headless", False)),
            "slow_mo": int(config.get("slowMo", 0)),
        }
        if browser_channel:
            launch_kwargs["channel"] = browser_channel
        browser = playwright.chromium.launch(**launch_kwargs)
        context = browser.new_context()
        page = context.new_page()

        try:
            login(page, config)
            entries = resolve_entries_internship(page, entries, config, prompt_fn=prompt_fn, chooser_callback=chooser_callback)

            for entry in entries:
                ensure_not_stopped()
                try:
                    result = retry(
                        f"Entry {entry['date']}",
                        lambda: upload_entry(page, entry, config),
                        attempts=2,
                        delay=1.5,
                    )
                    log(f"{entry['date']} -> {result}")
                    results[result if result in results else "saved"] += 1
                except BotStopped:
                    log("Bot stopped by user")
                    break
                except Exception as error:
                    log(f"{entry['date']} failed: {error}")
                    results["failed"] += 1
                    continue
        finally:
            clear_stop_request()
            context.close()
            browser.close()
            log(f"Browser closed. Done: {results['saved']} saved, {results['skipped']} skipped, {results['failed']} failed.")

    return results


if __name__ == "__main__":
    try:
        run_bot()
    except KeyboardInterrupt:
        log("Stopped by user")
        sys.exit(1)
    except BotStopped:
        log("Stopped by user")
        sys.exit(1)
    except Exception as error:
        log(f"Fatal error: {error}")
        sys.exit(1)
