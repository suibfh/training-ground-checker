document.addEventListener('DOMContentLoaded', () => {
    const imageUpload = document.getElementById('imageUpload');
    const statusCanvas = document.getElementById('statusCanvas');
    const ctx = statusCanvas.getContext('2d');
    const overlayMessage = document.getElementById('overlayMessage');
    const resultsDiv = document.getElementById('results');
    const copyResultsBtn = document.getElementById('copyResults');

    let uploadedImage = null; // 読み込まれた画像オブジェクトを保持

    // ステータスバーの定義と推定される色（RGB）
    // 実際のゲーム画面で取得したRGB値に調整すると、さらに精度が上がります
    const STATUS_BARS = [
        { name: 'HP', color: { r: 255, g: 255, b: 153 } },    // 淡い黄色
        { name: '攻撃', color: { r: 255, g: 153, b: 153 } },   // 淡い赤
        { name: '魔攻', color: { r: 153, g: 153, b: 255 } },   // 淡い青
        { name: '防御', color: { r: 200, g: 170, b: 140 } },   // 淡い茶色
        { name: '魔防', color: { r: 153, g: 255, b: 255 } },   // 淡い水色
        { name: '敏捷', color: { r: 153, g: 255, b: 200 } }    // 淡い青緑
    ];

    // 色の許容範囲 (小さいほど厳密、大きいほど寛容)
    // 画像の圧縮具合や画面表示でピクセル値は変動するため、調整が必要です
    const COLOR_TOLERANCE = 40; // RGB値の二乗誤差のしきい値。例えば30〜60あたりで調整

    // 白い線の色
    const WHITE_COLOR = { r: 255, g: 255, b: 255 };

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
            return { r: -1, g: -1, b: -1 }; // 範囲外
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
     * @param {number} tolerance - 許容するRGB値の差の二乗
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
                    return direction === 'leftToRight' ? lineStart : x + step; // 右から左の場合、開始点は1つ戻る
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
                // Canvasのサイズを画像に合わせて調整
                statusCanvas.width = uploadedImage.width;
                statusCanvas.height = uploadedImage.height;

                // Canvasに画像を描画
                ctx.clearRect(0, 0, statusCanvas.width, statusCanvas.height);
                ctx.drawImage(uploadedImage, 0, 0, uploadedImage.width, uploadedImage.height);

                overlayMessage.style.display = 'none'; // メッセージを非表示に

                // 解析処理の実行
                analyzeImage();

                copyResultsBtn.classList.remove('hidden'); // コピーボタンを表示
            };
            uploadedImage.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });

    // --- メインの画像解析ロジック ---

