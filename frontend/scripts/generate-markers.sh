#!/bin/bash
# Generate barcode markers at 100%, 110%, and 125% sizes

MARKERS_DIR="$(dirname "$0")/../public/markers"
cd "$MARKERS_DIR"

# Base markers (100% = 226px)
BASE_SIZE=226
SIZE_110=$((BASE_SIZE * 110 / 100))  # 249px
SIZE_125=$((BASE_SIZE * 125 / 100))  # 283px

MARKERS=(
  "barcode-3x3-id1-top-left"
  "barcode-3x3-id6-top-right"
  "barcode-3x3-id12-bottom-left"
  "barcode-3x3-id18-bottom-right"
)

echo "Generating markers at 100%, 110%, 125% sizes..."

for marker in "${MARKERS[@]}"; do
  base_file="${marker}.png"
  
  if [ ! -f "$base_file" ]; then
    echo "Warning: $base_file not found, skipping"
    continue
  fi
  
  # 110% version
  convert "$base_file" -filter point -resize ${SIZE_110}x${SIZE_110} "${marker}-110pct.png"
  echo "Created ${marker}-110pct.png (${SIZE_110}x${SIZE_110})"
  
  # 125% version
  convert "$base_file" -filter point -resize ${SIZE_125}x${SIZE_125} "${marker}-125pct.png"
  echo "Created ${marker}-125pct.png (${SIZE_125}x${SIZE_125})"
done

# Delete old 125pct files if they exist with wrong naming
rm -f *-125pct.png.bak 2>/dev/null

echo ""
echo "Done! Markers generated:"
ls -la *.png | grep -E '(100|110|125)pct|^[^-]*-[^-]*-id[0-9]+-[^-]+\.png$'
