# Sleeper Dynasty Site Updater

This repository contains a Python script designed to fetch the latest standings data from your Sleeper fantasy football dynasty league and then use Google's Generative AI to create engaging summaries suitable for updating your dynasty league's website or social media.

## Features

*   **Sleeper API Integration**: Automatically retrieves league rosters, owner names, and performance stats.
*   **Generative AI Summaries**: Leverages Google Gemini (via `google-generativeai` SDK) to craft friendly and insightful updates from the raw data.
*   **Easy to Use**: Set up with a few environment variables and a simple `python main.py` command.

## Setup

### Prerequisites

*   Python 3.8+
*   A Google Cloud Project with the Generative AI API enabled and an API Key.
*   Your Sleeper League ID.

### Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/your-username/sleeper-dynasty-site-updater.git
    cd sleeper-dynasty-site-updater
    ```

2.  **Create a virtual environment (recommended)**:
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows: `venv\Scripts\activate`
    ```

3.  **Install dependencies**:
    ```bash
    pip install -r requirements.txt
    ```

4.  **Configure Environment Variables**:
    Create a `.env` file in the root directory (or set them directly in your environment) with your Google API Key:
    ```
    GOOGLE_API_KEY="YOUR_GOOGLE_GENERATIVE_AI_API_KEY"
    ```
    Replace `YOUR_GOOGLE_GENERATIVE_AI_API_KEY` with your actual key.

5.  **Update Configuration in `main.py`**:
    Open `main.py` and update `LEAGUE_ID` and `SEASON` with your Sleeper League ID and the current season if they are different from the default.
    ```python
    # main.py
    LEAGUE_ID = "YOUR_SLEEPER_LEAGUE_ID" # e.g., "1194798912048705536"
    SEASON = "CURRENT_YEAR" # e.g., "2025"
    ```

## Usage

To run the script and generate a site update summary:

```bash
python main.py
```

The script will print the fetched league standings and then the AI-generated summary to your console. You can then use this summary to update your Dynasty Site!

## License

This project is open source and available under the MIT License.
