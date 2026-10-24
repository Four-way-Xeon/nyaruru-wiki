# Wiki 数据约定

当前版本为第五版 `0.5.0`。这是独立静态原型，不调用游戏操作接口。页面文件放在 `dist/`，可直接打开 `dist/index.html`，也可用本地静态服务预览。

## 公共资料

`dist/data.js` 设置 `window.NYARURU_DATA = { schemaVersion: 1, meta, items, locations, shops, regions, pages, cells }`。

- `meta`：`title`、`game`、`generatedAt`、`coverage`（中文范围说明）、`officialTotal`、`mappedOfficial`、`sourceNote`。
- `items[]`：`key`（`type:id`）、`type`、`id`、`name`、`desc`（纯文本）、`price`（可空）、`shopCandidate`（仅候选）。不含持有数量、装备状态。
- `locations[]`：`key`、`itemKey`、`type`、`id`、`kind`、`amount`（可空）、`mapId`、`mapName`、`area`、`regionId`、`eventId`、`x`、`y`、`official`、`collectionKey`（`mapId:eventId`）、`sourceNote`、`requirementNote`、`cellKey`、`page`。同一事件可有多条奖励；清单按 `collectionKey` 去重。不含玩家收集状态。
- `shops[]`：`mapId`、`mapName`、`area`、`regionId`、`eventId`、`x`、`y`、`requirementNote`。商店入口不等于已核实售卖清单。
- `regions[]`：`id`、`name`、`color`。
- `pages[]`：`id`、`label`、`regionIds`、`minX`、`maxX`、`minY`、`maxY`。
- `cells[]`：`key`（`page:x:y`）、`page`、`regionId`、`mapId`、`mapName`、`x`、`y`、`hidden`、`walls`、`exits`。不含探索状态与玩家位置。

文字说明只使用核实资料；内部开关、变量条件改为“获取条件待核对”，不推测剧情或路线。第一版使用分类符号，第二版按下方扩展约定使用游戏原版物品图标。

## 人物与来源

`dist/characters.js` 设置 `window.NYARURU_CHARACTERS = { characters: [], sources: [] }`。

- `characters[]`：`id`、`name`、`role`、`intro`（简短纯文本）、`sourceName`、`sourceUrl`、`license`、`licenseUrl`、`adapted`（布尔）、`note`。
- `sources[]`：`id`、`name`、`url`、`note`。

引用萌娘百科文本需明确来源、完整原始链接、CC BY-NC-SA 4.0 链接及改写说明；图片授权单独处理，不默认转载。

## 前端

独立原生 HTML/CSS/JS，不安装框架。当前导航：世界地图、物品图鉴、全收集、人物、成就手册、全能助手、存档分析、关于资料。清单在本浏览器 localStorage 保存，首次为空，可导出/导入 Wiki 清单 JSON。地图点击展示对应格子与奖励，无传送操作。物品来源跳转地图定位。移动端可用。JS 接收静态数据后不访问游戏服务。

## 第二版扩展

保持 `data.js` 与既有清单格式、localStorage key 兼容；第一版源文件备份在 `.history/v0.1.0/`。

`dist/icons.js` 设置 `window.NYARURU_ICONS = {schemaVersion:1,items:{'type:id':{src:'assets/items/type-id.png',width,height}},types:{type:'type:id'},source:{note}}`。PNG 必须使用原版图标映射机械裁切，包含全部 49 个条目，地图、物品卡片、详情与分类按钮复用这些原图。原版图像权利归游戏权利人，人物引用文本的 CC 许可不适用于图像。

`dist/world-overview.js` 设置 `window.NYARURU_OVERVIEW = {schemaVersion:1,regions:[{id,offsetX,offsetY,minX,minY,maxX,maxY}],connections:[{key,from:{regionId,cellKey,mapId,side,label},to:{regionId,cellKey,mapId,side,label},bidirectional,kind,note}],meta:{coverage}}`。总览坐标使用 `cell.x + region.offsetX`、`cell.y + region.offsetY`，单位是地图格。实际出口箭头使用已核实的游戏边界/固定切换关系，未知连接保留说明，不推测。

`specialConnections[]` 为同样的端点结构，`kind:'story'`，单独记录已核实端点的剧情传送。默认关闭显示，启用后用虚线标示；不可混同普通可通行出口。当前版本有 14 条普通连接、3 条剧情连接，原版全局坐标可沿用，全部区域 offset 为 0。

第二版交互：增加一次显示全部区域的世界总览；保留分区查看与物品来源定位；图例改为能独立切换各类标记的按钮；已完成继续变灰。每张地图显示明显的大标题，并提供名称+颜色的区域图例。总览同时展示区域名称和跨区域出口箭头，可点击区域进入分区查看。

## 第三版扩展

人物保留既有字段，新增 `details:string[]`、`facts:{label,value}[]`、`spoilers:{title,text}[]`、`sourceRefs[]`、`pixel:{src,width,height}|null`、`portrait:{src,width,height}|null`。`identitySpoiler`、`imageSpoiler`、`safeName` 标示需主动展开的身份与图像；默认不注入剧透文本或图像，收起清空。图像使用 `assets/characters/`，映射依据见其 `manifest.json`。

