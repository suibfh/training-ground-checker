// script.js

// 1. DOM要素の取得
const imageUpload = document.getElementById('imageUpload');
const imagePreview = document.getElementById('imagePreview');
const imagePreviewContainer = document.getElementById('imagePreviewContainer');
const analysisCanvas = document.getElementById('analysisCanvas');
const loadingMessage = document.getElementById('loadingMessage');
const errorMessage = document.getElementById('errorMessage');
const resultsDisplay = document.getElementById('resultsDisplay');

// Canvasのコンテキスト
const ctx = analysisCanvas.getContext('2d');

// 初期表示のリセット
function resetDisplay() {
    imagePreview.style.display = 'none';
    analysisCanvas.style.display = 'none';
    loadingMessage.style.display = 'none';
    errorMessage.style.display = 'none';
    resultsDisplay.innerHTML = '<p>ここにバーの解析結果が表示されます。</p>';
    imagePreview.src = '#'; // 前の画像をリセット
}

// エラーメッセージを表示する関数
function showErrorMessage(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    loadingMessage.style.display = 'none'; // エラー時はローディングメッセージを非表示に
    console.error(message); // コンソールにも出力
}

// 2. イベントリスナーの設定
imageUpload.addEventListener('change', handleImageUpload);

/**
 * 画像が選択されたときに呼び出される関数
 * @param {Event} event - changeイベントオブジェクト
 */
async function handleImageUpload(event) {
    resetDisplay();

    const file = event.target.files[0];

    if (!file) {
        return;
    }

    const validImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validImageTypes.includes(file.type)) {
        showErrorMessage('対応していないファイル形式です。JPEG, PNG, WebPファイルをアップロードしてください。');
        return;
    }

    loadingMessage.style.display = 'block';

    try {
        const imageUrl = URL.createObjectURL(file);
        
        const img = new Image();
        img.onload = async () => {
            // プレビューの表示
            imagePreview.src = imageUrl;
            imagePreview.style.display = 'block';

            // Canvasのセットアップ
            const computedStyle = window.getComputedStyle(imagePreviewContainer);
            const maxHeightPx = parseFloat(computedStyle.maxHeight) || 400;

            let width = img.width;
            let height = img.height;

            const aspectRatio = width / height;
            const containerAspectRatio = imagePreviewContainer.offsetWidth / maxHeightPx;

            if (width > imagePreviewContainer.offsetWidth || height > maxHeightPx) {
                if (aspectRatio > containerAspectRatio) {
                    width = imagePreviewContainer.offsetWidth;
                    height = width / aspectRatio;
                } else {
                    height = maxHeightPx;
                    width = height * aspectRatio;
                }
            }

            analysisCanvas.width = width;
            analysisCanvas.height = height;
            
            // Canvasに画像を描画 (縮小して描画される)
            ctx.drawImage(img, 0, 0, analysisCanvas.width, analysisCanvas.height);
            analysisCanvas.style.display = 'block';

            // ここで画像解析を実行！
            // analyzeImage関数にimgオブジェクトを渡すように変更（再描画のために使用）
            await analyzeImage(analysisCanvas, img, img.width, img.height); 

            loadingMessage.style.display = 'none';
            URL.revokeObjectURL(imageUrl);
        };
        img.onerror = () => {
            showErrorMessage('画像の読み込みに失敗しました。ファイルが破損しているか、アクセスできない可能性があります。');
            loadingMessage.style.display = 'none';
            URL.revokeObjectURL(imageUrl);
        };
        img.src = imageUrl;

    } catch (error) {
        showErrorMessage(`予期せぬエラーが発生しました: ${error.message}`);
        loadingMessage.style.display = 'none';
        console.error(error);
    }
}

// 初期化時に一度表示をリセット
resetDisplay();


// --- ここから画像解析ロジック ---

