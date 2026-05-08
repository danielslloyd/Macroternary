# Food Prevalence Classifier

A Python script that uses local Ollama models to classify foods by their prevalence in 21st century American cuisine.

## Features

- **Local Model Support**: Uses any Ollama model available on your system
- **Smart Column Management**: Creates/reuses columns with model names in the CSV
- **Progress Persistence**: Saves after every 5 rows so failures don't lose work
- **Batch Control**: Max rows parameter (default 25) for testing and incremental processing
- **Interactive UI**: Simple Tkinter interface for model selection and monitoring

## Requirements

- Python 3.8+
- Ollama running locally on port 11434
- `httpx` library (auto-installed)

## Installation

1. Install httpx:
   ```bash
   pip install httpx
   ```

2. Ensure Ollama is running:
   ```bash
   ollama serve
   ```

3. Pull a model (if not already done):
   ```bash
   ollama pull llama2
   ```

## Usage

```bash
python3 classify_foods.py
```

### UI Guide

1. **Select Model**: Choose from available Ollama models in the dropdown
2. **Refresh Models**: Click to fetch latest models from Ollama
3. **Max Rows**: Set how many rows to process (default 25 for testing)
4. **Start Classification**: Begin processing foods

### What the Script Does

1. Reads `food_data_combined.csv`
2. Checks for a column matching the model name (creates if missing)
3. Finds the first empty row in that column
4. For each empty row, asks the model to classify the food as:
   - **"common"**: Very familiar, widely available (e.g., chicken, apple, milk)
   - **"middle"**: Somewhat known but not everywhere (e.g., tofu, quinoa, kale)
   - **"uncommon"**: Rarely seen or very niche (e.g., jackfruit, durian, fugu)
5. Saves progress every 5 rows

### CSV Format

The script expects a CSV with a "Food" column:

```
Food,Calories,Fat,Carbohydrates,Protein,llama2,mistral,...
cream cheese,51,5.0,0.8,0.9,common,middle,...
chicken breast,130,3.0,0.0,26.0,common,common,...
```

Each model name becomes a new column with classifications.

## Tips

- Start with `max_rows=25` to test different models
- Different models may give slightly different results
- Progress is saved automatically, so you can stop and resume
- Check `status` text area to monitor progress

## Troubleshooting

- **"No models found"**: Make sure Ollama is running and accessible at http://127.0.0.1:11434
- **Slow processing**: Some models are slower; try lighter models like `phi` or `neural-chat`
- **Connection timeout**: Increase Ollama timeout if needed (edit `OLLAMA_BASE_URL` timeout)
