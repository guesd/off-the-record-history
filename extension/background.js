var tabs = JSON.parse(localStorage.tabs || '{}'),
	incHist = JSON.parse(localStorage.incHist || '[]'),
	incRecent = JSON.parse(localStorage.incRecent || '[]'),
	incSettings = JSON.parse(localStorage.incSettings || '{}'),
	excludeURLs = JSON.parse(localStorage.excludeURLs || '[]');

function permanentStore(obj) {
	if (!incSettings.permanent) {
		if ('incSettings' in obj) {
			chrome.storage.local.get([incHist, incRecent], s => {
				if (s.incHist && s.incHist.length > 0)
					s.incHist = [];
				if (s.incRecent && s.incRecent.length > 0)
					s.incRecent = [];
				chrome.store.local.set(s);
			});
		}
		else if ('incHist' in obj || 'incRecent' in obj)
			return;
	}

	chrome.storage.local.set(obj || {
		incHist: incHist,
		incRecent: incSettings.permanent ? incRecent : [],
		incSettings: incSettings.permanent ? incSettings : [],
		excludeURLs: excludeURLs
	});
}

function reopenTab(tab) {
	let i = incRecent.findIndex((e) => JSON.stringify(e) == tab);
	if (i < 0)
		i = incRecent.length - 1;
	if (i >= 0) {
		let url = incRecent[i].url;
		if (!incSettings.pause){
			incRecent.splice(i, 1);
			permanentStore({incRecent: incRecent});
		}
		chrome.tabs.create({ url: url });
	}
}

function updateSetting(obj) {
	if (obj && obj.name && (!(name in incSettings) || incSettings[name] != obj.value)) {
		incSettings[obj.name] = obj.value;
		localStorage.incSettings = JSON.stringify(incSettings);
		permanentStore(obj.name == 'permanent' ? null : {incSettings: incSettings});
	}
}

function trimRecords() {

	if (incSettings.pause)
		return;

	var recLength = incRecent.length,
		maxItems = incSettings.maxItems || 0;
		maxDays = incSettings.maxDays || 0;

	// incHist may be out of order
	incHist.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

	if (maxDays > 0) {
		let expire = Date.now() - maxDays * (24*60*60*1000);

		let i = incRecent.findIndex(e => new Date(e.timestamp).getTime() > expire);
		if (i > 0)
			incRecent.splice(0, i);

		i = incHist.findIndex(e => new Date(e.timestamp).getTime() > expire);
		if (i > 0)
			incHist.splice(0, i);
	}

	if (maxItems > 0) {
		if (incRecent.length > maxItems)
			incRecent.splice(0, incRecent.length - maxItems);
		if (incHist.length > maxItems)
			incHist.splice(0, incHist.length - maxItems);
	}

	let sto = {incHist: incHist};
	if (recLength != incRecent.length)
		sto['incRecent'] = incRecent;
	permanentStore(sto);
}

function setExcludeURL(obj) {
	if (obj.index >= excludeURLs.length)
		if (obj.url != '')
			excludeURLs.push(obj.url);
		else
			return;
	else if (obj.url != '')
		excludeURLs[obj.index] = obj.url;
	else
		excludeURLs.splice(obj.index, 1);
	permanentStore({excludeURLs: excludeURLs});
}

function bgIncognito() {

	chrome.runtime.onSuspend.addListener(() => {
		localStorage.setItem('tabs', JSON.stringify(tabs));
		localStorage.setItem('incHist', JSON.stringify(incHist));
		localStorage.setItem('incRecent', JSON.stringify(incRecent));
		localStorage.setItem('incSettings', JSON.stringify(incSettings));
		localStorage.setItem('excludeURLs', JSON.stringify(excludeURLs));
	});

	chrome.tabs.onUpdated.addListener((tabId, chg, tab) => {
		if (incSettings.pause ||
				['chrome://newtab/', 'about:blank'].includes(tab.url) ||
				excludeURLs.some(x => new RegExp(x).test(tab.url)))
			return;

		var t = tabs[tabId];
		if (!t)
			incHist.push(tabs[tabId] = {
				id: tabId,
				url: tab.url,
				title: tab.title,
				favIcon: tab.favIconUrl,
				timestamp: Date()
			});
		else if (chg.status == 'loading') {
			let nt = {
				id: tabId,
				url: tab.url,
				title: tab.title,
				favIcon: tab.favIconUrl,
				timestamp: Date()
			};
			if (t.url != nt.url) {
				tabs[tabId] = nt;
				incHist.push(nt);
			}
			else {
				let i = incHist.findIndex((e) => e.id == tabId && e.url == tab.url);
				if (i >= 0)
					incHist[i] = nt;
			}
		}
		else if ((chg.status == 'complete') || chg.title || chg.favIconUrl) {
			t.title = tab.title;
			if (tab.favIconUrl)
				t.favIcon = tab.favIconUrl;
		}
		else
			return;

		permanentStore({incHist: incHist});
	});

	chrome.tabs.onReplaced.addListener((newId, oldId) => {
		if (!incSettings.pause && tabs[oldId]) {
			tabs[newId] = tabs[oldId];
			tabs[newId].id = newId;
		}
	});

	chrome.tabs.onRemoved.addListener(tab => {
		if (!incSettings.pause && tabs[tab]) {
			incRecent.push(tabs[tab]);
			permanentStore({incRecent: incRecent});
		}
		if (tabs[tab])
			delete tabs[tab];
	});

	chrome.commands.onCommand.addListener(reopenTab);

	chrome.tabs.query({}, allTabs => {
		var newTabs = {};
		allTabs.forEach((t) => {
			if (t.id in tabs)
				newTabs[t.id] = tabs[t.id];
		});
		tabs = newTabs;
	});
}

if (chrome.extension.inIncognitoContext) {
	if (!localStorage.initialized)
		chrome.storage.local.get(null, c => {
			incHist = c.incHist || [];
			incRecent = c.incRecent || [];
			incSettings = c.incSettings || {};
			excludeURLs = c.excludeURLs || [];
			localStorage.initialized = true;
			bgIncognito();
		});
	else
		bgIncognito();
}
else {
	chrome.commands.onCommand.addListener(() => chrome.sessions.restore());
	setInterval(window.close, 5000);
}

