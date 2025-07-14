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
    resetDisplay(); // 表示をリセット

    const file = event.target.files[0];

    if (!file) {
        return; // ファイルが選択されていない場合は何もしない
    }

    // サポートされている画像形式のチェック
    const validImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validImageTypes.includes(file.type)) {
        showErrorMessage('対応していないファイル形式です。JPEG, PNG, WebPファイルをアップロードしてください。');
        return;
    }

    loadingMessage.style.display = 'block'; // ローディングメッセージを表示

    try {
        const imageUrl = URL.createObjectURL(file);
        
        // Imageオブジェクトを作成して画像を読み込む
        const img = new Image();
        img.onload = () => {
            // プレビューの表示
            imagePreview.src = imageUrl;
            imagePreview.style.display = 'block';

            // Canvasのセットアップと描画
            // プレビューサイズに合わせてCanvasも調整する
            const maxWidth = imagePreviewContainer.offsetWidth;
            const maxHeight = 400; // style.cssで設定した最大高さ

            let width = img.width;
            let height = img.height;

            // 幅と高さの比率を維持しつつ、コンテナに収まるように調整
            if (width > maxWidth) {
                height = height * (maxWidth / width);
                width = maxWidth;
            }
            if (height > maxHeight) {
                width = width * (maxHeight / height);
                height = maxHeight;
            }

            analysisCanvas.width = width;
            analysisCanvas.height = height;
            
            // Canvasに画像を描画 (縮小して描画される)
            ctx.drawImage(img, 0, 0, width, height);
            analysisCanvas.style.display = 'block'; // Canvasを表示

            loadingMessage.style.display = 'none'; // ローディングメッセージを非表示に
            
            // TODO: ここで画像解析ロジックを呼び出す
            console.log('画像が読み込まれ、Canvasに描画されました。');
            console.log(`Original Image Size: ${img.width}x${img.height}`);
            console.log(`Canvas Size: ${analysisCanvas.width}x${analysisCanvas.height}`);

            // URL.revokeObjectURLでメモリを解放（不要になったら）
            URL.revokeObjectURL(imageUrl);
        };
        img.onerror = () => {
            showErrorMessage('画像の読み込みに失敗しました。ファイルが破損しているか、アクセスできない可能性があります。');
            loadingMessage.style.display = 'none';
            URL.revokeObjectURL(imageUrl); // エラー時も解放
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