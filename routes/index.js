const application = require('./application')
	, fs = require('fs-extra')
	;

module.exports = function (app) {

	fs.readdirSync(__dirname).filter(function (file) {
		return (file.indexOf('.') !== 0)
			&& (file !== 'index.js')
			&& (file !== 'application.js')
			&& (file !== 'schedule.js')
			&& (file !== 'messenger.js')
	}).forEach(function (file) {
		require('./' + file.substr(0, file.indexOf('.')))(app);
	});

	app.get('/', function (req, res) {
		res.redirect('/login');
	});

	app.get('/home', application.IsAuthenticated, function (req, res) {
		application.render(res, __dirname + '/../views/home.html', {});
	});

	//catch 404
	app.use(function (req, res) {
		application.notFound(res);
	});

}