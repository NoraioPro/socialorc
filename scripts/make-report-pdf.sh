#!/bin/bash
set -u
SRC="/Users/macminihn/Desktop/Projects/WEB/SocialOrc/docs/MVP-ACTIVATION-REPORT.md"
OUT_DIR="/Users/macminihn/Desktop/Projects/WEB/SocialOrc/docs"
HTML="/tmp/mvp_activation_report.html"
PDF="$OUT_DIR/MVP-ACTIVATION-REPORT.pdf"

# Markdown -> HTML with the `markdown` package, provisioned into a throwaway
# uv environment so nothing is installed into the project.
uv run --quiet --with markdown python - "$SRC" "$HTML" <<'PY'
import sys, markdown, re
src, dst = sys.argv[1], sys.argv[2]
text = open(src, encoding="utf-8").read()

html_body = markdown.markdown(
    text,
    extensions=["tables", "fenced_code", "sane_lists", "toc", "attr_list"],
)

CSS = """
@page { size: A4; margin: 16mm 14mm 16mm 14mm; }
* { box-sizing: border-box; }
body { font: 10.5pt/1.55 -apple-system, "Helvetica Neue", Arial, sans-serif;
       color: #14181f; margin: 0; }
h1 { font-size: 21pt; margin: 0 0 4mm; color: #0b1c3a; letter-spacing: -0.4pt;
     border-bottom: 2.5pt solid #2563eb; padding-bottom: 3mm; }
h2 { font-size: 13.5pt; margin: 8mm 0 2.5mm; color: #0b1c3a;
     border-bottom: 0.6pt solid #cbd5e1; padding-bottom: 1.6mm;
     page-break-after: avoid; }
h3 { font-size: 11.5pt; margin: 5mm 0 2mm; color: #1e3a8a; page-break-after: avoid; }
p, li { orphans: 3; widows: 3; }
code { font-family: "SF Mono", Menlo, monospace; font-size: 8.8pt;
       background: #f1f5f9; padding: 0.5mm 1.2mm; border-radius: 2pt;
       color: #0f172a; }
pre { background: #0f172a; color: #e2e8f0; padding: 3.5mm 4mm; border-radius: 3pt;
      font-size: 8.4pt; line-height: 1.42; overflow-wrap: anywhere;
      page-break-inside: avoid; }
pre code { background: none; color: inherit; padding: 0; font-size: 8.4pt; }
table { border-collapse: collapse; width: 100%; margin: 3mm 0; font-size: 9pt;
        page-break-inside: avoid; }
th { background: #1e3a8a; color: #fff; text-align: left; padding: 2mm 2.4mm;
     font-weight: 600; }
td { border-bottom: 0.5pt solid #dbe2ea; padding: 1.9mm 2.4mm; vertical-align: top; }
tr:nth-child(even) td { background: #f7f9fc; }
blockquote { border-left: 3pt solid #f59e0b; background: #fffbeb;
             margin: 3mm 0; padding: 2.4mm 3.4mm; page-break-inside: avoid; }
blockquote p { margin: 0; }
hr { border: none; border-top: 0.6pt solid #cbd5e1; margin: 6mm 0; }
strong { color: #0b1c3a; }
em { color: #475569; }
ul, ol { padding-left: 5mm; }
"""

open(dst, "w", encoding="utf-8").write(
    f"<!doctype html><html><head><meta charset='utf-8'>"
    f"<title>SocialOrc — MVP Activation &amp; End-to-End Verification Report</title>"
    f"<style>{CSS}</style></head><body>{html_body}</body></html>"
)
print("html bytes:", len(html_body))
PY

if [ ! -f "$HTML" ]; then echo "HTML generation FAILED"; exit 1; fi

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [ ! -x "$CHROME" ]; then
  CHROME=$(ls -d /Applications/*Chrome*.app/Contents/MacOS/* 2>/dev/null | head -1)
fi
echo "chrome: $CHROME"

"$CHROME" --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$PDF" "file://$HTML" >/dev/null 2>&1
sleep 1

if [ -f "$PDF" ]; then
  echo "PDF written: $PDF"
  ls -lh "$PDF" | awk '{print "  size:", $5}'
  python3 -c "
import re,sys
d=open('$PDF','rb').read()
print('  pages:', len(re.findall(rb'/Type\s*/Page[^s]', d)))
"
else
  echo "PDF generation FAILED — will deliver the markdown instead"
fi
