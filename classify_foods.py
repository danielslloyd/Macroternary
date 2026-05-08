#!/usr/bin/env python3
"""
Food prevalence classifier using local Ollama models.
Adds a column to the CSV for each model with prevalence classifications.
"""

import csv
import json
import os
import sys
import httpx
import threading
from pathlib import Path

try:
    import tkinter as tk
    from tkinter import ttk, messagebox, filedialog
    HAS_TKINTER = True
except ImportError:
    HAS_TKINTER = False

# Configuration
OLLAMA_BASE_URL = "http://127.0.0.1:11434"
CSV_PATH = Path(__file__).parent / "food_data_combined.csv"
MAX_ROWS = 25

# Prevalence prompt template
PREVALENCE_PROMPT = """You are classifying how common a food is in 21st century American cuisine.

Food: {food_name}

Based on how commonly this food appears in typical American diets, grocery stores, and restaurants in 2024, classify it as one of:
- "common": Very familiar, widely available (e.g., chicken, apple, milk)
- "middle": Somewhat known but not everywhere (e.g., tofu, quinoa, kale)
- "uncommon": Rarely seen or very niche (e.g., jackfruit, durian, fugu)

Respond with ONLY the classification word (common, middle, or uncommon). No explanation."""


class OllamaClassifier:
    def __init__(self, model_name: str):
        self.model_name = model_name
        self.client = httpx.Client(base_url=OLLAMA_BASE_URL, timeout=120.0)

    def classify(self, food_name: str) -> str:
        """Classify a food and return the prevalence category."""
        prompt = PREVALENCE_PROMPT.format(food_name=food_name)

        try:
            response = self.client.post(
                "/api/generate",
                json={
                    "model": self.model_name,
                    "prompt": prompt,
                    "stream": False,
                },
            )
            response.raise_for_status()
            data = response.json()
            result = data.get("response", "").strip().lower()

            # Normalize response
            if "common" in result:
                return "common"
            elif "middle" in result:
                return "middle"
            elif "uncommon" in result:
                return "uncommon"
            else:
                return result if result else "unknown"
        except Exception as e:
            print(f"Error classifying {food_name}: {e}")
            return "error"

    def close(self):
        self.client.close()


def fetch_available_models() -> list[str]:
    """Fetch list of available models from Ollama."""
    try:
        client = httpx.Client(base_url=OLLAMA_BASE_URL, timeout=10.0)
        response = client.get("/api/tags")
        response.raise_for_status()
        data = response.json()
        models = [m["name"].split(":")[0] for m in data.get("models", [])]
        client.close()
        return sorted(set(models))
    except Exception as e:
        print(f"Error fetching models: {e}")
        return []


