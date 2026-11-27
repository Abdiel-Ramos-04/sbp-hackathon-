"""
Convert markdown table files from the hackathon package into proper CSV files.
The MD files have pipe-delimited tables that need to be parsed.
"""
import os
import csv
import sys

HACKATHON_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '..', 'hackathon_files', 'Hackathon')
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'server', 'data')

FILES_TO_CONVERT = [
    'AT03_sintetico_202607.md',
    'AT03_sintetico_202608.md',
    'AT03_sintetico_202609.md',
    'Bancos_ficticios.md',
    'Catalogo_CINU_SB109_reto.md',
    'Tabla_SB21_simplificada.md',
    'Diccionario_datos_AT03_reto.md',
]

def parse_md_table(filepath):
    """Parse a markdown file containing a pipe-delimited table."""
    rows = []
    header = None
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line.startswith('|'):
                continue
            # Split by pipe, strip whitespace
            cells = [c.strip() for c in line.split('|')]
            # Remove empty first and last elements (from leading/trailing pipes)
            cells = cells[1:-1]
            
            if header is None:
                header = cells
                continue
            # Skip separator line (--- | --- | ---)
            if all(c.replace('-', '').replace(':', '').strip() == '' for c in cells):
                continue
            rows.append(cells)
    return header, rows

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    for filename in FILES_TO_CONVERT:
        src = os.path.join(HACKATHON_DIR, filename)
        if not os.path.exists(src):
            print(f"WARNING: {src} not found, skipping")
            continue
        
        csv_name = filename.replace('.md', '.csv')
        dst = os.path.join(OUTPUT_DIR, csv_name)
        
        print(f"Converting {filename} -> {csv_name}...", end=' ')
        header, rows = parse_md_table(src)
        
        if header is None:
            print("No table found!")
            continue
        
        with open(dst, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(header)
            writer.writerows(rows)
        
        print(f"{len(rows)} rows written")

if __name__ == '__main__':
    main()
