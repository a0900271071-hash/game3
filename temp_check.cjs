
const { PNG } = require('pngjs');
const fs = require('fs');

const files = ['erik_left1.png', 'erik_left2.png', 'erik_right1.png', 'erik_right2.png'];
for (const f of files) {
  const p = 'src/assets/images/' + f;
  const data = fs.readFileSync(p);
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
  console.log(f, 'Avg X:', (sumX / count).toFixed(1), 'Width:', png.width);
}