// script.js の analyzeImage 関数内を以下のように修正・置き換え

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
        // 画像のY座標をサンプリングして、バーが存在しそうな行を探し、基準線を検出
        // 例えば、画像の高さの20%から80%の範囲で、10ピクセルごとにサンプリング
        const sampleYRangeStart = Math.floor(height * 0.2);
        const sampleYRangeEnd = Math.floor(height * 0.8);
        const sampleStepYForLines = 10; // 基準線検出のためのY軸サンプリング間隔

        let startXCandidates = {}; // startXの候補とその出現回数
        let maxXCandidates = {};   // maxXの候補とその出現回数

        for (let y = sampleYRangeStart; y < sampleYRangeEnd; y += sampleStepYForLines) {
            // 細い白い垂直線 (0の基準線) を左から右へ検出
            // 線の太さは1ピクセルと仮定
            const foundStartX = findVerticalLine(imageData, y, WHITE_COLOR, 1, 'leftToRight');
            if (foundStartX !== null) {
                startXCandidates[foundStartX] = (startXCandidates[foundStartX] || 0) + 1;
            }

            // 太い白い垂直線 (100%の基準線) を右から左へ検出
            // 線の太さは3ピクセル以上と仮定
            const foundMaxX = findVerticalLine(imageData, y, WHITE_COLOR, 3, 'rightToLeft');
            if (foundMaxX !== null) {
                // 右から左に走査しているので、検出されたXは線の左端。
                // 100%基準線は「外枠の右側」なので、検出されたXがそのままmaxXとなる。
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
        const checkedYs = new Set(); // 重複チェック用

        // startXとmaxXの間のX座標で、各バーの色を縦方向に探す
        // バーが始まる可能性のあるY座標の範囲
        const barDetectYStart = Math.floor(height * 0.2); // 画像上部からの割合で調整
        const barDetectYEnd = Math.floor(height * 0.9);   // 画像下部からの割合で調整
        const barDetectStepY = 5; // Y軸方向の走査間隔 (細かく)

        // バーの内部をサンプリングするX座標 (startXとmaxXの間の中央付近)
        const sampleXForBarY = Math.floor(startX + (maxX - startX) / 2);
        
        // デバッグ用: 走査X座標が有効範囲内か確認
        if (sampleXForBarY < 0 || sampleXForBarY >= width) {
             console.error("sampleXForBarY が画像範囲外です:", sampleXForBarY);
             resultsDiv.innerHTML = '<p style="color: red;">内部エラー: バーの中心を特定できません。</p>';
             return;
        }

        for (let y = barDetectYStart; y < barDetectYEnd; y += barDetectStepY) {
            // すでに検出済みのY座標に近い場合はスキップ
            let isTooCloseToDetected = false;
            for (const existingY of definiteBarYs) {
                if (Math.abs(y - existingY) < 20) { // バー間の最小間隔を20ピクセルと仮定（調整必要）
                    isTooCloseToDetected = true;
                    break;
                }
            }
            if (isTooCloseToDetected) continue;

            // バーの中央付近のX座標で、各バーの色を探す
            const pixel = getPixelColor(imageData, sampleXForBarY, y);

            for (const barInfo of STATUS_BARS) {
                if (isColorClose(pixel, barInfo.color, COLOR_TOLERANCE)) {
                    // バーの色が見つかったら、そのY座標を確定Y座標として追加
                    definiteBarYs.push(y);
                    break; // このY座標でバーが見つかったら次のY座標へ
                }
            }

            // 必要な数のバーが見つかったらループを終了
            if (definiteBarYs.length >= STATUS_BARS.length) {
                break;
            }
        }
        
        // 検出されたY座標をソート（念のため）
        definiteBarYs.sort((a, b) => a - b);

        console.log("Detected Bar Ys:", definiteBarYs);

        if (definiteBarYs.length < STATUS_BARS.length) {
            resultsDiv.innerHTML = '<p style="color: red;">ステータスバーのY座標の特定に失敗しました。すべてのバーが見つからないか、バー間の間隔が広すぎる可能性があります。</p>';
            return;
        }
        // 見つかったバーのY座標が多い場合は、上からSTATUS_BARS.length個だけ採用
        definiteBarYs.splice(STATUS_BARS.length);


        // 3. 各ステータスバーの右端 (`currentX`) の検出とパーセンテージ計算
        const finalResults = [];
        for (let i = 0; i < STATUS_BARS.length; i++) {
            const barInfo = STATUS_BARS[i];
            const barY = definiteBarYs[i]; 
            let currentX = startX; // 初期値はバーの開始点

            // バーの開始点から右へ走査し、バーの色が途切れる点を探す
            for (let x = startX; x <= maxX; x++) {
                const pixel = getPixelColor(imageData, x, barY);
                if (isColorClose(pixel, barInfo.color, COLOR_TOLERANCE)) {
                    currentX = x; // バーの色が続く限りcurrentXを更新
                } else {
                    // バーの色が途切れたら終了
                    // ここで、背景色との差が明確に出るようにCOLOR_TOLERANCEを調整する必要がある
                    // または、バーの色ではないことを確認する別のロジック
                    break; 
                }
            }

            // パーセンテージ計算
            const length = currentX - startX;
            const maxLength = maxX - startX;
            let percentage = (length / maxLength) * 100;

            // 1%単位の精度で四捨五入
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
