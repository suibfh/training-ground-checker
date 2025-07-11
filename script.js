document.addEventListener('DOMContentLoaded', () => {
    const imageUpload = document.getElementById('imageUpload');
    const statusCanvas = document.getElementById('statusCanvas');
    const ctx = statusCanvas.getContext('2d');
    const overlayMessage = document.getElementById('overlayMessage');
    const resultsDiv = document.getElementById('results');
    const copyResultsBtn = document.getElementById('copyResults');

    let uploadedImage = null;

    const STATUS_BARS = [
        // ***** HPバー本体のカラーコードを更新 *****
        { name: 'HP', color: { r: 252, g: 227, b: 125 } },    // #FCE37D
        { name: '攻撃', color: { r: 214, g: 107, b: 135 } },   // #D66B87
        { name: '魔攻', color: { r: 85, g: 134, b: 200 } },    // #5586C8
        { name: '防御', color: { r: 237, g: 170, b: 118 } },   // #EDAA76
        { name: '魔防', color: { r: 140, g: 210, b: 236 } },   // #8CD2EC
        { name: '敏捷', color: { r: 115, g: 251, b: 211 } }    // #73FBD3
    ];

    const COLOR_TOLERANCE = 30; // RGB値の二乗誤差のしきい値

    // ***** バーの枠線カラーコードを更新 *****
    const WHITE_COLOR = { r: 255, g: 253, b: 254 }; // #FFFDFE (補助線)

    const BACKGROUND_COLOR_TYPE1 = { r: 70, g: 51, b: 25 }; // #463319 (攻撃、防御、敏捷の背景)
    const BACKGROUND_COLOR_TYPE2 = { r: 88, g: 69, b: 36 }; // #584524 (HP、魔攻、魔防の背景)

    /**
     * 指定された座標のピクセルのRGB値を取得
     */
    function getPixelColor(imageData, x, y) {
        if (x < 0 || x >= imageData.width || y < 0 || y >= imageData.height) {
            return { r: -1, g: -1, b: -1 };
        }
        const index = (y * imageData.width + x) * 4;
        return {
            r: imageData.data[index],
            g: imageData.data[index + 1],
            b: imageData.data[index + 2]
        };
    }

    /**
     * 2つの色が許容範囲内にあるか判定
     */
    function isColorClose(color1, color2, tolerance) {
        const dr = color1.r - color2.r;
        const dg = color1.g - color2.g;
        const db = color1.b - color2.b;
        return (dr * dr + dg * dg + db * db) < (tolerance * tolerance);
    }

    /**
     * ピクセルがどちらかの背景色に近いか判定
     */
    function isColorCloseToAnyBackground(pixelColor, tolerance) {
        return isColorClose(pixelColor, BACKGROUND_COLOR_TYPE1, tolerance) || 
               isColorClose(pixelColor, BACKGROUND_COLOR_TYPE2, tolerance);
    }

    /**
     * 指定されたY座標で垂直線を検出する汎用関数
     */
    function findVerticalLine(imageData, y, targetColor, minWidth, direction) {
        const width = imageData.width;
        let lineStart = null;
        let consecutivePixels = 0;

        const startX = direction === 'leftToRight' ? 0 : width - 1;
        const endX = direction === 'leftToRight' ? width : -1;
        const step = direction === 'leftToRight' ? 1 : -1;

        for (let x = startX; x !== endX; x += step) {
            const color = getPixelColor(imageData, x, y);
            if (isColorClose(color, targetColor, COLOR_TOLERANCE)) {
                consecutivePixels++;
                if (lineStart === null) {
                    lineStart = x;
                }
            } else {
                if (consecutivePixels >= minWidth) {
                    return direction === 'leftToRight' ? lineStart : x + step;
                }
                consecutivePixels = 0;
                lineStart = null;
            }
        }
        if (consecutivePixels >= minWidth) {
            return direction === 'leftToRight' ? lineStart : (startX + step) - (step * consecutivePixels);
        }
        return null;
    }

    imageUpload.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            uploadedImage = new Image();
            uploadedImage.onload = () => {
                statusCanvas.width = uploadedImage.width;
                statusCanvas.height = uploadedImage.height;

                ctx.clearRect(0, 0, statusCanvas.width, statusCanvas.height);
                ctx.drawImage(uploadedImage, 0, 0, uploadedImage.width, uploadedImage.height);

                overlayMessage.style.display = 'none';

                analyzeImage();

                copyResultsBtn.classList.remove('hidden');
            };
            uploadedImage.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });

    function analyzeImage() {
        if (!uploadedImage) {
            resultsDiv.innerHTML = '<p>画像をアップロードしてください。</p>';
            return;
        }

        resultsDiv.innerHTML = '<p>解析中...</p>';
        const imageData = ctx.getImageData(0, 0, statusCanvas.width, statusCanvas.height);
        const width = imageData.width;
        const height = imageData.height;

        let startX = null;
        let maxX = null;
        
        // 1. 基準線 (startX, maxX) の検出
        const sampleYRangeStart = Math.floor(height * 0.2);
        const sampleYRangeEnd = Math.floor(height * 0.8);
        const sampleStepYForLines = 10;

        let startXCandidates = {};
        let maxXCandidates = {};

        for (let y = sampleYRangeStart; y < sampleYRangeEnd; y += sampleStepYForLines) {
            const foundStartX = findVerticalLine(imageData, y, WHITE_COLOR, 1, 'leftToRight');
            if (foundStartX !== null) {
                startXCandidates[foundStartX] = (startXCandidates[foundStartX] || 0) + 1;
            }

            const foundMaxX = findVerticalLine(imageData, y, WHITE_COLOR, 3, 'rightToLeft');
            if (foundMaxX !== null) {
                maxXCandidates[foundMaxX] = (maxXCandidates[foundMaxX] || 0) + 1;
            }
        }

        startX = Object.keys(startXCandidates).reduce((a, b) => startXCandidates[a] > startXCandidates[b] ? a : b, null);
        maxX = Object.keys(maxXCandidates).reduce((a, b) => maxXCandidates[a] > maxXCandidates[b] ? a : b, null);

        if (startX !== null) startX = parseInt(startX, 10);
        if (maxX !== null) maxX = parseInt(maxX, 10);
        
        console.log("Detected startX:", startX, "Detected maxX:", maxX);

        if (startX === null || maxX === null || maxX <= startX) {
            resultsDiv.innerHTML = '<p style="color: red;">基準線（左右の白い線）が見つかりませんでした。画像を正しくトリミングしているか確認してください。</p>';
            return;
        }

        // 2. 各ステータスバーのY座標の特定
        const detectedBarYColors = []; 

        // ***** sampleXForBarY をさらに右に移動 (例: startX + 200) *****
        // バーの長さが80%あるのであれば、グラデーション部分を確実に避けて、
        // バー本体の色が安定して現れる位置を狙う
        const sampleXForBarY = startX + 200; 

        if (sampleXForBarY < 0 || sampleXForBarY >= width) {
             console.error("sampleXForBarY が画像範囲外です:", sampleXForBarY, "width:", width);
             resultsDiv.innerHTML = '<p style="color: red;">内部エラー: バーのY座標検出位置が範囲外です。sampleXForBarYの値を調整してください。</p>';
             return;
        }

        const barDetectYStart = Math.floor(height * 0.2);
        const barDetectYEnd = Math.floor(height * 0.9);
        const barDetectStepY = 1; 

        const BAR_VERTICAL_SEPARATION_THRESHOLD = 30; // バー間の最小間隔

        for (let y = barDetectYStart; y < barDetectYEnd; y += barDetectStepY) {
            let isTooCloseToDetected = false;
            for (const detectedItem of detectedBarYColors) {
                if (Math.abs(y - detectedItem.y) < BAR_VERTICAL_SEPARATION_THRESHOLD) {
                    isTooCloseToDetected = true;
                    break;
                }
            }
            if (isTooCloseToDetected) continue;

            const pixel = getPixelColor(imageData, sampleXForBarY, y);

            let closestBarInfo = null;
            let minColorDiff = Infinity;

            for (const barInfo of STATUS_BARS) {
                const dr = pixel.r - barInfo.color.r;
                const dg = pixel.g - barInfo.color.g;
                const db = pixel.b - barInfo.b;
                const currentDiff = (dr * dr + dg * dg + db * db);

                if (currentDiff < minColorDiff && currentDiff < (COLOR_TOLERANCE * COLOR_TOLERANCE)) {
                    minColorDiff = currentDiff;
                    closestBarInfo = barInfo;
                }
            }

            if (closestBarInfo !== null) {
                detectedBarYColors.push({ y: y, barInfo: closestBarInfo });
            }

            if (detectedBarYColors.length >= STATUS_BARS.length * 2) { 
                break;
            }
        }
        
        detectedBarYColors.sort((a, b) => a.y - b.y);

        const finalBarYsMap = new Map();
        const usedYIndices = new Set();

        for (const barInfo of STATUS_BARS) {
            let assignedY = null;
            let bestMatchIndex = -1;
            let minColorDiffForAssign = Infinity;

            for (let j = 0; j < detectedBarYColors.length; j++) {
                if (usedYIndices.has(j)) continue;

                const detectedItem = detectedBarYColors[j];
                const colorDiff = Math.sqrt(
                    Math.pow(detectedItem.barInfo.color.r - barInfo.color.r, 2) +
                    Math.pow(detectedItem.barInfo.color.g - barInfo.color.g, 2) +
                    Math.pow(detectedItem.barInfo.color.b - barInfo.color.b, 2)
                );

                if (colorDiff < minColorDiffForAssign) {
                    minColorDiffForAssign = colorDiff;
                    assignedY = detectedItem.y;
                    bestMatchIndex = j;
                }
            }

            if (assignedY !== null && minColorDiffForAssign < (COLOR_TOLERANCE * 2.0)) { 
                finalBarYsMap.set(barInfo.name, assignedY);
                usedYIndices.add(bestMatchIndex);
            } else {
                console.warn(`Warning: Could not reliably find Y coordinate for ${barInfo.name}. Setting to 0%.`);
                finalBarYsMap.set(barInfo.name, null);
            }
        }

        const actualDefiniteBarYs = [];
        for (const barInfo of STATUS_BARS) {
            actualDefiniteBarYs.push(finalBarYsMap.get(barInfo.name));
        }

        console.log("Final Bar Ys (mapped):", actualDefiniteBarYs);

        if (actualDefiniteBarYs.some(y => y === null) || actualDefiniteBarYs.length < STATUS_BARS.length) {
            resultsDiv.innerHTML = `<p style="color: red;">ステータスバーのY座標の特定に失敗しました。すべてのバーが見つからないか、バー間の間隔が広すぎる可能性があります。</p><p style="color: red;">現在の検出数: ${actualDefiniteBarYs.filter(y => y !== null).length}/${STATUS_BARS.length}</p>`;
            return;
        }

        // 3. 各ステータスバーの右端 (`currentX`) の検出とパーセンテージ計算
        const finalResults = [];
        const BACKGROUND_TRANSITION_TOLERANCE = COLOR_TOLERANCE * 1.5; 

        for (let i = 0; i < STATUS_BARS.length; i++) {
            const barInfo = STATUS_BARS[i];
            const barY = actualDefiniteBarYs[i]; 
            let currentX = startX;
            
            const isType1Background = (barInfo.name === '攻撃' || barInfo.name === '防御' || barInfo.name === '敏捷');
            const targetBackgroundColor = isType1Background ? BACKGROUND_COLOR_TYPE1 : BACKGROUND_COLOR_TYPE2;

            let noBarColorOrGradationCount = 0; 
            const NO_BAR_COLOR_THRESHOLD = 5; 

            for (let x = startX; x <= maxX; x++) {
                const pixel = getPixelColor(imageData, x, barY);
                
                const isMainBarColor = isColorClose(pixel, barInfo.color, COLOR_TOLERANCE);
                const isBackgroundColor = isColorClose(pixel, targetBackgroundColor, BACKGROUND_TRANSITION_TOLERANCE);

                if (isMainBarColor) {
                    currentX = x;
                    noBarColorOrGradationCount = 0;
                } else if (!isBackgroundColor) {
                    // メインの色ではないが、背景色でもない場合（＝グラデーションの可能性が高い）
                    currentX = x; 
                    noBarColorOrGradationCount = 0;
                } else {
                    noBarColorOrGradationCount++;
                    if (noBarColorOrGradationCount >= NO_BAR_COLOR_THRESHOLD) {
                        break; 
                    }
                }
            }

            const length = currentX - startX;
            const maxLength = maxX - startX;
            let percentage = 0;

            if (maxLength > 0) {
                percentage = (length / maxLength) * 100;
            }

            percentage = Math.round(percentage);

            finalResults.push(`<p>${barInfo.name}: ${percentage}%</p>`);
        }

        resultsDiv.innerHTML = finalResults.join('');
    }

    copyResultsBtn.addEventListener('click', () => {
        let textToCopy = '';
        resultsDiv.querySelectorAll('p').forEach(p => {
            textToCopy += p.innerText + '\n';
        });
        
        navigator.clipboard.writeText(textToCopy.trim()).then(() => {
            alert('結果をコピーしました！');
        }).catch(err => {
                console.error('コピーに失敗しました:', err);
            alert('コピーに失敗しました。手動でコピーしてください。');
        });
    });
});
