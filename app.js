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
var knex = require('knex')({
	client: 'pg',
	connection: process.env.DATABASE_URL
})

console.log('Checking server\'s availability...');

var CONFIG = JSON.parse(fs.readFileSync('config.json', 'utf8'));

function searchLink(link, callback) {
	var sql = `select * from statuses where link like '${link}';`;
	knex.select().from('statuses').where('link', link).limit(1)
		.then(function(row) {
			//console.log(JSON.stringify(row));
			if (row[0]) {
				callback(true, row[0]);
			} else {
				callback(false, false);
			}
		})
		.catch(function(error) {
			console.log(`SQL: ${sql}; ${err}`);
		});
}

function insertLink(link, laststate) {
	knex('statuses').insert({link: link, laststate: laststate})
		.catch(function(err) {
			console.log(`SQL: ${sql}; ${err}`);
		});
}

function saveLink(link, laststate) {
	knex('statuses').where('link', link).update({laststate: laststate})
		/*.then(function() {
			console.log(`State saved for link: ${link}, state: ${laststate}`);
		})*/
		.catch(function(err) {
			console.log(`SQL: ${sql}; ${err}`);
		});	
}

function sendNotification(server, online) {
	var postData = `{"value1": "${server}", "value2": "${getFormattedDate()}"}`;
	var path = `/trigger/${(online ? 'serverOnline' : 'serverOffline')}/with/key/${CONFIG.ifttt_maker_api_key}`;

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
		console.log(`Notification sent: ${server}, ${(online ? 'online' : 'offline')}`);
		});
	});
	req.on('error', (e) => {
		console.log(`Notification send error: ${e.message}`);
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
		searchLink(link, function(founded, lastdata) {
			if (founded) {
				if (lastdata.laststate == 0) sendNotification(link, true);
				saveLink(link, 1);
			} else {
				insertLink(link, 1);
			}
		});
	});
	req.on('error', (e) => {
		searchLink(link, function(founded, lastdata) {
			if (founded) {
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
