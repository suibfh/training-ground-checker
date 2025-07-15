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
        hp: { r: 252, g: 227, b: 126 }, // HP 黄
        atk: { r: 214, g: 107, b: 135 }, // 攻撃 ピンク
        matk: { r: 85, g: 134, b: 200 }, // 魔攻 青
        def: { r: 237, g: 170, b: 118 }, // 防御 オレンジ
        mdef: { r: 140, g: 210, b: 236 }, // 魔防 水色
        spd: { r: 113, g: 252, b: 211 }  // 敏捷 エメラルドグリーン
    },
    // トラック (レールの背景) の色
    // IMPORTANT: このRGB値も、画像からスポイトツールで正確に取得し、更新してください！
    trackBackgroundColor: { r: 69, g: 52, b: 26 }, // 濃い灰色

    // UIの外枠の色 (白っぽい色)
    // IMPORTANT: このRGB値も、画像からスポイトツールで正確に取得し、更新してください！
    uiBorderColor: { r: 185, g: 185, b: 185 }, // <-- この値を画像から正確に取得して設定してください！

    // generalBackgroundColor はUI境界検出では使わないためコメントアウトまたは削除
    // generalBackgroundColor: { r: 79, g: 60, b: 31 },

    // 色の許容範囲 (RGB各成分の差の絶対値の合計)
    // まずは大きくしてバーが検出されるか確認し、その後最適な値に調整してください。
    colorTolerance: 200, // <-- ここを調整してテストしてみてください。（バーの色検出用）

    // UI境界検出専用の色の許容範囲（uiBorderColorとisColorMatchで使う）
    // uiBorderColorとbarEdgeColorの区別が難しい場合でも、ここを調整して試してください。
    // まずは50-100程度から試すのが良いかもしれません。
    uiBorderTolerance: 250, // <-- ここを調整してテストしてみてください。（UI外枠検出用）

    // バーの縁の色 (RGB) - ここを実際の白い縁の色に設定してください！
    barEdgeColor: { r: 255, g: 255, b: 255 }, // 例: 真っ白の場合。正確なRGB値を画像から取得して設定してください。

    // UI境界検出用定数 (古いロジックで使われていたが、新しいロジックでは直接使わない)
    HORIZONTAL_SCAN_START_X_RATIO: 0.1,
    HORIZONTAL_SCAN_END_X_RATIO: 0.9,
    VERTICAL_SCAN_START_Y_RATIO: 0.1,
    VERTICAL_SCAN_END_Y_RATIO: 0.9,
    
    // UIの上下左右の端を見つけるための、端から内側への安全マージン比率
    UI_SAFE_MARGIN_RATIO: 0.01, // 1%

    // UI右端をスキャンするX軸の開始比率（画像の右端からの割合、例: 0.85 は画像の85%から右端まで）
    // この値を調整して、UI外枠の右端が確実に含まれるようにしてください。
    UI_RIGHT_SCAN_START_X_RATIO: 0.85, // 画像幅の85%地点から右端までをスキャン

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

    // 計算結果に加算する調整値（%）
    PERCENTAGE_ADJUSTMENT: 1.7, // 例えば1.8%を加算
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
        // Canvas2D: Multiple readback operations using getImageData are faster with the willReadFrequently attribute set to true.
        // パフォーマンス警告への対応。getContext('2d') の際に willReadFrequently: true を追加検討。
        // ctx = analysisCanvas.getContext('2d', { willReadFrequently: true });
        // ただし、この修正は `analysisCanvas.getContext('2d');` の行で行う必要があるため、今回はそのまま。
        // 必要であれば、DOMContentLoaded時などにgetContext呼び出しを修正してください。

        // --- UI境界検出ロジック (uiBorderColorを使用) ---
        let uiLeft = -1, uiRight = -1, uiTop = -1, uiBottom = -1;

        // Y軸はUIの上部から下部まで広くスキャンする
        const scanYStartForBorder = Math.floor(height * 0.1); // 画像の上部10%から開始
        const scanYEndForBorder = Math.floor(height * 0.9);    // 画像の下部90%までスキャン

        // 1. 左端を検出 (左から右へスキャン)
        for (let x = 0; x < width; x++) {
            let foundBorder = false;
            for (let y = scanYStartForBorder; y < scanYEndForBorder; y++) {
                const pixelColor = getPixelColor(imageData, x, y);
                // UI境界検出には BarAnalyzer.uiBorderTolerance を使用
                if (pixelColor && isColorMatch(pixelColor, BarAnalyzer.uiBorderColor, BarAnalyzer.uiBorderTolerance)) {
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

        // 2. 右端を検出 (右から左へスキャン) - X軸スキャン範囲を限定
        const scanXStartForUiRight = Math.floor(width * BarAnalyzer.UI_RIGHT_SCAN_START_X_RATIO); // 画像幅のX%地点からスキャン開始
        const scanXEndForUiRight = width - 1; // 画像の右端まで

        for (let x = scanXEndForUiRight; x >= scanXStartForUiRight; x--) {
            let foundBorder = false;
            for (let y = scanYStartForBorder; y < scanYEndForBorder; y++) {
                const pixelColor = getPixelColor(imageData, x, y);
                // UI境界検出には BarAnalyzer.uiBorderTolerance を使用
                if (pixelColor && isColorMatch(pixelColor, BarAnalyzer.uiBorderColor, BarAnalyzer.uiBorderTolerance)) {
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

        // uiRight が検出されなかった場合のフォールバック処理
        if (uiRight === -1) {
            console.warn("限定された範囲でUIの右端の外枠を検出できませんでした。uiLeftと仮定のUI幅から計算します。");
            // uiLeftが検出されている前提で、仮のUI幅からuiRightを計算
            // ここで使われる比率も、BarAnalyzerに定数として定義し、調整可能にすると良い
            if (uiLeft !== -1) {
                // 例: UIの幅が全体の70%程度と仮定 (この0.7も調整可能にすると良い)
                const assumedUiWidthRatio = 0.7; // <-- この比率も画像に合わせて調整してください
                uiRight = uiLeft + Math.floor(width * assumedUiWidthRatio);
                // ただし、Canvasの右端を超えないようにする
                uiRight = Math.min(uiRight, width - 1);
            } else {
                // uiLeftも検出できていない場合はエラーをスロー
                throw new Error("UIの左端と右端の境界を検出できませんでした。`uiBorderColor`が正確に設定されているか確認してください。");
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
                // UI境界検出には BarAnalyzer.uiBorderTolerance を使用
                if (pixelColor && isColorMatch(pixelColor, BarAnalyzer.uiBorderColor, BarAnalyzer.uiBorderTolerance)) {
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
                // UI境界検出には BarAnalyzer.uiBorderTolerance を使用
                if (pixelColor && isColorMatch(pixelColor, BarAnalyzer.uiBorderColor, BarAnalyzer.uiBorderTolerance)) {
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

        if (uiLeft === -1 || uiTop === -1 || uiBottom === -1 || uiLeft >= uiRight || uiTop >= uiBottom) { // uiRightのチェックはフォールバックで対応するため、ここではuiLeftが検出されていればOK
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
            let scanningBar = false;      // バーの色または縁の色をスキャン中かどうかのフラグ

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
                let foundAnyBarRelatedPixelInColumn = false; // 現在のX座標の列で、バー関連の色が見つかったか
                
                // バーの中心Yから上下にスキャン範囲を広げて色を確認
                for (let yOffset = -BarAnalyzer.BAR_SCAN_Y_RANGE; yOffset <= BarAnalyzer.BAR_SCAN_Y_RANGE; yOffset++) {
                    const scanY = barY + yOffset;
                    const pixel = getPixelColor(imageData, x, scanY);
                    
                    if (!pixel) {
                        continue;
                    }

                    // ピクセルがバーの色、または白い縁の色に一致するかチェック
                    if (isColorMatch(pixel, barColor) || isColorMatch(pixel, BarAnalyzer.barEdgeColor)) {
                        foundAnyBarRelatedPixelInColumn = true;
                        scanningBar = true; // バーの検出が始まった
                        // デバッグ描画: バーの色だと判断されたピクセルを、そのバーの実際の色の半透明で描画
                        ctx.fillStyle = `rgba(${barColor.r}, ${barColor.g}, ${barColor.b}, 0.5)`;
                        ctx.fillRect(x, scanY, 1, 1);
                        // このX座標でバーまたは縁の色が見つかったら、このyOffsetのループは終了し、次のxへ
                        break; 
                    } else if (isColorMatch(pixel, BarAnalyzer.trackBackgroundColor)) {
                         // デバッグ: レール背景色だと判断されたピクセルを、少し濃い灰色で描画
                        ctx.fillStyle = 'rgba(41, 33, 34, 0.5)';
                        ctx.fillRect(x, scanY, 1, 1);
                    }
                }

                // バー関連のピクセルが見つかった場合、currentBarXを更新
                if (foundAnyBarRelatedPixelInColumn) {
                    currentBarX = x;
                } 
                // バーをスキャン中で、かつ現在の列でバー関連のピクセルが見つからなかった場合
                // これはバーが終了したことを意味する
                else if (scanningBar && !foundAnyBarRelatedPixelInColumn) {
                    // ここで currentBarX は最後にバー関連のピクセルが見つかったX座標を保持しているはず
                    // そのため、breakしてループを終了する
                    break; 
                }
            }
            
            // PHP版のロジックではtrackEndXは固定値を使っていたので、ここでは railEndX をそのまま使います
            const actualTrackEndX = railEndX; // あるいは定義されたレール終了位置

            // パーセンテージ計算
            let percentage = 0;
            if (currentBarX >= railStartX && actualTrackEndX > railStartX) { // currentBarX == railStartX の場合も0%として含める
                percentage = Math.min(100, Math.max(0, ((currentBarX - railStartX) / (actualTrackEndX - railStartX)) * 100));
            }

            // ★★★ ここから修正箇所 ★★★
            // 調整値を加算
            percentage += BarAnalyzer.PERCENTAGE_ADJUSTMENT;

            // 最大100%に制限 (切り上げ前に制限)
            percentage = Math.min(100, percentage);

            // 小数点なしで切り上げ (Math.ceil() は小数点以下を切り上げる)
            percentage = Math.ceil(percentage);

            // 再度、最大100%に制限 (切り上げ後に100を超えた場合のため)
            percentage = Math.min(100, percentage);
            // ★★★ ここまで修正箇所 ★★★

            results[barName] = percentage.toFixed(0); // 小数点以下なしに変更

            // 解析結果のデバッグ表示 (コンソール)
            console.log(`[DEBUG] ${barName.toUpperCase()}: BarY=${barY}, CurrentBarX=${currentBarX}, RailStartX=${railStartX}, ActualTrackEndX=${actualTrackEndX}, Percentage=${percentage.toFixed(0)}%`);

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
