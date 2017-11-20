$(function () {

    if (application.functions.getId() == 0) {

        application.jsfunction('plastrela.pcp.approducaotempo.__dataUltimoAp', { idapproducao: application.functions.getUrlParameter('parent') }, function (response) {
            if (response.success) {
                $('input[name="dataini"]').val(response.data);
            }
        });

        $('input[name="datafim"]').val(moment().format('DD/MM/YYYY HH:mm'));

    }

});