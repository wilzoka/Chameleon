const application = require('./application')
	, fs = require('fs-extra')
	, db = require('../models')
	, moment = require('moment')
	;

const ignoredFiles = ['index.js', 'application.js', 'schedule.js', 'messenger.js'];

module.exports = function (app) {

	app.use(async (req, res, next) => {
		req.activity = await db.getModel('activity').create({
			datetime: moment()
			, request: JSON.stringify({
				method: req.method
				, body: req.body
				, query: req.query
			})
			, path: req.path
			, host: req.headers['x-real-ip'] || req.ip || null
			, iduser: req.user ? req.user.id : null
		});
		res.on('finish', function () {
			if (this.req.activity) {
				this.req.activity.statuscode = this.req.res.statusCode;
				this.req.activity.save();
			}
		});
		next();
	});

	fs.readdirSync(__dirname).map(file => {
		if (ignoredFiles.indexOf(file) >= 0)
			return;
		require('./' + file)(app);
	});

	app.get('/', (req, res) => {
		res.redirect('/login');
	});

	app.get('/home', application.IsAuthenticated, (req, res) => {
		application.render(res, __dirname + '/../views/home.html', {});
	});

	//catch 404
	app.use((req, res) => {
		application.notFound(res);
	});

}