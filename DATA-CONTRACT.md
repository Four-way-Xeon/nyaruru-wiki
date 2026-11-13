# Wiki 数据约定

当前版本为第七版 `0.7.0`。这是独立静态原型，不调用游戏操作接口。页面文件放在 `dist/`，可直接打开 `dist/index.html`，也可用本地静态服务预览。

## Boss 档案与战斗数值

公开页面源码与已核验数据位于 `dist/boss-atlas/`。原 Wiki 通过 `#bosses` 入口嵌入；18 个原版像素按钮、招式深链和本地 GIF 保留。独立游戏沙盒、原始游戏脚本和采集研究目录不随公开包分发。

`combat-data.js` 设置 `window.ATLAS_COMBAT = {version,difficulties,damageBasis,challengeDamageBasis,encounters}`。`encounters[id]` 含 `health:{rows,variants,notes}` 与 `moves[attackId]:{unit,rows,challengeAvailable,summary,notes}`；每行含面向玩家的 `label`、以难度值为键的 `values` 和简短 `notes`。支持挑战切换的招式额外保存每行的 `challengeValues`。难度按原版新版菜单为简单 `-1`、普通 `0`、困难 `0.5`、噩梦 `1`。数值允许精确数字、条件范围文字或表示不适用的 `null`；不得将未知或纯召唤动作当作零伤害。

血量按生命池与阶段分别列出；通关挑战仅展示与剧情战不同的数值。伤害注明一次命中、持续伤害或其他实际口径，不把多段判定直接相加成必吃总伤害。`combat-view.js` 在选择 Boss 或招式时更新右侧表格，原始脚本编号与研究证据不进入玩家页面。

单场挑战与“头目连战”血量相同的表合并显示；角色生命或任一技能已强化时，使用有强化条件。伤害默认显示不含剧情成长与玩家减伤的基础值；可用招式提供“挑战有强化”切换，直接读取预计算值，不对已舍入的基础数值再次乘倍率。剧情专属动作不提供挑战切换。斜杠表示 Boss 自身攻击强化前后；与角色是否强化是两个独立条件。

战斗数值来自原版运行与脚本核对：18 个战斗版本、152 项动作、243 行伤害说明。血量已核对 356 个运行案例，伤害通过 12,287 次原版表达式计算校验。公开数据不包含原始游戏表、源码行号或研究用本地路径。

在项目根目录运行 `node scripts/qa-boss-atlas.cjs --combat` 检查全部数值表、实际切换、电脑/手机布局与本地入口。页面是普通静态 HTML/CSS/JavaScript，无须运行采集工具即可使用。

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

保持 `data.js` 与既有清单格式、localStorage key 兼容。

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

导航包含 `#save` 与 `#assistant`。地图的左右模式按钮使用 `[data-map-mode]`，隐藏 `#map-mode` 保留统一模式值。

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

在项目目录使用 PowerShell 7 执行 `node scripts/check-achievements.js` 检查成就资料，执行 `node scripts/check-achievement-parser.js` 使用合成输入检查成就解析；`node scripts/check-save-parser.js` 复验原有存档解析，`node scripts/check-project.js` 和 `node scripts/qa-browser.js` 用于项目与浏览器检查。维护者持有原游戏和公共 schema 时，可加 `--source` 运行成就资料检查。命令会输出检查结果，浏览器报告与截图位于 `.qa/`。

## 第五版人物与剧情

`#characters` 保持原有导航地址，名称、页面标题和面包屑统一为“人物与剧情”。人物列表之前增加 `#ending-grid`，原有 `#character-grid` 及其人物剧透规则保留。

`dist/endings.js` 设置 `window.NYARURU_ENDINGS = {schemaVersion:1,items:[],meta:{}}`。`items[]` 包含 `id`、`name`、`trigger`、`summary`、`icon:{src,width,height}`、`source:{name,url,license,licenseUrl,adapted,note}`。

五项 `id` 分别为 `ED1`—`ED5`，通用名称为结局 1—4、隐藏结局；图片复用 `assets/achievements/ED1.png`—`ED5.png`。`trigger` 和 `summary` 只整理来源表的触发方式与概括，资料源为萌娘百科《咸鱼喵喵》“故事”章节下的结局表，不加入作者评价。`meta` 记录已核实的来源版本。

