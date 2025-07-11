document.addEventListener('DOMContentLoaded', () => {
    const imageUpload = document.getElementById('imageUpload');
    const statusCanvas = document.getElementById('statusCanvas');
    const ctx = statusCanvas.getContext('2d');
    const overlayMessage = document.getElementById('overlayMessage');
    const resultsDiv = document.getElementById('results');
    const copyResultsBtn = document.getElementById('copyResults');

    let uploadedImage = null;

    // ステータスバーの定義 (IMG_3672.webpから再サンプリングして微調整)
    const STATUS_BARS = [
        { name: 'HP', color: { r: 252, g: 227, b: 125 } },    // #FCE37D
        { name: '攻撃', color: { r: 214, g: 107, b: 135 } },   // #D66B87
        { name: '魔攻', color: { r: 85, g: 134, b: 200 } },    // #5586C8
        { name: '防御', color: { r: 237, g: 170, b: 118 } },   // #EDAA76
        { name: '魔防', color: { r: 140, g: 210, b: 236 } },   // #8CD2EC
        { name: '敏捷', color: { r: 115, g: 251, b: 211 } }    // #73FBD3
    ];

    const COLOR_TOLERANCE = 30; // RGB値の二乗誤差のしきい値 (一般的な色比較用)

    // バーの左端「｜」の線色
    const LEFT_BORDER_LINE_COLOR = { r: 255, g: 255, b: 241 }; // #FFFFF1

    // バーの背景色（未到達部分の色）
    // タイプ1: 攻撃、防御、敏捷のバーの背景
    const BAR_BACKGROUND_TYPE1 = { r: 70, g: 51, b: 25 }; // #463319
    // タイプ2: HP、魔攻、魔防のバーの背景
    const BAR_BACKGROUND_TYPE2 = { r: 88, g: 69, b: 36 }; // #584524

    // 画像の外枠およびバー領域外の一般的な背景色（新しい画像の外枠の色）
    const GENERAL_BACKGROUND_COLOR = { r: 75, g: 56, b: 33 }; // #4B3821

    // HPバーの未到達部分のグラデーション開始色 (最も左側の色)
    const HP_UNDERSCORE_GRADIENT_START_COLOR = { r: 88, g: 69, b: 36 }; // #584524 (BAR_BACKGROUND_TYPE2と同じ)

    /**
     * 指定された座標のピクセルのRGB値を取得
     */
    function getPixelColor(imageData, x, y) {
        if (x < 0 || x >= imageData.width || y < 0 || y >= imageData.height) {
            return { r: -1, g: -1, b: -1 }; // 範囲外は-1で示す
        }
        const index = (y * imageData.width + x) * 4;
        return {
            r: imageData.data[index],
            g: imageData.data[index + 1],
            b: imageData.data[index + 2]
        };
    }

    /**
     * 2つの色が許容範囲内にあるか判定 (RGBのユークリッド距離の二乗で比較)
     */
    function isColorClose(color1, color2, tolerance) {
        if (!color1 || !color2) return false;
        const dr = color1.r - color2.r;
        const dg = color1.g - color2.g;
        const db = color1.b - color2.b;
        return (dr * dr + dg * dg + db * db) < (tolerance * tolerance);
    }

    /**
     * 2つの色のRGBのユークリッド距離を計算
     */
    function getColorDistance(color1, color2) {
        if (!color1 || !color2) return Infinity;
        const dr = color1.r - color2.r;
        const dg = color1.g - color2.g;
        const db = color1.b - color2.b;
        return Math.sqrt(dr * dr + dg * dg + db * db);
    }

    /**
     * ピクセルがバーの背景色に近いか判定
     */
    function isColorCloseToBarBackground(pixelColor, tolerance) {
        return isColorClose(pixelColor, BAR_BACKGROUND_TYPE1, tolerance) || 
               isColorClose(pixelColor, BAR_BACKGROUND_TYPE2, tolerance);
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

        let startX = null; // バーの共通の開始X座標（「｜」線のX座標）
        let maxX = null;   // バーの共通の最大X座標（100%時の右端）
        let cropLeftX = 0; // ステータス表示領域の左端
        let cropTopY = 0;  // ステータス表示領域の上端
        let cropRightX = width; // ステータス表示領域の右端
        let cropBottomY = height; // ステータス表示領域の下端

        // --- 1. ステータス表示領域の右端と下端を特定 (外枠の背景色からの遷移で検出) ---
        // これらのロジックは前回から変更なし
        for (let x = width - 1; x >= Math.floor(width * 0.7); x--) { 
            let isGeneralBgLine = true;
            for (let y = Math.floor(height * 0.2); y < Math.floor(height * 0.8); y+=5) { 
                const pixel = getPixelColor(imageData, x, y);
                if (!isColorClose(pixel, GENERAL_BACKGROUND_COLOR, COLOR_TOLERANCE * 1.5)) {
                    isGeneralBgLine = false;
                    break;
                }
            }
            if (!isGeneralBgLine) {
                cropRightX = x + 1; 
                break;
            }
        }
        
        for (let y = height - 1; y >= Math.floor(height * 0.7); y--) { 
            let isGeneralBgLine = true;
            for (let x = Math.floor(width * 0.2); x < Math.floor(width * 0.8); x+=5) { 
                const pixel = getPixelColor(imageData, x, y);
                if (!isColorClose(pixel, GENERAL_BACKGROUND_COLOR, COLOR_TOLERANCE * 1.5)) {
                    isGeneralBgLine = false;
                    break;
                }
            }
            if (!isGeneralBgLine) {
                cropBottomY = y + 1; 
                break;
            }
        }

        // --- 2. バーの左端（「｜」線）の共通X座標 `startX` を特定 ---
        const SCAN_X_FOR_START_LINE_LEFT = Math.floor(width * 0.05); 
        const SCAN_X_FOR_START_LINE_RIGHT = Math.floor(width * 0.2); 

        for (let x = SCAN_X_FOR_START_LINE_LEFT; x < SCAN_X_FOR_START_LINE_RIGHT; x++) {
            let consecutiveLinesFound = 0;
            for (let y = Math.floor(height * 0.2); y < Math.floor(height * 0.9); y++) { 
                const pixel = getPixelColor(imageData, x, y);
                // 「｜」線の検出許容誤差を大幅に広げる (COLOR_TOLERANCE * 2.5)
                if (isColorClose(pixel, LEFT_BORDER_LINE_COLOR, COLOR_TOLERANCE * 2.5)) { 
                    consecutiveLinesFound++;
                } else {
                    consecutiveLinesFound = 0; 
                }
                if (consecutiveLinesFound >= 3) { 
                    startX = x;
                    break;
                }
            }
            if (startX !== null) break;
        }
        
        // --- 3. バーの最大X座標 `maxX` を特定 ---
        const SCAN_Y_FOR_MAX_X = Math.floor(height * 0.5); 
        if (startX !== null) {
            for (let x = cropRightX - 1; x > startX; x--) {
                const pixel = getPixelColor(imageData, x, SCAN_Y_FOR_MAX_X);
                if (isColorClose(pixel, GENERAL_BACKGROUND_COLOR, COLOR_TOLERANCE * 1.5)) {
                    maxX = x;
                    break;
                }
            }
        }
        if (maxX === null) {
            maxX = cropRightX - 5; 
        }
        if (maxX <= startX) maxX = startX + 100;


        console.log("Detected cropRightX:", cropRightX, "Detected cropBottomY:", cropBottomY);
        console.log("Detected startX:", startX, "Detected maxX:", maxX);

        if (startX === null || maxX === null || maxX <= startX) {
            resultsDiv.innerHTML = '<p style="color: red;">バーの左右の基準点が見つかりませんでした。画像を正しくトリミングしているか、または画像のバーが想定外の形式でないか確認してください。</p>';
            return;
        }
        
        // --- 4. 各ステータスバーのY座標を特定 ---
        const finalBarYsMap = new Map();
        const usedYIndices = new Set();
        
        const Y_SCAN_START = Math.floor(height * 0.1); 
        const Y_SCAN_END = Math.floor(height * 0.95); 

        const SCAN_BAR_COLOR_X_START = startX + 5; 
        const SCAN_BAR_COLOR_X_END = startX + 30; 

        const barYCandidates = [];

        console.log("--- Y Coordinate Detection Debug Info ---");

        for (let y = Y_SCAN_START; y < Y_SCAN_END; y++) {
            let isBorderLineAtY = false;
            
            // 「｜」線をスキャンするX範囲をさらに広げる (startX - 10 から startX + 10)
            for (let x = startX - 10; x <= startX + 10; x++) { 
                const pixel = getPixelColor(imageData, x, y);
                // 「｜」線の検出許容誤差を大幅に広げたものをここでも適用
                if (isColorClose(pixel, LEFT_BORDER_LINE_COLOR, COLOR_TOLERANCE * 2.5)) { 
                    isBorderLineAtY = true;
                    break;
                }
            }

            if (isBorderLineAtY) {
                console.log(`Found border line at Y: ${y}`); // デバッグログ

                let avgR = 0, avgG = 0, avgB = 0;
                let pixelCount = 0;
                for (let x = SCAN_BAR_COLOR_X_START; x <= SCAN_BAR_COLOR_X_END; x++) {
                    const pixel = getPixelColor(imageData, x, y);
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
                    console.log(`  Sampled Avg Color at Y=${y}: R:${sampledAvgColor.r}, G:${sampledAvgColor.g}, B:${sampledAvgColor.b}`); // デバッグログ

                    let closestBarInfo = null;
                    let minColorDiffForSample = Infinity; 

                    for (const barInfo of STATUS_BARS) {
                        const dist = getColorDistance(sampledAvgColor, barInfo.color);
                        console.log(`    Comparing with ${barInfo.name} (${barInfo.color.r},${barInfo.color.g},${barInfo.color.b}). Dist: ${dist.toFixed(2)}`); // デバッグログ

                        // バーY候補を見つけるための許容誤差をさらに広げる (COLOR_TOLERANCE * 2.5)
                        if (dist < minColorDiffForSample && dist < (COLOR_TOLERANCE * 2.5)) { 
                            minColorDiffForSample = dist;
                            closestBarInfo = barInfo;
                        }
                    }

                    if (closestBarInfo !== null) {
                        let isTooCloseToExisting = false;
                        for (const existingCandidate of barYCandidates) {
                            if (Math.abs(y - existingCandidate.y) < 25) { 
                                isTooCloseToExisting = true;
                                break;
                            }
                        }
                        if (!isTooCloseToExisting) {
                            barYCandidates.push({ y: y, barInfo: closestBarInfo, detectedColor: sampledAvgColor, colorDiff: minColorDiffForSample });
                            console.log(`  Candidate Found: Y=${y}, Name=${closestBarInfo.name}, Color=${JSON.stringify(sampledAvgColor)}, Diff=${minColorDiffForSample.toFixed(2)}`); // デバッグログ
                        }
                    }
                }
            }
        }

        barYCandidates.sort((a, b) => a.y - b.y);
        console.log("--- All Bar Y Candidates (Sorted) ---"); // デバッグログ
        barYCandidates.forEach(c => console.log(`Y: ${c.y}, Name: ${c.barInfo.name}, DetectedColor: ${JSON.stringify(c.detectedColor)}, Diff: ${c.colorDiff.toFixed(2)}`)); // デバッグログ
        console.log("-------------------------------------"); // デバッグログ

        for (const barInfo of STATUS_BARS) {
            let assignedY = null;
            let bestMatchIndex = -1;
            let minColorDiffForAssign = Infinity; 

            for (let j = 0; j < barYCandidates.length; j++) {
                if (usedYIndices.has(j)) continue; 

                const candidate = barYCandidates[j];
                const colorDiff = getColorDistance(candidate.barInfo.color, barInfo.color);
                
                if (colorDiff < minColorDiffForAssign) {
                    minColorDiffForAssign = colorDiff;
                    assignedY = candidate.y;
                    bestMatchIndex = j;
                }
            }

            // 最終的な割り当て閾値 (COLOR_TOLERANCE * 3.0) に変更
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

        const CONSECUTIVE_NON_BAR_PIXELS_THRESHOLD = 3; 

        for (let i = 0; i < STATUS_BARS.length; i++) {
            const barInfo = STATUS_BARS[i];
            const barY = actualDefiniteBarYs[i]; 
            let currentX = startX; 
            
            let targetBackgroundColor = GENERAL_BACKGROUND_COLOR; 
            if (barInfo.name === '攻撃' || barInfo.name === '防御' || barInfo.name === '敏捷') {
                targetBackgroundColor = BAR_BACKGROUND_TYPE1;
            } else if (barInfo.name === 'HP' || barInfo.name === '魔攻' || barInfo.name === '魔防') {
                targetBackgroundColor = BAR_BACKGROUND_TYPE2;
            }

            let consecutiveNonBarPixels = 0; 

            for (let x = startX + 1; x <= maxX + 20; x++) { 
                const pixel = getPixelColor(imageData, x, barY);
                
                const isMainBarColor = isColorClose(pixel, barInfo.color, COLOR_TOLERANCE);
                const isUnderscoreLineColor = isColorClose(pixel, LEFT_BORDER_LINE_COLOR, COLOR_TOLERANCE); 
                const isHPUnderscoreGradient = (barInfo.name === 'HP' && isColorClose(pixel, HP_UNDERSCORE_GRADIENT_START_COLOR, GRADIENT_COLOR_TOLERANCE));
                
                if (isMainBarColor || isUnderscoreLineColor || isHPUnderscoreGradient) {
                    currentX = x;
                    consecutiveNonBarPixels = 0;
                } 
                else if (isColorClose(pixel, targetBackgroundColor, BACKGROUND_TRANSITION_TOLERANCE) || 
                         isColorClose(pixel, GENERAL_BACKGROUND_COLOR, BACKGROUND_TRANSITION_TOLERANCE)) {
                    consecutiveNonBarPixels++;
                    if (consecutiveNonBarPixels >= CONSECUTIVE_NON_BAR_PIXELS_THRESHOLD) {
                        currentX = x - CONSECUTIVE_NON_BAR_PIXELS_THRESHOLD; 
                        break; 
                    }
                } 
                else {
                    consecutiveNonBarPixels++;
                    if (consecutiveNonBarPixels >= CONSECUTIVE_NON_BAR_PIXELS_THRESHOLD) {
                        currentX = x - CONSECUTIVE_NON_BAR_PIXELS_THRESHOLD;
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
