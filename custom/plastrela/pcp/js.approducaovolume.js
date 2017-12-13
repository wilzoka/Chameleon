$(function () {

    if (application.functions.getId() == 0) {

        application.jsfunction('plastrela.pcp.ap.js_usuarioUltimoAp', {
            idapproducao: application.functions.getUrlParameter('parent')
        }, function (response) {
            var newOption = new Option(response.data.text, response.data.id, false, false);
            $modal.find('select[name="iduser"]').append(newOption).trigger('change');
        });
    }

});