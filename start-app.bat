@echo off
chcp 65001 >nul
rem ===== Mission Control 開発起動スクリプト =====
rem このファイルをダブルクリックすると、バックエンド(8080)とフロント(5173)を
rem それぞれ別ウィンドウで起動し、起動完了を待ってから規定のブラウザ(Chrome等)で開きます。

rem スクリプトのある場所(プロジェクトルート)へ移動
cd /d "%~dp0"

echo [Mission Control] バックエンド(Spring Boot / 8080)を起動します...
start "Mission Control - Backend" cmd /k "mvnw.cmd spring-boot:run -DskipFrontend=true"

echo [Mission Control] フロントエンド(Vite / 5173)を起動します...
start "Mission Control - Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo [Mission Control] バックエンドの起動完了を待機しています(最大90秒)...
set /a tries=0
:waitloop
set /a tries+=1
rem /api/status に応答があれば(=バックエンド起動完了) curl が exit 0 を返す
curl -s -o NUL http://localhost:8080/api/status
if not errorlevel 1 goto ready
if %tries% geq 90 goto timeoutopen
timeout /t 1 >nul
goto waitloop

:timeoutopen
echo [Mission Control] 起動確認がタイムアウトしました。ブラウザは開きますが、各ウィンドウのログを確認してください。

:ready
echo [Mission Control] 規定のブラウザでアプリを開きます: http://localhost:5173
start "" "http://localhost:5173"

echo.
echo 起動処理を実行しました。各ウィンドウのログを確認してください。
echo （このウィンドウは閉じてかまいません）
timeout /t 3 >nul
