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

# Session state tracking for timeout detection and recovery
_session_state = {
    "last_auth_check": 0,  # timestamp
    "consecutive_timeouts": 0,  # counter for exponential backoff
    "pending_retry_entry": None,  # entry that needs retry after reauth
}


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


def log_with_context(message: str, context: dict = None) -> None:
    """Log message with structured context data for better debugging."""
    if context:
        context_str = " | ".join(f"{k}={v}" for k, v in context.items() if v is not None)
        log(f"{message} [{context_str}]")
    else:
        log(message)


def wait_for_page_stable(page, stability_duration_ms=500, timeout_ms=10000):
    """
    Wait until the page DOM is stable (no major changes) for the specified duration.
    
    Args:
        page: Playwright page object
        stability_duration_ms: How long the page must be stable (default 500ms)
        timeout_ms: Maximum time to wait (default 10 seconds)
    
    Raises:
        TimeoutError: If page doesn't stabilize within timeout
    """
    deadline = time.time() + (timeout_ms / 1000)
    last_change = time.time()
    last_url = ""
    
    while time.time() < deadline:
        ensure_not_stopped()
        current_url = page.url or ""
        
        # Check if URL changed (indicates navigation)
        if current_url != last_url:
            last_url = current_url
            last_change = time.time()
        
        # Check if we've been stable long enough
        stable_duration = (time.time() - last_change) * 1000
        if stable_duration >= stability_duration_ms:
            return
        
        page.wait_for_timeout(100)
    
    raise TimeoutError(f"Page did not stabilize within {timeout_ms}ms")


def wait_for_network_idle(page, timeout_ms=30000):
    """
    Wait until network activity ceases (no requests for 500ms).
    
    Args:
        page: Playwright page object
        timeout_ms: Maximum time to wait (default 30 seconds)
    
    Raises:
        TimeoutError: If network doesn't idle within timeout
    """
    try:
        page.wait_for_load_state("networkidle", timeout=timeout_ms)
    except Exception as error:
        log(f"Network idle wait timed out: {error}")
        # Don't raise - continue anyway as page might be usable


def detect_session_state(page):
    """
    Determine current session authentication state.
    
    Args:
        page: Playwright page object
    
    Returns:
        One of: "authenticated", "logged_out", "unknown"
    """
    try:
        url = (page.url or "").lower()
        
        # Check for login/signin patterns in URL
        if any(pattern in url for pattern in ["/login", "/signin", "/auth", "/sign-in"]):
            return "logged_out"
        
        # Check for authenticated page patterns
        if any(pattern in url for pattern in ["/dashboard", "/student", "/diary"]):
            # Verify we're not on a login page with these keywords
            try:
                # Check for login form elements
                if page.locator("input[type='password']").count() > 0:
                    return "logged_out"
                # Check for authenticated elements
                if page.locator("a[href*='logout' i], button:has-text('Logout')").count() > 0:
                    return "authenticated"
                # If we see diary-related elements, we're authenticated
                if page.locator("select[name*='intern' i], textarea#description").count() > 0:
                    return "authenticated"
            except Exception:
                pass
            
            return "authenticated"
        
        return "unknown"
    except Exception as error:
        log(f"Session state detection error: {error}")
        return "unknown"


def is_logged_in(page):
    """Quick check if currently authenticated."""
    return detect_session_state(page) == "authenticated"


def wait_for_reauth(page, timeout_ms=120000):
    """
    Wait for automatic re-authentication to complete.
    
    Args:
        page: Playwright page object
        timeout_ms: Maximum time to wait (default 2 minutes)
    
    Returns:
        True if re-authentication succeeded, False if timeout
    """
    log("Waiting for automatic re-authentication...")
    deadline = time.time() + (timeout_ms / 1000)
    check_interval = 2.0  # Check every 2 seconds
    
    while time.time() < deadline:
        ensure_not_stopped()
        state = detect_session_state(page)
        
        if state == "authenticated":
            log("Re-authentication detected, waiting for stabilization...")
            page.wait_for_timeout(3000)  # Wait 3 seconds for session to stabilize
            log("Session re-authenticated successfully")
            return True
        
        remaining = deadline - time.time()
        if remaining > 0:
            wait_time = min(check_interval, remaining)
            page.wait_for_timeout(int(wait_time * 1000))
    
    log("Re-authentication timeout - session did not recover")
    return False


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


