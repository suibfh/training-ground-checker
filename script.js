document.addEventListener('DOMContentLoaded', () => {
    const imageUpload = document.getElementById('imageUpload');
    const statusCanvas = document.getElementById('statusCanvas');
    const ctx = statusCanvas.getContext('2d');
    const overlayMessage = document.getElementById('overlayMessage');
    const resultsDiv = document.getElementById('results');
    const copyResultsBtn = document.getElementById('copyResults');

    let uploadedImage = null; // 読み込まれた画像オブジェクトを保持

    // ステータスバーの定義と正確な色（RGB）
    const STATUS_BARS = [
        { name: 'HP', color: { r: 252, g: 227, b: 126 } },    // #FCE37E
        { name: '攻撃', color: { r: 214, g: 107, b: 135 } },   // #D66B87
        { name: '魔攻', color: { r: 85, g: 134, b: 200 } },    // #5586C8
        { name: '防御', color: { r: 237, g: 170, b: 118 } },   // #EDAA76
        { name: '魔防', color: { r: 140, g: 210, b: 236 } },   // #8CD2EC
        { name: '敏捷', color: { r: 115, g: 251, b: 211 } }    // #73FBD3
    ];

    // 色の許容範囲 (小さいほど厳密、大きいほど寛容)
    const COLOR_TOLERANCE = 20; // RGB値の二乗誤差のしきい値

    // 補助線の色 (白に近い青)
    const WHITE_COLOR = { r: 234, g: 253, b: 255 }; // #EAFDFF

    // --- ヘルパー関数 ---

    /**
     * 指定された座標のピクセルのRGB値を取得
     * @param {ImageData} imageData - Canvasから取得したImageDataオブジェクト
     * @param {number} x - X座標
     * @param {number} y - Y座標
     * @returns {{r: number, g: number, b: number}} - RGB値
     */
    function getPixelColor(imageData, x, y) {
        if (x < 0 || x >= imageData.width || y < 0 || y >= imageData.height) {
            return { r: -1, g: -1, b: -1 }; // 範囲外の場合は無効な値を返す
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
     * @param {{r: number, g: number, b: number}} color1
     * @param {{r: number, g: number, b: number}} color2
     * @param {number} tolerance - 許容するRGB値の差
     * @returns {boolean}
     */
    function isColorClose(color1, color2, tolerance) {
        const dr = color1.r - color2.r;
        const dg = color1.g - color2.g;
        const db = color1.b - color2.b;
        return (dr * dr + dg * dg + db * db) < (tolerance * tolerance);
    }

    /**
     * 指定されたY座標で垂直線を検出する汎用関数
     * @param {ImageData} imageData
     * @param {number} y - 走査するY座標
     * @param {{r: number, g: number, b: number}} targetColor - 検出する色
     * @param {number} minWidth - 線の最小ピクセル幅
     * @param {string} direction - 'leftToRight' または 'rightToLeft'
     * @returns {number | null} - 検出された線のX座標 (線の左端) または null
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
                    // 線の検出が完了
                    return direction === 'leftToRight' ? lineStart : x + step;
                }
                consecutivePixels = 0;
                lineStart = null;
            }
        }
        // ループの最後に線が見つかった場合
        if (consecutivePixels >= minWidth) {
            return direction === 'leftToRight' ? lineStart : (startX + step) - (step * consecutivePixels);
        }
        return null;
    }

    // --- イベントリスナー ---

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

    // --- メインの画像解析ロジック ---

    function analyzeImage() {
        if (!uploadedImage) {
            resultsDiv.innerHTML = '<p>画像をアップロードしてください。</p>';
            return;
        }

        resultsDiv.innerHTML = '<p>解析中...</p>';
        const imageData = ctx.getImageData(0, 0, statusCanvas.width, statusCanvas.height);
        const width = imageData.width;
        const height = imageData.height;

        let startX = null; // バーの開始点 (0%の基準線)
        let maxX = null;   // バーの最大長終点 (100%の基準線)
        
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

        // 最も多く検出されたstartXとmaxXを選ぶ
        startX = Object.keys(startXCandidates).reduce((a, b) => startXCandidates[a] > startXCandidates[b] ? a : b, null);
        maxX = Object.keys(maxXCandidates).reduce((a, b) => maxXCandidates[a] > maxXCandidates[b] ? a : b, null);

        // 検出されたX座標を数値に変換
        if (startX !== null) startX = parseInt(startX, 10);
        if (maxX !== null) maxX = parseInt(maxX, 10);
        
        console.log("Detected startX:", startX, "Detected maxX:", maxX);

        if (startX === null || maxX === null || maxX <= startX) {
            resultsDiv.innerHTML = '<p style="color: red;">基準線（左右の白い線）が見つかりませんでした。トリミングや画像の品質を確認してください。</p>';
            return;
        }

        // 2. 各ステータスバーのY座標の特定
        const definiteBarYs = [];

        // バーの内部をサンプリングするX座標 (startXとmaxXの間の中央付近)
        // もしバーが短い場合や、画像解像度が低い場合は、この位置を調整する必要があるかもしれません。
        // 例えば、startXからバーの幅の20%くらいの場所: Math.floor(startX + (maxX - startX) * 0.2)
        const sampleXForBarY = Math.floor(startX + (maxX - startX) / 2);
        
        if (sampleXForBarY < 0 || sampleXForBarY >= width) {
             console.error("sampleXForBarY が画像範囲外です:", sampleXForBarY, "width:", width);
             resultsDiv.innerHTML = '<p style="color: red;">内部エラー: バーのY座標検出位置が範囲外です。sampleXForBarYの値を調整してください。</p>';
             return;
        }

        // バーが存在する可能性のあるY座標の範囲と走査間隔
        const barDetectYStart = Math.floor(height * 0.2);
        const barDetectYEnd = Math.floor(height * 0.9);
        const barDetectStepY = 3; // Y軸方向の走査間隔 (細かく)

        // バー検出時のY座標の近接判定閾値 (これより近いY座標は同じバーの一部と見なす)
        // スクリーンショットでバー間のピクセル間隔を測って正確な値に調整してください
        const BAR_VERTICAL_SEPARATION_THRESHOLD = 30; // 例: 30ピクセル。実測値に合わせて調整！

        for (let y = barDetectYStart; y < barDetectYEnd; y += barDetectStepY) {
            let isTooCloseToDetected = false;
            for (const existingY of definiteBarYs) {
                if (Math.abs(y - existingY) < BAR_VERTICAL_SEPARATION_THRESHOLD) {
                    isTooCloseToDetected = true;
                    break;
                }
            }
            if (isTooCloseToDetected) continue;

            const pixel = getPixelColor(imageData, sampleXForBarY, y);

            for (const barInfo of STATUS_BARS) {
                if (isColorClose(pixel, barInfo.color, COLOR_TOLERANCE)) {
                    definiteBarYs.push(y);
                    break; // このY座標でバーが見つかったら次のY座標へ
                }
            }

            if (definiteBarYs.length >= STATUS_BARS.length) {
                break;
            }
        }
        
        definiteBarYs.sort((a, b) => a - b);

        console.log("Detected Bar Ys:", definiteBarYs);

        if (definiteBarYs.length < STATUS_BARS.length) {
            resultsDiv.innerHTML = `<p style="color: red;">ステータスバーのY座標の特定に失敗しました。すべてのバーが見つからないか、バー間の間隔が広すぎる可能性があります。</p><p style="color: red;">現在の検出数: ${definiteBarYs.length}/${STATUS_BARS.length}</p>`;
            return;
        }
        // 見つかったバーのY座標が多い場合は、上からSTATUS_BARS.length個だけ採用
        definiteBarYs.splice(STATUS_BARS.length);


        // 3. 各ステータスバーの右端 (`currentX`) の検出とパーセンテージ計算
        const finalResults = [];
        for (let i = 0; i < STATUS_BARS.length; i++) {
            const barInfo = STATUS_BARS[i];
            const barY = definiteBarYs[i]; 
            let currentX = startX; // currentXをstartXで初期化 (0%の位置)
            let lastColoredPixelX = startX; // 最後にバーの色が検出されたX座標

            // startXからmaxXまでを走査し、バーの色が検出される最後のピクセルを探す
            for (let x = startX; x <= maxX; x++) {
                const pixel = getPixelColor(imageData, x, barY);
                
                // 現在のピクセルがバーの色に近い場合
                if (isColorClose(pixel, barInfo.color, COLOR_TOLERANCE)) {
                    lastColoredPixelX = x; // 最後に色が見つかったX座標を更新
                } 
            }

            // ループが終了したら、lastColoredPixelXがバーの終点になる
            // 0%の場合（バーの色が全く見つからなかった場合）は lastColoredPixelX は startX のままになる
            currentX = lastColoredPixelX;

            // currentXがmaxXを超えないように調整
            if (currentX > maxX) {
                currentX = maxX;
            }

            // パーセンテージ計算
            const length = currentX - startX;
            const maxLength = maxX - startX;
            let percentage = 0; // percentageをここで確実に0で初期化

            if (maxLength > 0) { // ゼロ除算を防ぐ
                percentage = (length / maxLength) * 100;
            } else {
                percentage = 0; // maxLengthが0以下の場合は0%とする
            }

            // 1%単位で四捨五入
            percentage = Math.round(percentage);

            finalResults.push(`<p>${barInfo.name}: ${percentage}%</p>`);
        }

        resultsDiv.innerHTML = finalResults.join('');
    }

    // --- 結果コピー機能 ---
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
