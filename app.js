// https://devcenter.heroku.com/articles/scheduler
// http://stackoverflow.com/questions/13345664/using-heroku-scheduler-with-node-js

global.getFormattedDate = function() {
	var time = new Date();
	var month = ((time.getMonth() + 1) > 9 ? '' : '0') + (time.getMonth() + 1);
	var day = (time.getDate() > 9 ? '' : '0') + time.getDate();
	var hour = (time.getHours() > 9 ? '' : '0') + time.getHours();
	var minute = (time.getMinutes() > 9 ? '' : '0') + time.getMinutes();
	var second = (time.getSeconds() > 9 ? '' : '0') + time.getSeconds();
	return time.getFullYear() + '-' + month + '-' + day + ' ' + hour + ':' + minute + ':' + second;
};

var fs = require('fs');
var http = require('http');
var url = require('url');
var pg = require('pg');

console.log('Checking server\'s availability...');

var CONFIG = JSON.parse(fs.readFileSync('config.json', 'utf8'));

var client = new pg.Client(process.env.DATABASE_URL);

client.connect(function(err) {
	if (err) {
		return console.log('DB connection error: ' + err);
	}
});

function searchLink(link, callback) {
	if (!client) return false;
	var sql = "select * from statuses where link like '" + link + "';";
	client.query(sql, function(err, result) {
		if (err) {
			console.log('SQL: ' + sql + '; ' + err);
		} else {
			if (result.rows[0]) {
				callback(true, result.rows[0]);
			} else {
				callback(false, false);
			}
		}
	});
}

function insertLink(link, laststate) {
	if (!client) return false;
	var sql = "insert into statuses (link, laststate) values ('" + link + "', " + laststate + ");";
	client.query(sql, function(err) {
		if (err) {
			console.log('SQL: ' + sql + '; ' + err);
		}
	});
}

function saveLink(link, laststate) {
	if (!client) return false;
	var sql = "update statuses set laststate = " + laststate + " where link = '" + link + "';";
	client.query(sql, function(err) {
		if (err) {
			console.log('SQL: ' + sql + '; ' + err);
		}
	});
	
}

function sendNotification(server, online) {
	var postData = '{"value1": "' + server + '", "value2": "' + getFormattedDate() + '"}';
	var path = '/trigger/serverOffline/with/key/' + CONFIG.ifttt_maker_api_key;
	if (online) path = '/trigger/serverOnline/with/key/' + CONFIG.ifttt_maker_api_key;

	var options = {
		hostname: 'maker.ifttt.com',
		path: path,
		port: 80,
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
			'Content-Length': postData.length
		}
	}
	var req = http.request(options, (res) => {
		res.on('end', () => {
			console.log('Notification sent: ' + server + ', ' + (online ? 'online' : 'offline'));
		});
	});
	req.on('error', (e) => {
		console.log('Notification send error: ' + e.message);
	});
	req.write(postData);
	req.end();	
	
}

function checkServer(link) {
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
		searchLink(link, function(megvan, lastdata) {
			if (megvan) {
				if (lastdata.laststate == 0) sendNotification(link, true);
				saveLink(link, 1);
			} else {
				insertLink(link, 1);
			}
		});
	});
	req.on('error', (e) => {
		searchLink(link, function(megvan, lastdata) {
			if (megvan) {
				if (lastdata.laststate == 1) sendNotification(link, false);
				saveLink(link, 0);
			} else {
				insertLink(link, 0);
			}
		});
		sendNotification(link, false);
	});
	req.end();	
}

for (var i = 0; i < CONFIG.urls.length; i++) {
	checkServer(CONFIG.urls[i]);
}
