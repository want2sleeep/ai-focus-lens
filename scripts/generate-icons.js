
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

const ICONS_DIR = path.join(__dirname, '../src/icons');
const SIZES = [16, 32, 48, 128];

// Ensure icons directory exists
if (!fs.existsSync(ICONS_DIR)) {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
}

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#4285F4'; // Google Blue
  ctx.fillRect(0, 0, size, size);

  // Text
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold ${Math.round(size * 0.6)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // For very small icons, just draw a shape
  if (size <= 16) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(4, 4, 8, 8);
  } else {
    ctx.fillText('AI', size / 2, size / 2);
  }

  const buffer = canvas.toBuffer('image/png');
  const filePath = path.join(ICONS_DIR, `icon-${size}.png`);
  fs.writeFileSync(filePath, buffer);
  console.log(`Generated ${filePath}`);
}

try {
  SIZES.forEach(generateIcon);
  console.log('All icons generated successfully.');
} catch (error) {
  console.error('Error generating icons:', error);
  // Fallback if canvas is not available (which is likely in some environments)
  console.log('Canvas package might be missing. Using fallback generation method...');
  process.exit(1);
}
