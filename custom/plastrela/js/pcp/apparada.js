$(function () {

    if (application.functions.getId() == 0) {

        application.jsfunction('plastrela.pcp.apparada.__dataUltimoAp', { idoprecurso: application.functions.getUrlParameter('parent') }, function (response) {
            if (response.success) {
                $('input[name="dataini"]').val(response.data);
            }
        });

        $('input[name="datafim"]').val(moment().format('DD/MM/YYYY HH:mm'));

    }

});