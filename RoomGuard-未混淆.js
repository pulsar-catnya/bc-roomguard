

 
(() => {
"use strict";

 

const RGNow = () => Date.now();
const RGLog = (...a) => console.log("[RoomGuard]", ...a);
const RGErr = (...a) => console.error("[RoomGuard]", ...a);

const RG_VERSION = "1.0.0";
const RG_STORE_KEY = "RoomGuardData";
const RG_WIN_KEY = "RoomGuardWin";
const RG_DOT_KEY = "RoomGuardDot";
const RG_LANG_KEY = "RoomGuardLang";
const RG_MIN_WIN_W = 360;
const RG_MIN_WIN_H = 320;
const RG_LOG_CAP = 200;          
const RG_ACTION_CAP = 100;       
const RG_SAVE_DEBOUNCE_MS = 300;
const RG_DAY_MS = 86400000;
const RG_SPEECH_TYPES = ["Chat"]; 

 
const RGStorage = {
	lastError: null,
	get(key) {
		try { return localStorage.getItem(key); } catch (e) { return null; }
	},
	set(key, value) {
		try { localStorage.setItem(key, value); return true; }
		catch (e) { this.lastError = e; return false; }
	},
	remove(key) {
		try { localStorage.removeItem(key); } catch (e) {   }
	},
};

 
function RGCurrentNum() {
	try {
		if (typeof Player !== "undefined" && Player && Number.isInteger(Player.MemberNumber) && Player.MemberNumber > 0) {
			return Player.MemberNumber;
		}
	} catch (e) {   }
	return null;
}

 
function RGCharOf(num) {
	try {
		if (typeof ChatRoomCharacter !== "undefined" && Array.isArray(ChatRoomCharacter)) {
			const c = ChatRoomCharacter.find(x => x && x.MemberNumber === num);
			if (c) return c;
		}
		if (typeof Character !== "undefined" && Array.isArray(Character)) {
			const c = Character.find(x => x && x.MemberNumber === num);
			if (c) return c;
		}
	} catch (e) {   }
	return null;
}

 
function RGDisplayName(num) {
	const c = RGCharOf(num);
	if (c) {
		if (typeof c.Nickname === "string" && c.Nickname) return c.Nickname;
		if (typeof c.Name === "string" && c.Name) return c.Name;
	}
	return "#" + num;
}

 
function RGGroupLabel(group) {
	try {
		if (typeof AssetGroupGet === "function" && typeof group === "string") {
			const g = AssetGroupGet("Female3DCG", group);
			if (g && typeof g.Description === "string" && g.Description && g.Description.indexOf("MISSING") !== 0) {
				return g.Description;
			}
		}
	} catch (e) {   }
	return group;
}

 
function RGItemLabel(group, name) {
	if (name == null) return "";
	try {
		if (typeof AssetGet === "function" && typeof group === "string" && typeof name === "string") {
			const a = AssetGet("Female3DCG", group, name);
			if (a && typeof a.Description === "string" && a.Description && a.Description.indexOf("MISSING") !== 0) {
				return a.Description;
			}
		}
	} catch (e) {   }
	return name;
}

 

 
function RGDefaultState() {
	return {
		v: 1,
		settings: {
			enabled: true,        
			condAge: true,        
			condClothes: true,    
			condRestraint: true,  
			minAgeDays: 30,       
			combine: "any",       
			banAfterKicks: 3,     
		},
		kickCount: {},           
		log: [],                 
	};
}

 
function RGNormalizeState(raw) {
	const d = RGDefaultState();
	if (raw && typeof raw === "object") {
		const s = raw.settings || {};
		const st = d.settings;
		st.enabled = s.enabled !== false;
		st.condAge = s.condAge !== false;
		st.condClothes = s.condClothes !== false;
		st.condRestraint = s.condRestraint !== false;
		st.minAgeDays = Number.isFinite(Number(s.minAgeDays)) && Number(s.minAgeDays) > 0 ? Math.floor(Number(s.minAgeDays)) : 30;
		st.combine = s.combine === "all" ? "all" : "any";
		st.banAfterKicks = Number.isFinite(Number(s.banAfterKicks)) && Number(s.banAfterKicks) >= 0 ? Math.floor(Number(s.banAfterKicks)) : 3;
		d.kickCount = (raw.kickCount && typeof raw.kickCount === "object") ? raw.kickCount : {};
		d.log = Array.isArray(raw.log) ? raw.log.slice(0, RG_LOG_CAP) : [];
	}
	return d;
}

 
const RGStore = {
	state: RGDefaultState(),
	accountNum: null,
	saveTimer: null,

	baseKey() {
		const num = this.accountNum != null ? this.accountNum : RGCurrentNum();
		return num != null ? (RG_STORE_KEY + ":" + num) : null;
	},

	load() {
		this.accountNum = RGCurrentNum();
		const key = this.baseKey();
		let raw = null;
		if (key) raw = RGStorage.get(key);
		let parsed = null;
		if (raw) { try { parsed = JSON.parse(raw); } catch (e) { parsed = null; } }
		this.state = RGNormalizeState(parsed);
		return this.state;
	},

	 
	ensureAccount(num) {
		if (Number.isInteger(num) && num > 0 && this.accountNum !== num) {
			this.accountNum = num;
			this.load();
		} else if (this.accountNum == null) {
			this.load();
		}
	},

	 
	save() {
		if (this.saveTimer) clearTimeout(this.saveTimer);
		this.saveTimer = setTimeout(() => {
			this.saveTimer = null;
			try {
				const key = this.baseKey();
				if (!key) return;
				let existing = null;
				const raw = RGStorage.get(key);
				if (raw) { try { existing = JSON.parse(raw); } catch (e) { existing = null; } }
				const merged = RGMergeState(existing, this.state);
				this.state = merged;
				RGStorage.set(key, JSON.stringify(merged));
			} catch (e) { RGErr("保存失败", e); }
		}, RG_SAVE_DEBOUNCE_MS);
	},

	 
	flush() {
		if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
		try {
			const key = this.baseKey();
			if (!key) return;
			RGStorage.set(key, JSON.stringify(this.state));
		} catch (e) { RGErr("flush 失败", e); }
	},
};

 
function RGMergeState(existing, mine) {
	const m = RGNormalizeState(existing);
	m.settings = mine.settings;
	
	const seen = {};
	const merged = [];
	for (const e of (mine.log || [])) {
		const k = e.t + ":" + e.num;
		if (!seen[k]) { seen[k] = true; merged.push(e); }
	}
	for (const e of (m.log || [])) {
		const k = e.t + ":" + e.num;
		if (!seen[k]) { seen[k] = true; merged.push(e); }
	}
	merged.sort((a, b) => b.t - a.t);
	m.log = merged.slice(0, RG_LOG_CAP);
	
	for (const k in mine.kickCount) {
		const a = Number(m.kickCount[k]) || 0;
		const b = Number(mine.kickCount[k]) || 0;
		m.kickCount[k] = a > b ? a : b;
	}
	return m;
}

 

const RGState = {
	mod: null,
	suspects: new Map(),  
};

 
function RGIsAdmin() {
	try {
		return typeof ChatRoomPlayerIsAdmin === "function" && ChatRoomPlayerIsAdmin();
	} catch (e) { return false; }
}

 
function RGIsRelatedToRoom(num) {
	try {
		const members = [];
		if (typeof Player !== "undefined" && Player && Player.MemberNumber !== num) members.push(Player);
		if (typeof ChatRoomCharacter !== "undefined" && Array.isArray(ChatRoomCharacter)) {
			for (const c of ChatRoomCharacter) {
				if (c && c.MemberNumber !== num) members.push(c);
			}
		}
		for (const C of members) {
			try {
				if (typeof C.OwnerNumber === "function" && C.OwnerNumber() === num) return true;
			} catch (e) {   }
			try {
				if (typeof C.GetLoversNumbers === "function") {
					const lovers = C.GetLoversNumbers(true);
					if (Array.isArray(lovers) && lovers.indexOf(num) >= 0) return true;
				}
			} catch (e) {   }
		}
	} catch (e) {   }
	return false;
}

 
function RGIsProtected(num) {
	try {
		const me = RGCurrentNum();
		if (me != null && num === me) return true;
		if (typeof ChatRoomData !== "undefined" && ChatRoomData) {
			if (Array.isArray(ChatRoomData.Admin) && ChatRoomData.Admin.includes(num)) return true;
			if (Array.isArray(ChatRoomData.Whitelist) && ChatRoomData.Whitelist.includes(num)) return true;
		}
		if (RGIsRelatedToRoom(num)) return true;
	} catch (e) {   }
	return false;
}

 
function RGColorKey(c) {
	if (c == null || c === "Default") return "default";
	return JSON.stringify(c);
}

 
function RGItemViewOf(C, group) {
	try {
		if (C && Array.isArray(C.Appearance)) {
			const it = C.Appearance.find(i => i && i.Asset && i.Asset.Group && i.Asset.Group.Name === group);
			if (it) {
				return {
					name: it.Asset ? it.Asset.Name : undefined,
					color: RGColorKey(it.Color),
					difficulty: (it.Difficulty != null && it.Asset && it.Asset.Difficulty != null) ? (it.Difficulty - it.Asset.Difficulty) : null,
				};
			}
		}
	} catch (e) {   }
	return null;
}

 
function RGItemViewFromData(item) {
	return {
		name: item.Name,
		color: RGColorKey(item.Color),
		difficulty: (item.Difficulty != null) ? item.Difficulty : null,
	};
}

 
function RGClassifyChange(before, after, group) {
	const oldName = before ? before.name : undefined;
	const newName = after ? after.name : undefined;
	let change = "other";
	if (newName !== oldName) {
		if (newName == null) change = "remove";
		else if (oldName == null) change = "add";
		else change = "replace";
	} else if (before && after) {
		if (before.color !== after.color) change = "color";
		else if (before.difficulty != null && after.difficulty != null && before.difficulty !== after.difficulty) change = "tighten";
	}
	let kind = "clothes";
	if ((change === "add" || change === "replace") && newName != null) {
		try {
			if (typeof AssetGet === "function") {
				const a = AssetGet("Female3DCG", group, newName);
				if (a && a.IsRestraint) kind = "restraint";
			}
		} catch (e) {   }
	}
	return { kind, change };
}

 
function RGComputeConds(s) {
	const st = RGStore.state.settings;
	s.c1 = s.hasCreation && s.ageDays < st.minAgeDays;
	
	if (s.spoken) { s.c2 = false; s.c3 = false; }
	return s;
}

 
function RGTriggeredKeys(s) {
	const st = RGStore.state.settings;
	const keys = [];
	if (st.condAge && s.c1) keys.push("age");
	if (st.condClothes && !s.spoken && s.c2) keys.push("clothes");
	if (st.condRestraint && !s.spoken && s.c3) keys.push("restraint");
	return keys;
}

 
function RGCondsTrigger(s) {
	const st = RGStore.state.settings;
	const enabled = [];
	if (st.condAge) enabled.push(!!s.c1);
	if (st.condClothes) enabled.push(!s.spoken && !!s.c2);
	if (st.condRestraint) enabled.push(!s.spoken && !!s.c3);
	if (enabled.length === 0) return false;
	if (st.combine === "all") return enabled.every(Boolean);
	return enabled.some(Boolean);
}

 
function RGMaybeTrigger(s) {
	if (!s || s.kicked) return;
	if (!RGStore.state.settings.enabled) return;
	if (!RGIsAdmin()) return;
	RGComputeConds(s);
	if (RGCondsTrigger(s)) RGKickNow(s);
}

 
function RGDoAdmin(action, num) {
	if (!RGIsAdmin()) return false;
	try {
		ServerSend("ChatRoomAdmin", { MemberNumber: num, Action: action });
		return true;
	} catch (e) { RGErr("管理命令失败", action, num, e); return false; }
}

 
function RGKickNow(s) {
	if (s.kicked) return;
	s.kicked = true;
	RGState.suspects.delete(s.num);

	const keys = RGTriggeredKeys(s);
	const state = RGStore.state;
	const entry = {
		t: RGNow(),
		num: s.num,
		name: s.name || "",
		nick: s.nick || "",
		reason: keys.join(","),
		actions: s.actions.slice(0, RG_ACTION_CAP),
		banned: false,
	};

	state.log.unshift(entry);
	if (state.log.length > RG_LOG_CAP) state.log.length = RG_LOG_CAP;
	state.kickCount[s.num] = (Number(state.kickCount[s.num]) || 0) + 1;
	const kc = state.kickCount[s.num];

	const willBan = state.settings.banAfterKicks > 0 && kc >= state.settings.banAfterKicks;
	entry.banned = willBan;
	RGStore.save();

	
	if (willBan) RGDoAdmin("Ban", s.num);
	RGDoAdmin("Kick", s.num);

	const label = RGDisplayName(s.num);
	if (willBan) {
		RGToast(RGT("toastBanned", label, s.num));
	} else {
		RGToast(RGT("toastKicked", label, s.num, RGReasonLabel(entry.reason)));
	}
	RGUI.renderLog();
	RGUI.renderStatus();
}

 
function RGOnJoin(charData, sourceNum) {
	const num = (charData && Number.isInteger(charData.MemberNumber)) ? charData.MemberNumber : sourceNum;
	if (!Number.isInteger(num) || num < 1) return;
	if (!RGIsAdmin()) return;
	if (RGIsProtected(num)) return;
	if (!RGStore.state.settings.enabled) return;

	const creation = (charData && typeof charData.Creation === "number" && isFinite(charData.Creation) && charData.Creation > 0)
		? charData.Creation : null;
	const hasCreation = creation != null;
	const ageDays = hasCreation ? ((RGNow() - creation) / RG_DAY_MS) : null;

	const c = RGCharOf(num);
	const name = (charData && typeof charData.Name === "string") ? charData.Name : (c ? c.Name : "");
	const nick = (charData && typeof charData.Nickname === "string") ? charData.Nickname : (c ? c.Nickname : "");

	const s = {
		num, name: name || "", nick: nick || "",
		hasCreation, ageDays, joinedAt: RGNow(), spoken: false,
		c1: false, c2: false, c3: false, kicked: false, actions: [],
	};
	RGComputeConds(s);
	RGState.suspects.set(num, s);
	RGMaybeTrigger(s);
}

 
function RGOnMessage(data) {
	if (!data || typeof data.Sender !== "number") return;
	if (RG_SPEECH_TYPES.indexOf(data.Type) < 0) return;
	const s = RGState.suspects.get(data.Sender);
	if (!s) return;
	if (!s.spoken) {
		s.spoken = true;
		s.actions = []; 
	}
}

 
function RGOnItemChange(source, target, group, before, after) {
	const s = RGState.suspects.get(source);
	if (!s || s.kicked || s.spoken) return;
	if (source === target) return; 

	const cls = RGClassifyChange(before, after, group);
	const itemName = cls.change === "remove" ? (before ? before.name : null) : (after ? after.name : null);
	if (cls.kind === "restraint") s.c3 = true; else s.c2 = true;
	s.actions.push({ t: RGNow(), target, kind: cls.kind, change: cls.change, group, item: itemName || null });
	if (s.actions.length > RG_ACTION_CAP) s.actions.shift();
	RGMaybeTrigger(s);
}

 
function RGAppView(C) {
	const m = {};
	try {
		if (C && Array.isArray(C.Appearance)) {
			for (const it of C.Appearance) {
				if (it && it.Asset && it.Asset.Group) {
					const g = it.Asset.Group.Name;
					m[g] = {
						name: it.Asset.Name,
						color: RGColorKey(it.Color),
						difficulty: (it.Difficulty != null && it.Asset && it.Asset.Difficulty != null) ? (it.Difficulty - it.Asset.Difficulty) : null,
					};
				}
			}
		}
	} catch (e) {   }
	return m;
}

 
function RGOnFullChange(actor, victim, before, after) {
	const s = RGState.suspects.get(actor);
	if (!s || s.kicked || s.spoken) return;
	if (actor === victim) return;

	const groups = {};
	for (const g in before) groups[g] = true;
	for (const g in after) groups[g] = true;
	const changes = [];
	for (const g in groups) {
		const b = before[g] || null;
		const a = after[g] || null;
		if (JSON.stringify(b) !== JSON.stringify(a)) changes.push(g);
	}
	if (!changes.length) return;

	for (const g of changes) {
		const b = before[g] || null;
		const a = after[g] || null;
		const cls = RGClassifyChange(b, a, g);
		const itemName = cls.change === "remove" ? (b ? b.name : null) : (a ? a.name : null);
		if (cls.kind === "restraint") s.c3 = true; else s.c2 = true;
		s.actions.push({ t: RGNow(), target: victim, kind: cls.kind, change: cls.change, group: g, item: itemName || null });
		if (s.actions.length > RG_ACTION_CAP) s.actions.shift();
	}
	RGMaybeTrigger(s);
}

 

function RGInstallHooks(mod) {
	const safe = (fn) => (...args) => {
		try { return fn(...args); } catch (e) { RGErr(e); }
	};

	
	try {
		mod.hookFunction("ChatRoomSyncMemberJoin", 10, (args, next) => {
			const res = next(args);
			safe(() => {
				const data = args[0];
				if (data && data.Character) RGOnJoin(data.Character, data.SourceMemberNumber);
			})();
			return res;
		});
	} catch (e) { RGErr("hook ChatRoomSyncMemberJoin 失败", e); }

	
	try {
		mod.hookFunction("ChatRoomSyncMemberLeave", 10, (args, next) => {
			const res = next(args);
			safe(() => {
				const data = args[0];
				if (data && Number.isInteger(data.SourceMemberNumber)) RGState.suspects.delete(data.SourceMemberNumber);
			})();
			return res;
		});
	} catch (e) { RGErr("hook ChatRoomSyncMemberLeave 失败", e); }

	
	try {
		mod.hookFunction("ChatRoomMessage", 10, (args, next) => {
			const res = next(args);
			safe(() => RGOnMessage(args[0]))();
			return res;
		});
	} catch (e) { RGErr("hook ChatRoomMessage 失败", e); }

	
	
	try {
		mod.hookFunction("ChatRoomSyncItem", 10, (args, next) => {
			const data = args[0];
			let before = null;
			if (data && data.Item && Number.isInteger(data.Item.Target) && typeof data.Item.Group === "string") {
				const tc = RGCharOf(data.Item.Target);
				before = tc ? RGItemViewOf(tc, data.Item.Group) : null;
			}
			const res = next(args);
			safe(() => {
				if (data && data.Item && Number.isInteger(data.Source) && Number.isInteger(data.Item.Target)) {
					RGOnItemChange(data.Source, data.Item.Target, data.Item.Group, before, RGItemViewFromData(data.Item));
				}
			})();
			return res;
		});
	} catch (e) { RGErr("hook ChatRoomSyncItem 失败", e); }

	
	try {
		mod.hookFunction("CharacterOnlineRefresh", 10, (args, next) => {
			const Char = args[0];
			const actor = args[2];
			const watch = Number.isInteger(actor) && Char && Number.isInteger(Char.MemberNumber) && RGState.suspects.has(actor);
			const before = watch ? RGAppView(Char) : null;
			const res = next(args);
			safe(() => {
				if (!watch) return;
				const after = RGAppView(Char);
				RGOnFullChange(actor, Char.MemberNumber, before, after);
			})();
			return res;
		});
	} catch (e) { RGErr("hook CharacterOnlineRefresh 失败", e); }

	
	try {
		mod.hookFunction("ChatRoomLeave", 10, (args, next) => {
			const res = next(args);
			safe(() => { RGState.suspects.clear(); })();
			return res;
		});
	} catch (e) { RGErr("hook ChatRoomLeave 失败", e); }

	
	try {
		mod.hookFunction("ChatRoomSendChat", 10, (args, next) => {
			const input = typeof document !== "undefined" ? document.getElementById("InputChat") : null;
			const raw = input ? input.value : "";
			const t = (raw || "").trim().toLowerCase();
			if (t === "/roomguard" || t === "/rg" || t === "/守卫" || t === "/房管") {
				RGInputClear(input);
				safe(RoomGuardToggle)();
				return;
			}
			return next(args);
		});
	} catch (e) { RGErr("hook ChatRoomSendChat 失败", e); }
}

function RGInputClear(input) {
	if (!input) return;
	input.value = "";
	try {
		if (typeof InputEvent !== "undefined") input.dispatchEvent(new InputEvent("input", { bubbles: true }));
	} catch (e) {   }
}

 

const RGText = {
	zh: {
		title: "RoomGuard 房间守卫",
		cmd: "聊天室输入 /rg 或 /守卫 开关本窗",
		settingsHeader: "设置",
		enabled: "启用守卫",
		enabledTitle: "总开关：关闭后守卫不检查、不踢人（日志与设置仍可查看）",
		condAge: "账号年龄过小（加入不足设定天数）",
		condAgeTitle: "对方加入 Bondage Club 的时间不足设定天数即触发",
		condClothes: "未说话就改别人的衣服",
		condClothesTitle: "进房后一句话没说就开始改其他玩家的外观/服装即触发",
		condRestraint: "未说话就给别人上束缚道具",
		condRestraintTitle: "进房后一句话没说就开始给其他玩家穿戴束缚类道具即触发",
		minAgeDays: "账号年龄阈值（天）",
		minAgeDaysTitle: "对方账号创建至今不足此天数，视为「新号」",
		combine: "多条件逻辑",
		combineAny: "满足其一（任一条件成立即踢）",
		combineAll: "同时满足（全部勾选条件都成立才踢）",
		banAfterKicks: "自动拉黑阈值（踢出次数，0=关闭）",
		banAfterKicksTitle: "同一玩家被本守卫踢出达到此次数后，自动加入房间黑名单",
		statusAdmin: "● 你是房间管理员：守卫生效，会检查新加入的玩家",
		statusNotAdmin: "○ 你不是房间管理员：守卫不会踢人（仅可查看/修改设置与日志）",
		statusDisabled: "○ 守卫已关闭（主开关未启用）",
		logHeader: "踢出日志",
		logEmpty: "暂无记录",
		logCount: "共 {0} 条",
		reasonAge: "账号年龄过小",
		reasonClothes: "未说话即改衣服",
		reasonRestraint: "未说话即上束缚道具",
		kindClothes: "改衣服",
		kindRestraint: "上束缚道具",
		actionRemoved: "移除",
		changeAdd: "新增",
		changeRemove: "移除",
		changeReplace: "更换",
		changeColor: "改色",
		changeTighten: "松紧",
		changeOther: "其他",
		bannedBadge: "已拉黑",
		kickedCount: "累计踢出 {0} 次",
		expandAll: "展开全部 {0} 条",
		collapse: "收起",
		exportBtn: "导出日志",
		clearBtn: "清空日志",
		clearConfirm: "确认清空",
		langBtn: "EN",
		minimizeTitle: "最小化（再点标题栏恢复）",
		closeTitle: "关闭浮窗",
		resizeTitle: "拖动拉伸窗口",
		dotTitle: "RoomGuard 房间守卫",
		toastOpened: "RoomGuard 已打开：{0}",
		toastKicked: "已踢出 {0}（#{1}）：{2}",
		toastBanned: "已踢出并加入房间黑名单：{0}（#{1}）",
		toastCleared: "已清空全部踢出日志",
		toastExportClip: "日志已复制到剪贴板，并下载了备份文件",
		toastExportFile: "备份文件已下载（剪贴板不可用）",
		toastExportFail: "导出失败：{0}",
		toastNotAdmin: "你不是房间管理员，无法踢人",
		toastProtected: "跳过受保护玩家：{0}（管理员/白名单/自己）",
	},
	en: {
		title: "RoomGuard",
		cmd: "Type /rg or /roomguard in chat to toggle",
		settingsHeader: "Settings",
		enabled: "Enable guard",
		enabledTitle: "Master switch: when off, guard won't check or kick anyone",
		condAge: "Account too new (joined less than N days)",
		condAgeTitle: "Trigger when the player joined Bondage Club less than N days ago",
		condClothes: "Changed others' clothes without speaking",
		condClothesTitle: "Trigger when they modify another player's appearance/clothes before saying a word",
		condRestraint: "Applied restraints without speaking",
		condRestraintTitle: "Trigger when they put restraint items on another player before saying a word",
		minAgeDays: "Account age threshold (days)",
		minAgeDaysTitle: "Accounts younger than this many days count as 'new'",
		combine: "Combine logic",
		combineAny: "Any (trigger if ANY enabled condition is met)",
		combineAll: "All (trigger only if ALL enabled conditions are met)",
		banAfterKicks: "Auto-ban after kicks (0 = off)",
		banAfterKicksTitle: "After kicking the same player this many times, add them to the room ban list",
		statusAdmin: "● You are a room admin: guard is active for new joiners",
		statusNotAdmin: "○ You are not a room admin: guard won't kick (settings/log still viewable)",
		statusDisabled: "○ Guard is disabled (master switch off)",
		logHeader: "Kick log",
		logEmpty: "No records",
		logCount: "{0} entries",
		reasonAge: "Account too new",
		reasonClothes: "Changed clothes without speaking",
		reasonRestraint: "Applied restraints without speaking",
		kindClothes: "Clothes",
		kindRestraint: "Restraint",
		actionRemoved: "Removed",
		changeAdd: "Add",
		changeRemove: "Remove",
		changeReplace: "Replace",
		changeColor: "Color",
		changeTighten: "Tighten",
		changeOther: "Other",
		bannedBadge: "Banned",
		kickedCount: "Kicked {0} times total",
		expandAll: "Show all {0}",
		collapse: "Collapse",
		exportBtn: "Export log",
		clearBtn: "Clear log",
		clearConfirm: "Confirm clear",
		langBtn: "中文",
		minimizeTitle: "Minimize",
		closeTitle: "Close",
		resizeTitle: "Drag to resize",
		dotTitle: "RoomGuard",
		toastOpened: "RoomGuard opened: {0}",
		toastKicked: "Kicked {0} (#{1}): {2}",
		toastBanned: "Kicked and banned: {0} (#{1})",
		toastCleared: "Cleared the kick log",
		toastExportClip: "Log copied to clipboard and downloaded",
		toastExportFile: "Backup file downloaded (clipboard unavailable)",
		toastExportFail: "Export failed: {0}",
		toastNotAdmin: "You are not a room admin, cannot kick",
		toastProtected: "Skipped protected player: {0} (admin/whitelist/self)",
	},
};

 
function RGT(key, ...args) {
	const dict = RGText[RGUI.lang] || RGText.zh;
	let s = dict[key] != null ? dict[key] : (RGText.zh[key] != null ? RGText.zh[key] : key);
	for (let i = 0; i < args.length; i++) {
		s = s.split("{" + i + "}").join(String(args[i]));
	}
	return s;
}

 
function RGReasonLabel(reasonKeys) {
	const map = { age: "reasonAge", clothes: "reasonClothes", restraint: "reasonRestraint" };
	const parts = [];
	const keys = String(reasonKeys || "").split(",").filter(x => x);
	for (const k of keys) {
		if (map[k]) parts.push(RGT(map[k]));
	}
	return parts.length ? parts.join(" + ") : "";
}

 
function RGChangeLabel(change) {
	const map = { add: "changeAdd", remove: "changeRemove", replace: "changeReplace", color: "changeColor", tighten: "changeTighten", other: "changeOther" };
	return map[change] ? RGT(map[change]) : "";
}

 

const RGUI = {
	lang: "zh",
	open: false,
	win: null,
	titleEl: null,
	settingsEl: null,
	statusEl: null,
	logEl: null,
	dot: null,
	minimized: false,
	winDrag: null,
	resDrag: null,
	clearArmed: false,
	clearTimer: null,
	refreshTimer: null,
};

function RGEl(tag, cls, text) {
	const el = document.createElement(tag);
	if (cls) el.className = cls;
	if (text != null) el.textContent = text;
	return el;
}

 
function RGUIDotBuild() {
	if (RGUI.dot) return;
	const dot = RGEl("div", "rg-dot", "🛡");
	dot.title = RGT("dotTitle");
	dot.style.position = "fixed";
	dot.style.zIndex = "2147483000";
	dot.style.width = "44px";
	dot.style.height = "44px";
	dot.style.borderRadius = "50%";
	dot.style.background = "linear-gradient(135deg, #c0392b, #e74c3c)";
	dot.style.color = "#fff";
	dot.style.display = "flex";
	dot.style.alignItems = "center";
	dot.style.justifyContent = "center";
	dot.style.fontSize = "20px";
	dot.style.cursor = "pointer";
	dot.style.boxShadow = "0 2px 8px rgba(0,0,0,0.4)";
	dot.style.userSelect = "none";
	dot.style.right = "16px";
	dot.style.bottom = "16px";

	let saved = null;
	try {
		const key = RG_DOT_KEY + ":" + (RGStore.accountNum != null ? RGStore.accountNum : 0);
		saved = RGStorage.get(key);
		if (saved) {
			const p = JSON.parse(saved);
			if (p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y))) {
				dot.style.right = "auto"; dot.style.left = p.x + "px"; dot.style.top = p.y + "px";
			}
		}
	} catch (e) {   }

	let drag = null;
	dot.addEventListener("pointerdown", (ev) => {
		drag = { sx: ev.clientX, sy: ev.clientY, ox: dot.offsetLeft, oy: dot.offsetTop, moved: false };
		const move = (e) => {
			if (!drag) return;
			const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
			if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
			if (drag.moved) {
				dot.style.right = "auto";
				dot.style.left = (drag.ox + dx) + "px";
				dot.style.top = (drag.oy + dy) + "px";
			}
		};
		const up = () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			if (drag && drag.moved) {
				try {
					const key = RG_DOT_KEY + ":" + (RGStore.accountNum != null ? RGStore.accountNum : 0);
					RGStorage.set(key, JSON.stringify({ x: dot.offsetLeft, y: dot.offsetTop }));
				} catch (e) {   }
			}
			drag = null;
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
	});
	dot.addEventListener("click", () => {
		if (drag && drag.moved) return;
		RoomGuardToggle();
	});
	document.body.appendChild(dot);
	RGUI.dot = dot;
}

 
function RGUIBuild() {
	if (RGUI.win) return;

	const win = RGEl("div", "rg-win");
	win.style.position = "fixed";
	win.style.zIndex = "2147482999";
	win.style.background = "#ffffff";
	win.style.border = "3px solid #b0b0b0";
	win.style.borderRadius = "10px";
	win.style.boxShadow = "0 6px 24px rgba(0,0,0,0.35)";
	win.style.width = "440px";
	win.style.height = "560px";
	win.style.display = "flex";
	win.style.flexDirection = "column";
	win.style.overflow = "hidden";
	win.style.fontFamily = "sans-serif";
	win.style.fontSize = "14px";
	win.style.color = "#222";

	
	const bar = RGEl("div", "rg-bar");
	bar.style.display = "flex";
	bar.style.alignItems = "center";
	bar.style.background = "#333";
	bar.style.color = "#fff";
	bar.style.padding = "8px 10px";
	bar.style.cursor = "move";
	bar.style.userSelect = "none";

	const title = RGEl("span", "rg-title", RGT("title"));
	title.style.flex = "1";
	title.style.fontWeight = "bold";
	title.style.fontSize = "15px";

	const btnMin = RGEl("button", "rg-btn", "—");
	btnMin.title = RGT("minimizeTitle");
	const btnClose = RGEl("button", "rg-btn", "✕");
	btnClose.title = RGT("closeTitle");
	for (const b of [btnMin, btnClose]) {
		b.style.marginLeft = "6px";
		b.style.border = "none";
		b.style.background = "transparent";
		b.style.color = "#fff";
		b.style.fontSize = "16px";
		b.style.cursor = "pointer";
		b.style.padding = "2px 8px";
	}
	btnMin.addEventListener("click", () => { RGUI.minimized = !RGUI.minimized; RGUIRefresh(); });
	btnClose.addEventListener("click", RoomGuardClose);
	bar.appendChild(title);
	bar.appendChild(btnMin);
	bar.appendChild(btnClose);

	
	const toolbar = RGEl("div", "rg-toolbar");
	toolbar.style.display = "flex";
	toolbar.style.gap = "6px";
	toolbar.style.padding = "6px 10px";
	toolbar.style.background = "#f4f4f4";
	toolbar.style.borderBottom = "1px solid #ddd";

	const btnLang = RGRenderBtn(RGT("langBtn"), () => {
		RGUI.lang = RGUI.lang === "zh" ? "en" : "zh";
		try { RGStorage.set(RG_LANG_KEY, RGUI.lang); } catch (e) {   }
		RGUI.titleEl.textContent = RGT("title");
		btnLang.textContent = RGT("langBtn");
		RGUI.dot.title = RGT("dotTitle");
		RGUIRefresh();
	});
	const btnExport = RGRenderBtn(RGT("exportBtn"), RGUIBackupExport);
	const btnClear = RGRenderBtn(RGT("clearBtn"), (ev) => RGUIArmClear(ev && ev.currentTarget ? ev.currentTarget : null));
	toolbar.appendChild(btnLang);
	toolbar.appendChild(btnExport);
	toolbar.appendChild(btnClear);

	
	const body = RGEl("div", "rg-body");
	body.style.flex = "1";
	body.style.overflow = "auto";
	body.style.padding = "10px";
	body.style.background = "#fff";

	const settings = RGEl("div", "rg-settings");
	const status = RGEl("div", "rg-status");
	status.style.margin = "10px 0";
	status.style.padding = "8px";
	status.style.borderRadius = "6px";
	status.style.background = "#f7f7f7";
	status.style.fontSize = "13px";

	const logHead = RGEl("div", "rg-loghead", RGT("logHeader"));
	logHead.style.fontWeight = "bold";
	logHead.style.marginTop = "4px";
	logHead.style.marginBottom = "6px";

	const log = RGEl("div", "rg-log");
	log.style.maxHeight = "220px";
	log.style.overflow = "auto";
	log.style.border = "1px solid #e0e0e0";
	log.style.borderRadius = "6px";
	log.style.padding = "6px";

	body.appendChild(settings);
	body.appendChild(status);
	body.appendChild(logHead);
	body.appendChild(log);

	
	const res = RGEl("div", "rg-resize", "");
	res.title = RGT("resizeTitle");
	res.style.position = "absolute";
	res.style.right = "0";
	res.style.bottom = "0";
	res.style.width = "18px";
	res.style.height = "18px";
	res.style.cursor = "se-resize";
	res.style.background = "linear-gradient(135deg, transparent 50%, #bbb 50%)";

	win.appendChild(bar);
	win.appendChild(toolbar);
	win.appendChild(body);
	win.appendChild(res);

	document.body.appendChild(win);

	RGUI.win = win;
	RGUI.titleEl = title;
	RGUI.settingsEl = settings;
	RGUI.statusEl = status;
	RGUI.logEl = log;

	RGUIBindDrag(bar, res);
	RGUIBuildSettings(settings);
	RGUIRestoreWinGeom();
}

 
function RGRenderBtn(text, onClick) {
	const b = RGEl("button", "rg-btn", text);
	b.style.padding = "6px 10px";
	b.style.border = "1px solid #ccc";
	b.style.borderRadius = "6px";
	b.style.background = "#fff";
	b.style.cursor = "pointer";
	b.style.fontSize = "13px";
	b.addEventListener("click", onClick);
	return b;
}

 
function RGUIBuildSettings(root) {
	root.innerHTML = "";
	const h = RGEl("div", "rg-sect", RGT("settingsHeader"));
	h.style.fontWeight = "bold";
	h.style.marginBottom = "8px";
	root.appendChild(h);

	
	root.appendChild(RGCheckboxRow("rg-set-enabled", RGT("enabled"), "change", (v) => {
		RGStore.state.settings.enabled = v;
		RGStore.save();
		RGUI.renderStatus();
	}));

	
	root.appendChild(RGCheckboxRow("rg-set-condAge", RGT("condAge"), "change", (v) => {
		RGStore.state.settings.condAge = v; RGStore.save(); RGUI.renderStatus();
	}));
	root.appendChild(RGCheckboxRow("rg-set-condClothes", RGT("condClothes"), "change", (v) => {
		RGStore.state.settings.condClothes = v; RGStore.save(); RGUI.renderStatus();
	}));
	root.appendChild(RGCheckboxRow("rg-set-condRestraint", RGT("condRestraint"), "change", (v) => {
		RGStore.state.settings.condRestraint = v; RGStore.save(); RGUI.renderStatus();
	}));

	
	root.appendChild(RGNumberRow("rg-set-minAgeDays", RGT("minAgeDays"), 1, 3650, (v) => {
		RGStore.state.settings.minAgeDays = v; RGStore.save();
	}));

	
	root.appendChild(RGRadioRow("rg-set-combine", RGT("combine"), [
		{ value: "any", label: RGT("combineAny") },
		{ value: "all", label: RGT("combineAll") },
	], (v) => { RGStore.state.settings.combine = v; RGStore.save(); }));

	
	root.appendChild(RGNumberRow("rg-set-banAfterKicks", RGT("banAfterKicks"), 0, 100, (v) => {
		RGStore.state.settings.banAfterKicks = v; RGStore.save();
	}));

	RGUI.renderSettings();
}

 
function RGCheckboxRow(id, label, evt, onChange) {
	const row = RGEl("label", "rg-row");
	row.style.display = "flex";
	row.style.alignItems = "center";
	row.style.gap = "8px";
	row.style.marginBottom = "7px";
	row.style.fontSize = "13px";
	row.style.cursor = "pointer";
	const cb = RGEl("input");
	cb.type = "checkbox";
	cb.id = id;
	cb.addEventListener(evt, () => onChange(cb.checked));
	const span = RGEl("span", null, label);
	row.appendChild(cb);
	row.appendChild(span);
	return row;
}

 
function RGNumberRow(id, label, min, max, onChange) {
	const row = RGEl("div", "rg-row");
	row.style.display = "flex";
	row.style.alignItems = "center";
	row.style.gap = "8px";
	row.style.marginBottom = "7px";
	row.style.fontSize = "13px";
	const span = RGEl("span", null, label);
	span.style.flex = "1";
	const inp = RGEl("input");
	inp.type = "number";
	inp.id = id;
	inp.min = String(min);
	inp.max = String(max);
	inp.style.width = "72px";
	inp.style.padding = "4px 6px";
	inp.style.border = "1px solid #ccc";
	inp.style.borderRadius = "5px";
	inp.addEventListener("change", () => {
		let v = Math.floor(Number(inp.value));
		if (!Number.isFinite(v)) v = min;
		if (v < min) v = min;
		if (v > max) v = max;
		inp.value = String(v);
		onChange(v);
	});
	row.appendChild(span);
	row.appendChild(inp);
	return row;
}

 
function RGRadioRow(name, label, options, onChange) {
	const row = RGEl("div", "rg-row");
	row.style.marginBottom = "7px";
	row.style.fontSize = "13px";
	const lbl = RGEl("div", null, label);
	lbl.style.fontWeight = "bold";
	lbl.style.marginBottom = "3px";
	row.appendChild(lbl);
	for (const o of options) {
		const opt = RGEl("label", "rg-opt");
		opt.style.display = "block";
		opt.style.margin = "2px 0 2px 8px";
		opt.style.cursor = "pointer";
		const r = RGEl("input");
		r.type = "radio";
		r.name = name;
		r.value = o.value;
		r.addEventListener("change", () => { if (r.checked) onChange(o.value); });
		opt.appendChild(r);
		opt.appendChild(RGEl("span", null, " " + o.label));
		row.appendChild(opt);
	}
	return row;
}

 
function RGUIBindDrag(bar, res) {
	
	bar.addEventListener("pointerdown", (ev) => {
		if (ev.target && (ev.target.tagName === "BUTTON")) return;
		RGUI.winDrag = { sx: ev.clientX, sy: ev.clientY, ox: RGUI.win.offsetLeft, oy: RGUI.win.offsetTop };
		const move = (e) => {
			if (!RGUI.winDrag) return;
			RGUI.win.style.left = (RGUI.winDrag.ox + e.clientX - RGUI.winDrag.sx) + "px";
			RGUI.win.style.top = (RGUI.winDrag.oy + e.clientY - RGUI.winDrag.sy) + "px";
		};
		const up = () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			RGUI.winDrag = null;
			RGUISaveWinGeom();
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
	});
	
	res.addEventListener("pointerdown", (ev) => {
		ev.preventDefault();
		ev.stopPropagation();
		RGUI.resDrag = { sx: ev.clientX, sy: ev.clientY, ow: RGUI.win.offsetWidth, oh: RGUI.win.offsetHeight };
		const move = (e) => {
			if (!RGUI.resDrag) return;
			let w = RGUI.resDrag.ow + e.clientX - RGUI.resDrag.sx;
			let h = RGUI.resDrag.oh + e.clientY - RGUI.resDrag.sy;
			if (w < RG_MIN_WIN_W) w = RG_MIN_WIN_W;
			if (h < RG_MIN_WIN_H) h = RG_MIN_WIN_H;
			RGUI.win.style.width = w + "px";
			RGUI.win.style.height = h + "px";
		};
		const up = () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			RGUI.resDrag = null;
			RGUISaveWinGeom();
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
	});
}

