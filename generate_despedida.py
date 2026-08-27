import os


def main():
    content = "Vou kitar dessa porra inteira tmb"
    documents_path = os.path.join(os.path.expanduser('~'), 'Documents')
    file_path = os.path.join(documents_path, 'despedida.txt')
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"File written to {file_path}")


if __name__ == "__main__":
    main()
