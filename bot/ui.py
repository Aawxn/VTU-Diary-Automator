import json
import os
import queue
import sys
import threading
import tkinter as tk
import webbrowser
from pathlib import Path
from tkinter import filedialog, messagebox, ttk
from tkinter.scrolledtext import ScrolledText

import main as bot_core

if getattr(sys, "frozen", False):
    ROOT_DIR = Path(sys.executable).resolve().parent
    _appdata_base = Path(os.environ.get("APPDATA") or Path.home() / "AppData" / "Roaming")
    APPDATA_DIR = _appdata_base / "VTU-Diary-Bot"
    APPDATA_DIR.mkdir(parents=True, exist_ok=True)
else:
    ROOT_DIR = Path(__file__).resolve().parents[1]
    APPDATA_DIR = ROOT_DIR / "bot" / ".session"
    APPDATA_DIR.mkdir(parents=True, exist_ok=True)

SHARED_DATA_PATH = bot_core.SHARED_DATA_PATH
PRESETS_DIR = SHARED_DATA_PATH.parent / "presets"
LAST_DATA_PATH = APPDATA_DIR / "last_data.json"
REPO_URL = "https://github.com/Aawxn/VTU-Diary-Automator"
CUSTOM_PRESET_LABEL = "Custom / Last Session"
PRESET_FILES = {
    "MindMatrix": "android-gen-ai-mind-matrix.data.json",
    "Learners Byte": "bharat-unnati-ai-fellowship-learners-byte.data.json",
    "Random-For Any Internship": "random-for-any-internship.data.json",
}


