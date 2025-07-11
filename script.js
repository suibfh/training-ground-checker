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

    function analyzeImage() {
        if (!uploadedImage) {
            resultsDiv.innerHTML = '<p>画像をアップロードしてください。</p>';
            return;
        }

        resultsDiv.innerHTML = '<p>解析中...</p>'; // 解析中のメッセージ
        const imageData = ctx.getImageData(0, 0, statusCanvas.width, statusCanvas.height);
        const width = imageData.width;
        const height = imageData.height;

        let startX = null; // バーの開始点 (0%の基準線)
        let maxX = null;   // バーの最大長終点 (100%の基準線)
        const detectedBars = [];

        // 1. バーのY座標（垂直方向の位置）の特定と基準線の検出
        // 画像のY座標をサンプリングして、バーが存在しそうな行を探し、基準線を検出
        // 例えば、画像の高さの20%から80%の範囲で、20ピクセルごとにサンプリング
        const sampleStepY = 20;
        let potentialBarYs = []; // 各バーのY座標の候補

        for (let y = Math.floor(height * 0.2); y < height * 0.8; y += sampleStepY) {
            // 細い白い垂直線 (0の基準線) を左から右へ検出
            const foundStartX = findVerticalLine(imageData, y, WHITE_COLOR, 1, 'leftToRight');
            if (foundStartX !== null) {
                if (startX === null) {
                    startX = foundStartX;
                } else {
                    // 複数の行で検出されたstartXがほぼ同じであれば採用
                    if (Math.abs(startX - foundStartX) > 5) { // 5ピクセル以上のずれは無視
                        continue;
                    }
                }
            }

            // 太い白い垂直線 (100%の基準線) を右から左へ検出
            const foundMaxX = findVerticalLine(imageData, y, WHITE_COLOR, 3, 'rightToLeft'); // 太い線なのでminWidthを3程度に
            if (foundMaxX !== null) {
                if (maxX === null) {
                    maxX = foundMaxX;
                } else {
                    // 複数の行で検出されたmaxXがほぼ同じであれば採用
                    if (Math.abs(maxX - foundMaxX) > 5) { // 5ピクセル以上のずれは無視
                        continue;
                    }
                }
            }

            // ここで、各バーの特定の色を探し、バーが存在するY座標の候補を収集
            // startXとmaxXの間でSTATUS_BARSに定義された色のピクセルを検出
            for (let i = 0; i < STATUS_BARS.length; i++) {
                const barColor = STATUS_BARS[i].color;
                // startXからmaxXの範囲で、そのバーの色が存在するかを確認
                let foundBarColor = false;
                for (let x = (startX || 0) + 5; x < (maxX || width) - 5; x += 3) { // ざっくりとした範囲でサンプリング
                    const pixel = getPixelColor(imageData, x, y);
                    if (isColorClose(pixel, barColor, COLOR_TOLERANCE)) {
                        foundBarColor = true;
                        break;
                    }
                }
                if (foundBarColor && !potentialBarYs.includes(y)) {
                    potentialBarYs.push(y);
                }
            }
        }

        // 検出された基準線がなければエラー
        if (startX === null || maxX === null || maxX <= startX) {
            resultsDiv.innerHTML = '<p style="color: red;">基準線が見つかりませんでした。トリミングや画像の品質を確認してください。</p>';
            return;
        }

        // 基準線が見つかったら、バーのY座標を特定してソート
        // Y座標が近いものをグループ化したり、等間隔であることを利用して特定
        potentialBarYs.sort((a, b) => a - b);
        // 仮に、一番上のバーから6つのY座標を特定する（より堅牢なロジックは別途必要）
        const definiteBarYs = [];
        if (potentialBarYs.length >= STATUS_BARS.length) {
             // 最初のバーのY座標を特定し、そこから等間隔で残りのバーのY座標を推測する
             // ただし、この部分のロジックは非常にデリケートで、画像のUIによって大きく変わります。
             // ここでは簡易的に、検出されたY座標の中から、各バーに最も近いY座標を割り当てます。
             // 実際には、バー間のピクセル間隔を特定するなどの工夫が必要。
             // 一旦、検出された候補からSTATUS_BARS.length個を単純に選ぶ
             for(let i=0; i < STATUS_BARS.length && i < potentialBarYs.length; i++) {
                 definiteBarYs.push(potentialBarYs[i]);
             }
             // もし候補が少なければ、画像の上部から推定するなどのフォールバックが必要
             if (definiteBarYs.length < STATUS_BARS.length) {
                  // Fallback: Y座標をハードコードに近い形で設定 (画像中央を基準に)
                  const baseH = height * 0.3; // 仮の開始Y座標
                  const barHeightInterval = 50; // バー間の仮のピクセル間隔
                  for(let i=0; i < STATUS_BARS.length; i++) {
                      definiteBarYs.push(Math.floor(baseH + (i * barHeightInterval)));
                  }
                  console.warn("バーのY座標の検出が不十分でした。仮の値を使用します。");
             }

        } else {
            resultsDiv.innerHTML = '<p style="color: red;">ステータスバーのY座標の特定に失敗しました。画像を確認してください。</p>';
            return;
        }


        // 2. 各ステータスバーの右端 (`currentX`) の検出とパーセンテージ計算
        const finalResults = [];
        for (let i = 0; i < STATUS_BARS.length; i++) {
            const barInfo = STATUS_BARS[i];
            // 各バーのY座標はdefiniteBarYsから取得
            const barY = definiteBarYs[i]; 
            let currentX = startX; // 初期値はバーの開始点

            // バーの開始点から右へ走査し、バーの色が途切れる点を探す
            for (let x = startX; x <= maxX; x++) {
                const pixel = getPixelColor(imageData, x, barY);
                if (isColorClose(pixel, barInfo.color, COLOR_TOLERANCE)) {
                    currentX = x; // バーの色が続く限りcurrentXを更新
                } else {
                    // バーの色が途切れたら終了
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