function RGUIRestoreWinGeom() {
	try {
		const key = RG_WIN_KEY + ":" + (RGStore.accountNum != null ? RGStore.accountNum : 0);
		const raw = RGStorage.get(key);
		if (raw) {
			const g = JSON.parse(raw);
			if (g && Number.isFinite(Number(g.w)) && Number.isFinite(Number(g.h)) && Number.isFinite(Number(g.x)) && Number.isFinite(Number(g.y))) {
				RGUI.win.style.width = g.w + "px";
				RGUI.win.style.height = g.h + "px";
				RGUI.win.style.left = g.x + "px";
				RGUI.win.style.top = g.y + "px";
			}
		}
	} catch (e) {   }
}

function RGUISaveWinGeom() {
	try {
		const key = RG_WIN_KEY + ":" + (RGStore.accountNum != null ? RGStore.accountNum : 0);
		RGStorage.set(key, JSON.stringify({ x: RGUI.win.offsetLeft, y: RGUI.win.offsetTop, w: RGUI.win.offsetWidth, h: RGUI.win.offsetHeight }));
	} catch (e) {   }
}

 
RGUI.renderSettings = function () {
	const s = RGStore.state.settings;
	const get = (id) => this.settingsEl ? this.settingsEl.querySelector("#" + id) : null;
	const cb = get("rg-set-enabled"); if (cb) cb.checked = !!s.enabled;
	const ca = get("rg-set-condAge"); if (ca) ca.checked = !!s.condAge;
	const cc = get("rg-set-condClothes"); if (cc) cc.checked = !!s.condClothes;
	const cr = get("rg-set-condRestraint"); if (cr) cr.checked = !!s.condRestraint;
	const md = get("rg-set-minAgeDays"); if (md) md.value = String(s.minAgeDays);
	const bk = get("rg-set-banAfterKicks"); if (bk) bk.value = String(s.banAfterKicks);
	const radios = this.settingsEl ? this.settingsEl.querySelectorAll("input[name=rg-set-combine]") : [];
	for (const r of radios) { r.checked = r.value === s.combine; }
};

 
RGUI.renderStatus = function () {
	if (!this.statusEl) return;
	const s = RGStore.state.settings;
	if (!s.enabled) { this.statusEl.textContent = RGT("statusDisabled"); }
	else if (RGIsAdmin()) { this.statusEl.textContent = RGT("statusAdmin"); }
	else { this.statusEl.textContent = RGT("statusNotAdmin"); }
};

 
RGUI.renderLog = function () {
	if (!this.logEl) return;
	const state = RGStore.state;
	if (!state.log.length) {
		this.logEl.textContent = RGT("logEmpty");
		return;
	}
	this.logEl.innerHTML = "";
	for (let i = 0; i < state.log.length; i++) {
		this.logEl.appendChild(RGLogEntryEl(state.log[i], i));
	}
};

 
function RGLogEntryEl(e, idx) {
	const wrap = RGEl("div", "rg-logentry");
	wrap.style.borderBottom = "1px solid #eee";
	wrap.style.padding = "6px 2px";
	wrap.style.fontSize = "12.5px";

	const head = RGEl("div");
	head.style.display = "flex";
	head.style.flexWrap = "wrap";
	head.style.gap = "6px";
	head.style.alignItems = "center";

	const time = RGEl("span", null, RGFormatTime(e.t));
	time.style.color = "#888";
	const who = RGEl("span", null, RGDispWho(e));
	who.style.fontWeight = "bold";
	const reason = RGEl("span", null, RGReasonLabel(e.reason));
	reason.style.background = "#fdecea";
	reason.style.color = "#c0392b";
	reason.style.padding = "1px 6px";
	reason.style.borderRadius = "4px";
	head.appendChild(time);
	head.appendChild(who);
	head.appendChild(reason);
	if (e.banned) {
		const b = RGEl("span", null, RGT("bannedBadge"));
		b.style.background = "#c0392b"; b.style.color = "#fff"; b.style.padding = "1px 6px"; b.style.borderRadius = "4px";
		head.appendChild(b);
	}
	const kc = Number(RGStore.state.kickCount[e.num]) || 0;
	if (kc > 0) {
		const k = RGEl("span", null, RGT("kickedCount", kc));
		k.style.color = "#888";
		head.appendChild(k);
	}
	wrap.appendChild(head);

	const actions = Array.isArray(e.actions) ? e.actions : [];
	const showMax = 3;
	const collapsed = actions.length > showMax;
	const shown = collapsed ? actions.slice(0, showMax) : actions;
	const list = RGEl("div");
	list.style.marginTop = "3px";
	list.style.paddingLeft = "8px";
	for (const a of shown) list.appendChild(RGLogActionEl(a));
	wrap.appendChild(list);

	if (collapsed) {
		const more = RGEl("button", "rg-more", RGT("expandAll", actions.length));
		more.style.marginTop = "3px";
		more.style.marginLeft = "8px";
		more.style.border = "none";
		more.style.background = "transparent";
		more.style.color = "#2277cc";
		more.style.cursor = "pointer";
		more.style.fontSize = "12px";
		more.style.padding = "0";
		more.addEventListener("click", () => {
			const expanded = list.getAttribute("data-expanded") === "1";
			if (expanded) {
				list.innerHTML = "";
				for (const a of actions.slice(0, showMax)) list.appendChild(RGLogActionEl(a));
				list.setAttribute("data-expanded", "0");
				more.textContent = RGT("expandAll", actions.length);
			} else {
				list.innerHTML = "";
				for (const a of actions) list.appendChild(RGLogActionEl(a));
				list.setAttribute("data-expanded", "1");
				more.textContent = RGT("collapse");
			}
		});
		wrap.appendChild(more);
	}
	return wrap;
}

 
function RGLogActionEl(a) {
	const line = RGEl("div");
	line.style.margin = "1px 0";
	const target = RGEl("span", null, RGDisplayName(a.target));
	target.style.fontWeight = "bold";
	const kind = a.kind === "restraint" ? RGT("kindRestraint") : RGT("kindClothes");
	const change = RGChangeLabel(a.change);
	const groupLabel = RGGroupLabel(a.group);
	const itemLabel = a.item ? RGItemLabel(a.group, a.item) : "";
	let detail = kind;
	if (change) detail += "·" + change;
	line.appendChild(target);
	line.appendChild(RGEl("span", null, " " + detail + "：" + groupLabel + (itemLabel ? " " + itemLabel : "")));
	return line;
}

 
function RGFormatTime(t) {
	try {
		const d = new Date(t);
		const p = (n) => (n < 10 ? "0" + n : "" + n);
		return p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
	} catch (e) { return ""; }
}

 
function RGDispWho(e) {
	const parts = [];
	if (e.nick) parts.push(e.nick);
	if (e.name && e.name !== e.nick) parts.push(e.name);
	parts.push("#" + e.num);
	return parts.join(" ");
}

 
function RGUIRefresh() {
	if (!RGUI.win) return;
	if (RGUI.minimized) {
		for (const c of RGUI.win.children) {
			if (c !== RGUI.win.firstChild) c.style.display = "none";
		}
		return;
	}
	for (const c of RGUI.win.children) c.style.display = "";
	RGUI.renderSettings();
	RGUI.renderStatus();
	RGUI.renderLog();
}

 
function RoomGuardOpen() {
	RGStore.load();
	RGUIBuild();
	RGUI.open = true;
	RGUI.minimized = false;
	RGUI.win.style.display = "flex";
	RGUIRefresh();
	RGToast(RGT("toastOpened", RGIsAdmin() ? RGT("statusAdmin") : RGT("statusNotAdmin")));
	RGUI.refreshTimer = setInterval(() => {
		if (!RGUI.open) return;
		RGUI.renderStatus();
		RGUI.renderLog();
	}, 1500);
}

 
function RoomGuardClose() {
	RGUI.open = false;
	if (RGUI.win) RGUI.win.style.display = "none";
	if (RGUI.refreshTimer) { clearInterval(RGUI.refreshTimer); RGUI.refreshTimer = null; }
	if (RGUI.clearTimer) { clearTimeout(RGUI.clearTimer); RGUI.clearTimer = null; }
	RGUI.clearArmed = false;
}

