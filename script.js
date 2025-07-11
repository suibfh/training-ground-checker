document.addEventListener('DOMContentLoaded', () => {
    const imageUpload = document.getElementById('imageUpload');
    const statusCanvas = document.getElementById('statusCanvas');
    const ctx = statusCanvas.getContext('2d');
    const overlayMessage = document.getElementById('overlayMessage');
    const resultsDiv = document.getElementById('results');
    const copyResultsBtn = document.getElementById('copyResults');

    let uploadedImage = null;

    // ステータスバーの定義 (IMG_3672.webpから精密に再サンプリング)
    const STATUS_BARS = [
        { name: 'HP', color: { r: 245, g: 214, b: 108 } },    // #F5D66C
        { name: '攻撃', color: { r: 195, g: 73, b: 108 } },    // #C3496C
        { name: '魔攻', color: { r: 81, g: 130, b: 192 } },    // #5182C0
        { name: '防御', color: { r: 219, g: 153, b: 96 } },    // #DB9960
        { name: '魔防', color: { r: 137, g: 199, b: 230 } },   // #89C7E6
        { name: '敏捷', color: { r: 102, g: 246, b: 208 } }    // #66F6D0
    ];

    const COLOR_TOLERANCE = 30; // RGB値の二乗誤差のしきい値 (一般的な色比較用)

    // バーの左端「｜」の線色 (再サンプリング)
    const LEFT_BORDER_LINE_COLOR = { r: 255, g: 255, b: 240 }; // #FFFFF0

    // バー領域の外枠の線色 (IMG_3672.webpから再サンプリング)
    const FRAME_LINE_COLOR = { r: 224, g: 207, b: 195 }; // #E0CFD3

    // バーの背景色（未到達部分の色）(再サンプリング)
    // タイプ1: 攻撃、防御、敏捷のバーの背景
    const BAR_BACKGROUND_TYPE1 = { r: 69, g: 50, b: 24 }; // #453218
    // タイプ2: HP、魔攻、魔防のバーの背景
    const BAR_BACKGROUND_TYPE2 = { r: 86, g: 67, b: 35 }; // #564323

    // 画像の外枠およびバー領域外の一般的な背景色（新しい画像の外枠の色）(再サンプリング)
    const GENERAL_BACKGROUND_COLOR = { r: 74, g: 55, b: 32 }; // #4A3720

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

        let startX = null; // バーの共通の開始X座標（「｜」線のX座標）
        let maxX = null;   // バーの共通の最大X座標（100%時の右端）
        let cropRightX = width; // ステータス表示領域の右端
        let cropBottomY = height; // ステータス表示領域の下端

        // --- 1. ステータス表示領域の右端と下端を特定 (外枠の背景色からの遷移で検出) ---
        // Y_top_frameとY_bottom_frameが特定できれば、これらのクロップは必須ではないが、安全のため残す
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
            // Y軸スキャン範囲を狭め、HPバーのY座標付近のみを狙う
            for (let y = Math.floor(height * 0.05); y < Math.floor(height * 0.15); y++) { 
                const pixel = getPixelColor(imageData, x, y);
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
        
        if (startX === null) {
            resultsDiv.innerHTML = '<p style="color: red;">バーの左端の基準点が見つかりませんでした。画像を正しくトリミングしているか、または画像のバーが想定外の形式でないか確認してください。</p>';
            return;
        }

        // --- 3. ステータスバー領域の上下のフレームY座標を特定 ---
        let Y_top_frame = null;
        let Y_bottom_frame = null;
        const FRAME_SCAN_X_CENTER = Math.floor(width * 0.5); // 中央付近のXでフレームを探す
        const FRAME_SCAN_X_HALF_WIDTH = Math.floor(width * 0.1); // スキャンするX範囲の半分

        // Y_top_frame の検出 (上から下へ)
        for (let y = 0; y < height; y++) {
            let frameLinePixels = 0;
            for (let x = FRAME_SCAN_X_CENTER - FRAME_SCAN_X_HALF_WIDTH; x <= FRAME_SCAN_X_CENTER + FRAME_SCAN_X_HALF_WIDTH; x++) {
                const pixel = getPixelColor(imageData, x, y);
                // 外枠の線色、またはバー領域の背景色に近ければフレームの一部とみなす
                if (isColorClose(pixel, FRAME_LINE_COLOR, COLOR_TOLERANCE * 1.5) || 
                    isColorClose(pixel, BAR_BACKGROUND_TYPE1, COLOR_TOLERANCE * 1.5) ||
                    isColorClose(pixel, BAR_BACKGROUND_TYPE2, COLOR_TOLERANCE * 1.5)) {
                    frameLinePixels++;
                }
            }
            // 一定数のピクセルがフレーム色であればフレームとみなす
            if (frameLinePixels > (FRAME_SCAN_X_HALF_WIDTH * 2 * 0.5)) { // スキャン範囲の50%以上
                Y_top_frame = y;
                break;
            }
        }

        // Y_bottom_frame の検出 (下から上へ)
        for (let y = height - 1; y >= 0; y--) {
            let frameLinePixels = 0;
            for (let x = FRAME_SCAN_X_CENTER - FRAME_SCAN_X_HALF_WIDTH; x <= FRAME_SCAN_X_CENTER + FRAME_SCAN_X_HALF_WIDTH; x++) {
                const pixel = getPixelColor(imageData, x, y);
                if (isColorClose(pixel, FRAME_LINE_COLOR, COLOR_TOLERANCE * 1.5) || 
                    isColorClose(pixel, BAR_BACKGROUND_TYPE1, COLOR_TOLERANCE * 1.5) ||
                    isColorClose(pixel, BAR_BACKGROUND_TYPE2, COLOR_TOLERANCE * 1.5)) {
                    frameLinePixels++;
                }
            }
            if (frameLinePixels > (FRAME_SCAN_X_HALF_WIDTH * 2 * 0.5)) { 
                Y_bottom_frame = y;
                break;
            }
        }
        
        console.log("Detected cropRightX:", cropRightX, "Detected cropBottomY:", cropBottomY);
        console.log("Detected startX:", startX);
        console.log("Detected Y_top_frame:", Y_top_frame, "Detected Y_bottom_frame:", Y_bottom_frame);

        if (Y_top_frame === null || Y_bottom_frame === null || Y_bottom_frame <= Y_top_frame + 20) { // 最小フレーム高を20pxとする
            resultsDiv.innerHTML = '<p style="color: red;">ステータスバー領域の上下フレームが見つかりませんでした。画像を正しくトリミングしているか、または画像のUIが想定外の形式でないか確認してください。</p>';
            return;
        }

        const totalFrameHeight = Y_bottom_frame - Y_top_frame;
        const actualDefiniteBarYs = new Map();

        // 各バーのY座標を比率で算出
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

        // --- 4. バーの最大X座標 `maxX` を特定 ---
        // Y_top_frameとY_bottom_frameの中央をスキャンYとする
        const SCAN_Y_FOR_MAX_X = Math.floor(Y_top_frame + totalFrameHeight / 2); 
        
        for (let x = cropRightX - 1; x > startX; x--) {
            const pixel = getPixelColor(imageData, x, SCAN_Y_FOR_MAX_X);
            // バーの背景色、または一般的な背景色に切り替わる点をmaxXとする
            if (isColorClose(pixel, GENERAL_BACKGROUND_COLOR, COLOR_TOLERANCE * 1.5) ||
                isColorClose(pixel, BAR_BACKGROUND_TYPE1, COLOR_TOLERANCE * 1.5) ||
                isColorClose(pixel, BAR_BACKGROUND_TYPE2, COLOR_TOLERANCE * 1.5)) {
                maxX = x;
                break;
            }
        }
        if (maxX === null || maxX <= startX) {
            maxX = cropRightX - 5; // 見つからなかった場合のフォールバック
            if (maxX <= startX) maxX = startX + 100; // 最低限の長さを確保
        }
        console.log("Detected maxX:", maxX);

        if (actualDefiniteBarYs.size < STATUS_BARS.length || Array.from(actualDefiniteBarYs.values()).some(y => y === null)) {
            resultsDiv.innerHTML = `<p style="color: red;">ステータスバーのY座標の特定に失敗しました。すべてのバーが見つからないか、フレームの検出に問題がある可能性があります。</p><p style="color: red;">現在の検出数: ${Array.from(actualDefiniteBarYs.values()).filter(y => y !== null).length}/${STATUS_BARS.length}</p>`;
            return;
        }

        // --- 5. 各ステータスバーの右端 (`currentX`) の検出とパーセンテージ計算 ---
        const finalResults = [];
        const BACKGROUND_TRANSITION_TOLERANCE = COLOR_TOLERANCE * 1.5; 
        const GRADIENT_COLOR_TOLERANCE = COLOR_TOLERANCE * 1.5; 

        const CONSECUTIVE_NON_BAR_PIXELS_THRESHOLD = 3; 

        // バー本体の色サンプリング範囲を調整 (startX + 15 から startX + 40) はY座標特定用だったため、ここはパーセンテージ用に調整不要
        // パーセンテージ計算は、バー本体の色が途切れるまでをカウントする

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
            const SCAN_BAR_COLOR_X_END_FOR_PERCENTAGE = maxX + 20; // 最大Xのさらに右までスキャン

            for (let x = startX + 1; x <= SCAN_BAR_COLOR_X_END_FOR_PERCENTAGE; x++) { 
                const pixel = getPixelColor(imageData, x, barY);
                
                // バー本体の色、左端の線色（バーが短い場合、線が終点になる可能性）、HPの背景グラデーション色
                const isMainBarColor = isColorClose(pixel, barInfo.color, COLOR_TOLERANCE);
                const isUnderscoreLineColor = isColorClose(pixel, LEFT_BORDER_LINE_COLOR, COLOR_TOLERANCE); 
                const isHPUnderscoreGradient = (barInfo.name === 'HP' && isColorClose(pixel, HP_UNDERSCORE_GRADIENT_START_COLOR, GRADIENT_COLOR_TOLERANCE));
                
                if (isMainBarColor || isUnderscoreLineColor || isHPUnderscoreGradient) {
                    currentX = x;
                    consecutiveNonBarPixels = 0;
                } 
                else if (isColorClose(pixel, targetBackgroundColor, BACKGROUND_TRANSITION_TOLERANCE) || 
                         isColorClose(pixel, GENERAL_BACKGROUND_COLOR, BACKGROUND_TRANSITION_TOLERANCE)) {
                    // バーの背景色、または全体の背景色に当たったらカウント
                    consecutiveNonBarPixels++;
                    if (consecutiveNonBarPixels >= CONSECUTIVE_NON_BAR_PIXELS_THRESHOLD) {
                        currentX = x - CONSECUTIVE_NON_BAR_PIXELS_THRESHOLD; // 遡る
                        break; 
                    }
                } 
                else {
                    // その他の色が続いたらカウント
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
            // 0%を下回らない、100%を上回らないように調整
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
