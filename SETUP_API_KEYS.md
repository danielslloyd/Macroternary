# API Keys Configuration

The Macro Ternary recipe estimator supports multiple LLM providers. To use the AI recipe estimator, add your API keys to the configuration file.

## Setup

1. Open `frontend/data/api-keys.json` in a text editor
2. Add your API keys for any providers you want to use:

```json
{
  "anthropic": "your-anthropic-api-key-here",
  "openai": "your-openai-api-key-here",
  "grok": "your-grok-api-key-here",
  "google": "your-google-api-key-here"
}
```

3. Save the file
4. Restart the server (close and reopen `start-server.bat`)
5. Refresh your browser

## Supported Providers

- **Anthropic** (Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku)
- **OpenAI** (GPT-4o, GPT-4o-mini, GPT-4 Turbo)
- **Grok** (Grok-3)
- **Google** (Gemini 2.0 Flash, Gemini 1.5 Pro)

## Getting API Keys

- **Anthropic**: https://console.anthropic.com/
- **OpenAI**: https://platform.openai.com/api-keys
- **Grok**: https://developer.x.ai/
- **Google**: https://ai.google.dev/

## Note

The `api-keys.json` file is in `.gitignore` - your keys will never be committed to version control. Keep it safe and never share it.
