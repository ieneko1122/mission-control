# MISSION_MGMNT_SYS

小学校・中学校の日直業務（朝礼・報告・フィードバック）の担当割当を管理するレトロサイバー風 Web アプリです。

## 機能

- **オペレーター出席管理** — 当日の出席者を選択して割当対象を絞り込む
- **自動割当** — 朝礼・報告・フィードバックの担当を公平にランダム割当
- **シフトゲージ** — 時間割と連動したフェーズ進捗バー（+5分延長 / スキップ / フリーモード対応）
- **タクティカルタイマー** — UP-TIMER（ストップウォッチ）と DOWN-TIMER（カウントダウン）
- **フィールドOPS カウンター** — 巡視・質問対応の回数をランク付きで記録
- **割込みキュー表示** — 次回優先の報告・フィードバック担当者を表示
- **管理者パネル** — ロールバック・手動オーバーライドによる緊急操作
- **セグフィッシュ水族館** — フェーズクリアや対応ごとに背景に錦鯉風の生き物が増える演出

## 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | React 19 / Vite / Canvas API |
| バックエンド | Spring Boot 4 / Spring Data JPA |
| DB | H2 (インメモリ) |
| ビルド | Maven |

## セットアップ

### バックエンド

```bash
./mvnw spring-boot:run
```

デフォルトで `http://localhost:18080` で起動します。

### フロントエンド

```bash
cd frontend
npm install
npm run dev
```

デフォルトで `http://localhost:5173` で起動します。Vite の開発サーバーは `/api` を `localhost:18080` にプロキシします。

## segfish モジュール

`frontend/src/segfish.jsx` は他のアプリでも流用可能な独立モジュールです。

```jsx
import { AquariumPanel } from './segfish.jsx';

<AquariumPanel
  spawnTrigger={n}   // 変化するたびに1体追加
  clearTrigger={m}   // 変化するたびに全消去
  maxCount={50}      // 最大個体数（省略可）
/>
```
