const application = require('./application')
	, fs = require('fs')
	;

module.exports = function (app) {

	fs.readdirSync(__dirname).filter(function (file) {
		return (file.indexOf('.') !== 0)
			&& (file !== 'index.js')
			&& (file !== 'application.js')
			&& (file !== 'schedule.js')
	}).forEach(function (file) {
		require('./' + file.substr(0, file.indexOf('.')))(app);
	});

	app.get('/', function (req, res) {
		return res.redirect('/login');
	});

	app.get('/home', application.IsAuthenticated, function (req, res) {
		return application.render(res, __dirname + '/../views/home.html', {});
	});

	//catch 404
	app.use(function (req, res) {
		return application.render(res, __dirname + '/../views/404.html', {});
	});

}