function RoomGuardToggle() {
	if (RGUI.open) RoomGuardClose(); else RoomGuardOpen();
}

 
function RGUIArmClear(btn) {
	if (!RGUI.clearArmed) {
		RGUI.clearArmed = true;
		if (btn) { btn.textContent = RGT("clearConfirm"); btn.style.background = "#e74c3c"; btn.style.color = "#fff"; }
		RGUI.clearTimer = setTimeout(() => {
			RGUI.clearArmed = false;
			if (btn) { btn.textContent = RGT("clearBtn"); btn.style.background = ""; btn.style.color = ""; }
		}, 3000);
		return;
	}
	RGUI.clearArmed = false;
	if (RGUI.clearTimer) { clearTimeout(RGUI.clearTimer); RGUI.clearTimer = null; }
	if (btn) { btn.textContent = RGT("clearBtn"); btn.style.background = ""; btn.style.color = ""; }
	RGStore.state.log = [];
	RGStore.save();
	RGUI.renderLog();
	RGToast(RGT("toastCleared"));
}

 
function RGUIBackupExport() {
	const data = {
		mod: "RoomGuard",
		version: RG_VERSION,
		exportedAt: RGNow(),
		account: RGStore.accountNum,
		settings: RGStore.state.settings,
		log: RGStore.state.log,
	};
	const json = JSON.stringify(data, null, 2);
	let clipOk = false;
	try {
		if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(json);
			clipOk = true;
		}
	} catch (e) {   }
	try {
		const blob = new Blob([json], { type: "text/plain;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "RoomGuard-log-" + RGDateStamp() + ".txt";
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	} catch (e) { RGErr("导出下载失败", e); }
	RGToast(clipOk ? RGT("toastExportClip") : RGT("toastExportFile"));
}

function RGDateStamp() {
	const d = new Date();
	const p = (n) => (n < 10 ? "0" + n : "" + n);
	return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
}

 
let RGToastEl = null;
function RGToast(msg) {
	try {
		if (!RGToastEl) {
			RGToastEl = RGEl("div", "rg-toast");
			RGToastEl.style.position = "fixed";
			RGToastEl.style.left = "50%";
			RGToastEl.style.bottom = "60px";
			RGToastEl.style.transform = "translateX(-50%)";
			RGToastEl.style.background = "rgba(0,0,0,0.82)";
			RGToastEl.style.color = "#fff";
			RGToastEl.style.padding = "8px 14px";
			RGToastEl.style.borderRadius = "8px";
			RGToastEl.style.fontSize = "13px";
			RGToastEl.style.zIndex = "2147483100";
			RGToastEl.style.maxWidth = "80%";
			document.body.appendChild(RGToastEl);
		}
		RGToastEl.textContent = msg;
		RGToastEl.style.display = "block";
		if (RGToastEl._t) clearTimeout(RGToastEl._t);
		RGToastEl._t = setTimeout(() => { RGToastEl.style.display = "none"; }, 4000);
	} catch (e) {   }
}

 
function RGKeyHandler(ev) {
	if (ev.key !== "Escape") return;
	if (!RGUI.open) return;
	const ae = typeof document !== "undefined" ? document.activeElement : null;
	if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) return;
	RoomGuardClose();
}

 