def detect_page(page, require_interactive=False):
    """
    Enhanced page detection with stability checks and error handling.
    
    Args:
        page: Playwright page object
        require_interactive: If True, verify controls are interactive
    
    Returns:
        Page type string or "unknown" if detection fails
    """
    try:
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
        
        def is_interactive(selector):
            """Check if element is interactive (visible and enabled)."""
            try:
                locator = page.locator(selector).first
                if locator.count() == 0:
                    return False
                return locator.is_visible() and locator.is_enabled()
            except Exception:
                return False

        # URL-based detection (most reliable)
        if "/edit-diary-entry/" in url:
            return "edit-entry"

        if "/dashboard/student/diary-entries" in url:
            return "diary-entries"

        if "/dashboard/student/create-diary-entry" in url:
            return "form"

        if "/dashboard/student/student-diary" in url:
            # Check if we're on the form page (has textarea)
            if heading_contains("Create Internship Diary Entry") or selector_exists("textarea#description"):
                return "form"
            
            # Debug logging for student-diary detection
            log(f"DEBUG detect_page: url={url}, require_interactive={require_interactive}")
            has_intern_select = selector_exists("select[name*='intern' i]") or selector_exists("select[id*='intern' i]")
            has_date_input = selector_exists("input[placeholder*='Pick a Date' i]") or selector_exists("input[id*='date' i]")
            log(f"DEBUG: intern_select_exists={has_intern_select}, date_input_exists={has_date_input}")
            
            # If require_interactive, verify controls are ready
            if require_interactive:
                intern_interactive = is_interactive("select[name*='intern' i]") or is_interactive("select[id*='intern' i]")
                date_interactive = is_interactive("input[placeholder*='Pick a Date' i]") or is_interactive("input[id*='date' i]")
                log(f"DEBUG: intern_interactive={intern_interactive}, date_interactive={date_interactive}")
                
                if not intern_interactive:
                    log("DEBUG: Internship control not interactive, waiting...")
                    page.wait_for_timeout(2000)
                    # Try again after wait
                    intern_interactive = is_interactive("select[name*='intern' i]") or is_interactive("select[id*='intern' i]")
                    log(f"DEBUG: After wait, intern_interactive={intern_interactive}")
                    
                    if not intern_interactive:
                        # URL matches but controls not ready - trust the URL
                        log("DEBUG: Controls not interactive but URL matches - returning student-diary")
                        return "student-diary"
                
                if not date_interactive:
                    log("DEBUG: Date control not interactive but URL matches - returning student-diary")
                    return "student-diary"
            
            return "student-diary"

        # Content-based detection (fallback)
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
            if require_interactive:
                if not is_interactive("select[name*='intern' i], select[id*='intern' i]"):
                    # Give it more time
                    page.wait_for_timeout(2000)
                    if not is_interactive("select[name*='intern' i], select[id*='intern' i]"):
                        return "unknown"
            return "student-diary"

        if heading_contains("Select Internship & Date") or selector_exists(
            "select[name*='intern' i], select[id*='intern' i], input[placeholder*='Pick a Date' i]"
        ):
            if require_interactive:
                if not is_interactive("select[name*='intern' i], select[id*='intern' i]"):
                    # Give it more time
                    page.wait_for_timeout(2000)
                    if not is_interactive("select[name*='intern' i], select[id*='intern' i]"):
                        return "unknown"
            return "student-diary"

        return "unknown"
    except Exception as error:
        log(f"Page detection error: {error}")
        return "unknown"


