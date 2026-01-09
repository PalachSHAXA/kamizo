#!/usr/bin/env node
// Script to generate PWA icons from a base icon

const fs = require('fs');
const path = require('path');

// Icon sizes needed for PWA
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

// SVG template for the MyHelper logo - house with wrench
const createSvgIcon = (size) => `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#FACC14"/>
      <stop offset="100%" style="stop-color:#F59E0B"/>
    </linearGradient>
  </defs>
  <!-- Background circle -->
  <circle cx="256" cy="256" r="256" fill="url(#bg)"/>
  <!-- House shape -->
  <path d="M256 100 L416 220 L416 400 L96 400 L96 220 Z" fill="white" stroke="none"/>
  <!-- Roof -->
  <path d="M256 60 L456 230 L436 250 L256 100 L76 250 L56 230 Z" fill="white"/>
  <!-- Door -->
  <rect x="216" y="280" width="80" height="120" rx="8" fill="#FACC14"/>
  <!-- Door handle -->
  <circle cx="276" cy="340" r="8" fill="white"/>
  <!-- Window left -->
  <rect x="130" y="260" width="60" height="60" rx="4" fill="#60A5FA"/>
  <line x1="160" y1="260" x2="160" y2="320" stroke="white" stroke-width="3"/>
  <line x1="130" y1="290" x2="190" y2="290" stroke="white" stroke-width="3"/>
  <!-- Window right -->
  <rect x="322" y="260" width="60" height="60" rx="4" fill="#60A5FA"/>
  <line x1="352" y1="260" x2="352" y2="320" stroke="white" stroke-width="3"/>
  <line x1="322" y1="290" x2="382" y2="290" stroke="white" stroke-width="3"/>
</svg>`;

// Directories to create icons in
const dirs = [
  path.join(__dirname, '../src/frontend/public/icons'),
  path.join(__dirname, '../cloudflare/public/icons')
];

// Create directories if they don't exist
dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Generate icons
sizes.forEach(size => {
  const svg = createSvgIcon(size);
  dirs.forEach(dir => {
    const filePath = path.join(dir, `icon-${size}x${size}.svg`);
    fs.writeFileSync(filePath, svg);
    console.log(`Created: ${filePath}`);
  });
});

console.log('\nIcons generated successfully!');
console.log('\nNote: For production, convert SVG to PNG using a tool like sharp, ImageMagick, or online converter.');
console.log('SVG icons work in most modern browsers but PNG is more widely supported.');
