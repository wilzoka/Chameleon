$(function () {
    $('#form').find('button:submit').remove();

    function customTable(table) {
        tables[table].page.len(-1);
        $('#' + table + '_wrapper').css('height', '350px');
        $('#' + table + '_paginate').remove();
    }


    $(document).on('app-datatable', function (e, table) {


        $('button.btnfilter[data-table="' + table + '"]').remove();

        switch (table) {
            case 'tableview73':// Insumo
                customTable(table);
                setTimeout(function () {
                    tables['tableview73'].column(0).order('desc');
                    tables['tableview73'].draw()
                }, 100);

                $('button#' + table + '_insert').unbind().click(function (e) {
                    application.jsfunction('plastrela.pcp.apinsumo.__adicionarModal', {}, function (response) {
                        application.handlers.responseSuccess(response);
                    });
                });

                break;
            case 'tableview74':// Produção
                customTable(table);
                setTimeout(function () {
                    tables['tableview74'].column(0).order('desc');
                    tables['tableview74'].draw()
                }, 100);

                $('#' + table + '_insert').unbind().click(function (e) {
                    application.jsfunction('plastrela.pcp.approducao.__adicionar', { idoprecurso: application.functions.getId() }, function (response) {
                        application.handlers.responseSuccess(response);
                    });
                });
                break;
            case 'tableview51':// Perda
                customTable(table);

                break;
            case 'tableview52':// Parada
                customTable(table);
                setTimeout(function () {
                    tables['tableview52'].column(0).order('desc');
                    tables['tableview52'].draw()
                }, 100);

                break;
            case 'tableview77':// Sobra

                break;
            default:
                tables[table].draw();
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
                                $modal.find('input[name="qtd"]').val('');
                                $modal.find('input[name="codigodebarra"]').focus().val('');
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
                        , recipiente: $modal.find('input[name="recipiente"]').val()
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

    $('#sobra').click(function () {
        $('#modalsobra').modal('show');
    });
    $('#modalsobra').on('shown.bs.modal', function () {
        Cookies.set('modalsobra', true);
    });
    $('#modalsobra').on('hidden.bs.modal', function () {
        Cookies.remove('modalsobra');
    });
    if (Cookies.get('modalsobra')) {
        $('#modalsobra').modal('show');
    }

    $('#retorno').click(function () {
        $('#modalretorno').modal('show');
    });
    $('#modalretorno').on('shown.bs.modal', function () {
        Cookies.set('modalretorno', true);
    });
    $('#modalretorno').on('hidden.bs.modal', function () {
        Cookies.remove('modalretorno');
    });
    if (Cookies.get('modalretorno')) {
        $('#modalretorno').modal('show');
    }

    $('#encerrar').click(function () {
        application.functions.confirmMessage('Confirma o encerramento desta OP?', function () {
            application.jsfunction('plastrela.pcp.oprecurso.js_encerrar', {
                idoprecurso: application.functions.getId()
            }, function (response) {
                application.handlers.responseSuccess(response);
            });
        });
    });

});