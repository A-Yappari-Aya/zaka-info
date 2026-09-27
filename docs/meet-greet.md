# ミーグリ完売表・予想・前作比較

## 状態

実装：独立した `/meet-greet/` ページ、公式/予想の分離、次数別履歴、前作同一次数比較、予想の事後検証、CSV、公式スナップショット取込み、X検索クライアント、厳密な文章抽出と集計。DB・追加npm依存なし。Node.js 22以上。

未接続：実際の作品/メンバー/開催枠の登録、forTUNE申込画面から各枠を読み取る取得アダプター、Xの実アカウント/API権限での疎通、元の生成処理への統合、本番デプロイと定期ジョブ。このPRを「公式サイトから自動取得して稼働済み」と説明しないでください。画像だけの当落報告・複数枠の画像表の自動解析も未実装です。

調査時点のリポジトリには `gh-pages` の公開済みExpoビルドと静的JSONのみで、Expo/React Nativeの元ソースはありませんでした。ネイティブアプリのタブへの組込みではありません。定期再生成されるトップ `index.html` とハッシュ付きJSは直接編集しません。

`v1/meet-greet.json` は空です。未取得を完売0件に見せません。`/meet-greet/?demo=1` だけが架空の名前・枚数のデモです。本番へコピーしないでください。

## 確認と組込み

```sh
node --test tests/meet-greet.test.mjs
node scripts/meet-greet.mjs validate v1/meet-greet.json
python3 -m http.server 8080
# /meet-greet/?demo=1

# 任意のオフライン表示テスト：Python PlaywrightとChromiumが必要
python tests/ui-smoke.py

# 毎回のExpo export後に実行。JSの現在のハッシュ参照を保持し、冪等に導線を挿入
node scripts/install-meet-greet-nav.mjs EXPORT_DIR/index.html
```

ローカルで33件のNodeテストと、幅1440/390pxのオフライン表示テストを実行。表示テストではimports/query/history/fetchをスタブ化しており、配信先への遷移・実API・ネイティブ実機のE2Eテストではありません。

元の生成/配信処理へ、独立ページとJSONの保持、上記導線挿入、更新JSONの公開を追加してください。ビルドのたびに新規ファイルを消す同期設定だと機能が消えます。元ソースが得られたら `core.mjs` と同じJSONを利用してネイティブ画面へ移植できます。

## データ契約

トップレベル：`schemaVersion:1`, `generatedAt`（タイムゾーン付きISO日時またはnull）, `releases`。作品：`id`, `label`, `group`, `eventType:online|real`, `members`, `slots`, `rounds`, `officialSnapshots`, `predictions`。`previousReleaseId` は同じグループ・同形式の前作を指定し、作品間でメンバーIDを共通にします。

枠：`id`, `memberId`, `date:YYYY-MM-DD`, `session`, `venue`（任意）, `firstRound`, `initialStatus:offered|exempt|cancelled`。追加枠は `firstRound` 以前の分母に入りません。後日の不参加・中止は初期値の書換えではなくスナップショットで記録します。

次数：`number`, `opensAt`, `closesAt`, `resultsAt`。第N+1次受付で確認した状態を第N次までの結果とし、個人の当落と公式の販売状況は区別します。取得を飛ばした場合に実際の完売発生次数を断定せず、初確認次数を表示。古い完売は最終確認付きで引継ぎ、明示的な再販売で更新。前の次数の販売ありは次の次数へ流用しません。

## 公式結果の取込み

全体の受付終了、リンク消失、欠落、ログイン要求、アクセス失敗を完売と解釈しません。各枠の明示的な `sold_out|available|closed|exempt|cancelled|unknown` のみを扱います。取得アダプター未接続のため、現在は対象を確認した正規化JSONを次のコマンドで取込みます。

```sh
node scripts/meet-greet.mjs import-official \
  v1/meet-greet.json RELEASE_ID \
  /private/official-snapshot.json /private/official-source.html
```

スナップショット：`id`, `applicationRound`（2以上）, `observedAt`（該当受付中）, `receptionOpen:true`, `complete`, `reviewed:true`, `sourceUrl`（対象の公式HTTPS URL）, `cells:[{slotId,status,evidence}]`。全枠がある場合だけ `complete:true`。原本ファイルのSHA-256を付与し、出典ドメイン、受付時間、枠、根拠、完全性を検証します。ハッシュは同一性の証跡で、公式由来の真実性を保証するものではありません。

