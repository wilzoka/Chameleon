$(function () {

    if (application.functions.getId() == 0) {

        application.jsfunction('plastrela.pcp.ap.js_usuarioUltimoAp', {
            idapproducao: application.functions.getUrlParameter('parent')
        }, function (response) {
            if (response.data.id) {
                var newOption = new Option(response.data.text, response.data.id, false, false);
                $('select[name="iduser"]').append(newOption).trigger('change');
            }
        });
    }

});