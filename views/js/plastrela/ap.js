$(function () {
    $('#form').find('button:submit, .btnreturn').remove();

    $(document).on('app-datatable', function (e, table) {

        switch (table) {
            case 'tableview73':// Insumo

                $('button#' + table + '_insert').unbind().click(function (e) {
                    application.jsfunction('plastrela.pcp.apinsumo.__adicionarModal', { id: application.functions.getId() }, function (response) {
                        application.handlers.responseSuccess(response);
                    });
                });

                break;
            case 'tableview74':// Produção
                $('#' + table + '_insert').remove();
                break;
        }


    });

    $(document).on('app-modal', function (e, modal) {

        switch (modal.id) {
            case 'apinsumoAdicionarModal':
                var $modal = $('#apinsumoAdicionarModal');

                $modal.find('input[name="codigodebarra"]').keydown(function (e) {
                    if (e.keyCode == 13) {
                        application.jsfunction('plastrela.pcp.apinsumo.__pegarVolume', { codigodebarra: $(this).val() }, function (response) {
                            application.handlers.responseSuccess(response);
                            if (response.success) {
                                $modal.find('input[name="idvolume"]').val(response.data.id);
                                $modal.find('input[name="qtddisponivel"]').val(response.data.qtddisponivel);
                                $modal.find('input[name="qtd"]').focus().val(response.data.qtddisponivel);
                            }
                        });
                    }
                });

                $('button#apontar').click(function () {
                    application.jsfunction('plastrela.pcp.apinsumo.__apontarVolume', {
                        idoprecurso: application.functions.getId()
                        , iduser: $modal.find('select[name="iduser"]').val()
                        , idvolume: $modal.find('input[name="idvolume"]').val()
                        , qtd: $modal.find('input[name="qtd"]').val()
                    }, function (response) {
                        application.handlers.responseSuccess(response);
                        if (response.success) {

                        }
                    });
                });

                break;
        }

    });

});