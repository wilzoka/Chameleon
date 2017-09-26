var application = require('./application')
	, fs = require('fs')
	;

module.exports = function (app) {

	fs.readdirSync(__dirname).filter(function (file) {
		return (file.indexOf('.') !== 0)
			&& (file !== 'index.js')
			&& (file !== 'application.js')
			&& (file !== 'schedule.js');
	}).forEach(function (file) {
		var name = file.substr(0, file.indexOf('.'));
		require('./' + name)(app);
	});

	app.get('/', function (req, res) {
		return res.redirect('/login');
	});

	app.get('/home', application.IsAuthenticated, function (req, res) {
		return res.render('home.ejs');
	});

}