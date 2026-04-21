// 生成 StandUpReminder 图标
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

// 图标尺寸
const SIZE = 32;

// 创建 PNG 图标的函数
function createIcon(filename, bgColor, textColor, statusText) {
  const png = new PNG({ width: SIZE, height: SIZE });
  
  // 颜色转换
  const bgR = parseInt(bgColor.slice(1, 3), 16);
  const bgG = parseInt(bgColor.slice(3, 5), 16);
  const bgB = parseInt(bgColor.slice(5, 7), 16);
  
  const textR = parseInt(textColor.slice(1, 3), 16);
  const textG = parseInt(textColor.slice(3, 5), 16);
  const textB = parseInt(textColor.slice(5, 7), 16);
  
  // 绘制圆形背景
  const centerX = SIZE / 2;
  const centerY = SIZE / 2;
  const radius = SIZE / 2 - 1;
  
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const idx = (SIZE * y + x) << 2;
      const dx = x - centerX + 0.5;
      const dy = y - centerY + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist <= radius) {
        // 圆形内部
        png.data[idx] = bgR;
        png.data[idx + 1] = bgG;
        png.data[idx + 2] = bgB;
        png.data[idx + 3] = 255;
        
        // 绘制简单的站立人形
        // 头部
        const headCx = centerX;
        const headCy = 10;
        const headR = 4;
        
        // 身体
        const bodyTop = 13;
        const bodyBottom = 22;
        const bodyWidth = 4;
        
        // 手臂
        const armY1 = 15;
        const armY2 = 19;
        const armSpread = 6;
        
        // 腿部
        const legTop = bodyBottom;
        const legBottom = 27;
        const legWidth = 3;
        const legSpread = 5;
        
        let isPart = false;
        
        // 头部
        const headDx = x - headCx;
        const headDy = y - headCy;
        if (headDx * headDx + headDy * headDy <= headR * headR) {
          isPart = true;
        }
        
        // 身体
        if (x >= headCx - bodyWidth && x <= headCx + bodyWidth && 
            y >= bodyTop && y <= bodyBottom) {
          isPart = true;
        }
        
        // 左臂
        if ((x >= headCx - armSpread - 1 && x <= headCx - armSpread + 2 &&
             y >= armY1 && y <= armY2) ||
            (x >= headCx - armSpread && x <= headCx - 1 &&
             y >= armY1 - 2 && y <= armY2 + 2)) {
          isPart = true;
        }
        
        // 右臂
        if ((x >= headCx + armSpread - 2 && x <= headCx + armSpread + 1 &&
             y >= armY1 && y <= armY2) ||
            (x >= headCx + 1 && x <= headCx + armSpread &&
             y >= armY1 - 2 && y <= armY2 + 2)) {
          isPart = true;
        }
        
        // 左腿
        if ((x >= headCx - legSpread - legWidth && x <= headCx - legSpread + legWidth &&
             y >= legTop && y <= legBottom) ||
            (x >= headCx - legSpread && x <= headCx &&
             y >= legTop && y <= legBottom + 2)) {
          isPart = true;
        }
        
        // 右腿
        if ((x >= headCx + legSpread - legWidth && x <= headCx + legSpread + legWidth &&
             y >= legTop && y <= legBottom) ||
            (x >= headCx && x <= headCx + legSpread &&
             y >= legTop && y <= legBottom + 2)) {
          isPart = true;
        }
        
        if (isPart) {
          png.data[idx] = textR;
          png.data[idx + 1] = textG;
          png.data[idx + 2] = textB;
          png.data[idx + 3] = 255;
        }
      } else {
        // 圆形外部 - 透明
        png.data[idx] = 0;
        png.data[idx + 1] = 0;
        png.data[idx + 2] = 0;
        png.data[idx + 3] = 0;
      }
    }
  }
  
  return png;
}

// 生成图标
console.log('生成图标...');

// 红色图标（监控中）- 白色人形
const redIcon = createIcon('icon-red.png', '#ef4444', '#ffffff', 'ACTIVE');
const redBuffer = PNG.sync.write(redIcon);
fs.writeFileSync(path.join(__dirname, 'assets', 'icon-red.png'), redBuffer);
console.log('已生成: assets/icon-red.png (监控中)');

// 绿色图标（停止）- 白色人形
const greenIcon = createIcon('icon-green.png', '#22c55e', '#ffffff', 'STOP');
const greenBuffer = PNG.sync.write(greenIcon);
fs.writeFileSync(path.join(__dirname, 'assets', 'icon-green.png'), greenBuffer);
console.log('已生成: assets/icon-green.png (停止)');

// 还要创建原始的 icon.png 作为默认
fs.copyFileSync(
  path.join(__dirname, 'assets', 'icon-green.png'),
  path.join(__dirname, 'assets', 'icon.png')
);
console.log('已生成: assets/icon.png (默认)');

console.log('完成!');
