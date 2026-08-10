#!/usr/bin/env python3
"""
Automated Google search using Selenium.

This script demonstrates how to:
1. Launch the default web browser (Chrome by default).
2. Navigate to https://www.google.com.
3. Enter a search query into the search box.
4. Submit the query by pressing Enter.
5. Wait until the results page loads.
6. Capture the page title.
7. Persist the title to a file named `resultado.txt` in the same directory.

The script contains detailed comments explaining each step.
"""

import time
from pathlib import Path

# Selenium imports
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# ---------------------------------------------------------------------------
# 1. Configure the WebDriver
# ---------------------------------------------------------------------------
# Selenium requires a driver executable that matches the browser version.
# For Chrome, the `chromedriver` binary must be in PATH or in the same
# directory as this script.  The `webdriver.Chrome()` constructor will
# automatically locate the executable.
#
# If you prefer a different browser, replace `Chrome()` with the
# appropriate constructor (e.g., `Firefox()`).
# ---------------------------------------------------------------------------

# Create a new Chrome browser instance.
# `options` can be used to customize the browser (headless, incognito, etc.).
# Here we use the default settings to open the standard GUI browser.
browser = webdriver.Chrome()

# ---------------------------------------------------------------------------
# 2. Navigate to Google
# ---------------------------------------------------------------------------
browser.get("https://www.google.com")

# ---------------------------------------------------------------------------
# 3. Locate the search input field
# ---------------------------------------------------------------------------
# Google’s search box has the name attribute "q".  We wait until the element
# is present in the DOM and visible before interacting with it.
search_box = WebDriverWait(browser, 10).until(
    EC.presence_of_element_located((By.NAME, "q"))
)

# ---------------------------------------------------------------------------
# 4. Enter the query and submit
# ---------------------------------------------------------------------------
query = "Oi, Jamal!"
search_box.clear()          # Ensure the field is empty before typing.
search_box.send_keys(query) # Type the query.
search_box.send_keys(Keys.RETURN)  # Press Enter to submit.

# ---------------------------------------------------------------------------
# 5. Wait for the results page to load
# ---------------------------------------------------------------------------
# We wait until the title contains the search query, which indicates that
# the results page has finished loading.
WebDriverWait(browser, 10).until(
    EC.title_contains(query)
)

# ---------------------------------------------------------------------------
# 6. Capture the page title
# ---------------------------------------------------------------------------
page_title = browser.title
print(f"Page title captured: {page_title}")

# ---------------------------------------------------------------------------
# 7. Persist the title to resultado.txt
# ---------------------------------------------------------------------------
# The script’s directory is obtained via pathlib.  The file is written
# in UTF‑8 encoding.
script_dir = Path(__file__).parent
output_file = script_dir / "resultado.txt"
with open(output_file, "w", encoding="utf-8") as f:
    f.write(page_title)

# ---------------------------------------------------------------------------
# 8. Clean up
# ---------------------------------------------------------------------------
# Close the browser window and terminate the WebDriver session.
browser.quit()

# End of script.
