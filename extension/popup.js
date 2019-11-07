// pre-wake bg
chrome.runtime.getBackgroundPage(function(){});

document.addEventListener('DOMContentLoaded', init);

function elementId(id) { return document.getElementById(id); }

function invokeBg(fn, arg) {
	var bg = chrome.extension.getBackgroundPage();
	if (!bg)
		invoke(fn, arg);
	else
		bg[fn](arg);
}

function init() {
	var bg = chrome.extension.getBackgroundPage();

	// wake up bg page
	if (!bg || !localStorage.initialized) {
		chrome.runtime.getBackgroundPage(init);
		return;
	}

	var tabContent = elementId('tabs-content'),
		recordList0 = elementId('record-list-0'),
		recordList1 = elementId('record-list-1'),
		settingPage = elementId('setting-page'),
		deleteBtn = elementId('delete-btn');

	if (chrome.extension.inIncognitoContext) {
		tabContent.style.display = 'block';
		recordList0.style.display = 'block';
		recordList1.style.display = 'none';
		settingPage.style.display = 'none';
		deleteBtn.style.display = 'block';

		let recentlyClosed = bg.incRecent,
			settings = bg.incSettings;

		if (recentlyClosed.length != 0)
			notNullResponse();
		else
			nullResponse('No records found!')

		bg.trimRecords();
		showRecord(recentlyClosed, 0);
		showRecord(bg.incHist, 1);

		let targetTabList = elementId('tabs-content').getElementsByTagName('span');

		for (let i = 0; i < targetTabList.length; i++) {
			targetTabList[i].addEventListener('click', function (event) {

				elementId('tab-bottom-slider').style.left = 150 * i + 'px';

				var tabLists = document.getElementsByClassName('tab-list');
				for (let list of tabLists)
					list.style.display = 'none';

				var currentTabList = tabLists[i];
				if (i < 2) {
					elementId('searchbar').style.display = 'table';
					if (currentTabList.getElementsByTagName('li').length == 0)
						nullResponse('No records found!');
					else {
						notNullResponse();
						currentTabList.style.display = 'block';
						currentTabList.scrollTop = 0;
					}
				}
				else {
					elementId('searchbar').style.display = 'none';
					tabLists[i].style.display = 'block';
				}
			});
		}

		let inputs = document.getElementsByTagName('input');

		for (let input of inputs) {
			if (settings && input.id in settings) {
				if (input.type == 'checkbox')
					input.checked = settings[input.id];
				else
					input.value = parseInt(settings[input.id]) || 0;
			} else if (input.type == 'checkbox')
				input.checked = input.id == "discard-leaving";
			else if (input.type == 'number')
				input.value = 0;
			if (input.id == 'search-text')
				input.addEventListener('input', filterRecord);
			else if (input.type == 'checkbox')
				input.addEventListener('change',
					e => invokeBg('updateSetting', {name: e.target.id, value: e.target.checked}));
			else
				input.addEventListener('change', e => {
					invokeBg('updateSetting', {name: e.target.id, value: e.target.value});
					invokeBg('trimRecords');
				});
		}

	} else {
		tabContent.style.display = 'none';
		recordList0.style.display = 'none';
		recordList1.style.display = 'none';
		deleteBtn.style.display = 'none';

		chrome.extension.isAllowedIncognitoAccess(function (response) {
			if (!response)
				nullResponse("This extension is for incognito mode only.<br>To allow the extension to work in incognito:<br>1. Open 'chrome://extensions/' window<br>2. Find 'Off The Record History' extension<br>3. Click on 'Details' button<br>4. Find and select the 'Allow in incognito' checkbox");
			else
				nullResponse('This extension is for incognito mode only.');
		});
	}


	deleteBtn.addEventListener('click', function (event) {
		bg.incRecent = [];
		bg.incHist = [];
		bg.tabs = {};

		recordList0.innerHTML = '';
		recordList1.innerHTML = '';
		nullResponse('All records were destroyed!');
	});

	function nullResponse(message) {
		elementId('searchbar').style.display = 'none';
		elementId('tab-response-content').style.display = 'block';
		elementId('response-text').innerHTML = message;
	}

	function notNullResponse() {
		elementId('tab-response-content').style.display = 'none';
		elementId('response-text').innerHTML = '';
	}

}

function filterRecord() {
}

function showRecord(record, recType) {
	var ul = elementId('record-list-' + recType),
		recordLength = record.length - 1;

	for (let i = recordLength; i >= 0; i--) {
		let li = document.createElement('li'),
			img = document.createElement('img');

		img.setAttribute('src', record[i].favIcon || 'default-favicon.ico');
		img.setAttribute('loading', 'lazy');
		img.setAttribute('width', '16px');
		img.setAttribute('height', '16px');
		li.appendChild(img);

		let a = document.createElement('a');
		a.setAttribute('href', record[i].url);
		a.setAttribute('title', record[i].url);
		a.addEventListener('click', recType ?
			() => chrome.tabs.create({url: record[i].url }) :
			() => invokeBg('reopenTab', JSON.stringify(record[i])));
		a.appendChild(document.createTextNode(record[i].title));
		li.appendChild(a);

		let span = document.createElement('span');
		let timestr = new Date(record[i].timestamp).toLocaleString(/*'default'*/'en-US',
				{ hour12: false, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
		span.appendChild(document.createTextNode(timestr));
		li.appendChild(span);
		ul.appendChild(li);
	}
}