function RGExposeAPI() {
	const g = (typeof globalThis !== "undefined") ? globalThis : (typeof window !== "undefined" ? window : null);
	if (!g) return;
	g.RoomGuardOpen = RoomGuardOpen;
	g.RoomGuardClose = RoomGuardClose;
	g.RoomGuardToggle = RoomGuardToggle;
	g.RoomGuard = {
		Open: RoomGuardOpen,
		Close: RoomGuardClose,
		Toggle: RoomGuardToggle,
		IsOpen: () => RGUI.open,
		IsAdmin: RGIsAdmin,
		State: () => RGStore.load(),
		Settings: () => RGStore.state.settings,
		Log: () => RGStore.state.log,
		Suspects: () => {
			const out = [];
			RGState.suspects.forEach((s, num) => {
				out.push({ num, name: s.name, nick: s.nick, ageDays: s.ageDays, spoken: s.spoken, c1: s.c1, c2: s.c2, c3: s.c3, actions: s.actions.length });
			});
			return out;
		},
		Kick: (num) => {
			if (!Number.isInteger(num) || num < 1) return false;
			if (RGIsProtected(num)) return false;
			if (!RGIsAdmin()) { RGToast(RGT("toastNotAdmin")); return false; }
			return RGDoAdmin("Kick", num);
		},
		Ban: (num) => {
			if (!Number.isInteger(num) || num < 1) return false;
			if (RGIsProtected(num)) return false;
			if (!RGIsAdmin()) { RGToast(RGT("toastNotAdmin")); return false; }
			return RGDoAdmin("Ban", num);
		},
		Export: () => JSON.stringify({ mod: "RoomGuard", version: RG_VERSION, exportedAt: RGNow(), account: RGStore.accountNum, settings: RGStore.state.settings, log: RGStore.state.log }),
		ClearLog: () => { RGStore.state.log = []; RGStore.save(); RGUI.renderLog(); return true; },
	};
}

