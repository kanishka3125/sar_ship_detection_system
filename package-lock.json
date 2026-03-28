import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dir = path.join(__dirname, 'public', 'models');

const files = [
  { url: 'https://unpkg.com/three-globe/example/img/night-sky.png', name: 'night_sky.png' }
];

async function download() {
  for (const file of files) {
    const res = await fetch(file.url);
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(path.join(dir, file.name), Buffer.from(buffer));
    console.log('Downloaded:', file.name);
  }
}

download();
