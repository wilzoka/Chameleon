$(function () {
    $('#form').find('button:submit').remove();

    $(document).on('app-datatable', function (e, table) {

        switch (table) {
            case 'tableview73':// Insumo

                $('button#' + table + '_insert').unbind().click(function (e) {
                    application.jsfunction('plastrela.pcp.apinsumo.__adicionarModal', {}, function (response) {
                        application.handlers.responseSuccess(response);
                    });
                });

                break;
            case 'tableview74':// Produção
                $('#' + table + '_insert').unbind().click(function (e) {
                    application.jsfunction('plastrela.pcp.approducao.__adicionar', { idoprecurso: application.functions.getId() }, function (response) {
                        application.handlers.responseSuccess(response);
                    });
                });
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
                                $modal.find('input[name="qtdreal"]').val(response.data.qtdreal);
                                $modal.find('input[name="qtd"]').focus().val(response.data.qtdreal);
                            } else {
                                $modal.find('input[name="idvolume"]').val('');
                                $modal.find('input[name="qtdreal"]').val('');
                                $modal.find('input[name="qtd"]').focus().val('');
                            }
                        });
                    }
                });
                $modal.find('input[name="qtd"]').keydown(function (e) {
                    if (e.keyCode == 13) {
                        $('button#apontar').trigger('click');
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
                            $modal.modal('hide');
                        }
                    });
                });

                break;
        }

    });

});