const BarAnalyzer = { // オブジェクトとしてまとめる
    // バーの色定義 (RGB) - toleranceは後で使う
    // IMPORTANT: これらのRGB値は、画像からスポイトツールで正確に取得し、更新してください！
    barColors: {
        hp: { r: 252, g: 227, b: 126 }, // HP 赤
        atk: { r: 214, g: 107, b: 135 }, // 攻撃 青
        matk: { r: 85, g: 134, b: 200 }, // 魔攻 オレンジ
        def: { r: 237, g: 170, b: 118 }, // 防御 緑
        mdef: { r: 140, g: 210, b: 236 }, // 魔防 紫
        spd: { r: 113, g: 252, b: 211 }  // 敏捷 黄
    },
    // トラック (レールの背景) の色
    // IMPORTANT: このRGB値も、画像からスポイトツールで正確に取得し、更新してください！
    trackBackgroundColor: { r: 69, g: 52, b: 26 }, // 濃い灰色

    // UIの外枠の色 (白っぽい色)
    // IMPORTANT: このRGB値も、画像からスポイトツールで正確に取得し、更新してください！
    uiBorderColor: { r: 254, g: 255, b: 255 }, // <-- この値を画像から正確に取得して設定してください！

    // generalBackgroundColor はUI境界検出では使わないためコメントアウトまたは削除
    // generalBackgroundColor: { r: 79, g: 60, b: 31 },

    // 色の許容範囲 (RGB各成分の差の絶対値の合計)
    // まずは大きくしてバーが検出されるか確認し、その後最適な値に調整してください。
    colorTolerance: 120, // <-- ここを調整してテストしてみてください。

    // ★★ 追加ここから ★★
    // バーの縁の色 (RGB) - ここを実際の白い縁の色に設定してください！
    barEdgeColor: { r: 255, g: 255, b: 255 }, // 例: 真っ白の場合。正確なRGB値を画像から取得して設定してください。
    // ★★ 追加ここまで ★★

    // UI境界検出用定数 (古いロジックで使われていたが、新しいロジックでは直接使わない)
    HORIZONTAL_SCAN_START_X_RATIO: 0.1,
    HORIZONTAL_SCAN_END_X_RATIO: 0.9,
    VERTICAL_SCAN_START_Y_RATIO: 0.1,
    VERTICAL_SCAN_END_Y_RATIO: 0.9,
    
    // UIの上下左右の端を見つけるための、端から内側への安全マージン比率
    // uiBorderColor を使う検出では不要になることが多いが、念のため残す
    UI_SAFE_MARGIN_RATIO: 0.01, // 1%

    // バー群のY座標相対比率 (UIの高さに対する相対位置)
    BAR_Y_CENTER_RELATIVE_UI_RATIOS: {
        hp: 0.085, // UI上端からHPバーの中心までの比率
        atk: 0.251, // 攻撃バーの中心
        matk: 0.417, // 魔攻バーの中心
        def: 0.583, // 防御バーの中心
        mdef: 0.749, // 魔防バーの中心
        spd: 0.915  // 敏捷バーの中心
    },

    // レールの開始X座標 (UI幅に対する相対位置)
    RAIL_START_X_RELATIVE_UI_RATIO: 0.17,
    // レールの終了X座標 (UI幅に対する相対位置)
    RAIL_END_X_RELATIVE_UI_RATIO: 0.77, // 100%時のバーの右端の比率

    // バーの走査開始X座標 (レールの開始Xからの相対比率)
    BAR_SCAN_START_X_RELATIVE_RAIL_RATIO: 0,
    // バーの走査終了X座標 (レールの終了Xからの相対比率)
    BAR_SCAN_END_X_RELATIVE_RAIL_RATIO: 0.99, // レール幅の99%までスキャン

    // バーのY軸スキャン範囲 (バー中心Yからの上下のピクセル数)
    BAR_SCAN_Y_RANGE: 3, // 中心Yから上下に3ピクセル (計7ピクセル)
};

/**
 * 2つの色のRGB値を比較し、指定された許容範囲内にあるかチェックする
 * @param {object} color1 - {r, g, b} 形式のRGB値
 * @param {object} color2 - {r, g, b} 形式のRGB値
 * @param {number} tolerance - 各成分の差の絶対値の合計の許容範囲
 * @returns {boolean} - 許容範囲内であればtrue
 */
function isColorMatch(color1, color2, tolerance = BarAnalyzer.colorTolerance) {
    const diffR = Math.abs(color1.r - color2.r);
    const diffG = Math.abs(color1.g - color2.g);
    const diffB = Math.abs(color1.b - color2.b);
    return (diffR + diffG + diffB) <= tolerance;
}

/**
 * 指定されたCanvasのピクセルからRGB値を取得する
 * @param {ImageData} imageData - CanvasRenderingContext2D.getImageData() で取得したImageDataオブジェクト
 * @param {number} x - ピクセルX座標
 * @param {number} y - ピクセルY座標
 * @returns {object|null} - {r, g, b} 形式のRGB値、または範囲外の場合はnull
 */
function getPixelColor(imageData, x, y) {
    if (x < 0 || x >= imageData.width || y < 0 || y >= imageData.height) {
        return null; // 範囲外
    }
    const index = (Math.floor(y) * imageData.width + Math.floor(x)) * 4; // x,y座標を整数に丸める
    return {
        r: imageData.data[index],
        g: imageData.data[index + 1],
        b: imageData.data[index + 2]
    };
}

