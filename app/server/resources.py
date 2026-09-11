"""求助资源清单（危机旁路使用）。

engine-api.md §5.2：资源清单按地区可配置，应用侧维护。
号码为公开心理援助热线；上线前请由运营复核时效与覆盖地区。
"""

# region -> [{name, contact, hours}]
RESOURCES = {
    "CN": [
        {"name": "全国心理援助热线", "contact": "12356", "hours": "24 小时"},
        {"name": "北京心理危机研究与干预中心", "contact": "010-82951332", "hours": "24 小时"},
        {"name": "希望24热线", "contact": "400-161-9995", "hours": "24 小时"},
    ],
    "_default": [
        {"name": "当地紧急求助", "contact": "拨打本地急救/紧急电话", "hours": "24 小时"},
    ],
}


def resources_for(region: str = "CN") -> list:
    return RESOURCES.get(region, RESOURCES["_default"])
