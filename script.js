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

    const COLOR_TOLERANCE = 25; // RGB値の二乗誤差のしきい値 (少し厳しくして明確な色を検出)

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
     * 2つの色が許容範囲内にあるか判定
     */
    function isColorClose(color1, color2, tolerance) {
        const dr = color1.r - color2.r;
        const dg = color1.g - color2.g;
        const db = color1.b - color2.b;
        return (dr * dr + dg * dg + db * db) < (tolerance * tolerance);
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
        // 右端 (X) の検出: 右から左へスキャンし、一般的な背景色でなくなる点を検出
        const SCAN_RIGHT_MARGIN = Math.floor(width * 0.05); // 右端から5%程度は必ず外枠と仮定
        for (let x = width - 1; x >= width - Math.floor(width * 0.3); x--) { // 画像の右30%をスキャン
            let isGeneralBgLine = true;
            for (let y = Math.floor(height * 0.2); y < Math.floor(height * 0.8); y+=5) { // 中央Y範囲で確認
                const pixel = getPixelColor(imageData, x, y);
                if (!isColorClose(pixel, GENERAL_BACKGROUND_COLOR, COLOR_TOLERANCE * 1.5)) {
                    isGeneralBgLine = false;
                    break;
                }
            }
            if (!isGeneralBgLine) {
                cropRightX = x + 1; // 背景色でなくなった1つ右の列
                break;
            }
        }
        
        // 下端 (Y) の検出: 下から上へスキャンし、一般的な背景色でなくなる点を検出
        const SCAN_BOTTOM_MARGIN = Math.floor(height * 0.05); // 下端から5%程度は必ず外枠と仮定
        for (let y = height - 1; y >= height - Math.floor(height * 0.3); y--) { // 画像の下30%をスキャン
            let isGeneralBgLine = true;
            for (let x = Math.floor(width * 0.2); x < Math.floor(width * 0.8); x+=5) { // 中央X範囲で確認
                const pixel = getPixelColor(imageData, x, y);
                if (!isColorClose(pixel, GENERAL_BACKGROUND_COLOR, COLOR_TOLERANCE * 1.5)) {
                    isGeneralBgLine = false;
                    break;
                }
            }
            if (!isGeneralBgLine) {
                cropBottomY = y + 1; // 背景色でなくなった1つ下の行
                break;
            }
        }

        // --- 2. バーの左端（「｜」線）の共通X座標 `startX` を特定 ---
        // 画像の左側からスキャンし、LEFT_BORDER_LINE_COLORが複数行で検出される場所を探す
        const SCAN_X_FOR_START_LINE = Math.floor(width * 0.1); // 左端から10%あたりからスキャン開始
        const END_SCAN_X_FOR_START_LINE = Math.floor(width * 0.2); // 左端から20%あたりまでスキャン

        for (let x = SCAN_X_FOR_START_LINE; x < END_SCAN_X_FOR_START_LINE; x++) {
            let consecutiveLinesFound = 0;
            for (let y = Math.floor(height * 0.2); y < Math.floor(height * 0.9); y++) { // 画像のY範囲を広めにスキャン
                const pixel = getPixelColor(imageData, x, y);
                if (isColorClose(pixel, LEFT_BORDER_LINE_COLOR, COLOR_TOLERANCE)) {
                    consecutiveLinesFound++;
                } else {
                    consecutiveLinesFound = 0; // 連続が途切れたらリセット
                }
                if (consecutiveLinesFound >= 3) { // 3ピクセル以上連続したら検出とみなす
                    startX = x;
                    break;
                }
            }
            if (startX !== null) break;
        }

        // --- 3. バーの最大X座標 `maxX` を特定 ---
        // startXから右へスキャンし、背景色ではないがバー色でもない、一番右のピクセルを探す
        // または、一般的な背景色に変わる手前まで
        const SCAN_Y_FOR_MAX_X = Math.floor(height * 0.5); // 画像中央付近のY座標でスキャン
        if (startX !== null) {
            for (let x = cropRightX -1; x > startX; x--) {
                const pixel = getPixelColor(imageData, x, SCAN_Y_FOR_MAX_X);
                // バー本体色や、バー背景色（未到達部分）ではない、一般的な背景色が見つかったらそこをMAX_Xの終わりとみなす
                if (isColorClose(pixel, GENERAL_BACKGROUND_COLOR, COLOR_TOLERANCE * 1.5)) {
                    maxX = x;
                    break;
                }
            }
        }
        // もしmaxXが見つからなければ、cropRightXを最大Xとする（より安全なフォールバック）
        if (maxX === null) {
            maxX = cropRightX;
        }


        console.log("Detected cropRightX:", cropRightX, "Detected cropBottomY:", cropBottomY);
        console.log("Detected startX:", startX, "Detected maxX:", maxX);

        if (startX === null || maxX === null || maxX <= startX) {
            resultsDiv.innerHTML = '<p style="color: red;">バーの左右の基準点が見つかりませんでした。画像を正しくトリミングしているか、または画像のバーが想定外の形式でないか確認してください。</p>';
            return;
        }
        
        // --- 4. 各ステータスバーのY座標を特定 ---
        const finalBarYsMap = new Map();
        const usedYIndices = new Set();
        
        // Y座標検出のためのスキャン範囲 (推定されるステータス表示領域の上部と下部を使用)
        // 例えば、画像の上部20%から下部90%の間をスキャン
        const Y_SCAN_START = Math.floor(height * 0.1); 
        const Y_SCAN_END = Math.floor(height * 0.95); 

        // 左端の線（｜）のX座標付近からバー本体の色を探す X範囲
        const SCAN_BAR_COLOR_X_START = startX + 5; // 左線のすぐ右
        const SCAN_BAR_COLOR_X_END = startX + 20; // 20ピクセル右まで

        // 各バーY座標候補を格納
        const barYCandidates = [];

        // Y軸に沿ってスキャンし、バーのY座標を特定
        for (let y = Y_SCAN_START; y < Y_SCAN_END; y++) {
            let isBorderLine = false;
            let barColorAtY = null;

            // まず、このY座標でLEFT_BORDER_LINE_COLORが検出されるか確認
            for (let x = startX - 3; x <= startX + 3; x++) { // startX付近で数ピクセル横をチェック
                const pixel = getPixelColor(imageData, x, y);
                if (isColorClose(pixel, LEFT_BORDER_LINE_COLOR, COLOR_TOLERANCE)) {
                    isBorderLine = true;
                    break;
                }
            }

            if (isBorderLine) {
                // 左線が見つかったら、そのすぐ右でバー本体の色をサンプリング
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

                if (pixelCount > 0) {
                    barColorAtY = {
                        r: Math.round(avgR / pixelCount),
                        g: Math.round(avgG / pixelCount),
                        b: Math.round(avgB / pixelCount)
                    };

                    // この色がSTATUS_BARSのどれかの色に近いかチェック
                    for (const barInfo of STATUS_BARS) {
                        if (isColorClose(barColorAtY, barInfo.color, COLOR_TOLERANCE * 1.5)) { // Y特定は少し許容度を上げる
                            // 既に検出されたバーY座標に近すぎないかチェック
                            let isTooCloseToExisting = false;
                            for (const existingCandidate of barYCandidates) {
                                if (Math.abs(y - existingCandidate.y) < 20) { // バー間の最小間隔を20ピクセルとする
                                    isTooCloseToExisting = true;
                                    break;
                                }
                            }
                            if (!isTooCloseToExisting) {
                                barYCandidates.push({ y: y, barInfo: barInfo, detectedColor: barColorAtY });
                                break; // このY座標ではこれ以上チェック不要
                            }
                        }
                    }
                }
            }
        }

        // 特定されたY座標候補をソート
        barYCandidates.sort((a, b) => a.y - b.y);

        // 各STATUS_BARSに最も合うY座標を割り当てる
        for (const barInfo of STATUS_BARS) {
            let assignedY = null;
            let bestMatchIndex = -1;
            let minColorDiffForAssign = Infinity;

            for (let j = 0; j < barYCandidates.length; j++) {
                if (usedYIndices.has(j)) continue; // 既に使用済みのY座標はスキップ

                const candidate = barYCandidates[j];
                const colorDiff = Math.sqrt(
                    Math.pow(candidate.barInfo.color.r - barInfo.color.r, 2) +
                    Math.pow(candidate.barInfo.color.g - barInfo.color.g, 2) +
                    Math.pow(candidate.barInfo.color.b - barInfo.color.b, 2)
                );

                if (colorDiff < minColorDiffForAssign) {
                    minColorDiffForAssign = colorDiff;
                    assignedY = candidate.y;
                    bestMatchIndex = j;
                }
            }

            // 最終的な割り当て閾値
            if (assignedY !== null && minColorDiffForAssign < (COLOR_TOLERANCE * 2.5)) { // 割り当ては少し厳しめに
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

        // 何ピクセルバー本体の色が連続しなくなったら終わりと見なすか
        const CONSECUTIVE_NON_BAR_PIXELS_THRESHOLD = 3; 

        for (let i = 0; i < STATUS_BARS.length; i++) {
            const barInfo = STATUS_BARS[i];
            const barY = actualDefiniteBarYs[i]; 
            let currentX = startX; 
            
            // バーの種類に応じて、未到達部分の背景色を設定
            let targetBackgroundColor = GENERAL_BACKGROUND_COLOR; // デフォルトは汎用背景
            if (barInfo.name === '攻撃' || barInfo.name === '防御' || barInfo.name === '敏捷') {
                targetBackgroundColor = BAR_BACKGROUND_TYPE1;
            } else if (barInfo.name === 'HP' || barInfo.name === '魔攻' || barInfo.name === '魔防') {
                targetBackgroundColor = BAR_BACKGROUND_TYPE2;
            }

            let consecutiveNonBarPixels = 0; 

            for (let x = startX + 1; x <= maxX + 10; x++) { // maxXを少し超えてスキャン
                const pixel = getPixelColor(imageData, x, barY);
                
                const isMainBarColor = isColorClose(pixel, barInfo.color, COLOR_TOLERANCE);
                const isUnderscoreLineColor = isColorClose(pixel, LEFT_BORDER_LINE_COLOR, COLOR_TOLERANCE); 
                const isHPUnderscoreGradient = (barInfo.name === 'HP' && isColorClose(pixel, HP_UNDERSCORE_GRADIENT_START_COLOR, GRADIENT_COLOR_TOLERANCE));
                
                // バー本体色、左線色、HPのグラデーション色はバーの有効な部分とみなす
                if (isMainBarColor || isUnderscoreLineColor || isHPUnderscoreGradient) {
                    currentX = x;
                    consecutiveNonBarPixels = 0;
                } 
                // 未到達部分の背景色、または一般的な外枠背景色になった場合
                else if (isColorClose(pixel, targetBackgroundColor, BACKGROUND_TRANSITION_TOLERANCE) || 
                         isColorClose(pixel, GENERAL_BACKGROUND_COLOR, BACKGROUND_TRANSITION_TOLERANCE)) {
                    consecutiveNonBarPixels++;
                    if (consecutiveNonBarPixels >= CONSECUTIVE_NON_BAR_PIXELS_THRESHOLD) {
                        // バーの途切れと判断。少し戻す
                        currentX = x - CONSECUTIVE_NON_BAR_PIXELS_THRESHOLD; 
                        break; 
                    }
                } 
                else {
                    // 想定外の色の場合も非バーピクセルとしてカウント
                    consecutiveNonBarPixels++;
                    if (consecutiveNonBarPixels >= CONSECUTIVE_NON_BAR_PIXELS_THRESHOLD) {
                        // バーの途切れと判断。少し戻す
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

            percentage = Math.round(percentage); // 1%単位に丸める

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
