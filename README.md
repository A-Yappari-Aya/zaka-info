# 坂道info ファンツール

静的サイトにある `/senbatsu/` は選抜メーカー、`/face-ranking/` は好き顔ランキングです。選抜メーカーから好き顔ランキングへ移動できます。ランキングは選抜と同じ固定名簿92名と自由入力の候補を使い、1〜36人を追加・並べ替え・削除できます。検索、グループ絞り込み、操作の取り消し、20件までの名前付き保存、共有URL、PNG保存に対応しています。

## 保存と写真

下書き、自由入力候補、保存済みランキング、写真はこのブラウザの `localStorage` に保存します。ランキングは `zaka-face-ranking-v1` 系キーを使い、選抜メーカーの保存領域とは独立しています。共有URLを開いた編集はローカル下書きを上書きしません。共有URLを離れると元の下書きに戻ります。ブラウザのデータを削除すると保存内容も失われます。

写真は本人が選ぶJPEG・PNG・WebPだけをブラウザ内で処理し、サーバーには送信しません。入力は10MB・30メガピクセル以下、保存は240×300のJPEG、最大36人です。同じ候補の写真はこのブラウザの各ランキングで共通です。写真は共有URLには含まれず、画像保存には含まれます。写真削除は元の画像ファイルを削除しません。ストレージ容量不足時は古い写真を保持してエラーを表示します。写真読込に失敗したPNGは名前カードで代替します。

公式写真を自動取得・転載する機能はありません。候補には引き継ぎ済みの公式プロフィールリンク90件を付けています。名簿は選抜メーカーと共通の固定スナップショットで、在籍状況の自動更新はありません。自分が利用できる写真を選んでください。

## 開発・検証

生成済みExpoの元ソースはこのリポジトリにありません。`_expo/` の生成bundleを直接編集せず、独立したHTMLのファンツールを編集します。

```sh
npm ci
npm test
npx playwright install chromium
CHROMIUM_PATH="$(node -e 'process.stdout.write(require("playwright").chromium.executablePath())')" npm run test:browser
```

`CHROMIUM_PATH` は既存Chromiumを使う場合だけ実際の実行ファイルパスに設定します。未指定なら好き顔テストはPlaywrightのChromiumを使用します。既存選抜テストの標準パスは `/usr/bin/chromium` のため、PlaywrightのChromiumを使う場合は `CHROMIUM_PATH` にその実行ファイルを指定してください。ブラウザ検証はローカルHTTPサーバーをテスト内で起動します。

`tests/face-ranking-unit.test.cjs` は名簿一致、保存分離、共有復帰、順位操作、PNG snapshot、CSPのスクリプトハッシュを確認します。`tests/face-ranking.test.cjs` は実ブラウザで写真形式、破損・容量・画素数、置換・削除、非同期中の編集と共有遷移、写真snapshotのPNGピクセル、320/390/1440幅、検索、focus、ダイアログ、CSP拒否と外部通信がないことを確認します。検証用写真は単色canvasから生成し、人物画像は使いません。目視確認用PNGは無視対象の `test-results/` に出力します。日本語フォントがない検証ホストでは日本語表示を確認できないため、隔離したフォント環境を用意してください。

スクリプトを編集したら、`<script>` 内の正確なバイト列のSHA-256をbase64にしてCSPの `script-src 'sha256-…'` を更新してください。ユニットテストが一致を検証します。`default-src 'none'` と画像の `data: blob:` のみの許可を維持します。

2026-10-03、VPSの専用checkoutでユニット21件とChromiumブラウザ20件（既存選抜を含む）が通過しました。実機iPhone/Safariのnative共有・写真picker・ダウンロードは未確認です。WebKitは未実行です。VPS共有tmpの容量制限を回避するため `TMPDIR` を専用checkout内へ切り替え、日本語フォントも専用環境で有効にして再検証しました。

## 公開の保護

GitHub Pagesの公開元は `gh-pages` のルートです。機能branchへのpushやDraft PR作成ではこのbranchを更新しません。この変更に公開workflowは追加しません。merge・deployは別工程で承認後に行います。

このPRは選抜修正PR #2の `fix/senbatsu-draft-export-20261003` を基盤とする積み重ねPRです。親PRのmerge後は統合先を確認してください。公開時は実際の上流生成・配信処理に `/face-ranking/`、`/senbatsu/`、`.nojekyll` を保存する工程を組み込み、生成出力の再作成でツールが消えないことを確認してください。上流の生成ソースと配信処理はこのcheckoutから変更できません。