品牌图像放在 `assets/brand/`，Steam 缓存原文件名与哈希记录在 `source.json`。物品价格沿用已有基础 `price`，只对 `shopCandidate && price > 0` 显示商店标价。

`save-parser.js` 同时支持浏览器 `window.NYARURU_SAVE` 与 Node.js `require()`。`await parse(input,{catalog})` 接收 `Uint8Array` 或 `ArrayBuffer`；失败返回 `{ok:false,error:{code,message}}`；成功返回 `{ok:true,summary,inventory,completed,coverage,warnings}`。

- `summary`：只返回可确认的地图、区域、金币、游戏时间等固定字段。
- `inventory[]`：`{itemKey,count,equipped?}`，缺失类别记录在覆盖范围，不伪造数量。
- `completed[]`：仅已明确完成的官方 `collectionKey`。
- `coverage`：`format`、`summary` 各字段 known/unknown、`inventory` 的 knownTypes/unknownTypes、`collections` 的 total/confirmedCompleted/confirmedNotCompleted/unknown。
- `warnings[]`：固定玩家说明，不拼接原始存档对象或异常内容。

模块使用浏览器原生解压与数据解析，不执行存档代码、不恢复游戏类，不包含上传或持久存储接口。页面只在用户选择文件后读取；新文件、错误或清空会取消旧预览。只有用户主动点击合并，才将 `completed` 并入原有清单；原文件和完整解析数据均不持久化。

导航增加 `#save` 与 `#assistant`。地图的左右模式按钮使用 `[data-map-mode]`，隐藏 `#map-mode` 保留统一模式值；原生可见下拉已移除。第三版备份前一版本于 `.history/v0.2.0/`。

## 第四版地图选择

保留世界总览与分区查看两个模式。分区模式下 `#map-region` 的空值选项名称固定为“小镇周围”，显示原版 `page === 2` 中喵喵小镇、幽暗之森、魔法学校、弧晶矿洞；不根据最近访问的地图页改变默认范围。菜单另列全部 16 个独立区域，包括上述四区。选择一个具体区域时仅展示该区域；世界总览的空值仍表示全部区域。物品来源与出口定位继续使用已有 `regionId`、`page`、`cellKey`。

### 0.4.1 区域名称坐标与裁剪

区域名称的锚点、标签位置、避让及引线均在地图相对平面中计算，包含当前缩放下的地图位置，但不包含 `mapView.x`、`mapView.y` 的平移偏移。标签候选不按平移后的屏幕可见性提前过滤，避让不以屏幕边界钳位；同一缩放下拖动不改变标签的相对布局。

标签层统一应用 `translate(mapView.x, mapView.y)`，名称与引线随地图一起移动。移出视口的部分交由 SVG 或地图容器裁剪，不能把名称重新挤回边缘。标签文字保持固定屏幕字号，不随地图缩放放大或缩小；手机仍保留区域编号及对应名称图例。

## 第四版成就资料

`dist/achievements.js` 设置 `window.NYARURU_ACHIEVEMENTS = {schemaVersion:1,items:[],meta:{}}`，共 32 项，ID 对应原游戏 `DataManager.activeAchievement` 与 Steam API 名称。

- `items[]`：`id`、`name`、`desc`、`category`、`hidden:boolean`、`spoiler:boolean`、`hiddenSource`、`spoilerSource`、`icon:{src,width,height}`、`steam:{statId,bit}`、`source`。
- `name`、`desc`、`category` 分别逐字采用原版 `story-schinese.xlsx` 的 `#achievement` 表 B/C/D 列。`category` 为主线、挑战、隐藏或结局。`HIDDEN10.desc` 保留原版空串；未发布开发用剧情解释列，不补造解锁条件。
- `hidden` 只取公共 Steam schema 的 `display.hidden`，共 12 项；`spoiler` 为 Wiki 对 5 个结局条目的剧透分类，不等同于官方隐藏标志。
- `icon.src` 为 `assets/achievements/{id}.png`，全部为原版 128×128 PNG，网页显示 96×96。导出直接保留原图字节。
- `steam` 记录公共定义的数值位置，第一组的位 8、26、28 为空位，不可用数组顺序替代；解析器使用内部核验映射，不接受外部清单覆盖。
- `source` 记录文字行号、原图资源名与 SHA-256，以及公共 Steam 分组和位编号。`meta` 包含说明、覆盖数量、原文与公共定义哈希、图源及权利说明；不包含个人账号或解锁状态。

导航为 `#achievements`。未读取状态时，15 项普通成就显示彩色资料；12 项官方隐藏成就与 5 项结局共 17 项逐卡折叠。`hidden || spoiler` 的名称、说明和真实图像在主动展开前不插入页面，不预加载真实图像，也不参与搜索。收起后清空这些内容，状态导入不自动揭示剧透。

