$(function () {

    if (application.functions.getId() == 0) {

        application.jsfunction('plastrela.pcp.ap.js_dataUltimoAp', { idoprecurso: application.functions.getUrlParameter('parent') }, function (response) {
            if (response.success) {
                $('input[name="dataini"]').val(response.data);
            }
        });

        application.jsfunction('plastrela.pcp.ap.js_usuarioUltimoAp', {
            idoprecurso: application.functions.getUrlParameter('parent')
        }, function (response) {
            if (response.data.id) {
                var newOption = new Option(response.data.text, response.data.id, false, false);
                $('select[name="iduser"]').append(newOption).trigger('change');
            }
        });

        $('input[name="datafim"]').val(moment().format('DD/MM/YYYY HH:mm'));

        setTimeout(function () {
            $('select[name="idmotivoparada"').focus();
        }, 100);

    }

});