/**
 * CSV Parser - Utilidad para parsear archivos CSV respetando
 * las reglas del hackathon (códigos como texto, NA como texto, etc.)
 */

/**
 * Parse CSV text into array of objects.
 * All fields are treated as text strings to preserve leading zeros.
 */
export function parseCSV(text) {
  const cleanText = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  const lines = cleanText.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length === 0) return { headers: [], rows: [] };
  
  const headers = parseLine(lines[0]);
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    if (values.length !== headers.length) continue; // skip malformed lines
    
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = values[j];
    }
    rows.push(obj);
  }
  
  return { headers, rows };
}

/**
 * Parse a single CSV line, handling quoted fields
 */
function parseLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  
  fields.push(current.trim());
  return fields;
}

/**
 * Stringify array of objects to CSV text
 */
export function stringifyCSV(rows, headers) {
  if (!headers && rows.length > 0) {
    headers = Object.keys(rows[0]);
  }
  
  const lines = [headers.join(',')];
  
  for (const row of rows) {
    const values = headers.map(h => {
      const val = row[h] ?? '';
      const str = String(val);
      // Quote if contains comma, newline or quote
      if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    });
    lines.push(values.join(','));
  }
  
  return lines.join('\r\n');
}
