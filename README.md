# pg-pixelhop

瀏覽器**像素躍階**：橫向 2D 關卡跳躍、收金幣、踩黏液、避尖刺；5 個關卡。純前端單機小局，**mobile-first**，桌面加寬。

也可當作 [Playgrounds（遊樂場）](https://play.samkuo.me/) 的 **SAM**（`index.html` 入口）。

## 一鍵開 SAM 小

```
https://play.samkuo.me/?open=sampot/pg-pixelhop&name=像素躍階&fresh=1
```

同源會重用本機已匯入的沙盒；要強制新建可加 `&fresh=1`。

## 試玩（本機）

```bash
npx --yes serve .
# 或
python3 -m http.server 8080
```

操作畫面或按鍵後音效才會出聲。

## 操作

| 操作 | 說明 |
| --- | --- |
| ←→ / A D | 移動 |
| ↑ / W / Space | 跳 |
| Shift | 衝刺（地面） |
| R 鍵槽位 | （未綁定；用「重來本關」按鈕） |
| 左下拇指區 | 按住後左右拖曳移動（中央有 deadzone） |
| 右下「跳」鍵 | 跳躍；可與左側移動同時按住 |

## 規則

- 5 個關卡（草坡起步／沙地尖刺／石頭黏液／洞穴青蛙／空中金幣）。
- 踩到尖刺 / 熔岩 / 敵人會扣 1 命；命歸零即結束，可按「重來本關」再接。
- 走到出口旗下方即過關；命數可在「重來本關」時從同關卡開始。
- 踩扁敵人會反彈；跳到彈簧跳更高。
- 收齊所有金幣是彩蛋，不影響過關。

## 檔案

| 檔案 | 說明 |
| --- | --- |
| `index.html` | 結構 |
| `styles.css` | 手機優先 / 桌面遞增、舞台視覺 |
| `app.js` | Canvas 渲染、輸入、迴圈、選關、流程 |
| `input-controls.js` | 觸控拖曳方向與多指狀態的純邏輯 |
| `game.js` | 物理（重力／跳躍／碰撞）、敵人 AI、相機、純函式 / 方便單元測試 |
| `audio.js` | OGG 載入 + BGM loop + 動作音 |
| `levels.js` | 5 個示範關卡（ASCII 圖磚） |
| `game.test.js` | Vitest 物理 & 邏輯測試 |
| `input-controls.test.js` | 拖曳 deadzone、方向、多指與重設測試 |
| `assets/tiles/` `assets/characters/` `assets/enemies/` `assets/bg/` `assets/sfx/` | 已署名 PNG / OGG |
| `functions.js` | Playgrounds 可選 stub |

## License

MIT