`.ending-card[data-ending]` 默认只显示图标、名称及展开控件，`.ending-details` 初始为空且隐藏。点击 `[data-ending-toggle]` 后插入触发方式、概括和来源授权；收起后清空内容，并同步 `aria-expanded`。每张结局卡独立开合，不联动人物剧透或成就状态。

## 第五版站点外观与说明

助手介绍使用 `assets/brand/header.jpg`，来自 Steam 中文 `header_schinese.jpg`，460×215，保留原始字节及比例；`assets/brand/source.json` 记录文件名、字节数和 SHA-256。

品牌区在 `NYARURU WIKI` 下显示“非官方百科，由爱好者维护”。`#about` 导航名为“关于”，顶部 `#site-note` 是可直接维护 HTML 的站点说明区，第六版已填入百科介绍、“Kitasami_Nya 的博客”（https://www.serversalem.top/）、百科仓库（https://github.com/Four-way-Xeon/nyaruru-wiki）、相关文字的 CC BY-NC-SA 4.0 许可和官方游戏图片权利说明。桌面分栏，手机上下排布，下方保留既有资料与授权内容。

## 静态资料生成

生成器 `scripts/build-guides.js` 从现有公开导出生成 `dist/guide/`，不读取玩家存档、账号缓存或浏览器清单。数据输入为 `dist/data.js`、`icons.js`、`characters.js`、`endings.js`、`achievements.js`、`world-overview.js`；`scripts/lib/guide-model.js` 读取对应 `window.NYARURU_*` 数据并建立公开资料模型。图片继续引用 `dist/assets/`，原交互站及其数据格式保留。

当前页面数量为 `1 + 5 + 49 + 16 + 5 + 32 + 16 = 124`：资料首页、五类目录，以及物品、人物、结局、成就、区域各自的详情。目录为 `items/`、`characters/`、`endings/`、`achievements/`、`regions/`；首页与目录入口均显式使用 `index.html`，详情使用 `<slug>.html`。模型以稳定公开编号生成 slug，隐藏身份人物使用通用路径，如 `characters/unrevealed-13.html`，不以真实名称暴露身份。

`site.config.json` 包含 `siteUrl`、`blogUrl`、`siteName`。当前 `siteUrl` 为计划根地址 `https://www.serversalem.top/nyaruru-wiki/`，不是发布状态声明；canonical 与 `guide/sitemap.xml` 中的绝对地址由此生成。本地资源、目录及交互站链接为相对路径，支持直接以 `file://` 阅读。`siteUrl` 必须为无账号密码、查询和片段的 HTTP(S) 基地址。

在项目目录执行 `node scripts/build-guides.js` 或双击 `一键生成资料页.bat` 生成；要求 Node.js 22 及以上，不需要安装 npm 依赖或后端。`--site-url URL` 仅覆盖本次基地址，不改配置文件。`--check` 只比较计划与现有产物，不写入、创建或删除文件；存在差异时退出码非零。用临时地址生成的产物需以相同 `--site-url` 检查。

Node.js 接口为 `buildGuides({projectRoot,outDir,siteUrl,check,model})` 与 `planGuides(options)`。默认项目根为生成器所在项目，默认输出目录为 `dist/guide`；`model`、`outDir` 可供隔离检查注入，CLI 不提供 `--out-dir`。`planGuides` 返回 `{files:Map,manifest,model}`；`buildGuides` 返回 `{ok,outputDir,htmlCount,counts,files,differences,removed,changed}`，检查模式遇到差异时 `ok:false`。产物除 HTML 外还包含 `guide.css`、`sitemap.xml`、`build-manifest.json`。

`build-manifest.json` 为 `{schemaVersion:1,generator,version:'0.7.0',inputs,config,modelSha256,counts,files:[{path,sha256}]}`。`inputs` 记录配置、生成代码、模板、样式、公开资料及条目图像的输入哈希；`modelSha256` 为序列化公开资料模型的 SHA-256。`files` 记录相对于 guide 目录的生成路径及内容哈希，不含清单自身。

