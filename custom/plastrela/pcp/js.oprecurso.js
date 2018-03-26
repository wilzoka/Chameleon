$(function () {

    function customTable(table) {
        tables[table].page.len(-1);
        $('#' + table + '_wrapper').css('height', '350px');
        $('#' + table + '_paginate').remove();
    }

    if ($('input[name="etapa"]').val() == '70') {
        $('#col-insumo').removeClass('col-md-2').addClass('col-md-6');
        $('#col-producao').removeClass('col-md-4').addClass('col-md-6');
        $('#col-perda').addClass('hide');
        $('#col-parada').addClass('hide');
    }

    $(document).on('app-datatable', function (e, table) {


        $('button.btnfilter[data-table="' + table + '"]').remove();

        switch (table) {
            case 'tableviewapontamento_de_producao_-_insumo':// Insumo
                customTable(table);
                setTimeout(function () {
                    tables[table].column(0).order('desc');
                    tables[table].draw()
                }, 100);

                $('button#' + table + '_insert').unbind().click(function (e) {
                    application.jsfunction('plastrela.pcp.apinsumo.__adicionarModal', {}, function (response) {
                        application.handlers.responseSuccess(response);
                    });
                });

                break;
            case 'tableviewapontamento_de_producao_-_producao':// Produção
                customTable(table);
                setTimeout(function () {
                    tables[table].column(0).order('desc');
                    tables[table].draw()
                }, 100);

                $('#' + table + '_insert').unbind().click(function (e) {
                    application.jsfunction('plastrela.pcp.approducao.__adicionar', { idoprecurso: application.functions.getId() }, function (response) {
                        application.handlers.responseSuccess(response);
                    });
                });
                break;
            case 'tableviewapontamento_de_producao_-_perda':// Perda
                customTable(table);

                break;
            case 'tableviewapontamento_de_producao_-_parada':// Parada
                customTable(table);
                setTimeout(function () {
                    tables[table].column(0).order('desc');
                    tables[table].draw()
                }, 100);

                break;
            case 'tableviewapontamento_de_producao_-_sobra':// Sobra

                break;
            default:
                tables[table].draw();
                break;
        }

    });

    $(document).on('app-modal', function (e, modal) {
        var $modal = $('#' + modal.id);

        switch (modal.id) {
            case 'apinsumoAdicionarModal':

                application.jsfunction('plastrela.pcp.ap.js_usuarioUltimoAp', {
                    idoprecurso: application.functions.getId()
                }, function (response) {
                    if (response.data.id) {
                        var newOption = new Option(response.data.text, response.data.id, false, false);
                        $modal.find('select[name="iduser"]').append(newOption).trigger('change');
                    }
                });

                $modal.on('shown.bs.modal', function () {
                    $modal.find('input[name="codigodebarra"]').focus();
                });

                $modal.find('input[name="codigodebarra"]').keydown(function (e) {
                    if (e.keyCode == 13) {
                        application.jsfunction('plastrela.pcp.apinsumo.__pegarVolume', { codigodebarra: $(this).val() }, function (response) {
                            application.handlers.responseSuccess(response);
                            if (response.success) {
                                $modal.find('input[name="idvolume"]').val(response.data.id);
                                $modal.find('input[name="qtdreal"]').val(response.data.qtdreal);
                                $modal.find('input[name="produto"]').val(response.data.produto);
                                $modal.find('input[name="qtd"]').focus().val(response.data.qtdreal);
                            } else {
                                $modal.find('input[name="idvolume"]').val('');
                                $modal.find('input[name="qtdreal"]').val('');
                                $modal.find('input[name="produto"]').val('');
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

    application.jsfunction('plastrela.pcp.oprecurso.js_totalperda', {
        idoprecurso: application.functions.getId()
    }, function (response) {
        if (response.success) {
            $('#totalpesoperda').text(response.peso);
            $('#totalqtdperda').text(response.qtd);
        }
    });

});