function RGMain() {
	if (typeof window !== "undefined" && window.RoomGuardInstalled) {
		RGLog("已安装，跳过重复加载");
		return;
	}
	const tryRegister = (tries) => {
		if (typeof bcModSdk === "undefined" || !bcModSdk.registerMod) {
			if (tries > 600) { RGErr("等待 bcModSdk 超时（60 秒），mod 未能加载"); return; }
			setTimeout(() => tryRegister(tries + 1), 100);
			return;
		}
		try {
			const mod = bcModSdk.registerMod({
				name: "RoomGuard",
				fullName: "RoomGuard — 房间守卫",
				version: RG_VERSION,
				repository: "",
			}, { allowReplace: true });
			RGState.mod = mod;
			RGStore.load();
			RGUI.lang = RGStorage.get(RG_LANG_KEY) === "en" ? "en" : "zh";
			RGExposeAPI();
			RGInstallHooks(mod);
			if (typeof window !== "undefined") window.RoomGuardInstalled = true;
			try { RGUIDotBuild(); } catch (e) { RGErr("小圆点按钮构建失败", e); }
			if (typeof document !== "undefined") {
				document.addEventListener("keydown", RGKeyHandler);
			}
			RGLog("RoomGuard v" + RG_VERSION + " 已加载。聊天室输入 /rg 或 /守卫 开关浮窗；控制台可用 RoomGuardOpen() / window.RoomGuard");
		} catch (e) {
			RGErr("注册 mod 失败", e);
		}
	};
	tryRegister(0);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
	RGMain();
}

 
if (typeof module !== "undefined" && module.exports) {
	module.exports = {
		RGNow, RGStorage, RGStore, RGDefaultState, RGNormalizeState, RGMergeState,
		RGCurrentNum, RGCharOf, RGDisplayName, RGGroupLabel, RGItemLabel,
		RGState, RGIsAdmin, RGIsProtected, RGIsRelatedToRoom, RGComputeConds, RGTriggeredKeys, RGCondsTrigger,
		RGColorKey, RGItemViewOf, RGItemViewFromData, RGClassifyChange,
		RGOnJoin, RGOnMessage, RGOnItemChange, RGAppView, RGOnFullChange,
		RGKickNow, RGDoAdmin, RGMaybeTrigger,
		RGInstallHooks, RGText, RGT, RGReasonLabel, RGChangeLabel,
		RGUI, RoomGuardOpen, RoomGuardClose, RoomGuardToggle, RGUIRefresh, RGUIBackupExport,
		RG_FORMAT: { RGFormatTime, RGDispWho, RGLogEntryEl, RGLogActionEl },
	};
}

})();

