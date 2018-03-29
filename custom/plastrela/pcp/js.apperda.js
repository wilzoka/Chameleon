$(function () {

    if (application.functions.getId() == 0) {

        application.jsfunction('plastrela.pcp.ap.js_usuarioUltimoAp', {
            idoprecurso: application.functions.getUrlParameter('parent')
        }, function (response) {
            if (response.data.id) {
                var newOption = new Option(response.data.text, response.data.id, false, false);
                $('select[name="iduser"]').append(newOption).trigger('change');
            }
        });

        $('input[name="datahora"]').val(moment().format('DD/MM/YYYY HH:mm'));

        setTimeout(function () {
            $('select[name="idtipoperda"').focus();
        }, 100);

    }

    var $idtipoperda = $('select[name="idtipoperda"]');
    var $idetapacausa = $('select[name="idetapacausa"]');

    if ($idtipoperda.val()) {
        $idetapacausa.attr('data-where', 'id in (select idetapa from pcp_etapacausaperda where idtipoperda = ' + $idtipoperda.val() + ')');
    } else {
        $idetapacausa.attr('data-where', '1 != 1');
    }

    $idtipoperda.on('select2:select', function (e) {
        $idetapacausa.val(null).trigger('change');
        $idetapacausa.attr('data-where', 'id in (select idetapa from pcp_etapacausaperda where idtipoperda = ' + e.params.data.id + ')');
    });
    $idtipoperda.on('select2:unselecting', function (e) {
        $idetapacausa.val(null).trigger('change');
        $idetapacausa.attr('data-where', '1 != 1');
    });

});