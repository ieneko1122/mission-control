@echo off
chcp 65001 >nul
rem ===== Mission Control 開発起動スクリプト =====
rem このファイルをダブルクリックすると、バックエンド(8080)とフロント(5173)を
rem それぞれ別ウィンドウで起動し、ブラウザを開きます。

rem スクリプトのある場所(プロジェクトルート)へ移動
cd /d "%~dp0"

echo [Mission Control] バックエンド(Spring Boot / 8080)を起動します...
start "Mission Control - Backend" cmd /k "mvnw.cmd spring-boot:run -DskipFrontend=true"

echo [Mission Control] フロントエンド(Vite / 5173)を起動します...
start "Mission Control - Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo [Mission Control] 起動を待機しています...
timeout /t 8 >nul

echo [Mission Control] ブラウザを開きます: http://localhost:5173
start "" http://localhost:5173

echo.
echo 起動処理を実行しました。各ウィンドウのログを確認してください。
echo （このウィンドウは閉じてかまいません）
timeout /t 4 >nul
