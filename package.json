import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dir = path.join(__dirname, 'public', 'models');
if (!fs.existsSync(dir)){
    fs.mkdirSync(dir, { recursive: true });
}

const files = [
  { url: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg', name: 'earth_atmos_2048.jpg' },
  { url: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_normal_2048.jpg', name: 'earth_normal_2048.jpg' },
  { url: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_specular_2048.jpg', name: 'earth_specular_2048.jpg' },
  { url: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_clouds_1024.png', name: 'earth_clouds_1024.png' }
];

files.forEach(file => {
  const fileStream = fs.createWriteStream(path.join(dir, file.name));
  https.get(file.url, function(response) {
    if(response.statusCode === 200) {
        response.pipe(fileStream);
        fileStream.on('finish', function() {
          fileStream.close();
          console.log('Downloaded: ' + file.name);
        });
    } else {
        console.log('Error downloading ' + file.name + ': HTTP ' + response.statusCode);
    }
  }).on('error', function(err) {
    fs.unlinkSync(path.join(dir, file.name));
    console.error('Error downloading ' + file.name + ':', err.message);
  });
});
