var fs = require('fs');
var http = require('http');
var url = require('url');

var CONFIG = JSON.parse(fs.readFileSync('config.json', 'utf8'));

global.getFormattedDate = function() {
	var time = new Date();
	var month = ((time.getMonth() + 1) > 9 ? '' : '0') + (time.getMonth() + 1);
	var day = (time.getDate() > 9 ? '' : '0') + time.getDate();
	var hour = (time.getHours() > 9 ? '' : '0') + time.getHours();
	var minute = (time.getMinutes() > 9 ? '' : '0') + time.getMinutes();
	var second = (time.getSeconds() > 9 ? '' : '0') + time.getSeconds();
	return time.getFullYear() + '-' + month + '-' + day + ' ' + hour + ':' + minute + ':' + second;
};

function sendNotification(server) {
	var postData = '{"value1": "' + server + '", "value2": "' + getFormattedDate() + '"}';
	var options = {
		hostname: 'maker.ifttt.com',
		path: '/trigger/serverOffline/with/key/cOkqzR_mQT5rQgdp5V4cTl',
		port: 80,
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
			'Content-Length': postData.length
		}
	}
	var req = http.request(options, (res) => {
		/*res.on('data', (chunk) => {
			//console.log('BODY: ' + chunk);
		});
		res.on('end', () => {
			//console.log('END');
		});*/
	});
	req.on('error', (e) => {
		console.log('Error: ' + e.message);
	});
	req.write(postData);
	req.end();	
	
}

function checkServer(link) {
	//console.log(JSON.stringify(url.parse(link)));
	var options = {
		hostname: url.parse(link).host,
		path: url.parse(link).pathname,
		port: (url.parse(link).port ? url.parse(link).port : (url.parse(link).protocol == 'https:' ? 443 : 80)),
		method: 'GET',
		headers: {
			'User-agent': 'Server live check'
		}
	}
	var req = http.request(options, (res) => {
		//console.log(link + ':' + options.port + ' Status: ' + res.statusCode);
		/*res.on('data', (chunk) => {
			//console.log('BODY: ' + chunk);
		});
		res.on('end', () => {
			//console.log('END');
		});*/
	});
	req.on('error', (e) => {
		console.log('Error: ' + link + ', ' + e.message);
		sendNotification(link);
	});
	req.end();	
}

for (var i = 0; i < CONFIG.urls.length; i++) {
	checkServer(CONFIG.urls[i]);
}
