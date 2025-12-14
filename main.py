import requests
import google.generativeai as genai
import os

# --- Configuration ---
LEAGUE_ID = "1194798912048705536"  # Replace with your Sleeper League ID
SEASON = "2025" # Replace with current season if needed
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

if not GOOGLE_API_KEY:
    raise ValueError("GOOGLE_API_KEY environment variable not set. Please set it in Replit Secrets.")

# Configure the Generative AI model
genai.configure(api_key=GOOGLE_API_KEY)
model = genai.GenerativeModel('gemini-pro') # Using gemini-pro as a general text model

def fetch_sleeper_data(league_id):
    """Fetches league rosters and user data from the Sleeper API."""
    print(f"Fetching data for league ID: {league_id}")
    rosters_url = f"https://api.sleeper.app/v1/league/{league_id}/rosters"
    users_url = f"https://api.sleeper.app/v1/league/{league_id}/users"
    league_details_url = f"https://api.sleeper.app/v1/league/{league_id}"

    try:
        league_details_response = requests.get(league_details_url)
        league_details_response.raise_for_status()
        league_name = league_details_response.json().get('name', 'Your Dynasty League')

        rosters_response = requests.get(rosters_url)
        rosters_response.raise_for_status() # Raise an exception for HTTP errors
        rosters = rosters_response.json()

        users_response = requests.get(users_url)
        users_response.raise_for_status()
        users = users_response.json()

        # Create a mapping of user_id to display_name
        user_map = {user['user_id']: user['display_name'] for user in users}

        # Combine roster data with owner names
        league_standings = []
        for roster in rosters:
            owner_id = roster.get('owner_id')
            if owner_id and owner_id in user_map:
                owner_name = user_map[owner_id]
                team_name = roster.get('metadata', {}).get('team_name', owner_name) # Fallback to owner_name
                
                settings = roster.get('settings', {})
                wins = settings.get('wins', 0)
                losses = settings.get('losses', 0)
                ties = settings.get('ties', 0)
                
                fpts_raw = settings.get('fpts', 0)
                fpts_decimal_raw = settings.get('fpts_decimal', 0)
                
                try:
                    fpts = float(fpts_raw) + float(fpts_decimal_raw) / 100
                except (ValueError, TypeError):
                    fpts = 0.0 # Default to 0.0 if conversion fails
                
                league_standings.append({
                    "owner_name": owner_name,
                    "team_name": team_name,
                    "wins": wins,
                    "losses": losses,
                    "ties": ties,
                    "fpts": fpts
                })
        
        # Sort by wins (desc), then fpts (desc)
        league_standings.sort(key=lambda x: (x['wins'], x['fpts']), reverse=True)
        
        return {"league_name": league_name, "standings": league_standings}

    except requests.exceptions.RequestException as e:
        print(f"Error fetching Sleeper data: {e}")
        return None

def generate_site_update_summary(league_data_obj, season):
    """Generates a summary for the Dynasty Site using Google GenAI."""
    if not league_data_obj or not league_data_obj['standings']:
        return "Could not fetch league data to generate a summary."

    league_name = league_data_obj['league_name']
    league_standings = league_data_obj['standings']

    prompt_parts = [
        "You are an AI assistant for a fantasy football dynasty league website. ",
        "Your task is to generate a concise, engaging summary of the current league standings based on the provided data. ",
        "Highlight top performers, interesting facts, or key takeaways that would be useful for a website update. ",
        f"The data is for the {league_name} league for the {season} season. ",
        "Here are the current standings:\n\n"
    ]

    for team in league_standings:
        prompt_parts.append(
            f"- {team['team_name']} ({team['owner_name']}): {team['wins']}-{team['losses']} ({team['ties']} ties), {team['fpts']:.2f} Fpts\n"
        )
    
    prompt_parts.append(
        "\nGenerate the summary in a friendly, engaging tone, suitable for a fan-focused website. "
        "Keep it under 200 words."
    )
    
    prompt = "".join(prompt_parts)
    print("\n--- Sending to GenAI ---")
    
    try:
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        return f"Error generating content with GenAI: {e}"

if __name__ == "__main__":
    print("Starting Dynasty Site Updater...")
    league_data = fetch_sleeper_data(LEAGUE_ID)
    
    if league_data and league_data['standings']:
        print("\n--- Fetched League Standings ---")
        for team in league_data['standings']:
            print(f"{team['team_name']} ({team['owner_name']}): {team['wins']}-{team['losses']} ({team['ties']} ties), {team['fpts']:.2f} Fpts")
        
        genai_summary = generate_site_update_summary(league_data, SEASON)
        print("\n--- GenAI Generated Site Update Summary ---")
        print(genai_summary)
    else:
        print("Failed to fetch Sleeper data or no standings found. Aborting GenAI summary generation.")
