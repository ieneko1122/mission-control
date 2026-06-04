@echo off
chcp 65001 >nul
rem ===== Mission Control 起動スクリプト =====
rem バックエンド(8080)とフロント(5173)を別ウィンドウで起動し、
rem バックエンドの起動完了を待ってから規定のブラウザ(Chrome)で開きます。

cd /d "%~dp0"

rem User環境変数のJAVA_HOMEが不正なJRE(例: C:\sqldeveloper\jdk\jre)を指していると
rem mvnw.cmd が失敗してバックエンド(とH2 DB)が起動しない。ここでクリアし、
rem PATH上の正しいJDK(java)を使わせる。
set "JAVA_HOME="

echo [Mission Control] Backend (Spring Boot / 8080) を起動します...
start "Mission Control - Backend" cmd /k "mvnw.cmd spring-boot:run -DskipFrontend=true"

echo [Mission Control] Frontend (Vite / 5173) を起動します...
start "Mission Control - Frontend" /D "%~dp0frontend" cmd /k "npm run dev"

echo [Mission Control] バックエンドの起動完了を待っています (最大90秒)...
powershell -NoProfile -Command "for($i=0;$i -lt 90;$i++){try{Invoke-WebRequest -Uri 'http://localhost:8080/api/status' -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0}catch{Start-Sleep -Seconds 1}}"

echo [Mission Control] 規定のブラウザでアプリを開きます: http://localhost:5173
start "" "http://localhost:5173"

echo.
echo 起動処理を実行しました。バックエンド/フロントの各ウィンドウのログを確認してください。
timeout /t 3 >nul