生成器先验证计划和旧清单的路径，再更新产物；只逐一删除旧清单中存在、此次计划已移除的允许路径，不递归清空目录。路径必须位于输出目录内，并拒绝符号链接、重复清单项和异常文件类型。清单外的自建文件不会作为过期产物删除；用户文件仍应避开计划输出的同名路径，因为生成目标会被更新。原交互页面、原图和用户进度不属于清理范围。

模板接口为 `renderPage({title,description,body,canonical,assetRoot,guideRoot,interactiveRoot,activeNav,breadcrumbs,siteName,blogUrl})`，由 `scripts/lib/guide-template.js` 导出。`body` 是构建器已转义的可信正文 HTML，并提供唯一 `h1`；模板转义其余文本与属性，提供导航、面包屑、标题、摘要及明确传入的 canonical。`assetRoot` 指向 dist，`guideRoot` 指向 guide，`interactiveRoot` 是主站 `index.html` 的相对路径；`breadcrumbs` 为 `{label,href?}[]`。`scripts/lib/guide.css` 复制为 `dist/guide/guide.css`，资料页不加载原交互 `app.js` 或数据脚本。

资料导航沿用交互版八个栏目，侧栏全部链接至主 `index.html` 的对应 fragment。`endings` 页归入“人物与剧情”，`regions` 页归入“世界地图”；各资料目录与详情 URL 保留，仍可通过原网址和 sitemap 访问。结局和人物目录的 `.reader-card-link` 使用单个原生链接包住整张卡片，不包含嵌套链接；结局直接链接 `?ending=<id>#characters`，人物直接链接 `?character=<id>#characters`。链接不依赖资料页脚本，自动展开与定位由完整版执行。区域地图预览使用对应 `regionId` 的现有地图格生成内联 SVG，保持格子相对位置，不加入推测地形、出口或收集状态；预览点击进入交互版对应区域，收集列表另有静态入口。

### 静态资料的剧情保护

静态正文采用默认不带 `open` 的原生 `details/summary`；隐藏人物、隐藏成就和结局剧情由读者主动展开。标题、description、目录标签等未折叠位置保留通用名称。折叠正文已在 HTML 源码中，可能被浏览器加载其中图片，不等同于原交互站“点击前正文为空、点击后才注入”的保护；默认阅读时的视觉折叠继续保留。

剧透正文包在 `div.reader-prose[data-nosnippet]` 中。Google 支持 `div`、`span`、`section` 的此属性，不能仅依赖 `details[data-nosnippet]`；该属性约束搜索摘要，不是禁止索引或访问控制。参考：[Google robots meta tag 与 data-nosnippet](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag#data-nosnippet-attr)。

### 主交互站深链接

主 `index.html` 支持以下目标参数；值使用 `encodeURIComponent`，fragment 表示对应页面：

| 参数 | 资料键 | 对应 fragment | 行为 |
| --- | --- | --- | --- |
| `source` | `location.key` | `#map` | 定位具体来源对应方格 |
| `item` | `item.key` | `#items` | 打开物品详情 |
| `region` | `region.id` | `#map` | 选择独立区域 |
| `character` | 人物原始 `id` | `#characters` | 定位人物档案卡 |
| `achievement` | 成就原始 `id` | `#achievements` | 定位成就卡 |
| `ending` | 结局原始 `id`，`ED1`—`ED5` | `#characters` | 定位并展开对应结局，其他结局与人物剧透保持收起 |

例如来源链接形如 `../../index.html?source=<编码后的location.key>#map`；`source` 不接受 `collectionKey` 代替。隐藏人物静态 slug 与交互人物原始 `id` 分别用于文件路径和卡片定位，不能混用。

六类已识别目标参数中只接受一个且仅出现一次；空值、超过 200 字符、多目标、重复目标、不在公开资料索引中的值或无地图格的来源均拒绝定位。合法目标进入相应页面；参数不能改变清单、不触发存档合并，也不自动展开人物或成就剧透。有效 `ending` 链接复用原结局开关展开选中卡片，并滚动聚焦该卡；普通 `#characters` 入口仍保持全部结局收起。

正式上传应包含完整 `dist/` 内容，保持 `assets/`、`guide/` 与原交互入口的相对位置；站点地图位于 `dist/guide/sitemap.xml`。生成命令只更新本地产物，上传方法见 `WordPress接入说明.txt`。
