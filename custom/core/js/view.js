$(function () {

    var $idmodel = $('select[name="idmodel"]');
    var $type = $('select[name="type"]');
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

    $type.on('select2:select', function (e) {
        var obj = {};
        switch (e.params.data.text) {
            case 'Calendar':
                obj = {
                    attribute_title: ''
                    , attribute_start: ''
                    , attribute_end: ''
                    , attribute_bgcolor: ''
                    , slotDuration: '00:30:00'
                };
                break;
        }
        var html = '{\n';
        var first = true;
        for (var k in obj) {
            html += (first ? '' : ', ') + '"' + k + '": ' + JSON.stringify(obj[k]) + '\n ';
            first = false;
        }
        html += '}';
        $('textarea[name="add"]').html(html);
    });

});