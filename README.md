# 牧野田园 Open Farm

一款跑在浏览器里的 3D 开放式休闲生存建造游戏：开荒种地、砍树挖矿、钓鱼畜牧、建屋造院，
白天干活晚上防野兽，顺便逛黑市、接委托、养坐骑、刷副本。
**同一个套源码，桌面浏览器和安卓 APK 共用**——改一次两处生效。

## 直接玩

- **网页版（在线直接玩）**：https://king952701.github.io/open-farm/
- **网页版（本地）**：用浏览器打开 `farm3d/index.html`（双击即可，无需服务器，无需联网）
- **安卓**：到 [Releases](../../releases/latest) 下载 `app-release.apk` 安装
  （未上架商店，用 debug 签名，安装时提示「未知来源」允许即可；纯离线单机，不申请任何权限）

## 操作

| | 桌面 | 手机 |
|---|---|---|
| 移动 | `WASD` / 方向键 | 左下虚拟摇杆（推多少走多快） |
| 转视角 | 鼠标拖拽 | 空白处滑动 |
| 拉近拉远 | 滚轮 | 双指捏合 |
| 采集 / 交互 | `F` | 右下「交互」大键（钓鱼时自动变提竿） |
| 副交互 | `G` | 右下「辅助」 |
| 奔跑 | `Shift` | 右下「奔跑」（开关式） |
| 工具 | 数字键 `1`~`9` | 底部快捷栏直接点 |
| 技能 | `Q` `W` `E` | 右侧技能条直接点 |
| 面板 | `I` 背包 / `B` 建造 / `L` 技能 / `Tab` 地图 … | 右上「菜单」展开，点对应按钮 |

快捷键可以在游戏内 设置 → 快捷键 里改；移动端键位跟着改。

## 目录

```
farm3d/                 游戏源码（唯一真源，网页与 APK 共用）
  index.html            桌面入口（不加载触控层）
  js/                   全部游戏逻辑；js/mobile.js 是移动端触控层
  vendor/three.min.js   Three.js（MIT）
farm3d-android/         安卓 WebView 壳工程
  scripts/prepare.js    把 farm3d/ 同步成 APK 资源，并派生移动端入口 m.html
  app/                  Gradle 工程（assets 由 prepare.js 生成，不入库）
```

打包安卓 APK：

```bash
node farm3d-android/scripts/prepare.js     # 同步资源 + 生成移动入口
gradle -p farm3d-android assembleRelease    # 出包
```

推送到 GitHub 后，`.github/workflows/build-farm3d-apk.yml` 会自动编译并发布到 Releases。

## 技术

原生 JavaScript + Three.js，无构建步骤、无框架、无后端。地形/植被/建筑全部程序化生成，
音效用 Web Audio 实时合成——**仓库里没有任何第三方图片、字体、音频素材**，图标也是纯矢量自绘。

## 许可

MIT，见 [LICENSE](LICENSE)。Three.js 为 MIT（© Three.js authors）。
