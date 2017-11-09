$(function () {

    var $idtipoperda = $('select[name="idtipoperda"]');
    var $idetapacausa = $('select[name="idetapacausa"]');

    if ($idtipoperda.val()) {
        $idetapacausa.attr('data-where', 'id in (select idetapa from pcp_etapacausaperda where idtipoperda = ' + $idtipoperda.val() + ')');
    } else {
        $idetapacausa.attr('data-where', '1 != 1');
    }

    $idtipoperda.on('select2:select', function (e) {
        $idetapacausa.val(null).trigger("change");
        $idetapacausa.attr('data-where', 'id in (select idetapa from pcp_etapacausaperda where idtipoperda = ' + e.params.data.id + ')');
    });
    $idtipoperda.on('select2:unselecting', function (e) {
        $idetapacausa.val(null).trigger("change");
        $idetapacausa.attr('data-where', '1 != 1');
    });

});