## 第四版成就解析

`save-parser.js` 保持第三版普通进度解析字段，并新增 `achievements[]` 和 `coverage.achievements`，模块 `version` 为 2：

- `await NYARURU_SAVE.parse(bytes,{catalog,achievements:items})`：读取普通进度存档；成就来源为 `slot`，32 项全部 `unknown`。剧情开关、事件进度、通知队列或同名注入字段均不当作账号成就表。
- `await NYARURU_SAVE.parseConfig(bytes,{platform:'native',achievements:items})`：明确选择非 Steam 版后读取配置；来源为 `native-config`。有效的 `_achievementNative` 布尔字典按原版规则读取，缺少条目为 `locked`；整个字典缺失、格式错误或值不是布尔值时保持 `unknown`。此来源不代表 Steam 或 4399 账号。
- `NYARURU_ACHIEVEMENT_PARSE.parseSteam(bytes,{filename,achievements:items})`：`achievement-parser.js` 提供的同步纯函数，Node.js 可用 `require()`。`filename` 必须为原始 `UserGameStats_数字_1478160.bin`；拒绝公共 schema、其他游戏、路径或未知文件名。文件本身不含游戏编号，程序不能确认改名文件真实性或所属账号。

成就来源成功结果为 `{ok:true,achievements:[{id,status,source,label,basis}],coverage:{format,achievements:{total,unlocked,locked,unknown,source,label}},warnings}`；普通进度结果同时保留 `summary`、`inventory`、`completed` 等第三版字段。失败为 `{ok:false,error:{code,message}}`。`status` 仅为 `unlocked | locked | unknown`，`source` 为 `slot | native-config | steam-cache`。不返回原始对象、文件名、账号编号或解锁时间。

Steam 支持已核实的二进制 KeyValues 缓存布局，按 `cache[statId].data` 的 32 位整数读取状态。缺分组、缺数据、类型不符，或未解锁位与正解锁时间冲突时均为 `unknown`。返回 `format:'steam-binary-vdf'`；缓存可能过期，未联网核实，不保证账号云端实时状态。

Steam 输入上限 4 MiB、深度上限 48、节点上限 50,000、字符串上限 16,384 字节。非 Steam 配置沿用普通存档的输入、解压与复杂度限制。所有入口只读本地字节，不执行输入代码、不写回文件、不上传、不持久存储成就状态或账号信息。

页面只有收到明确 `locked` 才将图标变灰；`unknown` 保留彩色资料并显示未能确认。清空、替换文件、切换来源或读取失败都会清掉旧状态并使旧异步结果失效，不能让旧结果回填。成就状态不写入收集清单；收集清单原有手动勾选、导出导入与主动合并继续保留。

## 第四版维护入口

在项目目录使用 PowerShell 7 执行 `node scripts/check-achievements.js` 检查成就资料，执行 `node scripts/check-achievement-parser.js` 使用合成输入检查成就解析；`node scripts/check-save-parser.js` 复验原有存档解析，`node scripts/check-project.js` 和 `node scripts/qa-browser.js` 用于项目与浏览器检查。维护者持有原游戏和公共 schema 时，可加 `--source` 运行成就资料检查。上述命令为运行方法，实际完成情况以对应版本的验收记录为准。

## 第五版人物与剧情

`#characters` 保持原有导航地址，名称、页面标题和面包屑统一为“人物与剧情”。人物列表之前增加 `#ending-grid`，原有 `#character-grid` 及其人物剧透规则保留。

`dist/endings.js` 设置 `window.NYARURU_ENDINGS = {schemaVersion:1,items:[],meta:{}}`。`items[]` 包含 `id`、`name`、`trigger`、`summary`、`icon:{src,width,height}`、`source:{name,url,license,licenseUrl,adapted,note}`。

五项 `id` 分别为 `ED1`—`ED5`，通用名称为结局 1—4、隐藏结局；图片复用 `assets/achievements/ED1.png`—`ED5.png`。`trigger` 和 `summary` 只整理来源表的触发方式与概括，资料源为萌娘百科《咸鱼喵喵》“故事”章节下的结局表，不加入作者评价。`meta` 记录已核实的来源版本。

`.ending-card[data-ending]` 默认只显示图标、名称及展开控件，`.ending-details` 初始为空且隐藏。点击 `[data-ending-toggle]` 后插入触发方式、概括和来源授权；收起后清空内容，并同步 `aria-expanded`。每张结局卡独立开合，不联动人物剧透或成就状态。

## 第五版站点外观与说明

助手介绍使用 `assets/brand/header.jpg`，来自 Steam 中文 `header_schinese.jpg`，460×215，保留原始字节及比例；`assets/brand/source.json` 记录文件名、字节数和 SHA-256。

品牌区在 `NYARURU WIKI` 下显示“非官方百科，由爱好者维护”。`#about` 导航名为“关于”，顶部 `#site-note` 为可直接修改 HTML 文本的站点说明占位区，下方保留既有资料与授权内容。
