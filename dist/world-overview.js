// Generated offline by scripts/export-world-overview.js. Public map topology only.
window.NYARURU_OVERVIEW = {
  "schemaVersion": 1,
  "regions": [
    {
      "id": 1,
      "offsetX": 0,
      "offsetY": 0,
      "minX": 62,
      "minY": 59,
      "maxX": 69,
      "maxY": 62
    },
    {
      "id": 2,
      "offsetX": 0,
      "offsetY": 0,
      "minX": 70,
      "minY": 52,
      "maxX": 82,
      "maxY": 62
    },
    {
      "id": 3,
      "offsetX": 0,
      "offsetY": 0,
      "minX": 72,
      "minY": 46,
      "maxX": 76,
      "maxY": 52
    },
    {
      "id": 4,
      "offsetX": 0,
      "offsetY": 0,
      "minX": 60,
      "minY": 50,
      "maxX": 72,
      "maxY": 57
    },
    {
      "id": 5,
      "offsetX": 0,
      "offsetY": 0,
      "minX": 49,
      "minY": 60,
      "maxX": 62,
      "maxY": 72
    },
    {
      "id": 6,
      "offsetX": 0,
      "offsetY": 0,
      "minX": 68,
      "minY": 36,
      "maxX": 89,
      "maxY": 51
    },
    {
      "id": 7,
      "offsetX": 0,
      "offsetY": 0,
      "minX": 56,
      "minY": 21,
      "maxX": 79,
      "maxY": 35
    },
    {
      "id": 8,
      "offsetX": 0,
      "offsetY": 0,
      "minX": 84,
      "minY": 22,
      "maxX": 89,
      "maxY": 38
    },
    {
      "id": 9,
      "offsetX": 0,
      "offsetY": 0,
      "minX": 83,
      "minY": 43,
      "maxX": 103,
      "maxY": 53
    },
    {
      "id": 10,
      "offsetX": 0,
      "offsetY": 0,
      "minX": 35,
      "minY": 27,
      "maxX": 55,
      "maxY": 37
    },
    {
      "id": 11,
      "offsetX": 0,
      "offsetY": 0,
      "minX": 86,
      "minY": 47,
      "maxX": 107,
      "maxY": 56
    },
    {
      "id": 12,
      "offsetX": 0,
      "offsetY": 0,
      "minX": 104,
      "minY": 29,
      "maxX": 112,
      "maxY": 35
    },
    {
      "id": 13,
      "offsetX": 0,
      "offsetY": 0,
      "minX": 113,
      "minY": 27,
      "maxX": 136,
      "maxY": 37
    },
    {
      "id": 14,
      "offsetX": 0,
      "offsetY": 0,
      "minX": 50,
      "minY": 33,
      "maxX": 67,
      "maxY": 40
    },
    {
      "id": 15,
      "offsetX": 0,
      "offsetY": 0,
      "minX": 55,
      "minY": 45,
      "maxX": 75,
      "maxY": 48
    },
    {
      "id": 92,
      "offsetX": 0,
      "offsetY": 0,
      "minX": 89,
      "minY": 74,
      "maxX": 104,
      "maxY": 74
    }
  ],
  "connections": [
    {
      "key": "boundary:11:55:28|5:56:28",
      "from": {
        "regionId": 10,
        "cellKey": "11:55:28",
        "mapId": 265,
        "side": "right",
        "label": "封印结界·里 · 地图 265 右侧出口"
      },
      "to": {
        "regionId": 7,
        "cellKey": "5:56:28",
        "mapId": 181,
        "side": "left",
        "label": "封印结界 · 地图 181 左侧入口"
      },
      "bidirectional": true,
      "kind": "boundary",
      "note": "Map001 相邻缩略格 11:55:28 ↔ 5:56:28；eor/eol 偏移标签与 nya_event_trigger.js autoTransfer 双向边界规则一致。仅表示连接，实际通行仍受地形、能力与剧情限制。"
    },
    {
      "key": "boundary:4:87:38|8:88:38",
      "from": {
        "regionId": 6,
        "cellKey": "4:87:38",
        "mapId": 128,
        "side": "right",
        "label": "天空层顶 · 地图 128 右侧出口"
      },
      "to": {
        "regionId": 8,
        "cellKey": "8:88:38",
        "mapId": 183,
        "side": "left",
        "label": "浮游高塔 · 地图 183 左侧入口"
      },
      "bidirectional": true,
      "kind": "boundary",
      "note": "Map001 相邻缩略格 4:87:38 ↔ 8:88:38；eor/eol 偏移标签与 nya_event_trigger.js autoTransfer 双向边界规则一致。仅表示连接，实际通行仍受地形、能力与剧情限制。"
    },
    {
      "key": "boundary:15:75:46|2:76:46",
      "from": {
        "regionId": 15,
        "cellKey": "15:75:46",
        "mapId": 372,
        "side": "right",
        "label": "黄昏树海 · 地图 372 右侧出口"
      },
      "to": {
        "regionId": 3,
        "cellKey": "2:76:46",
        "mapId": 49,
        "side": "left",
        "label": "魔法学校 · 地图 49 左侧入口"
      },
      "bidirectional": true,
      "kind": "boundary",
      "note": "Map001 相邻缩略格 15:75:46 ↔ 2:76:46；eor/eol 偏移标签与 nya_event_trigger.js autoTransfer 双向边界规则一致。仅表示连接，实际通行仍受地形、能力与剧情限制。"
    },
    {
      "key": "boundary:2:79:52|4:79:51",
      "from": {
        "regionId": 6,
        "cellKey": "4:79:51",
        "mapId": 109,
        "side": "bottom",
        "label": "天空层顶 · 地图 109 下侧出口"
      },
      "to": {
        "regionId": 2,
        "cellKey": "2:79:52",
        "mapId": 37,
        "side": "top",
        "label": "幽暗之森 · 地图 37 上侧入口"
      },
      "bidirectional": true,
      "kind": "boundary",
      "note": "Map001 相邻缩略格 4:79:51 ↔ 2:79:52；eob/eot 偏移标签与 nya_event_trigger.js autoTransfer 双向边界规则一致。仅表示连接，实际通行仍受地形、能力与剧情限制。"
    },
    {
      "key": "boundary:2:72:52|2:72:53",
      "from": {
        "regionId": 3,
        "cellKey": "2:72:52",
        "mapId": 39,
        "side": "bottom",
        "label": "魔法学校 · 地图 39 下侧出口"
      },
      "to": {
        "regionId": 4,
        "cellKey": "2:72:53",
        "mapId": 50,
        "side": "top",
        "label": "弧晶矿洞 · 地图 50 上侧入口"
      },
      "bidirectional": true,
      "kind": "boundary",
      "note": "Map001 相邻缩略格 2:72:52 ↔ 2:72:53；eob/eot 偏移标签与 nya_event_trigger.js autoTransfer 双向边界规则一致。仅表示连接，实际通行仍受地形、能力与剧情限制。"
    },
    {
      "key": "boundary:2:76:52|2:77:52",
      "from": {
        "regionId": 3,
        "cellKey": "2:76:52",
        "mapId": 39,
        "side": "right",
        "label": "魔法学校 · 地图 39 右侧出口"
      },
      "to": {
        "regionId": 2,
        "cellKey": "2:77:52",
        "mapId": 37,
        "side": "left",
        "label": "幽暗之森 · 地图 37 左侧入口"
      },
      "bidirectional": true,
      "kind": "boundary",
      "note": "Map001 相邻缩略格 2:76:52 ↔ 2:77:52；eor/eol 偏移标签与 nya_event_trigger.js autoTransfer 双向边界规则一致。仅表示连接，实际通行仍受地形、能力与剧情限制。"
    },
    {
      "key": "boundary:2:82:53|9:83:53",
      "from": {
        "regionId": 2,
        "cellKey": "2:82:53",
        "mapId": 34,
        "side": "right",
        "label": "幽暗之森 · 地图 34 右侧出口"
      },
      "to": {
        "regionId": 9,
        "cellKey": "9:83:53",
        "mapId": 198,
        "side": "left",
        "label": "森林城堡 · 地图 198 左侧入口"
      },
      "bidirectional": true,
      "kind": "boundary",
      "note": "Map001 相邻缩略格 2:82:53 ↔ 9:83:53；eor/eol 偏移标签与 nya_event_trigger.js autoTransfer 双向边界规则一致。仅表示连接，实际通行仍受地形、能力与剧情限制。"
    },
    {
      "key": "boundary:9:85:53|9:86:53",
      "from": {
        "regionId": 9,
        "cellKey": "9:85:53",
        "mapId": 194,
        "side": "right",
        "label": "森林城堡 · 地图 194 右侧出口"
      },
      "to": {
        "regionId": 11,
        "cellKey": "9:86:53",
        "mapId": 266,
        "side": "left",
        "label": "冰雪山丘 · 地图 266 左侧入口"
      },
      "bidirectional": true,
      "kind": "boundary",
      "note": "Map001 相邻缩略格 9:85:53 ↔ 9:86:53；eor/eol 偏移标签与 nya_event_trigger.js autoTransfer 双向边界规则一致。仅表示连接，实际通行仍受地形、能力与剧情限制。"
    },
    {
      "key": "boundary:2:69:60|2:70:60",
      "from": {
        "regionId": 1,
        "cellKey": "2:69:60",
        "mapId": 6,
        "side": "right",
        "label": "喵喵小镇 · 地图 6 右侧出口"
      },
      "to": {
        "regionId": 2,
        "cellKey": "2:70:60",
        "mapId": 8,
        "side": "left",
        "label": "幽暗之森 · 地图 8 左侧入口"
      },
      "bidirectional": true,
      "kind": "boundary",
      "note": "Map001 相邻缩略格 2:69:60 ↔ 2:70:60；eor/eol 偏移标签与 nya_event_trigger.js autoTransfer 双向边界规则一致。仅表示连接，实际通行仍受地形、能力与剧情限制。"
    },
    {
      "key": "boundary:2:69:61|2:70:61",
      "from": {
        "regionId": 1,
        "cellKey": "2:69:61",
        "mapId": 7,
        "side": "right",
        "label": "喵喵小镇 · 地图 7 右侧出口"
      },
      "to": {
        "regionId": 2,
        "cellKey": "2:70:61",
        "mapId": 24,
        "side": "left",
        "label": "幽暗之森 · 地图 24 左侧入口"
      },
      "bidirectional": true,
      "kind": "boundary",
      "note": "Map001 相邻缩略格 2:69:61 ↔ 2:70:61；eor/eol 偏移标签与 nya_event_trigger.js autoTransfer 双向边界规则一致。仅表示连接，实际通行仍受地形、能力与剧情限制。"
    },
    {
      "key": "transfer:2:62:60|3:62:61",
      "from": {
        "regionId": 1,
        "cellKey": "2:62:60",
        "mapId": 75,
        "side": "bottom",
        "label": "喵喵小镇 · 地图 75 下侧出口"
      },
      "to": {
        "regionId": 5,
        "cellKey": "3:62:61",
        "mapId": 76,
        "side": "top",
        "label": "克拉里斯湖 · 地图 76 上侧入口"
      },
      "bidirectional": true,
      "kind": "transfer",
      "note": "Map075 事件 2 第 1 页 code201 → 地图 76 (11,0)；返程 Map076 事件 1 第 1 页 code201 → 地图 75 (8,11)。方位按相邻缩略格或事件所在地图边缘标示。"
    },
    {
      "key": "transfer:2:75:52|4:68:42",
      "from": {
        "regionId": 6,
        "cellKey": "4:68:42",
        "mapId": 153,
        "side": "bottom",
        "label": "天空层顶 · 地图 153 下侧出口"
      },
      "to": {
        "regionId": 3,
        "cellKey": "2:75:52",
        "mapId": 39,
        "side": "top",
        "label": "魔法学校 · 地图 39 上侧入口"
      },
      "bidirectional": false,
      "kind": "transfer",
      "note": "Map153 事件 23 第 1 页 code201 → 地图 39 (64,0)；仅核实此方向，未发现对应返程出口。方位按相邻缩略格或事件所在地图边缘标示。"
    },
    {
      "key": "transfer:9:103:46|9:103:47",
      "from": {
        "regionId": 9,
        "cellKey": "9:103:46",
        "mapId": 215,
        "side": "bottom",
        "label": "森林城堡 · 地图 215 下侧出口"
      },
      "to": {
        "regionId": 11,
        "cellKey": "9:103:47",
        "mapId": 283,
        "side": "top",
        "label": "冰雪山丘 · 地图 283 上侧入口"
      },
      "bidirectional": true,
      "kind": "transfer",
      "note": "Map215 事件 1 第 1 页 code201 → 地图 283 (16,4)；返程 Map283 事件 1 第 1 页 code201 → 地图 215 (10,39)。方位按相邻缩略格或事件所在地图边缘标示。"
    },
    {
      "key": "transfer:12:112:29|13:113:29",
      "from": {
        "regionId": 13,
        "cellKey": "13:113:29",
        "mapId": 306,
        "side": "left",
        "label": "缇娅的实验室 · 地图 306 左侧出口"
      },
      "to": {
        "regionId": 12,
        "cellKey": "12:112:29",
        "mapId": 322,
        "side": "right",
        "label": "星之海 · 地图 322 右侧入口"
      },
      "bidirectional": true,
      "kind": "transfer",
      "note": "Map306 事件 2 第 1 页 code201 → 地图 322 (7,7)；返程 Map322 事件 1 第 1 页 code201 → 地图 306 (0,5)。方位按相邻缩略格或事件所在地图边缘标示。事件存在后续条件页，通行可能受剧情阶段限制。"
    }
  ],
  "specialConnections": [
    {
      "key": "story:9:102:44>11:39:37",
      "from": {
        "regionId": 9,
        "cellKey": "9:102:44",
        "mapId": 217,
        "side": "left",
        "label": "森林城堡 · 地图 217 特殊连接点"
      },
      "to": {
        "regionId": 10,
        "cellKey": "11:39:37",
        "mapId": 239,
        "side": "right",
        "label": "封印结界·里 · 地图 239 特殊连接点"
      },
      "bidirectional": false,
      "kind": "story",
      "note": "Map001 的 c 标签明确连接缩略格 9:102:44 → 11:39:37（nya_map.js 原版特殊路径链接）。剧情或特殊传送，实际触发条件与返程方式待核对；不作为普通步行出口。"
    },
    {
      "key": "story:2:75:52>5:71:34",
      "from": {
        "regionId": 3,
        "cellKey": "2:75:52",
        "mapId": 39,
        "side": "top",
        "label": "魔法学校 · 地图 39 特殊连接点"
      },
      "to": {
        "regionId": 7,
        "cellKey": "5:71:34",
        "mapId": 155,
        "side": "bottom",
        "label": "封印结界 · 地图 155 特殊连接点"
      },
      "bidirectional": false,
      "kind": "story",
      "note": "Map001 的 c 标签明确连接缩略格 2:75:52 → 5:71:34（nya_map.js 原版特殊路径链接）。剧情或特殊传送，实际触发条件与返程方式待核对；不作为普通步行出口。"
    },
    {
      "key": "story:9:102:53>12:104:35",
      "from": {
        "regionId": 11,
        "cellKey": "9:102:53",
        "mapId": 296,
        "side": "top",
        "label": "冰雪山丘 · 地图 296 特殊连接点"
      },
      "to": {
        "regionId": 12,
        "cellKey": "12:104:35",
        "mapId": 303,
        "side": "bottom",
        "label": "星之海 · 地图 303 特殊连接点"
      },
      "bidirectional": false,
      "kind": "story",
      "note": "Map001 的 c 标签明确连接缩略格 9:102:53 → 12:104:35（nya_map.js 原版特殊路径链接）。剧情或特殊传送，实际触发条件与返程方式待核对；不作为普通步行出口。"
    }
  ],
  "meta": {
    "coverage": "依据 Map001 原版缩略格、nya_map.js 坐标映射、nya_event_trigger.js 自动边界规则与各地图固定 code201 接触/门口事件核对。仅展示普通跨区域出口；双向表示两向连接有依据，不代表任意剧情阶段或能力状态均可通行。剧情传送、动态传送与同区域路线未混入普通出口。",
    "layout": "保留 Map001 全局格子坐标与同页相对位置；996 格互不重叠。区域包围框可以相交，不等于地图格子重叠。方位为示意，不代表实地距离。",
    "unlinkedRegionIds": [
      14,
      92
    ],
    "unlinkedNote": "崩坏的结界、头目连战未核实到普通跨区域出口；保留原坐标独立展示，不推测连线。",
    "excludedNote": "另列原版 c 标签核实的学校→封印结界、森林城堡→封印结界·里、冰雪山丘→星之海特殊连接，触发条件待核对，不属于普通步行出口。其余动态/剧情事件未枚举；崩坏的结界与头目连战不据地名补线。",
    "sourceCounts": {
      "cells": 996,
      "regions": 16,
      "boundary": 10,
      "transfer": 4,
      "special": 3,
      "excludedCommands": {
        "storyOrConditional": 9,
        "unmapped": 27,
        "dynamic": 0,
        "sameRegion": 217
      }
    }
  }
};