def wait_for_page(page, expected_pages, timeout=15000, check_interval=250, require_stability=False):
    """
    Enhanced wait for page with stability checking and better logging.
    
    Args:
        page: Playwright page object
        expected_pages: List of acceptable page types
        timeout: Maximum wait time in milliseconds
        check_interval: How often to check page type (milliseconds)
        require_stability: Whether to wait for DOM stability before detection
    
    Returns:
        The detected page type
    
    Raises:
        TimeoutError: If expected page not reached within timeout
    """
    deadline = time.time() + (timeout / 1000)
    expected = set(expected_pages)
    last_seen = "unknown"
    last_url = ""
    attempt_count = 0
    
    log_with_context("Waiting for page", {
        "expected": ", ".join(expected_pages),
        "timeout_ms": timeout
    })
    
    while time.time() < deadline:
        ensure_not_stopped()
        attempt_count += 1
        last_url = page.url
        
        # Wait for stability if required
        if require_stability and attempt_count == 1:
            try:
                wait_for_page_stable(page, stability_duration_ms=500, timeout_ms=5000)
            except TimeoutError:
                log("Page stability timeout, continuing anyway")
        
        # Detect page type
        last_seen = detect_page(page, require_interactive=require_stability)
        
        if last_seen in expected:
            log_with_context("Page detected", {
                "page_type": last_seen,
                "url": last_url,
                "attempts": attempt_count
            })
            return last_seen
        
        # Log slow page loads
        elapsed = (time.time() - (deadline - timeout / 1000)) * 1000
        if elapsed > 10000 and attempt_count % 20 == 0:  # Log every 5 seconds after 10s
            remaining = (deadline - time.time()) * 1000
            log_with_context("Still waiting for page", {
                "elapsed_ms": int(elapsed),
                "remaining_ms": int(remaining),
                "last_seen": last_seen
            })
        
        page.wait_for_timeout(check_interval)
    
    # Timeout occurred
    log_with_context("Page wait timeout", {
        "expected": ", ".join(expected_pages),
        "last_seen": last_seen,
        "url": last_url,
        "timeout_ms": timeout
    })
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

    log_with_context("Opening VTU portal", {"url": diary_url})
    
    # Use networkidle for better page load detection
    try:
        page.goto(diary_url, wait_until="networkidle", timeout=30000)
    except Exception as error:
        log(f"Network idle timeout during goto, continuing: {error}")
        page.goto(diary_url, wait_until="domcontentloaded", timeout=30000)
    
    # Wait longer for initial page load
    page.wait_for_timeout(3000)
    
    # Wait for page stability before detecting
    try:
        wait_for_page_stable(page, stability_duration_ms=500, timeout_ms=5000)
    except TimeoutError:
        log("Initial page stability timeout, continuing")
    
    # Check if already logged in with retry logic
    for attempt in range(1, 4):
        page_type = detect_page(page)
        if page_type in {"student-diary", "diary-entries", "form", "edit-entry"}:
            log("Already logged in")
            return
        if page_type != "unknown":
            break
        if attempt < 3:
            log(f"Page detection attempt {attempt} returned unknown, retrying...")
            page.wait_for_timeout(2000)

    log("Manual login required. Complete VTU login in the opened browser window.")
    
    # Use longer check intervals during manual login (2 seconds instead of 250ms)
    wait_for_page(
        page, 
        ["student-diary", "diary-entries", "form", "edit-entry"], 
        timeout=300000,
        check_interval=2000,
        require_stability=False
    )
    
    # Wait for post-login stabilization
    page.wait_for_timeout(2000)
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
        
        # Try exact match first
        for option in options:
            if target == option["text"]:
                return option
        
        # Try substring match (both directions)
        for option in options:
            if target in option["text"] or option["text"] in target:
                return option
        
        # Try fuzzy match - check if significant words match
        target_words = set(target.split())
        best_match = None
        best_score = 0
        
        for option in options:
            option_words = set(option["text"].split())
            # Count matching words
            matching_words = target_words & option_words
            score = len(matching_words)
            
            # If we have at least 3 matching words, consider it
            if score >= 3 and score > best_score:
                best_score = score
                best_match = option
        
        if best_match:
            return best_match
        
        return None

    if len(options) == 1:
        return options[0]

    raise RuntimeError(
        "Multiple internship options found. Set targetInternship in bot/config.json or internship per entry in shared/data.json"
    )


def resolve_entries_internship(page, entries, config, prompt_fn=input, chooser_callback=None):
    if all(entry["internship"] for entry in entries):
        log("All entries have internship specified, skipping resolution")
        return entries

    configured = (config.get("targetInternship") or "").strip()
    if configured:
        log(f"Using configured internship: {configured}")
        for entry in entries:
            if not entry["internship"]:
                entry["internship"] = configured
        return entries

    log("Resolving internship choice for entries without explicit internship")
    
    # Use enhanced navigation with better timeouts
    try:
        page.goto(config["diaryUrl"], wait_until="networkidle", timeout=30000)
    except Exception:
        page.goto(config["diaryUrl"], wait_until="domcontentloaded", timeout=30000)
    
    page.wait_for_timeout(2000)
    wait_for_page(page, ["student-diary"], timeout=25000, require_stability=True)

    select_locator = get_internship_select(page)
    options = get_internship_options(select_locator)
    if not options:
        raise RuntimeError("No internship options found")

    if len(options) == 1:
        selected_label = options[0]["label"]
        log(f"Only one internship option found: {selected_label}")
    else:
        labels = [option["label"] for option in options]
        log(f"Multiple internship options found: {len(labels)}")
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
    
    # Debug: Log available options
    log(f"DEBUG: Found {len(options)} internship options:")
    for idx, opt in enumerate(options, 1):
        log(f"DEBUG:   {idx}. label='{opt['label']}' | text='{opt['text']}'")

    selected_option = pick_internship_option(options, internship_name)
    if not selected_option:
        log(f"DEBUG: Failed to match internship. Target normalized: '{normalize_text(internship_name)}'")
        raise RuntimeError(f'Internship "{internship_name}" was not found')

    log(f"DEBUG: Selected option: label='{selected_option['label']}' | value='{selected_option['value']}'")
    select_locator.select_option(value=selected_option["value"])
    page.wait_for_timeout(250)


