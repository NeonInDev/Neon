import os

# Determine the user's Desktop path
desktop_path = os.path.join(os.path.expanduser("~"), "Desktop")

# Path to the target file
file_path = os.path.join(desktop_path, "despedida.txt")

# Check if the file exists
if os.path.isfile(file_path):
    try:
        os.remove(file_path)
        print(f"File '{file_path}' has been deleted.")
    except Exception as e:
        print(f"Error deleting file '{file_path}': {e}")
else:
    print("No file 'despedida.txt' found on the Desktop.")
