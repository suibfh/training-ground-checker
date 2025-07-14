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

// 2. 定数の定義 (PHP版から移植)
const BarAnalyzer = { // オブジェクトとしてまとめる
    // バーの色定義 (RGB) - toleranceは後で使う
    barColors: {
        hp: { r: 254, g: 104, b: 104 }, // HP 赤
        atk: { r: 104, g: 172, b: 254 }, // 攻撃 青
        matk: { r: 255, g: 172, b: 104 }, // 魔攻 オレンジ
        def: { r: 104, g: 255, b: 104 }, // 防御 緑
        mdef: { r: 172, g: 104, b: 255 }, // 魔防 紫
        spd: { r: 254, g: 254, b: 104 }  // 敏捷 黄
    },
    // トラック (レールの背景) の色
    trackBackgroundColor: { r: 41, g: 33, b: 34 }, // 濃い灰色
    // 背景の最も一般的な色 (UI外の背景など)
    generalBackgroundColor: { r: 141, g: 133, b: 134 }, // 薄い灰色

    // 色の許容範囲 (RGB各成分の差の絶対値の合計)
    // PHPのtoleranceは個別のR,G,Bの差ではなく、合計の差でした
    colorTolerance: 70, // <-- ここを調整してテストしてみてください。前回の推奨値に設定

    // UI境界検出用定数
    // 水平方向のスキャン開始X比率 (画像の左端から)
    HORIZONTAL_SCAN_START_X_RATIO: 0.1,
    // 水平方向のスキャン終了X比率 (画像の左端から)
    HORIZONTAL_SCAN_END_X_RATIO: 0.9,
    // 垂直方向のスキャン開始Y比率 (画像の上端から)
    VERTICAL_SCAN_START_Y_RATIO: 0.1,
    // 垂直方向のスキャン終了Y比率 (画像の上端から)
    VERTICAL_SCAN_END_Y_RATIO: 0.9,
    // UIの上下左右の端を見つけるための、端から内側への安全マージン比率
    UI_SAFE_MARGIN_RATIO: 0.01, // 1%

    // バー群のY座標相対比率 (UIの高さに対する相対位置)
    // 画面の一番上からのUIの高さの比率 + (UIの高さ * 比率)
    BAR_Y_CENTER_RELATIVE_UI_RATIOS: {
        hp: 0.18, // UI上端からHPバーの中心までの比率
        atk: 0.30,
        matk: 0.42,
        def: 0.54,
        mdef: 0.66,
        spd: 0.78
    },

    // レールの開始X座標 (UI幅に対する相対位置)
    RAIL_START_X_RELATIVE_UI_RATIO: 0.35,
    // レールの終了X座標 (UI幅に対する相対位置)
    RAIL_END_X_RELATIVE_UI_RATIO: 0.96, // 100%時のバーの右端の比率

    // バーの走査開始X座標 (レールの開始Xからの相対比率)
    BAR_SCAN_START_X_RELATIVE_RAIL_RATIO: 0.01,
    // バーの走査終了X座標 (レールの終了Xからの相対比率)
    BAR_SCAN_END_X_RELATIVE_RAIL_RATIO: 0.99,

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

        // 縮小された画像から元の画像へのピクセル比率 (未使用だが念のため残す)
        // const scaleX = originalImageWidth / width;
        // const scaleY = originalImageHeight / height;

        // 1. UI境界の検出
        // 水平スキャンでUIの左右端を検出
        let uiLeft = -1, uiRight = -1;
        const scanY = Math.floor(height * 0.5); // 垂直中央付近をスキャン
        const scanStartX = Math.floor(width * BarAnalyzer.HORIZONTAL_SCAN_START_X_RATIO);
        const scanEndX = Math.floor(width * BarAnalyzer.HORIZONTAL_SCAN_END_X_RATIO);

        // デバッグ: 水平スキャンラインを描画
        ctx.fillStyle = 'rgba(255, 255, 0, 0.3)'; // 半透明の黄色
        ctx.fillRect(scanStartX, scanY, scanEndX - scanStartX, 1);

        for (let x = scanStartX; x < scanEndX; x++) {
            const pixelColor = getPixelColor(imageData, x, scanY);
            if (pixelColor && !isColorMatch(pixelColor, BarAnalyzer.generalBackgroundColor)) {
                if (uiLeft === -1) {
                    uiLeft = x;
                }
                uiRight = x;
                // デバッグ: UIと判断されたピクセルを緑で強調
                ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
                ctx.fillRect(x, scanY, 1, 1);
            }
        }

        // 垂直スキャンでUIの上下端を検出
        let uiTop = -1, uiBottom = -1;
        const scanX = Math.floor(width * 0.5); // 水平中央付近をスキャン
        const scanStartY = Math.floor(height * BarAnalyzer.VERTICAL_SCAN_START_Y_RATIO);
        const scanEndY = Math.floor(height * BarAnalyzer.VERTICAL_SCAN_END_Y_RATIO);

        // デバッグ: 垂直スキャンラインを描画
        ctx.fillStyle = 'rgba(255, 0, 255, 0.3)'; // 半透明の紫
        ctx.fillRect(scanX, scanStartY, 1, scanEndY - scanStartY);

        for (let y = scanStartY; y < scanEndY; y++) {
            const pixelColor = getPixelColor(imageData, scanX, y);
            if (pixelColor && !isColorMatch(pixelColor, BarAnalyzer.generalBackgroundColor)) {
                if (uiTop === -1) {
                    uiTop = y;
                }
                uiBottom = y;
                // デバッグ: UIと判断されたピクセルをシアンで強調
                ctx.fillStyle = 'rgba(0, 255, 255, 0.5)';
                ctx.fillRect(scanX, y, 1, 1);
            }
        }

        // UI境界の安全マージン適用
        const uiMarginX = Math.floor(width * BarAnalyzer.UI_SAFE_MARGIN_RATIO);
        const uiMarginY = Math.floor(height * BarAnalyzer.UI_SAFE_MARGIN_RATIO);
        uiLeft = Math.max(0, uiLeft + uiMarginX);
        uiRight = Math.min(width - 1, uiRight - uiMarginX);
        uiTop = Math.max(0, uiTop + uiMarginY);
        uiBottom = Math.min(height - 1, uiBottom - uiMarginY);

        if (uiLeft === -1 || uiRight === -1 || uiTop === -1 || uiBottom === -1 || uiLeft >= uiRight || uiTop >= uiBottom) {
            throw new Error("UIの境界を検出できませんでした。画像を確認してください。");
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
            let foundBarEnd = false;

            // バーの走査範囲 (レールの幅に対する相対座標を実際のピクセルに変換)
            const scanPixelStartX = railStartX + Math.floor(railLength * BarAnalyzer.BAR_SCAN_START_X_RELATIVE_RAIL_RATIO);
            const scanPixelEndX = railStartX + Math.floor(railLength * BarAnalyzer.RAIL_END_X_RELATIVE_UI_RATIO); // RAIL_END_X_RELATIVE_UI_RATIO を使う


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
                let isBarPixel = false;
                // バーの中心Yから上下にスキャン範囲を広げて色を確認
                for (let yOffset = -BarAnalyzer.BAR_SCAN_Y_RANGE; yOffset <= BarAnalyzer.BAR_SCAN_Y_RANGE; yOffset++) {
                    const scanY = barY + yOffset;
                    const pixel = getPixelColor(imageData, x, scanY);
                    
                    if (pixel && isColorMatch(pixel, barColor)) {
                        isBarPixel = true;
                        // デバッグ: バーの色だと判断されたピクセルを、そのバーの実際の色の半透明で描画
                        ctx.fillStyle = `rgba(${barColor.r}, ${barColor.g}, ${barColor.b}, 0.5)`;
                        ctx.fillRect(x, scanY, 1, 1);
                        break; // このX座標でバーの色が見つかったら次のXへ
                    } else if (pixel && isColorMatch(pixel, BarAnalyzer.trackBackgroundColor)) {
                         // デバッグ: レール背景色だと判断されたピクセルを、少し濃い灰色で描画
                        ctx.fillStyle = 'rgba(41, 33, 34, 0.5)';
                        ctx.fillRect(x, scanY, 1, 1);
                    }
                }

                if (isBarPixel) {
                    currentBarX = x; // バーの色が見つかった最後のX座標を更新
                    foundBarEnd = true;
                } else if (foundBarEnd) {
                    // 一度バーの色が見つかった後、バーの色ではないピクセルが続いたら、それがバーの終端の少し先
                    // 実際にはcurrentBarXが最後のバーピクセル
                    break;
                }
            }
            
            // PHP版のロジックではtrackEndXは固定値を使っていたので、ここでは railEndX をそのまま使います
            const actualTrackEndX = railEndX; // あるいは定義されたレール終了位置

            // パーセンテージ計算
            let percentage = 0;
            if (currentBarX > railStartX && actualTrackEndX > railStartX) {
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
