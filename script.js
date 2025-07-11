document.addEventListener('DOMContentLoaded', () => {
    const imageUpload = document.getElementById('imageUpload');
    const statusCanvas = document.getElementById('statusCanvas');
    const ctx = statusCanvas.getContext('2d');
    const overlayMessage = document.getElementById('overlayMessage');
    const resultsDiv = document.getElementById('results');
    const copyResultsBtn = document.getElementById('copyResults');

    let uploadedImage = null;

    const STATUS_BARS = [
        { name: 'HP', color: { r: 252, g: 227, b: 125 } },    // #FCE37D (HPバー本体色)
        { name: '攻撃', color: { r: 214, g: 107, b: 135 } },   // #D66B87
        { name: '魔攻', color: { r: 85, g: 134, b: 200 } },    // #5586C8
        { name: '防御', color: { r: 237, g: 170, b: 118 } },   // #EDAA76
        { name: '魔防', color: { r: 140, g: 210, b: 236 } },   // #8CD2EC
        { name: '敏捷', color: { r: 115, g: 251, b: 211 } }    // #73FBD3
    ];

    const COLOR_TOLERANCE = 30; // RGB値の二乗誤差のしきい値

    const LEFT_BORDER_LINE_COLOR = { r: 255, g: 255, b: 241 }; // #FFFFF1 (バーの左端「｜」と未到達部分「＿」の線)

    const BACKGROUND_COLOR_TYPE1 = { r: 70, g: 51, b: 25 }; // #463319 (攻撃、防御、敏捷の背景)
    const BACKGROUND_COLOR_TYPE2 = { r: 88, g: 69, b: 36 }; // #584524 (HP、魔攻、魔防の背景)
    const BACKGROUND_COLOR_GENERAL = { r: 75, g: 56, b: 33 }; // #4B3821 (バー領域外の一般的な背景色)

    const HP_GRADIENT_START_COLOR_UNDERSCORE = { r: 88, g: 69, b: 36 }; // #584524 (未到達部分グラデーション開始)
    const HP_GRADIENT_END_COLOR_UNDERSCORE = { r: 86, g: 66, b: 37 }; // #564225 (未到達部分グラデーション終了)

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
     * ピクセルがどちらかの背景色に近いか判定 (バー内部の背景色)
     */
    function isColorCloseToBarBackground(pixelColor, tolerance) {
        return isColorClose(pixelColor, BACKGROUND_COLOR_TYPE1, tolerance) || 
               isColorClose(pixelColor, BACKGROUND_COLOR_TYPE2, tolerance);
    }

    /**
     * ピクセルが一般的な背景色に近いか判定 (バー領域外の背景色)
     */
    function isColorCloseToGeneralBackground(pixelColor, tolerance) {
        return isColorClose(pixelColor, BACKGROUND_COLOR_GENERAL, tolerance);
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
        let tempHpBarY = null;

        // --- 1. HPバーのY座標を特定 ---
        // 画像の左から25%程度のX座標でHPバー本体色を探す
        const SCAN_X_FOR_HP_BAR_Y = Math.floor(width * 0.25); 

        for (let y = 0; y < height; y++) {
            const pixel = getPixelColor(imageData, SCAN_X_FOR_HP_BAR_Y, y);
            if (isColorClose(pixel, STATUS_BARS[0].color, COLOR_TOLERANCE)) {
                tempHpBarY = y;
                break; 
            }
        }
        
        if (tempHpBarY === null) {
            resultsDiv.innerHTML = `<p style="color: red;">HPバーのY座標を特定できませんでした。画像内のX座標 ${SCAN_X_FOR_HP_BAR_Y} あたりにHPバー本体の色が見つかりません。画像を正しくトリミングしているか確認してください。</p>`;
            console.error("HP bar Y not found for startX/maxX detection. Scan X:", SCAN_X_FOR_HP_BAR_Y);
            return;
        }

        // --- 2. startX の検出: HPバーのY座標を使って「｜」線のX座標を探す ---
        const START_LINE_SCAN_TOLERANCE = COLOR_TOLERANCE; 
        for (let x = 0; x < width; x++) {
            const pixel = getPixelColor(imageData, x, tempHpBarY);
            if (isColorClose(pixel, LEFT_BORDER_LINE_COLOR, START_LINE_SCAN_TOLERANCE)) {
                startX = x;
                break;
            }
        }

        // --- 3. maxX の検出: バーが100%の場合の右端 ---
        const MAX_X_SCAN_TOLERANCE = COLOR_TOLERANCE * 2; 
        for (let x = width - 1; x >= 0; x--) {
            const pixel = getPixelColor(imageData, x, tempHpBarY);
            if (!isColorCloseToGeneralBackground(pixel, MAX_X_SCAN_TOLERANCE)) {
                maxX = x;
                break;
            }
        }
        
        console.log("Detected startX:", startX, "Detected maxX:", maxX);

        if (startX === null || maxX === null || maxX <= startX) {
            resultsDiv.innerHTML = '<p style="color: red;">バーの左右の基準点が見つかりませんでした。画像を正しくトリミングしているか確認してください。</p>';
            return;
        }

        // --- 4. 各ステータスバーのY座標の特定 ---
        const detectedBarYColors = []; 

        // sampleXForBarY を startX からの固定オフセット (バーの左端に近いため、短いバーでも色を拾いやすい)
        const sampleXForBarY = startX + 10; 
        
        // 平均色をサンプリングする範囲 (sampleXForBarY を中心に左右2ピクセル、合計5ピクセル)
        const SAMPLE_RANGE_HALF = 2; // sampleXForBarY から左右に何ピクセル範囲を見るか

        if (sampleXForBarY - SAMPLE_RANGE_HALF < 0 || sampleXForBarY + SAMPLE_RANGE_HALF >= width) {
             console.error("sampleXForBarY のサンプリング範囲が画像範囲外です。sampleXForBarY および SAMPLE_RANGE_HALF の値を調整してください。");
             resultsDiv.innerHTML = '<p style="color: red;">内部エラー: バーのY座標検出位置が範囲外です。</p>';
             return;
        }

        const barDetectYStart = Math.floor(height * 0.2); 
        const barDetectYEnd = Math.floor(height * 0.9);   
        const barDetectStepY = 1; 
        const BAR_VERTICAL_SEPARATION_THRESHOLD = 30; 

        for (let y = barDetectYStart; y < barDetectYEnd; y += barDetectStepY) {
            let isTooCloseToDetected = false;
            for (const detectedItem of detectedBarYColors) {
                if (Math.abs(y - detectedItem.y) < BAR_VERTICAL_SEPARATION_THRESHOLD) {
                    isTooCloseToDetected = true;
                    break;
                }
            }
            if (isTooCloseToDetected) continue;

            // 複数ピクセルの平均色を計算
            let avgR = 0, avgG = 0, avgB = 0;
            let pixelCount = 0;
            for (let xOffset = -SAMPLE_RANGE_HALF; xOffset <= SAMPLE_RANGE_HALF; xOffset++) {
                const pixel = getPixelColor(imageData, sampleXForBarY + xOffset, y);
                // 有効なピクセルのみを平均に含める（-1,-1,-1は範囲外の意味）
                if (pixel.r !== -1) { 
                    avgR += pixel.r;
                    avgG += pixel.g;
                    avgB += pixel.b;
                    pixelCount++;
                }
            }

            let sampledAvgColor = null;
            if (pixelCount > 0) {
                sampledAvgColor = {
                    r: Math.round(avgR / pixelCount),
                    g: Math.round(avgG / pixelCount),
                    b: Math.round(avgB / pixelCount)
                };
            } else {
                continue; // 有効なピクセルがなければスキップ
            }

            let closestBarInfo = null;
            let minColorDiff = Infinity;

            for (const barInfo of STATUS_BARS) {
                const dr = sampledAvgColor.r - barInfo.color.r;
                const dg = sampledAvgColor.g - barInfo.color.g;
                const db = sampledAvgColor.b - barInfo.color.b; 
                const currentDiff = (dr * dr + dg * dg + db * db);

                if (currentDiff < minColorDiff && currentDiff < (COLOR_TOLERANCE * COLOR_TOLERANCE)) {
                    minColorDiff = currentDiff;
                    closestBarInfo = barInfo;
                }
            }

            if (closestBarInfo !== null) {
                detectedBarYColors.push({ y: y, barInfo: closestBarInfo });
            }

            if (detectedBarYColors.length >= STATUS_BARS.length) { 
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

            // Y座標の割り当ての許容誤差を少し広げる
            if (assignedY !== null && minColorDiffForAssign < (COLOR_TOLERANCE * 3.0)) { 
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

        // --- 5. 各ステータスバーの右端 (`currentX`) の検出とパーセンテージ計算 ---
        const finalResults = [];
        const BACKGROUND_TRANSITION_TOLERANCE = COLOR_TOLERANCE * 1.5; 
        const GRADIENT_COLOR_TOLERANCE = COLOR_TOLERANCE * 1.5; 

        const NO_BAR_COLOR_THRESHOLD = 1; 

        for (let i = 0; i < STATUS_BARS.length; i++) {
            const barInfo = STATUS_BARS[i];
            const barY = actualDefiniteBarYs[i]; 
            let currentX = startX; 
            
            const isType1Background = (barInfo.name === '攻撃' || barInfo.name === '防御' || barInfo.name === '敏捷');
            const targetBackgroundColor = isType1Background ? BACKGROUND_COLOR_TYPE1 : BACKGROUND_COLOR_TYPE2;

            let consecutiveNonBarPixels = 0; 

            for (let x = startX + 1; x <= maxX; x++) { 
                const pixel = getPixelColor(imageData, x, barY);
                
                const isMainBarColor = isColorClose(pixel, barInfo.color, COLOR_TOLERANCE);
                const isUnderscoreLineColor = isColorClose(pixel, LEFT_BORDER_LINE_COLOR, COLOR_TOLERANCE); 
                const isGradientUnderscoreColorStart = isColorClose(pixel, HP_GRADIENT_START_COLOR_UNDERSCORE, GRADIENT_COLOR_TOLERANCE);
                const isGradientUnderscoreColorEnd = isColorClose(pixel, HP_GRADIENT_END_COLOR_UNDERSCORE, GRADIENT_COLOR_TOLERANCE);
                const isGeneralBackground = isColorCloseToGeneralBackground(pixel, BACKGROUND_TRANSITION_TOLERANCE);
                const isBarInternalBackground = isColorCloseToBarBackground(pixel, BACKGROUND_TRANSITION_TOLERANCE);

                if (isMainBarColor) {
                    currentX = x;
                    consecutiveNonBarPixels = 0;
                } 
                else if (barInfo.name === 'HP' && (isGradientUnderscoreColorStart || isGradientUnderscoreColorEnd)) {
                    currentX = x;
                    consecutiveNonBarPixels = 0;
                }
                else if (isUnderscoreLineColor) {
                    currentX = x;
                    consecutiveNonBarPixels = 0;
                }
                else if (isGeneralBackground || isBarInternalBackground) {
                    consecutiveNonBarPixels++;
                    if (consecutiveNonBarPixels >= NO_BAR_COLOR_THRESHOLD) {
                        break; 
                    }
                } 
                else {
                    consecutiveNonBarPixels++;
                    if (consecutiveNonBarPixels >= NO_BAR_COLOR_THRESHOLD) {
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