def select_date(page, iso_date):
    """
    Select date in the date picker with auto-detection of month indexing.
    Enhanced version with robust fallback logic.
    """
    log_with_context("Selecting date", {"iso_date": iso_date})
    
    # Parse ISO date
    year_value = iso_date[:4]
    month_num = int(iso_date[5:7])  # 1-12
    day_value = str(int(iso_date[8:10]))
    
    # Find and click date picker trigger
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

    # Detect month indexing scheme
    month_select = page.locator(".rdp-root select").nth(0)
    year_select = page.locator(".rdp-root select").nth(1)
    
    indexing_scheme = "zero-based"  # Default assumption
    if month_select.count():
        try:
            options = month_select.locator("option").all()
            if len(options) > 0:
                first_value = options[0].get_attribute("value")
                # If first option is "1", it's 1-based; if "0", it's 0-based
                if first_value == "1":
                    indexing_scheme = "one-based"
                elif first_value == "0":
                    indexing_scheme = "zero-based"
                else:
                    # Check if we have 12 options (1-12) or 12 options (0-11)
                    if len(options) == 12:
                        last_value = options[-1].get_attribute("value")
                        if last_value == "11":
                            indexing_scheme = "zero-based"
                        elif last_value == "12":
                            indexing_scheme = "one-based"
        except Exception as error:
            log(f"Could not detect month indexing, using default: {error}")
    
    # Convert month based on detected scheme
    if indexing_scheme == "zero-based":
        month_value = str(month_num - 1)  # Convert 1-12 to 0-11
    else:
        month_value = str(month_num)  # Keep as 1-12
    
    log_with_context("Date picker indexing", {
        "scheme": indexing_scheme,
        "month_input": month_num,
        "month_value": month_value,
        "year": year_value,
        "day": day_value
    })

    # Select year and month
    if month_select.count():
        month_select.select_option(value=month_value)
    if year_select.count():
        year_select.select_option(value=year_value)
    page.wait_for_timeout(250)

    # Try multiple data-day format patterns
    data_day_candidates = [
        f"{month_num}/{int(day_value)}/{year_value}",  # 1/15/2024
        f"{int(month_value)}/{int(day_value)}/{year_value}",  # 0/15/2024 or 1/15/2024
        f"{month_value}/{day_value}/{year_value}",  # "0/15/2024" or "1/15/2024"
        f"{month_num}/{day_value}/{year_value}",  # "1/15/2024"
    ]
    
    for candidate in data_day_candidates:
        try:
            day_button = page.locator(f".rdp-root [data-day='{candidate}']").first
            if day_button.count():
                log(f"Found day button with data-day='{candidate}'")
                day_button.click()
                page.wait_for_timeout(250)
                return
        except Exception:
            continue

    # Fallback: try to find button by text
    try:
        exact_day = page.locator(".rdp-root button").filter(has_text=day_value)
        if exact_day.count():
            log(f"Found day button by text: {day_value}")
            exact_day.first.click()
            page.wait_for_timeout(250)
            return
    except Exception:
        pass

    raise RuntimeError(f"Could not select date {iso_date} (tried {len(data_day_candidates)} formats)")


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
    log_with_context("Recovery reload", {"entry_date": entry_date, "reason": reason})
    
    # Check if this might be a session timeout
    session_state = detect_session_state(page)
    if session_state == "logged_out":
        log("Session timeout detected during recovery")
        if wait_for_reauth(page, timeout_ms=120000):
            log("Session recovered, continuing")
        else:
            raise RuntimeError("Session timeout: could not recover authentication")
    
    # Standard recovery: reload the page
    try:
        page.goto(config["diaryUrl"], wait_until="networkidle", timeout=30000)
    except Exception:
        page.goto(config["diaryUrl"], wait_until="domcontentloaded", timeout=30000)
    
    page.wait_for_timeout(2000)
    wait_for_page(page, ["student-diary"], timeout=25000, require_stability=True)