class VTUBotUI:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("VTU Diary Bot")
        self.root.geometry("980x820")
        self.root.minsize(900, 720)
        self.root.configure(bg="#0b1220")

        self.log_queue = queue.Queue()
        self.active_thread = None
        self.intership_choice_result = None
        self.internship_choice_event = None
        self.advanced_open = tk.BooleanVar(value=False)
        self.status_var = tk.StringVar(value="No data loaded yet. Load or paste your diary data.")
        self.entries_var = tk.StringVar(value="Entries detected: 0")

        self.build_ui()
        self.load_shared_data()
        self.poll_logs()
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

    def build_ui(self):
        style = ttk.Style()
        try:
            style.theme_use("clam")
        except Exception:
            pass

        bg = "#0b1220"
        panel = "#121a2b"
        card = "#172033"
        card_alt = "#101827"
        accent = "#4f7cff"
        accent_hover = "#6a8fff"
        text = "#eef4ff"
        muted = "#94a3b8"
        border = "#26324a"

        self.root.option_add("*TCombobox*Listbox.background", card_alt)
        self.root.option_add("*TCombobox*Listbox.foreground", text)
        self.root.option_add("*TCombobox*Listbox.selectBackground", accent)
        self.root.option_add("*TCombobox*Listbox.selectForeground", "white")

        style.configure("App.TFrame", background=bg)
        style.configure("Card.TFrame", background=panel, relief="flat")
        style.configure("SubCard.TFrame", background=card, relief="flat")
        style.configure("TLabel", background=bg, foreground=text)
        style.configure("Muted.TLabel", background=bg, foreground=muted, font=("Segoe UI", 10))
        style.configure("CardTitle.TLabel", background=panel, foreground=text, font=("Segoe UI", 10, "bold"))
        style.configure("Section.TLabel", background=bg, foreground="#c7d2fe", font=("Segoe UI", 10, "bold"))
        style.configure("TCheckbutton", background=bg, foreground=text)
        style.map("TCheckbutton", background=[("active", bg)])
        style.configure("Primary.TButton", background=accent, foreground="white", borderwidth=0, focuscolor=accent, padding=(12, 10))
        style.map("Primary.TButton", background=[("active", accent_hover), ("pressed", accent_hover)])
        style.configure("Secondary.TButton", background=card, foreground=text, borderwidth=0, focuscolor=card, padding=(12, 10))
        style.map("Secondary.TButton", background=[("active", "#1d2940"), ("pressed", "#1d2940")])
        style.configure("TEntry", fieldbackground=card_alt, foreground=text, insertcolor=text, bordercolor=border, lightcolor=border, darkcolor=border, padding=8)
        style.configure("TCombobox", fieldbackground=card_alt, foreground=text, background=card_alt, bordercolor=border, lightcolor=border, darkcolor=border, arrowsize=14)
        style.map(
            "TCombobox",
            fieldbackground=[("readonly", card_alt)],
            foreground=[("readonly", text)],
            selectbackground=[("readonly", card_alt)],
            selectforeground=[("readonly", text)],
        )

        container = ttk.Frame(self.root, padding=18, style="App.TFrame")
        container.pack(fill="both", expand=True)

        header = ttk.Frame(container, style="Card.TFrame", padding=16)
        header.pack(fill="x", pady=(0, 14))

        title = ttk.Label(header, text="VTU Diary Bot Runner", font=("Segoe UI", 22, "bold"), background=panel, foreground=text)
        title.pack(anchor="w")
        subtitle = ttk.Label(
            header,
            text="Fill your VTU internship diary automatically in minutes",
            font=("Segoe UI", 10),
            background=panel,
            foreground=muted,
        )
        subtitle.pack(anchor="w", pady=(6, 0))
        steps = ttk.Label(
            header,
            text="1. Load file (or paste data)   2. Preview   3. Run Bot",
            font=("Segoe UI", 10, "bold"),
            background=panel,
            foreground="#c7d2fe",
        )
        steps.pack(anchor="w", pady=(8, 0))
        ttk.Button(header, text="Star GitHub Repo", command=self.open_repo, style="Primary.TButton").pack(anchor="e", pady=(12, 0))

        actions = ttk.Frame(container, style="App.TFrame")
        actions.pack(fill="x", pady=(0, 12))
        ttk.Button(actions, text="Load File", command=self.load_file, style="Secondary.TButton").pack(side="left")
        ttk.Button(actions, text="Preview", command=self.preview_entries, style="Secondary.TButton").pack(side="left", padx=8)
        ttk.Button(actions, text="Load previous data", command=self.load_shared_data, style="Secondary.TButton").pack(side="left")
        ttk.Button(actions, text="click me for gpt prompt", command=self.show_gpt_prompt, style="Secondary.TButton").pack(side="left", padx=8)
        self.run_button_text = tk.StringVar(value="Run Bot")
        self.run_button = ttk.Button(actions, textvariable=self.run_button_text, command=self.run_bot, style="Primary.TButton")
        self.run_button.pack(side="right")

        status_row = ttk.Frame(container, style="App.TFrame")
        status_row.pack(fill="x", pady=(0, 8))
        ttk.Label(status_row, textvariable=self.entries_var, style="Section.TLabel").pack(side="left")
        ttk.Label(status_row, textvariable=self.status_var, style="Muted.TLabel").pack(side="right")

        ttk.Label(container, text="Diary Data", style="Section.TLabel").pack(anchor="w")
        self.json_text = ScrolledText(container, height=16, wrap="word", bg=card_alt, fg=text, insertbackground=text, relief="flat", bd=0, padx=12, pady=12)
        self.json_text.pack(fill="both", expand=True, pady=(6, 12))

        advanced_wrap = ttk.Frame(container, style="Card.TFrame", padding=12)
        advanced_wrap.pack(fill="x", pady=(0, 10))
        self.advanced_toggle_button = ttk.Button(
            advanced_wrap,
            text="Advanced Options ▼",
            command=self.toggle_advanced,
            style="Secondary.TButton",
        )
        self.advanced_toggle_button.pack(anchor="w")

        self.advanced_frame = ttk.Frame(advanced_wrap, style="Card.TFrame")
        self.advanced_frame.columnconfigure(1, weight=1)
        self.advanced_frame.columnconfigure(3, weight=1)

        ttk.Label(self.advanced_frame, text="Diary Preset", style="Section.TLabel").grid(row=0, column=0, sticky="w", padx=(0, 8), pady=(10, 0))
        self.preset_var = tk.StringVar(value=CUSTOM_PRESET_LABEL)
        preset_box = ttk.Combobox(
            self.advanced_frame,
            textvariable=self.preset_var,
            values=[CUSTOM_PRESET_LABEL, *PRESET_FILES.keys()],
            state="readonly",
        )
        preset_box.grid(row=0, column=1, columnspan=3, sticky="ew", pady=(10, 0))
        preset_box.configure(font=("Segoe UI", 10))
        preset_box.bind("<<ComboboxSelected>>", self.on_preset_selected)

        ttk.Label(self.advanced_frame, text="Choose Internship (optional)", style="Section.TLabel").grid(row=1, column=0, sticky="w", padx=(0, 8), pady=(12, 0))
        self.internship_var = tk.StringVar()
        ttk.Entry(self.advanced_frame, textvariable=self.internship_var).grid(row=1, column=1, sticky="ew", padx=(0, 16), pady=(12, 0))

        ttk.Label(self.advanced_frame, text="Browser", style="Section.TLabel").grid(row=1, column=2, sticky="w", padx=(0, 8), pady=(12, 0))
        self.browser_var = tk.StringVar(value="chrome")
        browser_box = ttk.Combobox(self.advanced_frame, textvariable=self.browser_var, values=["chrome", "msedge", "chromium"], state="readonly")
        browser_box.grid(row=1, column=3, sticky="ew", pady=(12, 0))
        browser_box.configure(font=("Segoe UI", 10))

        self.overwrite_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(self.advanced_frame, text="Overwrite existing entries", variable=self.overwrite_var).grid(row=2, column=0, sticky="w", pady=(12, 0))

        self.headless_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(self.advanced_frame, text="Run in background", variable=self.headless_var).grid(row=2, column=1, sticky="w", pady=(12, 0))

        ttk.Label(
            self.advanced_frame,
            text="Leave internship blank to use entry data, config default, or automatic chooser when multiple internships are detected.",
            style="Muted.TLabel",
            wraplength=860,
            justify="left",
        ).grid(row=3, column=0, columnspan=4, sticky="w", pady=(12, 0))

        ttk.Label(container, text="Preview", style="Section.TLabel").pack(anchor="w")
        self.preview_text = ScrolledText(container, height=10, wrap="word", bg=panel, fg="#dbeafe", insertbackground="#dbeafe", relief="flat", bd=0, padx=12, pady=12)
        self.preview_text.pack(fill="both", expand=True, pady=(6, 12))

        ttk.Label(container, text="Logs", style="Section.TLabel").pack(anchor="w")
        self.log_text = ScrolledText(container, height=10, wrap="word", bg="#060b16", fg="#cbd5e1", insertbackground="#cbd5e1", relief="flat", bd=0, padx=12, pady=12)
        self.log_text.pack(fill="both", expand=True, pady=(6, 0))

    def append_log(self, line: str):
        self.log_queue.put(("log", line))

    def set_status(self, text: str):
        self.status_var.set(text)

    def set_entries_status(self, payload):
        try:
            config = self.current_config()
            entries = bot_core.normalize_entries(payload, config)
            self.entries_var.set(f"Entries detected: {len(entries)}")
            if entries:
                first = entries[0]
                self.set_status(f"First: {first['date']} | skills: {len(first.get('skills', []))}")
            else:
                self.set_status("No data loaded yet. Load or paste your diary data.")
        except Exception:
            self.entries_var.set("Entries detected: 0")
            self.set_status("No data loaded yet. Load or paste your diary data.")

    def toggle_advanced(self):
        if self.advanced_open.get():
            self.advanced_frame.pack_forget()
            self.advanced_toggle_button.configure(text="Advanced Options ▼")
            self.advanced_open.set(False)
            return
        self.advanced_frame.pack(fill="x", pady=(8, 0))
        self.advanced_toggle_button.configure(text="Advanced Options ▲")
        self.advanced_open.set(True)

    def build_gpt_prompt_text(self):
        allowed_skills, _ = bot_core.load_allowed_skills()
        skills_block = "\n".join(f"- {skill}" for skill in allowed_skills)
        return f"""You are helping me generate VTU internship diary entries.

Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{{
  "internship": "<exact internship name>",
  "entries": [
    {{
      "date": "YYYY-MM-DD",
      "workSummary": "2-4 sentences of concrete work done on that date",
      "learningOutcomes": "1-3 sentences describing what was learned",
      "hours": 3,
      "skills": ["One allowed skill label", "Optional second skill label"]
    }}
  ]
}}

Rules:
1. Keep date format strictly YYYY-MM-DD.
2. Keep hours as a number (default 3 unless I say otherwise).
3. Use ONLY skills from the allowed list below (exact spelling/case preferred).
4. Each entry must include date, workSummary, learningOutcomes, hours, and skills.
5. Work summaries must sound realistic and internship-relevant (no filler text).
6. Do not output anything outside the JSON object.

Allowed VTU Skills:
{skills_block}
"""

    def show_gpt_prompt(self):
        prompt = self.build_gpt_prompt_text()
        dialog = tk.Toplevel(self.root)
        dialog.title("GPT Prompt Generator")
        dialog.configure(bg="#111827")
        dialog.transient(self.root)
        dialog.grab_set()
        dialog.geometry("900x620")

        ttk.Label(
            dialog,
            text="Copy this prompt and paste it in ChatGPT. It will return copy-paste-ready data.json format.",
            style="Section.TLabel",
            wraplength=860,
            justify="left",
        ).pack(anchor="w", padx=16, pady=(16, 8))

        prompt_box = ScrolledText(
            dialog,
            wrap="word",
            bg="#101827",
            fg="#eef4ff",
            insertbackground="#eef4ff",
            relief="flat",
            bd=0,
            padx=10,
            pady=10,
            height=26,
        )
        prompt_box.pack(fill="both", expand=True, padx=16, pady=(0, 12))
        prompt_box.insert("1.0", prompt)

        def copy_prompt():
            self.root.clipboard_clear()
            self.root.clipboard_append(prompt)
            self.append_log("GPT prompt copied to clipboard")
            messagebox.showinfo("Copied", "Prompt copied to clipboard.")

        button_row = ttk.Frame(dialog)
        button_row.pack(fill="x", padx=16, pady=(0, 16))
        ttk.Button(button_row, text="Copy Prompt", command=copy_prompt, style="Primary.TButton").pack(side="right")
        ttk.Button(button_row, text="Close", command=dialog.destroy, style="Secondary.TButton").pack(side="right", padx=(0, 8))

    def open_repo(self):
        webbrowser.open(REPO_URL, new=2)
        self.append_log(f"Opened GitHub repo: {REPO_URL}")

    def poll_logs(self):
        while True:
            try:
                kind, payload = self.log_queue.get_nowait()
            except queue.Empty:
                break
            if kind == "log":
                self.log_text.insert("end", payload + "\n")
                self.log_text.see("end")
            elif kind == "preview":
                self.preview_text.delete("1.0", "end")
                self.preview_text.insert("1.0", payload)
        if self.active_thread and not self.active_thread.is_alive():
            self.active_thread = None
            self.run_button_text.set("Run Bot")
        self.root.after(120, self.poll_logs)

    def current_payload(self):
        raw = self.json_text.get("1.0", "end").strip()
        if not raw:
            return bot_core.load_json(SHARED_DATA_PATH)
        return json.loads(raw)

    def current_config(self):
        config = bot_core.load_config()
        config["overwriteExisting"] = bool(self.overwrite_var.get())
        config["browserChannel"] = self.browser_var.get().strip() or "chrome"
        config["headless"] = bool(self.headless_var.get())
        internship = self.internship_var.get().strip()
        if internship:
            config["targetInternship"] = internship
        return config

    def _autosave_json(self):
        """Persist the current JSON box content to APPDATA for next session."""
        raw = self.json_text.get("1.0", "end").strip()
        if raw:
            try:
                LAST_DATA_PATH.write_text(raw, encoding="utf-8")
            except Exception:
                pass

    def on_preset_selected(self, _event=None):
        preset_label = self.preset_var.get()
        if preset_label == CUSTOM_PRESET_LABEL:
            return

        filename = PRESET_FILES.get(preset_label)
        if not filename:
            return

        preset_path = PRESETS_DIR / filename
        if not preset_path.exists():
            messagebox.showwarning(
                "Preset not ready",
                f"Preset '{preset_label}' is configured but file is missing:\n\n{preset_path}\n\n"
                "Add your preset JSON there and try again.",
            )
            self.append_log(f"Preset file missing: {preset_path}")
            self.preset_var.set(CUSTOM_PRESET_LABEL)
            return

        try:
            preset_text = preset_path.read_text(encoding="utf-8-sig")
            json.loads(preset_text)
        except Exception as error:
            messagebox.showerror("Preset error", f"Could not load preset:\n\n{preset_path}\n\n{error}")
            self.append_log(f"Preset load error: {error}")
            self.preset_var.set(CUSTOM_PRESET_LABEL)
            return

        self.json_text.delete("1.0", "end")
        self.json_text.insert("1.0", preset_text)
        self._autosave_json()
        self.append_log(f"Loaded preset '{preset_label}' from {preset_path}")

    def load_shared_data(self):
        """Load last saved session from APPDATA. Falls back to shared/data.json in dev."""
        self.preset_var.set(CUSTOM_PRESET_LABEL)
        self.json_text.delete("1.0", "end")
        if LAST_DATA_PATH.exists():
            self.json_text.insert("1.0", LAST_DATA_PATH.read_text(encoding="utf-8"))
            self.append_log(f"Restored last session from {LAST_DATA_PATH}")
            self.set_status("Ready to run")
        elif SHARED_DATA_PATH.exists():
            self.json_text.insert("1.0", SHARED_DATA_PATH.read_text(encoding="utf-8-sig"))
            self.append_log(f"Loaded {SHARED_DATA_PATH}")
            self.set_status("Ready to run")
        else:
            self.append_log("[INFO] No saved session found.")
            self.append_log("Paste your diary JSON in the box above, or use 'Load File'.")
            self.set_status("No data loaded yet. Load or paste your diary data.")
        try:
            self.set_entries_status(self.current_payload())
        except Exception:
            self.entries_var.set("Entries detected: 0")

    def load_file(self):
        path = filedialog.askopenfilename(filetypes=[("JSON or text", "*.json *.txt"), ("All files", "*.*")])
        if not path:
            return
        self.preset_var.set(CUSTOM_PRESET_LABEL)
        self.json_text.delete("1.0", "end")
        self.json_text.insert("1.0", Path(path).read_text(encoding="utf-8-sig"))
        self.append_log(f"Loaded file: {path}")
        try:
            self.set_entries_status(self.current_payload())
            self.set_status("Ready to run")
        except Exception:
            self.set_status("Data loaded. Preview to validate.")

    def preview_entries(self):
        try:
            payload = self.current_payload()
            config = self.current_config()
            entries = bot_core.normalize_entries(payload, config)
            preview = bot_core.build_preview_text(entries, config, source_label="UI input")
            self.log_queue.put(("preview", preview))
            self.append_log(f"Preview ready for {len(entries)} entries")
            self.entries_var.set(f"Entries detected: {len(entries)}")
            self.set_status("Preview loaded")
            self._autosave_json()
        except Exception as error:
            messagebox.showerror("Preview error", str(error))
            self.append_log(f"Preview error: {error}")

    def choose_internship_gui(self, options):
        result = {"value": None}
        event = threading.Event()

        def open_dialog():
            dialog = tk.Toplevel(self.root)
            dialog.title("Choose Internship")
            dialog.configure(bg="#111827")
            dialog.transient(self.root)
            dialog.grab_set()

            ttk.Label(dialog, text="Multiple internships were found. Choose one to use for entries without an internship.").pack(anchor="w", padx=16, pady=(16, 12))
            selected = tk.StringVar(value=options[0])
            combo = ttk.Combobox(dialog, textvariable=selected, values=options, state="readonly", width=80)
            combo.pack(fill="x", padx=16)

            def confirm():
                result["value"] = selected.get()
                dialog.destroy()
                event.set()

            def cancel():
                dialog.destroy()
                event.set()

            buttons = ttk.Frame(dialog)
            buttons.pack(fill="x", padx=16, pady=16)
            ttk.Button(buttons, text="Use Selected", command=confirm).pack(side="right")
            ttk.Button(buttons, text="Cancel", command=cancel).pack(side="right", padx=(0, 8))

        self.root.after(0, open_dialog)
        event.wait()
        return result["value"]

    def run_bot(self):
        if self.active_thread and self.active_thread.is_alive():
            bot_core.request_stop()
            self.run_button_text.set("Stopping...")
            self.append_log("Stop requested from UI")
            self.set_status("Stopping...")
            return

        try:
            payload = self.current_payload()
            config = self.current_config()
            entries = bot_core.normalize_entries(payload, config)
        except Exception as error:
            messagebox.showerror("Run blocked", str(error))
            self.append_log(f"Run blocked: {error}")
            return

        preview = bot_core.build_preview_text(entries, config, source_label="UI input")
        self.log_queue.put(("preview", preview))

        if not messagebox.askyesno("Run Bot", f"Run bot for {len(entries)} entries?"):
            return

        self._autosave_json()  # persist before launching browser
        self.entries_var.set(f"Entries detected: {len(entries)}")
        self.set_status("Running...")

        def worker():
            try:
                bot_core.set_log_sink(self.append_log)
                results = bot_core.run_bot(
                    config_override=config,
                    entries_override=entries,
                    require_confirmation=False,
                    chooser_callback=self.choose_internship_gui,
                )
                if results:
                    s, sk, f = results["saved"], results["skipped"], results["failed"]
                    summary = f"✅ Bot finished!\n\n  Saved:   {s}\n  Skipped: {sk} (already exist)\n  Failed:  {f}"
                    self.root.after(0, lambda: self.set_status("Ready to run"))
                    if f > 0:
                        self.root.after(0, lambda: messagebox.showwarning("Bot Finished", summary))
                    else:
                        self.root.after(0, lambda: messagebox.showinfo("Bot Finished", summary))
            except Exception as error:
                import traceback
                tb = traceback.format_exc()
                self.append_log(f"Fatal error: {error}\n{tb}")
                self.root.after(0, lambda: self.set_status("Run failed"))
                self.root.after(0, lambda: messagebox.showerror("Bot Error", f"The bot encountered an error:\n\n{error}\n\nSee Logs for full traceback."))
            finally:
                bot_core.set_log_sink(None)
                self.root.after(0, lambda: self.run_button_text.set("Run Bot"))
                self.root.after(0, lambda: self.set_status("Ready to run"))

        self.active_thread = threading.Thread(target=worker, daemon=True)
        self.run_button_text.set("Stop Bot")
        self.active_thread.start()

    def on_close(self):
        if self.active_thread and self.active_thread.is_alive():
            if not messagebox.askyesno("VTU Bot", "The bot is still running. Stop it and close the window?"):
                return
            bot_core.request_stop()
        self.root.destroy()

    def start(self):
        self.root.mainloop()


if __name__ == "__main__":
    VTUBotUI().start()
