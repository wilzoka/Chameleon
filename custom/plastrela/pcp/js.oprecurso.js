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
    var tabletocount = [
        'tableviewapontamento_de_producao_-_insumo'
        , 'tableviewapontamento_de_producao_-_producao'
        , 'tableviewapontamento_de_producao_-_perda'
        , 'tableviewapontamento_de_producao_-_parada'
    ]
    $(document).on('app-datatable', function (e, table) {

        if (tabletocount.indexOf(table) >= 0) {
            aux++;
        }
        if (aux == 4) {
            for (var i = 0; i < tabletocount.length; i++) {
                if (tables[tabletocount[i]].rows().count() == 0) {
                    aux--;
                }
            }
            if (aux == 0) {
                application.functions.confirmMessage('Favor verificar se o recurso informado na OP está correto.', function () {
                });
                frnc();
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
                                if ($('input[name="etapa"]').val() != '10') {
                                    $modal.find('input[name="qtd"]').val(response.data.qtdreal);
                                }
                                $modal.find('input[name="qtd"]').focus();
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

        $('#aplicarRateio').click(function () {
            application.functions.confirmMessage('Confirma o rateio OP?', function () {
                application.jsfunction('plastrela.pcp.oprecurso.js_aplicarRateio', {
                    idoprecurso: application.functions.getId()
                }, function (response) {
                    application.handlers.responseSuccess(response);
                    if (response.success) {
                        $('#modalevt').modal('hide');
                    }
                });
            });
        });

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

    $('#ratearInsumos').click(function () {
        application.jsfunction('plastrela.pcp.oprecurso.js_ratearInsumos', {
            idoprecurso: application.functions.getId()
        }, function (response) {
            application.handlers.responseSuccess(response);
        });
    });

    function frnc() {
        var produto = $('input[name="produto"]').val().trim().split(' - ')[0].split('/');
        var item = produto[0];
        var versao = produto[1];
        $.ajax({
            type: 'POST',
            url: 'http://172.10.30.18/Sistema/scripts/socket/scripts2socket.php',
            data: {
                function: 'PLAIniflexSQL', param: JSON.stringify([
                    "select rnc_data, motivo_descricao, rnc_descricao, recurso_codigo, etapa_codigo"
                    + " from vw_rnc a where rnc_empresa_codigo = " + ($('.logo-mini').text() == 'MS' ? '2' : '1') + " and rnc_produto = " + produto[0] + " and rnc_versao = " + produto[1]
                    + " and etapa_codigo = " + $('input[name="etapa"]').val() + " order by rnc_data desc"
                ])
            },
            success: function (response) {
                var j = JSON.parse(response);
                var html = '<div class="col-md-12"> <table border="1" cellpadding="1" cellspacing="0" style="border-collapse:collapse;width:100%">';
                html += '<tr>';
                html += '<td style="text-align:center;"><strong>Data</strong></td>';
                html += '<td style="text-align:center;"><strong>Motivo</strong></td>';
                html += '<td style="text-align:center;"><strong>Descrição</strong></td>';
                html += '<td style="text-align:center;"><strong>Recurso</strong></td>';
                html += '</tr>';
                for (var i = 0; i < j.count; i++) {
                    html += '<tr>';
                    html += '<td>' + j.data.RNC_DATA[i] + '</td>';
                    html += '<td>' + j.data.MOTIVO_DESCRICAO[i] + '</td>';
                    html += '<td>' + j.data.RNC_DESCRICAO[i] + '</td>';
                    html += '<td>' + j.data.RECURSO_CODIGO[i] + '</td>';
                    html += '</tr>';
                }
                html += '</div></table>';
                $('body').append(application.modal.create({
                    id: 'modalrnc'
                    , title: 'RNCs'
                    , body: html
                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Ok</button>'
                }));
                $('#modalrnc').modal('show');
            }
        });
    }
    $('#verificarRncs').click(function () {
        frnc();
    });

    var $ul = $('#resumo').parent().parent();
    if ($('input[name="etapa"]').val() == '20') {
        $ul.prepend('<li><a id="chamarColorista" href="javascript:void(0)"><i class="fa fa-paint-brush"></i> Chamar Colorista</a></li>');
        $('#chamarColorista').click(function () {
            application.jsfunction('plastrela.pcp.oprecurso.js_chamarColoristaModal', { idoprecurso: application.functions.getId() }, function (response) {
                application.handlers.responseSuccess(response);
            });
        });
        $('#col-setup-impressao').removeClass('hidden');
    }
    if (['20', '30', '35'].indexOf($('input[name="etapa"]').val()) >= 0) {
        $ul.prepend('<li><a id="chamarCQ" href="javascript:void(0)"><i class="fa fa-certificate"></i> Chamar CQ</a></li>');
        $('#chamarCQ').click(function () {
            application.jsfunction('plastrela.pcp.oprecurso.js_chamarCQModal', { idoprecurso: application.functions.getId() }, function (response) {
                application.handlers.responseSuccess(response);
            });
        });
    }


    if (localStorage.getItem('descriptionmenumini') == 'RS') {
        $('#ratearInsumos').parent().addClass('hidden');
    }

    if ($('select[name="idestado"]').text().trim() == 'Em Fila de Produção') {
        application.jsfunction('plastrela.pcp.oprecurso.js_buscaObservacao', {
            idoprecurso: application.functions.getId()
        }, function (response) {
            $('input[name="observacao"]').val(response.data);
        });
    }

});