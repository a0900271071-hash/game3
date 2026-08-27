
    const { PNG } = require('pngjs');
    const fs = require('fs');
    const data = fs.readFileSync('src/assets/images/erik_left1.png');
    const png = PNG.sync.read(data);
    let sumX = 0, count = 0;
    for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < png.width; x++) {
        const idx = (y * png.width + x) * 4;
        if (png.data[idx + 3] > 10) {
          sumX += x;
          count++;
        }
      }
    }
    console.log('erik_left1.png', 'Avg X:', (sumX / count).toFixed(1), 'Width:', png.width);
  