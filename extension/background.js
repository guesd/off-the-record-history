var tabs = JSON.parse(localStorage.tabs || '{}'),
	incHist = JSON.parse(localStorage.incHist || '[]'),
	incRecent = JSON.parse(localStorage.incRecent || '[]'),
	incSettings = JSON.parse(localStorage.incSettings || '{}'),
	excludeURLs = JSON.parse(localStorage.excludeURLs || '[]');

function permanentStore(obj) {
	if (!incSettings.permanent) {
		chrome.storage.local.getBytesInUse(null,
			b => { if (b > 0) chrome.storage.local.clear(); });
		return;
	}
	chrome.storage.local.set(obj || { tabs: tabs, incHist: incHist, incRecent: incRecent, incSettings: incSettings, excludeURLs: excludeURLs });
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

	permanentStore({incHist: incHist});

	if (recLength != incRecent.length)
		permanentStore({incRecent: incRecent});
}

function bgIncognito() {

	chrome.runtime.onSuspend.addListener(() => {
		localStorage.setItem('tabs', JSON.stringify(tabs));
		localStorage.setItem('incHist', JSON.stringify(incHist));
		localStorage.setItem('incRecent', JSON.stringify(incRecent));
		localStorage.setItem('incSettings', JSON.stringify(incSettings));
	});

	chrome.tabs.onUpdated.addListener((tabId, chg, tab) => {
		if (['chrome://newtab/', 'about:blank'].includes(tab.url))
			return;

		if (excludeURLs.some(x => new RegExp(x).test(tab.url)))
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
		else if (chg.status=='loading') {
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

		permanentStore({tabs: tabs});
		permanentStore({incHist: incHist});
	});

	chrome.tabs.onReplaced.addListener((newId, oldId) => {
		if (tabs[oldId]) {
			tabs[newId] = tabs[oldId];
			tabs[newId].id = newId;
			permanentStore({tabs: tabs});
		}
	});

	chrome.tabs.onRemoved.addListener(tab => {
		if (tabs[tab]) {
			incRecent.push(tabs[tab]);
			permanentStore({incRecent: incRecent});
		}
	});

	chrome.commands.onCommand.addListener(reopenTab);

	chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

		if (request.updateSettings) {
			updateLocalStorage();
			return;
		}

		if (request.reopenRecord) {
			return;
		}

	});

}

if (chrome.extension.inIncognitoContext) {
	if (!localStorage.initialized)
		chrome.storage.local.get(null, c => {
			tabs = c.tabs || {};
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
else
	chrome.commands.onCommand.addListener(() => chrome.sessions.restore());

