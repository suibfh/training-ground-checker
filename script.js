document.addEventListener('DOMContentLoaded', () => {
    const imageUpload = document.getElementById('imageUpload');
    const statusCanvas = document.getElementById('statusCanvas');
    const ctx = statusCanvas.getContext('2d');
    const overlayMessage = document.getElementById('overlayMessage');
    const resultsDiv = document.getElementById('results');
    const copyResultsBtn = document.getElementById('copyResults');

    let uploadedImage = null;

    // ステータスバーの定義 (ご提供いただいた最新のRGB値に更新)
    const STATUS_BARS = [
        { name: 'HP', color: { r: 252, g: 227, b: 126 } },    // #FCE37E
        { name: '攻撃', color: { r: 214, g: 107, b: 135 } },    // #D66B87
        { name: '魔攻', color: { r: 85, g: 134, b: 200 } },    // #5586C8
        { name: '防御', color: { r: 237, g: 170, b: 118 } },    // #EDAA76
        { name: '魔防', color: { r: 140, g: 210, b: 236 } },   // #8CD2EC
        { name: '敏捷', color: { r: 115, g: 251, b: 211 } }    // #73FBD3
    ];

    const COLOR_TOLERANCE = 30; // RGB値の二乗誤差のしきい値 (一般的な色比較用)

    // 外枠の線色
    const FRAME_LINE_COLOR = { r: 255, g: 251, b: 241 }; // #FFFBF1

    // バーの背景色（未到達部分の色）
    // タイプ1: 攻撃、防御、敏捷のバーの背景
    const BAR_BACKGROUND_TYPE1 = { r: 69, g: 50, b: 24 }; // #453218
    // タイプ2: HP、魔攻、魔防のバーの背景
    const BAR_BACKGROUND_TYPE2 = { r: 86, g: 67, b: 35 }; // #564323

    // 余白の背景色
    const GENERAL_BACKGROUND_COLOR = { r: 69, g: 52, b: 26 }; // #45341A

    // HPバーの未到達部分のグラデーション開始色 (最も左側の色)
    const HP_UNDERSCORE_GRADIENT_START_COLOR = { r: 86, g: 67, b: 35 }; // BAR_BACKGROUND_TYPE2と同じ

    // 各バーのY座標が、全体のフレーム高さに対してどのくらいの割合の位置にあるか (IMG_3672.webpから測定)
    const BAR_Y_POSITIONS_RATIO = {
        'HP': 0.06,   // Y_top_frame からの相対位置
        '攻撃': 0.26,
        '魔攻': 0.42,
        '防御': 0.58,
        '魔防': 0.74,
        '敏捷': 0.90
    };

    // startX (バーの左端「｜」) が全体のフレーム幅に対してどのくらいの割合の位置にあるか (IMG_3672.webpから測定)
    const START_X_POSITION_RATIO = 0.06; 

    // maxX (バーの最大右端) が全体のフレーム幅に対してどのくらいの割合の位置にあるか (IMG_3672.webpから測定)
    const MAX_X_POSITION_RATIO = 0.96;

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

        let Y_top_frame = null; 
        let Y_bottom_frame = null; 
        let X_left_frame = null; 
        let X_right_frame = null; 

        // --- 1. ステータスバー領域の上下のフレームY座標を特定 ---
        const FRAME_SCAN_X_CENTER = Math.floor(width * 0.5); 
        const FRAME_SCAN_X_HALF_WIDTH = Math.floor(width * 0.1); 
        const PIXEL_THRESHOLD_FOR_FRAME_LINE = FRAME_SCAN_X_HALF_WIDTH * 2 * 0.5; // スキャン範囲の50%以上がフレーム色ならOK

        // Y_top_frame の検出 (上から下へ)
        let foundBackgroundEnd = false; // 背景が終わったことを示すフラグ
        for (let y = 0; y < height; y++) {
            let currentLineFramePixels = 0;
            let currentLineBgPixels = 0;
            for (let x = FRAME_SCAN_X_CENTER - FRAME_SCAN_X_HALF_WIDTH; x <= FRAME_SCAN_X_CENTER + FRAME_SCAN_X_HALF_WIDTH; x++) {
                const pixel = getPixelColor(imageData, x, y);
                if (isColorClose(pixel, GENERAL_BACKGROUND_COLOR, COLOR_TOLERANCE * 1.5)) {
                    currentLineBgPixels++;
                }
                if (isColorClose(pixel, FRAME_LINE_COLOR, COLOR_TOLERANCE * 1.5) || 
                    isColorClose(pixel, BAR_BACKGROUND_TYPE1, COLOR_TOLERANCE * 1.5) ||
                    isColorClose(pixel, BAR_BACKGROUND_TYPE2, COLOR_TOLERANCE * 1.5)) {
                    currentLineFramePixels++;
                }
            }

            // 画像の端からスキャンして、一般的な背景色ではないピクセルが一定割合現れたら、そこが背景の終わり
            if (!foundBackgroundEnd && currentLineBgPixels < (FRAME_SCAN_X_HALF_WIDTH * 2 * 0.9)) { 
                foundBackgroundEnd = true;
            }

            // 背景の終わりが見つかり、かつフレーム色のピクセルが一定数あれば、そこがY_top_frame
            if (foundBackgroundEnd && currentLineFramePixels > PIXEL_THRESHOLD_FOR_FRAME_LINE) {
                Y_top_frame = y;
                break;
            }
        }

        // Y_bottom_frame の検出 (下から上へ)
        foundBackgroundEnd = false;
        for (let y = height - 1; y >= 0; y--) {
            let currentLineFramePixels = 0;
            let currentLineBgPixels = 0;
            for (let x = FRAME_SCAN_X_CENTER - FRAME_SCAN_X_HALF_WIDTH; x <= FRAME_SCAN_X_CENTER + FRAME_SCAN_X_HALF_WIDTH; x++) {
                const pixel = getPixelColor(imageData, x, y);
                if (isColorClose(pixel, GENERAL_BACKGROUND_COLOR, COLOR_TOLERANCE * 1.5)) {
                    currentLineBgPixels++;
                }
                if (isColorClose(pixel, FRAME_LINE_COLOR, COLOR_TOLERANCE * 1.5) || 
                    isColorClose(pixel, BAR_BACKGROUND_TYPE1, COLOR_TOLERANCE * 1.5) ||
                    isColorClose(pixel, BAR_BACKGROUND_TYPE2, COLOR_TOLERANCE * 1.5)) {
                    currentLineFramePixels++;
                }
            }
            if (!foundBackgroundEnd && currentLineBgPixels < (FRAME_SCAN_X_HALF_WIDTH * 2 * 0.9)) {
                foundBackgroundEnd = true;
            }
            if (foundBackgroundEnd && currentLineFramePixels > PIXEL_THRESHOLD_FOR_FRAME_LINE) { 
                Y_bottom_frame = y;
                break;
            }
        }

        if (Y_top_frame === null || Y_bottom_frame === null || Y_bottom_frame <= Y_top_frame + 20) { 
            resultsDiv.innerHTML = '<p style="color: red;">ステータスバー領域の上下フレームが見つかりませんでした。画像を正しくトリミングしているか、または画像のUIが想定外の形式でないか確認してください。</p>';
            console.error("Failed to detect Y_top_frame or Y_bottom_frame.");
            return;
        }
        
        const totalFrameHeight = Y_bottom_frame - Y_top_frame;
        console.log("Detected Y_top_frame:", Y_top_frame, "Detected Y_bottom_frame:", Y_bottom_frame);

        // --- 2. ステータスバー領域の左右のフレームX座標を特定 ---
        const FRAME_SCAN_Y_CENTER = Math.floor(Y_top_frame + totalFrameHeight / 2); 
        const FRAME_SCAN_Y_HALF_HEIGHT = Math.floor(totalFrameHeight * 0.1); 
        const PIXEL_THRESHOLD_FOR_FRAME_LINE_VERTICAL = FRAME_SCAN_Y_HALF_HEIGHT * 2 * 0.5; 

        // X_left_frame の検出 (左から右へ)
        foundBackgroundEnd = false;
        for (let x = 0; x < width; x++) {
            let currentLineFramePixels = 0;
            let currentLineBgPixels = 0;
            for (let y = FRAME_SCAN_Y_CENTER - FRAME_SCAN_Y_HALF_HEIGHT; y <= FRAME_SCAN_Y_CENTER + FRAME_SCAN_Y_HALF_HEIGHT; y++) {
                const pixel = getPixelColor(imageData, x, y);
                if (isColorClose(pixel, GENERAL_BACKGROUND_COLOR, COLOR_TOLERANCE * 1.5)) {
                    currentLineBgPixels++;
                }
                if (isColorClose(pixel, FRAME_LINE_COLOR, COLOR_TOLERANCE * 1.5) || 
                    isColorClose(pixel, BAR_BACKGROUND_TYPE1, COLOR_TOLERANCE * 1.5) ||
                    isColorClose(pixel, BAR_BACKGROUND_TYPE2, COLOR_TOLERANCE * 1.5)) {
                    currentLineFramePixels++;
                }
            }
            if (!foundBackgroundEnd && currentLineBgPixels < (FRAME_SCAN_Y_HALF_HEIGHT * 2 * 0.9)) {
                foundBackgroundEnd = true;
            }
            if (foundBackgroundEnd && currentLineFramePixels > PIXEL_THRESHOLD_FOR_FRAME_LINE_VERTICAL) {
                X_left_frame = x;
                break;
            }
        }

        // X_right_frame の検出 (右から左へ)
        foundBackgroundEnd = false;
        for (let x = width - 1; x >= 0; x--) {
            let currentLineFramePixels = 0;
            let currentLineBgPixels = 0;
            for (let y = FRAME_SCAN_Y_CENTER - FRAME_SCAN_Y_HALF_HEIGHT; y <= FRAME_SCAN_Y_CENTER + FRAME_SCAN_Y_HALF_HEIGHT; y++) {
                const pixel = getPixelColor(imageData, x, y);
                if (isColorClose(pixel, GENERAL_BACKGROUND_COLOR, COLOR_TOLERANCE * 1.5)) {
                    currentLineBgPixels++;
                }
                if (isColorClose(pixel, FRAME_LINE_COLOR, COLOR_TOLERANCE * 1.5) || 
                    isColorClose(pixel, BAR_BACKGROUND_TYPE1, COLOR_TOLERANCE * 1.5) ||
                    isColorClose(pixel, BAR_BACKGROUND_TYPE2, COLOR_TOLERANCE * 1.5)) {
                    currentLineFramePixels++;
                }
            }
            if (!foundBackgroundEnd && currentLineBgPixels < (FRAME_SCAN_Y_HALF_HEIGHT * 2 * 0.9)) {
                foundBackgroundEnd = true;
            }
            if (foundBackgroundEnd && currentLineFramePixels > PIXEL_THRESHOLD_FOR_FRAME_LINE_VERTICAL) {
                X_right_frame = x;
                break;
            }
        }
        
        if (X_left_frame === null || X_right_frame === null || X_right_frame <= X_left_frame + 20) {
            resultsDiv.innerHTML = '<p style="color: red;">ステータスバー領域の左右フレームが見つかりませんでした。画像を正しくトリミングしているか、または画像のUIが想定外の形式でないか確認してください。</p>';
            console.error("Failed to detect X_left_frame or X_right_frame.");
            return;
        }

        const totalFrameWidth = X_right_frame - X_left_frame;
        console.log("Detected X_left_frame:", X_left_frame, "Detected X_right_frame:", X_right_frame);
        
        // --- 3. バーの左端（「｜」線）の共通X座標 `startX` と 最大X座標 `maxX` を算出 ---
        // Xフレームを基準に比率で算出
        const startX = Math.round(X_left_frame + totalFrameWidth * START_X_POSITION_RATIO);
        const maxX = Math.round(X_left_frame + totalFrameWidth * MAX_X_POSITION_RATIO);

        console.log("Calculated startX (by ratio):", startX);
        console.log("Calculated maxX (by ratio):", maxX);

        if (startX >= maxX) { 
            resultsDiv.innerHTML = '<p style="color: red;">バーの開始X座標が最大X座標よりも大きいか同じです。比率設定またはフレーム検出に問題がある可能性があります。</p>';
            console.error("startX >= maxX. Check ratios or frame detection.");
            return;
        }

        // --- 4. 各ステータスバーのY座標を比率で算出 ---
        const actualDefiniteBarYs = new Map();
        for (const barInfo of STATUS_BARS) {
            const ratio = BAR_Y_POSITIONS_RATIO[barInfo.name];
            if (ratio !== undefined) {
                const calculatedY = Math.round(Y_top_frame + totalFrameHeight * ratio);
                actualDefiniteBarYs.set(barInfo.name, calculatedY);
            } else {
                actualDefiniteBarYs.set(barInfo.name, null);
                console.warn(`Warning: Ratio not defined for bar: ${barInfo.name}`);
            }
        }
        console.log("Calculated Bar Ys (by ratio):", Object.fromEntries(actualDefiniteBarYs));

        if (actualDefiniteBarYs.size < STATUS_BARS.length || Array.from(actualDefiniteBarYs.values()).some(y => y === null)) {
            resultsDiv.innerHTML = `<p style="color: red;">ステータスバーのY座標の特定に失敗しました。すべてのバーが見つからないか、フレームの検出に問題がある可能性があります。</p><p style="color: red;">現在の検出数: ${Array.from(actualDefiniteBarYs.values()).filter(y => y !== null).length}/${STATUS_BARS.length}</p>`;
            return;
        }

        // --- 5. 各ステータスバーの右端 (`currentX`) の検出とパーセンテージ計算 ---
        const finalResults = [];
        const BACKGROUND_TRANSITION_TOLERANCE = COLOR_TOLERANCE * 1.5; 
        const BAR_COLOR_DETECTION_TOLERANCE = COLOR_TOLERANCE * 1.3; // バー本体の色検出の許容誤差を再調整 (39)
        
        const CONSECUTIVE_NON_BAR_PIXELS_THRESHOLD = 5; 

        const SCAN_BAR_COLOR_X_START = startX + 2; 
        const SCAN_BAR_COLOR_X_END_FOR_PERCENTAGE = maxX + 20; 

        for (let i = 0; i < STATUS_BARS.length; i++) {
            const barInfo = STATUS_BARS[i];
            const barY = actualDefiniteBarYs.get(barInfo.name); 
            if (barY === null) {
                finalResults.push(`<p>${barInfo.name}: 0% (Y座標未検出)</p>`);
                continue;
            }
            
            let currentX = startX; 
            
            let targetBackgroundColor = GENERAL_BACKGROUND_COLOR; 
            if (barInfo.name === '攻撃' || barInfo.name === '防御' || barInfo.name === '敏捷') {
                targetBackgroundColor = BAR_BACKGROUND_TYPE1;
            } else if (barInfo.name === 'HP' || barInfo.name === '魔攻' || barInfo.name === '魔防') {
                targetBackgroundColor = BAR_BACKGROUND_TYPE2;
            }

            let consecutiveNonBarPixels = 0; 

            for (let x = SCAN_BAR_COLOR_X_START; x <= SCAN_BAR_COLOR_X_END_FOR_PERCENTAGE; x++) { 
                const pixel = getPixelColor(imageData, x, barY);
                
                const isMainBarColor = isColorClose(pixel, barInfo.color, BAR_COLOR_DETECTION_TOLERANCE);
                const isHPUnderscoreGradient = (barInfo.name === 'HP' && isColorClose(pixel, HP_UNDERSCORE_GRADIENT_START_COLOR, BAR_COLOR_DETECTION_TOLERANCE));
                
                if (isMainBarColor || isHPUnderscoreGradient) {
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
            percentage = Math.max(0, Math.min(100, percentage));

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
