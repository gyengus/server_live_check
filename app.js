global.getFormattedDate = function() {
	var time = new Date();
	var month = `${((time.getMonth() + 1) > 9 ? '' : '0')}${time.getMonth() + 1}`;
	var day = `${(time.getDate() > 9 ? '' : '0')}${time.getDate()}`;
	var hour = `${(time.getHours() > 9 ? '' : '0')}${time.getHours()}`;
	var minute = `${(time.getMinutes() > 9 ? '' : '0')}${time.getMinutes()}`;
	var second = `${(time.getSeconds() > 9 ? '' : '0')}${time.getSeconds()}`;
	return `${time.getFullYear()}-${month}-${day} ${hour}:${minute}:${second}`;
};

var fs = require('fs');
var http = require('http');
var url = require('url');

const params = url.parse(process.env.DATABASE_URL);
const auth = params.auth.split(':');

var knex = require('knex')({
	client: 'pg',
	connection: {
		user: auth[0],
		password: auth[1],
		host: params.hostname,
		port: params.port,
		database: params.pathname.split('/')[1]
	},
	pool: {min: 0, max: 2}
});
var work = 0;

console.log(`Checking server's availability...`);

var CONFIG = JSON.parse(fs.readFileSync('config.json', 'utf8'));

function checkWork() {
	if (work <= 0) {
		knex.destroy(function() {
			process.exit();
		});
	}
}

function searchLink(link, callback) {
	console.log('Searchlink ' + link);
	var sql = `select * from statuses where link like '${link}';`;
	knex.select().from('statuses').where('link', link).limit(1)
		.then(function(row) {
			if (row[0]) {
				callback(true, row[0]);
			} else {
				callback(false, false);
			}
		})
		.catch(function(error) {
			console.log(`SQL: ${sql}; ${error}`);
		});
}

function insertLink(link, laststate) {
	knex('statuses').insert({link: link, laststate: laststate})
		.then(function() {
			console.log(`Insertlink: ${link}`);
			work--;
			checkWork();
		})
		.catch(function(err) {
			console.log(`SQL: ${sql}; ${err}`);
			work--;
			checkWork();
		});
}

function saveLink(link, laststate) {
	knex('statuses').where('link', link).update({laststate: laststate})
		.then(function() {
			console.log(`State saved for link: ${link}, state: ${laststate}`);
			work--;
			checkWork();
		})
		.catch(function(err) {
			console.log(`SQL: ${sql}; ${err}`);
			work--;
			checkWork();
		});	
}

function sendNotification(server, online) {
	if (CONFIG.ifttt_maker_event_name && CONFIG.ifttt_maker_api_key) {
		sendNotificationIFTTT(server, online);
	} else if (CONFIG.pushbullet_access_token && CONFIG.pushbullet_email) {
		sendNotificationPushbullet(server, online);
	}
}

function sendNotificationIFTTT(server, online) {
	sendRequest(`http://maker.ifttt.com/trigger/${CONFIG.ifttt_maker_event_name}/with/key/${CONFIG.ifttt_maker_api_key}`,
				{'Content-Type': 'application/json'},
				`{"value1": "${getFormattedDate()} ${server} is ${(online ? 'online' : 'offline')}"}`,
				'GET');
}

function sendNotificationPushbullet(server, online) {
	sendRequest(`https://api.pushbullet.com/v2/pushes`,
				{'Content-Type': 'application/json', 'Access-Token': `${CONFIG.pushbullet_access_token}`},
				`{"email": "${CONFIG.pushbullet_email}", "title": "Server Live check", "body": "${getFormattedDate()} ${server} is ${(online ? 'online' : 'offline')}", "type": "note"}`,
				'POST');
}

function sendRequest(link, headers, body, method) {
	if (body.length) headers['Content-Length'] = body.length;
	var options = {
		hostname: url.parse(link).host,
		path: url.parse(link).pathname,
		port: (url.parse(link).port ? url.parse(link).port : (url.parse(link).protocol == 'https:' ? 443 : 80)),
		method: method,
		headers: headers
	}
	var req = http.request(options, (res) => {
		console.log(`Notification sent: ${server}, ${(online ? 'online' : 'offline')}`);
		res.on('end', () => {
			console.log(`Notification sent: ${server}, ${(online ? 'online' : 'offline')}`);
		});
	});
	req.on('error', (e) => {
		console.log(`Notification send error: ${e.message}`);
	});
	req.write(body);
	req.end();	
}

function checkServer(link) {
	console.log('Checkserver: ' + link);
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
				if (!lastdata.laststate) sendNotification(link, true);
				saveLink(link, 1);
			} else {
				insertLink(link, 1);
			}
		});
	});
	req.on('error', (e) => {
		searchLink(link, function(founded, lastdata) {
			if (founded) {
				if (lastdata.laststate) sendNotification(link, false);
				saveLink(link, 0);
			} else {
				insertLink(link, 0);
			}
		});
	});
	req.end();	
}

for (var i = 0; i < CONFIG.urls.length; i++) {
	work++;
	checkServer(CONFIG.urls[i]);
}
