# AI Assistant (LLM) Integration

This document explains the new AI Assistant features integrated into Netcatty terminal.

## Features

### 1. LLM Chat Integration (# Command)

You can now interact with an AI assistant directly from your terminal by typing commands that start with `#`.

**Usage:**
```bash
# How do I list all files in Linux?
# What's the difference between rm and rm -rf?
# Explain what the ps aux command does
```

When you press Enter after typing a `#` command, the AI will respond directly in your terminal with helpful information.

### 2. Zebra Striping

Each command and its output will have a consistent background color, with different commands using alternating colors (zebra striping) to make it easier to distinguish between different command executions.

## Setup

### Prerequisites

1. **Get a Gemini API Key:**
   - Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Create a new API key
   - Copy the key for the next step

### Configuration

1. Open Netcatty Settings
2. Navigate to the **Terminal** tab
3. Scroll down to the **AI Assistant** section
4. Enable the AI Assistant toggle
5. Enter your Gemini API Key
6. Configure the model (default: `gemini-pro`)

## Privacy & Security

- **API Key Storage**: Your API key is stored locally in the application's settings
- **Data Transmission**: Only your prompts are sent to the AI provider
- **No Session Recording**: The AI does not have access to your complete terminal history

## Troubleshooting

### AI responses not showing
- Check that you have a valid API key configured
- Ensure you have an active internet connection
- Verify the API key has not exceeded its quota

### "API key is not configured" error
- Go to Settings > Terminal > AI Assistant
- Enter a valid Gemini API key
- Make sure the AI Assistant toggle is enabled
