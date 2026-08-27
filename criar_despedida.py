import os

# Determine the user's Desktop path
desktop_path = os.path.join(os.path.expanduser("~"), "Desktop")

# Ensure the Desktop directory exists
if not os.path.isdir(desktop_path):
    os.makedirs(desktop_path, exist_ok=True)

# Path to the output file
file_path = os.path.join(desktop_path, "despedida.txt")

# Content to write
content = "Vou kitar dessa porra inteira tmb"

# Write the content to the file
with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print(f"File created at: {file_path}")
