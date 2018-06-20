$(function () {

    if (application.functions.getId() == 0) {

        application.jsfunction('plastrela.pcp.apclichemonttempo.js_ultimoapontamento', { idmontagem: application.functions.getUrlParameter('parent') }, function (response) {
            if (response.success) {
                if (response.datahoraini) {
                    $('input[name="datahoraini"]').val(response.datahoraini);
                    $('input[name="datahorafim"]').val(response.datahorafim);
                }
            }
        });

        setTimeout(function () {
            $('select[name="iduser"').focus();
        }, 100);

    }

});