同一ID/内容の再取込みは無変更。同一IDの書換えは拒否。訂正は新IDで追加し履歴を残します。個人情報を含み得る原本HTML/画像は公開しません。次回受付がない最終次数は、推測で確定させない扱いです。

## X検索と予想

確認した公式仕様（2026-09-24）：
- https://docs.x.com/x-api/posts/search-recent-posts
- https://docs.x.com/x-api/posts/search/introduction
- https://fortunemusic.jp/

Recent Searchは直近7日。7日超の取得欠落は黙って切り詰めず停止します。過去作品は別途許可された方法で補完。Xの権限・料金は運用アカウントで確認してください。本変更では課金APIを実呼出ししていません。

作品に一意な `xTerms` を設定し、サーバー環境の `X_BEARER_TOKEN` と32文字以上の `MEET_GREET_AUTHOR_SALT` を用います。秘密値はブラウザー/公開JSON/Gitに入れません。現行ドキュメントの `post.fields` / `referenced_posts` を利用。旧契約環境のみ `X_API_SCHEMA=legacy` を明示します。API変更のための無制限自動リトライはありません。

```sh
node scripts/meet-greet.mjs collect-x \
  v1/meet-greet.json RELEASE_ID 3 /var/lib/zaka-info-private 2

# 全作品のうち当落発表後〜次回受付前だけ検索
node scripts/meet-greet.mjs sync-x \
  v1/meet-greet.json /var/lib/zaka-info-private 2

# 手動確認または別コレクターの正規化レポートから予想
node scripts/meet-greet.mjs predict \
  v1/meet-greet.json RELEASE_ID 3 /private/reviewed-reports.json
```

既定で1作品/1次数/1実行あたり最大2ページ（各100件）、15分クールダウン。未完了のページトークンと同じ検索期間を保存して再開し、全ページ取得後だけ新しい予想を公開。エラー時は公開済み状態を維持します。ページ上限は料金予算ではないため、運用側の課金上限も設定してください。

自動抽出は作品・形式・次数・1メンバー・1日付・1部と `応募合計10枚 当選1枚` のようなラベル付き合計がそろう文章に限定。引用、返信、リポスト、画像のみ、複数枠、`3/15` の意味が不明、推測表現などは私有のレビュー待ちキューへ送ります。正規化済み手動レポートの形式はテストの `report()` を参照。`accepted:true` は真実性の証明ではなく、集計形式/対象の確認を表します。

同一アカウント・同一枠・同一次数の最新合計を1件として集計。同じ人物の複数アカウントは排除できません。異なる3アカウント以上の落選あり報告かつ報告者の75%以上なら「予想・強」、2アカウント以上なら「予想」、ほかは情報不足。これは暫定ルールであり、校正された完売確率や実際の当選確率ではありません。

予想は生成日時・ルール版・件数付きで保存。次回受付開始後に過去予想を生成せず、既に確定した枠を新たな予想の成功に数えません。公式確認後も予想履歴を残し、判定できる予想枠だけで検証。前作比較は公式の同一次数の完売数・率のみで、分母変更は明示、情報不足の差分は0ではなく `—`。

## 運用上の残作業

私有ディレクトリは公開リポジトリ外を強制。新規ディレクトリ700/ファイル600、投稿本文や名前は保存せず、URL/ID/ハッシュ化アカウント等を私有側に置きます。動作中は30日TTLで除外。停止後の期限切れ削除、削除済み投稿の対応、X契約に沿った保持は運用側で確認してください。公開データは集計と公式証跡のみです。

公開書込みは共通ロック、入力変更検知、一時ファイル+rename。競合なら上書きせず失敗。異常終了で残るロックはプロセス停止を確認後に運用者が削除します。

既存VMのcron/systemd timerから `sync-x` を呼べますが、本PRでは有効化していません。最終次数の検索終了は `collectionEndsAt`、省略時は最終開催日の日本時間23:59:59。新しいGitHub Actionsの定期実行はありません。

本番前に実作品データ、公式画面の取得アダプターと正常/受付前後/部分完売/全完売/不参加/中止/再販売/取得失敗の原本テスト、X小規模疎通、Expo再生成でのファイル保持、定期実行と配信を接続してください。
