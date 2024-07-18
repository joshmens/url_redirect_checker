import os

# Path to the configuration file that stores the API key
CONFIG_FILE_PATH = 'recaptcha_key.txt'

def get_recaptcha_key():
    """Read the Google reCAPTCHA API key from a file or prompt the user to enter it."""
    if not os.path.exists(CONFIG_FILE_PATH) or os.path.getsize(CONFIG_FILE_PATH) == 0:
        # Prompt the user for the API key if the file doesn't exist or is empty
        recaptcha_key = input("Enter your Google reCAPTCHA API key: ")
        with open(CONFIG_FILE_PATH, 'w') as f:
            f.write(recaptcha_key)
    else:
        # Read the existing API key from the file
        with open(CONFIG_FILE_PATH, 'r') as f:
            recaptcha_key = f.read().strip()

    return recaptcha_key

RECAPTCHA_SITE_KEY = get_recaptcha_key()
