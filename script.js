document.addEventListener('DOMContentLoaded', () => {
    const imageUpload = document.getElementById('imageUpload');
    const statusCanvas = document.getElementById('statusCanvas');
    const ctx = statusCanvas.getContext('2d');
    const overlayMessage = document.getElementById('overlayMessage');
    const resultsDiv = document.getElementById('results');
    const copyResultsBtn = document.getElementById('copyResults');

    let uploadedImage = null;

    const STATUS_BARS = [
        { name: 'HP', color: { r: 252, g: 227, b: 125 } },    // #FCE37D
        { name: '攻撃', color: { r: 214, g: 107, b: 135 } },   // #D66B87
        { name: '魔攻', color: { r: 85, g: 134, b: 200 } },    // #5586C8
        { name: '防御', color: { r: 237, g: 170, b: 118 } },   // #EDAA76
        { name: '魔防', color: { r: 140, g: 210, b: 236 } },   // #8CD2EC
        { name: '敏捷', color: { r: 115, g: 251, b: 211 } }    // #73FBD3
    ];

    const COLOR_TOLERANCE = 30; // RGB値の二乗誤差のしきい値 (前回から据え置き)

    // バーの枠線色はもう基準線検出には使わないが、念のため残しておく
    const WHITE_COLOR = { r: 255, g: 253, b: 254 }; // #FFFDFE (補助線)

    const BACKGROUND_COLOR_TYPE1 = { r: 70, g: 51, b: 25 }; // #463319 (攻撃、防御、敏捷の背景)
    const BACKGROUND_COLOR_TYPE2 = { r: 88, g: 69, b: 36 }; // #584524 (HP、魔攻、魔防の背景)

    // 新たに、HPバーのグラデーション開始色を定義します
    const HP_GRADIENT_START_COLOR = { r: 73, g: 58, b: 31 }; // #493A1F

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

    // findVerticalLine 関数はもう使わないので削除、またはコメントアウトします。
    // function findVerticalLine(...) { ... }

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
        
        // ***** 1. 基準線 (startX, maxX) の検出ロジックを全面的に変更 *****
        // まず、HPバーのY座標を暫定的に特定します。
        // HPバーのグラデーション開始色または背景色に近いピクセルを探します。
        const HP_BAR_DETECT_Y_START = Math.floor(height * 0.1); // 画像の上部からスキャン開始
        const HP_BAR_DETECT_Y_END = Math.floor(height * 0.3);   // HPバーがこの範囲にあると仮定
        let tempHpBarY = null;

        // 画像の中央付近のX座標でHPバーのY座標を探す
        const tempSampleX = Math.floor(width / 2); 
        const HP_COLOR_TOLERANCE_FOR_Y_DETECT = 40; // Y座標検出は少し緩めに

        for (let y = HP_BAR_DETECT_Y_START; y < HP_BAR_DETECT_Y_END; y++) {
            const pixel = getPixelColor(imageData, tempSampleX, y);
            // HPバーのメインカラーまたはグラデーション開始色に近い色を探す
            if (isColorClose(pixel, STATUS_BARS[0].color, HP_COLOR_TOLERANCE_FOR_Y_DETECT) ||
                isColorClose(pixel, HP_GRADIENT_START_COLOR, HP_COLOR_TOLERANCE_FOR_Y_DETECT * 1.5)) { // グラデ開始色はさらに緩めに
                tempHpBarY = y;
                break;
            }
        }
        
        if (tempHpBarY === null) {
            resultsDiv.innerHTML = '<p style="color: red;">HPバーのY座標を特定できませんでした。画像を確認してください。</p>';
            console.error("HP bar Y not found for startX/maxX detection.");
            return;
        }

        // HPバーのY座標が特定できたら、そのY座標を使ってstartXとmaxXを検出します。
        // startXの検出: 左からスキャンし、背景色ではない最初のピクセル（グラデーションかバー本体）
        const X_SCAN_TOLERANCE = COLOR_TOLERANCE * 1.5; // X座標検出の許容値は少し緩めに

        for (let x = 0; x < width; x++) {
            const pixel = getPixelColor(imageData, x, tempHpBarY);
            if (!isColorCloseToAnyBackground(pixel, X_SCAN_TOLERANCE)) {
                startX = x;
                break;
            }
        }

        // maxXの検出: 右からスキャンし、背景色ではない最初のピクセル（バーの終点）
        for (let x = width - 1; x >= 0; x--) {
            const pixel = getPixelColor(imageData, x, tempHpBarY);
            if (!isColorCloseToAnyBackground(pixel, X_SCAN_TOLERANCE)) {
                maxX = x;
                break;
            }
        }
        
        console.log("Detected startX:", startX, "Detected maxX:", maxX);

        if (startX === null || maxX === null || maxX <= startX) {
            resultsDiv.innerHTML = '<p style="color: red;">バーの左右の基準点が見つかりませんでした。画像を正しくトリミングしているか、バーが極端に短い場合は調整が必要かもしれません。</p>';
            return;
        }

        // ***** 2. 各ステータスバーのY座標の特定 (ここは微調整のみ) *****
        const detectedBarYColors = []; 

        // バーの内部をサンプリングするX座標
        // グラデーションの存在を考慮し、バーの長さの約1/4程度の位置をサンプリング
        const sampleXForBarY = Math.floor(startX + (maxX - startX) * 0.25); // 例: 25%の位置
        // バーが80%あることを考慮して、もう少し右にするなら例えば 0.4 なども検討
        // const sampleXForBarY = Math.floor(startX + (maxX - startX) * 0.4); 


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
                const db = pixel.b - barInfo.color.b; // 修正: barInfo.b -> barInfo.color.b
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
        // NO_BAR_COLOR_THRESHOLD の値を調整して、グラデーションの終点を正確に検出できるようにする
        // グラデーションの長さによっては、この値を増やす必要があるかもしれません。
        const NO_BAR_COLOR_THRESHOLD = 8; // 以前の 5 から 8 に変更。これでグラデーションを長く許容。

        for (let i = 0; i < STATUS_BARS.length; i++) {
            const barInfo = STATUS_BARS[i];
            const barY = actualDefiniteBarYs[i]; 
            let currentX = startX;
            
            const isType1Background = (barInfo.name === '攻撃' || barInfo.name === '防御' || barInfo.name === '敏捷');
            const targetBackgroundColor = isType1Background ? BACKGROUND_COLOR_TYPE1 : BACKGROUND_COLOR_TYPE2;

            let noBarColorOrGradationCount = 0; 

            for (let x = startX; x <= maxX; x++) {
                const pixel = getPixelColor(imageData, x, barY);
                
                const isMainBarColor = isColorClose(pixel, barInfo.color, COLOR_TOLERANCE);
                const isBackgroundColor = isColorClose(pixel, targetBackgroundColor, BACKGROUND_TRANSITION_TOLERANCE);
                // HPバーのグラデーション開始色を考慮
                const isGradientColor = isColorClose(pixel, HP_GRADIENT_START_COLOR, COLOR_TOLERANCE * 1.5);

                // メインの色、またはグラデーションの色である間はバーが続いていると判断
                if (isMainBarColor || isGradientColor) {
                    currentX = x;
                    noBarColorOrGradationCount = 0;
                } else if (!isBackgroundColor) {
                    // メインの色でもグラデーションでもないが、背景色でもない場合（＝おそらくバーのグラデーションの本当に最後の部分やノイズ）
                    // ここもバーの一部として含めるか、厳しくするかは調整が必要
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