def process_csv(model_name: str, max_rows: int, progress_callback=None, status_callback=None, should_continue=None):
    """Process CSV file and classify foods.

    Args:
        should_continue: Callable that returns False if should pause/stop
    """

    # Read CSV
    rows = []
    try:
        with open(CSV_PATH, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            rows = list(reader)
        print(f"Loaded {len(rows)} rows from CSV")
    except Exception as e:
        if status_callback:
            status_callback(f"Error reading CSV: {e}")
        return

    if not rows:
        if status_callback:
            status_callback("CSV is empty")
        return

    # Check if model column exists, create if not
    fieldnames = list(rows[0].keys()) if rows[0] else []
    column_name = model_name
    column_exists = column_name in fieldnames

    if not column_exists:
        fieldnames.append(column_name)
        for row in rows:
            row[column_name] = ""

    # Find first empty row
    start_idx = 0
    for i, row in enumerate(rows):
        if not row.get(column_name, "").strip():
            start_idx = i
            break

    if status_callback:
        status_callback(f"Starting from row {start_idx + 1}, processing up to {min(max_rows, len(rows) - start_idx)} rows")

    # Classify foods
    classifier = OllamaClassifier(model_name)
    processed = 0

    try:
        for i in range(start_idx, min(start_idx + max_rows, len(rows))):
            # Check if should continue (pause/stop)
            if should_continue and not should_continue():
                if status_callback:
                    status_callback("Paused. Click Resume to continue.")
                save_csv(rows, fieldnames)
                return

            row = rows[i]
            food_name = row.get("Food", "").strip()

            if not food_name:
                continue

            if row.get(column_name, "").strip():
                continue

            if status_callback:
                status_callback(f"Classifying: {food_name}")

            classification = classifier.classify(food_name)
            row[column_name] = classification
            processed += 1

            if progress_callback:
                progress_callback(processed)

            # Save progress every 5 rows
            if processed % 5 == 0:
                save_csv(rows, fieldnames)
                if status_callback:
                    status_callback(f"Progress saved ({processed} rows processed)")

    finally:
        classifier.close()

    # Final save
    save_csv(rows, fieldnames)
    if status_callback:
        status_callback(f"Complete! Processed {processed} rows")


def save_csv(rows, fieldnames):
    """Save rows back to CSV."""
    try:
        with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
    except Exception as e:
        print(f"Error saving CSV: {e}")


class ClassifierUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Food Prevalence Classifier")
        self.root.geometry("600x450")
        self.available_models = []
        self.processing = False
        self.paused = False
        self.should_continue_flag = True
        self.current_thread = None

        self.setup_ui()
        self.refresh_models()

    def setup_ui(self):
        """Setup UI components."""
        main_frame = ttk.Frame(self.root, padding="10")
        main_frame.pack(fill=tk.BOTH, expand=True)

        # Model selection
        ttk.Label(main_frame, text="Select Ollama Model:").pack(anchor=tk.W, pady=(0, 5))
        self.model_var = tk.StringVar()
        self.model_combo = ttk.Combobox(
            main_frame,
            textvariable=self.model_var,
            state="readonly",
            width=50
        )
        self.model_combo.pack(fill=tk.X, pady=(0, 10))

        refresh_btn = ttk.Button(main_frame, text="Refresh Models", command=self.refresh_models)
        refresh_btn.pack(anchor=tk.W, pady=(0, 10))

        # Max rows parameter
        ttk.Label(main_frame, text="Max rows to process:").pack(anchor=tk.W, pady=(0, 5))
        self.max_rows_var = tk.StringVar(value=str(MAX_ROWS))
        max_rows_entry = ttk.Entry(main_frame, textvariable=self.max_rows_var, width=10)
        max_rows_entry.pack(anchor=tk.W, pady=(0, 10))

        # CSV path display
        ttk.Label(main_frame, text=f"CSV: {CSV_PATH}").pack(anchor=tk.W, pady=(0, 10))

        # Progress bar
        ttk.Label(main_frame, text="Progress:").pack(anchor=tk.W, pady=(10, 5))
        self.progress_var = tk.IntVar()
        self.progress_bar = ttk.Progressbar(
            main_frame,
            variable=self.progress_var,
            maximum=MAX_ROWS,
            mode="determinate"
        )
        self.progress_bar.pack(fill=tk.X, pady=(0, 10))

        # Status text
        ttk.Label(main_frame, text="Status:").pack(anchor=tk.W, pady=(10, 5))
        self.status_text = tk.Text(main_frame, height=8, width=70)
        self.status_text.pack(fill=tk.BOTH, expand=True, pady=(0, 10))

        # Buttons
        button_frame = ttk.Frame(main_frame)
        button_frame.pack(fill=tk.X, pady=(10, 0))

        self.start_btn = ttk.Button(button_frame, text="Start", command=self.toggle_start_pause)
        self.start_btn.pack(side=tk.LEFT, padx=(0, 5))

        self.stop_btn = ttk.Button(button_frame, text="Stop", command=self.stop_classification, state=tk.DISABLED)
        self.stop_btn.pack(side=tk.LEFT)

    def refresh_models(self):
        """Refresh available models."""
        self.log_status("Fetching available models...")
        self.available_models = fetch_available_models()

        if self.available_models:
            self.model_combo["values"] = self.available_models
            if self.available_models:
                self.model_combo.current(0)
            self.log_status(f"Found {len(self.available_models)} models")
        else:
            self.log_status("No models found. Make sure Ollama is running.")

    def log_status(self, message: str):
        """Log status message."""
        self.status_text.insert(tk.END, message + "\n")
        self.status_text.see(tk.END)
        self.root.update()

    def toggle_start_pause(self):
        """Toggle between start and pause/resume."""
        if not self.processing:
            # Start
            self.start_classification()
        else:
            # Pause/Resume
            self.toggle_pause()

    def start_classification(self):
        """Start classification in a background thread."""
        model = self.model_var.get()
        if not model:
            messagebox.showerror("Error", "Please select a model")
            return

        try:
            max_rows = int(self.max_rows_var.get())
            if max_rows < 1:
                messagebox.showerror("Error", "Max rows must be >= 1")
                return
        except ValueError:
            messagebox.showerror("Error", "Invalid max rows value")
            return

        self.processing = True
        self.paused = False
        self.should_continue_flag = True
        self.start_btn.config(text="Pause")
        self.stop_btn.config(state=tk.NORMAL)
        self.progress_var.set(0)
        self.progress_bar.config(maximum=max_rows)
        self.status_text.delete(1.0, tk.END)

        def run():
            try:
                process_csv(
                    model,
                    max_rows,
                    progress_callback=self.update_progress,
                    status_callback=self.log_status,
                    should_continue=lambda: self.should_continue_flag
                )
            except Exception as e:
                self.log_status(f"Error: {e}")
            finally:
                self.processing = False
                self.paused = False
                self.start_btn.config(text="Start", state=tk.NORMAL)
                self.stop_btn.config(state=tk.DISABLED)

        self.current_thread = threading.Thread(target=run, daemon=True)
        self.current_thread.start()

    def toggle_pause(self):
        """Toggle pause state."""
        if self.paused:
            # Resume
            self.should_continue_flag = True
            self.paused = False
            self.start_btn.config(text="Pause")
            self.log_status("Resumed")
        else:
            # Pause
            self.should_continue_flag = False
            self.paused = True
            self.start_btn.config(text="Resume")
            self.log_status("Paused - Click Resume to continue")

    def stop_classification(self):
        """Stop classification."""
        self.should_continue_flag = False
        self.processing = False
        self.paused = False
        self.log_status("Stopped.")
        self.start_btn.config(text="Start", state=tk.NORMAL)
        self.stop_btn.config(state=tk.DISABLED)

    def update_progress(self, value: int):
        """Update progress bar."""
        self.progress_var.set(value)
        self.root.update()


def cli_main():
    """Command-line interface for the classifier."""
    print("Food Prevalence Classifier")
    print("=" * 50)

    print("\nFetching available models...")
    models = fetch_available_models()

    if not models:
        print("No models found. Make sure Ollama is running.")
        return

    print(f"Found {len(models)} models:")
    for i, model in enumerate(models, 1):
        print(f"  {i}. {model}")

    while True:
        try:
            choice = int(input("\nSelect model (number): ")) - 1
            if 0 <= choice < len(models):
                selected_model = models[choice]
                break
        except ValueError:
            pass
        print("Invalid selection")

    max_rows_input = input(f"Max rows to process (default {MAX_ROWS}): ").strip()
    max_rows = int(max_rows_input) if max_rows_input else MAX_ROWS

    print(f"\nProcessing with model: {selected_model}")
    print(f"Max rows: {max_rows}")

    def status_callback(msg):
        print(f"[INFO] {msg}")

    process_csv(
        selected_model,
        max_rows,
        progress_callback=lambda x: print(f"[PROGRESS] {x}/{max_rows} rows processed"),
        status_callback=status_callback
    )


def main():
    if HAS_TKINTER:
        root = tk.Tk()
        app = ClassifierUI(root)
        root.mainloop()
    else:
        print("Tkinter not available. Using CLI mode.")
        cli_main()


if __name__ == "__main__":
    main()