/**
 * 画像解析を実行するメイン関数
 * @param {HTMLCanvasElement} canvas - 解析対象のCanvas要素
 * @param {HTMLImageElement} originalImage - 元の画像オブジェクト（再描画用）
 * @param {number} originalImageWidth - 元画像の幅
 * @param {number} originalImageHeight - 元画像の高さ
 */
async function analyzeImage(canvas, originalImage, originalImageWidth, originalImageHeight) {
    errorMessage.style.display = 'none'; // 新しい解析開始時にエラーメッセージを非表示に
    resultsDisplay.innerHTML = '<p>解析中...</p>'; // 結果表示エリアをリセット

    // Canvasをクリアして元の画像を再描画 (デバッグ描画の前に)
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height); // imgオブジェクトを使って再描画

    try {
        const width = canvas.width;
        const height = canvas.height;
        // ピクセルデータを再取得（描画クリア後に）
        const imageData = ctx.getImageData(0, 0, width, height);

        // --- UI境界検出ロジック (uiBorderColorを使用) ---
        let uiLeft = -1, uiRight = -1, uiTop = -1, uiBottom = -1;

        // 1. 左端を検出 (左から右へスキャン)
        // Y軸はUIの上部から下部まで広くスキャンする
        const scanYStartForBorder = Math.floor(height * 0.1); // 画像の上部10%から開始
        const scanYEndForBorder = Math.floor(height * 0.9);    // 画像の下部90%までスキャン

        for (let x = 0; x < width; x++) {
            let foundBorder = false;
            for (let y = scanYStartForBorder; y < scanYEndForBorder; y++) {
                const pixelColor = getPixelColor(imageData, x, y);
                if (pixelColor && isColorMatch(pixelColor, BarAnalyzer.uiBorderColor, BarAnalyzer.colorTolerance)) {
                    foundBorder = true;
                    // デバッグ: 白い枠と判断されたピクセルにマゼンタの点を描画
                    ctx.fillStyle = 'rgba(255, 0, 255, 0.5)';
                    ctx.fillRect(x, y, 1, 1);
                    break; // このX座標で枠が見つかったら次のXへ
                }
            }
            if (foundBorder) {
                uiLeft = x;
                break; // 左端が見つかったらループ終了
            }
        }

        // 2. 右端を検出 (右から左へスキャン)
        for (let x = width - 1; x >= 0; x--) {
            let foundBorder = false;
            for (let y = scanYStartForBorder; y < scanYEndForBorder; y++) {
                const pixelColor = getPixelColor(imageData, x, y);
                if (pixelColor && isColorMatch(pixelColor, BarAnalyzer.uiBorderColor, BarAnalyzer.colorTolerance)) {
                    foundBorder = true;
                     // デバッグ: 白い枠と判断されたピクセルにマゼンタの点を描画
                    ctx.fillStyle = 'rgba(255, 0, 255, 0.5)';
                    ctx.fillRect(x, y, 1, 1);
                    break;
                }
            }
            if (foundBorder) {
                uiRight = x;
                break; // 右端が見つかったらループ終了
            }
        }

        // 3. 上端を検出 (上から下へスキャン)
        // X軸は検出されたUIの左右端の範囲内でスキャンする
        // ただし、uiLeft/uiRightがまだ-1の場合に備えて、フォールバックの範囲を設ける
        const scanXStartForBorder = uiLeft !== -1 ? uiLeft : Math.floor(width * BarAnalyzer.HORIZONTAL_SCAN_START_X_RATIO);
        const scanXEndForBorder = uiRight !== -1 ? uiRight : Math.floor(width * BarAnalyzer.HORIZONTAL_SCAN_END_X_RATIO);

        for (let y = 0; y < height; y++) {
            let foundBorder = false;
            for (let x = scanXStartForBorder; x < scanXEndForBorder; x++) {
                const pixelColor = getPixelColor(imageData, x, y);
                if (pixelColor && isColorMatch(pixelColor, BarAnalyzer.uiBorderColor, BarAnalyzer.colorTolerance)) {
                    foundBorder = true;
                    // デバッグ: 白い枠と判断されたピクセルにマゼンタの点を描画
                    ctx.fillStyle = 'rgba(255, 0, 255, 0.5)';
                    ctx.fillRect(x, y, 1, 1);
                    break;
                }
            }
            if (foundBorder) {
                uiTop = y;
                break;
            }
        }

        // 4. 下端を検出 (下から上へスキャン)
        for (let y = height - 1; y >= 0; y--) {
            let foundBorder = false;
            for (let x = scanXStartForBorder; x < scanXEndForBorder; x++) {
                const pixelColor = getPixelColor(imageData, x, y);
                if (pixelColor && isColorMatch(pixelColor, BarAnalyzer.uiBorderColor, BarAnalyzer.colorTolerance)) {
                    foundBorder = true;
                    // デバッグ: 白い枠と判断されたピクセルにマゼンタの点を描画
                    ctx.fillStyle = 'rgba(255, 0, 255, 0.5)';
                    ctx.fillRect(x, y, 1, 1);
                    break;
                }
            }
            if (foundBorder) {
                uiBottom = y;
                break;
            }
        }

        // UI境界の安全マージン適用は、uiBorderColorでの検出では通常不要。
        // 必要に応じて調整してください。今回は一旦コメントアウトのまま。
        // const uiMarginX = Math.floor(width * BarAnalyzer.UI_SAFE_MARGIN_RATIO);
        // const uiMarginY = Math.floor(height * BarAnalyzer.UI_SAFE_MARGIN_RATIO);
        // uiLeft = Math.max(0, uiLeft + uiMarginX);
        // uiRight = Math.min(width - 1, uiRight - uiMarginX);
        // uiTop = Math.max(0, uiTop + uiMarginY);
        // uiBottom = Math.min(height - 1, uiBottom - uiMarginY);

        if (uiLeft === -1 || uiRight === -1 || uiTop === -1 || uiBottom === -1 || uiLeft >= uiRight || uiTop >= uiBottom) {
            throw new Error("UIの境界を検出できませんでした。白い枠が画像内に明確に存在するか確認し、`uiBorderColor`が正確に設定されているか確認してください。");
        }

        console.log(`UI Bounds (Canvas Pixels): Top=${uiTop}, Bottom=${uiBottom}, Left=${uiLeft}, Right=${uiRight}`);

        const uiWidth = uiRight - uiLeft + 1;
        const uiHeight = uiBottom - uiTop + 1;

        // デバッグ: 確定したUI境界を赤い線で描画
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.strokeRect(uiLeft, uiTop, uiWidth, uiHeight);

        // 結果を格納するオブジェクト
        const results = {};
        const resultHtml = [];

        // バーの種類ごとにループして解析
        for (const barName in BarAnalyzer.barColors) {
            const barColor = BarAnalyzer.barColors[barName];
            const relativeYRatio = BarAnalyzer.BAR_Y_CENTER_RELATIVE_UI_RATIOS[barName];

            // UI内でのバーの中心Y座標 (Canvas座標)
            const barY = uiTop + Math.floor(uiHeight * relativeYRatio);

            // レールの開始Xと終了X (Canvas座標)
            const railStartX = uiLeft + Math.floor(uiWidth * BarAnalyzer.RAIL_START_X_RELATIVE_UI_RATIO);
            const railEndX = uiLeft + Math.floor(uiWidth * BarAnalyzer.RAIL_END_X_RELATIVE_UI_RATIO);
            const railLength = railEndX - railStartX;

            if (railLength <= 0) {
                console.warn(`[WARN] Rail length for ${barName} is too small or negative. Skipping.`);
                results[barName] = 'N/A';
                continue;
            }

            // バーの右端X座標を見つける
            let currentBarX = railStartX; // 初期値はレールの開始点
            let foundBarOrEdge = false; // バーの色（または縁）が見つかったかどうかのフラグ
            let lastEdgeRightX = railStartX; // ★★ 修正ここから ★★ 白い縁が検出された最も右のX座標を保持する変数

            // バーの走査範囲 (レールの幅に対する相対座標を実際のピクセルに変換)
            const scanPixelStartX = railStartX + Math.floor(railLength * BarAnalyzer.BAR_SCAN_START_X_RELATIVE_RAIL_RATIO);
            const scanPixelEndX = railStartX + Math.floor(railLength * BarAnalyzer.BAR_SCAN_END_X_RELATIVE_RAIL_RATIO);


            // デバッグ: バーY軸スキャンラインを描画 (薄い灰色)
            ctx.strokeStyle = 'rgba(150, 150, 150, 0.3)';
            ctx.lineWidth = 1;
            for (let yOffset = -BarAnalyzer.BAR_SCAN_Y_RANGE; yOffset <= BarAnalyzer.BAR_SCAN_Y_RANGE; yOffset++) {
                const currentScanY = barY + yOffset;
                ctx.beginPath();
                ctx.moveTo(scanPixelStartX, currentScanY);
                ctx.lineTo(scanPixelEndX, currentScanY);
                ctx.stroke();
            }

            // 右へスキャンしてバーの終端を見つける
            for (let x = scanPixelStartX; x <= scanPixelEndX; x++) {
                let isCurrentXABarOrEdgePixel = false; // 現在のX座標でバーの色か縁の色が見つかったか

                // バーの中心Yから上下にスキャン範囲を広げて色を確認
                for (let yOffset = -BarAnalyzer.BAR_SCAN_Y_RANGE; yOffset <= BarAnalyzer.BAR_SCAN_Y_RANGE; yOffset++) {
                    const scanY = barY + yOffset;
                    const pixel = getPixelColor(imageData, x, scanY);
                    
                    if (!pixel) { // ピクセルデータがない場合は、このyOffsetはスキップ
                        continue;
                    }

                    // ピクセルがバーの色、または白い縁の色に一致するかチェック
                    if (isColorMatch(pixel, barColor) || isColorMatch(pixel, BarAnalyzer.barEdgeColor)) {
                        isCurrentXABarOrEdgePixel = true; // このX座標でバーまたは縁のピクセルを発見
                        if (isColorMatch(pixel, BarAnalyzer.barEdgeColor)) { // ★★ 修正ここから ★★
                            lastEdgeRightX = x; // 白い縁が見つかった場合は、そのX座標を記録
                        } // ★★ 修正ここまで ★★
                        // デバッグ描画: バーの色だと判断されたピクセルを、そのバーの実際の色の半透明で描画
                        ctx.fillStyle = `rgba(${barColor.r}, ${barColor.g}, ${barColor.b}, 0.5)`;
                        ctx.fillRect(x, scanY, 1, 1);
                        break; // このX座標でバーまたは縁の色が見つかったら、このyOffsetのループは終了し、次のxへ
                    } else if (isColorMatch(pixel, BarAnalyzer.trackBackgroundColor)) {
                         // デバッグ: レール背景色だと判断されたピクセルを、少し濃い灰色で描画
                        ctx.fillStyle = 'rgba(41, 33, 34, 0.5)';
                        ctx.fillRect(x, scanY, 1, 1);
                    }
                    // その他の色（背景でもバーでも縁でもない）の場合は何も描画しない
                }

                if (isCurrentXABarOrEdgePixel) { // このX座標でバーまたは縁のピクセルが見つかった場合
                    foundBarOrEdge = true; // バーの検出が始まったことをマーク
                    // currentBarX = x; // ここでは更新しない。最後に検出された白い縁の右端を使うため。
                } else if (foundBarOrEdge) {
                    // 一度バーの色または縁が見つかった後で、
                    // 今回のX座標ではバーの色も縁の色も見つからなかった場合
                    // => バーが終了したと判断し、スキャンを停止
                    currentBarX = lastEdgeRightX; // ★★ 修正ここから ★★ 最後に検出された白い縁の右端を最終的なバーの右端とする
                    break;
                }
            }
            // ★★ 修正ここまで ★★
            
            // PHP版のロジックではtrackEndXは固定値を使っていたので、ここでは railEndX をそのまま使います
            const actualTrackEndX = railEndX; // あるいは定義されたレール終了位置

            // パーセンテージ計算
            let percentage = 0;
            if (currentBarX >= railStartX && actualTrackEndX > railStartX) { // currentBarX == railStartX の場合も0%として含める
                percentage = Math.min(100, Math.max(0, ((currentBarX - railStartX) / (actualTrackEndX - railStartX)) * 100));
            }

            results[barName] = percentage.toFixed(2); // 小数点以下2桁

            // 解析結果のデバッグ表示 (コンソール)
            console.log(`[DEBUG] ${barName.toUpperCase()}: BarY=${barY}, CurrentBarX=${currentBarX}, RailStartX=${railStartX}, ActualTrackEndX=${actualTrackEndX}, Percentage=${percentage.toFixed(2)}%`);

            resultHtml.push(`
                <p>
                    <span class="label">${barName.toUpperCase()}:</span>
                    <span>${results[barName]}%</span>
                </p>
            `);

            // (オプション) Canvasに解析結果をオーバーレイ描画
            // バーの右端に線を引く
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)'; // 赤い線
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(currentBarX, barY - 5);
            ctx.lineTo(currentBarX, barY + 5);
            ctx.stroke();
        }

        resultsDisplay.innerHTML = resultHtml.join('');

    } catch (error) {
        showErrorMessage(`画像解析中にエラーが発生しました: ${error.message}`);
        console.error("Analysis Error:", error);
        resultsDisplay.innerHTML = '<p class="error-message-inline">解析に失敗しました。</p>';
    }
}
