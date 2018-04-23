$(function () {

    var $idmodel = $('select[name="idmodel"]');
    var $idfastsearch = $('select[name="idfastsearch"]');

    $idmodel.on('select2:select', function (e) {
        $idfastsearch.val(null).trigger('change');
        $idfastsearch.attr('data-where', 'idmodel = ' + e.params.data.id);
    });
    $idmodel.on('select2:unselecting', function (e) {
        $idfastsearch.val(null).trigger('change');
        $idfastsearch.attr('data-where', 'idmodel = 0');
    });

    $idfastsearch.attr('data-where', 'idmodel = ' + $idmodel.val() || 0);

});