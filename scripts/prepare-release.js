#!/usr/bin/env node
/**
 * Prepare Release Package
 * Creates a properly structured release folder with all necessary files
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const RELEASE_DIR = path.join(ROOT_DIR, 'release');

console.log('Preparing release package...\n');

// Ensure release directory exists
if (!fs.existsSync(RELEASE_DIR)) {
  console.log('❌ No release directory found. Run build first.');
  process.exit(1);
}

// Create README for release
const readmeContent = `# Vision Studio v3.0.0 - Windows Release

## 🚀 Quick Start

### Option 1: Installer (Recommended)
1. Run \`Vision-Studio-Setup-3.0.0.exe\`
2. Follow the installation wizard
3. Launch from Start Menu or Desktop

### Option 2: Portable
1. Run \`Vision-Studio-Portable-3.0.0.exe\`
2. No installation required
3. Can run from USB drive

## 💻 System Requirements

- Windows 10/11 64-bit
- 8 GB RAM (16 GB recommended)
- 10 GB free disk space (50 GB recommended for AI models)
- NVIDIA GPU with 8GB+ VRAM (optional, for faster generation)
- Internet connection (for downloading AI models on first use)

## 📋 What's Included

This package contains:
- Vision Studio application
- Python AI backend${fs.existsSync(path.join(RELEASE_DIR, 'VisionStudio-Backend.exe')) ? ' (bundled)' : ' (download on first run)'}
- All required dependencies

## 🎯 First Launch

On first run:
1. GPU will be detected automatically
2. AI models will download as needed (2-24 GB per model)
3. App will be ready to use!

## 🔧 Troubleshooting

### "Windows protected your PC" Warning
Click "More info" then "Run anyway". This happens because the app is not code-signed.

To fix permanently: Right-click → Properties → Unblock

### App Won't Start
- Install Visual C++ Redistributables:
  https://aka.ms/vs/17/release/vc_redist.x64.exe
- Ensure Windows is up to date
- Check Windows Defender isn't blocking the app

### Slow Generation
- Check Settings → GPU is detected
- Lower image resolution (e.g., 512x512 instead of 1024x1024)
- Reduce sampling steps (e.g., 20 instead of 30)

### Out of Memory
- Close other applications
- Reduce batch size
- Use smaller models (SD 1.5 instead of FLUX)

## 📞 Support

- GitHub: https://github.com/Git-Rocky-Stack/vision-studio
- Documentation: See README.md in the repository

## 📄 License

MIT License - See LICENSE.txt for details

## 🙏 Credits

- FLUX by Black Forest Labs
- Stable Diffusion by Stability AI
- LTX Video by Lightricks
- Built with Electron, React, and FastAPI

---
Version: 3.0.0
Build Date: ${new Date().toISOString().split('T')[0]}
`;

fs.writeFileSync(path.join(RELEASE_DIR, 'README.txt'), readmeContent);
console.log('✅ Created README.txt');

// Create a simple LICENSE file if not exists
const licensePath = path.join(RELEASE_DIR, 'LICENSE.txt');
if (!fs.existsSync(licensePath)) {
  const licenseContent = `MIT License

Copyright (c) 2024 Vision Studio Team

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
`;
  fs.writeFileSync(licensePath, licenseContent);
  console.log('✅ Created LICENSE.txt');
}

// Create checksums
const crypto = require('crypto');
const files = fs.readdirSync(RELEASE_DIR).filter(f => f.endsWith('.exe'));

if (files.length > 0) {
  let checksumContent = '# Checksums (SHA256)\n\n';
  
  for (const file of files) {
    const filePath = path.join(RELEASE_DIR, file);
    const hash = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
    checksumContent += `${hash}  ${file}\n`;
    console.log(`✅ Generated checksum for ${file}`);
  }
  
  fs.writeFileSync(path.join(RELEASE_DIR, 'checksums.txt'), checksumContent);
}

console.log('\n📦 Release package prepared!');
console.log(`📁 Location: ${RELEASE_DIR}\n`);

// List all files
const allFiles = fs.readdirSync(RELEASE_DIR);
console.log('Files in release folder:');
for (const file of allFiles) {
  const stats = fs.statSync(path.join(RELEASE_DIR, file));
  if (stats.isFile()) {
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`  📄 ${file} (${sizeMB} MB)`);
  }
}

console.log('\n✨ Ready for distribution!');
