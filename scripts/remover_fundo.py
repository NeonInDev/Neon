from rembg import remove
from PIL import Image
import sys
import os

def remover_fundo(input_path, output_path=None):
    if not output_path:
        base, ext = os.path.splitext(input_path)
        output_path = f"{base}_sem_fundo.png"

    with open(input_path, "rb") as f:
        input_data = f.read()

    output_data = remove(input_data)

    with open(output_path, "wb") as f:
        f.write(output_data)

    img = Image.open(output_path)
    print(f"OK: {output_path}")
    print(f"  Dimensoes: {img.size}")
    print(f"  Modo: {img.mode}")
    return output_path

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python remover_fundo.py <entrada> [saida]")
        sys.exit(1)
    entrada = sys.argv[1]
    saida = sys.argv[2] if len(sys.argv) > 2 else None
    remover_fundo(entrada, saida)