def upload_entry(page, entry, config):
    log_with_context("Uploading entry", {"date": entry['date']})
    
    # Check session state before starting
    session_state = detect_session_state(page)
    if session_state == "logged_out":
        log("Session timeout detected before upload")
        if not wait_for_reauth(page, timeout_ms=120000):
            raise RuntimeError("Session timeout: could not recover authentication")
        _session_state["consecutive_timeouts"] += 1
    else:
        _session_state["consecutive_timeouts"] = 0
    
    # Navigate to student diary page with better timeout
    try:
        page.goto(config["diaryUrl"], wait_until="networkidle", timeout=30000)
    except Exception as error:
        log(f"Network idle timeout, using domcontentloaded: {error}")
        page.goto(config["diaryUrl"], wait_until="domcontentloaded", timeout=30000)
    
    page.wait_for_timeout(2000)
    
    # Wait for student-diary page with stability check
    try:
        wait_for_page(page, ["student-diary"], timeout=25000, require_stability=True)
    except TimeoutError as error:
        # Check if session timed out
        if detect_session_state(page) == "logged_out":
            log("Session timeout detected during navigation")
            _session_state["pending_retry_entry"] = entry
            if wait_for_reauth(page, timeout_ms=120000):
                # Apply exponential backoff
                backoff_delays = [5, 10, 20]
                delay = backoff_delays[min(_session_state["consecutive_timeouts"], len(backoff_delays) - 1)]
                log(f"Applying exponential backoff: {delay}s")
                page.wait_for_timeout(delay * 1000)
                _session_state["consecutive_timeouts"] += 1
                # Retry navigation
                page.goto(config["diaryUrl"], wait_until="domcontentloaded", timeout=30000)
                page.wait_for_timeout(2000)
                wait_for_page(page, ["student-diary"], timeout=25000, require_stability=True)
            else:
                raise RuntimeError("Session timeout: could not recover authentication")
        else:
            raise

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
        # Check for session timeout
        if detect_session_state(page) == "logged_out":
            log("Session timeout during form transition")
            _session_state["pending_retry_entry"] = entry
            raise RuntimeError("Session timeout during form transition")
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
    
    # Clear pending retry on success
    if _session_state["pending_retry_entry"] == entry:
        _session_state["pending_retry_entry"] = None
    
    return "saved"


def run_bot(config_override=None, entries_override=None, require_confirmation=True, prompt_fn=input, chooser_callback=None, progress_callback=None):
    config = load_config()
    if config_override:
        config.update(config_override)

    entries = entries_override if entries_override is not None else load_entries(config)
    clear_stop_request()

    log(f"Loaded {len(entries)} entries from data")
    
    # Validation: Check all entries have required fields and valid dates
    log("Validating entries...")
    for idx, entry in enumerate(entries, 1):
        # Validate date format
        try:
            date_parts = entry['date'].split('-')
            if len(date_parts) != 3:
                raise ValueError(f"Invalid date format")
            year, month, day = int(date_parts[0]), int(date_parts[1]), int(date_parts[2])
            if not (1 <= month <= 12):
                raise ValueError(f"Month must be between 1-12, got {month}")
            if not (1 <= day <= 31):
                raise ValueError(f"Day must be between 1-31, got {day}")
        except Exception as e:
            raise ValueError(f"Entry {idx}: Invalid date '{entry['date']}' - {e}")
        
        # Validate required fields
        if not entry.get('workSummary'):
            raise ValueError(f"Entry {idx} ({entry['date']}): Missing workSummary")
        if not entry.get('learningOutcomes'):
            raise ValueError(f"Entry {idx} ({entry['date']}): Missing learningOutcomes")
        if not entry.get('skills') or len(entry['skills']) == 0:
            raise ValueError(f"Entry {idx} ({entry['date']}): Missing skills")
    
    log(f"✓ All {len(entries)} entries validated successfully")
    
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
            log("Login complete, resolving internship for entries...")
            entries = resolve_entries_internship(page, entries, config, prompt_fn=prompt_fn, chooser_callback=chooser_callback)
            log(f"Starting to process {len(entries)} entries...")

            for idx, entry in enumerate(entries, 1):
                ensure_not_stopped()
                
                # Send progress update
                if progress_callback:
                    try:
                        progress_callback(idx, len(entries), entry['date'])
                    except:
                        pass
                
                try:
                    log_with_context(f"Processing entry {idx}/{len(entries)}", {"date": entry['date']})
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
