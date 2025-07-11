document.addEventListener('DOMContentLoaded', () => {
    const imageUpload = document.getElementById('imageUpload');
    const statusCanvas = document.getElementById('statusCanvas');
    const ctx = statusCanvas.getContext('2d');
    const overlayMessage = document.getElementById('overlayMessage');
    const resultsDiv = document.getElementById('results');
    const copyResultsBtn = document.getElementById('copyResults');

    let uploadedImage = null; // 読み込まれた画像オブジェクトを保持

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
                ctx.clearRect(0, 0, statusCanvas.width, statusCanvas.height); // 古い画像をクリア
                ctx.drawImage(uploadedImage, 0, 0, uploadedImage.width, uploadedImage.height);

                // オーバーレイメッセージを非表示にする
                overlayMessage.style.display = 'none';

                // ここで画像解析と数値化の処理を呼び出す
                analyzeImage();

                // 結果表示エリアとコピーボタンを表示
                resultsDiv.innerHTML = '<p>解析中...</p>'; // 解析中のメッセージ
                copyResultsBtn.classList.remove('hidden');
            };
            uploadedImage.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });

    // 解析処理のダミー関数 (後でここに具体的なロジックを実装)
    function analyzeImage() {
        if (!uploadedImage) return;

        // Canvasからピクセルデータを取得
        const imageData = ctx.getImageData(0, 0, statusCanvas.width, statusCanvas.height);
        const pixels = imageData.data; // RGBAの一次元配列

        console.log("画像の幅:", statusCanvas.width, "高さ:", statusCanvas.height);
        console.log("ピクセルデータ (最初の100バイト):", pixels.slice(0, 100)); // デバッグ用

        // TODO: ここに補助線やバーの色を検出するロジックを実装します

        // 現時点ではダミーの結果を表示
        setTimeout(() => { // 処理に時間がかかるかのように見せるためのsetTimeout
            const dummyResults = `
                <p>HP: 75%</p>
                <p>攻撃: 60%</p>
                <p>魔攻: 80%</p>
                <p>防御: 70%</p>
                <p>魔防: 65%</p>
                <p>敏捷: 90%</p>
            `;
            resultsDiv.innerHTML = dummyResults;
        }, 1000);
    }

    // 結果コピー機能 (後で実装)
    copyResultsBtn.addEventListener('click', () => {
        const textToCopy = resultsDiv.innerText;
        navigator.clipboard.writeText(textToCopy).then(() => {
            alert('結果をコピーしました！');
        }).catch(err => {
            console.error('コピーに失敗しました:', err);
            alert('コピーに失敗しました。手動でコピーしてください。');
        });
    });
});