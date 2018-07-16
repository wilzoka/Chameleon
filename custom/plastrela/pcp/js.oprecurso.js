$(function () {

    function customTable(table) {
        $('#' + table + '_wrapper').css('height', '350px');
    }

    if ($('input[name="etapa"]').val() == '70') {
        $('#col-insumo').removeClass('col-md-2').addClass('col-md-6');
        $('#col-producao').removeClass('col-md-4').addClass('col-md-6');
        $('#col-perda').addClass('hide');
        $('#col-parada').addClass('hide');
    }

    var aux = 0;

    $(document).on('app-datatable', function (e, table) {

        aux++;
        if (aux == 7) {
            for (var k in tables) {
                if (tables[k].rows().count() == 0) {
                    aux--;
                }
            }
            if (aux == 0) {
                application.functions.confirmMessage('Favor verificar se o recurso informado na OP está correto.', function () {
                });
            }
        }

        $('.dataTables_filter').remove();

        switch (table) {
            case 'tableviewapontamento_de_producao_-_insumo':// Insumo
                customTable(table);
                $('#' + table + '_events').find('button').remove();
                $('button#' + table + '_insert').unbind().click(function (e) {
                    application.jsfunction('plastrela.pcp.apinsumo.__adicionarModal', { etapa: $('input[name="etapa"]').val() }, function (response) {
                        application.handlers.responseSuccess(response);
                    });
                });

                break;
            case 'tableviewapontamento_de_producao_-_producao':// Produção
                customTable(table);
                $('#' + table + '_events').find('button').remove();
                $('#' + table + '_insert').unbind().click(function (e) {
                    application.jsfunction('plastrela.pcp.approducao.__adicionar', { idoprecurso: application.functions.getId() }, function (response) {
                        application.handlers.responseSuccess(response);
                    });
                });
                break;
            case 'tableviewapontamento_de_producao_-_perda':// Perda
                customTable(table);
                $('#' + table + '_events').find('button').remove();
                break;
            case 'tableviewapontamento_de_producao_-_parada':// Parada
                customTable(table);
                $('#' + table + '_events').find('button').remove();
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
                application.jsfunction('plastrela.pcp.ap.js_recipienteUltimoAp', {
                    idoprecurso: application.functions.getId()
                }, function (response) {
                    if (response.data.id) {
                        $modal.find('select[name="recipiente"]').val(response.data.id).trigger('change');
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
                        , recipiente1: $modal.find('input[name="recipiente1"]').is(':checked')
                        , recipiente2: $modal.find('input[name="recipiente2"]').is(':checked')
                        , recipiente3: $modal.find('input[name="recipiente3"]').is(':checked')
                        , recipiente4: $modal.find('input[name="recipiente4"]').is(':checked')
                        , recipiente5: $modal.find('input[name="recipiente5"]').is(':checked')
                        , recipiente6: $modal.find('input[name="recipiente6"]').is(':checked')
                        , recipiente7: $modal.find('input[name="recipiente7"]').is(':checked')
                        , recipiente8: $modal.find('input[name="recipiente8"]').is(':checked')
                        , recipiente9: $modal.find('input[name="recipiente9"]').is(':checked')
                        , recipiente10: $modal.find('input[name="recipiente10"]').is(':checked')
                        , perc1: $modal.find('input[name="perc1"]').val()
                        , perc2: $modal.find('input[name="perc2"]').val()
                        , perc3: $modal.find('input[name="perc3"]').val()
                        , perc4: $modal.find('input[name="perc4"]').val()
                        , perc5: $modal.find('input[name="perc5"]').val()
                        , perc6: $modal.find('input[name="perc6"]').val()
                        , perc7: $modal.find('input[name="perc7"]').val()
                        , perc8: $modal.find('input[name="perc8"]').val()
                        , perc9: $modal.find('input[name="perc9"]').val()
                        , perc10: $modal.find('input[name="perc10"]').val()
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

    $('#mistura').click(function () {
        $('#modalmistura').modal('show');
    });
    $('#modalmistura').on('shown.bs.modal', function () {
        Cookies.set('modalmistura', true);
    });
    $('#modalmistura').on('hidden.bs.modal', function () {
        Cookies.remove('modalmistura');
    });
    if (Cookies.get('modalmistura')) {
        $('#modalmistura').modal('show');
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

    $('#conjugada').click(function () {
        $('#modalconjugada').modal('show');
    });

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

    $('#resumo').click(function () {
        application.jsfunction('plastrela.pcp.oprecurso.js_resumoProducao', {
            idoprecurso: application.functions.getId()
        }, function (response) {
            application.handlers.responseSuccess(response);
        });
    });

    $('#listarInsumos').click(function () {
        application.jsfunction('plastrela.pcp.oprecurso.js_listarInsumos', {
            idoprecurso: application.functions.getId()
        }, function (response) {
            application.handlers.responseSuccess(response);
        });
    });

    if ($('input[name="etapa"]').val() == '20') {
        var $ul = $('#resumo').parent().parent();
        $ul.prepend('<li><a id="chamarColorista" href="javascript:void(0)"><i class="fa fa-paint-brush"></i> Chamar Colorista</a></li>');
        $('#chamarColorista').click(function () {
            application.jsfunction('plastrela.pcp.oprecurso.js_chamarColoristaModal', { idoprecurso: application.functions.getId() }, function (response) {
                application.handlers.responseSuccess(response);
            });
        });

        $('#col-setup-impressao').removeClass('hidden');
    }

});