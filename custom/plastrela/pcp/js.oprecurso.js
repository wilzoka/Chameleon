$(function () {

    if (application.isRegisterview) {

        function buscaCodigoBarra(codbar) {
            application.jsfunction('plastrela.pcp.apinsumo.__pegarVolume', {
                idoprecurso: application.functions.getId()
                , codigodebarra: codbar
            }, function (response) {
                application.handlers.responseSuccess(response);
                if (response.success) {
                    $('#apinsumoAdicionarModal input[name="idvolume"]').val(response.data.id);
                    $('#apinsumoAdicionarModal input[name="qtdreal"]').val(response.data.qtdreal);
                    $('#apinsumoAdicionarModal input[name="produto"]').val(response.data.produto);
                    if ($('#apinsumoAdicionarModal input[name="etapa"]').val() != '10') {
                        $('#apinsumoAdicionarModal input[name="qtd"]').val(response.data.qtdreal);
                    }
                    $('#apinsumoAdicionarModal select[name="idsubstituto"]').attr('data-where', '');
                    if (response.data.substituido <= 0) {
                        $('#apinsumoAdicionarModal select[name="idsubstituto"]').closest('div.hidden').removeClass('hidden');
                        $('#apinsumoAdicionarModal select[name="idsubstituto"]').attr('data-where', response.data.where);
                        $('#apinsumoAdicionarModal select[name="idsubstituto"]').focus();
                    } else {
                        $('#apinsumoAdicionarModal input[name="qtd"]').focus();
                    }
                } else {
                    $('#apinsumoAdicionarModal input[name="idvolume"]').val('');
                    $('#apinsumoAdicionarModal input[name="qtdreal"]').val('');
                    $('#apinsumoAdicionarModal input[name="produto"]').val('');
                    $('#apinsumoAdicionarModal input[name="qtd"]').val('');
                    $('#apinsumoAdicionarModal input[name="codigodebarra"]').focus().val('');
                }
            });
        }

        if ($('input[name="etapa"]').val() == '70') {
            $('#col-insumo').removeClass('col-md-3').addClass('col-md-7');
            $('#col-producao').removeClass('col-md-4 no-padding-right').addClass('col-md-5');
            $('#col-perda').addClass('hide');
            $('#col-parada').addClass('hide');
        }

        //Adicionar Insumo
        function addinsumo() {
            application.jsfunction('plastrela.pcp.apinsumo.__adicionarModal', { etapa: $('input[name="etapa"]').val() }, function (response) {
                application.handlers.responseSuccess(response);
                if ($('input[name="etapa"]').val() == 70) {
                    $.get('http://localhost:8082/read', function (data) {
                        buscaCodigoBarra('-10-' + data);
                    });
                }
            });
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
                    // application.functions.confirmMessage('Favor verificar se o recurso informado na OP está correto.', function () {
                    // });
                    // frnc();
                }
            }

            switch (table) {
                case 'tableviewapontamento_de_producao_-_insumo':// Insumo
                    tables[table].button($('.btn-success')).action(addinsumo);
                    break;
                case 'tableviewapontamento_de_producao_-_producao':// Produção
                    tables[table].button($('.btn-success')).action(function (e) {
                        application.jsfunction('plastrela.pcp.approducao.__adicionar', { idoprecurso: application.functions.getId() }, function (response) {
                            application.handlers.responseSuccess(response);
                        });
                    });
                    break;
            }

        });
        $(document).on('app-datatable-reload', function (e, table) {
            if (tabletocount.indexOf(table) >= 0) {
                totalperda();
                totalparada();
                totalinsumo();
                totalproducao();
                indicadores();
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
                            buscaCodigoBarra($(this).val())
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
                            , idsubstituto: $modal.find('select[name="idsubstituto"]').val()
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
                                if (['50', '500', '60', '70'].indexOf($('input[name="etapa"]').val()) >= 0) {
                                    setTimeout(function () {
                                        addinsumo();
                                    }, 1300);
                                }
                                totalinsumo();
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

        function totalperda() {
            application.jsfunction('plastrela.pcp.oprecurso.js_totalperda', {
                idoprecurso: application.functions.getId()
            }, function (response) {
                if (response.success) {
                    $('#totalpesoperda').text(response.peso);
                    $('#totalqtdperda').text(response.qtd);
                }
            });
        }
        totalperda();

        function totalparada() {
            application.jsfunction('plastrela.pcp.oprecurso.js_totalparada', {
                idoprecurso: application.functions.getId()
            }, function (response) {
                if (response.success) {
                    $('#totalduracaoparada').text(response.duracao);
                    $('#totalqtdparada').text(response.qtd);
                }
            });
        }
        totalparada();

        function totalinsumo() {
            application.jsfunction('plastrela.pcp.oprecurso.js_totalinsumo', {
                idoprecurso: application.functions.getId()
            }, function (response) {
                if (response.success) {
                    $('#totalvolumesinsumo').text(response.volumes);
                    $('#totalqtdinsumo').text(response.qtd);
                }
            });
        }
        totalinsumo();

        function totalproducao() {
            application.jsfunction('plastrela.pcp.oprecurso.js_totalproducao', {
                idoprecurso: application.functions.getId()
            }, function (response) {
                if (response.success) {
                    $('#totalvolumesproducao').text(response.volumes);
                    $('#totalqtdproducao').text(response.qtd);
                    $('#totalpesoproducao').text(response.peso);
                }
            });
        }
        totalproducao();

        function indicadores() {
            application.jsfunction('plastrela.pcp.oprecurso.js_indicadores', {
                idoprecurso: application.functions.getId()
            }, function (response) {
                if (response.success) {
                    $('#efetiva').text(response.efetiva);
                }
            });
        }
        indicadores();

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

        $('#marcarVolumes').click(function () {
            $('#modalmarcacaovolume').modal('show');
        });

        $('#conferencias').click(function () {
            $('#modalconferencia').modal('show');
        });

        function frnc() {
            var produto = $('input[name="produto"]').val().trim().split(' - ')[0].split('/');
            $.ajax({
                type: 'POST',
                url: 'http://172.10.30.18/Sistema/scripts/socket/scripts2socket.php',
                data: {
                    function: 'PLAIniflexSQL', param: JSON.stringify([
                        "select rnc_data, motivo_descricao, rnc_descricao, recurso_codigo, etapa_codigo"
                        + " from vw_rnc a where rnc_empresa_codigo = " + ($('.logo-mini').text() == 'MS' ? '2' : '1') + " and rnc_produto = " + produto[0] + " and rnc_versao = " + produto[1]
                        + " and etapa_codigo = " + $('input[name="etapa"]').val() + " and rownum <= 3 order by rnc_data desc"
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

            $ul.prepend('<li><a id="insumoAuxiliar" href="javascript:void(0)"><i class="fa fa-flask"></i> Insumos Auxiliares</a></li>');
            $('#insumoAuxiliar').click(function () {
                application.jsfunction('plastrela.pcp.oprecurso.js_insumoAuxiliarModal', { idoprecurso: application.functions.getId() }, function (response) {
                    application.handlers.responseSuccess(response);
                });
            });
        }

        if (localStorage.getItem('descriptionmenumini') == 'RS') {
            $('#ratearInsumos').parent().addClass('hidden');
        }

        if ($('select[name="idestado"]').text().trim() == 'Em Fila de Produção' && $('input[name="observacao"]').val() == '') {
            application.jsfunction('plastrela.pcp.oprecurso.js_buscaObservacao', {
                idoprecurso: application.functions.getId()
            }, function (response) {
                $('input[name="observacao"]').val(response.data);
            });
        }

        var $confatributo = $('select[name="confatributo"]');
        var atributotipo = '';
        $confatributo.on('select2:select', function (e) {
            application.jsfunction('plastrela.pcp.oprecurso.js_confatributo', {
                id: e.params.data.id
            }, function (response) {
                atributotipo = response.data.tipo;
                $('.confresult').addClass('hidden');
                switch (response.data.tipo) {
                    case 'Texto':
                        $('input[name="confresultexto"]').removeClass('hidden');
                        break;
                    case 'Valor':
                        $('input[name="confresulvalor"]').removeClass('hidden');
                        break;
                    case 'Combo':
                        $('select[name="confresulcombo"]').find('option').remove();
                        var options = response.data.combo.split(',');
                        for (var i = 0; i < options.length; i++) {
                            $('select[name="confresulcombo"]').append($('<option>', { text: options[i] }));
                        }
                        $('select[name="confresulcombo"]').removeClass('hidden');
                        break;
                }
            });
        });
        $confatributo.on('select2:unselecting', function (e) {
            $('.confresult').addClass('hidden');
        });
        $confatributo.attr('data-where', "idtprecurso = (select e.idtprecurso from pcp_oprecurso opr left join pcp_opetapa ope on (opr.idopetapa = ope.id) left join pcp_etapa e on (ope.idetapa = e.id) where opr.id = " + application.functions.getId() + ")");
        $('#adicionarAtributo').click(function () {
            application.jsfunction('plastrela.pcp.oprecurso.js_adicionarAtributo', {
                idoprecurso: application.functions.getId()
                , confuser: $('input[name="confuser"]').val()
                , confpass: $('input[name="confpass"]').val()
                , confatributo: $('select[name="confatributo"]').val()
                , confresul: atributotipo == 'Texto' ? $('input[name="confresultexto"]').val() :
                    atributotipo == 'Valor' ? $('input[name="confresulvalor"]').val() :
                        atributotipo == 'Combo' ? $('select[name="confresulcombo"]').val()
                            : ''
                , confobs: $('input[name="confobs"]').val()
            }, function (response) {
                application.handlers.responseSuccess(response);
                if (response.success) {
                    $confatributo.val(null).trigger('change');
                    $('.confresult').addClass('hidden');
                    $('input[name="confresultexto"]').val('');
                    $('input[name="confresulvalor"]').val('');
                    $('input[name="confobs"]').val('');
                }
            });
        });
        $('#modalconferencia').on('show.bs.modal', function () {
            $confatributo.val(null).trigger('change');
            $('input[name="confuser"]').val('');
            $('input[name="confpass"]').val('');
            $('.confresult').addClass('hidden');
        });

    }

});