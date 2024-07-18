import logging
from flask import Flask, request, render_template, redirect, flash, abort
import pandas as pd
import requests
import os
from config import RECAPTCHA_SITE_KEY

app = Flask(__name__)
app.secret_key = 'your_secret_key'

# Set up logging
logging.basicConfig(filename='app.log', level=logging.INFO, 
                    format='%(asctime)s %(levelname)s: %(message)s')

def load_allowed_ips():
    """Load allowed IPs from a file."""
    try:
        with open('allowed_ips.txt', 'r') as f:
            return [line.strip() for line in f.readlines() if line.strip()]
    except Exception as e:
        logging.error(f"Error loading allowed IPs: {e}")
        return []

ALLOWED_IPS = load_allowed_ips()

def check_redirects(file_path):
    """Check URL redirects and compare to expected URLs."""
    try:
        df = pd.read_csv(file_path) if file_path.endswith('.csv') else pd.read_excel(file_path)
    except Exception as e:
        logging.error(f"Error reading file: {e}")
        return [("Error", "Error", "Failed to read file")]

    results = []

    for index, row in df.iterrows():
        url_a = row[0]
        expected_redirect_url = row[1]

        try:
            response = requests.get(url_a, allow_redirects=True)
            final_url = response.url

            if final_url == expected_redirect_url:
                results.append((url_a, final_url, 'Correct'))
            else:
                results.append((url_a, final_url, 'Incorrect'))
        except requests.exceptions.RequestException as e:
            logging.error(f"Request error for URL {url_a}: {e}")
            results.append((url_a, 'Error', f"Request error: {e}"))
        except Exception as e:
            logging.error(f"Unexpected error for URL {url_a}: {e}")
            results.append((url_a, 'Error', f"Unexpected error: {e}"))

    return results

@app.before_request
def limit_remote_addr():
    """Restrict access to allowed IPs."""
    client_ip = request.remote_addr
    if client_ip not in ALLOWED_IPS:
        logging.warning(f"Unauthorized access attempt from IP: {client_ip}")
        abort(403)  # Forbidden

@app.route('/', methods=['GET', 'POST'])
def upload_file():
    if request.method == 'POST':
        if 'file' not in request.files:
            flash('No file part')
            return redirect(request.url)

        file = request.files['file']
        
        if file.filename == '':
            flash('No selected file')
            return redirect(request.url)

        try:
            file_path = os.path.join('uploads', file.filename)
            file.save(file_path)

            logging.info(f"File {file.filename} uploaded successfully.")
            results = check_redirects(file_path)
            os.remove(file_path)  # Clean up after processing
        except Exception as e:
            logging.error(f"Error handling file upload: {e}")
            flash('An error occurred while processing the file.')
            return redirect(request.url)

        return render_template('results.html', results=results)

    return render_template('upload.html', recaptcha_site_key=RECAPTCHA_SITE_KEY)

@app.errorhandler(500)
def internal_error(error):
    logging.error(f"Server error: {error}")
    return "An internal error occurred.", 500

@app.errorhandler(404)
def not_found_error(error):
    logging.warning(f"404 error: {error}")
    return "Page not found.", 404

@app.errorhandler(403)
def forbidden_error(error):
    return "Access denied. Your IP is not allowed.", 403

if __name__ == '__main__':
    if not os.path.exists('uploads'):
        os.makedirs('uploads')
    app.run(debug=True)
